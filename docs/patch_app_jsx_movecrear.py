#!/usr/bin/env python3
"""
patch_app_jsx_movecrear.py — Agrega drag-para-reubicar y click-para-crear desde el mapa.

REQUIERE: que App.jsx ya tenga aplicado el patch de filtros multi-select
(detectado por la presencia de `useFilters` import).

Hace 15 cambios:
  A. Imports: Translate, Collection, toLonLat
  B. State nuevo en App: editingPostId, addingPostMode, pendingNewPostCoord
  C. Handlers nuevos: handleStartEditPosition, handleConfirmRelocate, handleCancelRelocate,
                       handleToggleAddingMode, handleMapClickForNewPost
  D. MapView signature: agrega 4 props nuevas
  E. MapView: addingModeRef + sync useEffect
  F. MapView: click handler maneja addingMode antes de feature lookup
  G. MapView: useEffect para Translate interaction
  H. MapView: useEffect para cursor crosshair
  I. MapView: estilo del feature en edición (resalta morado)
  J. MapView: banners de modo edición/agregar
  K. Map topbar: botón "+ Nuevo aquí" antes del FilterBar
  L. MapView call site: pasar props nuevos
  M. PostDetailDrawer signature: onStartEditPosition prop
  N. PostDetailDrawer: botón "Mover en mapa" arriba del form de Reubicar
  O. PostDetailDrawer call site: pasar onStartEditPosition
  P. CreatePostForm call site: pasar initialPosition y limpiar en onClose

Uso:
    cd ~/Downloads/field-coord-v2
    python3 patch_app_jsx_movecrear.py             # parchea src/App.jsx

Idempotente: si detecta que ya fue aplicado, sale sin hacer nada.
"""

import sys
import datetime
from pathlib import Path


def replace_once(src: str, label: str, old: str, new: str) -> str:
    n = src.count(old)
    if n == 0:
        if new in src:
            print(f"  [{label}] ya aplicado, salto.")
            return src
        raise AssertionError(
            f"[{label}] anchor NO encontrado. Anchor empieza con: {old[:80]!r}"
        )
    if n > 1:
        raise AssertionError(
            f"[{label}] anchor ambiguo (aparece {n} veces)."
        )
    print(f"  [{label}] aplicado.")
    return src.replace(old, new, 1)


CHANGES = []

# --- A. Imports OL para Translate ------------------------------------------
CHANGES.append(("A imports OL",
    "import { fromLonLat as olFromLonLat } from 'ol/proj';",
    "import { fromLonLat as olFromLonLat, toLonLat as olToLonLat } from 'ol/proj';\n"
    "import { Translate as OLTranslate } from 'ol/interaction';\n"
    "import OLCollection from 'ol/Collection';"
))

# --- B. State nuevo (después de createPostDefaultStage) --------------------
CHANGES.append(("B state nuevo",
    "  const [showCreatePost, setShowCreatePost] = useState(false);\n"
    "  const [createPostDefaultStage, setCreatePostDefaultStage] = useState(null);",
    "  const [showCreatePost, setShowCreatePost] = useState(false);\n"
    "  const [createPostDefaultStage, setCreatePostDefaultStage] = useState(null);\n"
    "  // Edición de ubicación desde el mapa (drag de un poste)\n"
    "  const [editingPostId, setEditingPostId] = useState(null);\n"
    "  // Modo \"+ Nuevo aquí\" — click en mapa coloca un poste nuevo\n"
    "  const [addingPostMode, setAddingPostMode] = useState(false);\n"
    "  const [pendingNewPostCoord, setPendingNewPostCoord] = useState(null);"
))

# --- C. Handlers nuevos (insertados antes de updatePost useCallback) -------
CHANGES.append(("C handlers",
    "  const updatePost = useCallback(async (updated, alreadyPersisted = false) => {\n"
    "    if (readOnly) {\n"
    "      alert('Tu cuenta (director) tiene acceso de solo lectura.');\n"
    "      return;\n"
    "    }",
    "  // === Edición de ubicación / creación desde mapa ===\n"
    "  const handleStartEditPosition = useCallback((postId) => {\n"
    "    setSelectedPost(null);  // cerrar drawer si está abierto\n"
    "    setAddingPostMode(false);\n"
    "    setEditingPostId(postId);\n"
    "  }, []);\n\n"
    "  const handleCancelRelocate = useCallback(() => {\n"
    "    setEditingPostId(null);\n"
    "  }, []);\n\n"
    "  const handleToggleAddingMode = useCallback(() => {\n"
    "    setEditingPostId(null);\n"
    "    setAddingPostMode(prev => !prev);\n"
    "  }, []);\n\n"
    "  const handleMapClickForNewPost = useCallback((lat, lng) => {\n"
    "    setAddingPostMode(false);\n"
    "    setPendingNewPostCoord({ lat, lng });\n"
    "    setShowCreatePost(true);\n"
    "  }, []);\n\n"
    "  const updatePost = useCallback(async (updated, alreadyPersisted = false) => {\n"
    "    if (readOnly) {\n"
    "      alert('Tu cuenta (director) tiene acceso de solo lectura.');\n"
    "      return;\n"
    "    }"
))

# handleConfirmRelocate uses updatePost so it goes after updatePost is defined.
# Anchor on the line right after updatePost definition.
CHANGES.append(("C handleConfirmRelocate",
    "  // Metadata-only update (alias, dirección, UT, coords) — atomic RPC, never touches stages\n"
    "  const updatePostMeta = useCallback(async (postId, fields) => {",
    "  // Confirma reubicación tras el drag — usa savePost legacy para persistir\n"
    "  // todos los campos (reubicado, latOriginal, lngOriginal, reubicadoAt, reubicadoPor).\n"
    "  const handleConfirmRelocate = useCallback(async (postId, newLat, newLng) => {\n"
    "    const post = posts.find(p => p.id === postId);\n"
    "    if (!post) { setEditingPostId(null); return; }\n"
    "    const dist = Math.sqrt(\n"
    "      Math.pow((newLat - post.lat) * 111320, 2) +\n"
    "      Math.pow((newLng - post.lng) * 111320 * Math.cos(post.lat * Math.PI / 180), 2)\n"
    "    );\n"
    "    const ok = window.confirm(\n"
    "      `¿Reubicar ${postDisplayId(post)}?\\n\\n` +\n"
    "      `De: ${Number(post.lat).toFixed(5)}, ${Number(post.lng).toFixed(5)}\\n` +\n"
    "      `A:  ${newLat.toFixed(5)}, ${newLng.toFixed(5)}\\n` +\n"
    "      `Distancia: ${Math.round(dist)} m\\n\\n` +\n"
    "      `Esta acción se registrará con tu usuario.`\n"
    "    );\n"
    "    if (!ok) {\n"
    "      // El effect de re-render del MapView regresará el feature a su posición\n"
    "      setEditingPostId(null);\n"
    "      return;\n"
    "    }\n"
    "    const updated = {\n"
    "      ...post,\n"
    "      lat: newLat, lng: newLng,\n"
    "      latOriginal: post.latOriginal || post.lat,\n"
    "      lngOriginal: post.lngOriginal || post.lng,\n"
    "      reubicado: true,\n"
    "      reubicadoAt: new Date().toISOString(),\n"
    "      reubicadoPor: profile?.id || null,\n"
    "    };\n"
    "    setEditingPostId(null);\n"
    "    await updatePost(updated, false);  // false = persiste vía savePost\n"
    "  }, [posts, profile, updatePost]);\n\n"
    "  // Metadata-only update (alias, dirección, UT, coords) — atomic RPC, never touches stages\n"
    "  const updatePostMeta = useCallback(async (postId, fields) => {"
))

# --- D. MapView signature -------------------------------------------------
CHANGES.append(("D MapView signature",
    "function MapView({ posts, selectedPost, setSelectedPost, filters, onCapturePost, stageDefs, darkMode }) {",
    "function MapView({ posts, selectedPost, setSelectedPost, filters, onCapturePost, stageDefs, darkMode,\n"
    "                   editingPostId, onConfirmRelocate, onCancelRelocate,\n"
    "                   addingMode, onMapClickForNewPost }) {"
))

# --- E. addingModeRef sync (right after the existing refs) -----------------
CHANGES.append(("E addingModeRef",
    "  const [hover, setHover] = useState(null);\n"
    "  const [tilesFailed, setTilesFailed] = useState(false);",
    "  const [hover, setHover] = useState(null);\n"
    "  const [tilesFailed, setTilesFailed] = useState(false);\n"
    "  // Refs para que los handlers del map (closure inicial) lean el estado actual\n"
    "  const addingModeRef = useRef(addingMode);\n"
    "  useEffect(() => { addingModeRef.current = addingMode; }, [addingMode]);\n"
    "  const onMapClickForNewPostRef = useRef(onMapClickForNewPost);\n"
    "  useEffect(() => { onMapClickForNewPostRef.current = onMapClickForNewPost; }, [onMapClickForNewPost]);\n"
    "  const translateRef = useRef(null);"
))

# --- F. Click handler — handle addingMode first ---------------------------
CHANGES.append(("F click addingMode",
    "    // Click → mostrar tarjeta\n"
    "    map.on('click', (e) => {\n"
    "      const feat = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: 6 });\n"
    "      if (feat) {\n"
    "        const post = feat.get('post');\n"
    "        if (post) { setCardPost(post); return; }\n"
    "      }\n"
    "      setCardPost(null);\n"
    "    });",
    "    // Click → addingMode tiene prioridad; si no, mostrar tarjeta del feature\n"
    "    map.on('click', (e) => {\n"
    "      if (addingModeRef.current) {\n"
    "        const [lng, lat] = olToLonLat(e.coordinate);\n"
    "        if (onMapClickForNewPostRef.current) onMapClickForNewPostRef.current(lat, lng);\n"
    "        return;\n"
    "      }\n"
    "      const feat = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: 6 });\n"
    "      if (feat) {\n"
    "        const post = feat.get('post');\n"
    "        if (post) { setCardPost(post); return; }\n"
    "      }\n"
    "      setCardPost(null);\n"
    "    });"
))

# --- G. Translate interaction effect ---------------------------------------
# Inserted after the "Refrescar features" useEffect.
CHANGES.append(("G translate effect",
    "  // User location dot\n"
    "  useEffect(() => {\n"
    "    const src = userLocSourceRef.current;",
    "  // Translate interaction — solo activa cuando hay editingPostId\n"
    "  useEffect(() => {\n"
    "    if (!mapRef.current || !vectorSourceRef.current) return;\n"
    "    const map = mapRef.current;\n"
    "    // Limpiar interaction previa\n"
    "    if (translateRef.current) {\n"
    "      map.removeInteraction(translateRef.current);\n"
    "      translateRef.current = null;\n"
    "    }\n"
    "    if (!editingPostId) return;\n"
    "    const target = vectorSourceRef.current.getFeatures().find(f => f.get('post')?.id === editingPostId);\n"
    "    if (!target) return;\n"
    "    const translate = new OLTranslate({ features: new OLCollection([target]) });\n"
    "    translate.on('translateend', (ev) => {\n"
    "      const feat = ev.features.getArray()[0];\n"
    "      const coords = feat?.getGeometry().getCoordinates();\n"
    "      if (!coords) return;\n"
    "      const [lng, lat] = olToLonLat(coords);\n"
    "      if (onConfirmRelocate) onConfirmRelocate(editingPostId, lat, lng);\n"
    "    });\n"
    "    map.addInteraction(translate);\n"
    "    translateRef.current = translate;\n"
    "    return () => {\n"
    "      if (translateRef.current) {\n"
    "        map.removeInteraction(translateRef.current);\n"
    "        translateRef.current = null;\n"
    "      }\n"
    "    };\n"
    "  }, [editingPostId, onConfirmRelocate]);\n\n"
    "  // User location dot\n"
    "  useEffect(() => {\n"
    "    const src = userLocSourceRef.current;"
))

# --- H. Cursor crosshair effect --------------------------------------------
CHANGES.append(("H cursor crosshair",
    "  // Centrar en selección externa\n"
    "  useEffect(() => {\n"
    "    if (!mapRef.current || !selectedPost) return;",
    "  // Cursor crosshair en addingMode\n"
    "  useEffect(() => {\n"
    "    if (!containerRef.current) return;\n"
    "    containerRef.current.style.cursor = addingMode ? 'crosshair' : '';\n"
    "  }, [addingMode]);\n\n"
    "  // Centrar en selección externa\n"
    "  useEffect(() => {\n"
    "    if (!mapRef.current || !selectedPost) return;"
))

# --- I. Feature style highlights editing post ------------------------------
CHANGES.append(("I feature style",
    "    src.addFeatures(filtered.map(p => {\n"
    "      const feat = new OLFeature({ geometry: new OLPoint(olFromLonLat([p.lng, p.lat])) });\n"
    "      feat.set('post', p);\n"
    "      const isSel = selectedPost?.id === p.id || cardPost?.id === p.id;\n"
    "      feat.setStyle(new OLStyle({\n"
    "        image: new OLCircle({\n"
    "          radius: isSel ? 9 : 5,\n"
    "          fill: new OLFill({ color: colorOfPost(p) }),\n"
    "          stroke: new OLStroke({ color: isSel ? '#ffffff' : '#0A0E14', width: isSel ? 2.5 : 1 }),\n"
    "        }),\n"
    "      }));\n"
    "      return feat;\n"
    "    }));\n"
    "  }, [filtered, selectedPost, cardPost]);",
    "    src.addFeatures(filtered.map(p => {\n"
    "      const feat = new OLFeature({ geometry: new OLPoint(olFromLonLat([p.lng, p.lat])) });\n"
    "      feat.set('post', p);\n"
    "      const isSel = selectedPost?.id === p.id || cardPost?.id === p.id;\n"
    "      const isEditing = editingPostId === p.id;\n"
    "      feat.setStyle(new OLStyle({\n"
    "        image: new OLCircle({\n"
    "          radius: isEditing ? 12 : (isSel ? 9 : 5),\n"
    "          fill: new OLFill({ color: isEditing ? '#A855F7' : colorOfPost(p) }),\n"
    "          stroke: new OLStroke({\n"
    "            color: isEditing ? '#FFFFFF' : (isSel ? '#ffffff' : '#0A0E14'),\n"
    "            width: isEditing ? 3 : (isSel ? 2.5 : 1),\n"
    "          }),\n"
    "        }),\n"
    "      }));\n"
    "      return feat;\n"
    "    }));\n"
    "  }, [filtered, selectedPost, cardPost, editingPostId]);"
))

# --- J. Banners — inserted right before the Hover tooltip block -----------
CHANGES.append(("J banners",
    "      )}\n"
    "\n"
    "      {/* Hover tooltip */}\n"
    "      {hover && !cardPost && (",
    "      )}\n"
    "\n"
    "      {/* Banner: modo edición de ubicación */}\n"
    "      {editingPostId && (\n"
    "        <div className=\"absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-purple-100 border-2 border-purple-400 px-4 py-2 font-mono text-xs text-purple-800 backdrop-blur-sm shadow-lg rounded flex items-center gap-3\">\n"
    "          <span>📍 Modo edición — arrastra el punto morado, luego suelta para confirmar</span>\n"
    "          <button onClick={onCancelRelocate} className=\"text-purple-600 hover:text-purple-900 underline whitespace-nowrap\">Cancelar</button>\n"
    "        </div>\n"
    "      )}\n"
    "\n"
    "      {/* Banner: modo agregar */}\n"
    "      {addingMode && (\n"
    "        <div className=\"absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-100 border-2 border-emerald-400 px-4 py-2 font-mono text-xs text-emerald-800 backdrop-blur-sm shadow-lg rounded\">\n"
    "          <span>+ Modo agregar — toca el mapa donde va el nuevo poste</span>\n"
    "        </div>\n"
    "      )}\n"
    "\n"
    "      {/* Hover tooltip */}\n"
    "      {hover && !cardPost && ("
))

# --- K. Map topbar — add "+ Nuevo aquí" button before FilterBar -----------
CHANGES.append(("K topbar boton",
    "                <div className=\"ml-auto\">\n"
    "                  <FilterBar\n"
    "                    posts={posts}\n"
    "                    {...filterCtx}\n"
    "                    stageDefs={STAGE_DEFS}\n"
    "                    userNames={userNames}\n"
    "                    mode=\"map\"\n"
    "                    showVerified={false}\n"
    "                  />\n"
    "                </div>",
    "                <div className=\"ml-auto flex items-center gap-2 flex-wrap\">\n"
    "                  {canEditPosts(profile) && !readOnly && (\n"
    "                    <button onClick={handleToggleAddingMode}\n"
    "                      className={`px-3 py-1.5 text-xs font-mono border transition-colors ${\n"
    "                        addingPostMode\n"
    "                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'\n"
    "                          : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-emerald-400'\n"
    "                      }`}>\n"
    "                      {addingPostMode ? '✕ Cancelar' : '+ Nuevo aquí'}\n"
    "                    </button>\n"
    "                  )}\n"
    "                  <FilterBar\n"
    "                    posts={posts}\n"
    "                    {...filterCtx}\n"
    "                    stageDefs={STAGE_DEFS}\n"
    "                    userNames={userNames}\n"
    "                    mode=\"map\"\n"
    "                    showVerified={false}\n"
    "                  />\n"
    "                </div>"
))

# --- L. MapView call site — pass new props ---------------------------------
CHANGES.append(("L MapView call",
    "                <MapView posts={posts} selectedPost={selectedPost} setSelectedPost={setSelectedPost} filters={filters}\n"
    "                         stageDefs={STAGE_DEFS} darkMode={darkMode}\n"
    "                         onCapturePost={!readOnly ? (post, stage) => {",
    "                <MapView posts={posts} selectedPost={selectedPost} setSelectedPost={setSelectedPost} filters={filters}\n"
    "                         stageDefs={STAGE_DEFS} darkMode={darkMode}\n"
    "                         editingPostId={editingPostId}\n"
    "                         onConfirmRelocate={handleConfirmRelocate}\n"
    "                         onCancelRelocate={handleCancelRelocate}\n"
    "                         addingMode={addingPostMode}\n"
    "                         onMapClickForNewPost={handleMapClickForNewPost}\n"
    "                         onCapturePost={!readOnly ? (post, stage) => {"
))

# --- M. PostDetailDrawer signature -----------------------------------------
CHANGES.append(("M PostDetailDrawer signature",
    "function PostDetailDrawer({ post, onClose, onUpdate, onUpdateMeta, incidents, onCreateIncident, viewMode, userNames = {}, isAdmin = false, onVerifyStage, onUnverifyStage, onDelete, initialStageId }) {",
    "function PostDetailDrawer({ post, onClose, onUpdate, onUpdateMeta, incidents, onCreateIncident, viewMode, userNames = {}, isAdmin = false, onVerifyStage, onUnverifyStage, onDelete, initialStageId, onStartEditPosition }) {"
))

# --- N. Add "Mover en mapa" button before the existing Reubicar block ------
CHANGES.append(("N boton mover",
    "          {/* Reubicar poste — solo admin */}\n"
    "          {isAdmin && onUpdate && !post.reubicado && (\n"
    "            <div className=\"mt-4 pt-4 border-t border-stone-300\">\n"
    "              {!showReubForm ? (\n"
    "                <button onClick={() => { setShowReubForm(true); setReubLat(''); setReubLng(''); }}\n"
    "                  className=\"w-full px-4 py-2.5 border border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 text-xs font-mono uppercase tracking-widest transition-colors rounded flex items-center justify-center gap-2\">\n"
    "                  📍 Reubicar poste\n"
    "                </button>",
    "          {/* Reubicar poste — solo admin */}\n"
    "          {isAdmin && onUpdate && !post.reubicado && (\n"
    "            <div className=\"mt-4 pt-4 border-t border-stone-300 space-y-2\">\n"
    "              {onStartEditPosition && !showReubForm && (\n"
    "                <button onClick={() => { onClose(); onStartEditPosition(post.id); }}\n"
    "                  className=\"w-full px-4 py-2.5 border border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 text-xs font-mono uppercase tracking-widest transition-colors rounded flex items-center justify-center gap-2\">\n"
    "                  🎯 Mover en mapa (drag)\n"
    "                </button>\n"
    "              )}\n"
    "              {!showReubForm ? (\n"
    "                <button onClick={() => { setShowReubForm(true); setReubLat(''); setReubLng(''); }}\n"
    "                  className=\"w-full px-4 py-2.5 border border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 text-xs font-mono uppercase tracking-widest transition-colors rounded flex items-center justify-center gap-2\">\n"
    "                  📍 Reubicar (coords manuales)\n"
    "                </button>"
))

# --- O. PostDetailDrawer call site — pass onStartEditPosition --------------
CHANGES.append(("O drawer call",
    "                          onVerifyStage={handleVerifyStage} onUnverifyStage={handleUnverifyStage}",
    "                          onVerifyStage={handleVerifyStage} onUnverifyStage={handleUnverifyStage}\n"
    "                          onStartEditPosition={isAdmin && !readOnly ? handleStartEditPosition : null}"
))

# --- P. CreatePostForm call site — pass initialPosition + clear on close ---
CHANGES.append(("P createform",
    "      {/* Modal: Crear poste */}\n"
    "      {showCreatePost && (\n"
    "        <CreatePostForm\n"
    "          unidadesTerritoriales={unidadesTerritoriales}\n"
    "          stageDefs={STAGE_DEFS}\n"
    "          defaultStageId={createPostDefaultStage}\n"
    "          onCreated={handlePostCreated}\n"
    "          onClose={() => { setShowCreatePost(false); setCreatePostDefaultStage(null); }}\n"
    "        />\n"
    "      )}",
    "      {/* Modal: Crear poste */}\n"
    "      {showCreatePost && (\n"
    "        <CreatePostForm\n"
    "          unidadesTerritoriales={unidadesTerritoriales}\n"
    "          stageDefs={STAGE_DEFS}\n"
    "          defaultStageId={createPostDefaultStage}\n"
    "          initialPosition={pendingNewPostCoord}\n"
    "          onCreated={(p) => { handlePostCreated(p); setPendingNewPostCoord(null); }}\n"
    "          onClose={() => { setShowCreatePost(false); setCreatePostDefaultStage(null); setPendingNewPostCoord(null); }}\n"
    "        />\n"
    "      )}"
))


def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src/App.jsx")
    if not target.exists():
        print(f"ERROR: {target} no existe.")
        sys.exit(1)

    src = target.read_text(encoding="utf-8")

    # Pre-check: filtros aplicado?
    if "from './hooks/useFilters" not in src:
        print(f"ERROR: {target} NO tiene el patch de filtros multi-select.")
        print("Aplica primero patch_app_jsx.py antes de este.")
        sys.exit(1)

    # Sentinel: ya aplicado?
    if "handleConfirmRelocate" in src:
        print(f"⚠ {target} ya tiene handleConfirmRelocate — patch ya aplicado. Saliendo.")
        sys.exit(0)

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = target.parent / f"{target.name}.bak.{ts}"
    bak.write_text(src, encoding="utf-8")
    print(f"backup → {bak}")

    print(f"\nAplicando {len(CHANGES)} cambios:")
    for label, old, new in CHANGES:
        src = replace_once(src, label, old, new)

    # Sanity post-checks
    assert "OLTranslate" in src
    assert "handleConfirmRelocate" in src
    assert "handleStartEditPosition" in src
    assert "handleMapClickForNewPost" in src
    assert "addingPostMode" in src
    assert "🎯 Mover en mapa" in src
    assert "+ Nuevo aquí" in src
    assert "initialPosition={pendingNewPostCoord}" in src

    target.write_text(src, encoding="utf-8")
    print(f"\n✓ {target} actualizado.")
    print(f"  Backup: {bak}")
    print(f"\nRecuerda: también necesitas reemplazar src/components/CreatePostForm.jsx")
    print(f"con la versión que acepta `initialPosition` (ver outputs/).")


if __name__ == "__main__":
    main()
