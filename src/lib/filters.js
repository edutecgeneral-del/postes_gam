// ============================================================================
// filters.js — Lógica pura de filtrado, contadores y sync con URL params
// ----------------------------------------------------------------------------
// Sin React, sin DOM. Reutilizable por MapView y PostsList.
// ============================================================================

export const VERIFIED_VALUES = ['verificado', 'parcial', 'sin_verificar'];

export const EMPTY_FILTERS = Object.freeze({
  stages: [],
  uts: [],
  capturadores: [],
  tags: [],
  verified: null,
  maint: null,
  incType: null,
  createdFrom: null,
  createdTo: null,
  modFrom: null,
  modTo: null,
});

export function isEmptyFilters(f) {
  return !f
    || (!f.stages?.length
        && !f.uts?.length
        && !f.capturadores?.length
        && !f.tags?.length
        && !f.verified
        && !f.maint
        && !f.incType
        && !f.createdFrom
        && !f.createdTo
        && !f.modFrom
        && !f.modTo);
}

// Estado actual de un poste como string único:
// 'bloqueado' | 'completado' | <stageId pendiente>
function dateStrToStart(s) {
  const t = new Date(s + 'T00:00:00').getTime();
  return Number.isNaN(t) ? null : t;
}
function dateStrToEnd(s) {
  const t = new Date(s + 'T23:59:59.999').getTime();
  return Number.isNaN(t) ? null : t;
}

export function currentStateOf(post, stageDefs) {
  if (post.blocked) return 'bloqueado';
  for (const s of stageDefs) {
    if (!post.stages?.[s.id]?.done) return s.id;
  }
  return 'completado';
}

// Checks de silicón que componen el mantenimiento M1
const SILICON_CHECK_IDS = ['sil_corona_1', 'sil_corona_2', 'sil_brazo_izq', 'sil_brazo_der', 'sil_acrilico'];

// ¿El poste tiene el silicón M1 completo? (los 5 checks en 'ok')
export function siliconCompleto(post) {
  const checks = post.stages?.camaras?.attrs?.mantenimiento?.m1_mantenimiento?.checks || {};
  return SILICON_CHECK_IDS.every(id => checks[id]?.result === 'ok');
}

// ¿Pasa este poste el filtro?
// mode: 'map' | 'list-detalle' | 'list-pipeline'
//   - 'list-detalle' relaja el filtro de etapa: matchea también si la etapa
//     está done aunque no sea la pendiente actual (preserva comportamiento v1).
export function matchesFilters(post, filters, stageDefs, mode = 'map', incidents = []) {
  // UT ----------------------------------------------------------------
  if (filters.uts?.length && !filters.uts.includes(post.unidad_territorial)) {
    return false;
  }

  // Etapas ------------------------------------------------------------
  if (filters.stages?.length) {
    const cur = currentStateOf(post, stageDefs);
    let match = filters.stages.includes(cur);

    if (!match && mode === 'list-detalle' && !post.blocked) {
      // En vista detalle también matchea si alguna etapa filtrada está done
      match = filters.stages.some(sid =>
        sid !== 'completado' && sid !== 'bloqueado' && post.stages?.[sid]?.done
      );
    }

    if (!match) return false;
  }

  // Mantenimiento / pendientes especiales (E4) -----------------------
if (filters.maint === 'antena_recuperada') {
    // Antenas ya recuperadas (post.antenaRecuperada = true)
    if (!post.antenaRecuperada) return false;
  } else if (filters.maint === 'con_modem') {  // Lleva módem = E5 (internet) hecha con tipo_modem registrado
    if (!post.stages?.internet?.done) return false;
    if (!String(post.stages?.internet?.attrs?.tipo_modem || '').trim()) return false;
  } else if (filters.maint === 'sin_modem') {
    // No lleva módem = E5 (internet) hecha SIN tipo_modem
    if (!post.stages?.internet?.done) return false;
    if (String(post.stages?.internet?.attrs?.tipo_modem || '').trim()) return false;
  } else if (filters.maint === 'falta_camaras') {
    // Faltan cámaras = etapa E4 (camaras) NO hecha
    if (post.stages?.camaras?.done) return false;
  } else if (filters.maint === 'falta_silicon') {
    // Falta silicón = los 5 checks de silicón M1 no están todos en 'ok'
    if (siliconCompleto(post)) return false;
  } else if (filters.maint === 'poste_13m') {
    // Poste 13m = tipo de poste marcado como '13m' en la fase Dado (E2)
    if (post.stages?.dado?.attrs?.poste_tipo !== '13m') return false;
  } else if (filters.maint === 'reubicados') {
    // Postes que han sido reubicados (post.reubicado = true)
    if (!post.reubicado) return false;
  } else if (filters.maint === 'boton_panico') {
    if (!post.stages?.camaras?.attrs?.boton_panico) return false;
  } else if (filters.maint === 'revisados') {
    // PASO_13_REVISADOS: solo postes con revisado=true
    if (!post.revisado) return false;
  } else if (filters.maint === 'no_revisados') {
    // PASO_13_REVISADOS: solo postes con revisado=false o null
    if (post.revisado) return false;
  } else if (filters.maint === 'internet_futuro') {
    // Internet futuro: solo postes marcados con el tag internet_futuro_priorizado
    if (!post.tags?.some(t => t.id === 'internet_futuro_priorizado')) return false;
  }

  // Tipo de incidencia — mostrar solo postes con al menos una incidencia abierta de ese tipo
  if (filters.incType) {
    const hasMatch = incidents.some(i =>
      i.postId === post.id && i.status === 'abierta' && i.type === filters.incType
    );
    if (!hasMatch) return false;
  }

  // Capturadores -----------------------------------------------------
  // Match si CUALQUIER etapa del poste fue capturada por uno de los uids seleccionados.
  if (filters.capturadores?.length) {
    const captured = stageDefs.some(s =>
      filters.capturadores.includes(post.stages?.[s.id]?.capturedBy)
    );
    if (!captured) return false;
  }

  // Tags -------------------------------------------------------------
  if (filters.tags?.length) {
    const postTagIds = (post.tags || []).map(t => t.id);
    const hasMatch = filters.tags.some(tid => postTagIds.includes(tid));
    if (!hasMatch) return false;
  }

  // Verificación -----------------------------------------------------
  if (filters.verified) {
    const allVerified = stageDefs.every(s =>
      !post.stages?.[s.id]?.done || post.stages?.[s.id]?.verified
    );
    const someVerified = stageDefs.some(s => post.stages?.[s.id]?.verified);
    const anyDone = stageDefs.some(s => post.stages?.[s.id]?.done);

    if (filters.verified === 'verificado'    && !(anyDone && allVerified)) return false;
    if (filters.verified === 'parcial'       && !(someVerified && !allVerified)) return false;
    if (filters.verified === 'sin_verificar' && someVerified) return false;
  }

  // Rango de fechas: creado (createdAt) y modificado (lastUpdate)
  if (filters.createdFrom) {
    const from = dateStrToStart(filters.createdFrom);
    if (from != null && (post.createdAt == null || post.createdAt < from)) return false;
  }
  if (filters.createdTo) {
    const to = dateStrToEnd(filters.createdTo);
    if (to != null && (post.createdAt == null || post.createdAt > to)) return false;
  }
  if (filters.modFrom) {
    const from = dateStrToStart(filters.modFrom);
    if (from != null && (post.lastUpdate == null || post.lastUpdate < from)) return false;
  }
  if (filters.modTo) {
    const to = dateStrToEnd(filters.modTo);
    if (to != null && (post.lastUpdate == null || post.lastUpdate > to)) return false;
  }

  return true;
}

export function filterPosts(posts, filters, stageDefs, mode = 'map', incidents = []) {
  if (isEmptyFilters(filters)) return posts;
  return posts.filter(p => matchesFilters(p, filters, stageDefs, mode, incidents));
}

// Contadores: para cada (dimensión, opción), cuántos postes habría si esa
// fuera la única opción seleccionada en esa dimensión, manteniendo activos
// los filtros de las otras dimensiones.
export function computeCounts(posts, filters, stageDefs, mode = 'map', incidents = []) {
  const counts = { stages: {}, uts: {}, capturadores: {}, tags: {}, verified: {}, maint: {}, incType: {} };

  // stages
  const stageOptions = [...stageDefs.map(s => s.id), 'completado', 'bloqueado'];
  const filtersWithoutStages = { ...filters, stages: [] };
  for (const opt of stageOptions) {
    counts.stages[opt] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutStages, stages: [opt] }, stageDefs, mode)
    ).length;
  }

  // uts
  const utList = [...new Set(posts.map(p => p.unidad_territorial).filter(Boolean))];
  const filtersWithoutUts = { ...filters, uts: [] };
  for (const ut of utList) {
    counts.uts[ut] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutUts, uts: [ut] }, stageDefs, mode)
    ).length;
  }

  // capturadores (extraer uids únicos del dataset)
  const capIds = new Set();
  posts.forEach(p => stageDefs.forEach(s => {
    const id = p.stages?.[s.id]?.capturedBy;
    if (id) capIds.add(id);
  }));
  const filtersWithoutCaps = { ...filters, capturadores: [] };
  for (const cid of capIds) {
    counts.capturadores[cid] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutCaps, capturadores: [cid] }, stageDefs, mode)
    ).length;
  }

  // tags (todos los tag ids únicos del dataset)
  const tagIds = new Set();
  posts.forEach(p => (p.tags || []).forEach(t => tagIds.add(t.id)));
  const filtersWithoutTags = { ...filters, tags: [] };
  for (const tid of tagIds) {
    counts.tags[tid] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutTags, tags: [tid] }, stageDefs, mode, incidents)
    ).length;
  }

  // verified
  const filtersWithoutVer = { ...filters, verified: null };
  for (const v of VERIFIED_VALUES) {
    counts.verified[v] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutVer, verified: v }, stageDefs, mode, incidents)
    ).length;
  }

  // maint (faltan cámaras / falta silicón / poste 13m)
  const filtersWithoutMaint = { ...filters, maint: null };
  for (const m of ['falta_camaras', 'falta_silicon', 'poste_13m', 'reubicados', 'boton_panico', 'revisados', 'no_revisados', 'con_modem', 'sin_modem', 'internet_futuro', 'antena_recuperada']) {
    counts.maint[m] = posts.filter(p =>
      matchesFilters(p, { ...filtersWithoutMaint, maint: m }, stageDefs, mode, incidents)
    ).length;
  }

  // incType — tipos únicos de incidencias abiertas, conteo de postes afectados
  const incFiltersWithoutType = { ...filters, incType: null };
  const openTypes = [...new Set(incidents.filter(i => i.status === 'abierta').map(i => i.type).filter(Boolean))];
  for (const t of openTypes) {
    counts.incType[t] = posts.filter(p =>
      matchesFilters(p, { ...incFiltersWithoutType, incType: t }, stageDefs, mode, incidents)
    ).length;
  }

  return counts;
}

// ============================================================================
// URL params encoding/decoding
// ============================================================================

const MAINT_VALUES = ['falta_camaras', 'falta_silicon', 'poste_13m', 'reubicados', 'boton_panico', 'revisados', 'no_revisados', 'con_modem', 'sin_modem', 'internet_futuro', 'antena_recuperada'];
const URL_KEYS = ['stages', 'uts', 'capturadores', 'tags', 'verified', 'maint', 'incType', 'createdFrom', 'createdTo', 'modFrom', 'modTo'];

export function paramsToFilters(searchParams) {
  const sp = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams || '');
  const get = (k) => sp.get(k);
  return {
    stages: get('stages')       ? get('stages').split(',').filter(Boolean) : [],
    uts: get('uts')             ? get('uts').split(',').filter(Boolean) : [],
    capturadores: get('capturadores') ? get('capturadores').split(',').filter(Boolean) : [],
    tags: get('tags')           ? get('tags').split(',').filter(Boolean) : [],
    verified: VERIFIED_VALUES.includes(get('verified')) ? get('verified') : null,
    maint: MAINT_VALUES.includes(get('maint')) ? get('maint') : null,
    incType: get('incType') || null,
    createdFrom: get('createdFrom') || null,
    createdTo: get('createdTo') || null,
    modFrom: get('modFrom') || null,
    modTo: get('modTo') || null,
  };
}

// Devuelve un URLSearchParams para que el caller decida cómo aplicarlo
// (window.history.replaceState, navigate(), etc.)
export function filtersToParams(filters, baseSearch = '') {
  const sp = new URLSearchParams(baseSearch);
  // Limpiar las claves que controlamos
  URL_KEYS.forEach(k => sp.delete(k));
  if (filters.stages?.length)        sp.set('stages',       filters.stages.join(','));
  if (filters.uts?.length)           sp.set('uts',          filters.uts.join(','));
  if (filters.capturadores?.length)  sp.set('capturadores', filters.capturadores.join(','));
  if (filters.tags?.length)          sp.set('tags',         filters.tags.join(','));
  if (filters.verified)              sp.set('verified',     filters.verified);
  if (filters.maint)                 sp.set('maint',        filters.maint);
  if (filters.incType)               sp.set('incType',       filters.incType);
  if (filters.createdFrom)           sp.set('createdFrom',  filters.createdFrom);
  if (filters.createdTo)             sp.set('createdTo',    filters.createdTo);
  if (filters.modFrom)               sp.set('modFrom',      filters.modFrom);
  if (filters.modTo)                 sp.set('modTo',        filters.modTo);
  return sp;
}