// src/components/PostFusionHistory.jsx
// Timeline reverse-chrono de fusiones recibidas por un poste (como principal).
// Se monta dentro del PostDetailDrawer, junto al historial de reubicaciones.
// El padre pasa canView (admin || director). RLS valida del lado de DB.

import { useState, useEffect } from 'react';
import { listFusiones } from '../lib/data.js';

export default function PostFusionHistory({ postId, canView, refreshKey }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView || !postId) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listFusiones(postId).then(({ ok, data, error: err }) => {
      if (cancelled) return;
      if (!ok) setError(err);
      else setItems(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId, canView, refreshKey]);

  if (!canView) return null;
  if (loading) {
    return <div className="px-3 py-2 text-xs text-stone-500">Cargando historial de fusiones...</div>;
  }
  if (error) {
    return <div className="px-3 py-2 text-xs text-brand-600">Error: {error}</div>;
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-stone-300">
      <div className="text-xs font-mono uppercase tracking-widest text-stone-500 font-bold mb-3">
        Historial de fusiones - {items.length}
      </div>
      <ul className="space-y-3">
        {items.map((f) => (
          <li key={f.id} className="rounded border border-amber-200 bg-amber-50/40 p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-amber-800">Absorbio a {f.secundario_id}</span>
              <span className="text-xs text-stone-500">{formatRelative(f.fusionado_at)}</span>
            </div>
            <div className="text-[12px] text-stone-700">
              Etapas copiadas:{' '}
              <span className="font-mono">
                {(f.stages_copied && f.stages_copied.length) ? f.stages_copied.join(', ') : 'ninguna'}
              </span>
            </div>
            <div className="text-[12px] text-stone-700">
              Incidencias movidas: <span className="font-mono">{f.incidents_moved ?? 0}</span>
            </div>
            <div className="text-[12px] text-stone-700">
              Direccion conservada:{' '}
              <span className="font-mono">{f.keep_address === 'secundario' ? 'del absorbido' : 'del principal'}</span>
            </div>
            <div className="mt-1 text-[11px] text-stone-400">
              {formatFull(f.fusionado_at)}
              {f.fusionado_por ? (
                <span className="ml-2 font-mono" title={f.fusionado_por}>- {f.fusionado_por.slice(0, 8)}...</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRelative(iso) {
  const date = new Date(iso);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return 'hace ' + mins + ' min';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'hace ' + hours + ' h';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return 'hace ' + days + ' dias';
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : 'hace ' + months + ' meses';
}

function formatFull(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
