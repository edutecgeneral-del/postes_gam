// src/components/RelocateConfirmModal.jsx
// Modal compartido para confirmar reubicación de un poste.
// Lo usan el flujo drag (translateend del mapa) y el flujo manual (drawer).
//
// El padre conserva el control del submit (loading, errores, refresh). Este
// componente solo recolecta motivo + nota y devuelve el payload.

import { useState, useEffect } from 'react';
import { MOTIVOS_REUBICACION, distanciaMetros } from '../lib/relocate.js';

/**
 * Props:
 *   open            boolean
 *   onClose         () => void
 *   onConfirm       (payload) => void
 *                   payload = { motivo, nota, latNueva, lngNueva, distanciaM }
 *   postLabel       string
 *   coordsAnterior  { lat: number, lng: number }
 *   coordsNueva     { lat: number, lng: number }
 *   submitting      boolean
 *   errorMessage    string | null
 */
export default function RelocateConfirmModal({
  open,
  onClose,
  onConfirm,
  postLabel = '',
  coordsAnterior,
  coordsNueva,
  submitting = false,
  errorMessage = null,
}) {
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setMotivo('');
      setNota('');
    }
  }, [open]);

  // ESC para cerrar (si no está enviando)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open || !coordsAnterior || !coordsNueva) return null;

  const distancia = distanciaMetros(
    coordsAnterior.lat, coordsAnterior.lng,
    coordsNueva.lat,    coordsNueva.lng
  );

  const notaTrim = nota.trim();
  const isValid = !!motivo && notaTrim.length >= 5;

  function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || submitting) return;
    onConfirm({
      motivo,
      nota: notaTrim,
      latNueva: coordsNueva.lat,
      lngNueva: coordsNueva.lng,
      distanciaM: Math.round(distancia * 10) / 10,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-stone-900/50 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="relocate-modal-title"
    >
      <div
        className="w-full max-w-md bg-amber-50 border border-stone-300 shadow-2xl rounded"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-stone-300 px-5 py-3">
          <h2
            id="relocate-modal-title"
            className="text-sm font-mono uppercase tracking-widest text-purple-700 font-bold"
          >
            🎯 Confirmar reubicación
          </h2>
          {postLabel && (
            <p className="text-xs text-stone-500 mt-0.5 font-mono">{postLabel}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Comparación coords */}
          <div className="border border-stone-300 bg-stone-50 p-3 text-sm rounded">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Antes:
              </span>
              <span className="font-mono text-stone-700 text-xs">
                {coordsAnterior.lat.toFixed(6)}, {coordsAnterior.lng.toFixed(6)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Después:
              </span>
              <span className="font-mono text-stone-700 text-xs">
                {coordsNueva.lat.toFixed(6)}, {coordsNueva.lng.toFixed(6)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Distancia:
              </span>
              <span className="font-mono font-bold text-purple-700 text-xs">
                📏 {distancia.toFixed(1)} m
              </span>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label
              htmlFor="relocate-motivo"
              className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1.5"
            >
              Motivo <span className="text-rose-600">*</span>
            </label>
            <select
              id="relocate-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              aria-required="true"
              disabled={submitting}
              className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 disabled:bg-stone-100 disabled:cursor-not-allowed"
            >
              <option value="">— Selecciona un motivo —</option>
              {MOTIVOS_REUBICACION.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.icon} {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nota */}
          <div>
            <label
              htmlFor="relocate-nota"
              className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1.5"
            >
              Nota <span className="text-rose-600">*</span>
              <span className="ml-2 normal-case tracking-normal text-[10px] text-stone-400">
                (mínimo 5 caracteres)
              </span>
            </label>
            <textarea
              id="relocate-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              required
              aria-required="true"
              minLength={5}
              maxLength={500}
              rows={3}
              disabled={submitting}
              placeholder="Describe brevemente por qué se reubica este poste…"
              className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 disabled:bg-stone-100 disabled:cursor-not-allowed resize-none"
            />
            <div className="text-right text-[10px] text-stone-400 mt-1">
              {notaTrim.length}/500
            </div>
          </div>

          {/* Error banner */}
          {errorMessage && (
            <div
              role="alert"
              className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 rounded"
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2 border-t border-stone-300 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-stone-300 text-stone-600 hover:bg-stone-100 text-xs font-mono uppercase tracking-widest rounded transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 text-xs font-mono uppercase tracking-widest rounded transition-colors disabled:bg-stone-300 disabled:text-stone-500 disabled:cursor-not-allowed"
            >
              {submitting ? '⏳ Guardando…' : '✓ Confirmar reubicación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
