/**
 * src/lib/photoPersist.js
 * Persistencia de fotos en captura usando IndexedDB.
 *
 * localStorage no puede guardar File/Blob ni tiene espacio suficiente, por eso
 * las fotos del formulario de scouting/mantenimiento se pierden en cada recarga.
 * Este módulo guarda los blobs en IndexedDB (clave = formKey) para que sobrevivan
 * a recargas de HMR, auto-update del PWA, o salir y volver al formulario.
 *
 * Best-effort: si IndexedDB falla, las funciones no lanzan; solo se pierde la
 * persistencia (comportamiento anterior), nunca rompe el guardado.
 */

const DB_NAME = 'ci1215-capture-photos';
const STORE = 'formPhotos';
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!(file instanceof Blob)) { resolve(''); return; }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve('');
    r.readAsDataURL(file);
  });
}

/** Guarda el mapa { [stageId]: [{ id, file, preview }] } por formKey. */
export async function savePhotos(formKey, stagePhotos) {
  try {
    const db = await openDB();
    // Solo persistimos id + file (el blob). El preview se regenera al cargar.
    const serializable = {};
    for (const [k, arr] of Object.entries(stagePhotos || {})) {
      const items = (arr || []).filter(p => p?.file instanceof Blob).map(p => ({ id: p.id, file: p.file }));
      if (items.length) serializable[k] = items;
    }
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (Object.keys(serializable).length) tx.objectStore(STORE).put(serializable, formKey);
      else tx.objectStore(STORE).delete(formKey);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) { /* best-effort */ }
}

/** Devuelve { [stageId]: [{ id, file, preview }] } o null. Regenera previews. */
export async function loadPhotos(formKey) {
  try {
    const db = await openDB();
    const data = await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(formKey);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    if (!data) return null;
    const out = {};
    for (const [k, arr] of Object.entries(data)) {
      out[k] = [];
      for (const p of (arr || [])) {
        const preview = await fileToDataUrl(p.file);
        out[k].push({ id: p.id, file: p.file, preview });
      }
    }
    return out;
  } catch (e) { return null; }
}

/** Borra las fotos persistidas de un formKey (al guardar o abandonar). */
export async function clearPhotos(formKey) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(formKey);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) { /* best-effort */ }
}

export default { savePhotos, loadPhotos, clearPhotos };
