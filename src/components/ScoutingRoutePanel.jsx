// components/ScoutingRoutePanel.jsx
// Drawer para armar rutas de scouting sobre el mapa de MapView.
// Guarda usando el MISMO sistema que la vista Scouting (lib/data.js), para que
// las rutas del mapa aparezcan en Scouting y se les pueda dar seguimiento.
// Props:
//   map          : ol/Map (mapRef.current)
//   poles        : postes normalizados { id, clave, lat, lng, ut, etapa }
//   selected     : array ordenado de postes de la ruta (estado del padre)
//   setSelected  : setter del array de la ruta
//   userLoc      : { lat, lng, accuracy } | null
//   onRequestGPS : () => void
//   userNames    : { userId: nombre }  (para asignar scout)
//   onClose      : () => void

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Compass, Trash2, Navigation, RefreshCw, MapPin, Crosshair } from 'lucide-react';
import { createRouteLayer } from '../lib/routeLayer.js';
import {
  optimizeRoute, routeLength, haversine, googleMapsUrl, exceedsGmapsLimit, resolveByIds,
} from '../lib/scoutingRoutes.js';
import { createScoutingRoute, loadScoutingRoutes, deleteScoutingRoute } from '../lib/data.js';
import { listAllUsers } from '../lib/auth.js';

const ETAPA_OPTS = ['marca', 'dado', 'parado', 'camaras', 'internet', 'conexion_poste', 'centro', 'completado', 'bloqueado'];
const ROUTE_TYPES = [
  { id: 'avanzada_internet', label: '🌐 Avanzada Internet' },
  { id: 'recuperacion_antena', label: '🛰️ Recuperación de Antena' },
  { id: 'instalacion_camaras', label: '📷 Instalación de cámaras' },
  { id: 'correcciones', label: '🔧 Correcciones' },
  { id: 'reubicaciones', label: '📍 Reubicaciones' },
  { id: 'm1_mantenimiento', label: '🔧 M1 Mantenimiento' },
  { id: 'm2_poe_alineacion', label: '📡 M2 PoE/Alineación' },
  { id: 'm3_centro', label: '🏢 M3 Centro' },
];
const STATUS_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', completada: 'Completada' };

export default function ScoutingRoutePanel({ map, poles = [], selected = [], setSelected, userLoc = null, onRequestGPS, userNames = {}, onClose }) {
  const routeRef = useRef(null);
  const [query, setQuery] = useState('');
  const [etapa, setEtapa] = useState('');
  const [ut, setUt] = useState('');
  const [nearMe, setNearMe] = useState(false);
  const [nombre, setNombre] = useState('');
  const [routeType, setRouteType] = useState('avanzada_internet');
  const [operatorIds, setOperatorIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  const poolById = useMemo(() => new Map(poles.map((p) => [p.id, p])), [poles]);
  const utOpts = useMemo(() => [...new Set(poles.map((p) => p.ut).filter(Boolean))].sort(), [poles]);
  const scoutOpts = useMemo(() => allUsers.filter((u) => u.role === 'capturador').map((u) => [u.userId, u.displayName || u.email || 'Usuario']), [allUsers]);
  const allNames = useMemo(() => {
    const m = { ...(userNames || {}) };
    for (const u of allUsers) m[u.userId] = u.displayName || u.email || m[u.userId] || 'Usuario';
    return m;
  }, [allUsers, userNames]);

  useEffect(() => {
    if (!map) return undefined;
    routeRef.current = createRouteLayer(map);
    return () => routeRef.current?.remove();
  }, [map]);

  useEffect(() => { listAllUsers().then(setAllUsers).catch(() => {}); }, []);

  useEffect(() => {
    routeRef.current?.render(selected, { fit: false });
  }, [selected]);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = poles.filter(
      (p) =>
        (!etapa || p.etapa === etapa) &&
        (!ut || p.ut === ut) &&
        (!q || String(p.clave ?? '').toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q)),
    );
    if (nearMe && userLoc) list = [...list].sort((a, b) => haversine(userLoc, a) - haversine(userLoc, b));
    return list.slice(0, 200);
  }, [poles, query, etapa, ut, nearMe, userLoc]);

  const toggle = (p) =>
    setSelected((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));

  const move = (i, dir) =>
    setSelected((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const optimize = () => {
    setSelected((prev) => optimizeRoute(prev, 0));
    setTimeout(() => routeRef.current?.fit(), 60);
  };

  const toggleNear = () => {
    if (!userLoc) onRequestGPS?.();
    setNearMe((v) => !v);
  };

  const distKm = (routeLength(selected) / 1000).toFixed(2);
  const tooMany = exceedsGmapsLimit(selected);

  const openMaps = () => {
    const url = googleMapsUrl(selected);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const loadSaved = async () => {
    setLoadingSaved(true);
    try {
      setSaved(await loadScoutingRoutes());
    } catch (e) {
      setMsg('Error al cargar rutas: ' + (e?.message ?? String(e)));
      setSaved([]);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleSave = async () => {
    if (!nombre.trim() || selected.length < 2) {
      setMsg('Pon un nombre y al menos 2 postes.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await createScoutingRoute({
        name: nombre.trim(),
        operatorIds,
        postIds: selected.map((p) => p.id),
        notes: '',
        routeType,
      });
      setMsg('Ruta guardada ✓ — ya aparece en Scouting');
      await loadSaved();
    } catch (e) {
      setMsg('Error al guardar: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  const openRoute = (r) => {
    setSelected(resolveByIds(r.post_ids, poolById));
    setNombre(r.name || '');
    if (r.route_type) setRouteType(r.route_type);
    setOperatorIds(r.operator_ids?.length ? r.operator_ids : (r.scout_id ? [r.scout_id] : []));
    setTimeout(() => routeRef.current?.fit(), 80);
  };

  const removeRoute = async (id) => {
    try {
      await deleteScoutingRoute(id);
      setSaved((prev) => (prev || []).filter((r) => r.id !== id));
    } catch (e) {
      setMsg('Error al borrar: ' + (e?.message ?? String(e)));
    }
  };

  return (
    <div className="absolute inset-y-0 right-0 z-50 flex w-full flex-col bg-white/95 font-mono text-[13px] text-stone-700 shadow-2xl backdrop-blur-sm sm:w-96 border-l border-stone-300">
      <div className="flex items-center justify-between border-b border-stone-300 px-4 py-3">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-brand-500" strokeWidth={1.5} />
          <span className="uppercase tracking-widest text-stone-600">Ruta de scouting</span>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex items-center gap-1.5 bg-brand-50/60 px-4 py-1.5 text-[11px] text-brand-700">
        <MapPin className="h-3 w-3" /> Toca un poste en el mapa para agregarlo a la ruta.
      </div>

      <div className="space-y-2 border-b border-stone-200 px-4 py-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar clave o ID…"
          className="w-full rounded border border-stone-300 bg-white px-2 py-1 outline-none focus:border-brand-400" />
        <div className="grid grid-cols-2 gap-2">
          <select value={ut} onChange={(e) => setUt(e.target.value)}
            className="w-full rounded border border-stone-300 bg-white px-2 py-1 outline-none focus:border-brand-400">
            <option value="">Todas las UT</option>
            {utOpts.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)}
            className="w-full rounded border border-stone-300 bg-white px-2 py-1 outline-none focus:border-brand-400">
            <option value="">Todas las etapas</option>
            {ETAPA_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={toggleNear}
          className={`flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1 ${nearMe ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-stone-300 hover:bg-stone-50'}`}>
          <Crosshair className="h-3.5 w-3.5" /> {nearMe ? 'Cerca de mí: ON' : 'Cerca de mí'}
        </button>
        {nearMe && !userLoc && <p className="text-[11px] text-amber-600">Activando GPS… toca de nuevo si no aparece tu ubicación.</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <p className="px-2 pb-1 text-[11px] uppercase tracking-widest text-stone-400">Disponibles ({filtered.length})</p>
        {filtered.map((p) => {
          const on = selectedIds.has(p.id);
          const dist = nearMe && userLoc ? (haversine(userLoc, p) / 1000).toFixed(1) + ' km' : null;
          return (
            <button key={p.id} onClick={() => toggle(p)}
              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${on ? 'bg-brand-50 text-brand-700' : 'hover:bg-stone-50'}`}>
              <span className="min-w-0 truncate">
                <span className="font-bold text-brand-500">{p.clave ?? p.id}</span>
                <span className="ml-2 text-[11px] text-stone-400">{p.ut || p.etapa}</span>
              </span>
              <span className="ml-2 flex-shrink-0 text-[11px] text-stone-500">{dist || (on ? '− quitar' : '+ añadir')}</span>
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="max-h-44 overflow-auto border-t border-stone-200 px-2 py-2">
          <p className="px-2 pb-1 text-[11px] uppercase tracking-widest text-stone-400">Orden de visita ({selected.length})</p>
          {selected.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-50">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">{i + 1}</span>
              <span className="flex-1 truncate">{p.clave ?? p.id}</span>
              <button onClick={() => move(i, -1)} className="px-1 text-stone-400 hover:text-stone-700">↑</button>
              <button onClick={() => move(i, +1)} className="px-1 text-stone-400 hover:text-stone-700">↓</button>
              <button onClick={() => toggle(p)} className="px-1 text-stone-400 hover:text-brand-600">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-stone-300 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <span>{distKm} km en línea recta</span>
          <span>{selected.length} paradas</span>
        </div>

        <div className="flex gap-2">
          <button onClick={optimize} disabled={selected.length < 3}
            className="flex-1 rounded bg-stone-800 px-2 py-1.5 text-white hover:bg-stone-700 disabled:opacity-40">Optimizar orden</button>
          <button onClick={() => setSelected([])} disabled={!selected.length}
            className="rounded border border-stone-300 px-2 py-1.5 hover:bg-stone-50 disabled:opacity-40">Limpiar</button>
        </div>

        <button onClick={openMaps} disabled={selected.length < 2}
          className="flex w-full items-center justify-center gap-2 rounded bg-emerald-600 px-2 py-1.5 text-white hover:bg-emerald-500 disabled:opacity-40">
          <Navigation className="h-3.5 w-3.5" strokeWidth={2} /> Abrir en Google Maps
        </button>
        {tooMany && <p className="text-[11px] text-amber-600">⚠ Google Maps tomará sólo las primeras 11 paradas.</p>}

        {/* Datos para Scouting */}
        <select value={routeType} onChange={(e) => setRouteType(e.target.value)}
          className="w-full rounded border border-stone-300 bg-white px-2 py-1 outline-none focus:border-brand-400">
          {ROUTE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-widest text-stone-400">Operadores ({operatorIds.length})</div>
          <div className="max-h-28 overflow-auto rounded border border-stone-300 bg-white divide-y divide-stone-100">
            {scoutOpts.length === 0 && <div className="px-2 py-1 text-[11px] text-stone-400">Sin capturadores</div>}
            {scoutOpts.map(([id, name]) => {
              const on = operatorIds.includes(id);
              return (
                <button key={id} type="button"
                  onClick={() => setOperatorIds((prev) => on ? prev.filter((x) => x !== id) : [...prev, id])}
                  className={`flex w-full items-center justify-between px-2 py-1 text-left ${on ? 'bg-brand-50 text-brand-700' : 'hover:bg-stone-50'}`}>
                  <span className="truncate">{name}</span>
                  <span className="ml-2 flex-shrink-0 text-[11px]">{on ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la ruta"
            className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 outline-none focus:border-brand-400" />
          <button onClick={handleSave} disabled={saving}
            className="rounded bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-500 disabled:opacity-40">{saving ? '…' : 'Guardar'}</button>
        </div>
        {msg && <p className="text-[11px] text-stone-600">{msg}</p>}

        <div className="border-t border-stone-200 pt-2">
          <button onClick={loadSaved}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-stone-400 hover:text-stone-700">
            <RefreshCw className={`h-3 w-3 ${loadingSaved ? 'animate-spin' : ''}`} /> Rutas en Scouting
          </button>
          {saved && (
            <div className="mt-1 max-h-40 overflow-auto">
              {saved.length === 0 && <p className="px-1 py-1 text-[11px] text-stone-400">Sin rutas guardadas.</p>}
              {saved.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-stone-50">
                  <button onClick={() => openRoute(r)} className="flex-1 truncate text-left">
                    <span className="font-bold text-stone-700">{r.name || r.id}</span>
                    <span className="ml-2 text-[11px] text-stone-400">
                      {(r.total_posts ?? r.post_ids?.length ?? 0)} paradas · {STATUS_LABEL[r.status] || r.status || 'pendiente'}
                      {r.operator_ids?.length > 1 ? ` · ${r.operator_ids.length} operadores` : (allNames[r.scout_id] ? ' · ' + allNames[r.scout_id] : '')}
                    </span>
                  </button>
                  <button onClick={() => removeRoute(r.id)} className="px-1 text-stone-400 hover:text-brand-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
