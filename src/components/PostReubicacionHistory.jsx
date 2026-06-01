// src/components/PostReubicacionHistory.jsx
// Timeline reverse-chrono de reubicaciones de un poste.
// Se monta dentro del PostDetailDrawer.
// El padre debe pasar `canView` (típicamente isAdmin || isDirector).
// RLS valida también del lado de DB como red de seguridad.

import { useState, useEffect } from 'react';
import { listReubicaciones, MOTIVO_LABELS, MOTIVO_ICONS } from '../lib/relocate.js';

/**
 * Props:
 *   postId       string
 *   canView      boolean             — el padre decide (admin || director)
 *   refreshKey   any                 — cambiarlo fuerza re-fetch
 */
export default function PostReubicacionHistory({ postId, canView, refreshKey }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView || !postId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    listReubicaciones(postId).then(({ ok, data, error: err }) => {
      if (cancelled) return;
      if (!ok) setError(err);
      else setItems(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [postId, canView, refreshKey]);

  if (!canView) return null;
  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-stone-500">
        Cargando historial de reubicaciones…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-brand-600">
        ⚠️ {error}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-stone-300">
      <div className="text-xs font-mono uppercase tracking-widest text-stone-500 font-bold mb-3">
        📜 Historial de reubicaciones · {items.length}
      </div>
      <ul className="space-y-3">
        {items.map((r) => (
          <li
            key={r.id}
            className="rounded border border-purple-200 bg-purple-50/30 p-3 text-sm"
          >
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-purple-800">
                {MOTIVO_ICONS[r.motivo] || '•'} {MOTIVO_LABELS[r.motivo] || r.motivo}
              </span>
              <span className="text-xs text-stone-500">
                {formatRelative(r.reubicado_at)}
              </span>
              {r.distancia_m != null && (
                <span className="text-xs font-mono text-purple-600">
                  · 📏 {Number(r.distancia_m).toFixed(1)} m
                </span>
              )}
            </div>

            <p className="mb-2 whitespace-pre-wrap text-stone-700">{r.nota}</p>

            <div className="text-[11px] text-stone-500">
              📍{' '}
              <span className="font-mono">
                {Number(r.lat_anterior).toFixed(6)}, {Number(r.lng_anterior).toFixed(6)}
              </span>
              {' → '}
              <span className="font-mono">
                {Number(r.lat_nueva).toFixed(6)}, {Number(r.lng_nueva).toFixed(6)}
              </span>
            </div>

            <div className="mt-1 text-[11px] text-stone-400">
              {formatFull(r.reubicado_at)}
              {r.autor?.display_name ? (
                <span className="ml-2">· {r.autor.display_name}</span>
              ) : r.reubicado_por ? (
                <span className="ml-2 font-mono" title={r.reubicado_por}>
                  · {r.reubicado_por.slice(0, 8)}…
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers de fecha                                                    */
/* ------------------------------------------------------------------ */

function formatRelative(iso) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

function formatFull(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
