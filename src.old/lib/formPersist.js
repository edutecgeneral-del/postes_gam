/**
 * src/lib/formPersist.js — Persistencia de formularios para mobile.
 *
 * Problema: al abrir la cámara o cambiar de app, el navegador puede matar
 * la pestaña y se pierde todo el estado del formulario.
 *
 * Solución: guardar automáticamente en sessionStorage, y restaurar al volver.
 * Photos (File objects) no se pueden serializar, pero sí guardamos un flag
 * para avisar al usuario que debe re-capturarlas.
 */

const PREFIX = 'fc_form_';

/**
 * Lee el estado guardado de un formulario.
 * @param {string} key  identificador único del form (ej: 'scout_P-0173')
 * @returns {object|null}
 */
export function getPersistedForm(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 2 hours
    if (data._ts && Date.now() - data._ts > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Guarda el estado de un formulario.
 * @param {string} key
 * @param {object} data — todos los campos a persistir (sin Files/Blobs)
 */
export function persistForm(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch (e) {
    // sessionStorage full — silently fail
    console.warn('[formPersist] Could not save:', e.message);
  }
}

/**
 * Limpia el estado guardado al guardar o cancelar exitosamente.
 */
export function clearPersistedForm(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {}
}

/**
 * Hook-like helper: registra un listener de visibilitychange que
 * guarda el form cuando la app va a background.
 * Devuelve la función de cleanup.
 *
 * @param {string} key
 * @param {() => object} getState — función que retorna el estado actual
 * @returns {() => void} cleanup function
 */
export function onBackgroundSave(key, getState) {
  const handler = () => {
    if (document.hidden) {
      persistForm(key, getState());
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
