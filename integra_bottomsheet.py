#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, os, datetime

PATH = "src/App.jsx"
if not os.path.exists(PATH):
    print(f"No encuentro {PATH}. Corre desde la raiz del proyecto.")
    sys.exit(1)

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()
orig = src
cambios = []

import_line = "import MapSearchBox from './components/MapSearchBox.jsx';"
new_import = "import { MapBottomSheet, useIsMobile } from './components/MapBottomSheet.jsx';"
if new_import in src:
    cambios.append("import: ya estaba")
elif import_line in src:
    src = src.replace(import_line, import_line + "\n" + new_import, 1)
    cambios.append("import: agregado")
else:
    print("No encontre el import de MapSearchBox. Abortando."); sys.exit(1)

anchor = "  const containerRef = useRef(null);"
mobile_line = "  const isMobile = useIsMobile();"
if mobile_line in src:
    cambios.append("isMobile: ya estaba")
elif anchor in src:
    src = src.replace(anchor, anchor + "\n" + mobile_line, 1)
    cambios.append("isMobile: agregado")
else:
    print("No encontre containerRef. Abortando."); sys.exit(1)

old_block = """      {/* Tarjetas de postes (multi-comparacion) */}
      {cardPosts.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-30 flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-0.5">
          {cardPosts.length > 1 && (
            <div className="flex items-center justify-between bg-stone-800/90 text-stone-100 rounded-md px-3 py-1.5 text-[11px] font-mono shrink-0">
              <span>{cardPosts.length} postes abiertos</span>
              <button onClick={() => setCardPosts([])} className="text-stone-300 hover:text-white underline">cerrar todas</button>
            </div>
          )}
          {cardPosts.map(renderCard)}
        </div>
      )}"""

new_block = """      {/* Tarjetas de postes (multi-comparacion) */}
      {cardPosts.length > 0 && (
        isMobile ? (
          <MapBottomSheet
            count={cardPosts.length}
            onClose={() => setCardPosts([])}
            summary={(() => {
              const p0 = cardPosts[0];
              const cur = p0 ? currentStageOf(p0) : null;
              if (cardPosts.length === 1 && p0) {
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-rose-500 font-mono font-bold text-sm shrink-0">{postDisplayId(p0)}</span>
                    <span className="text-stone-500 font-mono text-[11px] truncate">{p0.unidad_territorial}</span>
                    {cur?.stage && onCapturePost && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCapturePost(p0, cur.stage); setCardPosts([]); }}
                        className="ml-auto shrink-0 px-2.5 py-1 rounded-md bg-rose-500 text-white text-[11px] font-mono font-bold flex items-center gap-1">
                        <Compass className="w-3 h-3" /> Cap E{cur.stage.num}
                      </button>
                    )}
                  </div>
                );
              }
              return <span className="text-stone-700 font-mono text-xs">{cardPosts.length} postes seleccionados</span>;
            })()}
          >
            {cardPosts.map(renderCard)}
          </MapBottomSheet>
        ) : (
          <div className="absolute bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-30 flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-0.5">
            {cardPosts.length > 1 && (
              <div className="flex items-center justify-between bg-stone-800/90 text-stone-100 rounded-md px-3 py-1.5 text-[11px] font-mono shrink-0">
                <span>{cardPosts.length} postes abiertos</span>
                <button onClick={() => setCardPosts([])} className="text-stone-300 hover:text-white underline">cerrar todas</button>
              </div>
            )}
            {cardPosts.map(renderCard)}
          </div>
        )
      )}"""

if "isMobile ? (" in src and "MapBottomSheet" in src:
    cambios.append("bloque: ya estaba")
elif old_block in src:
    src = src.replace(old_block, new_block, 1)
    cambios.append("bloque: reemplazado")
else:
    print("No encontre el bloque de tarjetas exacto. Abortando."); sys.exit(1)

if src == orig:
    print("Nada que cambiar (ya aplicado)."); sys.exit(0)

stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bak = f"{PATH}.bak.preBottomSheet-{stamp}"
with open(bak, "w", encoding="utf-8") as f:
    f.write(orig)
with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print("Backup:", bak)
for c in cambios:
    print(" -", c)
print("Integracion aplicada OK.")
