// src/lib/relocate.js
// Operaciones de reubicación de postes.
// Sigue el patrón de data.js: requireSupabase() interno, withTimeout, telemetría.

import { getSupabase, hasSupabase } from './supabase.js';
import { reportError } from './errorTracker.js';

const RPC_TIMEOUT_MS = 15000;

/* ------------------------------------------------------------------ */
/* Catálogo de motivos                                                 */
/* ------------------------------------------------------------------ */

export const MOTIVOS_REUBICACION = [
  { value: 'error_coordenada',        label: 'Error de coordenada',          icon: '📍' },
  { value: 'servicios_urbanos',       label: 'Servicios Urbanos',            icon: '🚧' },
  { value: 'participacion_ciudadana', label: 'Participación Ciudadana',      icon: '🏘️' },
  { value: 'otra_dependencia',        label: 'Otra dependencia de gobierno', icon: '🏛️' },
  { value: 'empresa',                 label: 'Empresa',                      icon: '🏢' },
];

export const MOTIVO_LABELS = Object.fromEntries(
  MOTIVOS_REUBICACION.map((m) => [m.value, m.label])
);

export const MOTIVO_ICONS = Object.fromEntries(
  MOTIVOS_REUBICACION.map((m) => [m.value, m.icon])
);

/* ------------------------------------------------------------------ */
/* Helpers internos                                                    */
/* ------------------------------------------------------------------ */

function requireSupabase() {
  if (!hasSupabase()) {
    throw new Error(
      'relocate.js requiere Supabase. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env'
    );
  }
  return getSupabase();
}

async function withTimeout(promise, ms, label) {
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
    try { reportError(err, `relocate.js:${label}`, { timeout_ms: ms }); } catch {}
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Haversine — distancia en metros entre dos coordenadas.
 */
export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function mensajeError(error) {
  if (!error) return 'Error desconocido';
  const code = error.code;
  const msg = error.message || '';

  if (code === '28000' || /no autenticado/i.test(msg)) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  }
  if (code === '42501' || /permiso denegado/i.test(msg)) {
    return 'Tu rol no tiene permiso para reubicar postes.';
  }
  if (code === 'P0002' || /no encontrado/i.test(msg)) {
    return 'El poste ya no existe (puede haberse eliminado).';
  }
  if (code === '23514') {
    return 'Datos inválidos: motivo desconocido o nota demasiado corta (mín. 5 caracteres).';
  }
  if (code === '23503') {
    return 'Referencia inválida (poste o usuario inexistente).';
  }
  return msg || 'Error desconocido al reubicar el poste.';
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

/**
 * Reubica un poste de forma atómica (RPC `relocate_post`).
 * No lanza: retorna { ok, data?, error? }.
 *
 * @param {object} payload
 * @param {string} payload.postId      ID del poste (ej. "P-0457")
 * @param {string} payload.motivo      uno de MOTIVOS_REUBICACION[].value
 * @param {string} payload.nota        ≥ 5 chars
 * @param {number} payload.latNueva
 * @param {number} payload.lngNueva
 * @param {number} [payload.distanciaM]
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function relocatePost({
  postId,
  motivo,
  nota,
  latNueva,
  lngNueva,
  distanciaM,
}) {
  // Validación cliente (la DB tiene CHECKs como red de seguridad)
  if (!postId)                return { ok: false, error: 'Falta el ID del poste' };
  if (!motivo)                return { ok: false, error: 'Falta el motivo' };
  if (!MOTIVO_LABELS[motivo]) return { ok: false, error: 'Motivo inválido' };
  if (!nota || nota.trim().length < 5) {
    return { ok: false, error: 'La nota es obligatoria (mínimo 5 caracteres)' };
  }
  if (!Number.isFinite(latNueva) || !Number.isFinite(lngNueva)) {
    return { ok: false, error: 'Coordenadas inválidas' };
  }

  try {
    const sb = requireSupabase();
    const { data, error } = await withTimeout(
      sb.rpc('relocate_post', {
        p_post_id:     postId,
        p_motivo:      motivo,
        p_nota:        nota.trim(),
        p_lat_nueva:   latNueva,
        p_lng_nueva:   lngNueva,
        p_distancia_m: distanciaM ?? null,
      }),
      RPC_TIMEOUT_MS,
      'relocate_post'
    );

    if (error) {
      console.error('[relocatePost] RPC error:', error);
      return { ok: false, error: mensajeError(error) };
    }

    // RPC retorna TABLE → array, tomamos la primera fila
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, data: row };
  } catch (err) {
    console.error('[relocatePost] exception:', err);
    return { ok: false, error: err.message || 'Error de red al reubicar el poste' };
  }
}

/**
 * Lista historial de reubicaciones de un poste.
 * RLS bloquea a no-admin/director → retorna [] sin error visible.
 * Best-effort lookup de display_name en user_profiles.
 *
 * @param {string} postId
 * @returns {Promise<{ ok: boolean, data: object[], error?: string }>}
 */
export async function listReubicaciones(postId) {
  try {
    const sb = requireSupabase();
    const { data, error } = await withTimeout(
      sb
        .from('post_reubicaciones')
        .select(
          'id, motivo, nota, lat_anterior, lng_anterior, ' +
          'lat_nueva, lng_nueva, distancia_m, reubicado_por, reubicado_at'
        )
        .eq('post_id', postId)
        .order('reubicado_at', { ascending: false }),
      RPC_TIMEOUT_MS,
      'list_reubicaciones'
    );

    if (error) {
      console.error('[listReubicaciones] error:', error);
      return { ok: false, error: error.message, data: [] };
    }
    if (!data || data.length === 0) {
      return { ok: true, data: [] };
    }

    // Resolver autores (best-effort)
    const userIds = [...new Set(data.map((r) => r.reubicado_por).filter(Boolean))];
    let nameById = {};
    if (userIds.length > 0) {
      try {
        const { data: profiles } = await sb
          .from('user_profiles')
          .select('user_id, display_name, role')
          .in('user_id', userIds);
        if (profiles) {
          nameById = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
        }
      } catch { /* silencioso */ }
    }

    return {
      ok: true,
      data: data.map((r) => ({
        ...r,
        autor: nameById[r.reubicado_por] || null,
      })),
    };
  } catch (err) {
    console.error('[listReubicaciones] exception:', err);
    return { ok: false, error: err.message || 'Error al cargar historial', data: [] };
  }
}
