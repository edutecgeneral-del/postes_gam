import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FilterBar } from './FilterBar.jsx';
import { useIsMobile } from './MapBottomSheet.jsx';

function countActiveFilters(filters = {}) {
  let n = 0;
  for (const key of ['stages', 'uts', 'capturadores', 'tags']) {
    if (Array.isArray(filters[key]) && filters[key].length > 0) n += filters[key].length;
  }
  for (const key of ['maint', 'incType', 'verified']) {
    if (filters[key]) n += 1;
  }
  if (filters.createdFrom || filters.createdTo) n += 1;
  if (filters.modFrom || filters.modTo) n += 1;
  return n;
}

// Herramienta "Medir" — vive fuera del menú de filtros porque no es un filtro.
function MeasureButton({ measureMode, setMeasureMode }) {
  return (
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
  );
}

export function FilterBarCollapsible(props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(props.filters);
  const { measureMode, setMeasureMode } = props;
  const measureBtn = setMeasureMode
    ? <MeasureButton measureMode={measureMode} setMeasureMode={setMeasureMode} />
    : null;

  // Desktop: herramienta Medir + un solo Dropdown Button con secciones agrupadas.
  if (!isMobile) {
    // El mapa (con herramienta Medir) conserva items-center como siempre;
    // en Postes (sin Medir) usamos items-stretch para igualar alturas de la fila.
    return (
      <div className={`flex gap-2 flex-wrap ${measureBtn ? 'items-center' : 'items-stretch'}`}>
        {measureBtn}
        <FilterBar {...props} layout="menu" />
      </div>
    );
  }

  // Móvil: trigger + bottom sheet, con las mismas secciones agrupadas dentro.
  return (
    <div className="flex items-center gap-2">
      {measureBtn}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`px-3 py-1.5 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
          activeCount > 0
            ? 'bg-brand-50 border-brand-400 text-brand-700'
            : 'bg-stone-50 border-stone-300 text-stone-700'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Filtros
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 max-h-[80vh] flex flex-col bg-stone-50 border-t border-stone-300 rounded-t-2xl shadow-2xl">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
              <span className="font-mono text-sm text-stone-800 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-brand-500" /> Filtros
                {activeCount > 0 && <span className="text-stone-400">· {activeCount} activos</span>}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 -mr-1 flex items-center justify-center text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200"
                aria-label="Cerrar filtros"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
              <FilterBar {...props} layout="sections" />
            </div>
            <div className="shrink-0 p-3 border-t border-stone-200">
              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 rounded-lg bg-brand-500 text-white font-mono text-sm font-bold"
              >
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
