// ============================================================================
// FilterBar.jsx — Barra superior compacta con chips multi-select y contadores
// ----------------------------------------------------------------------------
// Cada chip abre un popover con checkboxes. Los contadores reflejan
// "cuántos postes habría si solo esta opción estuviera marcada en esta
// dimensión, manteniendo activos los filtros de las otras dimensiones".
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SlidersHorizontal, ChevronDown,
  ListChecks, Wrench, MapPin, AlertTriangle, Tags, History, FileText,
} from 'lucide-react';
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
            ? 'bg-brand-50 border-brand-400 text-brand-700 hover:border-brand-500'
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
                    className="accent-brand-500 cursor-pointer"
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
              className="px-3 py-2 text-xs font-mono text-brand-500 hover:bg-brand-50 border-t border-stone-200 text-left"
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
            ? 'bg-brand-50 border-brand-400 text-brand-700 hover:border-brand-500'
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
            className={`w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-stone-50 ${!sel ? 'text-brand-600' : 'text-stone-700'}`}
          >
            Todos
          </button>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs font-mono hover:bg-stone-50 flex items-center justify-between gap-2 ${
                selectedValue === opt.value ? 'bg-brand-50 text-brand-700' : 'text-stone-700'
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
          ? (activeClass || 'bg-brand-50 border-brand-400 text-brand-700 hover:border-brand-500')
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
            ? 'bg-brand-50 border-brand-400 text-brand-700 hover:border-brand-500'
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
              className="border border-stone-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-brand-500"
            />
          </label>
          <label className="text-[11px] font-mono text-stone-500 flex flex-col gap-1">
            Hasta
            <input
              type="date"
              value={toValue || ''}
              onChange={(e) => onTo(e.target.value)}
              className="border border-stone-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-brand-500"
            />
          </label>
          {hasSel && (
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className="text-xs font-mono text-brand-500 hover:bg-brand-50 border-t border-stone-200 pt-2 text-left"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MODO MENÚ — un solo Dropdown Button con secciones agrupadas e iconos
// ----------------------------------------------------------------------------
// Las piezas siguientes renderizan los mismos filtros del modo "chips" pero
// en línea (sin popovers anidados) dentro de un menú de acciones agrupadas.
// ============================================================================

// ----- Lista de checkboxes en línea (multi-select) -------------------------
function CheckList({ options, selectedValues = [], onToggle, onClear, searchable, emptyLabel = 'Sin opciones' }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!searchable || !search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, searchable, search]);
  const hasSel = selectedValues.length > 0;

  return (
    <div className="flex flex-col">
      {searchable && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="mb-1 px-2 py-1.5 border border-stone-200 text-xs font-mono focus:outline-none focus:border-brand-500"
        />
      )}
      <div className="max-h-44 overflow-y-auto -mx-1">
        {filtered.length === 0 && (
          <div className="px-2 py-2 text-stone-400 text-xs italic">{emptyLabel}</div>
        )}
        {filtered.map(opt => {
          const checked = selectedValues.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1 hover:bg-stone-50 cursor-pointer text-xs font-mono rounded"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.value)}
                className="accent-brand-500 cursor-pointer"
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
          onClick={onClear}
          className="mt-1 self-start text-[11px] font-mono text-brand-500 hover:underline"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

// ----- Lista de opciones single-select en línea (verificación) -------------
function RadioList({ options, selectedValue, onSelect }) {
  return (
    <div className="flex flex-col -mx-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`text-left px-2 py-1 text-xs font-mono rounded hover:bg-stone-50 ${!selectedValue ? 'text-brand-600' : 'text-stone-700'}`}
      >
        Todos
      </button>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`text-left px-2 py-1 text-xs font-mono rounded hover:bg-stone-50 flex items-center justify-between gap-2 ${
            selectedValue === opt.value ? 'bg-brand-50 text-brand-700' : 'text-stone-700'
          }`}
        >
          <span>{opt.label}</span>
          <span className="text-stone-400 text-[11px] tabular-nums">{opt.count}</span>
        </button>
      ))}
    </div>
  );
}

// ----- Rango de fechas en línea (sin popover) ------------------------------
function DateRangeInline({ label, fromValue, toValue, onFrom, onTo, onClear }) {
  const hasSel = Boolean(fromValue || toValue);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wide text-stone-400">{label}</span>
        {hasSel && (
          <button type="button" onClick={onClear} className="text-[10px] font-mono text-brand-500 hover:underline">
            Limpiar
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={fromValue || ''}
          onChange={e => onFrom(e.target.value)}
          className="flex-1 min-w-0 border border-stone-300 rounded px-1.5 py-1 text-[11px] font-mono focus:outline-none focus:border-brand-500"
        />
        <span className="text-stone-400 text-[11px]">→</span>
        <input
          type="date"
          value={toValue || ''}
          onChange={e => onTo(e.target.value)}
          className="flex-1 min-w-0 border border-stone-300 rounded px-1.5 py-1 text-[11px] font-mono focus:outline-none focus:border-brand-500"
        />
      </div>
    </div>
  );
}

// ----- Sección colapsable del menú (header con icono + contador) -----------
// Cuando la sección está abierta se resalta con la paleta brand (fondo + barra
// lateral) para diferenciarla de las secciones cerradas (neutras stone).
function MenuSection({ icon: Icon, title, count = 0, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-l-2 ${
          open
            ? 'bg-red-50 border-red-500 hover:bg-red-100'
            : 'border-transparent hover:bg-stone-50'
        }`}
      >
        {Icon && <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${open ? 'text-red-600' : 'text-stone-500'}`} strokeWidth={1.5} />}
        <span className={`flex-1 text-xs font-mono font-medium uppercase tracking-wide ${open ? 'text-red-700' : 'text-stone-700'}`}>{title}</span>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold tabular-nums">
            {count}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180 text-red-600' : 'text-stone-400'}`} strokeWidth={1.5} />
      </button>
      {open && <div className="px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}

// ----- Dropdown Button: contiene las secciones agrupadas -------------------
function FilterMenuButton({ activeCount, isEmpty, clearAll, align = 'right', children }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  // El panel se renderiza en un portal con position:fixed para que no lo
  // recorte ningún contenedor con overflow (p.ej. la tabla de Postes, que
  // tiene overflow-y-auto y cortaba el menú cuando había pocos resultados).
  const [pos, setPos] = useState(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.bottom + 4;
    setPos({
      top,
      left: align === 'left' ? r.left : null,
      right: align === 'left' ? null : Math.max(8, window.innerWidth - r.right),
      maxHeight: Math.min(window.innerHeight * 0.7, window.innerHeight - top - 8),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (open) updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onReflow = () => updatePos();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true); // capture: reubica al hacer scroll en cualquier ancestro
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updatePos]);

  return (
    <div className="relative h-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`h-full px-3 py-1.5 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
          activeCount > 0
            ? 'bg-brand-50 border-brand-400 text-brand-700 hover:border-brand-500'
            : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
        Filtros
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left ?? undefined,
            right: pos.right ?? undefined,
            maxHeight: pos.maxHeight,
          }}
          className="bg-white border border-stone-300 shadow-lg z-[60] w-[320px] flex flex-col"
        >
          <div className="flex-1 overflow-y-auto">{children}</div>
          {!isEmpty && (
            <button
              type="button"
              onClick={clearAll}
              className="shrink-0 px-3 py-2 text-xs font-mono text-brand-500 hover:bg-brand-50 border-t border-stone-200 text-left"
            >
              Limpiar todo
            </button>
          )}
        </div>,
        document.body
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
  layout = 'chips',       // 'chips' (fila clásica) | 'menu' (un dropdown) | 'sections' (solo secciones, para sheet móvil)
  menuAlign = 'right',    // 'right' | 'left' — lado hacia el que abre el popover del modo 'menu'
  showVerified = true,    // true por default; el caller del mapa puede ponerlo en false
  showCapturador = true,
  showTags = true,
  showMaint = true,       // chips de mantenimiento E4 (faltan cámaras / falta silicón)
  incidents = [],         // para calcular tipos de incidencia
  measureMode = false,
  setMeasureMode,
  unidadesTerritoriales = [],
  isAdmin = false,
  solo0037 = false,
  setSolo0037,
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

  // --------------------------------------------------------------------------
  // MODO MENÚ / SECCIONES — un solo Dropdown Button con grupos conceptuales
  // --------------------------------------------------------------------------
  if (layout === 'menu' || layout === 'sections') {
    // Mantenimiento (dimensión `maint`, valor único) repartido en sub-bloques
    // conceptuales. Conserva etiqueta, contador y color de cada toggle.
    const maintGroups = [
      {
        label: 'Equipamiento',
        items: [
          { val: 'falta_camaras',     label: '🎥 Faltan cámaras',    activeClass: 'bg-amber-50 border-amber-400 text-amber-700 hover:border-amber-500' },
          { val: 'con_modem',         label: '📡 Con módem',         activeClass: 'bg-sky-50 border-sky-400 text-sky-700 hover:border-sky-500' },
          { val: 'sin_modem',         label: '🚫 Sin módem',         activeClass: 'bg-orange-50 border-orange-400 text-orange-700 hover:border-orange-500' },
          { val: 'antena_recuperada', label: '🛰️ Antena recuperada', activeClass: 'bg-teal-50 border-teal-400 text-teal-700 hover:border-teal-500' },
          { val: 'boton_panico',      label: '🆘 Botón de pánico',   activeClass: 'bg-red-50 border-red-400 text-red-700 hover:border-red-500' },
          { val: 'internet_futuro',   label: '📡 Internet futuro',   activeClass: 'bg-blue-50 border-blue-400 text-blue-700 hover:border-blue-500' },
        ],
      },
      {
        label: 'Instalación física',
        items: [
          { val: 'poste_13m',     label: '📏 Postes 13m',  activeClass: 'bg-violet-50 border-violet-400 text-violet-700 hover:border-violet-500' },
          { val: 'falta_silicon', label: '🔵 Falta silicón', activeClass: 'bg-sky-50 border-sky-400 text-sky-700 hover:border-sky-500' },
        ],
      },
      {
        label: 'Operación y revisión',
        items: [
          { val: 'revisados',    label: '✓ Revisados',    activeClass: 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:border-emerald-500' },
          { val: 'no_revisados', label: '◯ No revisados', activeClass: 'bg-stone-100 border-stone-400 text-stone-700 hover:border-stone-500' },
          { val: 'reubicados',   label: '📍 Reubicados',  activeClass: 'bg-purple-50 border-purple-400 text-purple-700 hover:border-purple-500' },
        ],
      },
    ];

    // Contadores de filtros activos por grupo (para los badges de sección)
    const cntProgreso     = (filters.stages?.length || 0) + (showVerified && filters.verified ? 1 : 0);
    const cntCondicion    = filters.maint ? 1 : 0;
    const cntTerritorio   = filters.uts?.length || 0;
    const cntIncidencias  = filters.incType ? 1 : 0;
    const cntClasificacion = filters.tags?.length || 0;
    const cntTrazabilidad = (filters.capturadores?.length || 0)
      + (filters.createdFrom || filters.createdTo ? 1 : 0)
      + (filters.modFrom || filters.modTo ? 1 : 0);
    const activeCount = cntProgreso + cntCondicion + cntTerritorio + cntIncidencias + cntClasificacion + cntTrazabilidad;

    const showIncidencias = incidents.length > 0 && Object.keys(counts.incType || {}).length > 0;

    const sections = (
      <>
        {/* Grupo: Progreso — etapa en el pipeline de captura */}
        <MenuSection icon={ListChecks} title="Etapas" count={cntProgreso} defaultOpen={cntProgreso > 0}>
          <CheckList
            options={stageOptions}
            selectedValues={filters.stages}
            onToggle={(v) => toggleArrayValue('stages', v)}
            onClear={() => clearDim('stages')}
          />
          {showVerified && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <div className="text-[10px] font-mono uppercase tracking-wide text-stone-400 mb-1">Verificación</div>
              <RadioList options={verifiedOptions} selectedValue={filters.verified} onSelect={setVerified} />
            </div>
          )}
        </MenuSection>

        {/* Grupo: Condición del poste — dimensión de mantenimiento */}
        {showMaint && (
          <MenuSection icon={Wrench} title="Condición del poste" count={cntCondicion} defaultOpen={cntCondicion > 0}>
            <div className="flex flex-col gap-2.5">
              {maintGroups.map(grp => (
                <div key={grp.label}>
                  <div className="text-[10px] font-mono uppercase tracking-wide text-stone-400 mb-1">{grp.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {grp.items.map(it => (
                      <ToggleChip
                        key={it.val}
                        label={it.label}
                        count={counts.maint?.[it.val] || 0}
                        active={filters.maint === it.val}
                        onToggle={() => toggleMaint(it.val)}
                        activeClass={it.activeClass}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </MenuSection>
        )}

        {/* Grupo: Territorio — unidad territorial / colonia */}
        <MenuSection icon={MapPin} title="Unidad Territorial" count={cntTerritorio} defaultOpen={cntTerritorio > 0}>
          <CheckList
            options={utOptions}
            selectedValues={filters.uts}
            onToggle={(v) => toggleArrayValue('uts', v)}
            onClear={() => clearDim('uts')}
            searchable
            emptyLabel="Sin unidades territoriales"
          />
        </MenuSection>
        {/* Grupo: Incidencias â€” tipo de incidencia abierta */}
        {showIncidencias && (
          <MenuSection icon={AlertTriangle} title="Incidencias" count={cntIncidencias} defaultOpen={cntIncidencias > 0}>
            <select
              value={filters.incType || ''}
              onChange={e => setFilters(prev => ({ ...prev, incType: e.target.value || null }))}
              className={`w-full px-2 py-1.5 text-xs font-mono border transition-colors ${
                filters.incType
                  ? 'bg-brand-50 border-brand-400 text-brand-700'
                  : 'bg-stone-50 border-stone-300 text-stone-700'
              }`}
            >
              <option value="">Todas las incidencias</option>
              {Object.entries(counts.incType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <option key={type} value={type}>{type} ({count})</option>
                ))}
            </select>
          </MenuSection>
        )}

        {/* Grupo: Clasificación — etiquetas por categoría */}
        {showTags && tagCategoriesWithOptions.length > 0 && (
          <MenuSection icon={Tags} title="Clasificación" count={cntClasificacion} defaultOpen={cntClasificacion > 0}>
            <div className="flex flex-col gap-2.5">
              {tagCategoriesWithOptions.map(({ cat, options, selectedInCat, tagIdsInCat }) => (
                <div key={cat.id}>
                  <div className="text-[10px] font-mono uppercase tracking-wide text-stone-400 mb-1">{cat.nombre}</div>
                  <CheckList
                    options={options}
                    selectedValues={selectedInCat}
                    onToggle={(v) => toggleArrayValue('tags', v)}
                    onClear={() => clearTagsInCategory(tagIdsInCat)}
                  />
                </div>
              ))}
            </div>
          </MenuSection>
        )}

        {/* Grupo: Trazabilidad — autoría y fechas */}
        <MenuSection icon={History} title="Trazabilidad" count={cntTrazabilidad} defaultOpen={cntTrazabilidad > 0}>
          <div className="flex flex-col gap-3">
            {showCapturador && capturadorOptions.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wide text-stone-400 mb-1">Capturador</div>
                <CheckList
                  options={capturadorOptions}
                  selectedValues={filters.capturadores}
                  onToggle={(v) => toggleArrayValue('capturadores', v)}
                  onClear={() => clearDim('capturadores')}
                  searchable
                  emptyLabel="Sin capturadores"
                />
              </div>
            )}
            <DateRangeInline
              label="Creado"
              fromValue={filters.createdFrom}
              toValue={filters.createdTo}
              onFrom={(v) => setFilters(prev => ({ ...prev, createdFrom: v || null }))}
              onTo={(v) => setFilters(prev => ({ ...prev, createdTo: v || null }))}
              onClear={() => setFilters(prev => ({ ...prev, createdFrom: null, createdTo: null }))}
            />
            <DateRangeInline
              label="Modificado"
              fromValue={filters.modFrom}
              toValue={filters.modTo}
              onFrom={(v) => setFilters(prev => ({ ...prev, modFrom: v || null }))}
              onTo={(v) => setFilters(prev => ({ ...prev, modTo: v || null }))}
              onClear={() => setFilters(prev => ({ ...prev, modFrom: null, modTo: null }))}
            />
          </div>
        </MenuSection>
      </>
    );

    // 'sections' → solo el contenido (para el bottom sheet móvil)
    if (layout === 'sections') {
      return (
        <div className="border border-stone-200 rounded overflow-hidden bg-white">
          {sections}
          {!isEmpty && (
            <button
              type="button"
              onClick={clearAll}
              className="w-full px-3 py-2 text-xs font-mono text-brand-500 hover:bg-brand-50 border-t border-stone-200 text-left"
            >
              Limpiar todo
            </button>
          )}
        </div>
      );
    }

    // 'menu' → un solo Dropdown Button (desktop)
    return (
      <FilterMenuButton activeCount={activeCount} isEmpty={isEmpty} clearAll={clearAll} align={menuAlign}>
        {sections}
      </FilterMenuButton>
    );
  }

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
          <ToggleChip
            label="📡 Con módem"
            count={counts.maint?.con_modem || 0}
            active={filters.maint === 'con_modem'}
            onToggle={() => toggleMaint('con_modem')}
            activeClass="bg-sky-50 border-sky-400 text-sky-700 hover:border-sky-500"
          />
          <ToggleChip
            label="🚫 Sin módem"
            count={counts.maint?.sin_modem || 0}
            active={filters.maint === 'sin_modem'}
            onToggle={() => toggleMaint('sin_modem')}
            activeClass="bg-orange-50 border-orange-400 text-orange-700 hover:border-orange-500"
          />
          <ToggleChip
            label="🛰️ Antena recuperada"
            count={counts.maint?.antena_recuperada || 0}
            active={filters.maint === 'antena_recuperada'}
            onToggle={() => toggleMaint('antena_recuperada')}
            activeClass="bg-teal-50 border-teal-400 text-teal-700 hover:border-teal-500"
          />
          <ToggleChip
            label="📡 Internet futuro"
            count={counts.maint?.internet_futuro || 0}
            active={filters.maint === 'internet_futuro'}
            onToggle={() => toggleMaint('internet_futuro')}
            activeClass="bg-blue-50 border-blue-400 text-blue-700 hover:border-blue-500"
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
              ? 'bg-brand-50 border-brand-400 text-brand-700'
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
          className="text-xs font-mono text-stone-500 hover:text-brand-500 underline ml-1"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
