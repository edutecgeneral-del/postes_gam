// ============================================================================
// FilterBar.jsx — Barra superior compacta con chips multi-select y contadores
// ----------------------------------------------------------------------------
// Cada chip abre un popover con checkboxes. Los contadores reflejan
// "cuántos postes habría si solo esta opción estuviera marcada en esta
// dimensión, manteniendo activos los filtros de las otras dimensiones".
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeCounts, VERIFIED_VALUES } from '../lib/filters';
import { useTagCatalog } from '../hooks/useTagCatalog';

// ----- Chip multi-select con popover ---------------------------------------
function MultiChip({ label, options, selectedValues, onToggle, onClear, searchable }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, searchable, search]);

  const hasSel = selectedValues?.length > 0;
  const summary = hasSel ? `${label} (${selectedValues.length})` : label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
          hasSel
            ? 'bg-rose-50 border-rose-400 text-rose-700 hover:border-rose-500'
            : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
        }`}
      >
        {summary}
        <span className="ml-1.5 opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-stone-300 shadow-lg z-50 min-w-[240px] max-w-[320px] max-h-[60vh] flex flex-col">
          {searchable && (
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="px-2.5 py-2 border-b border-stone-200 text-xs font-mono focus:outline-none"
            />
          )}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-3 text-stone-400 text-xs italic">Sin resultados</div>
            )}
            {filteredOptions.map(opt => {
              const checked = selectedValues?.includes(opt.value) || false;
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-stone-50 cursor-pointer text-xs font-mono"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt.value)}
                    className="accent-rose-500 cursor-pointer"
                  />
                  <span className="flex-1 text-stone-800 truncate" title={opt.label}>{opt.label}</span>
                  <span className="text-stone-400 text-[11px] tabular-nums">{opt.count}</span>
                </label>
              );
            })}
          </div>
          {hasSel && (
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className="px-3 py-2 text-xs font-mono text-rose-500 hover:bg-rose-50 border-t border-stone-200 text-left"
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ----- Chip single-select (para verificación) ------------------------------
function SingleChip({ label, options, selectedValue, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const sel = selectedValue
    ? options.find(o => o.value === selectedValue)
    : null;
  const summary = sel ? `${label}: ${sel.label}` : label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
          sel
            ? 'bg-rose-50 border-rose-400 text-rose-700 hover:border-rose-500'
            : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
        }`}
      >
        {summary}
        <span className="ml-1.5 opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-stone-300 shadow-lg z-50 min-w-[200px]">
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-stone-50 ${!sel ? 'text-rose-600' : 'text-stone-700'}`}
          >
            Todos
          </button>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-stone-50 flex items-center justify-between gap-2 ${
                selectedValue === opt.value ? 'bg-rose-50 text-rose-700' : 'text-stone-700'
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-stone-400 text-[11px] tabular-nums">{opt.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Chip toggle simple (un valor on/off, con contador visible) ----------
function ToggleChip({ label, count, active, onToggle, activeClass }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
        active
          ? (activeClass || 'bg-rose-50 border-rose-400 text-rose-700 hover:border-rose-500')
          : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
      }`}
    >
      {label} <span className="ml-1 tabular-nums opacity-70">({count})</span>
    </button>
  );
}

// ----- FilterBar principal -------------------------------------------------
// ----- Chip de rango de fechas (desde / hasta) -----------------------------
function DateRangeChip({ label, fromValue, toValue, onFrom, onTo, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const hasSel = Boolean(fromValue || toValue);
  const summary = hasSel ? `${label}: ${fromValue || '...'} a ${toValue || '...'}` : label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
          hasSel
            ? 'bg-rose-50 border-rose-400 text-rose-700 hover:border-rose-500'
            : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
        }`}
      >
        {summary}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-stone-300 shadow-lg z-50 min-w-[220px] p-3 flex flex-col gap-2">
          <label className="text-[11px] font-mono text-stone-500 flex flex-col gap-1">
            Desde
            <input
              type="date"
              value={fromValue || ''}
              onChange={(e) => onFrom(e.target.value)}
              className="border border-stone-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-rose-500"
            />
          </label>
          <label className="text-[11px] font-mono text-stone-500 flex flex-col gap-1">
            Hasta
            <input
              type="date"
              value={toValue || ''}
              onChange={(e) => onTo(e.target.value)}
              className="border border-stone-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-rose-500"
            />
          </label>
          {hasSel && (
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className="text-xs font-mono text-rose-500 hover:bg-rose-50 border-t border-stone-200 pt-2 text-left"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  posts,
  filters,
  setFilters,
  toggleArrayValue,
  setVerified,
  clearDim,
  clearAll,
  isEmpty,
  stageDefs,
  userNames = {},
  mode = 'map',           // 'map' | 'list-detalle' | 'list-pipeline'
  showVerified = true,    // true por default; el caller del mapa puede ponerlo en false
  showCapturador = true,
  showTags = true,
  showMaint = true,       // chips de mantenimiento E4 (faltan cámaras / falta silicón)
  incidents = [],         // para calcular tipos de incidencia
  measureMode = false,
  setMeasureMode,
  unidadesTerritoriales = [],
}) {
  const { catalog: tagCatalog } = useTagCatalog();
  const counts = useMemo(
    () => computeCounts(posts, filters, stageDefs, mode, incidents),
    [posts, filters, stageDefs, mode, incidents]
  );

  const stageOptions = useMemo(() => ([
    ...stageDefs.map(s => ({
      value: s.id,
      label: `E${s.num} · ${s.short}`,
      count: counts.stages[s.id] || 0,
    })),
    { value: 'completado', label: '✓ Completado', count: counts.stages.completado || 0 },
    { value: 'bloqueado', label: '⚠ Bloqueado', count: counts.stages.bloqueado || 0 },
  ]), [stageDefs, counts]);

  // Map id de UT -> nombre de la colonia (para mostrar 'ID - Nombre' en filtros)
  const utNombreMap = useMemo(() => {
    const m = new Map();
    for (const u of (unidadesTerritoriales || [])) {
      if (u?.id) m.set(u.id, u.nombre || '');
    }
    return m;
  }, [unidadesTerritoriales]);

  const utOptions = useMemo(() => {
    const utList = [...new Set(posts.map(p => p.unidad_territorial).filter(Boolean))].sort();
    return utList.map(ut => {
      const nombre = utNombreMap.get(ut);
      return {
        value: ut,
        label: nombre ? `${ut} - ${nombre}` : ut,
        count: counts.uts[ut] || 0,
      };
    });
  }, [posts, counts, utNombreMap]);

  const capturadorOptions = useMemo(() => {
    const ids = new Set();
    posts.forEach(p => stageDefs.forEach(s => {
      const id = p.stages?.[s.id]?.capturedBy;
      if (id) ids.add(id);
    }));
    return [...ids]
      .map(id => ({
        value: id,
        label: userNames[id] || `${id.slice(0, 8)}…`,
        count: counts.capturadores[id] || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [posts, stageDefs, counts, userNames]);

  const verifiedOptions = useMemo(() => ([
    { value: 'verificado',    label: '✓ Verificado',    count: counts.verified.verificado    || 0 },
    { value: 'parcial',       label: '◐ Parcial',       count: counts.verified.parcial       || 0 },
    { value: 'sin_verificar', label: '⏳ Sin verificar', count: counts.verified.sin_verificar || 0 },
  ]), [counts]);

  // Tags: un MultiChip por cada categoría con tags activos
  const tagCategoriesWithOptions = useMemo(() => {
    if (!tagCatalog?.categorias?.length) return [];
    return tagCatalog.categorias.map(cat => {
      const catTags = tagCatalog.tags.filter(t => t.categoriaId === cat.id && t.activo !== false);
      if (!catTags.length) return null;
      const options = catTags.map(t => ({
        value: t.id,
        label: t.label,
        count: counts.tags?.[t.id] || 0,
      }));
      const tagIdsInCat = new Set(catTags.map(t => t.id));
      const selectedInCat = (filters.tags || []).filter(tid => tagIdsInCat.has(tid));
      return { cat, options, selectedInCat, tagIdsInCat };
    }).filter(Boolean);
  }, [tagCatalog, counts, filters.tags]);

  const clearTagsInCategory = (tagIdsInCat) => {
    if (!setFilters) return;
    setFilters(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tid => !tagIdsInCat.has(tid)),
    }));
  };

  const toggleMaint = (val) => {
    if (!setFilters) return;
    setFilters(prev => ({ ...prev, maint: prev.maint === val ? null : val }));
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <MultiChip
        label="Etapa"
        options={stageOptions}
        selectedValues={filters.stages}
        onToggle={(v) => toggleArrayValue('stages', v)}
        onClear={() => clearDim('stages')}
      />

      {showMaint && (
        <>
          <ToggleChip
            label="🎥 Faltan cámaras"
            count={counts.maint?.falta_camaras || 0}
            active={filters.maint === 'falta_camaras'}
            onToggle={() => toggleMaint('falta_camaras')}
            activeClass="bg-amber-50 border-amber-400 text-amber-700 hover:border-amber-500"
          />
          <ToggleChip
            label="🔵 Falta silicón"
            count={counts.maint?.falta_silicon || 0}
            active={filters.maint === 'falta_silicon'}
            onToggle={() => toggleMaint('falta_silicon')}
            activeClass="bg-sky-50 border-sky-400 text-sky-700 hover:border-sky-500"
          />
          <ToggleChip
            label="📏 Postes 13m"
            count={counts.maint?.poste_13m || 0}
            active={filters.maint === 'poste_13m'}
            onToggle={() => toggleMaint('poste_13m')}
            activeClass="bg-violet-50 border-violet-400 text-violet-700 hover:border-violet-500"
          />
          <ToggleChip
            label="📍 Reubicados"
            count={counts.maint?.reubicados || 0}
            active={filters.maint === 'reubicados'}
            onToggle={() => toggleMaint('reubicados')}
            activeClass="bg-purple-50 border-purple-400 text-purple-700 hover:border-purple-500"
          />
          {/* PASO_13_REVISADOS: chips para filtrar postes revisados / no revisados */}
          <ToggleChip
            label="✓ Revisados"
            count={counts.maint?.revisados || 0}
            active={filters.maint === 'revisados'}
            onToggle={() => toggleMaint('revisados')}
            activeClass="bg-emerald-50 border-emerald-400 text-emerald-700 hover:border-emerald-500"
          />
          <ToggleChip
            label="◯ No revisados"
            count={counts.maint?.no_revisados || 0}
            active={filters.maint === 'no_revisados'}
            onToggle={() => toggleMaint('no_revisados')}
            activeClass="bg-stone-100 border-stone-400 text-stone-700 hover:border-stone-500"
          />
          <ToggleChip
            label="🆘 Botón de pánico"
            count={counts.maint?.boton_panico || 0}
            active={filters.maint === 'boton_panico'}
            onToggle={() => toggleMaint('boton_panico')}
            activeClass="bg-red-50 border-red-400 text-red-700 hover:border-red-500"
          />
        </>
      )}

      {/* Filtro por tipo de incidencia abierta */}
      {incidents.length > 0 && Object.keys(counts.incType || {}).length > 0 && (
        <select
          value={filters.incType || ''}
          onChange={e => setFilters(prev => ({ ...prev, incType: e.target.value || null }))}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
            filters.incType
              ? 'bg-rose-50 border-rose-400 text-rose-700'
              : 'bg-stone-50 border-stone-300 text-stone-700'
          }`}
        >
          <option value="">Tipo incidencia</option>
          {Object.entries(counts.incType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <option key={type} value={type}>{type} ({count})</option>
            ))}
        </select>
      )}

      <MultiChip
        label="UT"
        options={utOptions}
        selectedValues={filters.uts}
        onToggle={(v) => toggleArrayValue('uts', v)}
        onClear={() => clearDim('uts')}
        searchable
      />

      {setMeasureMode && (
        <button
          type="button"
          onClick={() => setMeasureMode(m => !m)}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
            measureMode
              ? 'bg-amber-100 border-amber-500 text-amber-800 hover:border-amber-600'
              : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
          }`}
        >
          📏 {measureMode ? 'Medir (ON)' : 'Medir'}
        </button>
      )}

      {showCapturador && capturadorOptions.length > 0 && (
        <MultiChip
          label="Capturador"
          options={capturadorOptions}
          selectedValues={filters.capturadores}
          onToggle={(v) => toggleArrayValue('capturadores', v)}
          onClear={() => clearDim('capturadores')}
          searchable
        />
      )}

      {showVerified && (
        <SingleChip
          label="Verificación"
          options={verifiedOptions}
          selectedValue={filters.verified}
          onSelect={setVerified}
        />
      )}

      {showTags && tagCategoriesWithOptions.map(({ cat, options, selectedInCat, tagIdsInCat }) => (
        <MultiChip
          key={cat.id}
          label={cat.nombre}
          options={options}
          selectedValues={selectedInCat}
          onToggle={(v) => toggleArrayValue('tags', v)}
          onClear={() => clearTagsInCategory(tagIdsInCat)}
        />
      ))}

      <DateRangeChip
        label="Creado"
        fromValue={filters.createdFrom}
        toValue={filters.createdTo}
        onFrom={(v) => setFilters(prev => ({ ...prev, createdFrom: v || null }))}
        onTo={(v) => setFilters(prev => ({ ...prev, createdTo: v || null }))}
        onClear={() => setFilters(prev => ({ ...prev, createdFrom: null, createdTo: null }))}
      />

      <DateRangeChip
        label="Modificado"
        fromValue={filters.modFrom}
        toValue={filters.modTo}
        onFrom={(v) => setFilters(prev => ({ ...prev, modFrom: v || null }))}
        onTo={(v) => setFilters(prev => ({ ...prev, modTo: v || null }))}
        onClear={() => setFilters(prev => ({ ...prev, modFrom: null, modTo: null }))}
      />

      {!isEmpty && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-mono text-stone-500 hover:text-rose-500 underline ml-1"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
