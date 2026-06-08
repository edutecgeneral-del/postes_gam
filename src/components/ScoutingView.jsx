/**
 * src/components/ScoutingView.jsx — Sistema de scouting.
 *
 * Admin: crea rutas, asigna postes a scouts, ve resultados.
 * Scout: ve sus rutas, visita postes, verifica etapas, reporta.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Compass, Plus, ChevronLeft, MapPin, Check, X, Loader2, Search,
  AlertCircle, Navigation, Camera, Eye, CheckCircle2, AlertTriangle, Upload
} from 'lucide-react';
import {
  loadScoutingRoutes, createScoutingRoute, loadRoutePostIds,
  startRoute, completeRoute, createScoutingVisit, loadPostScoutingVisits, loadRouteVisitedPostIds,
  approvePost, unapprovePost, deleteScoutingRoute, removePostsFromRoute, updateScoutingRoute,
  normalizePhotoUrls, uploadStagePhoto, updateStageAtomic, withStagePhotoUrls,
  setPostAntenaRecuperada,
} from '../lib/data.js';
import { listAllUsers } from '../lib/auth.js';
import RoutePreviewMap from './RoutePreviewMap.jsx';
import { GPSField, StageAttributeField } from './StageFields.jsx';
import { getPersistedForm, persistForm, clearPersistedForm, onBackgroundSave } from '../lib/formPersist.js';
import { savePhotos, loadPhotos, clearPhotos } from '../lib/photoPersist.js';

const RESULT_LABELS = {
  ok: { label: 'OK', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  observacion: { label: 'Observación', color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/30' },
  rechazado: { label: 'Rechazado', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  problema: { label: 'Problema', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  corregido: { label: 'Corregido', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  sigue_pendiente: { label: 'Sigue pendiente', color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/30' },
};

const ROUTE_TYPE_LABELS = {
  avanzada_internet: { label: 'Avanzada Internet', emoji: '🌐', color: 'text-blue-600', bg: 'bg-blue-100' },
  recuperacion_antena: { label: 'Recuperación de Antena', emoji: '🛰️', color: 'text-teal-700', bg: 'bg-teal-100' },
  correcciones: { label: 'Correcciones', emoji: '🔧', color: 'text-orange-600', bg: 'bg-orange-100' },
  reubicaciones: { label: 'Reubicaciones', emoji: '📍', color: 'text-purple-600', bg: 'bg-purple-100' },
  m1_mantenimiento: { label: 'M1 Mantenimiento', emoji: '🔧', color: 'text-cyan-700', bg: 'bg-cyan-100' },
  m2_poe_alineacion: { label: 'M2 PoE/Alineación', emoji: '📡', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  m3_centro: { label: 'M3 Centro', emoji: '🏢', color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
};

// Flujo de mantenimiento M1 → M2 → M3. Cada check: ok/problema + foto obligatoria + nota opcional.
const MAINT_CHECKS = {
  m1_mantenimiento: { label: 'M1 Mantenimiento y conexión', emoji: '🔧', groups: [
    { title: 'Silicón', items: [['sil_corona_1', 'Corona 1'], ['sil_corona_2', 'Corona 2'], ['sil_brazo_izq', 'Brazo izq'], ['sil_brazo_der', 'Brazo der'], ['sil_acrilico', 'Acrílico']] },
    { title: 'E4 · Conexiones', items: [['e4_conexiones', 'Conexiones (UCG, Switch, Antena)', { photo: false }]] },
  ] },
  m2_poe_alineacion: { label: 'M2 PoE y alineación', emoji: '📡', groups: [
    { title: 'E6', items: [['e6_inyector', 'Conectar antena a inyector', { photo: false }], ['e6_alinear', 'Alinear antena', { photo: false }]] },
  ] },
  m3_centro: { label: 'M3 Conexión al centro', emoji: '🏢', groups: [
    { title: 'Centro', items: [['m3_conexion_centro', 'Conexión al centro', { photo: false }]] },
  ] },
};
const MAINT_TYPES = Object.keys(MAINT_CHECKS);
const MAINT_NEXT = { m1_mantenimiento: 'm2_poe_alineacion', m2_poe_alineacion: 'm3_centro', m3_centro: null };
// Cada fase de mantenimiento vuelca sus datos en una etapa del poste:
const MAINT_STAGE = { m1_mantenimiento: 'camaras', m2_poe_alineacion: 'conexion_poste', m3_centro: 'centro' };
const MAINT_LABELS = Object.fromEntries(
  Object.values(MAINT_CHECKS).flatMap(t => t.groups.flatMap(g => g.items)),
);


// =============================================================================
// E8 — Inspección Scout: campos de cada etapa que el scout verifica
// =============================================================================
const E8_FIELDS = {
  dado:           ['poste_tipo'],
  parado:         ['estado_luz', 'estado_luz_otro'],
  camaras:        ['cantidad_ptz', 'cantidad_bullet', 'orientaciones_bullet', 'cascajo', 'cascajo_foto'],
  internet:       ['folio', 'telefono', 'tipo_modem', 'usuario', 'password', 'ubicacion_real'],
  conexion_poste: ['postes_conectados'],
  centro:         ['validado_por'],
};

const E8_INCIDENT_TYPES = {
  dado:           ['No hay poste', 'Dado dañado', 'Mala ubicación'],
  parado:         ['Poste caído', 'Sin electricidad', 'Sin luz violeta', 'Vandalismo'],
  camaras:        ['Faltan cámaras', 'Cámara rota', 'Obstrucción', 'Vandalismo'],
  internet:       ['Sin internet', 'Modem dañado', 'Cable cortado'],
  conexion_poste: ['Cable cortado', 'Sin conexión'],
  centro:         ['Sin señal en centro'],
};

// Incident type → descriptive badge
const INC_BADGE_MAP = {
  'No hay poste': { e: '🚫', c: 'bg-red-100 text-red-700' },
  'Dado dañado': { e: '🧱', c: 'bg-red-100 text-red-700' },
  'Poste caído': { e: '📍', c: 'bg-red-100 text-red-700' },
  'Faltan cámaras': { e: '📷', c: 'bg-amber-100 text-amber-700' },
  'Cámara rota': { e: '📷', c: 'bg-amber-100 text-amber-700' },
  'Sin internet': { e: '🔌', c: 'bg-amber-100 text-amber-700' },
  'Modem dañado': { e: '📡', c: 'bg-amber-100 text-amber-700' },
  'Sin electricidad': { e: '⚡', c: 'bg-blue-100 text-blue-700' },
  'Cable cortado': { e: '⚡', c: 'bg-blue-100 text-blue-700' },
  'Sin luz violeta': { e: '💡', c: 'bg-blue-100 text-blue-700' },
  'Reclamo vecinal': { e: '👤', c: 'bg-purple-100 text-purple-700' },
  'Obstrucción': { e: '🗑️', c: 'bg-purple-100 text-purple-700' },
  'Vandalismo': { e: '🔒', c: 'bg-purple-100 text-purple-700' },
  'Mala ubicación': { e: '📍', c: 'bg-pink-100 text-pink-700' },
  'Acceso bloqueado': { e: '🚧', c: 'bg-pink-100 text-pink-700' },
};
function incBadge(type) {
  return INC_BADGE_MAP[type] || { e: '⚠️', c: 'bg-stone-100 text-stone-600' };
}

export default function ScoutingView({ posts, stageDefs, profile, userNames, isAdmin, isCoordinador, onPostApproved, onCreateIncident, incidents, onSelectPost, onOpenPostDetail }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsersMap, setAllUsersMap] = useState({}); // {userId: displayName} incluyendo admins
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedPostForVisit, setSelectedPostForVisit] = useState(null);
  const [routePostIds, setRoutePostIds] = useState([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadScoutingRoutes();
      // Scout solo ve las suyas
      const filtered = isAdmin ? data : data.filter(r => r.scout_id === profile?.userId);
      setRoutes(filtered);
    } catch (e) { console.error('loadRoutes', e); }
    setLoading(false);
  }, [isAdmin, profile]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  // Cargar todos los usuarios (con rol) para resolver "Creado por" y scouts.
  useEffect(() => {
    listAllUsers()
      .then(us => {
        const m = {};
        for (const u of us) m[u.userId] = u.displayName || u.email || 'Usuario';
        setAllUsersMap(m);
      })
      .catch(() => {});
  }, []);

  // ---- VISIT FORM ----
  if (selectedPostForVisit && selectedRoute) {
    const post = posts.find(p => p.id === selectedPostForVisit);
    if (!post) return null;
    return (
      <ScoutVisitForm
        post={post}
        routeId={selectedRoute.id}
        routeType={selectedRoute.route_type || 'avanzada_internet'}
        profile={profile}
        stageDefs={stageDefs}
        userNames={userNames}
        incidents={incidents}
        onBack={() => setSelectedPostForVisit(null)}
        onSaved={() => { setSelectedPostForVisit(null); loadRoutes(); }}
        isAdmin={isAdmin}
        onApprove={onPostApproved}
        onCreateIncident={onCreateIncident}
        onOpenPostDetail={onOpenPostDetail}
      />
    );
  }

  // ---- ROUTE DETAIL ----
  if (selectedRoute) {
    return (
      <RouteDetail
        route={selectedRoute}
        posts={posts}
        profile={profile}
        isAdmin={isAdmin}
        userNames={userNames}
        onBack={() => { setSelectedRoute(null); loadRoutes(); }}
        onSelectPost={(postId) => setSelectedPostForVisit(postId)}
        onStartRoute={async () => { await startRoute(selectedRoute.id); loadRoutes(); setSelectedRoute({...selectedRoute, status: 'en_curso'}); }}
        onCompleteRoute={async () => { await completeRoute(selectedRoute.id); loadRoutes(); setSelectedRoute({...selectedRoute, status: 'completada'}); }}
        onReassign={async (scoutId) => { await updateScoutingRoute(selectedRoute.id, { scout_id: scoutId || null }); loadRoutes(); setSelectedRoute({...selectedRoute, scout_id: scoutId || null}); }}
      />
    );
  }

  // ---- ROUTE LIST ----
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-emerald-500/80">Scouting</div>
            <h1 className="text-xl font-light text-stone-950 mt-1">
              {isAdmin ? 'Rutas de verificación' : 'Mis recorridos'}
            </h1>
            <p className="text-xs text-stone-500 mt-1">{routes.length} rutas</p>
          </div>
          {(isAdmin || isCoordinador) && (
            <div className="flex gap-2">
              {selectedRouteIds.size > 0 && (
                <button onClick={async () => {
                  if (!window.confirm(`¿Eliminar ${selectedRouteIds.size} ruta(s)? Esta acción no se puede deshacer.`)) return;
                  setDeleting(true);
                  for (const id of selectedRouteIds) { try { await deleteScoutingRoute(id); } catch (e) { console.error(e); } }
                  setSelectedRouteIds(new Set());
                  loadRoutes();
                  setDeleting(false);
                }} disabled={deleting}
                  className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg px-3 py-2">
                  {deleting ? '…' : `🗑 Eliminar (${selectedRouteIds.size})`}
                </button>
              )}
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg px-3 py-2">
                <Plus className="w-4 h-4" /> Crear ruta
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            <Compass className="w-10 h-10 mx-auto mb-3 text-stone-400" />
            <p className="text-sm">{isAdmin ? 'No hay rutas creadas. Crea la primera.' : 'No tienes rutas asignadas.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {routes.map(r => {
              const statusColors = { pendiente: 'text-stone-600 bg-gray-100', en_curso: 'text-brand-400 bg-brand-500/10', completada: 'text-emerald-400 bg-emerald-500/10' };
              const sc = statusColors[r.status] || statusColors.pendiente;
              return (
                <div key={r.id} className="flex items-start gap-2">
                  {isAdmin && (
                    <input type="checkbox" checked={selectedRouteIds.has(r.id)}
                      onChange={(e) => { e.stopPropagation(); setSelectedRouteIds(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }}
                      className="w-4 h-4 accent-red-500 mt-4 flex-shrink-0" />
                  )}
                  <button onClick={() => setSelectedRoute(r)}
                    className="flex-1 text-left p-4 border border-stone-300 bg-stone-50 rounded-xl hover:border-stone-500 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-stone-950">{r.name}</div>
                      {(() => { const rt = ROUTE_TYPE_LABELS[r.route_type] || ROUTE_TYPE_LABELS.avanzada_internet; return (
                        <span className={`text-[13px] font-mono uppercase px-1.5 py-0.5 rounded ${rt.bg} ${rt.color}`}>{rt.emoji} {rt.label}</span>
                      );})()}
                    </div>
                    <span className={`text-[12px] font-mono uppercase px-2 py-0.5 rounded-full ${sc}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    {r.total_posts} postes · {r.visited_posts || 0} visitados
                    {(allUsersMap[r.scout_id] || userNames[r.scout_id]) && <span> · Scout: {allUsersMap[r.scout_id] || userNames[r.scout_id]}</span>}
                    {(allUsersMap[r.assigned_by] || userNames[r.assigned_by]) && <span> · Creó: {allUsersMap[r.assigned_by] || userNames[r.assigned_by]}</span>}
                  </div>
                  {r.notes && <div className="text-xs text-stone-500 mt-1 truncate">{r.notes}</div>}
                </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRouteModal
          posts={posts}
          incidents={incidents || []}
          isCoordinador={isCoordinador}
          onSelectPost={onSelectPost}
          profile={profile}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadRoutes(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// RouteDetail — postes de una ruta, scout puede seleccionar para verificar
// =============================================================================
function RouteDetail({ route, posts, profile, isAdmin, userNames, onBack, onSelectPost, onStartRoute, onCompleteRoute, onReassign }) {
  const [postIds, setPostIds] = useState([]);
  const [visitedIds, setVisitedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [selectedForRemoval, setSelectedForRemoval] = useState(new Set());
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadRoutePostIds(route.id),
      loadRouteVisitedPostIds(route.id).catch(() => []),
    ]).then(([ids, visited]) => {
      setPostIds(ids);
      setVisitedIds(new Set(visited));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [route.id]);

  const routePosts = useMemo(() => {
    return postIds.map(id => posts.find(p => p.id === id)).filter(Boolean);
  }, [postIds, posts]);

  // Pendientes vs completados (verificados en esta ruta)
  const pendientes = useMemo(() => routePosts.filter(p => !visitedIds.has(p.id)), [routePosts, visitedIds]);
  const completados = useMemo(() => routePosts.filter(p => visitedIds.has(p.id)), [routePosts, visitedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pendientes;
    const q = search.toLowerCase();
    return pendientes.filter(p => p.id.toLowerCase().includes(q) || (p.direccion||'').toLowerCase().includes(q));
  }, [pendientes, search]);

  const isScout = profile?.userId === route.scout_id;
  const nextType = MAINT_NEXT[route.route_type];
  const allDone = !loading && routePosts.length > 0 && pendientes.length === 0;

  // C) Al verificar todos los puntos, marcar la ruta como completada (una sola vez)
  useEffect(() => {
    if (allDone && route.status !== 'completada') onCompleteRoute?.();
  }, [allDone, route.status]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-stone-600 hover:text-stone-950 -ml-2"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-stone-950">{route.name}</div>
          <div className="text-[12px] text-stone-500">{completados.length}/{routePosts.length} verificados · {route.status === 'completada' ? 'Scouting completado' : route.status}</div>
        </div>
        {isAdmin && (
          <select value={route.scout_id || ''} onChange={e => onReassign?.(e.target.value)}
            title="Responsable"
            className="text-xs bg-stone-100 border border-stone-300 rounded-lg px-2 py-1.5 text-stone-800 font-mono focus:outline-none focus:border-brand-500 max-w-[45%]">
            <option value="">Sin asignar</option>
            {Object.entries(userNames || {}).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {isScout && route.status === 'pendiente' && (
          <button onClick={onStartRoute} className="text-xs bg-brand-700 hover:bg-brand-600 text-stone-950 font-medium rounded-lg px-3 py-1.5">
            Iniciar recorrido
          </button>
        )}
        {isScout && route.status === 'en_curso' && (
          <button onClick={onCompleteRoute} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg px-3 py-1.5">
            Marcar completa
          </button>
        )}
        {isAdmin && route.status === 'completada' && nextType && (
          <button onClick={async () => {
            try {
              await createScoutingRoute({ name: `${MAINT_CHECKS[nextType].label} · ${route.name}`, scoutId: null, postIds, notes: '', routeType: nextType });
              alert(`Ruta "${MAINT_CHECKS[nextType].label}" creada (sin asignar). Asígnale responsable desde la lista.`);
              onBack();
            } catch (e) { alert('Error: ' + (e?.message || e)); }
          }} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg px-3 py-1.5 whitespace-nowrap">
            Generar {MAINT_CHECKS[nextType].label.split(' ')[0]}
          </button>
        )}
      </div>

      {route.notes && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-stone-300 bg-stone-200 text-xs text-stone-600">
          <span className="text-stone-500 font-mono">Instrucciones:</span> {route.notes}
        </div>
      )}

      {allDone ? (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-sm text-emerald-700 font-medium text-center">
          ✓ Scouting completado — {completados.length} puntos verificados
        </div>
      ) : pendientes.length > 0 && (
        <div className="mx-4 mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-stone-400">Recorrido pendiente en mapa</div>
          <RoutePreviewMap posts={pendientes} height={220} />
        </div>
      )}

      <div className="px-4 py-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar poste…"
            className="w-full bg-stone-100 border border-stone-300 rounded-lg pl-10 pr-3 py-2.5 text-sm text-stone-950 placeholder-stone-500 focus:outline-none focus:border-emerald-500" />
        </div>
        {isAdmin && selectedForRemoval.size > 0 && (
          <button onClick={async () => {
            if (!window.confirm(`¿Quitar ${selectedForRemoval.size} poste(s) de esta ruta?`)) return;
            setRemoving(true);
            try {
              await removePostsFromRoute(route.id, [...selectedForRemoval]);
              setPostIds(prev => prev.filter(id => !selectedForRemoval.has(id)));
              setSelectedForRemoval(new Set());
            } catch (e) { alert('Error: ' + e.message); }
            setRemoving(false);
          }} disabled={removing}
            className="text-xs bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg px-3 py-2.5 flex-shrink-0">
            {removing ? '…' : `🗑 Quitar (${selectedForRemoval.size})`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-500" /></div>
        ) : (
          <>
            {filtered.length === 0 && !allDone && (
              <div className="px-4 py-6 text-center text-xs text-stone-400">Sin pendientes que coincidan.</div>
            )}
            <div className="divide-y divide-stone-300/50">
            {filtered.map((p, idx) => {
              const stagesDone = Object.values(p.stages).filter(s => s.done).length;
              return (
                <button key={p.id}
                  onClick={() => (isScout || isAdmin) && onSelectPost(p.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-100 text-left">
                  {isAdmin && (
                    <input type="checkbox" checked={selectedForRemoval.has(p.id)}
                      onClick={e => e.stopPropagation()}
                      onChange={() => setSelectedForRemoval(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className="w-4 h-4 accent-red-500 flex-shrink-0" />
                  )}
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-mono text-stone-600 flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-stone-950">{p.id}</span>
                      {p.alias && <span className="text-xs text-brand-600 font-medium">"{p.alias}"</span>}
                      {p.reubicado && <span className="text-[13px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">📍 Reub.</span>}
                      {p.adminApproved && <span className="text-[12px] text-emerald-400">✓ Aprobado</span>}
                    </div>
                    <div className="text-xs text-stone-600 truncate flex items-center gap-1">
                      {p.lat && p.lng ? (
                        <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                           onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 underline truncate">
                          {(p.direccion || `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`).slice(0, 35)}
                        </a>
                      ) : (
                        <span className="truncate">{p.direccion || 'Sin dirección'}</span>
                      )}
                    </div>
                    <div className="text-[12px] text-stone-500">{stagesDone}/7 etapas</div>
                  </div>
                  <div className="text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                    Verificar
                  </div>
                </button>
              );
            })}
            </div>
            {completados.length > 0 && (
              <div className="border-t border-stone-200 mt-2">
                <button onClick={() => setShowDone(v => !v)}
                  className="w-full px-4 py-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-stone-400 hover:bg-stone-50">
                  <span>✓ Completados ({completados.length})</span>
                  <span>{showDone ? '▲' : '▼'}</span>
                </button>
                {showDone && (
                  <div className="divide-y divide-stone-200/60 opacity-70">
                    {completados.map((p) => (
                      <button key={p.id} onClick={() => (isScout || isAdmin) && onSelectPost(p.id)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 text-left">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs text-emerald-700 flex-shrink-0">✓</div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono font-bold text-stone-700">{p.id}</span>
                          {p.alias && <span className="ml-2 text-xs text-brand-600">"{p.alias}"</span>}
                        </div>
                        <span className="text-[11px] text-emerald-600 flex-shrink-0">Verificado</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ScoutVisitForm — formulario de verificación de un poste
// =============================================================================
function ScoutVisitForm({ post, routeId, routeType, stageDefs, userNames, incidents, onBack, onSaved, isAdmin, onApprove, onCreateIncident, onOpenPostDetail, profile }) {
  const formKey = `scout_${post.id}_${routeId || 'no-route'}`;
  const saved = useMemo(() => getPersistedForm(formKey), [formKey]);
  const [restoredFromSave] = useState(() => !!saved);

  const [gps, setGps] = useState({});
  const [generalNotes, setGeneralNotes] = useState(saved?.generalNotes || '');
  const [stageChecks, setStageChecks] = useState(saved?.stageChecks || {});
  const [stagePhotos, setStagePhotos] = useState({}); // { [stageId]: [{ id, file, preview }] }
  const [incidentChecks, setIncidentChecks] = useState(saved?.incidentChecks || {});
  const [saving, setSaving] = useState(false);
  const [pastVisits, setPastVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [showPwd, setShowPwd] = useState(false);

  // Recuperacion de antena: accion rapida (un toque guarda en BD)
  const [antenaRecuperada, setAntenaRecuperada] = useState(post.antenaRecuperada === true || post.antena_recuperada === true);
  const [antenaSaving, setAntenaSaving] = useState(false);
  const [antenaMsg, setAntenaMsg] = useState('');
  const handleRecuperarAntena = async (val) => {
    setAntenaSaving(true); setAntenaMsg('');
    try {
      await setPostAntenaRecuperada(post.id, val, profile?.userId);
      setAntenaRecuperada(val);
      setAntenaMsg(val ? '✓ Antena recuperada y guardada' : 'Marcada como sin recuperar');
    } catch (e) {
      setAntenaMsg('Error: ' + (e?.message || e));
    }
    setAntenaSaving(false);
  };

  // E8: attrs por etapa (pre-filled con datos existentes del poste)
  const [stageAttrs, setStageAttrs] = useState(() => {
    if (saved?.stageAttrs) return saved.stageAttrs;
    const init = {};
    for (const sId of Object.keys(E8_FIELDS)) {
      init[sId] = { ...(post.stages?.[sId]?.attrs || {}) };
    }
    return init;
  });
  // E8: incidencias nuevas por etapa { [stageId]: { type, description } }
  const [stageNewIncidents, setStageNewIncidents] = useState(saved?.stageNewIncidents || {});
  // E8: secciones colapsadas
  const [collapsedSections, setCollapsedSections] = useState({});

  const setStageAttr = (stageId, key, val) => {
    setStageAttrs(prev => ({ ...prev, [stageId]: { ...(prev[stageId] || {}), [key]: val } }));
  };

  const toggleNewIncident = (stageId) => {
    setStageNewIncidents(prev => {
      if (prev[stageId]) { const n = { ...prev }; delete n[stageId]; return n; }
      return { ...prev, [stageId]: { type: '', description: '' } };
    });
  };
  const setNewIncident = (stageId, field, val) => {
    setStageNewIncidents(prev => ({ ...prev, [stageId]: { ...(prev[stageId] || {}), [field]: val } }));
  };

  // Auto-save form state on changes + background
  useEffect(() => {
    const state = { generalNotes, stageChecks, incidentChecks, stageAttrs, stageNewIncidents };
    persistForm(formKey, state);
    return onBackgroundSave(formKey, () => state);
  }, [formKey, generalNotes, stageChecks, incidentChecks, stageAttrs, stageNewIncidents]);

  // Fotos: hidratar desde IndexedDB al montar (sobreviven recargas) y persistir en cada cambio
  const [photosHydrated, setPhotosHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPhotosHydrated(false);
    loadPhotos(formKey).then(p => {
      if (cancelled) return;
      if (p && Object.keys(p).length) {
        // Fusionar lo persistido con lo recién tomado en este montaje (lo nuevo gana)
        setStagePhotos(prev => {
          const merged = { ...p };
          for (const [k, arr] of Object.entries(prev || {})) {
            if (arr?.length) merged[k] = arr;
          }
          return merged;
        });
      }
      setPhotosHydrated(true);
    }).catch(() => { if (!cancelled) setPhotosHydrated(true); });
    return () => { cancelled = true; };
  }, [formKey]);
  // Persistir solo DESPUÉS de hidratar (evita que un guardado vacío borre lo cargado).
  // photosHydrated es state: cuando pasa a true, este efecto vuelve a correr y guarda.
  useEffect(() => {
    if (!photosHydrated) return;
    savePhotos(formKey, stagePhotos);
  }, [formKey, stagePhotos, photosHydrated]);

  useEffect(() => {
    loadPostScoutingVisits(post.id).then(v => { setPastVisits(v); setLoadingVisits(false); }).catch(() => setLoadingVisits(false));
  }, [post.id]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), source: 'device' }),
        () => {}, { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // E8: todas las etapas E2-E7 para inspección
  const e8Stages = (routeType === 'avanzada_internet' || routeType === 'recuperacion_antena')
    ? stageDefs.filter(s => E8_FIELDS[s.id])
    : [];

  // Compat: mantener avanzadaStages para posible uso legacy
  const avanzadaStages = e8Stages;

  const openIncidents = routeType === 'correcciones'
    ? (incidents || []).filter(i => i.postId === post.id && (i.status === 'abierta' || i.status === 'open' || !i.resolvedAt))
    : [];

  const setCheck = (stageId, field, value) => {
    setStageChecks(prev => ({ ...prev, [stageId]: { ...(prev[stageId] || { result: 'ok', notes: '' }), [field]: value } }));
  };
  const setIncCheck = (incId, field, value) => {
    setIncidentChecks(prev => ({ ...prev, [incId]: { ...(prev[incId] || { result: 'sigue_pendiente', notes: '' }), [field]: value } }));
  };

  const addStagePhoto = (stageId, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      setStagePhotos(prev => ({
        ...prev,
        [stageId]: [...(prev[stageId] || []), { id: Date.now() + Math.random(), file, preview: ev.target.result }],
      }));
    };
    reader.readAsDataURL(file);
  };
  const removeStagePhoto = (stageId, photoId) => {
    setStagePhotos(prev => ({
      ...prev,
      [stageId]: (prev[stageId] || []).filter(p => p.id !== photoId),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mantenimiento: avisar de fotos faltantes, pero permitir guardar avances parciales
      if (MAINT_TYPES.includes(routeType)) {
        const ids = MAINT_CHECKS[routeType].groups.flatMap(g => g.items.filter(it => it[2]?.photo !== false).map(it => it[0]));
        const missing = ids.filter(id => !(stagePhotos[id]?.length));
        if (missing.length) {
          const ok = window.confirm('Faltan fotos en: ' + missing.map(id => MAINT_LABELS[id] || id).join(', ') + '.\n\n¿Guardar el avance de todos modos? Podrás completarlo después.');
          if (!ok) { setSaving(false); return; }
        }
      }
      // Upload all stage photos first
      const photoUrlMap = {}; // { stageId: [url] }
      for (const [stageId, photos] of Object.entries(stagePhotos)) {
        if (photos.length > 0) {
          photoUrlMap[stageId] = [];
          for (const photo of photos) {
            const url = await uploadStagePhoto(post.id, `scout_${stageId}`, photo.file);
            photoUrlMap[stageId].push(url);
          }
        }
      }
      if ((routeType === 'avanzada_internet' || routeType === 'recuperacion_antena')) {
        // E8: guardar attrs de cada etapa que el scout modificó
        for (const [stageId, fieldKeys] of Object.entries(E8_FIELDS)) {
          const newAttrs = stageAttrs[stageId] || {};
          const oldAttrs = post.stages?.[stageId]?.attrs || {};
          // Solo actualizar si hay cambios
          const hasChanges = fieldKeys.some(k => {
            const nv = newAttrs[k]; const ov = oldAttrs[k];
            if (nv === undefined || nv === '' || nv === null) return false;
            return JSON.stringify(nv) !== JSON.stringify(ov);
          });
          const uploadedStagePhotos = photoUrlMap[stageId] || [];
          if (hasChanges || uploadedStagePhotos.length > 0) {
            const mergedAttrs = { ...oldAttrs };
            for (const k of fieldKeys) {
              if (newAttrs[k] !== undefined && newAttrs[k] !== '') mergedAttrs[k] = newAttrs[k];
            }
            const existingPhotos = normalizePhotoUrls([...(Array.isArray(post.stages?.[stageId]?.photos) ? post.stages[stageId].photos : []), post.stages?.[stageId]?.photo]);
            const allPhotos = normalizePhotoUrls([...existingPhotos, ...uploadedStagePhotos]);
            await updateStageAtomic(post.id, stageId, {
              attrs: withStagePhotoUrls(mergedAttrs, allPhotos),
              photoUrl: allPhotos[0] || undefined,
              done: post.stages?.[stageId]?.done || undefined,
            });
          }
        }

        // E8: crear incidencias nuevas por etapa
        if (onCreateIncident) {
          for (const [stageId, inc] of Object.entries(stageNewIncidents)) {
            if (inc.type) {
              const sd = stageDefs.find(s => s.id === stageId);
              await onCreateIncident({
                postId: post.id, type: inc.type,
                description: inc.description || `E${sd?.num || '?'} ${sd?.name || stageId}: ${inc.type}`,
                severity: 'alta', stageId, sourceNote: inc.description || '',
              });
            }
          }
        }

        // Registrar visita de scouting
        const checks = Object.entries(stageChecks).map(([stageId, check]) => ({
          stageId, result: check.result || 'ok', notes: check.notes || '',
          photo: photoUrlMap[stageId]?.[0] || null,
        }));
        const hasProblems = checks.some(c => c.result === 'problema') || Object.values(stageNewIncidents).some(i => i.type);
        await createScoutingVisit({
          routeId, postId: post.id, gps,
          generalResult: hasProblems ? 'rechazado' : 'ok',
          generalNotes, stageChecks: checks,
        });
      } else if (routeType === 'correcciones') {
        const checks = Object.entries(incidentChecks).map(([incId, check]) => {
          const inc = openIncidents.find(i => i.id === incId);
          return { stageId: `inc_${incId}`, result: check.result || 'sigue_pendiente', notes: check.notes || '', incidentId: incId };
        });
        await createScoutingVisit({
          routeId, postId: post.id, gps,
          generalResult: checks.every(c => c.result === 'corregido') ? 'ok' : 'observacion',
          generalNotes, stageChecks: checks,
        });
      } else if (routeType === 'reubicaciones') {
        const reubCheck = stageChecks['reubicacion'] || { result: 'ok', notes: '' };
        await createScoutingVisit({
          routeId, postId: post.id, gps,
          generalResult: reubCheck.result === 'problema' ? 'observacion' : 'ok',
          generalNotes: generalNotes || reubCheck.notes || '',
          stageChecks: [{ stageId: 'reubicacion', result: reubCheck.result, notes: reubCheck.notes || '' }],
        });
        // Auto-crear incidencia de reubicación
        if (reubCheck.result === 'problema' && onCreateIncident) {
          await onCreateIncident({
            postId: post.id, type: 'Propuesta de reubicación',
            description: reubCheck.notes || 'Scout propone reubicar este poste',
            severity: 'alta', stageId: null, sourceNote: reubCheck.notes || '',
          });
        }
      } else if (MAINT_TYPES.includes(routeType)) {
        const allIds = MAINT_CHECKS[routeType].groups.flatMap(g => g.items.map(([id]) => id));
        // Guardado parcial: solo los checks que el usuario realmente marcó (o que tienen foto/nota)
        const touchedIds = allIds.filter(id => {
          const c = stageChecks[id];
          return (c && c.result) || (photoUrlMap[id]?.length) || (c?.notes);
        });
        const checks = touchedIds.map(id => {
          const c = stageChecks[id] || {};
          return { stageId: id, result: c.result || 'ok', notes: c.notes || '', photo: photoUrlMap[id]?.[0] || null };
        });
        const hasProblems = checks.some(c => c.result === 'problema');
        const mStageId = MAINT_STAGE[routeType];
        await createScoutingVisit({
          routeId, postId: post.id, gps,
          generalResult: hasProblems ? 'observacion' : 'ok',
          generalNotes, stageChecks: checks,
        });
        // Auto-crear incidencia por cada check marcado como problema → en la etapa de la fase
        if (onCreateIncident) {
          for (const id of touchedIds) {
            const c = stageChecks[id];
            if (c?.result === 'problema') {
              const label = MAINT_LABELS[id] || id;
              await onCreateIncident({
                postId: post.id, type: label,
                description: c.notes || label, severity: 'alta', stageId: mStageId, sourceNote: c.notes || '',
              });
            }
          }
        }

        // Volcar datos de mantenimiento en la etapa del poste (NO destructivo, acumulativo)
        if (mStageId) {
          const oldAttrs = post.stages?.[mStageId]?.attrs || {};
          const maintPhotos = touchedIds.flatMap(id => photoUrlMap[id] || []);
          const existingPhotos = normalizePhotoUrls([...(Array.isArray(post.stages?.[mStageId]?.photos) ? post.stages[mStageId].photos : []), post.stages?.[mStageId]?.photo]);
          const allPhotos = normalizePhotoUrls([...existingPhotos, ...maintPhotos]);
          const prevMant = (oldAttrs.mantenimiento && typeof oldAttrs.mantenimiento === 'object' && !Array.isArray(oldAttrs.mantenimiento)) ? oldAttrs.mantenimiento : {};
          const prevFase = (prevMant[routeType] && typeof prevMant[routeType] === 'object') ? prevMant[routeType] : {};
          const prevChecks = (prevFase.checks && typeof prevFase.checks === 'object') ? prevFase.checks : {};
          // Fusionar: conserva checks de guardados previos, añade/actualiza los recién capturados
          const mergedChecks = { ...prevChecks };
          for (const id of touchedIds) {
            const c = stageChecks[id] || {};
            mergedChecks[id] = {
              label: MAINT_LABELS[id] || id,
              result: c.result || 'ok',
              notas: c.notes || '',
              photos: [...((prevChecks[id]?.photos) || []), ...(photoUrlMap[id] || [])],
            };
          }
          const totalReq = allIds.length;
          const doneCount = Object.keys(mergedChecks).length;
          const mergedAttrs = {
            ...oldAttrs,
            mantenimiento: {
              ...prevMant,
              [routeType]: {
                fase: routeType,
                fecha: new Date().toISOString(),
                resultado: hasProblems ? 'observacion' : 'ok',
                completo: doneCount >= totalReq,
                avance: `${doneCount}/${totalReq}`,
                notas: generalNotes || prevFase.notas || '',
                checks: mergedChecks,
              },
            },
          };
          await updateStageAtomic(post.id, mStageId, {
            attrs: withStagePhotoUrls(mergedAttrs, allPhotos),
            photoUrl: allPhotos[0] || undefined,
            done: post.stages?.[mStageId]?.done || undefined,
          });
        }
      }
      clearPersistedForm(formKey);
      clearPhotos(formKey);
      onSaved();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setSaving(false);
  };

  const rtLabel = ROUTE_TYPE_LABELS[routeType] || ROUTE_TYPE_LABELS.avanzada_internet;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3 sticky top-0 bg-amber-50 z-10">
        <button onClick={() => { clearPersistedForm(formKey); clearPhotos(formKey); onBack(); }} className="p-2 text-stone-600 hover:text-stone-950 -ml-2"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {onOpenPostDetail ? (
              <button type="button"
                      onClick={() => onOpenPostDetail(post)}
                      className="text-sm font-mono font-bold text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2"
                      title="Ver detalle del poste">
                {post.id}
              </button>
            ) : (
              <span className="text-sm font-mono font-bold text-stone-950">{post.id}</span>
            )}
            {post.alias && <span className="text-xs text-brand-600 font-medium">"{post.alias}"</span>}
            <span className={`text-[13px] font-mono uppercase px-1.5 py-0.5 rounded ${rtLabel.bg} ${rtLabel.color}`}>{rtLabel.emoji} {rtLabel.label}</span>
          </div>
          <div className="text-xs truncate">
            {post.lat && post.lng ? (
              <a href={`https://www.google.com/maps?q=${post.lat},${post.lng}`} target="_blank" rel="noopener noreferrer"
                 onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 underline">
                {(post.direccion || 'Ver en Maps').slice(0, 40)}
              </a>
            ) : <span className="text-stone-600">{post.direccion || 'Sin dirección'}</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {restoredFromSave && (
          <div className="p-2.5 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {Object.values(stagePhotos).some(arr => arr?.length)
              ? 'Datos y fotos recuperados de sesión anterior.'
              : 'Datos recuperados de sesión anterior. Las fotos deben re-capturarse.'}
          </div>
        )}
        <div className="p-3 rounded-lg border border-stone-300 bg-stone-100">
          <div className="text-[12px] font-mono uppercase text-stone-500 mb-1">Tu ubicación</div>
          {gps.lat ? (
            <div className="text-xs font-mono text-emerald-600">📡 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} · ±{gps.accuracy}m</div>
          ) : (
            <div className="text-xs text-stone-500">Obteniendo GPS…</div>
          )}
        </div>

        {routeType === 'recuperacion_antena' && (
          <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60">
            <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">📡 Antena de internet</div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className={`text-sm font-mono px-2.5 py-1 rounded border ${antenaRecuperada ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                {antenaRecuperada ? '✓ Antena recuperada' : '⚠ Antena sin recuperar'}
              </span>
              {antenaRecuperada ? (
                <button onClick={() => handleRecuperarAntena(false)} disabled={antenaSaving}
                        className="text-sm font-mono px-4 py-2 rounded bg-stone-200 text-stone-700 hover:bg-stone-300 disabled:opacity-50">
                  {antenaSaving ? '…' : 'Marcar sin recuperar'}
                </button>
              ) : (
                <button onClick={() => handleRecuperarAntena(true)} disabled={antenaSaving}
                        className="text-sm font-bold px-5 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {antenaSaving ? 'Guardando…' : '📡 Recuperar antena'}
                </button>
              )}
            </div>
            {antenaMsg && <div className="mt-2 text-xs font-mono text-emerald-700">{antenaMsg}</div>}
          </div>
        )}

        {/* ===== E8 — INSPECCIÓN SCOUT ===== */}
        {(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') && (
          <div>
            <div className="text-[12px] font-mono uppercase text-stone-500 mb-3">🔍 Inspección Scout — E2 a E7</div>
            <div className="space-y-3">
              {e8Stages.map(s => {
                const d = post.stages[s.id] || {};
                const isDone = d.done;
                const photoUrl = d.photo && typeof d.photo === 'string' && d.photo.startsWith('http') ? d.photo : null;
                const stageInc = (incidents || []).filter(i => i.postId === post.id && i.stageId === s.id && (i.status === 'abierta' || !i.resolvedAt));
                const fieldKeys = E8_FIELDS[s.id] || [];
                const attrs = stageAttrs[s.id] || {};
                const isCollapsed = collapsedSections[s.id];
                const incidentTypes = E8_INCIDENT_TYPES[s.id] || [];
                const newInc = stageNewIncidents[s.id];

                // Obtener definiciones de atributos del STAGE_DEF filtrado por E8_FIELDS
                const fieldDefs = fieldKeys
                  .map(k => (s.attributes || []).find(a => a.key === k))
                  .filter(Boolean);

                return (
                  <div key={s.id} className="border rounded-lg overflow-hidden" style={{ borderColor: `${s.color}40` }}>
                    {/* Header colapsable */}
                    <button type="button" onClick={() => setCollapsedSections(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                      className="w-full p-3 flex items-center gap-2 text-left" style={{ background: `${s.color}10` }}>
                      <span className="text-xs font-mono font-bold" style={{ color: s.color }}>E{s.num}</span>
                      <span className="text-sm font-bold text-stone-800 flex-1">{s.name}</span>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                        {isDone ? '✓' : '—'}
                      </span>
                      {stageInc.length > 0 && <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-red-100 text-red-600">⚠ {stageInc.length}</span>}
                      {newInc?.type && <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">+ inc</span>}
                      <ChevronLeft className={`w-4 h-4 text-stone-400 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-[-270deg]'}`} strokeWidth={1.5} />
                    </button>

                    {!isCollapsed && (
                      <div className="p-3 space-y-3 border-t" style={{ borderColor: `${s.color}30` }}>
                        {/* Foto existente de la etapa */}
                        {photoUrl && (
                          <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={photoUrl} alt={`Foto E${s.num}`} className="w-full max-h-32 object-cover rounded border border-stone-300 hover:border-brand-600" />
                          </a>
                        )}

                        {/* Notas del capturador */}
                        {d.notes && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-stone-700">
                            <span className="font-mono text-stone-500">NOTAS:</span> {d.notes}
                          </div>
                        )}

                        {/* Campos de inspección E8 */}
                        {fieldDefs.length > 0 && (
                          <div className="space-y-2.5">
                            <div className="text-[11px] font-mono uppercase tracking-wider text-stone-400">Datos a verificar</div>
                            {fieldDefs.map(a => {
                              if (a.showWhen && attrs[a.showWhen.key] !== a.showWhen.value) return null;
                              return (
                                <div key={a.key}>
                                  <label className="text-xs text-stone-600 font-mono flex items-center gap-1 mb-1">
                                    {a.label}
                                    {a.sensitive && <span className="text-brand-500 text-[10px]">🔒</span>}
                                  </label>
                                  <StageAttributeField
                                    attr={a}
                                    value={attrs[a.key]}
                                    attrs={attrs}
                                    onChange={(key, val) => setStageAttr(s.id, key, val)}
                                    color={s.color}
                                    showPwd={showPwd}
                                    onTogglePwd={() => setShowPwd(!showPwd)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Foto del scout */}
                        <div>
                          {(stagePhotos[s.id] || []).length > 0 && (
                            <div className="flex gap-2 mb-2 flex-wrap">
                              {(stagePhotos[s.id] || []).map(p => (
                                <div key={p.id} className="relative group">
                                  <img src={p.preview} alt="Foto scout" className="w-16 h-16 object-cover rounded border border-stone-300" />
                                  <button onClick={() => removeStagePhoto(s.id, p.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] shadow opacity-0 group-hover:opacity-100">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                              <Camera className="w-3 h-3" strokeWidth={1.5} /> Foto
                              <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) addStagePhoto(s.id, e.target.files[0]); e.target.value = ''; }} className="hidden" />
                            </label>
                            <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                              <Upload className="w-3 h-3" strokeWidth={1.5} /> Galería
                              <input type="file" accept="image/*" multiple onChange={e => { Array.from(e.target.files || []).forEach(f => addStagePhoto(s.id, f)); e.target.value = ''; }} className="hidden" />
                            </label>
                          </div>
                        </div>

                        {/* Incidencias existentes */}
                        {stageInc.length > 0 && (
                          <div className="space-y-1">
                            {stageInc.map(inc => (
                              <div key={inc.id} className="p-1.5 bg-red-50 border border-red-200 rounded text-xs flex items-center gap-1.5">
                                <span className={`px-1 py-0.5 rounded text-[11px] font-bold flex-shrink-0 ${incBadge(inc.type).c}`}>{incBadge(inc.type).e}</span>
                                <span className="text-stone-700 truncate">{inc.type}{inc.description && inc.description !== inc.type ? ` — ${inc.description.slice(0,40)}` : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Levantar incidencia nueva */}
                        {!newInc ? (
                          <button onClick={() => toggleNewIncident(s.id)}
                            className="w-full py-1.5 border border-dashed border-red-300 text-red-400 hover:text-red-600 hover:border-red-400 text-[11px] font-mono uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3" strokeWidth={1.5} /> Reportar incidencia
                          </button>
                        ) : (
                          <div className="p-2.5 border border-red-300 rounded-lg bg-red-50/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono uppercase text-red-500">Nueva incidencia</span>
                              <button onClick={() => toggleNewIncident(s.id)} className="text-stone-400 hover:text-stone-600"><X className="w-3.5 h-3.5" /></button>
                            </div>
                            <select value={newInc.type || ''} onChange={e => setNewIncident(s.id, 'type', e.target.value)}
                              className="w-full bg-white border border-red-200 px-2.5 py-1.5 text-xs text-stone-800 font-mono rounded focus:outline-none focus:border-red-400">
                              <option value="">— Tipo de incidencia —</option>
                              {incidentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="Otro">Otro</option>
                            </select>
                            <textarea value={newInc.description || ''} onChange={e => setNewIncident(s.id, 'description', e.target.value)}
                              placeholder="Descripción (opcional)…" rows={2}
                              className="w-full bg-white border border-red-200 rounded px-2.5 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-red-400 resize-none" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Incidencias globales del poste (no asociadas a etapa) */}
            {(() => {
              const globalInc = (incidents || []).filter(i => i.postId === post.id && !i.stageId && (i.status === 'abierta' || !i.resolvedAt));
              if (globalInc.length === 0) return null;
              return (
                <div className="mt-4">
                  <div className="text-[12px] font-mono uppercase text-red-500 mb-2">⚠ Otras incidencias ({globalInc.length})</div>
                  <div className="space-y-1">
                    {globalInc.map(inc => (
                      <div key={inc.id} className="p-2 border border-red-300 rounded bg-red-50 text-xs flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${incBadge(inc.type).c}`}>{incBadge(inc.type).e} {inc.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== CORRECCIONES ===== */}
        {routeType === 'correcciones' && (
          <div>
            <div className="text-[12px] font-mono uppercase text-stone-500 mb-3">🔧 Verificar correcciones ({openIncidents.length} incidencias)</div>
            {openIncidents.length === 0 ? (
              <div className="text-xs text-emerald-600 p-4 text-center border border-emerald-300 rounded-lg bg-emerald-50">✓ Sin incidencias pendientes.</div>
            ) : (
              <div className="space-y-3">
                {openIncidents.map(inc => {
                  const sd = stageDefs.find(s => s.id === inc.stageId);
                  const check = incidentChecks[inc.id] || { result: 'sigue_pendiente', notes: '' };
                  return (
                    <div key={inc.id} className="border border-stone-300 rounded-lg overflow-hidden">
                      <div className="p-3 bg-red-50">
                        <div className="flex items-center gap-2 mb-1">
                          {sd && <span className="text-xs font-mono font-bold" style={{ color: sd.color }}>E{sd.num}</span>}
                          <span className={`px-1.5 py-0.5 rounded text-[13px] font-bold ${incBadge(inc.type).c}`}>{incBadge(inc.type).e} {inc.type}</span>
                          <span className="text-xs text-stone-500 ml-auto">{inc.createdAt ? new Date(inc.createdAt).toLocaleDateString('es-MX', { day:'2-digit', month:'short' }) : ''}</span>
                        </div>
                        <div className="text-sm text-stone-800 font-medium">{inc.type}</div>
                        {inc.description && inc.description !== inc.type && <div className="text-xs text-stone-600 mt-1">{inc.description}</div>}
                      </div>
                      <div className="p-3 border-t border-stone-300 space-y-2">
                        <div className="text-[12px] font-mono uppercase text-stone-500">¿Se corrigió?</div>
                        <div className="flex gap-1.5">
                          {['corregido', 'sigue_pendiente'].map(r => {
                            const rl = RESULT_LABELS[r];
                            const active = check.result === r;
                            return (
                              <button key={r} onClick={() => setIncCheck(inc.id, 'result', r)}
                                className={`flex-1 px-2 py-2 text-xs font-mono uppercase tracking-wider border-2 transition-colors rounded font-bold ${
                                  active ? `${rl.bg} ${rl.border} ${rl.color}` : 'border-stone-300 text-stone-500 hover:border-stone-400'
                                }`}>{r === 'corregido' ? '✅ Corregido' : '⏳ Sigue pendiente'}</button>
                            );
                          })}
                        </div>
                        <textarea value={check.notes} onChange={e => setIncCheck(inc.id, 'notes', e.target.value)}
                          placeholder="Observaciones…" rows={2}
                          className="w-full bg-stone-50 border border-stone-300 rounded px-3 py-2 text-xs text-stone-800 placeholder-stone-500 focus:outline-none focus:border-brand-600/50 resize-none" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* REUBICACIONES — verificar ubicación actual y proponer nueva */}
        {routeType === 'reubicaciones' && (
          <div>
            <div className="text-[12px] font-mono uppercase text-stone-500 mb-3">
              📍 Verificación de ubicación
            </div>
            <div className="space-y-3">
              {/* Info del poste */}
              <div className="p-3 border border-stone-300 rounded-lg bg-stone-200">
                <div className="text-xs font-bold text-stone-800 mb-1">Ubicación actual</div>
                <div className="text-xs text-stone-600">
                  {post.lat && post.lng ? `${Number(post.lat).toFixed(6)}, ${Number(post.lng).toFixed(6)}` : 'Sin coordenadas'}
                </div>
                {post.direccion && <div className="text-xs text-stone-600 mt-0.5">{post.direccion}</div>}
                <div className="text-xs text-stone-600 mt-0.5">
                  Etapas: {Object.values(post.stages).filter(s => s.done).length}/7 completadas
                </div>
              </div>

              {/* Veredicto */}
              <div className="p-3 border border-stone-300 rounded-lg space-y-2">
                <div className="text-xs font-bold text-stone-800">¿Necesita reubicación?</div>
                <div className="grid grid-cols-2 gap-2">
                  {['ok', 'problema'].map(r => {
                    const active = (stageChecks['reubicacion']?.result || 'ok') === r;
                    return (
                      <button key={r} onClick={() => setCheck('reubicacion', 'result', r)}
                        className={`px-3 py-2.5 text-xs font-mono uppercase tracking-wider border-2 transition-colors rounded-lg font-bold ${
                          active
                            ? (r === 'ok' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-orange-100 border-orange-500 text-orange-700')
                            : 'border-stone-300 text-stone-500 hover:border-stone-400'
                        }`}>{r === 'ok' ? '✅ Ubicación correcta' : '📍 Necesita reubicación'}</button>
                    );
                  })}
                </div>
                {(stageChecks['reubicacion']?.result === 'problema') && (
                  <textarea value={stageChecks['reubicacion']?.notes || ''} onChange={e => setCheck('reubicacion', 'notes', e.target.value)}
                    placeholder="¿A dónde debe moverse y por qué?"
                    rows={3}
                    className="w-full bg-stone-50 border-2 border-orange-300 rounded-lg px-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-orange-500 resize-none" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* MANTENIMIENTO M1/M2/M3 — checks con foto obligatoria */}
        {MAINT_TYPES.includes(routeType) && (
          <div>
            <div className="text-[12px] font-mono uppercase text-stone-500 mb-3">{MAINT_CHECKS[routeType].emoji} {MAINT_CHECKS[routeType].label}</div>
            <div className="space-y-4">
              {MAINT_CHECKS[routeType].groups.map(g => (
                <div key={g.title} className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-stone-400">{g.title}</div>
                  {g.items.map(([id, label, opts]) => {
                    const photoReq = opts?.photo !== false;
                    const noPhoto = !(stagePhotos[id]?.length);
                    return (
                      <div key={id} className="border border-stone-300 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-stone-800">{label}</span>
                          <div className="flex gap-1">
                            {['ok', 'problema'].map(r => {
                              const active = (stageChecks[id]?.result || 'ok') === r;
                              return (
                                <button key={r} type="button" onClick={() => setCheck(id, 'result', r)}
                                  className={`px-2 py-1 text-[11px] font-mono uppercase rounded border-2 ${active ? (r === 'ok' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-orange-100 border-orange-500 text-orange-700') : 'border-stone-300 text-stone-500 hover:border-stone-400'}`}>
                                  {r === 'ok' ? '✓ Hecho' : '⚠ Problema'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {photoReq && (<div>
                          {(stagePhotos[id] || []).length > 0 && (
                            <div className="flex gap-2 mb-2 flex-wrap">
                              {(stagePhotos[id] || []).map(p => (
                                <div key={p.id} className="relative group">
                                  <img src={p.preview} alt="Foto" className="w-16 h-16 object-cover rounded border border-stone-300" />
                                  <button type="button" onClick={() => removeStagePhoto(id, p.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] shadow">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                              <Camera className="w-3 h-3" strokeWidth={1.5} /> Foto*
                              <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) addStagePhoto(id, e.target.files[0]); e.target.value = ''; }} className="hidden" />
                            </label>
                            <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                              <Upload className="w-3 h-3" strokeWidth={1.5} /> Galería
                              <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) addStagePhoto(id, e.target.files[0]); e.target.value = ''; }} className="hidden" />
                            </label>
                          </div>
                          {noPhoto && <p className="text-[10px] text-brand-500 mt-1">Foto obligatoria</p>}
                        </div>)}
                        <textarea value={stageChecks[id]?.notes || ''} onChange={e => setCheck(id, 'notes', e.target.value)} rows={1}
                          placeholder="Nota (opcional)"
                          className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500 resize-none" />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[12px] font-mono uppercase text-stone-500 mb-2">Notas generales</div>
          <textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} rows={2}
            placeholder="Observaciones adicionales…"
            className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-800 placeholder-stone-500 focus:outline-none focus:border-emerald-500 resize-none" />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-stone-300 bg-amber-50 sticky bottom-0">
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-200 disabled:text-stone-500 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Check className="w-4 h-4" /> Guardar verificación</>}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// CreateRouteModal — admin crea una ruta de scouting
// =============================================================================
function CreateRouteModal({ posts, incidents, isCoordinador, onSelectPost, onClose, onCreated, profile, users: usersFromParent }) {
  const [routeType, setRouteType] = useState(isCoordinador ? 'reubicaciones' : 'avanzada_internet');
  const [name, setName] = useState('');
  const [operatorIds, setOperatorIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState(new Set());
  const [filterUT, setFilterUT] = useState('todas');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAllPosts, setShowAllPosts] = useState(false);

  useEffect(() => { listAllUsers().then(u => setUsers(u)).catch(() => {}); }, []);

  const scouts = users.filter(u => u.role === 'capturador');
  const utList = [...new Set(posts.map(p => p.unidad_territorial))].sort();
  const openIncidents = (incidents || []).filter(i => i.status === 'abierta' || i.status === 'open' || !i.resolvedAt);
  const postIdsWithIncidents = [...new Set(openIncidents.map(i => i.postId))];
  const postsWithIncidents = posts.filter(p => postIdsWithIncidents.includes(p.id));

  useEffect(() => {
    if (routeType === 'correcciones') setSelectedPostIds(new Set(postIdsWithIncidents));
    else setSelectedPostIds(new Set());
    setShowAllPosts(false);
  }, [routeType]);

  const filteredPosts = useMemo(() => {
    let source = posts;
    if (routeType === 'recuperacion_antena') {
      // Recuperación de antena: postes con E5 (internet) completado y E6 (conexión) pendiente
      source = showAllPosts
        ? [...posts].sort((a, b) => {
            const aT = a.stages?.internet?.done && !a.stages?.conexion_poste?.done;
            const bT = b.stages?.internet?.done && !b.stages?.conexion_poste?.done;
            return (aT === bT) ? 0 : aT ? -1 : 1;
          })
        : posts.filter(p => p.stages?.internet?.done && !p.stages?.conexion_poste?.done);
    } else if (routeType === 'avanzada_internet') {
      if (showAllPosts) {
        // Mostrar todos, pero ordenar: sin internet primero
        source = [...posts].sort((a, b) => {
          const aNoInt = !a.stages?.internet?.done;
          const bNoInt = !b.stages?.internet?.done;
          if (aNoInt && !bNoInt) return -1;
          if (!aNoInt && bNoInt) return 1;
          return 0;
        });
      } else {
        // Filtro original: solo postes sin internet instalado
        source = posts.filter(p => !p.stages?.internet?.done);
        // Ordenar: sin fotos primero (necesitan visita), con fotos después
        source = [...source].sort((a, b) => {
          const aHasPhotos = (a.stages?.parado?.photo && String(a.stages.parado.photo).startsWith('http')) || (a.stages?.camaras?.photo && String(a.stages.camaras.photo).startsWith('http'));
          const bHasPhotos = (b.stages?.parado?.photo && String(b.stages.parado.photo).startsWith('http')) || (b.stages?.camaras?.photo && String(b.stages.camaras.photo).startsWith('http'));
          if (!aHasPhotos && bHasPhotos) return -1;
          if (aHasPhotos && !bHasPhotos) return 1;
          return 0;
        });
      }
    } else if (routeType === 'correcciones') {
      if (showAllPosts) {
        source = [...posts].sort((a, b) => {
          const aInc = openIncidents.filter(i => i.postId === a.id).length;
          const bInc = openIncidents.filter(i => i.postId === b.id).length;
          if (aInc > 0 && bInc === 0) return -1;
          if (aInc === 0 && bInc > 0) return 1;
          return bInc - aInc;
        });
      } else {
        // Filtro original: todos, ordenados por incidencias
        source = [...posts].sort((a, b) => {
          const aInc = openIncidents.filter(i => i.postId === a.id).length;
          const bInc = openIncidents.filter(i => i.postId === b.id).length;
          if (aInc > 0 && bInc === 0) return -1;
          if (aInc === 0 && bInc > 0) return 1;
          return bInc - aInc;
        });
      }
    }
    // reubicaciones: todos los postes
    return source.filter(p => {
      if (filterUT !== 'todas' && p.unidad_territorial !== filterUT) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!p.id.toLowerCase().includes(q) && !(p.direccion||'').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [posts, routeType, postsWithIncidents, filterUT, search, showAllPosts]);

  // Coordinador solo puede crear reubicaciones
  const availableTypes = isCoordinador
    ? { reubicaciones: ROUTE_TYPE_LABELS.reubicaciones }
    : ROUTE_TYPE_LABELS;

  const togglePost = (id) => { setSelectedPostIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const selectAll = () => setSelectedPostIds(new Set(filteredPosts.map(p => p.id)));
  const clearAll = () => setSelectedPostIds(new Set());

  const handleSave = async () => {
    if (!name.trim() || operatorIds.length === 0 || selectedPostIds.size === 0) return;
    setSaving(true); setError(null);
    try {
      await createScoutingRoute({ name: name.trim(), operatorIds, postIds: [...selectedPostIds], notes, routeType });
      onCreated();
    } catch (e) { setError(e?.message || 'Error'); }
    setSaving(false);
  };

  const rtLabel = ROUTE_TYPE_LABELS[routeType];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-stone-50 border border-stone-300 rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-stone-300 sticky top-0 bg-stone-50 z-10">
          <h3 className="text-base font-bold text-stone-950">Crear ruta de scouting</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-2">Tipo de ruta *</label>
            <div className={`grid gap-2 ${Object.keys(availableTypes).length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {Object.entries(availableTypes).map(([key, rt]) => {
                const active = routeType === key;
                const info = {
                  avanzada_internet: { desc: 'Verificar avance antes de instalar internet', filter: '📋 Postes sin internet' },
                  recuperacion_antena: { desc: 'Recuperar antenas (Etapa 6), similar a Avanzada Internet', filter: '📋 Postes sin internet' },
                  correcciones: { desc: 'Re-verificar postes con problemas reportados', filter: '⚠️ Postes con incidencias' },
                  reubicaciones: { desc: 'Evaluar si un poste necesita moverse', filter: '📌 Todos los postes' },
                }[key] || {};
                return (
                  <button key={key} onClick={() => setRouteType(key)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${active ? `${rt.bg} border-current ${rt.color} shadow-sm` : 'border-stone-300 text-stone-500 hover:border-stone-400'}`}>
                    <div className="text-2xl mb-1">{rt.emoji}</div>
                    <div className="text-xs font-bold">{rt.label}</div>
                    <div className="text-[13px] mt-1 opacity-70 leading-tight">{info.desc}</div>
                    {active && <div className="text-[13px] mt-1.5 font-mono font-bold">{info.filter}</div>}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Nombre de la ruta *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') ? 'Ej: Avanzada Internet Zona Norte' : 'Ej: Correcciones semana 17'}
              className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-emerald-500" />
          </div>
          {/* Operadores (N) */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Asignar operadores * <span className="text-stone-400">({operatorIds.length})</span></label>
            <div className="max-h-40 overflow-auto border border-stone-300 rounded-lg bg-stone-100 divide-y divide-stone-200">
              {scouts.length === 0 && <div className="px-3 py-2 text-xs text-stone-400">No hay capturadores disponibles</div>}
              {scouts.map(u => {
                const on = operatorIds.includes(u.userId);
                return (
                  <button key={u.userId} type="button"
                    onClick={() => setOperatorIds(prev => on ? prev.filter(x => x !== u.userId) : [...prev, u.userId])}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left ${on ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-stone-200 text-stone-700'}`}>
                    <span>{u.displayName || u.email}</span>
                    <span className="text-xs">{on ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-stone-400">Puedes asignar varios; cualquiera puede verificar los puntos.</p>
          </div>
          {/* Creado por (admin logueado) */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Creado por</label>
            <div className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-700">
              👤 {profile?.displayName || profile?.email || 'Usuario actual'}
            </div>
          </div>
          {/* Instrucciones */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Instrucciones (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas para el scout…"
              className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-emerald-500 resize-none" />
          </div>
          {/* Postes */}
          <div>
            {/* Toggle Sugeridos / Todos */}
            {((routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') || routeType === 'correcciones') && (
              <div className="flex items-center gap-3 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-stone-700">
                    {showAllPosts
                      ? `Mostrando todos los ${posts.length} postes`
                      : (routeType === 'avanzada_internet' || routeType === 'recuperacion_antena')
                        ? `${posts.filter(p => !p.stages?.internet?.done).length} postes sin internet`
                        : `${postsWithIncidents.length} postes con incidencias`}
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5 truncate">
                    {showAllPosts
                      ? 'Todos los postes son seleccionables'
                      : `Filtro recomendado para "${ROUTE_TYPE_LABELS[routeType]?.label}"`}
                  </div>
                </div>
                <div className="flex border border-amber-300 rounded-lg overflow-hidden flex-shrink-0">
                  <button onClick={() => setShowAllPosts(false)}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${!showAllPosts ? 'bg-amber-500 text-white' : 'bg-white text-stone-600 hover:bg-amber-50'}`}>
                    Sugeridos
                  </button>
                  <button onClick={() => setShowAllPosts(true)}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${showAllPosts ? 'bg-amber-500 text-white' : 'bg-white text-stone-600 hover:bg-amber-50'}`}>
                    Todos ({posts.length})
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-stone-600">
                {(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena')
                  ? `📋 ${showAllPosts ? 'Todos los postes' : 'Postes sin internet'} (${selectedPostIds.size} de ${filteredPosts.length})`
                  : routeType === 'correcciones' ? `⚠️ ${showAllPosts ? 'Todos los postes' : 'Postes con incidencias'} (${selectedPostIds.size} de ${filteredPosts.length})`
                  : `📌 Todos los postes (${selectedPostIds.size} de ${filteredPosts.length})`}
              </label>
              {((routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') || routeType === 'reubicaciones' || routeType === 'correcciones') && (
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-[12px] text-emerald-500 hover:text-emerald-600">Todos</button>
                  {(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') && (
                    <button onClick={() => {
                      const noPhoto = filteredPosts.filter(p => {
                        const has = (p.stages?.parado?.photo && String(p.stages.parado.photo).startsWith('http')) || (p.stages?.camaras?.photo && String(p.stages.camaras.photo).startsWith('http'));
                        return !has;
                      });
                      setSelectedPostIds(new Set(noPhoto.map(p => p.id)));
                    }} className="text-[12px] text-red-500 hover:text-red-600">🚶 Solo sin foto</button>
                  )}
                  {routeType === 'correcciones' && (
                    <button onClick={() => {
                      const withInc = filteredPosts.filter(p => openIncidents.some(i => i.postId === p.id));
                      setSelectedPostIds(new Set(withInc.map(p => p.id)));
                    }} className="text-[12px] text-orange-500 hover:text-orange-600">⚠️ Solo con incidencias</button>
                  )}
                  <button onClick={clearAll} className="text-[12px] text-stone-500 hover:text-stone-900">Limpiar</button>
                </div>
              )}
            </div>
            <div className="flex gap-2 mb-2">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                className="flex-1 bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-950 focus:outline-none focus:border-emerald-500" />
              <select value={filterUT} onChange={e => setFilterUT(e.target.value)}
                className="bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-950">
                <option value="todas">Todas las UT</option>
                {utList.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className={`${showAllPosts ? 'max-h-72' : 'max-h-48'} overflow-y-auto border border-stone-300 rounded-lg divide-y divide-stone-300/50`}>
              {filteredPosts.slice(0, showAllPosts ? 200 : 100).map(p => {
                const pInc = openIncidents.filter(i => i.postId === p.id);
                const hasE3Photo = p.stages?.parado?.photo && String(p.stages.parado.photo).startsWith('http');
                const hasE4Photo = p.stages?.camaras?.photo && String(p.stages.camaras.photo).startsWith('http');
                const hasPhotos = hasE3Photo || hasE4Photo;
                const stagesDone = ['dado','parado','camaras','internet','conexion_poste','centro'].filter(sid => p.stages?.[sid]?.done).length;
                const hasInternet = !!p.stages?.internet?.done;
                return (
                  <label key={p.id} className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer text-xs ${
                    hasInternet && showAllPosts && (routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') ? 'bg-emerald-50/50 hover:bg-emerald-100/30'
                    : !hasPhotos && (routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') ? 'bg-amber-50 hover:bg-amber-100/50' : 'hover:bg-stone-100'}`}>
                    <input type="checkbox" checked={selectedPostIds.has(p.id)} onChange={() => togglePost(p.id)}  className="w-4 h-4 accent-emerald-500 flex-shrink-0" />
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onSelectPost) onSelectPost(p); }}
                      className="font-mono text-stone-800 flex-shrink-0 hover:text-blue-600 hover:underline cursor-pointer">{p.id}</button>
                    {p.alias && <span className="text-brand-600 text-[12px] font-medium flex-shrink-0">"{p.alias}"</span>}
                    {p.reubicado && <span className="text-[13px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">📍</span>}
                    {(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') && (
                      <>
                        {showAllPosts && hasInternet && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 flex-shrink-0">✅ Internet</span>
                        )}
                        {(!showAllPosts || !hasInternet) && (
                          <span className={`text-[13px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${!hasPhotos ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {!hasPhotos ? '🚶 Ir' : '📷 Foto'}
                          </span>
                        )}
                      </>
                    )}
                    <span className="truncate flex-1">
                      {p.lat && p.lng ? (
                        <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                           onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 underline">
                          📍 {(p.direccion && !p.direccion.startsWith('Lat ') ? p.direccion : `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`).slice(0, 30)}
                        </a>
                      ) : <span className="text-stone-500">{p.direccion || '—'}</span>}
                    </span>
                    {(routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') && <span className="text-[12px] text-stone-500 flex-shrink-0">{stagesDone}/6</span>}
                    {routeType === 'correcciones' && pInc.length > 0 && (
                      <span className="flex gap-1 flex-shrink-0 flex-wrap justify-end" style={{maxWidth:'120px'}}>
                        {pInc.slice(0, 2).map((inc, i) => (
                          <span key={i} className={`text-[8px] font-bold px-1 py-0.5 rounded ${incBadge(inc.type).c}`}>{incBadge(inc.type).e}</span>
                        ))}
                        {pInc.length > 2 && <span className="text-[8px] text-stone-500">+{pInc.length - 2}</span>}
                      </span>
                    )}
                    {routeType === 'correcciones' && pInc.length === 0 && (
                      <span className="text-[13px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 flex-shrink-0">✓</span>
                    )}
                    <span className="text-stone-500 flex-shrink-0">{p.unidad_territorial}</span>
                  </label>
                );
              })}
              {filteredPosts.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-stone-500">
                  {search.trim() || filterUT !== 'todas'
                    ? 'No hay postes que coincidan con los filtros.'
                    : (routeType === 'avanzada_internet' || routeType === 'recuperacion_antena') ? 'No hay postes sin internet instalado.' : 'No hay postes disponibles.'}
                </div>
              )}
            </div>
          </div>
          {error && <div className="text-xs text-red-500 bg-red-100 border border-red-300 rounded-lg p-2">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm rounded-lg py-3">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !name.trim() || operatorIds.length === 0 || selectedPostIds.size === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-200 text-white text-sm font-medium rounded-lg py-3 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {rtLabel.emoji} Crear ({selectedPostIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
