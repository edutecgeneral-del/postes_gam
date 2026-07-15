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

// Herramienta "Medir" â€” vive fuera del menÃº de filtros porque no es un filtro.
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
      ðŸ“ {measureMode ? 'Medir (ON)' : 'Medir'}
    </button>
  );
}

export function FilterBarCollapsible(props) {
  const isMobile = useIsMobile();
  const [open0037, setOpen0037] = useState(false);
  const [openEstadoUt, setOpenEstadoUt] = useState(false);
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
        {props.isAdmin && props.setSel0037 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen0037(v => !v)}
              className={`px-3 py-1.5 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                props.sel0037 !== null && props.sel0037 !== undefined
                  ? 'bg-brand-50 border-brand-400 text-brand-700'
                  : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-brand-400'
              }`}
              title="Filtrar postes por UT de una auditorÃ­a"
            >
              AuditorÃ­as{Array.isArray(props.sel0037) && props.sel0037.length > 0 ? ` (${props.sel0037.length})` : ''}
            </button>
            {open0037 && (
              <>
                <div className="fixed inset-0 z-[70]" onClick={() => setOpen0037(false)} />
                <div className="absolute left-0 mt-1 z-[71] w-72 max-h-80 overflow-y-auto bg-white border border-stone-300 shadow-xl rounded">
                  {!props.auditoriaSel ? (
                    <>
                      <div className="px-3 py-2 border-b border-stone-200 sticky top-0 bg-white">
                        <span className="text-xs font-mono font-bold text-stone-700">Elige la auditorÃ­a</span>
                      </div>
                      {(props.contratosUT || []).length === 0 ? (
                        <div className="px-3 py-3 text-xs text-stone-400">Sin auditorÃ­as registradas.</div>
                      ) : (props.contratosUT || []).map(c => (
                        <button key={c.contrato} type="button"
                          onClick={() => { props.setAuditoriaSel(c.contrato); props.setSel0037([]); }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-stone-50 text-xs text-left">
                          <span className="font-mono font-semibold text-stone-700">{c.contrato}</span>
                          <span className="text-stone-400">{c.uts.length} UT</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-200 sticky top-0 bg-white gap-2">
                        <button onClick={() => { props.setAuditoriaSel(null); props.setSel0037(null); }}
                          className="text-[11px] text-stone-500 hover:text-stone-700">â† AuditorÃ­as</button>
                        <span className="text-xs font-mono font-bold text-stone-700">{props.auditoriaSel}</span>
                        <button onClick={() => props.setSel0037([])} className="text-[11px] text-brand-600 hover:underline">Limpiar</button>
                      </div>
                      {((props.contratosUT || []).find(c => c.contrato === props.auditoriaSel)?.uts || []).map(u => {
                        const marcada = Array.isArray(props.sel0037) && props.sel0037.includes(u.clave);
                        return (
                          <label key={u.clave} className="flex items-start gap-2 px-3 py-1.5 hover:bg-stone-50 cursor-pointer text-xs">
                            <input type="checkbox" checked={marcada}
                              onChange={() => props.setSel0037(prev => {
                                const cur = Array.isArray(prev) ? prev : [];
                                return cur.includes(u.clave) ? cur.filter(c => c !== u.clave) : [...cur, u.clave];
                              })}
                              className="mt-0.5 w-3.5 h-3.5 accent-brand-500" />
                            <span className="text-stone-700"><span className="font-mono font-semibold">{u.clave}</span>{u.nombre ? ` â€” ${u.nombre}` : ''}</span>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <FilterBar {...props} layout="menu" />      </div>
    );
  }

  // MÃ³vil: trigger + bottom sheet, con las mismas secciones agrupadas dentro.
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
                {activeCount > 0 && <span className="text-stone-400">Â· {activeCount} activos</span>}
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