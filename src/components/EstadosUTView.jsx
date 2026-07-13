// src/components/EstadosUTView.jsx
// Vista administrativa (solo admin) para asignar el estado de entrega de cada UT.
// Estados: liberado (verde), pendiente (amarillo), urgencia (rojo).

import { useState, useMemo } from 'react';
import { Search, MapPin, AlertTriangle, CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import { setUtEstado, getUtDesglose } from '../lib/data.js';

const ESTADOS = {
  liberado:  { label: 'Liberado',  color: '#10B981', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', dot: '🟢' },
  pendiente: { label: 'Pendiente', color: '#F59E0B', bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-300',   dot: '🟡' },
  urgencia:  { label: 'Urgencia',  color: '#EF4444', bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-300',     dot: '🔴' },
};

const SEV_COLOR = { urgente: '#EF4444', alta: '#DC2626', media: '#F59E0B', baja: '#3B82F6' };

export default function EstadosUTView({ unidadesTerritoriales = [], posts = [], onRefresh }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [confirmUrgencia, setConfirmUrgencia] = useState(null);
  const [estadosLocal, setEstadosLocal] = useState({});
  const [pagina, setPagina] = useState(1);
  const PORPAGINA = 10;

  const postesPorUt = useMemo(() => {
    const m = {};
    for (const p of posts) {
      const k = p.unidad_territorial;
      if (!k) continue;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [posts]);

  const estadoDe = (ut) => estadosLocal[ut.id] !== undefined ? estadosLocal[ut.id] : (ut.estado || null);

  const utsFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (unidadesTerritoriales || [])
      .filter(ut => {
        if (!postesPorUt[ut.id]) return false;
        if (q) {
          const enClave = (ut.id || '').toLowerCase().includes(q);
          const enNombre = (ut.nombre || '').toLowerCase().includes(q);
          if (!enClave && !enNombre) return false;
        }
        const est = estadoDe(ut);
        if (filtroEstado === 'sin') return !est;
        if (filtroEstado !== 'todos') return est === filtroEstado;
        return true;
      })
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  }, [unidadesTerritoriales, busqueda, filtroEstado, estadosLocal, postesPorUt]);

  const conteos = useMemo(() => {
    const c = { todos: 0, liberado: 0, pendiente: 0, urgencia: 0, sin: 0 };
    for (const ut of (unidadesTerritoriales || [])) {
      if (!postesPorUt[ut.id]) continue;
      c.todos++;
      const est = estadoDe(ut);
      if (!est) c.sin++;
      else c[est]++;
    }
    return c;
  }, [unidadesTerritoriales, estadosLocal, postesPorUt]);

  // Total de paginas y recorte de la pagina actual
  const totalPaginas = Math.max(1, Math.ceil(utsFiltradas.length / PORPAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const utsPagina = utsFiltradas.slice((paginaSegura - 1) * PORPAGINA, paginaSegura * PORPAGINA);

  // Volver a la pagina 1 cuando cambia el filtro o la busqueda
  const resetPagina = () => setPagina(1);

  async function aplicarEstado(clave, nombre, nuevoEstado) {
    setMensaje(null);
    if (nuevoEstado === 'urgencia') {
      setConfirmUrgencia({ clave, nombre, desglose: null, cargando: true });
      try {
        const desglose = await getUtDesglose(clave);
        setConfirmUrgencia({ clave, nombre, desglose, cargando: false });
      } catch (e) {
        setConfirmUrgencia(null);
        setMensaje({ tipo: 'error', texto: 'No se pudo cargar el desglose: ' + (e?.message || e) });
      }
      return;
    }
    await ejecutarCambio(clave, nuevoEstado);
  }

  async function ejecutarCambio(clave, nuevoEstado) {
    setGuardando(clave);
    setMensaje(null);
    try {
      const res = await setUtEstado(clave, nuevoEstado);
      if (nuevoEstado === 'liberado' && res && res.postes_incompletos > 0) {
        setMensaje({ tipo: 'error', texto: `No se puede liberar ${clave}: faltan ${res.postes_incompletos} poste(s) por completar sus 7 etapas.` });
        setGuardando(null);
        return;
      }
      setEstadosLocal(prev => ({ ...prev, [clave]: nuevoEstado }));
      const afectadas = res?.incidencias_afectadas || 0;
      let txt = `${clave} → ${ESTADOS[nuevoEstado]?.label || nuevoEstado}.`;
      if (nuevoEstado === 'urgencia' && afectadas > 0) txt += ` ${afectadas} incidencia(s) pasaron a urgente.`;
      if (afectadas > 0 && nuevoEstado !== 'urgencia') txt += ` ${afectadas} incidencia(s) restauraron su severidad.`;
      setMensaje({ tipo: 'ok', texto: txt });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + (e?.message || e) });
    } finally {
      setGuardando(null);
    }
  }

  async function quitarEstado(clave) {
    setGuardando(clave);
    setMensaje(null);
    try {
      await setUtEstado(clave, null);
      setEstadosLocal(prev => ({ ...prev, [clave]: null }));
      setMensaje({ tipo: 'ok', texto: `${clave} → sin estado.` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + (e?.message || e) });
    } finally {
      setGuardando(null);
    }
  }

  async function confirmarUrgencia() {
    const clave = confirmUrgencia.clave;
    setConfirmUrgencia(null);
    await ejecutarCambio(clave, 'urgencia');
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="w-5 h-5 text-stone-700" strokeWidth={1.5} />
        <h2 className="text-lg font-bold text-stone-950">Estados UT</h2>
      </div>
      <p className="text-sm text-stone-600 mb-4">Asigna el estado de entrega de cada unidad territorial.</p>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); resetPagina(); }}
          placeholder="Buscar por clave o colonia..."
          className="w-full pl-10 pr-3 py-2.5 bg-white border border-stone-300 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {[
          ['todos', 'Todos', conteos.todos],
          ['liberado', '🟢 Liberado', conteos.liberado],
          ['pendiente', '🟡 Pendiente', conteos.pendiente],
          ['urgencia', '🔴 Urgencia', conteos.urgencia],
          ['sin', 'Sin asignar', conteos.sin],
        ].map(([val, label, n]) => (
          <button key={val} onClick={() => { setFiltroEstado(val); resetPagina(); }}
            className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
              filtroEstado === val ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
            }`}>
            {label} <span className="opacity-60">({n})</span>
          </button>
        ))}
      </div>

      {mensaje && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-sm flex items-start gap-2 ${
          mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="ml-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="space-y-2">
        {utsFiltradas.length === 0 && (
          <div className="text-center py-10 text-stone-400 text-sm">No hay UTs que coincidan.</div>
        )}
        {utsPagina.map(ut => {
          const est = estadoDe(ut);
          const cfg = est ? ESTADOS[est] : null;
          const enProceso = guardando === ut.id;
          return (
            <div key={ut.id} className="bg-white border border-stone-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-stone-800 truncate">
                  <span className="font-semibold">{ut.id}</span>
                  {ut.nombre && <span className="text-stone-500"> · {ut.nombre}</span>}
                </div>
                <div className="text-[11px] mt-0.5 flex items-center gap-2">
                  <span className="text-stone-400">{postesPorUt[ut.id] || 0} postes</span>
                  {cfg ? (
                    <span className={`px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border}`}>{cfg.dot} {cfg.label}</span>
                  ) : (
                    <span className="text-stone-400">— sin asignar</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {enProceso ? (
                  <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                ) : (
                  <>
                    <button onClick={() => aplicarEstado(ut.id, ut.nombre, 'liberado')}
                      title="Liberado"
                      className={`w-9 h-9 rounded flex items-center justify-center border transition-colors ${est === 'liberado' ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-stone-300 hover:border-emerald-400'}`}>
                      <CheckCircle2 className={`w-4 h-4 ${est === 'liberado' ? 'text-white' : 'text-emerald-500'}`} />
                    </button>
                    <button onClick={() => aplicarEstado(ut.id, ut.nombre, 'pendiente')}
                      title="Pendiente"
                      className={`w-9 h-9 rounded flex items-center justify-center border transition-colors ${est === 'pendiente' ? 'bg-amber-500 border-amber-500' : 'bg-white border-stone-300 hover:border-amber-400'}`}>
                      <Clock className={`w-4 h-4 ${est === 'pendiente' ? 'text-white' : 'text-amber-500'}`} />
                    </button>
                    <button onClick={() => aplicarEstado(ut.id, ut.nombre, 'urgencia')}
                      title="Urgencia"
                      className={`w-9 h-9 rounded flex items-center justify-center border transition-colors ${est === 'urgencia' ? 'bg-red-500 border-red-500' : 'bg-white border-stone-300 hover:border-red-400'}`}>
                      <AlertTriangle className={`w-4 h-4 ${est === 'urgencia' ? 'text-white' : 'text-red-500'}`} />
                    </button>
                    {est && (
                      <button onClick={() => quitarEstado(ut.id)} title="Quitar estado"
                        className="w-9 h-9 rounded flex items-center justify-center border border-stone-200 hover:border-stone-400 text-stone-400 hover:text-stone-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {utsFiltradas.length > PORPAGINA && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-200">
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura <= 1}
            className="px-3 py-1.5 text-sm border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed">
            ← Anterior
          </button>
          <span className="text-xs font-mono text-stone-500">
            Pagina {paginaSegura} de {totalPaginas} · {utsFiltradas.length} UTs
          </span>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas}
            className="px-3 py-1.5 text-sm border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed">
            Siguiente →
          </button>
        </div>
      )}

      {confirmUrgencia && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setConfirmUrgencia(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-stone-200 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-stone-900">Confirmar Urgencia</h3>
            </div>
            <div className="px-5 py-4 overflow-y-auto">
              <p className="text-sm text-stone-700 mb-3">
                Vas a poner en <strong className="text-red-600">Urgencia</strong> la UT <strong>{confirmUrgencia.clave}</strong>
                {confirmUrgencia.nombre ? ` · ${confirmUrgencia.nombre}` : ''}.
              </p>

              {confirmUrgencia.cargando ? (
                <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando desglose...
                </div>
              ) : (() => {
                const filas = confirmUrgencia.desglose || [];
                const conInc = filas.filter(f => f.incidencia_id);
                const porPoste = {};
                for (const f of filas) {
                  if (!porPoste[f.poste]) porPoste[f.poste] = { num: f.num_poste, incidencias: [] };
                  if (f.incidencia_id) porPoste[f.poste].incidencias.push(f);
                }
                const postes = Object.entries(porPoste).sort((a, b) => (a[1].num || 0) - (b[1].num || 0));
                return (
                  <div>
                    <div className="text-sm text-stone-700 mb-2">
                      Esto pondrá en <strong className="text-red-600">urgente</strong> las <strong>{conInc.length}</strong> incidencia(s) no resueltas de esta UT:
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {postes.map(([poste, info]) => (
                        <div key={poste} className="border border-stone-200 rounded-lg p-2.5">
                          <div className="font-mono text-xs font-semibold text-stone-800 mb-1">
                            {poste} <span className="text-stone-400 font-normal">(poste {info.num})</span>
                            {info.incidencias.length === 0 && <span className="text-emerald-600 font-normal ml-1">— sin incidencias</span>}
                          </div>
                          {info.incidencias.map(inc => (
                            <div key={inc.incidencia_id} className="text-[12px] text-stone-600 flex items-center gap-1.5 pl-2">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SEV_COLOR[inc.severidad] || '#999' }} />
                              <span className="font-mono">{inc.incidencia_id}</span>
                              <span className="truncate">{inc.tipo}</span>
                              <span className="ml-auto text-[10px] uppercase font-mono flex-shrink-0" style={{ color: SEV_COLOR[inc.severidad] || '#999' }}>{inc.severidad}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    {conInc.length === 0 && (
                      <div className="text-sm text-stone-500 italic mt-2">Esta UT no tiene incidencias no resueltas. Solo se marcará el estado.</div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 flex gap-2 justify-end">
              <button onClick={() => setConfirmUrgencia(null)}
                className="px-4 py-2 border border-stone-300 text-stone-600 text-sm rounded-lg hover:bg-stone-50">Cancelar</button>
              <button onClick={confirmarUrgencia} disabled={confirmUrgencia.cargando}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-40 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Confirmar Urgencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}