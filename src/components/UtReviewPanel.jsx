import React, { useState, useMemo, useEffect } from 'react';
import { assignIpsToPost, registrarAvanceConPendientes } from '../lib/data.js';

const EQUIPOS = [
  { key: 'antena_5ac', label: 'Antena 5AC', icon: '📶' },
  { key: 'antena_ap', label: 'Antena AP', icon: '📡' },
  { key: 'camara_ptz', label: 'Cámara PTZ', icon: '🎥' },
  { key: 'camara_bullet_1', label: 'Cámara Bullet 1', icon: '🎥' },
  { key: 'camara_bullet_2', label: 'Cámara Bullet 2', icon: '🎥' },
  { key: 'boton_panico', label: 'Botón de Pánico', icon: '🚨' },
];

const isValidIpFormat = (ip) => {
  if (!ip || !ip.trim()) return true;
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip.trim());
};

const FASE_FISICA = ['marca', 'dado', 'parado', 'camaras'];
const etapasFisicasPendientes = (post) =>
  FASE_FISICA.filter(s => !post?.stages?.[s]?.done);

export default function UtReviewPanel({ ut, posts, stageDefs, onClose, onPostClick, onChangeEstado, onIrAlPunto, onRefresh }) {
  const [savingId, setSavingId] = useState(null);
  const [viewMode, setViewMode] = useState('review');
  const [selectedModem, setSelectedModem] = useState(null);
  const [selectedE4Ids, setSelectedE4Ids] = useState(new Set());
  const [equiposByPost, setEquiposByPost] = useState({});
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const [expandedEquipos, setExpandedEquipos] = useState(new Set());
  const [savingIps, setSavingIps] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [utPolygonGeom, setUtPolygonGeom] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(null);
  const [pendientesWarning, setPendientesWarning] = useState(null);

  // Cargar poligono de la UT cuando entre a modo preview
  useEffect(() => {
    if (viewMode !== 'preview' || utPolygonGeom || !ut?.nombre) return;
    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const target = norm(ut.nombre);
    fetch(`${import.meta.env.BASE_URL}ut_boundaries.geojson`)
      .then(r => r.ok ? r.json() : null)
      .then(gj => {
        if (!gj) return;
        const match = (gj.features || []).find(ft => norm(ft.properties?.nombre_uat) === target);
        if (match) setUtPolygonGeom(match.geometry);
      })
      .catch(err => console.error('Error cargando poligono UT:', err));
  }, [viewMode, ut?.nombre, utPolygonGeom])

  if (!ut) return null;

  const total = posts.length;
  const verificados = posts.filter(p => p.estado_verificacion === 'verificado').length;
  const noExiste = posts.filter(p => p.estado_verificacion === 'no_existe').length;
  const noDefinido = total - verificados - noExiste;

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
      badgeText = 'Faltan ' + (meta - total);
      badgeBg = 'bg-yellow-100 text-yellow-700 border-yellow-400';
      barColor = 'bg-gradient-to-r from-yellow-500 to-yellow-400';
      progressPct = meta > 0 ? Math.round((total / meta) * 100) : 0;
    } else {
      badgeText = 'Sobran ' + (total - meta);
      badgeBg = 'bg-red-100 text-red-700 border-red-400';
      barColor = 'bg-gradient-to-r from-red-500 to-red-400';
      progressPct = 100;
    }
  }

  const postesConModem = useMemo(() => {
    return posts.filter(p => {
      const e5 = p.stages?.internet;
      if (!e5 || !e5.done) return false;
      const tipoModem = e5.attrs?.tipo_modem;
      return tipoModem && tipoModem.trim() !== '';
    });
  }, [posts]);

  const e4Assignments = useMemo(() => {
    const map = new Map();
    postesConModem.forEach(modem => {
      const distribuyeA = modem.stages?.internet?.attrs?.distribuye_a || [];
      if (Array.isArray(distribuyeA)) {
        distribuyeA.forEach(postId => { map.set(postId, modem.id); });
      }
    });
    return map;
  }, [postesConModem]);

  const postesE4 = useMemo(() => {
    return posts.filter(p => {
      if (!p.stages?.camaras?.done) return false;
      if (p.stages?.internet?.attrs?.tipo_modem) return false;
      return true;
    });
  }, [posts]);

  const ipConflicts = useMemo(() => {
    const ipMap = new Map();
    Object.entries(equiposByPost).forEach(([postId, equipos]) => {
      Object.entries(equipos).forEach(([eqKey, data]) => {
        if (data.no_instalado) return;
        const ip = data.ip?.trim();
        if (!ip) return;
        if (!ipMap.has(ip)) ipMap.set(ip, []);
        ipMap.get(ip).push({ postId, equipoKey: eqKey });
      });
    });
    const conflicts = new Map();
    ipMap.forEach((entries, ip) => {
      if (entries.length > 1) {
        entries.forEach(({ postId, equipoKey }) => {
          conflicts.set(postId + ':' + equipoKey, { ip, conflictsWith: entries.filter(e => !(e.postId === postId && e.equipoKey === equipoKey)) });
        });
      }
    });
    return conflicts;
  }, [equiposByPost]);

  const handleChange = async (post, nuevoEstado) => {
    if (!onChangeEstado) return;
    if (post.estado_verificacion === nuevoEstado) return;
    setSavingId(post.id);
    try { await onChangeEstado(post.id, nuevoEstado); } finally { setSavingId(null); }
  };

  const renderEstadoBtn = (post, valor, label, activeStyle) => {
    const isActive = (post.estado_verificacion || 'no_definido') === valor;
    const baseStyle = 'px-2 py-0.5 rounded border text-xs font-medium transition-colors';
    const inactiveStyle = 'bg-white text-stone-500 border-stone-300 hover:bg-stone-100';
    const isSaving = savingId === post.id;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); handleChange(post, valor); }} disabled={isSaving}
        className={`${baseStyle} ${isActive ? activeStyle : inactiveStyle} ${isSaving ? 'opacity-50 cursor-wait' : ''}`}>
        {label}
      </button>
    );
  };

  const goToAssignMode = (modemPost) => {
    setSelectedModem(modemPost);
    const yaAsignados = modemPost.stages?.internet?.attrs?.distribuye_a || [];
    setSelectedE4Ids(new Set(Array.isArray(yaAsignados) ? yaAsignados : []));
    setViewMode('assign');
  };

  const backToModem = () => {
    setSelectedModem(null);
    setSelectedE4Ids(new Set());
    setEquiposByPost({});
    setExpandedPosts(new Set());
    setExpandedEquipos(new Set());
    setSaveError(null);
    setViewMode('modem');
  };

  const toggleE4 = (postId) => {
    setSelectedE4Ids(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  };

  const goToEquiposMode = () => {
    const conPendientes = Array.from(selectedE4Ids)
      .map(id => posts.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({ id: p.id, pendientes: etapasFisicasPendientes(p) }))
      .filter(x => x.pendientes.length > 0);
    if (conPendientes.length > 0) {
      setPendientesWarning(conPendientes);
      return;
    }
    proceedToEquipos();
  };

  const proceedToEquipos = () => {
    const initial = { ...equiposByPost };
    Array.from(selectedE4Ids).forEach(postId => {
      // SIEMPRE refrescar con datos frescos de BD (no condicional)
      // Esto asegura que al re-editar IPs, se vean los valores guardados actuales
      const postObj = posts.find(p => p.id === postId);
      const existing = postObj?.stages?.conexion_poste?.attrs?.equipos || {};
      // Si ya hay datos locales editados pero no guardados, preservarlos
      const localData = initial[postId] || {};
      initial[postId] = {};
      EQUIPOS.forEach(eq => {
        const existingData = existing[eq.key];
        const local = localData[eq.key];
        // Preferir datos locales (en edicion) si existen, sino datos de BD
        initial[postId][eq.key] = local && (local.ip || local.no_instalado)
          ? local
          : existingData
            ? { ip: existingData.ip || '', no_instalado: existingData.no_instalado || false, motivo: existingData.motivo || '' }
            : { ip: '', no_instalado: false, motivo: '' };
      });
    });
    Object.keys(initial).forEach(postId => {
      if (!selectedE4Ids.has(postId)) delete initial[postId];
    });
    setEquiposByPost(initial);
    setExpandedPosts(new Set([...selectedE4Ids]));
    setViewMode('equipos');
  };

  const backToAssign = () => setViewMode('assign');
  const backToEquipos = () => setViewMode('equipos');

  const togglePostExpand = (postId) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  };

  const toggleEquipoExpand = (postId, equipoKey) => {
    const k = postId + ':' + equipoKey;
    setExpandedEquipos(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const updateEquipo = (postId, equipoKey, field, value) => {
    setEquiposByPost(prev => {
      const next = { ...prev };
      if (!next[postId]) next[postId] = {};
      if (!next[postId][equipoKey]) next[postId][equipoKey] = { ip: '', no_instalado: false, motivo: '' };
      next[postId][equipoKey] = { ...next[postId][equipoKey], [field]: value };
      return next;
    });
  };

  const goToPreview = () => {
    setSaveError(null);
    setViewMode('preview');
  };

  const handleAccept = async () => {
    if (!selectedModem || savingIps) return;
    setSavingIps(true);
    setSaveError(null);
    try {
      for (const [postId, equipos] of Object.entries(equiposByPost)) {
        // Construir el JSON solo con equipos que tienen IP o no_instalado
        const equiposPayload = {};
        Object.entries(equipos).forEach(([eqKey, data]) => {
          if (data.no_instalado) {
            equiposPayload[eqKey] = { ip: null, no_instalado: true, motivo: data.motivo || null };
          } else if (data.ip && data.ip.trim()) {
            equiposPayload[eqKey] = { ip: data.ip.trim(), no_instalado: false, motivo: null };
          }
        });
        if (Object.keys(equiposPayload).length > 0) {
          await assignIpsToPost(postId, selectedModem.id, equiposPayload);
          // Registrar (no bloqueante) si el poste avanzo con etapas fisicas pendientes
          const _postPend = posts.find(p => p.id === postId);
          const _pendientes = _postPend ? etapasFisicasPendientes(_postPend) : [];
          if (_pendientes.length > 0) {
            try {
              await registrarAvanceConPendientes(postId, _pendientes, 'conexion_poste', 'asignacion_ip');
            } catch (e) {
              console.warn('No se pudo registrar avance con pendientes para', postId, e);
            }
          }
        }
      }
      // Refrescar data global
      if (onRefresh) await onRefresh();
      // Mostrar modal custom de exito (la limpieza ocurre al cerrar el modal)
      const postIds = Object.keys(equiposByPost);
      setSavingIps(false);
      setShowSuccessDialog({ posts: postIds });
    } catch (err) {
      console.error('Error al asignar IPs:', err);
      setSaveError(err.message || 'Error desconocido al guardar');
      setSavingIps(false);
    }
  };

  // Funcion para detectar si un poste ya tiene IPs asignadas (E6 completada)
  const tieneIpAsignada = (post) => {
    const e6 = post.stages?.conexion_poste;
    if (!e6) return false;
    return !!(e6.attrs?.modem_origen);
  };

  // Handler para cerrar el dialog de exito y limpiar todo
  const handleSuccessDialogClose = () => {
    setShowSuccessDialog(null);
    setSelectedModem(null);
    setSelectedE4Ids(new Set());
    setEquiposByPost({});
    setExpandedPosts(new Set());
    setExpandedEquipos(new Set());
    setUtPolygonGeom(null);
    setViewMode('review');
  };

  // =====================================================================
  // MODO PREVIEW: vista previa con mini mapa + desglose
  // =====================================================================
  if (pendientesWarning) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setPendientesWarning(null)}>
        <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-amber-100 inline-flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div className="text-base font-medium text-stone-800">Etapas pendientes</div>
              <div className="text-xs text-stone-500">Antes de pasar a la fase de red (IPs)</div>
            </div>
          </div>
          <p className="text-sm text-stone-600 mb-3">
            Estos postes tienen etapas fisicas (E1-E4) sin marcar. Puedes continuar, pero conviene revisarlas:
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-amber-200 bg-amber-50 divide-y divide-amber-100 mb-4">
            {pendientesWarning.map(item => (
              <div key={item.id} className="px-3 py-2 text-sm">
                <span onClick={() => { const p = posts.find(x => x.id === item.id); if (p && onPostClick) onPostClick(p, item.pendientes[0]); }} className="font-medium text-amber-900 cursor-pointer hover:underline" title="Ver detalle y revisar etapa">{item.id}</span>
                <span className="text-amber-700"> - falta: {item.pendientes.map(s => { const d = stageDefs?.find(x => x.id === s); return d ? ('E' + d.num + ' ' + d.name) : s; }).join(', ')}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { const it = pendientesWarning[0]; const p = posts.find(x => x.id === it.id); if (p && onPostClick) onPostClick(p, it.pendientes[0]); }} className="text-sm px-3 py-1.5 rounded border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900">Revisar</button>
            <button onClick={() => { setPendientesWarning(null); proceedToEquipos(); }} className="text-sm px-3 py-1.5 rounded border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900">Continuar de todos modos</button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'preview' && selectedModem) {
    if (showSuccessDialog) {
      return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={handleSuccessDialogClose}>
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-emerald-100 rounded-full inline-flex items-center justify-center mb-3">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#1D9E75" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-medium text-stone-800 mb-1">¡Listo!</h3>
            <p className="text-sm text-stone-600 mb-3">
              {showSuccessDialog.posts.length === 1 ? <>El poste pasó de <strong>E4</strong> a <strong>E6</strong></> : <><strong>{showSuccessDialog.posts.length}</strong> postes pasaron de <strong>E4</strong> a <strong>E6</strong></>}.
            </p>
            <ul className="bg-emerald-50 border border-emerald-200 rounded-md py-2 px-3 mb-5 text-left max-h-40 overflow-y-auto">
              {showSuccessDialog.posts.map(id => (
                <li key={id} className="flex items-center gap-2 py-0.5 text-sm">
                  <span className="text-emerald-600">•</span>
                  <span className="font-mono text-emerald-800">{id}</span>
                </li>
              ))}
            </ul>
            <button onClick={handleSuccessDialogClose}
              className="w-full px-6 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
              Aceptar
            </button>
          </div>
        </div>
      );
    }
    const tipoModemSel = selectedModem.stages?.internet?.attrs?.tipo_modem || '';
    // Postes E4 que van a recibir asignacion (solo los que tienen IPs o no_instalado)
    const e4ConAsignacion = Object.keys(equiposByPost).filter(postId => {
      const eqs = equiposByPost[postId];
      return Object.values(eqs).some(d => d.no_instalado || (d.ip && d.ip.trim()));
    }).map(pid => posts.find(p => p.id === pid)).filter(Boolean);

    // Extraer puntos del poligono UT para bounds
    const polyPoints = [];
    if (utPolygonGeom) {
      const collectRings = (rings) => rings.forEach(ring => ring.forEach(([lng, lat]) => polyPoints.push({ lat, lng })));
      if (utPolygonGeom.type === 'Polygon') collectRings(utPolygonGeom.coordinates);
      else if (utPolygonGeom.type === 'MultiPolygon') utPolygonGeom.coordinates.forEach(poly => collectRings(poly));
    }

    // Calcular bounds (poligono + postes)
    const allPoints = [selectedModem, ...e4ConAsignacion].filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const boundPoints = polyPoints.length > 0 ? [...polyPoints, ...allPoints] : allPoints;
    let svgContent = null;
    if (allPoints.length > 0) {
      const lats = boundPoints.map(p => p.lat);
      const lngs = boundPoints.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const dLat = (maxLat - minLat) || 0.001;
      const dLng = (maxLng - minLng) || 0.001;
      const W = 480, H = 260, PAD = 30;
      const project = (lat, lng) => {
        const x = PAD + ((lng - minLng) / dLng) * (W - PAD * 2);
        const y = PAD + ((maxLat - lat) / dLat) * (H - PAD * 2);
        return [x, y];
      };
      const [mx, my] = project(selectedModem.lat, selectedModem.lng);

      // Construir paths del poligono UT
      const polyPaths = [];
      if (utPolygonGeom) {
        const ringToPath = (ring) => {
          if (!ring || ring.length === 0) return '';
          const cmds = ring.map(([lng, lat], i) => {
            const [x, y] = project(lat, lng);
            return (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ' ' + y.toFixed(2);
          });
          return cmds.join(' ') + ' Z';
        };
        if (utPolygonGeom.type === 'Polygon') {
          polyPaths.push(utPolygonGeom.coordinates.map(ringToPath).join(' '));
        } else if (utPolygonGeom.type === 'MultiPolygon') {
          utPolygonGeom.coordinates.forEach(poly => polyPaths.push(poly.map(ringToPath).join(' ')));
        }
      }

      svgContent = (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <defs>
            <marker id="arr-indigo" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#534AB7" />
            </marker>
            <pattern id="grid-bg" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="#fafafa" />
          <rect x="0" y="0" width={W} height={H} fill="url(#grid-bg)" />
          {/* Poligono UT */}
          {polyPaths.map((d, i) => (
            <path key={'poly-' + i} d={d} fill="#EEEDFE" fillOpacity="0.55" stroke="#7F77DD" strokeWidth="1.5" strokeDasharray="4 3" />
          ))}
          {/* Etiqueta de UT */}
          {polyPaths.length > 0 && (
            <text x={W/2} y={20} textAnchor="middle" fontSize="10" fill="#7F77DD" fontWeight="500" opacity="0.7">UT {ut.id}{ut.nombre ? ' · ' + ut.nombre : ''}</text>
          )}
          {/* Flechas */}
          {e4ConAsignacion.map(e4 => {
            if (typeof e4.lat !== 'number' || typeof e4.lng !== 'number') return null;
            const [ex, ey] = project(e4.lat, e4.lng);
            return <line key={'l-' + e4.id} x1={mx} y1={my} x2={ex} y2={ey} stroke="#534AB7" strokeWidth="2" markerEnd="url(#arr-indigo)" opacity="0.85" />;
          })}
          {/* Modem (encima de lineas) */}
          <circle cx={mx} cy={my} r="12" fill="#534AB7" stroke="white" strokeWidth="2.5" />
          <text x={mx} y={my + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">M</text>
          <text x={mx} y={my + 26} textAnchor="middle" fontSize="10" fill="#3C3489" fontWeight="500">{selectedModem.id}</text>
          {/* E4s */}
          {e4ConAsignacion.map(e4 => {
            if (typeof e4.lat !== 'number' || typeof e4.lng !== 'number') return null;
            const [ex, ey] = project(e4.lat, e4.lng);
            return (
              <g key={'p-' + e4.id}>
                <circle cx={ex} cy={ey} r="8" fill="white" stroke="#534AB7" strokeWidth="2" />
                <text x={ex} y={ey + 22} textAnchor="middle" fontSize="10" fill="#3C3489" fontWeight="500">{e4.id}</text>
              </g>
            );
          })}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#888">Modem {selectedModem.id} → {e4ConAsignacion.length} E4</text>
        </svg>
      );
    }

    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-white backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[540px] max-w-[92vw] flex flex-col"
        style={{ maxHeight: "calc(100vh - 140px)" }}>
        <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Vista previa</div>
              <div className="text-stone-700 text-sm font-medium mt-0.5">
                Modem <span className="font-mono text-indigo-700">{selectedModem.id}</span>
                <span className="text-stone-400 text-xs ml-1">({tipoModemSel})</span>
                <span className="text-stone-400 text-xs ml-2">→ {e4ConAsignacion.length} E4</span>
              </div>
            </div>
            <button onClick={onClose} disabled={savingIps} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1 disabled:opacity-30">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Mini mapa */}
          {svgContent && (
            <div className="bg-stone-50 p-2 border-y border-stone-200">{svgContent}</div>
          )}

          {/* Desglose */}
          <div className="p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-2">Desglose de asignaciones</div>
            <div className="space-y-2">
              {e4ConAsignacion.map(e4 => {
                const eqs = equiposByPost[e4.id] || {};
                return (
                  <div key={e4.id} className="bg-stone-50 rounded-md p-2.5 border border-stone-200">
                    <div className="text-xs font-medium mb-1.5 text-stone-800">
                      <span className="text-indigo-700">📡 {selectedModem.id}</span>
                      <span className="text-stone-400"> → </span>
                      <span className="font-mono text-rose-600">{e4.id}</span>
                      {e4.alias && <span className="text-stone-500 text-[11px] ml-1">"{e4.alias}"</span>}
                    </div>
                    <div className="space-y-0.5 pl-2">
                      {EQUIPOS.map(eq => {
                        const d = eqs[eq.key];
                        if (!d) return null;
                        if (!d.no_instalado && !(d.ip && d.ip.trim())) return null;
                        return (
                          <div key={eq.key} className="flex justify-between text-[11px]">
                            <span className="text-stone-600">{eq.icon} {eq.label}</span>
                            {d.no_instalado ? (
                              <span className="text-amber-700 italic">No instalado{d.motivo ? ' · ' + d.motivo : ''}</span>
                            ) : (
                              <span className="font-mono text-indigo-700 font-medium">{d.ip}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {saveError && (
            <div className="mx-2.5 mb-2 bg-red-50 border border-red-300 rounded p-2 text-xs text-red-700">
              ⚠ Error al guardar: {saveError}
            </div>
          )}
        </div>

        <div className="p-2.5 border-t border-stone-200 bg-stone-50 flex justify-between items-center gap-2">
          <button onClick={backToEquipos} disabled={savingIps}
            className="px-3 py-1.5 rounded-md border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-medium transition-colors disabled:opacity-50">
            ← Editar
          </button>
          <button onClick={handleAccept} disabled={savingIps || e4ConAsignacion.length === 0}
            className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1.5">
            {savingIps ? (
              <><span className="animate-spin">⏳</span> Guardando...</>
            ) : (
              <>✓ Aceptar y guardar</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // MODO EQUIPOS
  // =====================================================================
  if (viewMode === 'equipos' && selectedModem) {
    const tipoModemSel = selectedModem.stages?.internet?.attrs?.tipo_modem || '';

    let totalEquipos = 0;
    let completados = 0;
    Object.entries(equiposByPost).forEach(([postId, equipos]) => {
      EQUIPOS.forEach(eq => {
        totalEquipos++;
        const data = equipos[eq.key];
        if (data && ((data.ip && data.ip.trim() && isValidIpFormat(data.ip)) || data.no_instalado)) {
          completados++;
        }
      });
    });

    const hayConflictos = ipConflicts.size > 0;
    const hayFormatosMalos = Object.values(equiposByPost).some(equipos =>
      Object.values(equipos).some(eq => eq.ip && eq.ip.trim() && !isValidIpFormat(eq.ip))
    );
    const puedeContinuar = completados > 0 && !hayConflictos && !hayFormatosMalos;

    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-white backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[520px] max-w-[92vw] flex flex-col"
        style={{ maxHeight: "calc(100vh - 140px)" }}>
        <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Asignar IPs a equipos</div>
              <div className="text-stone-700 text-sm font-medium mt-0.5">
                Modem <span className="font-mono text-indigo-700">{selectedModem.id}</span>
                <span className="text-stone-400 text-xs ml-1">({tipoModemSel})</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5 shrink-0">
              <button onClick={backToAssign} className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-700">← Volver</button>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1">×</button>
            </div>
          </div>

          <div>
            <div className="relative h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className={`absolute left-0 top-0 h-full transition-all rounded-full ${
                hayConflictos || hayFormatosMalos ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
              }`} style={{ width: `${totalEquipos > 0 ? Math.round((completados / totalEquipos) * 100) : 0}%` }} />
            </div>
            <div className="flex justify-between text-xs text-stone-600 mt-1">
              <span><strong className="text-stone-800">{completados}</strong> de <strong className="text-stone-800">{totalEquipos}</strong> equipos configurados</span>
              <span className="text-stone-400">{Object.keys(equiposByPost).length} postes</span>
            </div>
          </div>

          {hayConflictos && (
            <div className="bg-red-50 border border-red-300 rounded px-2 py-1.5 text-[11px] text-red-700">
              ⚠ <strong>{ipConflicts.size}</strong> IPs duplicadas detectadas. Revisa los campos marcados en rojo.
            </div>
          )}
          {hayFormatosMalos && !hayConflictos && (
            <div className="bg-amber-50 border border-amber-300 rounded px-2 py-1.5 text-[11px] text-amber-700">
              ⚠ Hay IPs con formato invalido. Usa formato xxx.xxx.xxx.xxx
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {Object.keys(equiposByPost).length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm">No hay postes seleccionados</div>
          ) : (
            <div className="space-y-2">
              {Object.keys(equiposByPost).sort().map(postId => {
                const post = postesE4.find(p => p.id === postId);
                const isExpanded = expandedPosts.has(postId);
                const equipos = equiposByPost[postId] || {};
                const equiposCompletos = EQUIPOS.filter(eq => {
                  const d = equipos[eq.key];
                  return d && ((d.ip && d.ip.trim() && isValidIpFormat(d.ip)) || d.no_instalado);
                }).length;

                return (
                  <div key={postId} className="border border-stone-200 rounded-md overflow-hidden bg-white">
                    <div onClick={() => togglePostExpand(postId)}
                      className="flex items-center justify-between gap-2 p-2 bg-stone-50 hover:bg-stone-100 cursor-pointer border-b border-stone-200">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-stone-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                        <span className="font-mono text-sm text-rose-600 font-medium">{postId}</span>
                        {post?.alias && <span className="text-xs text-stone-500 truncate">"{post.alias}"</span>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        equiposCompletos === 6 ? 'bg-emerald-100 text-emerald-700' :
                        equiposCompletos > 0 ? 'bg-indigo-100 text-indigo-700' :
                        'bg-stone-100 text-stone-500'
                      }`}>{equiposCompletos}/6</span>
                    </div>

                    {isExpanded && (
                      <div className="divide-y divide-stone-100">
                        {EQUIPOS.map(eq => {
                          const eqKey = eq.key;
                          const eqData = equipos[eqKey] || { ip: '', no_instalado: false, motivo: '' };
                          const eqExpandedKey = postId + ':' + eqKey;
                          const isEqExpanded = expandedEquipos.has(eqExpandedKey);
                          const conflictKey = postId + ':' + eqKey;
                          const hasConflict = ipConflicts.has(conflictKey);
                          const formatMalo = eqData.ip && eqData.ip.trim() && !isValidIpFormat(eqData.ip);
                          const tieneData = eqData.no_instalado || (eqData.ip && eqData.ip.trim());

                          return (
                            <div key={eqKey}>
                              <div onClick={() => toggleEquipoExpand(postId, eqKey)}
                                className="flex items-center justify-between gap-2 p-2 hover:bg-stone-50 cursor-pointer">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-stone-400 text-xs">{isEqExpanded ? '▼' : '▶'}</span>
                                  <span className="text-base">{eq.icon}</span>
                                  <span className="text-sm text-stone-700">{eq.label}</span>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  {hasConflict && <span className="text-[10px] text-red-700 bg-red-50 border border-red-300 px-1 py-0.5 rounded">⚠ Duplicada</span>}
                                  {formatMalo && !hasConflict && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-300 px-1 py-0.5 rounded">Formato</span>}
                                  {eqData.no_instalado && <span className="text-[10px] text-stone-700 bg-stone-100 border border-stone-300 px-1 py-0.5 rounded">No instalado</span>}
                                  {tieneData && !eqData.no_instalado && !hasConflict && !formatMalo && (
                                    <span className="text-[11px] font-mono text-indigo-700">{eqData.ip}</span>
                                  )}
                                </div>
                              </div>

                              {isEqExpanded && (
                                <div className="px-3 py-2 bg-stone-50 border-t border-stone-100">
                                  {!eqData.no_instalado && (
                                    <div className="mb-2">
                                      <label className="block text-[10px] uppercase text-stone-500 tracking-wide mb-1">IP</label>
                                      <input type="text" value={eqData.ip} onChange={(e) => updateEquipo(postId, eqKey, 'ip', e.target.value)}
                                        placeholder="192.168.1.10"
                                        className={`w-full px-2 py-1.5 text-sm font-mono border rounded focus:outline-none focus:ring-1 ${
                                          hasConflict ? 'border-red-400 focus:ring-red-400 bg-red-50' :
                                          formatMalo ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' :
                                          'border-stone-300 focus:ring-indigo-400'
                                        }`} />
                                      {hasConflict && (
                                        <div className="text-[10px] text-red-600 mt-1">
                                          IP duplicada con: {ipConflicts.get(conflictKey).conflictsWith.map(c => c.postId + '/' + c.equipoKey).join(', ')}
                                        </div>
                                      )}
                                      {formatMalo && !hasConflict && (
                                        <div className="text-[10px] text-amber-700 mt-1">Formato invalido (xxx.xxx.xxx.xxx)</div>
                                      )}
                                    </div>
                                  )}

                                  <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                                    <input type="checkbox" checked={eqData.no_instalado}
                                      onChange={(e) => updateEquipo(postId, eqKey, 'no_instalado', e.target.checked)}
                                      className="w-3.5 h-3.5 accent-amber-500" />
                                    Equipo no instalado / dañado
                                  </label>

                                  {eqData.no_instalado && (
                                    <textarea value={eqData.motivo} onChange={(e) => updateEquipo(postId, eqKey, 'motivo', e.target.value)}
                                      placeholder="Motivo opcional (robado, pendiente, falla, etc.)"
                                      rows="2"
                                      className="w-full mt-2 px-2 py-1 text-xs border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-2.5 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
          <span className="text-xs text-stone-500">
            {hayConflictos || hayFormatosMalos ? '⚠ Corrige errores antes de continuar' :
             completados === 0 ? 'Asigna al menos una IP' :
             `${completados} de ${totalEquipos} listos`}
          </span>
          <button disabled={!puedeContinuar} onClick={goToPreview}
            className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors shadow-sm">
            Vista previa →
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // MODO ASSIGN
  // =====================================================================
  if (viewMode === 'assign' && selectedModem) {
    const tipoModemSel = selectedModem.stages?.internet?.attrs?.tipo_modem || '';
    const totalE4 = postesE4.length;
    const disponibles = postesE4.filter(p => {
      const assignedTo = e4Assignments.get(p.id);
      return !assignedTo || assignedTo === selectedModem.id;
    }).length;

    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-white backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[500px] max-w-[92vw] flex flex-col"
        style={{ maxHeight: "calc(100vh - 140px)" }}>
        <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Asignacion de IPs</div>
              <div className="text-stone-700 text-sm font-medium mt-0.5">{ut.id} - {ut.nombre}</div>
            </div>
            <div className="flex items-start gap-1.5 shrink-0">
              <button onClick={backToModem} className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-700">← Volver</button>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1">×</button>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-300 rounded-md p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-indigo-700 font-semibold">📡 Poste modem origen</div>
            <div className="flex items-center justify-between mt-1">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-base font-bold text-indigo-800">{selectedModem.id}</div>
                {selectedModem.alias && <div className="text-xs text-indigo-600 truncate">"{selectedModem.alias}"</div>}
              </div>
              <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">MODEM {tipoModemSel}</span>
            </div>
          </div>

          <div className="text-xs text-stone-600 flex justify-between">
            <span><strong className="text-stone-800">{selectedE4Ids.size}</strong> seleccionados<span className="text-stone-400"> de </span><strong className="text-stone-800">{disponibles}</strong> disponibles</span>
            <span className="text-stone-400">{totalE4} E4 totales en UT</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {postesE4.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm px-3">No hay postes E4 disponibles en esta UT.</div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {postesE4.map(post => {
                const assignedTo = e4Assignments.get(post.id);
                const isAssignedToOther = assignedTo && assignedTo !== selectedModem.id;
                const isAssignedToThis = assignedTo === selectedModem.id;
                const isSelected = selectedE4Ids.has(post.id);
                const stagesDone = post.stages ? Object.values(post.stages).filter(s => s && s.done).length : 0;
                return (
                  <li key={post.id}
                    className={`p-2.5 flex items-center gap-2.5 transition-colors ${
                      isAssignedToOther ? 'opacity-50 bg-stone-50 cursor-not-allowed'
                      : isSelected ? 'bg-indigo-50 hover:bg-indigo-100 cursor-pointer'
                      : 'hover:bg-stone-50 cursor-pointer'
                    }`}
                    onClick={() => { if (!isAssignedToOther) toggleE4(post.id); }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleE4(post.id)}
                      onClick={(e) => e.stopPropagation()} disabled={isAssignedToOther}
                      className="w-4 h-4 accent-indigo-600 disabled:cursor-not-allowed" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-rose-600 font-medium">{post.id}</span>
                        {isAssignedToThis && <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded">Ya asignado a este modem</span>}
                        {isAssignedToOther && <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded">Asignado a {assignedTo}</span>}
                      </div>
                      {post.alias && <div className="text-xs text-stone-500 truncate">"{post.alias}"</div>}
                    </div>
                    <div className="text-right leading-tight shrink-0">
                      <div className="text-[10px] text-stone-400 uppercase tracking-wide">Etapa</div>
                      <div className="text-xs text-stone-700 font-mono font-semibold">{stagesDone}/7</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-2.5 border-t border-stone-200 bg-stone-50 flex justify-between items-center">
          <span className="text-xs text-stone-500">
            {selectedE4Ids.size === 0 ? 'Selecciona al menos un poste E4' : `${selectedE4Ids.size} poste${selectedE4Ids.size !== 1 ? 's' : ''} seleccionado${selectedE4Ids.size !== 1 ? 's' : ''}`}
          </span>
          <button disabled={selectedE4Ids.size === 0} onClick={goToEquiposMode}
            className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors shadow-sm">
            Continuar a asignar IPs →
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // MODO MODEM
  // =====================================================================
  if (viewMode === 'modem') {
    return (
      <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-white backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[480px] max-w-[92vw] flex flex-col"
        style={{ maxHeight: "calc(100vh - 140px)" }}>
        <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">Modo Modem</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-indigo-700 font-mono font-bold text-base">{ut.id}</span>
                <span className="text-stone-400 text-xs">UT</span>
              </div>
              <div className="text-indigo-600 text-sm font-medium mt-0.5">Postes con modem ({postesConModem.length})</div>
            </div>
            <div className="flex items-start gap-1.5 shrink-0">
              <button onClick={() => setViewMode('review')} className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-700">← Volver</button>
              <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1">×</button>
            </div>
          </div>
          <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1.5">
            Selecciona un poste con modem para distribuir Internet a los E4 vecinos.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {postesConModem.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm">No hay postes con modem registrado en esta UT.</div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {postesConModem.map(post => {
                const tipoModem = post.stages?.internet?.attrs?.tipo_modem || '';
                const distribuyeA = post.stages?.internet?.attrs?.distribuye_a || [];
                const yaDistribuye = Array.isArray(distribuyeA) && distribuyeA.length > 0;
                return (
                  <li key={post.id} className="p-2 hover:bg-indigo-50 cursor-pointer transition-colors" onClick={() => goToAssignMode(post)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 shrink-0">MODEM {tipoModem}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm text-rose-600 font-medium">{post.id}</div>
                          {post.alias && <div className="text-xs text-stone-500 truncate">"{post.alias}"</div>}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5">
                        {yaDistribuye && <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{distribuyeA.length} conectados</span>}
                        <span className="text-stone-300">→</span>
                      </div>
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

  // =====================================================================
  // MODO REVIEW (default) - con leyenda IP ASIGNADA
  // =====================================================================
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-white backdrop-blur-sm border border-stone-300 rounded-lg shadow-2xl z-30 w-[480px] max-w-[92vw] flex flex-col"
      style={{ maxHeight: "calc(100vh - 140px)" }}>
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
            <span className={`text-xs px-2 py-0.5 rounded border font-semibold whitespace-nowrap ${badgeBg}`}>{badgeText}</span>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1">×</button>
          </div>
        </div>

        {haveExcelData && (
          <div>
            <div className="relative h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className={`absolute left-0 top-0 h-full ${barColor} transition-all duration-500 rounded-full`}
                style={{ width: `${Math.min(progressPct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-stone-600 mt-1">
              <span><strong className="text-stone-800">{total}</strong> en sistema <span className="text-stone-400">·</span> Meta: <strong className="text-stone-800">{meta}</strong></span>
              <span>Por liberar: <strong className="text-stone-800">{porLiberar}</strong></span>
            </div>
          </div>
        )}

        {!haveExcelData && <div className="text-xs text-stone-500 italic">{total} postes en sistema. Esta UT no esta en el Excel de contrato.</div>}

        <div className="text-xs flex flex-wrap gap-x-3 border-t border-stone-100 pt-1.5">
          <span className="text-emerald-600 font-medium">{verificados} verif.</span>
          <span className="text-red-600 font-medium">{noExiste} no exist.</span>
          <span className="text-stone-500 font-medium">{noDefinido} pend.</span>
        </div>

        {postesConModem.length > 0 && (
          <div className="flex items-center gap-2 pt-1.5 border-t border-stone-100">
            <button onClick={() => setViewMode('modem')}
              className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm">
              <span>📡 Modem</span>
              <span className="bg-indigo-500 px-1.5 py-0.5 rounded text-[10px] font-mono">{postesConModem.length}</span>
            </button>
            <span className="text-[10px] text-stone-400">Asignar IPs a equipos via modems</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {total === 0 ? (
          <div className="text-center py-6 text-stone-400 text-sm">Sin postes en esta UT</div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {posts.map(post => {
              const stagesDone = post.stages ? Object.values(post.stages).filter(s => s && s.done).length : 0;
              const ipAsignada = tieneIpAsignada(post);
              const modemOrigen = post.stages?.conexion_poste?.attrs?.modem_origen;
              return (
                <li key={post.id} className="p-2 hover:bg-stone-50">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span onClick={() => onPostClick && onPostClick(post)} className="font-mono text-sm text-rose-600 font-medium cursor-pointer hover:underline">{post.id}</span>
                        {ipAsignada && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-300 px-1 py-0.5 rounded font-semibold tracking-wide" title={'Recibe Internet de ' + modemOrigen}>
                            📡 IP ASIGNADA
                          </span>
                        )}
                      </div>
                      {post.alias && <div className="text-xs text-stone-500 truncate">"{post.alias}"</div>}
                      {ipAsignada && modemOrigen && (
                        <div className="text-[10px] text-emerald-600">Recibe de <span className="font-mono">{modemOrigen}</span></div>
                      )}
                    </div>
                    <div className="shrink-0 text-right leading-tight">
                      <div className="text-[10px] text-stone-400 uppercase tracking-wide">Etapa</div>
                      <div className={`text-xs font-mono font-semibold ${ipAsignada ? 'text-emerald-700' : 'text-stone-700'}`}>{stagesDone}/7</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {renderEstadoBtn(post, 'verificado', 'Verif.', 'bg-emerald-100 text-emerald-700 border-emerald-400')}
                    {renderEstadoBtn(post, 'no_definido', 'Pend.', 'bg-stone-200 text-stone-700 border-stone-400')}
                    {renderEstadoBtn(post, 'no_existe', 'No exist.', 'bg-red-100 text-red-700 border-red-400')}
                    <button type="button" onClick={(e) => { e.stopPropagation(); if (onIrAlPunto) onIrAlPunto(post); }}
                      className="ml-auto px-2 py-0.5 rounded border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 text-xs font-medium transition-colors">Ir al punto</button>
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