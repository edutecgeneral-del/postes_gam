/**
 * pwa.js — Registro del service worker y eventos para la UI.
 *
 * Expone dos custom events sobre `window`:
 *   - 'pwa:update-available'  → hay una versión nueva, ofrecer recargar
 *   - 'pwa:offline-ready'     → la app ya está cacheada y funciona sin red
 *
 * El SW solo se registra en producción. En `npm run dev` no hay SW (más simple
 * para depurar). Si necesitas probarlo localmente, corre `npm run build &&
 * npm run preview`.
 */

let updateSWFn = null;

export async function registerServiceWorker() {
  // En dev, vite-plugin-pwa con devOptions.enabled=false no genera SW.
  // Saltamos el registro para evitar errores en consola.
  if (!import.meta.env.PROD) return;

  try {
    // Importación dinámica del helper de vite-plugin-pwa
    const { registerSW } = await import('virtual:pwa-register');

    updateSWFn = registerSW({
      immediate: true,

      onNeedRefresh() {
        // Hay una nueva versión disponible — la UI puede ofrecer recargar
        window.dispatchEvent(new CustomEvent('pwa:update-available'));
      },

      onOfflineReady() {
        // App cacheada por completo, funciona sin red
        window.dispatchEvent(new CustomEvent('pwa:offline-ready'));
      },

      onRegisterError(err) {
        console.warn('[PWA] registro falló:', err);
      },
    });
  } catch (e) {
    // En entornos sin soporte (o si el módulo virtual no resolvió), seguimos sin SW
    console.warn('[PWA] no se pudo registrar SW:', e);
  }
}

/** Llama a esto cuando el usuario acepta recargar para la nueva versión. */
export async function applyUpdate() {
  if (typeof updateSWFn === 'function') {
    await updateSWFn(true);
  } else {
    window.location.reload();
  }
}
