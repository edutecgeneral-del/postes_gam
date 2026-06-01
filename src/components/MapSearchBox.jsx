// src/components/MapSearchBox.jsx
// Buscador overlay sobre el mapa.
// Filtra posts por id / alias / dirección / unidad_territorial.
// Al seleccionar, llama onSelect(post) — el padre se encarga de centrar el mapa.

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export default function MapSearchBox({ posts, onSelect }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Cierra al click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const trimmed = q.trim().toLowerCase();
  const matches = trimmed.length === 0
    ? []
    : posts.filter((p) => (
        p.id.toLowerCase().includes(trimmed) ||
        (p.alias || '').toLowerCase().includes(trimmed) ||
        (p.direccion || '').toLowerCase().includes(trimmed) ||
        (p.unidad_territorial || '').toLowerCase().includes(trimmed)
      )).slice(0, 8);

  function pick(post) {
    onSelect(post);
    setQ('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setQ('');
      setOpen(false);
      e.currentTarget.blur();
    } else if (e.key === 'Enter' && matches.length > 0) {
      e.preventDefault();
      pick(matches[0]);
    }
  }

  return (
    <div ref={containerRef} className="relative w-72 max-w-[calc(100vw-2rem)]">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none"
          strokeWidth={1.5}
        />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar poste por ID, alias, dirección…"
          className="w-full bg-white/95 border border-stone-300 backdrop-blur-sm pl-8 pr-7 py-2 text-xs font-mono text-stone-800 placeholder-stone-500 focus:outline-none focus:border-purple-500 rounded shadow-sm"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-800"
            title="Limpiar"
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        )}
      </div>

      {open && trimmed.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-300 shadow-lg rounded max-h-80 overflow-y-auto z-50">
          {matches.length === 0 ? (
            <div className="px-3 py-3 text-xs text-stone-500 font-mono">
              Sin resultados para "<span className="text-stone-700">{q.trim()}</span>"
            </div>
          ) : (
            <ul>
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-stone-200 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-sm text-brand-500">{p.id}</span>
                      {p.alias && (
                        <span className="text-brand-600 text-[10px] font-medium">
                          "{p.alias}"
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-stone-500">
                        {p.unidad_territorial}
                      </span>
                    </div>
                    <div className="text-xs text-stone-600 truncate mt-0.5">
                      {p.direccion || '—'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
