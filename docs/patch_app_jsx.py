#!/usr/bin/env python3
"""
patch_app_jsx.py — Integra useFilters/FilterBar/filterPosts a App.jsx (CI1215V2).

Hace 12 cambios quirúrgicos:
  A. Imports de los 3 nuevos módulos
  B. MapView: signature `filter` → `filters`
  C. MapView: lógica `filtered` reemplazada por filterPosts()
  D. MapView call site: prop `filter={mapFilter}` → `filters={filters}`
  E. App-level: dos useState → un useFilters() hook
  F. Dashboard onNavigatePostes: setListFilter → filterCtx.setFilters
  G. InformeIncidencias onNavigatePostes: setListFilter → filterCtx.setFilters
  H. Map topbar: 2 selects → <FilterBar mode="map" .../>
  I. PostsList: signature `filter, setFilter` → `filterCtx`
  J. PostsList: filteredStageDef + lógica `filtered` reemplazada
  K. PostsList: 3 selects → <FilterBar mode="list-detalle" .../>
  L. PostsList call site: props actualizados

Uso:
    cd ~/Downloads/field-coord-v2
    python3 patch_app_jsx.py             # parchea src/App.jsx
    python3 patch_app_jsx.py /custom/path  # parchea un archivo específico

Idempotente: si detecta que ya fue aplicado, sale sin hacer nada.
Crea backup automático con timestamp en src/App.jsx.bak.<TS>.
"""

import sys
import datetime
from pathlib import Path

# ============================================================================
# Helpers
# ============================================================================

def replace_once(src: str, label: str, old: str, new: str) -> str:
    """Reemplaza `old` por `new` exactamente una vez en `src`. Falla si no encuentra
    `old` o si lo encuentra >1 vez. Si `new` ya está presente y `old` no, asume
    idempotencia y salta sin tocar."""
    n = src.count(old)
    if n == 0:
        if new in src:
            print(f"  [{label}] ya aplicado, salto.")
            return src
        raise AssertionError(
            f"[{label}] anchor NO encontrado. ¿Versión distinta de App.jsx? "
            f"Anchor empieza con: {old[:80]!r}"
        )
    if n > 1:
        raise AssertionError(
            f"[{label}] anchor ambiguo (aparece {n} veces). Necesita más contexto."
        )
    print(f"  [{label}] aplicado.")
    return src.replace(old, new, 1)


# ============================================================================
# Cambios — cada bloque OLD/NEW es exacto, byte por byte
# ============================================================================

CHANGES = []

# --- A. Imports nuevos -------------------------------------------------------
CHANGES.append(("A imports", """import { setActiveView, setUserContext } from './lib/errorTracker.js';


// ============================================================================
// STAGE DEFINITIONS""", """import { setActiveView, setUserContext } from './lib/errorTracker.js';
import { useFilters } from './hooks/useFilters.js';
import { FilterBar } from './components/FilterBar.jsx';
import { filterPosts } from './lib/filters.js';


// ============================================================================
// STAGE DEFINITIONS"""))

# --- B. MapView signature ----------------------------------------------------
CHANGES.append(("B MapView signature",
    "function MapView({ posts, selectedPost, setSelectedPost, filter, onCapturePost, stageDefs, darkMode }) {",
    "function MapView({ posts, selectedPost, setSelectedPost, filters, onCapturePost, stageDefs, darkMode }) {"
))

# --- C. MapView filtered logic ----------------------------------------------
CHANGES.append(("C MapView filtered", """  const filtered = useMemo(() => {
    let result = posts.filter(p => {
      if (filter.ut && filter.ut !== 'todas' && p.unidad_territorial !== filter.ut) return false;
      if (filter.stage && filter.stage !== 'todas') {
        const cur = currentStageOf(p);
        if (filter.stage === 'bloqueado' && !p.blocked) return false;
        if (filter.stage === 'completado' && (p.blocked || cur.state !== 'completado')) return false;
        if (filter.stage !== 'bloqueado' && filter.stage !== 'completado') {
          if (p.blocked || cur.state !== 'pendiente' || cur.stage.id !== filter.stage) return false;
        }
      }
      return true;
    });
    // Filtro "cerca de mí"
    if (showNearby && userLoc) {
      result = result.map(p => ({
        ...p,
        _dist: Math.sqrt(Math.pow((p.lat - userLoc.lat) * 111320, 2) + Math.pow((p.lng - userLoc.lng) * 111320 * Math.cos(userLoc.lat * Math.PI / 180), 2)),
      })).sort((a, b) => a._dist - b._dist).slice(0, nearbyCount);
    }
    return result;
  }, [posts, filter, showNearby, userLoc, nearbyCount]);""", """  const filtered = useMemo(() => {
    let result = filterPosts(posts, filters, stageDefs, 'map');
    // Filtro "cerca de mí"
    if (showNearby && userLoc) {
      result = result.map(p => ({
        ...p,
        _dist: Math.sqrt(Math.pow((p.lat - userLoc.lat) * 111320, 2) + Math.pow((p.lng - userLoc.lng) * 111320 * Math.cos(userLoc.lat * Math.PI / 180), 2)),
      })).sort((a, b) => a._dist - b._dist).slice(0, nearbyCount);
    }
    return result;
  }, [posts, filters, stageDefs, showNearby, userLoc, nearbyCount]);"""))

# --- D. MapView call site (passes filters) ----------------------------------
CHANGES.append(("D MapView call",
    '<MapView posts={posts} selectedPost={selectedPost} setSelectedPost={setSelectedPost} filter={mapFilter}',
    '<MapView posts={posts} selectedPost={selectedPost} setSelectedPost={setSelectedPost} filters={filters}'
))

# --- E. App-level useState → useFilters -------------------------------------
CHANGES.append(("E useFilters hook", """  const [mapFilter, setMapFilter] = useState({ stage: 'todas', ut: 'todas' });
  const [listFilter, setListFilter] = useState({ stage: 'todas', ut: 'todas', zona: 'todas' });""", """  const filterCtx = useFilters();
  const { filters } = filterCtx;"""))

# --- F. Dashboard onNavigatePostes ------------------------------------------
CHANGES.append(("F Dashboard nav",
    "onNavigatePostes={(f) => { setListFilter(prev => ({ ...prev, stage: f.stage || 'todas', ut: f.ut || 'todas' })); setActiveTab('postes'); }}",
    "onNavigatePostes={(f) => { filterCtx.setFilters(prev => ({ ...prev, stages: f.stage && f.stage !== 'todas' ? [f.stage] : [], uts: f.ut && f.ut !== 'todas' ? [f.ut] : [] })); setActiveTab('postes'); }}"
))

# --- G. InformeIncidenciasView onNavigatePostes -----------------------------
CHANGES.append(("G Informe nav", """              setListFilter(prev => ({ ...prev, stage: 'todas', ut: ut || 'todas' }));
              setActiveTab('postes');""", """              filterCtx.setFilters(prev => ({ ...prev, stages: [], uts: ut ? [ut] : [] }));
              setActiveTab('postes');"""))

# --- H. Map topbar selects → FilterBar --------------------------------------
CHANGES.append(("H Map topbar", """                <div className="flex gap-2 ml-auto flex-wrap">
                  <select value={mapFilter.stage} onChange={e => setMapFilter({...mapFilter, stage: e.target.value})}
                          className="bg-stone-50 border border-stone-300 px-3 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                    <option value="todas">Todas las etapas</option>
                    {STAGE_DEFS.map(s => <option key={s.id} value={s.id}>E{s.num} · {s.short}</option>)}
                    <option value="completado">✓ Completado</option>
                    <option value="bloqueado">⚠ Bloqueado</option>
                  </select>
                  <select value={mapFilter.ut} onChange={e => setMapFilter({...mapFilter, ut: e.target.value})}
                          className="bg-stone-50 border border-stone-300 px-3 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                    <option value="todas">Todas las UT</option>
                    {[...new Set(posts.map(p => p.unidad_territorial))].sort().map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>""", """                <div className="ml-auto">
                  <FilterBar
                    posts={posts}
                    {...filterCtx}
                    stageDefs={STAGE_DEFS}
                    userNames={userNames}
                    mode="map"
                    showVerified={false}
                  />
                </div>"""))

# --- I. PostsList signature -------------------------------------------------
CHANGES.append(("I PostsList signature",
    "function PostsList({ posts, onSelect, filter, setFilter, page, setPage, isAdmin, userNames = {}, onDeletePosts, readOnly, onCreatePost }) {",
    "function PostsList({ posts, onSelect, filterCtx, page, setPage, isAdmin, userNames = {}, onDeletePosts, readOnly, onCreatePost }) {\n  const { filters } = filterCtx;"
))

# --- J. PostsList filteredStageDef + filtered logic -------------------------
CHANGES.append(("J PostsList filtered", """  // Obtener la etapa filtrada para mostrar columnas específicas
  const filteredStageDef = STAGE_DEFS.find(s => s.id === filter.stage);

  const filtered = useMemo(() => posts.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.id.toLowerCase().includes(q) &&
          !p.direccion.toLowerCase().includes(q) &&
          !p.unidad_territorial.toLowerCase().includes(q)) return false;
    }
    if (filter.ut && filter.ut !== 'todas' && p.unidad_territorial !== filter.ut) return false;
    if (filter.stage && filter.stage !== 'todas') {
      if (filter.stage === 'bloqueado') { if (!p.blocked) return false; }
      else if (filter.stage === 'completado') {
        const cur = currentStageOf(p);
        if (p.blocked || cur.state !== 'completado') return false;
      } else {
        // En vista detalle: mostrar postes que tengan esa etapa done (para ver datos)
        // O que la tengan como pendiente actual
        // En vista pipeline: solo pendiente actual
        if (p.blocked) return false;
        if (viewType === 'detalle') {
          // Mostrar si tiene la etapa done O si es la pendiente actual
          const stageDone = p.stages?.[filter.stage]?.done;
          const cur = currentStageOf(p);
          const isPending = cur.state === 'pendiente' && cur.stage.id === filter.stage;
          if (!stageDone && !isPending) return false;
        } else {
          const cur = currentStageOf(p);
          if (cur.state !== 'pendiente' || cur.stage.id !== filter.stage) return false;
        }
      }
    }
    if (filter.verified && filter.verified !== 'todas') {
      const allVerified = STAGE_DEFS.every(s => !p.stages[s.id]?.done || p.stages[s.id]?.verified);
      const someVerified = STAGE_DEFS.some(s => p.stages[s.id]?.verified);
      const anyDone = STAGE_DEFS.some(s => p.stages[s.id]?.done);
      if (filter.verified === 'verificado' && !(anyDone && allVerified)) return false;
      if (filter.verified === 'parcial' && !(someVerified && !allVerified)) return false;
      if (filter.verified === 'sin_verificar' && someVerified) return false;
    }
    return true;
  }), [posts, search, filter, viewType]);""", """  // Etapa "actual" cuando hay exactamente una seleccionada — para columnas específicas
  const filteredStageDef = filters.stages?.length === 1
    ? STAGE_DEFS.find(s => s.id === filters.stages[0])
    : null;

  const filtered = useMemo(() => {
    const mode = viewType === 'detalle' ? 'list-detalle' : 'list-pipeline';
    let result = filterPosts(posts, filters, STAGE_DEFS, mode);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.id.toLowerCase().includes(q) ||
        p.direccion.toLowerCase().includes(q) ||
        p.unidad_territorial.toLowerCase().includes(q)
      );
    }
    return result;
  }, [posts, filters, search, viewType]);

  // Reset paginación al cambiar filtros
  useEffect(() => { setPage(0); }, [filters, search]);"""))

# --- K. PostsList 3 selects → FilterBar -------------------------------------
CHANGES.append(("K PostsList topbar", """        <select value={filter.ut || 'todas'} onChange={e => { setFilter({...filter, ut: e.target.value}); setPage(0); }}
                className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
          <option value="todas">Todas las UT</option>
          {utList.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filter.stage || 'todas'} onChange={e => { setFilter({...filter, stage: e.target.value}); setPage(0); }}
                className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
          <option value="todas">Todas las etapas</option>
          {STAGE_DEFS.map(s => <option key={s.id} value={s.id}>E{s.num} · {s.short}</option>)}
          <option value="completado">✓ Completado</option>
          <option value="bloqueado">⚠ Bloqueado</option>
        </select>
        <select value={filter.verified || 'todas'} onChange={e => { setFilter({...filter, verified: e.target.value}); setPage(0); }}
                className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
          <option value="todas">Verificación: todas</option>
          <option value="verificado">✓ Verificado</option>
          <option value="parcial">◐ Parcialmente</option>
          <option value="sin_verificar">⏳ Sin verificar</option>
        </select>""", """        <FilterBar
          posts={posts}
          {...filterCtx}
          stageDefs={STAGE_DEFS}
          userNames={userNames}
          mode="list-detalle"
        />"""))

# --- L. PostsList call site -------------------------------------------------
CHANGES.append(("L PostsList call",
    "{activeTab === 'postes' && <PostsList posts={posts} onSelect={openPostDetail} filter={listFilter} setFilter={setListFilter}",
    "{activeTab === 'postes' && <PostsList posts={posts} onSelect={openPostDetail} filterCtx={filterCtx}"
))


# ============================================================================
# Main
# ============================================================================

def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src/App.jsx")
    if not target.exists():
        print(f"ERROR: {target} no existe.")
        print("Corre desde la raíz del proyecto (~/Downloads/field-coord-v2/) o pasa el path completo.")
        sys.exit(1)

    src = target.read_text(encoding="utf-8")
    original_size = len(src)

    # Sentinel: ya aplicado?
    if "from './hooks/useFilters" in src:
        print(f"⚠ {target} ya tiene el import de useFilters — parche ya aplicado. Saliendo.")
        sys.exit(0)

    # Backup
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = target.parent / f"{target.name}.bak.{ts}"
    bak.write_text(src, encoding="utf-8")
    print(f"backup → {bak}")

    # Aplicar cambios en orden
    print(f"\nAplicando {len(CHANGES)} cambios:")
    for label, old, new in CHANGES:
        src = replace_once(src, label, old, new)

    # Sanity checks
    assert "from './hooks/useFilters" in src, "post-check: import no quedó"
    assert "FilterBar" in src, "post-check: FilterBar no quedó"
    assert "filterPosts(" in src, "post-check: filterPosts no quedó"
    assert "mapFilter" not in src, "post-check: quedaron referencias a mapFilter"
    assert "setListFilter" not in src, "post-check: quedaron referencias a setListFilter"

    # Escribir
    target.write_text(src, encoding="utf-8")
    final_size = len(src)
    delta = final_size - original_size
    print(f"\n✓ {target} actualizado.")
    print(f"  Tamaño: {original_size:,} → {final_size:,} bytes ({'+' if delta >= 0 else ''}{delta:,})")
    print(f"  Backup: {bak}")
    print(f"\nSiguiente paso: copiar los 3 archivos nuevos al proyecto:")
    print(f"  src/lib/filters.js")
    print(f"  src/hooks/useFilters.js")
    print(f"  src/components/FilterBar.jsx")
    print(f"\nLuego: npm run dev (o npm run deploy si todo se ve bien).")


if __name__ == "__main__":
    main()
