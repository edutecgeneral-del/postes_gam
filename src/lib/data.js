/**
 * src/lib/data.js — Capa de datos sobre Supabase.
 *
 * Expone operaciones específicas del dominio en vez de un wrapper KV genérico.
 * Fuente de verdad: tablas normalizadas (posts, post_stages, incidents,
 * unidades_territoriales).
 *
 * Ventaja: cada edición toca UNA fila (no re-escribe 2MB), soporta búsqueda
 * por cualquier campo, listo para RLS cuando implementemos auth.
 */

import { getSupabase, hasSupabase } from './supabase.js';
import { reportError, setCurrentAction } from './errorTracker.js';
import { beginUpload, endUpload } from './pwa.js';

export const STAGE_IDS = ['marca', 'dado', 'parado', 'camaras', 'internet', 'conexion_poste', 'centro'];

// IDs de checks de mantenimiento (M1/M2/M3) que SÍ deben guardarse tal cual
// en scouting_stage_checks (no colapsar a 'marca').
const SCOUT_EXTRA_CHECK_IDS = new Set([
  'sil_corona_1', 'sil_corona_2', 'sil_brazo_izq', 'sil_brazo_der', 'sil_acrilico',
  'e4_ucg', 'e4_switch', 'e4_antena', 'e4_conexiones',
  'e6_inyector', 'e6_alinear',
  'm3_conexion_centro',
]);
export const SIN_CATEGORIZAR_UT = 'SIN-CAT';
export const PHOTOS_BUCKET = 'stage-photos';
export const STAGE_PHOTOS_ATTR_KEY = '__photo_urls';
const PHOTO_UPLOAD_TIMEOUT_MS = 180000;
const PHOTO_MAX_DIMENSION = 1920;
const PHOTO_JPEG_QUALITY = 0.75;
const SCOUTING_RESULT_MAP = {
  corregido: 'ok',
  sigue_pendiente: 'observacion',
};

/**
 * Envuelve una promesa con timeout y reporta cualquier error a telemetría.
 * - 15s para RPCs (escrituras transaccionales).
 * - 180s para uploads de fotos.
 * Si el timeout dispara, lanza un Error con un mensaje claro para el técnico.
 * Cualquier rechazo (timeout, red, error de Supabase) queda reportado a
 * `app_error_logs` antes de re-lanzarse.
 */
async function withTimeout(promise, ms, label, options = {}) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(
            `Tiempo de espera agotado en ${label} (${ms / 1000}s). ` +
            `Revisa tu conexión e intenta de nuevo. Tus datos NO se enviaron.`
          ));
        }, ms);
      }),
    ]);
  } catch (err) {
    try { options.onError?.(err); } catch {}
    try { reportError(err, `data.js:${label}`, { timeout_ms: ms }); } catch {}
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extensionForUpload(file) {
  if (file?.type === 'image/jpeg') return 'jpg';
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return ext && ext !== file?.name ? ext : 'jpg';
}

function compressedFileName(file) {
  const baseName = (file?.name || 'photo').replace(/\.[^.]*$/, '') || 'photo';
  return `${baseName}.jpg`;
}

function uploadSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePhotoUrls(value) {
  const candidates = Array.isArray(value) ? value : [value];
  return [...new Set(candidates.filter(url => typeof url === 'string' && url.startsWith('http')))];
}

export function withStagePhotoUrls(attrs, photoUrls) {
  const next = { ...(attrs || {}) };
  const urls = normalizePhotoUrls(photoUrls);
  if (urls.length > 0) next[STAGE_PHOTOS_ATTR_KEY] = urls;
  else delete next[STAGE_PHOTOS_ATTR_KEY];
  return next;
}

function stagePhotoUrlsFromRow(row) {
  const attrUrls = normalizePhotoUrls(row.attrs?.[STAGE_PHOTOS_ATTR_KEY]);
  return normalizePhotoUrls([...attrUrls, row.photo_url]);
}

function drawImageToCanvas(bitmap, width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: PHOTO_JPEG_QUALITY });
  }

  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY);
  });
}

// Envuelve un blob ya comprimido en el File final, o conserva el original.
// HEIC/HEIF siempre se reencoda a JPEG (compatibilidad de visualizacion);
// JPEG/PNG/WebP solo se reemplazan si el reencode pesa menos.
function finalizeCompressed(blob, file) {
  if (!blob) return file;
  const srcType = (file.type || '').toLowerCase();
  const srcIsWebSafe = srcType === 'image/jpeg' || srcType === 'image/png' || srcType === 'image/webp';
  if (srcIsWebSafe && file.size && blob.size >= file.size) return file;
  if (typeof File === 'function') {
    return new File([blob], compressedFileName(file), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  }
  return blob;
}

// Fallback de decodificacion via <img>: usa el decoder del navegador (en iOS
// Safari abre HEIC) y reencoda a JPEG por canvas. Lanza si no se puede decodificar.
async function compressViaImgElement(file) {
  if (typeof Image !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) {
    throw new Error('Image/URL no disponibles para fallback de decodificacion');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo decodificar la imagen (img onerror)'));
      });
    }
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error('Imagen con dimensiones invalidas');
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));
    return await drawImageToCanvas(img, width, height);
  } finally {
    try { URL.revokeObjectURL(url); } catch {}
  }
}

async function compressPhotoForUpload(file, label) {
  if (!file?.type?.startsWith?.('image/')) return file;
  if (file.type === 'image/gif') return file;

  // 1) Camino rapido: createImageBitmap (truena con HEIC/HEIF de iPhone).
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const blob = await drawImageToCanvas(bitmap, width, height);
      return finalizeCompressed(blob, file);
    } catch {
      // Seguimos al fallback con <img>.
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }

  // 2) Fallback: decodificar con <img> (rescata HEIC en iOS Safari).
  try {
    const blob = await compressViaImgElement(file);
    return finalizeCompressed(blob, file);
  } catch (err) {
    // 3) Ningun decoder pudo: subimos el original sin comprimir (no perder la captura).
    try {
      reportError(err, `data.js:${label}:compressPhotoForUpload:undecodable`, {
        file_type: file.type || null,
        file_size: file.size || null,
        fallback: 'sin_comprimir',
      });
    } catch {}
    return file;
  }
}

function emptyStage() {
  return { done: false, ts: null, photo: null, photos: [], capturedBy: null, verified: false, verifiedBy: null, verifiedAt: null, notes: '', attrs: {} };
}

function requireSupabase() {
  if (!hasSupabase()) {
    throw new Error('data.js requiere Supabase. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
  }
  return getSupabase();
}

// =============================================================================
// LOAD — lee todo el dataset en paralelo y lo reconstruye al formato de la app
// =============================================================================
export async function loadObrasGam() {
  const sb = requireSupabase();
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('obras_gam')
      .select('id,lat,lng,name,clave,unidad_territorial,postes_por_instalar,postes_catalogo,empresa,numero_contrato,importe_contratado,tipo_obra,dt')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}export async function loadAllData() {
  const sb = requireSupabase();

  // Paginate any table fully. PostgREST max-rows is 1000 per request,
  // so we keep fetching until a page comes back incomplete (last page).
  // Each table paginates sequentially internally; the 4 tables run in parallel.
  async function fetchAll(table, orderBy = 'id', ascending = true) {
    const all = [];
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order(orderBy, { ascending })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  const [postsData, stagesData, incidentsData, utsData, postTagsData, tagsData] = await Promise.all([
    fetchAll('posts', 'id'),
    fetchAll('post_stages', 'post_id'),
    fetchAll('incidents_enriched', 'created_at', false),
    fetchAll('unidades_territoriales', 'id'),
    fetchAll('post_tags', 'post_id'),
    fetchAll('tags', 'id'),
  ]);

  // Indexar stages por post_id
  const stagesByPost = {};
  for (const row of stagesData) {
    const attrs = row.attrs || {};
    const photos = stagePhotoUrlsFromRow(row);
    if (!stagesByPost[row.post_id]) stagesByPost[row.post_id] = {};
    stagesByPost[row.post_id][row.stage_id] = {
      done: row.done,
      ts: row.ts ? new Date(row.ts).getTime() : null,
      photo: photos[0] || null,
      photos,
      capturedBy: row.captured_by,
      verified: row.verified || false,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at ? new Date(row.verified_at).getTime() : null,
      notes: row.notes || '',
      attrs,
      attrsUpdated: row.attrs_updated || {},
      needsScoutConfirm: row.needs_scout_confirm || false,
      scoutConfirmed: row.scout_confirmed || false,
      scoutConfirmedBy: row.scout_confirmed_by,
      scoutConfirmedAt: row.scout_confirmed_at,
      version: row.version || 1,
    };
  }

  // Indexar tags por post_id (mismo patrón que stagesByPost)
  const tagById = {};
  for (const t of tagsData) {
    tagById[t.id] = {
      id: t.id,
      label: t.label,
      color: t.color,
      categoriaId: t.categoria_id,
    };
  }
  const tagsByPost = {};
  for (const pt of postTagsData) {
    if (!tagsByPost[pt.post_id]) tagsByPost[pt.post_id] = [];
    const tag = tagById[pt.tag_id];
    if (tag) tagsByPost[pt.post_id].push(tag);
  }

  const posts = postsData.filter(p => !p.fusionado_en).map(p => {
    const stages = {};
    for (const sid of STAGE_IDS) {
      stages[sid] = stagesByPost[p.id]?.[sid] || emptyStage();
    }
    return {
      id: p.id,
      numPoste: p.num_poste || null,
      alias: p.alias || '',
      numPoste: p.num_poste || null,
      unidad_territorial: p.unidad_territorial,
      zona_territorial: p.zona_territorial,
      direccion: p.direccion,
      lat: Number(p.lat),
      lng: Number(p.lng),
      reubicado: p.reubicado || false,
      latOriginal: p.lat_original ? Number(p.lat_original) : null,
      lngOriginal: p.lng_original ? Number(p.lng_original) : null,
      reubicadoAt: p.reubicado_at,
      reubicadoPor: p.reubicado_por,
      blocked: p.blocked,
      adminApproved: p.admin_approved || false,
      approvedBy: p.approved_by,
      approvedAt: p.approved_at ? new Date(p.approved_at).getTime() : null,
      lastUpdate: p.last_update ? new Date(p.last_update).getTime() : null,
      createdAt: p.created_at ? new Date(p.created_at).getTime() : null,
      antenaRecuperada: p.antena_recuperada === true,
      antenaRecuperadaAt: p.antena_recuperada_at,
      antenaRecuperadaPor: p.antena_recuperada_por,
      revisado: p.revisado === true,
      revisadoAt: p.revisado_at,
      revisadoPorUserId: p.revisado_por_user_id,
      verificado: p.verificado === true,
      verificadoAt: p.verificado_at,
      verificadoPorUserId: p.verificado_por_user_id,
      createdBy: p.created_by,
      origen: p.origen,
      estado_verificacion: p.estado_verificacion || 'no_definido',
      estado_verificacion_at: p.estado_verificacion_at,
      estado_verificacion_por_user_id: p.estado_verificacion_por_user_id,
      stages,
      tags: tagsByPost[p.id] || [],
    };
  });

  const incidents = incidentsData.map(i => ({
    id: i.id,
    postId: i.post_id,
    type: i.type,
    description: i.description,
    severity: i.severity,
    status: i.status,
    capturedBy: i.captured_by,
    stageId: i.stage_id,
    sourceNote: i.source_note,
    userNote: i.user_note || '',
    reportedByName: i.reported_by_name || '',
    attendedBy: i.attended_by || null,
    attendedByName: i.attended_by_name || '',
    attendedAt: i.attended_at ? new Date(i.attended_at).getTime() : null,
    attendedNote: i.attended_note || '',
    attendedPhotoUrl: i.attended_photo_url || null,
    reportPhotoUrls: i.report_photo_urls || [],
    resolvedBy: i.resolved_by || null,
    resolvedByName: i.resolved_by_name || '',
    categoryId: i.category_id || null,
    categoryName: i.category_name || null,
    categoryColor: i.category_color || null,
    createdAt: i.created_at ? new Date(i.created_at).getTime() : null,
    resolvedAt: i.resolved_at ? new Date(i.resolved_at).getTime() : null,
  }));

  const unidadesTerritoriales = utsData.map(u => ({
    id: u.id,
    volumenContratado: u.volumen_contratado,
    liberados: u.liberados,
    porLiberarPorUt: u.por_liberar_por_ut,
    nombre: u.nombre,
    zona: u.zona,
    responsable: u.responsable,
    notes: u.notes,
  }));

  return { posts, incidents, unidadesTerritoriales };
}

// =============================================================================
// ATOMIC OPERATIONS — safe for concurrency
// =============================================================================

/** Create post + 7 stages in one transaction. Returns post in app format. */
export async function createPostAtomic({ direccion, lat, lng, unidad_territorial, zona_territorial, alias, numPoste, initialStageId, initialAttrs, initialNotes, initialPhotoUrl }) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(sb.rpc('create_post_atomic', {
    p_direccion: direccion || '',
    p_alias: alias || '',
    p_num_poste: numPoste || null,
    p_lat: lat || 0,
    p_lng: lng || 0,
    p_unidad_territorial: unidad_territorial || SIN_CATEGORIZAR_UT,
    p_zona_territorial: zona_territorial || 'Sin categorizar',
    p_initial_stage_id: initialStageId || null,
    p_initial_attrs: initialAttrs || {},
    p_initial_notes: initialNotes || '',
    p_initial_photo_url: initialPhotoUrl || null,
  }), 15000, 'createPostAtomic');
  if (error) throw error;

  // Build app-format post
  const stages = {};
  for (const sid of STAGE_IDS) {
    if (sid === initialStageId) {
      const initialPhotos = normalizePhotoUrls(initialPhotoUrl);
      stages[sid] = { done: true, ts: Date.now(), photo: initialPhotos[0] || null, photos: initialPhotos, capturedBy: null, verified: false, verifiedBy: null, verifiedAt: null, notes: initialNotes || '', attrs: withStagePhotoUrls(initialAttrs || {}, initialPhotos), version: 1 };
    } else {
      stages[sid] = { ...emptyStage(), version: 1 };
    }
  }
  return {
    id: data.id,
    numPoste: numPoste || null,
    alias: alias || '',
    unidad_territorial: unidad_territorial || SIN_CATEGORIZAR_UT,
    zona_territorial: zona_territorial || 'Sin categorizar',
    direccion: direccion || '',
    lat: lat || 0, lng: lng || 0,
    blocked: false, lastUpdate: Date.now(),
    stages,
  };
}

/** Update ONE stage with optimistic locking. Returns new version. */
export async function updateStageAtomic(postId, stageId, { done, notes, attrs, photoUrl, needsScoutConfirm, expectedVersion }) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(sb.rpc('update_stage', {
    p_post_id: postId,
    p_stage_id: stageId,
    p_done: done ?? null,
    p_notes: notes ?? null,
    p_attrs: attrs ?? null,
    p_photo_url: photoUrl ?? null,
    p_needs_scout_confirm: needsScoutConfirm ?? null,
    p_expected_version: expectedVersion ?? null,
  }), 15000, 'updateStageAtomic');
  if (error) {
    if (error.message?.includes('CONFLICT')) {
      throw new Error('CONFLICT: Otro usuario modificó esta etapa. Recarga los datos.');
    }
    throw error;
  }
  return data;
}

/** Update post metadata (alias, direccion, UT, etc.) without touching stages */
export async function updatePostMetadata(postId, fields) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(sb.rpc('update_post_metadata', {
    p_post_id: postId,
    p_direccion: fields.direccion ?? null,
    p_alias: fields.alias ?? null,
    p_num_poste: fields.numPoste ?? null,
    p_unidad_territorial: fields.unidad_territorial ?? null,
    p_zona_territorial: fields.zona_territorial ?? null,
    p_lat: fields.lat ?? null,
    p_lng: fields.lng ?? null,
    p_blocked: fields.blocked ?? null,
  }), 15000, 'updatePostMetadata');
  if (error) throw error;
  return data;
}

/** Create incident with sequence ID + optionally block post */
export async function createIncidentAtomic({ postId, type, description, severity, stageId, sourceNote, blockPost, userNote, reportedByName }) {
  const sb = requireSupabase();
  setCurrentAction('createIncidentAtomic:start');
  try {
    const { data, error } = await withTimeout(sb.rpc('create_incident_atomic', {
      p_post_id: postId,
      p_type: type,
      p_description: description || '',
      p_severity: severity || 'media',
      p_stage_id: stageId || null,
      p_source_note: sourceNote || null,
      p_block_post: blockPost || false,
      p_user_note: userNote || description || null,
      p_reported_by_name: reportedByName || null,
    }), 15000, 'createIncidentAtomic', { onError: () => setCurrentAction('createIncidentAtomic:fail') });
    if (error) {
      setCurrentAction('createIncidentAtomic:fail');
      throw error;
    }
    setCurrentAction('createIncidentAtomic:complete');
    return {
      id: data.id,
      postId: data.post_id,
      type: data.type,
      description: data.description,
      severity: data.severity,
      status: 'abierta',
      capturedBy: data.captured_by,
      stageId: data.stage_id,
      sourceNote: data.source_note || null,
      userNote: data.user_note || userNote || '',
      reportedByName: data.reported_by_name || reportedByName || '',
      createdAt: new Date(data.created_at).getTime(),
      resolvedAt: null,
    };
  } catch (err) {
    setCurrentAction('createIncidentAtomic:fail');
    throw err;
  }
}

/** Resolve incident + auto-unblock post if no more open incidents */
export async function resolveIncidentAtomic(incidentId) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(
    sb.rpc('resolve_incident_atomic', { p_incident_id: incidentId }),
    15000,
    'resolveIncidentAtomic'
  );
  if (error) throw error;
  return {
    incidentId: data.incident_id,
    postId: data.post_id,
    remainingOpen: data.remaining_open,
    autoUnblocked: data.auto_unblocked,
  };
}

// =============================================================================
// LEGACY — savePost (deprecated, kept for backward compat)
// WARNING: Writes ALL 7 stages — race condition with concurrent users
// =============================================================================
export async function savePost(post) {
  const sb = requireSupabase();

  // Obtener user_id actual para registrar quién capturó
  const { data: sess } = await sb.auth.getSession();
  const currentUserId = sess?.session?.user?.id || null;

  const { error: updErr } = await sb
    .from('posts')
    .update({
      unidad_territorial: post.unidad_territorial || SIN_CATEGORIZAR_UT,
      zona_territorial: post.zona_territorial || 'Sin categorizar',
      direccion: post.direccion || '',
      alias: post.alias || '',
      num_poste: post.numPoste || null,
      lat: post.lat,
      lng: post.lng,
      blocked: Boolean(post.blocked),
      reubicado: Boolean(post.reubicado),
      lat_original: post.latOriginal || null,
      lng_original: post.lngOriginal || null,
      reubicado_at: post.reubicadoAt || null,
      reubicado_por: post.reubicado ? (post.reubicadoPor || currentUserId) : null,
      last_update: new Date().toISOString(),
    })
    .eq('id', post.id);
  if (updErr) throw updErr;

  // Obtener attrs actuales de la BD para detectar cambios
  const { data: oldStages } = await sb
    .from('post_stages')
    .select('stage_id, attrs, attrs_updated')
    .eq('post_id', post.id);
  const oldByStage = {};
  if (oldStages) oldStages.forEach(r => { oldByStage[r.stage_id] = r; });

  const stageRows = STAGE_IDS.map(sid => {
    const s = post.stages?.[sid] || emptyStage();
    const capturedBy = s.capturedBy || (s.done ? currentUserId : null);
    const oldAttrs = oldByStage[sid]?.attrs || {};
    const oldTimestamps = oldByStage[sid]?.attrs_updated || s.attrsUpdated || {};
    const stagePhotos = normalizePhotoUrls([...(Array.isArray(s.photos) ? s.photos : []), s.photo]);
    const newAttrs = withStagePhotoUrls(s.attrs || {}, stagePhotos);
    const now = new Date().toISOString();

    // Calcular timestamps: actualizar solo los campos que cambiaron
    const attrsUpdated = { ...oldTimestamps };
    for (const key of Object.keys(newAttrs)) {
      if (JSON.stringify(newAttrs[key]) !== JSON.stringify(oldAttrs[key])) {
        attrsUpdated[key] = now;
      }
    }

    return {
      post_id: post.id,
      stage_id: sid,
      done: Boolean(s.done),
      ts: s.ts ? new Date(s.ts).toISOString() : null,
      photo_url: stagePhotos[0] || null,
      captured_by: capturedBy,
      verified: Boolean(s.verified),
      verified_by: s.verifiedBy || null,
      verified_at: s.verifiedAt ? new Date(s.verifiedAt).toISOString() : null,
      notes: s.notes || '',
      attrs: newAttrs,
      attrs_updated: attrsUpdated,
      needs_scout_confirm: Boolean(s.needsScoutConfirm),
      scout_confirmed: Boolean(s.scoutConfirmed),
      scout_confirmed_by: s.scoutConfirmedBy || null,
      scout_confirmed_at: s.scoutConfirmedAt ? new Date(s.scoutConfirmedAt).toISOString() : null,
    };
  });

  const { error: stgErr } = await sb
    .from('post_stages')
    .upsert(stageRows, { onConflict: 'post_id,stage_id' });
  if (stgErr) throw stgErr;
}

// =============================================================================
// CREATE POST — crea un poste nuevo con sus 7 etapas vacías
// =============================================================================

/** Delete an incident (admin only). Auto-unblocks post if no more open incidents. */
export async function deleteIncidentAtomic(incidentId) {
  const sb = requireSupabase();
  // Get the post_id before deleting
  const { data: inc, error: fetchErr } = await sb
    .from('incidents')
    .select('post_id, status')
    .eq('id', incidentId)
    .single();
  if (fetchErr) throw fetchErr;

  const postId = inc.post_id;
  const wasOpen = inc.status === 'abierta';

  // Delete the incident (cascade deletes classification)
  const { error: delErr } = await sb
    .from('incidents')
    .delete()
    .eq('id', incidentId);
  if (delErr) throw delErr;

  // If it was open, check if post should be unblocked
  let autoUnblocked = false;
  if (wasOpen && postId) {
    const { count } = await sb
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('status', 'abierta');
    if (count === 0) {
      await sb.from('posts').update({ blocked: false, last_update: new Date().toISOString() }).eq('id', postId);
      autoUnblocked = true;
    }
  }

  return { incidentId, postId, autoUnblocked };
}

/** Mark incident as attended (field roles). Needs admin/scout verification to resolve. */
export async function attendIncidentAtomic(incidentId, note, photoUrl) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(sb.rpc('attend_incident_atomic', {
    p_incident_id: incidentId,
    p_note: note || null,
    p_photo_url: photoUrl || null,
  }), 15000, 'attendIncidentAtomic');
  if (error) throw error;
  return {
    incidentId: data.incident_id,
    postId: data.post_id,
    status: 'atendida',
    attendedBy: data.attended_by,
    attendedByName: data.attended_by_name,
    attendedAt: new Date(data.attended_at).getTime(),
  };
}


/** Upload a photo for incident attendance evidence */
export async function uploadIncidentPhoto(incidentId, file) {
  const sb = requireSupabase();
  setCurrentAction('uploadIncidentPhoto:start');
  beginUpload();
  try {
    const uploadFile = await compressPhotoForUpload(file, 'uploadIncidentPhoto');
    const ext = extensionForUpload(uploadFile);
    const filePath = `incidents/${incidentId}-${uploadSuffix()}.${ext}`;
    const { error } = await withTimeout(
      sb.storage.from(PHOTOS_BUCKET).upload(filePath, uploadFile, { cacheControl: '3600', upsert: false }),
      PHOTO_UPLOAD_TIMEOUT_MS,
      'uploadIncidentPhoto',
      { onError: () => setCurrentAction('uploadIncidentPhoto:fail') }
    );
    if (error) {
      setCurrentAction('uploadIncidentPhoto:fail');
      throw error;
    }
    const { data } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
    setCurrentAction('uploadIncidentPhoto:complete');
    return data.publicUrl;
  } catch (err) {
    setCurrentAction('uploadIncidentPhoto:fail');
    throw err;
  } finally {
    endUpload();
  }
}

/** Guarda el arreglo de URLs de fotos de reporte (al levantar) de una incidencia. */
export async function setIncidentReportPhotos(incidentId, urls) {
  const sb = requireSupabase();
  const { error } = await withTimeout(
    sb.rpc('set_incident_report_photos', { p_incident_id: incidentId, p_urls: urls || [] }),
    15000, 'setIncidentReportPhotos'
  );
  if (error) throw error;
}


/** Revert incident from 'atendida' back to 'abierta' (admin/scout only) */
export async function revertIncidentToOpen(incidentId) {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('revert_incident_to_open', { p_incident_id: incidentId });
  if (error) throw error;
  return data;
}



/**
 * Genera el siguiente ID de poste (P-0001, P-0002, ...).
 * Lee el último ID de la DB y suma 1.
 */
export async function nextPostId() {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('posts')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return 'P-0001';
  const lastNum = parseInt(data[0].id.replace('P-', ''), 10);
  return 'P-' + String(lastNum + 1).padStart(4, '0');
}

/**
 * Crea un poste nuevo con sus 7 etapas vacías.
 * @param {object} params
 * @param {string} params.direccion
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {string} [params.unidad_territorial]  default SIN-CAT
 * @param {string} [params.zona_territorial]    default 'Sin categorizar'
 * @returns {object} el poste creado en formato de la app
 */
export async function createPost({ direccion, lat, lng, unidad_territorial, zona_territorial, alias, numPoste, shiftFrom }) {
  const sb = requireSupabase();
  const id = await nextPostId();

  // Si se pide insertar con recorrido, primero recorrer
  if (shiftFrom && numPoste) {
    const { error: shiftErr } = await sb.rpc('shift_post_numbers', { from_number: shiftFrom });
    if (shiftErr) throw shiftErr;
  }

  const postRow = {
    id,
    direccion: direccion || '',
    alias: alias || '',
    num_poste: numPoste || null,
    lat,
    lng,
    unidad_territorial: unidad_territorial || SIN_CATEGORIZAR_UT,
    zona_territorial: zona_territorial || 'Sin categorizar',
    blocked: false,
  };

  const { error: postErr } = await sb.from('posts').insert(postRow);
  if (postErr) throw postErr;

  // Crear las 7 etapas vacías
  const stageRows = STAGE_IDS.map(sid => ({
    post_id: id,
    stage_id: sid,
    done: false,
    attrs: {},
    notes: '',
  }));
  const { error: stgErr } = await sb.from('post_stages').insert(stageRows);
  if (stgErr) throw stgErr;

  // Devolver en el formato que usa la app
  const stages = {};
  for (const sid of STAGE_IDS) stages[sid] = emptyStage();

  return {
    id,
    numPoste: numPoste || null,
    alias: postRow.alias,
    unidad_territorial: postRow.unidad_territorial,
    zona_territorial: postRow.zona_territorial,
    direccion: postRow.direccion,
    lat,
    lng,
    blocked: false,
    lastUpdate: Date.now(),
    stages,
  };
}

// =============================================================================
// CREATE INCIDENT
// =============================================================================
export async function createIncidentInDB(data) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const currentUserId = sess?.session?.user?.id || null;

  const id = 'INC-' + Date.now();
  const row = {
    id,
    post_id: data.postId,
    type: data.type,
    description: data.description,
    severity: data.severity || 'media',
    status: 'abierta',
    captured_by: currentUserId,
    stage_id: data.stageId || null,
    source_note: data.sourceNote || null,
  };
  const { error } = await sb.from('incidents').insert(row);
  if (error) throw error;

  return {
    id,
    postId: data.postId,
    type: data.type,
    description: data.description,
    severity: data.severity || 'media',
    status: 'abierta',
    capturedBy: currentUserId,
    stageId: data.stageId || null,
    sourceNote: data.sourceNote || null,
    createdAt: Date.now(),
    resolvedAt: null,
  };
}

// =============================================================================
// RESOLVE INCIDENT
// =============================================================================
export async function resolveIncidentInDB(id) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('incidents')
    .update({ status: 'resuelta', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return { id, resolvedAt: Date.now() };
}

// =============================================================================
// VERIFY / UNVERIFY STAGE — solo admin puede verificar
// =============================================================================
export async function verifyStage(postId, stageId) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const userId = sess?.session?.user?.id || null;

  const { error } = await sb
    .from('post_stages')
    .update({ verified: true, verified_by: userId, verified_at: new Date().toISOString() })
    .eq('post_id', postId)
    .eq('stage_id', stageId);
  if (error) throw error;
  return { verified: true, verifiedBy: userId, verifiedAt: Date.now() };
}

export async function unverifyStage(postId, stageId) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('post_stages')
    .update({ verified: false, verified_by: null, verified_at: null })
    .eq('post_id', postId)
    .eq('stage_id', stageId);
  if (error) throw error;
  return { verified: false, verifiedBy: null, verifiedAt: null };
}

// =============================================================================
// LOAD USER NAMES — resuelve user_ids a nombres para display
// =============================================================================
export async function loadUserNames(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const sb = requireSupabase();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await sb.rpc('get_user_names', { user_ids: uniqueIds });
  if (error) throw error;

  const map = {};
  for (const row of (data || [])) {
    map[row.user_id] = row.display_name || row.email?.split('@')[0] || 'Usuario';
  }
  return map;
}

// =============================================================================
// RESET DATA — borra todas las incidencias, etapas y postes. NO repuebla.
// Usado por el botón "Restablecer datos" del header (debugging).
// =============================================================================
// =============================================================================
// DELETE POST — borra un poste y todos sus datos asociados
// =============================================================================
export async function deletePost(postId) {
  const sb = requireSupabase();

  // 1. Borrar scouting_stage_checks de visitas a este poste
  const { data: visits } = await sb.from('scouting_visits').select('id').eq('post_id', postId);
  if (visits && visits.length > 0) {
    const visitIds = visits.map(v => v.id);
    await sb.from('scouting_stage_checks').delete().in('visit_id', visitIds);
  }

  // 2. Borrar scouting_visits
  await sb.from('scouting_visits').delete().eq('post_id', postId);

  // 3. Borrar scouting_route_posts
  await sb.from('scouting_route_posts').delete().eq('post_id', postId);

  // 4. Borrar incidencias
  await sb.from('incidents').delete().eq('post_id', postId);

  // 5. Borrar fotos del storage
  try {
    const { data: files } = await sb.storage.from(PHOTOS_BUCKET).list(postId);
    if (files && files.length > 0) {
      const paths = files.map(f => `${postId}/${f.name}`);
      await sb.storage.from(PHOTOS_BUCKET).remove(paths);
    }
  } catch (e) { console.warn('Could not delete photos for', postId, e); }

  // 6. Borrar etapas
  const { error: stgErr } = await sb.from('post_stages').delete().eq('post_id', postId);
  if (stgErr) throw stgErr;

  // 7. Borrar el poste
  const { error: postErr } = await sb.from('posts').delete().eq('id', postId);
  if (postErr) throw postErr;

  return { deleted: postId };
}

// =============================================================================
// POST HISTORY — historial de cambios de un poste desde audit_log
// =============================================================================
export async function getPostHistory(postId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('audit_log')
    .select('*')
    .or(`row_id.eq.${postId},row_id.like.${postId}:%`)
    .order('ts', { ascending: false })
    .limit(100);
  if (error) throw error;

  // Parsear cambios significativos
  return (data || []).map(entry => {
    const changes = [];
    const oldD = entry.old_data || {};
    const newD = entry.new_data || {};
    const skip = ['updated_at', 'last_update', 'crew_id', 'post_id', 'stage_id'];

    for (const key of new Set([...Object.keys(oldD), ...Object.keys(newD)])) {
      if (skip.includes(key)) continue;
      const ov = JSON.stringify(oldD[key]);
      const nv = JSON.stringify(newD[key]);
      if (ov !== nv) {
        changes.push({ field: key, from: oldD[key], to: newD[key] });
      }
    }

    // Extraer stage_id del row_id (ej: "P-0001:marca" → "marca")
    const stageId = entry.row_id?.includes(':') ? entry.row_id.split(':')[1] : null;

    return {
      id: entry.id,
      ts: entry.ts,
      action: entry.action,
      table: entry.table_name,
      stageId,
      userEmail: entry.user_email,
      changes,
    };
  }).filter(e => e.changes.length > 0 || e.action === 'INSERT' || e.action === 'DELETE');
}

export async function resetAllData() {
  const sb = requireSupabase();
  const { error: e1 } = await sb.from('incidents').delete().neq('id', '');
  if (e1) throw e1;
  const { error: e2 } = await sb.from('post_stages').delete().neq('post_id', '');
  if (e2) throw e2;
  const { error: e3 } = await sb.from('posts').delete().neq('id', '');
  if (e3) throw e3;
  return { cleared: true };
}

// =============================================================================
// PHOTOS — upload / delete en el bucket stage-photos
// =============================================================================

/**
 * Sube una foto para un poste+etapa y devuelve la URL pública.
 * @param {string} postId  ej. 'P-0123'
 * @param {string} stageId ej. 'marca'
 * @param {File|Blob} file archivo de imagen
 * @returns {Promise<string>} URL pública de la foto
 */
export async function uploadStagePhoto(postId, stageId, file) {
  const sb = requireSupabase();
  setCurrentAction('uploadStagePhoto:start');
  beginUpload();
  try {
    const uploadFile = await compressPhotoForUpload(file, 'uploadStagePhoto');
    const ext = extensionForUpload(uploadFile);
    const path = `${postId}/${stageId}-${uploadSuffix()}.${ext}`;

    const { error } = await withTimeout(
      sb.storage.from(PHOTOS_BUCKET).upload(path, uploadFile, { cacheControl: '3600', upsert: false }),
      PHOTO_UPLOAD_TIMEOUT_MS,
      'uploadStagePhoto',
      { onError: () => setCurrentAction('uploadStagePhoto:fail') }
    );
    if (error) {
      setCurrentAction('uploadStagePhoto:fail');
      throw error;
    }

    const { data } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    setCurrentAction('uploadStagePhoto:complete');
    return data.publicUrl;
  } catch (err) {
    setCurrentAction('uploadStagePhoto:fail');
    throw err;
  } finally {
    endUpload();
  }
}

/**
 * Borra una foto a partir de su URL pública (si vive en nuestro bucket).
 */
export async function deleteStagePhoto(publicUrl) {
  if (!publicUrl) return;
  const sb = requireSupabase();
  const marker = `/${PHOTOS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return; // no es una URL de nuestro bucket
  const path = publicUrl.slice(idx + marker.length);
  const { error } = await sb.storage.from(PHOTOS_BUCKET).remove([path]);
  if (error) throw error;
}

// =============================================================================
// BULK HELPERS — útiles cuando cargues datos reales después
// =============================================================================

/**
 * Bulk upsert de UTs desde un array de filas. Permite cargar el catálogo real
 * cuando lo tengas listo (ej. desde un CSV).
 * @param {Array<{id:string, nombre?:string, zona?:string, responsable?:string, notes?:string}>} rows
 */
export async function bulkUpsertUTs(rows) {
  const sb = requireSupabase();
  const { error } = await sb.from('unidades_territoriales').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return { upserted: rows.length };
}

/**
 * Bulk update de asignación de UT a postes. Útil para cuando tengas la
 * correspondencia poste→UT en un CSV.
 * @param {Array<{postId:string, unidadTerritorial:string, zonaTerritorial?:string}>} rows
 */
export async function bulkAssignUT(rows) {
  const sb = requireSupabase();
  // Supabase no tiene bulk update directo; iteramos. Para miles de filas
  // conviene usar una Edge Function o RPC. Para cientos va bien así.
  const results = [];
  for (const r of rows) {
    const updates = { unidad_territorial: r.unidadTerritorial };
    if (r.zonaTerritorial) updates.zona_territorial = r.zonaTerritorial;
    const { error } = await sb.from('posts').update(updates).eq('id', r.postId);
    if (error) results.push({ postId: r.postId, error: error.message });
  }
  return { updated: rows.length - results.length, errors: results };
}

// =============================================================================
// SCOUTING — rutas, visitas, checks
// =============================================================================

/** Cargar rutas de scouting (admin ve todas, scout ve las suyas) */
export async function loadScoutingRoutes() {
  const sb = requireSupabase();
  const { data, error } = await sb.from('scouting_routes')
    .select('*, scouting_route_posts(post_id), scouting_route_operators(user_id)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    ...r,
    route_type: r.route_type || 'avanzada_internet',
    total_posts: r.scouting_route_posts?.length || 0,
    post_ids: (r.scouting_route_posts || []).map(p => p.post_id),
    operator_ids: (r.scouting_route_operators || []).map(o => o.user_id),
  }));
}

/** Crear ruta de scouting (admin) */
export async function createScoutingRoute({ name, scoutId, operatorIds, postIds, notes, routeType }) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const adminId = sess?.session?.user?.id || null;
  const id = 'SR-' + Date.now();

  // N operadores (o el scout único por compatibilidad). El primero es el "principal".
  const ops = (Array.isArray(operatorIds) && operatorIds.length)
    ? [...new Set(operatorIds.filter(Boolean))]
    : (scoutId ? [scoutId] : []);
  const leadId = scoutId || ops[0] || null;

  const { error: routeErr } = await sb.from('scouting_routes').insert({
    id, name, scout_id: leadId, assigned_by: adminId, notes: notes || '',
    route_type: routeType || 'avanzada_internet',
  });
  if (routeErr) throw routeErr;

  if (ops.length > 0) {
    const opRows = ops.map((uid) => ({ route_id: id, user_id: uid, added_by: adminId }));
    const { error: opErr } = await sb.from('scouting_route_operators').insert(opRows);
    if (opErr) throw opErr;
  }

  if (postIds && postIds.length > 0) {
    const rows = postIds.map((pid, i) => ({ route_id: id, post_id: pid, order_num: i + 1 }));
    const { error: postsErr } = await sb.from('scouting_route_posts').insert(rows);
    if (postsErr) throw postsErr;
  }
  return { id, name, scoutId: leadId, operatorIds: ops, totalPosts: postIds?.length || 0, routeType };
}

/** Cargar postes de una ruta */
/** Añadir postes a una ruta existente (continúa el order_num, evita duplicados). Devuelve cuántos se insertaron. */
export async function addPostsToRoute(routeId, postIds) {
  const sb = requireSupabase();
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (!routeId || ids.length === 0) return 0;
  const { data: existing, error: exErr } = await sb.from('scouting_route_posts')
    .select('post_id, order_num').eq('route_id', routeId);
  if (exErr) throw exErr;
  const have = new Set((existing || []).map(r => r.post_id));
  const nuevos = ids.filter(pid => !have.has(pid));
  if (nuevos.length === 0) return 0;
  const startOrder = (existing || []).reduce((m, r) => Math.max(m, r.order_num || 0), 0) + 1;
  const rows = nuevos.map((pid, i) => ({ route_id: routeId, post_id: pid, order_num: startOrder + i }));
  const { error } = await sb.from('scouting_route_posts').insert(rows);
  if (error) throw error;
  return nuevos.length;
}

/** Quitar un poste de una ruta. */
export async function removePostFromRoute(routeId, postId) {
  const sb = requireSupabase();
  if (!routeId || !postId) return;
  const { error } = await sb.from('scouting_route_posts')
    .delete().eq('route_id', routeId).eq('post_id', postId);
  if (error) throw error;
}

/** Cargar postes de una ruta */
export async function loadRoutePostIds(routeId) {  const sb = requireSupabase();
  const { data, error } = await sb.from('scouting_route_posts').select('post_id, order_num')
    .eq('route_id', routeId).order('order_num');
  if (error) throw error;
  return (data || []).map(r => r.post_id);
}

/** post_ids con visita registrada en una ruta (puntos ya verificados en esa ruta) */
export async function loadRouteVisitedPostIds(routeId) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('scouting_visits').select('post_id').eq('route_id', routeId);
  if (error) throw error;
  return [...new Set((data || []).map(v => v.post_id))];
}

/** Iniciar ruta (scout) */
export async function startRoute(routeId) {
  const sb = requireSupabase();
  const { error } = await sb.from('scouting_routes')
    .update({ status: 'en_curso', started_at: new Date().toISOString() })
    .eq('id', routeId);
  if (error) throw error;
}

/** Completar ruta (scout) */
export async function completeRoute(routeId) {
  const sb = requireSupabase();
  const { error } = await sb.from('scouting_routes')
    .update({ status: 'completada', completed_at: new Date().toISOString() })
    .eq('id', routeId);
  if (error) throw error;
}

/** Editar campos de una ruta — p. ej. reasignar responsable (admin) */
export async function updateScoutingRoute(routeId, fields) {
  const sb = requireSupabase();
  const { error } = await sb.from('scouting_routes').update(fields).eq('id', routeId);
  if (error) throw error;
}

/** Crear visita de scouting */
export async function createScoutingVisit({ routeId, postId, gps, photo, generalResult, generalNotes, stageChecks }) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const scoutId = sess?.session?.user?.id || null;
  const id = 'SV-' + Date.now();

  const { error: visitErr } = await sb.from('scouting_visits').insert({
    id, route_id: routeId || null, post_id: postId, scout_id: scoutId,
    gps_lat: gps?.lat, gps_lng: gps?.lng, gps_accuracy: gps?.accuracy,
    photo_url: photo || null,
    general_result: generalResult || 'ok',
    general_notes: generalNotes || '',
  });
  if (visitErr) throw visitErr;

  if (stageChecks && stageChecks.length > 0) {
    const rows = stageChecks.map(sc => ({
      visit_id: id,
      stage_id: (STAGE_IDS.includes(sc.stageId) || SCOUT_EXTRA_CHECK_IDS.has(sc.stageId) || (typeof sc.stageId === 'string' && sc.stageId.startsWith('inc_'))) ? sc.stageId : 'marca',
      result: SCOUTING_RESULT_MAP[sc.result] || sc.result || 'ok',
      notes: sc.notes || '',
      photo_url: sc.photo || null,
      incident_id: sc.incidentId || null,
    }));
    const { error: checksErr } = await sb.from('scouting_stage_checks').insert(rows);
    if (checksErr) throw checksErr;
  }

  // Marcar el punto como verificado (estado verde en el modulo Scout).
  // No-fatal: si falla, la visita ya quedo guardada.
  try {
    const { error: vErr } = await sb.from('posts').update({
      verificado: true,
      verificado_at: new Date().toISOString(),
      verificado_por_user_id: scoutId,
    }).eq('id', postId);
    if (vErr) console.warn('No se pudo marcar verificado:', vErr.message);
  } catch (e) { console.warn('No se pudo marcar verificado:', e?.message || e); }

  return { id, postId, generalResult };
}

/** Eliminar ruta de scouting y sus postes/visitas asociados */
export async function deleteScoutingRoute(routeId) {
  const sb = requireSupabase();
  // Delete checks first
  const { data: visits } = await sb.from('scouting_visits').select('id').eq('route_id', routeId);
  if (visits?.length) {
    const visitIds = visits.map(v => v.id);
    await sb.from('scouting_stage_checks').delete().in('visit_id', visitIds);
  }
  await sb.from('scouting_visits').delete().eq('route_id', routeId);
  await sb.from('scouting_route_posts').delete().eq('route_id', routeId);
  const { error } = await sb.from('scouting_routes').delete().eq('id', routeId);
  if (error) throw error;
}

/** Quitar postes de una ruta */
export async function removePostsFromRoute(routeId, postIds) {
  const sb = requireSupabase();
  const { error } = await sb.from('scouting_route_posts').delete()
    .eq('route_id', routeId).in('post_id', postIds);
  if (error) throw error;
}

/** Cargar visitas de scouting de un poste */
export async function loadPostScoutingVisits(postId) {
  const sb = requireSupabase();
  const { data: visits, error: vErr } = await sb.from('scouting_visits')
    .select('*').eq('post_id', postId).order('visited_at', { ascending: false });
  if (vErr) throw vErr;

  // Cargar checks de cada visita
  const visitIds = (visits || []).map(v => v.id);
  let checks = [];
  if (visitIds.length > 0) {
    const { data: ch, error: chErr } = await sb.from('scouting_stage_checks')
      .select('*').in('visit_id', visitIds);
    if (!chErr) checks = ch || [];
  }

  return (visits || []).map(v => ({
    id: v.id,
    postId: v.post_id,
    scoutId: v.scout_id,
    routeId: v.route_id,
    gps: v.gps_lat ? { lat: v.gps_lat, lng: v.gps_lng, accuracy: v.gps_accuracy } : null,
    photo: v.photo_url,
    generalResult: v.general_result,
    generalNotes: v.general_notes,
    visitedAt: v.visited_at ? new Date(v.visited_at).getTime() : null,
    stageChecks: checks.filter(c => c.visit_id === v.id).map(c => ({
      stageId: c.stage_id, result: c.result, notes: c.notes, photo: c.photo_url,
    })),
  }));
}

/** Admin aprueba un poste */
export async function approvePost(postId) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const adminId = sess?.session?.user?.id || null;

  const { error } = await sb.from('posts').update({
    admin_approved: true, approved_by: adminId, approved_at: new Date().toISOString(),
  }).eq('id', postId);
  if (error) throw error;
  return { approved: true, approvedBy: adminId, approvedAt: Date.now() };
}

/** Admin quita aprobación */
export async function unapprovePost(postId) {
  const sb = requireSupabase();
  const { error } = await sb.from('posts').update({
    admin_approved: false, approved_by: null, approved_at: null,
  }).eq('id', postId);
  if (error) throw error;
}

// =============================================================================
// EDIT PROPOSALS — propuestas de edición (SU / PC)
// =============================================================================

export async function loadProposals(status = null) {
  const sb = requireSupabase();
  let q = sb.from('edit_proposals').select('*').order('proposed_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id,
    postId: p.post_id,
    proposedBy: p.proposed_by,
    proposedAt: p.proposed_at,
    proposalType: p.proposal_type,
    stageId: p.stage_id,
    changes: p.changes || {},
    reason: p.reason || '',
    status: p.status,
    reviewedBy: p.reviewed_by,
    reviewedAt: p.reviewed_at,
    reviewNotes: p.review_notes,
  }));
}

export async function createProposal({ postId, proposalType, stageId, changes, reason }) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const userId = sess?.session?.user?.id || null;
  const { error } = await sb.from('edit_proposals').insert({
    post_id: postId,
    proposed_by: userId,
    proposal_type: proposalType || 'edit',
    stage_id: stageId || null,
    changes: changes || {},
    reason: reason || '',
  });
  if (error) throw error;
}

export async function reviewProposal(proposalId, approved, reviewNotes) {
  const sb = requireSupabase();
  const { data: sess } = await sb.auth.getSession();
  const userId = sess?.session?.user?.id || null;
  const { error } = await sb.from('edit_proposals').update({
    status: approved ? 'aprobada' : 'rechazada',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: reviewNotes || '',
  }).eq('id', proposalId);
  if (error) throw error;
}

let _incidentCategoriesCache = null;
export async function fetchIncidentCategories() {
  if (_incidentCategoriesCache && _incidentCategoriesCache.length) return _incidentCategoriesCache;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('incident_categories')
    .select('id, name, color, bloquea')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  _incidentCategoriesCache = (data || []).map(c => ({
    id: c.id, name: c.name, color: c.color || null, bloquea: c.bloquea === true,
  }));
  return _incidentCategoriesCache;
}

export async function createIncidentsFromCatalog({ postId, categoryIds, severity, note, stageId, sourceNote, forceBlock }) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(sb.rpc('create_incidents_from_catalog', {
    p_post_id: postId,
    p_category_ids: categoryIds,
    p_severity: severity,
    p_note: note,
    p_stage_id: stageId || null,
    p_source_note: sourceNote || null,
    p_force_block: forceBlock || false,
  }), 15000, 'createIncidentsFromCatalog');
  if (error) throw error;
  return data;
}
export default {
  loadAllData,
  savePost,
  createPost,
  createPostAtomic,
  updateStageAtomic,
  updatePostMetadata,
  createIncidentAtomic,
  createIncidentsFromCatalog,
  fetchIncidentCategories,
  resolveIncidentAtomic,
  createIncidentInDB,
  resolveIncidentInDB,
  resetAllData,
  deletePost,
  deleteIncidentAtomic,
  attendIncidentAtomic,
  uploadIncidentPhoto,
  setIncidentReportPhotos,
  revertIncidentToOpen,
  getPostHistory,
  uploadStagePhoto,
  deleteStagePhoto,
  bulkUpsertUTs,
  bulkAssignUT,
  loadScoutingRoutes,
  createScoutingRoute,
  loadRoutePostIds,
  startRoute,
  completeRoute,
  createScoutingVisit,
  loadPostScoutingVisits,
  approvePost,
  unapprovePost,
  deleteScoutingRoute,
  removePostsFromRoute,
  loadProposals,
  createProposal,
  reviewProposal,
  verifyStage,
  unverifyStage,
  loadUserNames,
  STAGE_IDS,
  SIN_CATEGORIZAR_UT,
  PHOTOS_BUCKET,
};

export async function dbMergePosts(principalId, secundarioId, stageChoices, keepAddress) {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('merge_posts', {
    principal_id: principalId,
    secundario_id: secundarioId,
    stage_choices: stageChoices || {},
    keep_address: keepAddress || 'principal',
  });
  if (error) throw error;
  return data;
}


export async function listFusiones(postId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('post_fusiones_named')
    .select('*')
    .eq('principal_id', postId)
    .order('fusionado_at', { ascending: false });
  if (error) return { ok: false, data: [], error: error.message };
  return { ok: true, data: data || [], error: null };
}

/**
 * Actualiza el estado de antena_recuperada de un poste (admin only).
 * PR B: modulo "Poste de Internet - Recuperar antena".
 * Si recuperada=true, registra timestamp y user_id.
 * Si recuperada=false, limpia timestamp y user_id.
 */
export async function setPostAntenaRecuperada(postId, recuperada, byUserId) {
  const sb = requireSupabase();
  const update = recuperada ? {
    antena_recuperada: true,
    antena_recuperada_at: new Date().toISOString(),
    antena_recuperada_por: byUserId,
  } : {
    antena_recuperada: false,
    antena_recuperada_at: null,
    antena_recuperada_por: null,
  };
  const { error } = await sb.from('posts').update(update).eq('id', postId);
  if (error) throw error;
  return true;
}

// ============================================================================
// REVISADO (paso 10): marcar / desmarcar postes como revisados (solo admin)
// El trigger posts_revisado_admin_only enforza esto a nivel BD; el frontend
// tambien gate-ea el boton via canMarkRevisado(profile).
// ============================================================================

export async function markPostRevisado(postId, userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('posts')
    .update({
      revisado: true,
      revisado_at: new Date().toISOString(),
      revisado_por_user_id: userId,
    })
    .eq('id', postId)
    .select('id, revisado, revisado_at, revisado_por_user_id')
    .single();
  if (error) throw error;
  return data;
}

export async function unmarkPostRevisado(postId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('posts')
    .update({
      revisado: false,
      revisado_at: null,
      revisado_por_user_id: null,
    })
    .eq('id', postId)
    .select('id, revisado, revisado_at, revisado_por_user_id')
    .single();
  if (error) throw error;
  return data;
}
/**
 * Actualiza el estado de verificacion de un poste.
 * Llama al RPC set_post_estado_verificacion en Supabase.
 *
 * @param {string} postId
 * @param {'verificado'|'no_definido'|'no_existe'} estado
 * @returns {Promise<object>} El poste actualizado
 */
export async function updatePostEstadoVerificacion(postId, estado) {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('set_post_estado_verificacion', {
    p_post_id: postId,
    p_estado: estado,
  });
  if (error) throw error;
  return data;
}

// ============================================================================
// IP Assignment (E4 -> E6) — Fase 5
// ============================================================================

/**
 * Asignar IPs a equipos de un poste E4 (lo conecta a un modem y lo pasa a E6).
 *
 * @param {string} postId - ID del poste E4 que recibira las IPs
 * @param {string} modemPostId - ID del poste modem origen (E5)
 * @param {object} equipos - { antena_5ac: { ip, no_instalado, motivo }, ... }
 * @returns {Promise<object>} Resultado de la asignacion
 */
export async function assignIpsToPost(postId, modemPostId, equipos) {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('assign_ips_to_post', {
    p_post_id: postId,
    p_modem_post_id: modemPostId,
    p_equipos: equipos,
  });
  if (error) throw error;
  return data;
}

/**
 * Desasignar IPs de un poste E4 (lo desconecta del modem).
 *
 * @param {string} postId - ID del poste E4
 * @returns {Promise<object>} Resultado
 */
export async function unassignIpsFromPost(postId) {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('unassign_ips_from_post', {
    p_post_id: postId,
  });
  if (error) throw error;
  return data;
}

/**
 * Registrar un avance de etapa hecho con etapas fisicas (E1-E4) pendientes.
 * Deja huella en attrs de la etapa destino y audita en audit_log.
 *
 * @param {string} postId - ID del poste
 * @param {string[]} etapasPendientes - stage_ids pendientes (ej. ['parado'])
 * @param {string} etapaDestino - 'internet' (E5) | 'conexion_poste' (E6)
 * @param {string} contexto - 'captura_e5' | 'asignacion_ip'
 * @returns {Promise<object>} Resultado
 */
export async function registrarAvanceConPendientes(postId, etapasPendientes, etapaDestino, contexto) {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('registrar_avance_con_pendientes', {
    p_post_id: postId,
    p_etapas_pendientes: etapasPendientes,
    p_etapa_destino: etapaDestino,
    p_contexto: contexto,
  });
  if (error) throw error;
  return data;
}

/** Lee los equipos (IPs) actuales de un poste directo de la BD = fuente de verdad, evita estado viejo del navegador. */
export async function getEquiposForPost(postId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('post_stages')
    .select('attrs')
    .eq('post_id', postId)
    .eq('stage_id', 'conexion_poste')
    .single();
  if (error) throw error;
  return (data && data.attrs && data.attrs.equipos) || {};
}

/**
 * Marca o desmarca la verificacion en campo de un poste.
 * Llama al RPC set_post_verificado_campo en Supabase.
 *
 * @param {string} postId
 * @param {boolean} value - true = verificado en campo, false = desmarcar
 * @returns {Promise<object>} El poste actualizado
 */
export async function updatePostVerificadoCampo(postId, value) {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado');
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('set_post_verificado_campo', {
    p_post_id: postId,
    p_value: value,
  });
  if (error) throw error;
  return data;
}
// ---- DGSU: bitácora de capturas (reportes/demandas) por punto obras_gam ----
export async function loadCapturasObra(obraId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('obras_gam_capturas')
    .select('id,obra_id,tipo,detalle,notas,created_by,created_at')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function crearCapturaObra({ obraId, tipo, detalle, notas }) {
  const sb = requireSupabase();
  const row = { obra_id: obraId, tipo, notas: (notas ?? null) || null };
  if (tipo === 'reporte' || tipo === 'demanda') {
    row.detalle = detalle || null;
  }
  const { data, error } = await sb
    .from('obras_gam_capturas')
    .insert(row)
    .select('id,obra_id,tipo,detalle,notas,created_by,created_at')
    .single();
  if (error) throw error;
  return data;
}
// ---- DGSU: resumen de tipos de captura por obra (para filtros Reporte/Demanda) ----
export async function loadCapturasResumen() {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('obras_capturas_resumen');
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => { map[r.obra_id] = r.tipos || []; });
  return map; // { obraId: ['reporte','demanda'] }
}
/** Trae la nota de la UT + las notas de todos los puntos de esa UT (una sola llamada). */
export async function getTerritorioNotas(utId) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(
    sb.rpc('get_territorio_notas', { p_ut_id: utId }),
    15000, 'getTerritorioNotas'
  );
  if (error) throw error;
  return data || [];
}

/** Crea o actualiza una nota de territorio (tipo 'ut' o 'punto'). Solo admin (RLS). */
export async function upsertTerritorioNota({ tipo, texto, utId = null, postId = null, postUtId = null, userName = null }) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(
    sb.rpc('upsert_territorio_nota', {
      p_tipo: tipo,
      p_texto: texto || '',
      p_ut_id: utId,
      p_post_id: postId,
      p_post_ut_id: postUtId,
      p_user_name: userName
    }),
    15000, 'upsertTerritorioNota'
  );
  if (error) throw error;
  return data;
}

/** Trae todos los postes de una UT con sus datos para la ficha tecnica (una sola llamada). */
export async function getFichaUt(utId) {
  const sb = requireSupabase();
  const { data, error } = await withTimeout(
    sb.rpc('get_ficha_ut', { p_ut_id: utId }),
    20000, 'getFichaUt'
  );
  if (error) throw error;
  return data || [];
}
// ---- RAAL: incidencias filtradas a 2 categorías fijas (cascajo + instalación eléctrica) ----
const RAAL_CATEGORY_IDS = [
  '1324d434-6b2d-46ff-9281-a2e42022df84', // Cascajo presente
  '98a342cf-76fb-4c0b-93c0-69d463820a99', // Instalación eléctrica
];

export async function loadIncidentsRAAL() {
  const sb = requireSupabase();
  // 1) clasificaciones de esas 2 categorías (incident_id -> categoria)
  const { data: clasif, error: e1 } = await sb
    .from('incident_classifications')
    .select('incident_id, category_id, incident_categories(name, color)')
    .in('category_id', RAAL_CATEGORY_IDS);
  if (e1) throw e1;
  const porIncidente = {};
  (clasif || []).forEach(c => {
    porIncidente[c.incident_id] = {
      categoryId: c.category_id,
      categoryName: c.incident_categories?.name || null,
      categoryColor: c.incident_categories?.color || null,
    };
  });
  const ids = Object.keys(porIncidente);
  if (ids.length === 0) return [];

  // 2) traer esas incidencias (paginando por si son muchas)
  const all = [];
  const pageSize = 200;
  for (let i = 0; i < ids.length; i += pageSize) {
    const slice = ids.slice(i, i + pageSize);
    const { data, error } = await sb.from('incidents').select('*').in('id', slice);
    if (error) throw error;
    all.push(...(data || []));
  }

  // 3) mapear al mismo shape que usa IncidentsView, inyectando la categoría
  return all.map(i => {
    const cat = porIncidente[i.id] || {};
    return {
      id: i.id,
      postId: i.post_id,
      type: i.type,
      description: i.description,
      severity: i.severity,
      status: i.status,
      capturedBy: i.captured_by,
      stageId: i.stage_id,
      sourceNote: i.source_note,
      userNote: i.user_note || '',
      reportedByName: i.reported_by_name || '',
      attendedBy: i.attended_by || null,
      attendedByName: i.attended_by_name || '',
      attendedAt: i.attended_at ? new Date(i.attended_at).getTime() : null,
      attendedNote: i.attended_note || '',
      attendedPhotoUrl: i.attended_photo_url || null,
      reportPhotoUrls: i.report_photo_urls || [],
      resolvedBy: i.resolved_by || null,
      resolvedByName: i.resolved_by_name || '',
      categoryId: cat.categoryId || null,
      categoryName: cat.categoryName || null,
      categoryColor: cat.categoryColor || null,
      createdAt: i.created_at ? new Date(i.created_at).getTime() : null,
      resolvedAt: i.resolved_at ? new Date(i.resolved_at).getTime() : null,
    };
  });
}
// ---- DGSU: ficha técnica por UT (empresa, fotos, actas, denuncias, COPACO) ----
function slugUT(ut) {
  return ((ut || 'sin-ut')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()) || 'sin-ut';
}

export async function loadFichaUT(ut) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('obras_gam_ut_ficha')
    .select('*')
    .eq('ut', ut)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function guardarFichaUT(ut, campos) {
  const sb = requireSupabase();
  const row = { ut, updated_at: new Date().toISOString() };
  ['empresa','numero_contrato','copaco_nombre','copaco_cargo','copaco_telefono','copaco_correo'].forEach(k => {
    if (k in campos) row[k] = (campos[k] ?? '') || null;
  });
  const { data, error } = await sb
    .from('obras_gam_ut_ficha')
    .upsert(row, { onConflict: 'ut' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function subirFotoFichaUT(ut, tipo, file) {
  const sb = requireSupabase();
  const uploadFile = await compressPhotoForUpload(file, 'fichaUT');
  const ext = extensionForUpload(uploadFile);
  const path = `dgsu-ficha/${slugUT(ut)}/foto-${tipo}-${uploadSuffix()}.${ext}`;
  const { error } = await sb.storage.from(PHOTOS_BUCKET).upload(path, uploadFile, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  const col = tipo === 'antes' ? 'foto_antes_url' : tipo === 'durante' ? 'foto_durante_url' : 'foto_despues_url';
  const { error: e2 } = await sb.from('obras_gam_ut_ficha').upsert({ ut, [col]: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'ut' });
  if (e2) throw e2;
  return pub.publicUrl;
}

export async function subirDocumentoFichaUT(ut, tipo, file) {
  const sb = requireSupabase();
  const ext = extensionForUpload(file);
  const path = `dgsu-ficha/${slugUT(ut)}/acta-${tipo}-${uploadSuffix()}.${ext}`;
  const { error } = await sb.storage.from(PHOTOS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  const col = tipo === 'inicio' ? 'acta_inicio_url' : 'acta_termino_url';
  const { error: e2 } = await sb.from('obras_gam_ut_ficha').upsert({ ut, [col]: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'ut' });
  if (e2) throw e2;
  return pub.publicUrl;
}

export async function loadDenunciasUT(ut) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('obras_gam_ut_denuncias')
    .select('id, ut, url, nombre_archivo, created_by, created_at')
    .eq('ut', ut)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function agregarDenunciaUT(ut, file) {
  const sb = requireSupabase();
  const ext = extensionForUpload(file);
  const path = `dgsu-ficha/${slugUT(ut)}/denuncia-${uploadSuffix()}.${ext}`;
  const { error } = await sb.storage.from(PHOTOS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  const { data, error: e2 } = await sb
    .from('obras_gam_ut_denuncias')
    .insert({ ut, url: pub.publicUrl, nombre_archivo: file?.name || null })
    .select('id, ut, url, nombre_archivo, created_by, created_at')
    .single();
  if (e2) throw e2;
  return data;
}

export async function eliminarDenunciaUT(id) {
  const sb = requireSupabase();
  const { error } = await sb.from('obras_gam_ut_denuncias').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ---- DGSU: resumen de reportes/demandas por UT para la ficha técnica ----
export async function loadFichaReportesDemandas(ut) {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('ficha_ut_reportes_demandas', { p_ut: ut });
  if (error) throw error;
  return data || { reportes: 0, demandas: 0, lista_demandas: [] };
}
// ---- DGSU: fotos por punto (antes/durante/después por obra) ----
export async function loadFotosPunto(obraId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('obras_gam_punto_fotos')
    .select('obra_id, foto_antes_url, foto_durante_url, foto_despues_url')
    .eq('obra_id', obraId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function subirFotoPunto(obraId, tipo, file) {
  const sb = requireSupabase();
  const uploadFile = await compressPhotoForUpload(file, 'fotoPunto');
  const ext = extensionForUpload(uploadFile);
  const path = `dgsu-punto/${obraId}/foto-${tipo}-${uploadSuffix()}.${ext}`;
  const { error } = await sb.storage.from(PHOTOS_BUCKET).upload(path, uploadFile, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  const col = tipo === 'antes' ? 'foto_antes_url' : tipo === 'durante' ? 'foto_durante_url' : 'foto_despues_url';
  const { error: e2 } = await sb.from('obras_gam_punto_fotos').upsert({ obra_id: obraId, [col]: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'obra_id' });
  if (e2) throw e2;
  return pub.publicUrl;
}
// ---- DGSU: archivos de demanda ciudadana (PDF/imagen, varios por demanda) ----
export async function subirArchivoDemanda(obraId, file) {
  const sb = requireSupabase();
  const ext = extensionForUpload(file);
  const path = `dgsu-demanda/${obraId}/${uploadSuffix()}.${ext}`;
  const { error } = await sb.storage.from(PHOTOS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: pub } = sb.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, nombre: file?.name || 'archivo' };
}