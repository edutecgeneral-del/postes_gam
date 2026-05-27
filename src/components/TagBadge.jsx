// src/components/TagBadge.jsx
//
// Chip visual para mostrar un tag. Usa el color hex que viene del catálogo
// (con fallback gris) y deriva fondo/borde con alpha.
//
// Props:
//   - tag:        { id, label, color, categoriaId }
//   - size:       'xs' | 'sm' (default 'sm')
//   - onRemove:   () => void   (si se pasa, muestra la X)
//   - className:  string adicional
//
// Componente compañero TagBadgeList: render compacto de varios tags con "+N"
// cuando se excede `limit`.

import React from 'react';

const SIZE_CLASSES = {
  xs: 'text-[10px] px-1.5 py-0 leading-4',
  sm: 'text-xs px-2 py-0.5 leading-5',
};

export function TagBadge({ tag, size = 'sm', onRemove = null, className = '' }) {
  if (!tag) return null;
  const color = tag.color || '#6b7280'; // gray-500 fallback

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${className}`}
      style={{
        backgroundColor: `${color}22`,    // ~13% alpha
        color,
        border: `1px solid ${color}44`,   // ~27% alpha
      }}
      title={tag.label}
    >
      {tag.label}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 leading-none hover:opacity-60"
          aria-label={`Quitar ${tag.label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagBadgeList({ tags, size = 'sm', limit = null, className = '' }) {
  if (!tags?.length) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const hidden = limit ? Math.max(0, tags.length - limit) : 0;

  return (
    <div className={`inline-flex flex-wrap gap-1 items-center ${className}`}>
      {shown.map(t => <TagBadge key={t.id} tag={t} size={size} />)}
      {hidden > 0 && (
        <span className="text-[10px] text-gray-500 px-1">+{hidden}</span>
      )}
    </div>
  );
}

export default TagBadge;
