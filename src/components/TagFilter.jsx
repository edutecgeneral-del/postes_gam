// src/components/TagFilter.jsx
//
// Dropdown para filtrar postes por un tag de una categoría específica.
// Genérico: una sola instancia sirve para CUALQUIER categoría del catálogo.
//
// Props:
//   - categoria:    { id, nombre, color }
//   - tags:         array completo de tags del catálogo (filtra por categoria.id)
//   - selectedTagId: tag.id seleccionado, '__none__' para "sin tag", null para "todos"
//   - onChange:     (newTagId | null) => void
//   - counts:       opcional { [tagId]: number } para mostrar conteo "(N)"
//   - className:    string
//
// Ejemplo de uso en App.jsx:
//   const { catalog } = useTagCatalog();
//   const [loteFilter, setLoteFilter] = useState(null);
//   const cat = catalog?.categorias.find(c => c.id === 'lote');
//   <TagFilter categoria={cat} tags={catalog.tags}
//              selectedTagId={loteFilter} onChange={setLoteFilter} />

import React, { useMemo } from 'react';

export function TagFilter({
  categoria,
  tags,
  selectedTagId,
  onChange,
  counts = null,
  className = '',
}) {
  const opciones = useMemo(() => {
    if (!categoria || !tags) return [];
    return tags
      .filter(t => t.categoriaId === categoria.id && t.activo !== false)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.label.localeCompare(b.label));
  }, [categoria, tags]);

  if (!categoria) return null;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <label
        htmlFor={`tag-filter-${categoria.id}`}
        className="text-xs font-medium text-gray-600 whitespace-nowrap"
      >
        {categoria.nombre}:
      </label>
      <select
        id={`tag-filter-${categoria.id}`}
        value={selectedTagId ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        style={{ minWidth: 160 }}
      >
        <option value="">Todos</option>
        {opciones.map(t => {
          const c = counts?.[t.id];
          return (
            <option key={t.id} value={t.id}>
              {t.label}{c != null ? ` (${c})` : ''}
            </option>
          );
        })}
        <option value="__none__">Sin {categoria.nombre.toLowerCase()}</option>
      </select>
      {selectedTagId && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-gray-500 hover:text-gray-700"
          title="Quitar filtro"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default TagFilter;
