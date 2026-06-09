import React, { useState } from 'react';

/**
 * Panel de revision por Unidad Territorial.
 * Muestra comparacion entre postes capturados en sistema vs Meta del Excel.
 *
 * Props:
 *  - ut: { id, nombre, liberados, porLiberarPorUt, volumenContratado }
 *  - posts: array de postes filtrados a la UT
 *  - onClose: () => void
 *  - onPostClick: (post) => void
 *  - onChangeEstado: async (postId, nuevoEstado) => void
 */
export default function UtReviewPanel({ ut, posts, onClose, onPostClick, onChangeEstado, onIrAlPunto }) {
  const [savingId, setSavingId] = useState(null);

  if (!ut) return null;

  const total = posts.length;
  const verificados = posts.filter(p => p.estado_verificacion === 'verificado').length;
  const noExiste = posts.filter(p => p.estado_verificacion === 'no_existe').length;
  const noDefinido = total - verificados - noExiste;

  // Comparacion con Excel
  const meta = ut.liberados;
  const porLiberar = ut.porLiberarPorUt;
  const haveExcelData = typeof meta === 'number';

  let badgeText = 'Sin info';
  let badgeBg = 'bg-stone-100 text-stone-600 border-stone-300';
  let barColor = 'bg-stone-300';
  let progressPct = 0;

  if (haveExcelData) {
    if (total === meta) {
      badgeText = 'Cuadra';
      badgeBg = 'bg-emerald-100 text-emerald-700 border-emerald-400';
      barColor = 'bg-gradient-to-r from-emerald-500 to-emerald-400';
      progressPct = 100;
    } else if (total < meta) {
      const faltan = meta - total;
      badgeText = 'Faltan ' + faltan;
      badgeBg = 'bg-yellow-100 text-yellow-700 border-yellow-400';
      barColor = 'bg-gradient-to-r from-yellow-500 to-yellow-400';
      progressPct = meta > 0 ? Math.round((total / meta) * 100) : 0;
    } else {
      const sobran = total - meta;
      badgeText = 'Sobran ' + sobran;
      badgeBg = 'bg-red-100 text-red-700 border-red-400';
      barColor = 'bg-gradient-to-r from-red-500 to-red-400';
      progressPct = 100;
    }
  }

  const handleChange = async (post, nuevoEstado) => {
    if (!onChangeEstado) return;
    if (post.estado_verificacion === nuevoEstado) return;
    setSavingId(post.id);
    try {
      await onChangeEstado(post.id, nuevoEstado);
    } finally {
      setSavingId(null);
    }
  };

  const renderEstadoBtn = (post, valor, label, activeStyle) => {
    const isActive = (post.estado_verificacion || 'no_definido') === valor;
    const baseStyle = 'px-2 py-0.5 rounded border text-xs font-medium transition-colors';
    const inactiveStyle = 'bg-white text-stone-500 border-stone-300 hover:bg-stone-100';
    const isSaving = savingId === post.id;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleChange(post, valor);
        }}
        disabled={isSaving}
        className={`${baseStyle} ${isActive ? activeStyle : inactiveStyle} ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="fixed top-24 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[480px] max-w-[92vw] flex flex-col"
      style={{ maxHeight: "calc(100vh - 140px)" }}
    >
      {/* HEADER */}
      <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-rose-600 font-mono font-bold text-base">{ut.id}</span>
              <span className="text-stone-400 text-xs">UT</span>
            </div>
            <div className="text-stone-800 text-sm mt-0.5 truncate" title={ut.nombre}>{ut.nombre}</div>
          </div>
          <div className="flex items-start gap-1.5 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded border font-semibold whitespace-nowrap ${badgeBg}`}>
              {badgeText}
            </span>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Barra de progreso */}
        {haveExcelData && (
          <div>
            <div className="relative h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full ${barColor} transition-all duration-500 rounded-full`}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-stone-600 mt-1">
              <span>
                <strong className="text-stone-800">{total}</strong> en sistema {' '}
                <span className="text-stone-400">·</span> {' '}
                Meta: <strong className="text-stone-800">{meta}</strong>
              </span>
              <span>
                Por liberar: <strong className="text-stone-800">{porLiberar}</strong>
              </span>
            </div>
          </div>
        )}

        {!haveExcelData && (
          <div className="text-xs text-stone-500 italic">
            {total} postes en sistema. Esta UT no esta en el Excel de contrato.
          </div>
        )}

        {/* Stats de estados */}
        <div className="text-xs flex flex-wrap gap-x-3 border-t border-stone-100 pt-1.5">
          <span className="text-emerald-600 font-medium">{verificados} verif.</span>
          <span className="text-red-600 font-medium">{noExiste} no exist.</span>
          <span className="text-stone-500 font-medium">{noDefinido} pend.</span>
        </div>
      </div>

      {/* LISTADO */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {total === 0 ? (
          <div className="text-center py-6 text-stone-400 text-sm">
            Sin postes en esta UT
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {posts.map(post => {
              const stagesDone = post.stages
                ? Object.values(post.stages).filter(s => s && s.done).length
                : 0;

              return (
                <li key={post.id} className="p-2 hover:bg-stone-50">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div
                        onClick={() => onPostClick && onPostClick(post)}
                        className="font-mono text-sm text-rose-600 font-medium cursor-pointer hover:underline"
                      >
                        {post.id}
                      </div>
                      {post.alias && (
                        <div className="text-xs text-stone-500 truncate">"{post.alias}"</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <div className="text-[10px] text-stone-400 uppercase tracking-wide">Etapa</div>
                      <div className="text-xs text-stone-700 font-mono font-semibold">{stagesDone}/7</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {renderEstadoBtn(post, 'verificado', 'Verif.', 'bg-emerald-100 text-emerald-700 border-emerald-400')}
                    {renderEstadoBtn(post, 'no_definido', 'Pend.', 'bg-stone-200 text-stone-700 border-stone-400')}
                    {renderEstadoBtn(post, 'no_existe', 'No exist.', 'bg-red-100 text-red-700 border-red-400')}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onIrAlPunto) onIrAlPunto(post);
                      }}
                      className="ml-auto px-2 py-0.5 rounded border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 text-xs font-medium transition-colors flex items-center gap-1"
                      title="Ir al punto en el mapa"
                    >
                      <span>Ir al punto</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}