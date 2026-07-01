import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getFichaUt } from '../lib/data.js';

const LOGO = import.meta.env.BASE_URL + 'gam-logo.png';

const L = {
  fichaTecnica: 'Ficha t\u00E9cnica',
  camaraPtz: 'C\u00E1mara PTZ',
  camaraBullet1: 'C\u00E1mara Bullet 1',
  camaraBullet2: 'C\u00E1mara Bullet 2',
  botonPanico: 'Bot\u00F3n de p\u00E1nico',
  internet: 'Internet',
  centro: 'Centro de inteligencia',
  poste: 'Poste',
  conexionCorrecta: 'Conexi\u00F3n correcta',
  conexionExitosa: 'Conexi\u00F3n exitosa',
  instalado: 'Instalado',
  funcionando: 'Funcionando',
  pendiente: 'Pendiente',
  noInstalada: 'No instalada',
  noInstalado: 'No instalado',
  sinFoto: 'Sin foto',
  verMapa: 'Ver en mapa',
  cargando: 'Cargando fichas...',
  errorCarga: 'No se pudieron cargar los datos',
  sinPostes: 'Sin postes en esta UT',
  alcaldiaFull: 'Alcald\u00EDa Gustavo A. Madero',
  cerrar: '\u00D7',
  guion: '\u2014'
};

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Fila(props) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-stone-100 first:border-t-0">
      <span className="text-[13px] text-stone-700">
        {props.nombre}
        {props.extra ? <span className="text-stone-400"> {props.extra}</span> : null}
      </span>
      {props.ok
        ? <span className="flex items-center gap-1 text-[12px] text-emerald-600 font-medium whitespace-nowrap"><Check />{props.okLabel}</span>
        : <span className="text-[12px] text-stone-400 whitespace-nowrap">{props.noLabel || L.guion}</span>}
    </div>
  );
}

function PosteCard(props) {
  const p = props.poste;
  const et = p.etapas || {};
  const cam = p.cam || {};
  const eq = p.equipos || null;
  const done = function (s) { return et[s] === true; };
  const eqOk = function (k) { return eq && eq[k] && !eq[k].no_instalado; };
  const ptz = Number(cam.ptz || 0);
  const bullet = Number(cam.bullet || 0);
  const panico = cam.boton_panico === true || eqOk('boton_panico');
  const foto = (cam.fotos && cam.fotos.length > 0) ? cam.fotos[0] : null;
  const numTxt = (p.num !== null && p.num !== undefined) ? ('#' + p.num) : L.guion;
  const [zoom, setZoom] = useState(false);

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100" style={{ background: '#fbfaf9' }}>
        <span className="font-mono text-sm font-bold text-rose-600">{p.id}</span>
        {p.alias ? <span className="text-xs text-stone-500 truncate">{p.alias}</span> : null}
      </div>
      <div className="flex gap-3 p-3">
        <div className="shrink-0">
          {foto
            ? <img src={foto} alt={p.id}
                onMouseEnter={function () { setZoom(true); }}
                onMouseLeave={function () { setZoom(false); }}
                className="w-[116px] h-[150px] object-cover rounded border border-stone-200 cursor-zoom-in" loading="lazy" />
            : <div className="w-[116px] h-[150px] rounded border border-stone-200 bg-stone-50 flex items-center justify-center text-[11px] text-stone-400 text-center px-2">{L.sinFoto}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between py-1.5 border-t border-stone-100 first:border-t-0">
            <span className="text-[13px] text-stone-700">{L.poste}</span>
            <span className="text-[12px] text-stone-700 font-medium whitespace-nowrap">{numTxt}</span>
          </div>
          <Fila nombre={L.camaraPtz} ok={ptz > 0} okLabel={L.funcionando} noLabel={L.noInstalada} />
          <Fila nombre={L.camaraBullet1} ok={bullet >= 1} okLabel={L.funcionando} noLabel={L.noInstalada} />
          <Fila nombre={L.camaraBullet2} ok={bullet >= 2} okLabel={L.funcionando} noLabel={L.noInstalada} />
          <Fila nombre={L.botonPanico} ok={panico} okLabel={L.instalado} noLabel={L.noInstalado} />
          <Fila nombre={L.internet} ok={done('internet')} okLabel={L.conexionCorrecta} noLabel={L.pendiente} />
          <Fila nombre={L.centro} ok={done('centro')} okLabel={L.conexionExitosa} noLabel={L.pendiente} />
        </div>
      </div>
      <div className="px-3 pb-3 flex items-end justify-between gap-2">
        <div className="text-[11px] text-stone-500 min-w-0">
          <div className="truncate" title={p.direccion || ''}>{p.direccion || L.guion}</div>
          <div className="font-mono text-stone-400">{Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</div>
        </div>
        {props.onVerPunto
          ? <button type="button" onClick={function () { props.onVerPunto(p); }} className="shrink-0 text-[11px] px-2 py-1 rounded border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 font-medium">{L.verMapa}</button>
          : null}
      </div>
      {(zoom && foto) ? createPortal(
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 100, pointerEvents: 'none' }}>
          <img src={foto} alt={p.id} style={{ maxWidth: '70vw', maxHeight: '80vh', borderRadius: 10, border: '3px solid #ffffff', boxShadow: '0 10px 40px rgba(0,0,0,0.45)' }} />
        </div>, document.body) : null}
    </div>
  );
}

export default function FichaTecnicaUT(props) {
  const utId = props.utId;
  const [loading, setLoading] = useState(true);
  const [postes, setPostes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(function () {
    let cancel = false;
    setLoading(true);
    setError(null);
    getFichaUt(utId)
      .then(function (rows) { if (!cancel) { setPostes(rows || []); setLoading(false); } })
      .catch(function () { if (!cancel) { setError(L.errorCarga); setLoading(false); } });
    return function () { cancel = true; };
  }, [utId]);

  const overlay = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={props.onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-[940px] max-w-[97vw] max-h-[93vh] flex flex-col overflow-hidden" style={{ borderTop: '4px solid #611232' }} onClick={function (e) { e.stopPropagation(); }}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-stone-200">
          <div className="flex items-center gap-3 min-w-0">
            <img src={LOGO} alt="GAM" className="h-11 w-auto" style={{ maxWidth: 170, objectFit: 'contain' }} />
            <div className="border-l border-stone-300 pl-3 min-w-0">
              <div className="text-base font-semibold text-stone-800">{L.fichaTecnica}</div>
              <div className="text-xs text-stone-500 truncate">{props.utNombre || utId}</div>
            </div>
          </div>
          <button type="button" onClick={props.onClose} className="text-stone-400 hover:text-stone-700 text-2xl leading-none px-1 shrink-0">{L.cerrar}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4" style={{ background: '#faf9f7' }}>
          {loading
            ? <div className="text-center py-16 text-stone-400 text-sm">{L.cargando}</div>
            : error
              ? <div className="text-center py-16 text-red-600 text-sm">{error}</div>
              : postes.length === 0
                ? <div className="text-center py-16 text-stone-400 text-sm">{L.sinPostes}</div>
                : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {postes.map(function (p) { return <PosteCard key={p.id} poste={p} onVerPunto={props.onVerPunto} />; })}
                  </div>}
        </div>
        <div className="px-4 py-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-400">
          <span>{L.alcaldiaFull}</span>
          <span>{postes.length} postes</span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}