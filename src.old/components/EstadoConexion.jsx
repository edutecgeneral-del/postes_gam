/**
 * EstadoConexion.jsx — Indicador visual de estado de red y actualizaciones.
 *
 * Muestra:
 *   1. Banner rojo persistente cuando se pierde la conexión.
 *   2. Banner azul con botón "Actualizar" cuando hay nueva versión del SW.
 *   3. Toast verde temporal cuando la app queda lista para uso offline.
 *
 * Está pensado para colocarse al inicio del root component; usa `position: fixed`
 * arriba del todo y nunca interfiere con clicks en el resto de la app.
 */

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Download, X } from 'lucide-react';
import { applyUpdate } from '../lib/pwa.js';

export default function EstadoConexion() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offlineReadyToast, setOfflineReadyToast] = useState(false);
  // Para evitar parpadeo: solo mostramos "se restableció" durante 4 segundos
  const [recentlyReconnected, setRecentlyReconnected] = useState(false);

  // ── Online/offline detection ────────────────────────────────────
  useEffect(() => {
    let prevOnline = online;
    const handleOnline = () => {
      setOnline(true);
      if (!prevOnline) {
        setRecentlyReconnected(true);
        setTimeout(() => setRecentlyReconnected(false), 4000);
      }
      prevOnline = true;
    };
    const handleOffline = () => {
      setOnline(false);
      prevOnline = false;
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PWA events ───────────────────────────────────────────────────
  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true);
    const onOfflineReady = () => {
      setOfflineReadyToast(true);
      setTimeout(() => setOfflineReadyToast(false), 5000);
    };
    window.addEventListener('pwa:update-available', onUpdate);
    window.addEventListener('pwa:offline-ready', onOfflineReady);
    return () => {
      window.removeEventListener('pwa:update-available', onUpdate);
      window.removeEventListener('pwa:offline-ready', onOfflineReady);
    };
  }, []);

  return (
    <>
      {/* ── Banner: SIN CONEXIÓN ─────────────────────────────────── */}
      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white px-3 py-2 flex items-center justify-center gap-2 text-xs font-mono shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
          <span className="font-semibold uppercase tracking-wider">Sin conexión</span>
          <span className="text-white/80 hidden sm:inline">·</span>
          <span className="text-white/90 hidden sm:inline">
            Puedes seguir capturando, los datos se guardarán cuando vuelva la señal
          </span>
          <span className="text-white/90 sm:hidden">Captura activa</span>
        </div>
      )}

      {/* ── Toast: conexión restablecida ─────────────────────────── */}
      {online && recentlyReconnected && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-[100] bg-emerald-600 text-white px-3 py-2 flex items-center justify-center gap-2 text-xs font-mono shadow-lg animate-pulse"
        >
          <Wifi className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
          <span className="font-semibold uppercase tracking-wider">Conexión restablecida</span>
        </div>
      )}

      {/* ── Banner: nueva versión disponible ─────────────────────── */}
      {updateAvailable && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[100] bg-stone-50 border-2 border-blue-500 rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Download className="w-4 h-4 text-blue-600" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-900">
                  Nueva versión disponible
                </div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Recarga para aplicar las mejoras más recientes.
                </p>
              </div>
              <button
                onClick={() => setUpdateAvailable(false)}
                className="text-stone-400 hover:text-stone-700 p-0.5 flex-shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setUpdateAvailable(false)}
                className="flex-1 px-3 py-2 text-xs font-mono uppercase tracking-wider border border-stone-300 text-stone-600 hover:bg-stone-100 rounded"
              >
                Después
              </button>
              <button
                onClick={() => applyUpdate()}
                className="flex-1 px-3 py-2 text-xs font-mono uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Recargar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast: app lista para offline ────────────────────────── */}
      {offlineReadyToast && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[100] bg-emerald-50 border border-emerald-300 rounded-lg shadow-lg p-3 flex items-center gap-2"
        >
          <Wifi className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={2} />
          <div className="text-xs text-emerald-800 font-mono">
            Listo. La app ya funciona sin conexión.
          </div>
          <button
            onClick={() => setOfflineReadyToast(false)}
            className="ml-auto text-emerald-600 hover:text-emerald-800 p-0.5"
            aria-label="Cerrar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
