/**
 * src/components/MantenimientoScoutingView.jsx
 * Vista de scouting SOLO de mantenimientos M1 / M2 / M3.
 *
 * Independiente de ScoutingView.jsx (rutas): aquí no hay rutas ni tipos viejos,
 * únicamente los tres mantenimientos nuevos, con registro directo:
 *   elegir poste → elegir M1/M2/M3 → capturar checklist con foto por paso.
 *
 * Búsqueda: solo por ID de poste y clave de UT.
 *
 * Guarda en attrs.mantenimiento.m1 / .m2 / .m3 de la etapa 'camaras' ("Mgeneral").
 * NO colisiona con el histórico de silicón (m1_mantenimiento) ni con las claves
 * de ruta (m2_poe_alineacion / m3_centro): son claves distintas. Sin migración.
 *
 * Clasificación automática por etapa:
 *   E5 (internet)        hecha → M1 (internet propio)
 *   E6 (conexion_poste)  hecha → M2 (jala de otro)
 *   ninguna de las dos          → INDEFINIDO (se elige manual; al completarse
 *                                 E5/E6 por el scouting normal, se auto-clasifica)
 * Siempre se permite forzar la elección manualmente.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Search, Camera, Upload, Check, Loader2,
  AlertCircle, AlertTriangle, MapPin, Ban,
} from 'lucide-react';
import {
  uploadStagePhoto, updateStageAtomic, withStagePhotoUrls, normalizePhotoUrls,
} from '../lib/data.js';
import { getPersistedForm, persistForm, clearPersistedForm, onBackgroundSave } from '../lib/formPersist.js';
import { savePhotos, loadPhotos, clearPhotos } from '../lib/photoPersist.js';

// Escritura ACTIVA: el guardado SI escribe en Supabase. Ponlo en true para volver
// al modo prueba: arma el payload, lo imprime en consola y no escribe nada.
const M123_DRY_RUN = false;

const M123_STAGE_ID = 'camaras';   // contenedor "Mgeneral"
const M123_STAGE_E5 = 'internet';
const M123_STAGE_E6 = 'conexion_poste';

export const M123 = {
  m3: {
    key: 'm3', label: 'M3 General', aplica: 'Todos los postes', emoji: '🗼',
    steps: [
      ['m3_corona_1', 'Corona 1'],
      ['m3_corona_2', 'Corona 2'],
      ['m3_brazo_izq', 'Brazo izquierdo'],
      ['m3_brazo_der', 'Brazo derecho'],
      ['m3_alinear_antena', 'Alinear antena'],
    ],
  },
  m1: {
    key: 'm1', label: 'M1 Internet propio', aplica: 'Internet propio (E5)', emoji: '🌐',
    steps: [
      ['m1_punto_internet', 'Punto de internet'],
      ['m1_tira_led', 'Tira LED'],
      ['m1_acrilico', 'Acrílico'],
      ['m1_ucg', 'Conectar UCG'],
    ],
  },
  m2: {
    key: 'm2', label: 'M2 Jala de otro', aplica: 'Jala de otro (E6)', emoji: '🔌',
    steps: [
      ['m2_tira_led', 'Tira LED'],
      ['m2_acrilico', 'Acrílico'],
    ],
  },
};
const M123_ORDER = ['m3', 'm1', 'm2'];

// ---- helpers del contenedor "Mgeneral" ----
function m123Mgeneral(post) {
  const m = post?.stages?.[M123_STAGE_ID]?.attrs?.mantenimiento;
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}
function m123FaseHecha(post, key) {
  const f = m123Mgeneral(post)[key];
  return !!(f && typeof f === 'object' && f.checks && Object.keys(f.checks).length);
}
function m123Avance(post, key) {
  const f = m123Mgeneral(post)[key];
  const total = M123[key].steps.length;
  const done = (f && f.checks) ? Object.keys(f.checks).length : 0;
  return done + '/' + total;
}
// Clasificación automática: { tipo: 'm1'|'m2'|null, indefinido, e5, e6 }
function m123Clasificar(post) {
  const e5 = !!post?.stages?.[M123_STAGE_E5]?.done;
  const e6 = !!post?.stages?.[M123_STAGE_E6]?.done;
  if (e5) return { tipo: 'm1', indefinido: false, e5, e6 };
  if (e6) return { tipo: 'm2', indefinido: false, e5, e6 };
  return { tipo: null, indefinido: true, e5, e6 };
}
// Poste REAL: excluye fusionados/duplicados (los ~736 que no cuentan).
// Se cubren varios nombres posibles del campo por si data.js no los filtra ya.
function esPosteReal(p) {
  if (!p) return false;
  return !p.fusionado_en && !p.fusionadoEn && !p.fusionado
      && !p.merged_into && !p.mergedInto && !p.duplicado_de;
}

// ¿Alguna fase capturada pero sin terminar? (le faltan pasos)
function m123Incompleto(post) {
  const mg = m123Mgeneral(post);
  for (const k of ['m1', 'm2', 'm3']) {
    const f = mg[k];
    if (f && typeof f === 'object' && f.checks && Object.keys(f.checks).length && !f.completo) return true;
  }
  return false;
}

function m123StepLabel(cfg, id) {
  const s = cfg.steps.find(([sid]) => sid === id);
  return s ? s[1] : id;
}

// ---- Migración del histórico de silicón (m1_mantenimiento) → M1/M2/M3 ----
// Reglas acordadas con el responsable:
//   sil_corona_1/2 y sil_brazo_izq/der → M3  (queda 4/5: falta "alinear antena")
//   sil_acrilico → M1 si el poste tiene E5 · M2 si tiene E6 (sin E5)
//   Si no tiene E5 ni E6 (indefinido): su acrílico NO se migra, solo su M3.
// NUNCA se borra m1_mantenimiento: queda intacto como respaldo.
const MIGRA_M3 = {
  sil_corona_1: 'm3_corona_1',
  sil_corona_2: 'm3_corona_2',
  sil_brazo_izq: 'm3_brazo_izq',
  sil_brazo_der: 'm3_brazo_der',
};

function siliconChecks(post) {
  const f = post?.stages?.[M123_STAGE_ID]?.attrs?.mantenimiento?.m1_mantenimiento;
  const c = (f && typeof f === 'object' && f.checks && typeof f.checks === 'object') ? f.checks : null;
  return (c && Object.keys(c).length) ? c : null;
}

function checkDesdeViejo(cfg, destino, c) {
  return {
    label: m123StepLabel(cfg, destino),
    result: c.result || 'ok',
    notas: c.notas || c.notes || '',
    photos: Array.isArray(c.photos) ? c.photos.filter(u => typeof u === 'string' && u.startsWith('http')) : [],
  };
}

// Calcula QUÉ se escribiría, sin escribir. Nunca pisa un check ya capturado.
function planMigracion(posts) {
  const plan = [];
  for (const p of (posts || []).filter(esPosteReal)) {
    const viejo = siliconChecks(p);
    if (!viejo) continue;
    const mg = m123Mgeneral(p);
    const fases = {};

    const m3Checks = {};
    for (const [origen, destino] of Object.entries(MIGRA_M3)) {
      const c = viejo[origen];
      if (!c || mg.m3?.checks?.[destino]) continue;
      m3Checks[destino] = checkDesdeViejo(M123.m3, destino, c);
    }
    if (Object.keys(m3Checks).length) fases.m3 = m3Checks;

    const cls = m123Clasificar(p);
    const acr = viejo.sil_acrilico;
    if (acr && !cls.indefinido) {
      const fk = cls.tipo;                 // 'm1' | 'm2'
      const dest = fk + '_acrilico';
      if (!mg[fk]?.checks?.[dest]) fases[fk] = { [dest]: checkDesdeViejo(M123[fk], dest, acr) };
    }

    if (Object.keys(fases).length) {
      plan.push({ post: p, fases, indefinido: cls.indefinido, acrilicoOmitido: !!acr && cls.indefinido });
    }
  }
  return plan;
}

// Escribe un poste del plan (fusionando, sin borrar nada).
async function aplicarMigracion(item) {
  const p = item.post;
  const oldAttrs = p.stages?.[M123_STAGE_ID]?.attrs || {};
  const prevMant = (oldAttrs.mantenimiento && typeof oldAttrs.mantenimiento === 'object' && !Array.isArray(oldAttrs.mantenimiento)) ? oldAttrs.mantenimiento : {};
  const nuevo = { ...prevMant };
  for (const [fk, checksNuevos] of Object.entries(item.fases)) {
    const prevFase = (prevMant[fk] && typeof prevMant[fk] === 'object') ? prevMant[fk] : {};
    const prevChecks = (prevFase.checks && typeof prevFase.checks === 'object') ? prevFase.checks : {};
    const merged = { ...prevChecks, ...checksNuevos };
    const total = M123[fk].steps.length;
    const done = Object.keys(merged).length;
    nuevo[fk] = {
      ...prevFase,
      fase: fk,
      fecha: prevFase.fecha || new Date().toISOString(),
      resultado: Object.values(merged).some(c => c.result === 'problema') ? 'observacion' : 'ok',
      completo: done >= total,
      avance: done + '/' + total,
      origen: 'migracion_silicon',
      checks: merged,
    };
  }
  await updateStageAtomic(p.id, M123_STAGE_ID, { attrs: { ...oldAttrs, mantenimiento: nuevo } });
}

// =============================================================================
// Vista principal — elegir poste → elegir fase → capturar
// =============================================================================
export default function MantenimientoScoutingView({ posts, profile, onZoomPosts }) {
  const [postId, setPostId] = useState(null);
  const [fase, setFase] = useState(null);
  const post = useMemo(() => (posts || []).find(p => p.id === postId) || null, [posts, postId]);

  if (post && fase) {
    return (
      <M123CaptureForm
        post={post}
        fase={fase}
        profile={profile}
        onBack={() => setFase(null)}
        onSaved={() => { setFase(null); setPostId(null); }}
      />
    );
  }
  if (post) {
    return <M123FasePicker post={post} onBack={() => setPostId(null)} onPick={(k) => setFase(k)} />;
  }
  return <M123PostPicker posts={posts} onZoomPosts={onZoomPosts} onPick={(p) => { setPostId(p.id); setFase(null); }} />;
}

// =============================================================================
// M123PostPicker — elegir poste. Búsqueda SOLO por ID de poste y clave de UT.
// =============================================================================
function M123PostPicker({ posts, onPick, onZoomPosts }) {
  const [search, setSearch] = useState('');
  const [ut, setUt] = useState('todas');         // filtro por Unidad Territorial (clave)
  const [filtro, setFiltro] = useState('todos'); // todos | m3 | m1 | m2 | indefinido

  // Catálogo de UTs (clave + cuántos postes reales tiene), ordenado.
  const utList = useMemo(() => {
    const m = new Map();
    for (const p of (posts || []).filter(esPosteReal)) {
      const k = p.unidad_territorial || '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()]
      .map(([clave, n]) => ({ clave, n }))
      .sort((a, b) => String(a.clave).localeCompare(String(b.clave)));
  }, [posts]);

  const list = useMemo(() => {
    const base = (posts || []).filter(esPosteReal)
      .filter(p => ut === 'todas' || (p.unidad_territorial || '—') === ut);
    const q = search.trim().toLowerCase();
    // Solo ID de poste y clave de UT (nada de alias ni dirección).
    const porTexto = q ? base.filter(p =>
      String(p.id || '').toLowerCase().includes(q) ||
      String(p.unidad_territorial || '').toLowerCase().includes(q)) : base;
    const porTipo = porTexto.filter(p => {
      if (filtro === 'todos') return true;
      if (filtro === 'm3') return true;   // M3 aplica a TODOS los postes reales
      if (filtro === 'incompleto') return m123Incompleto(p);
      const c = m123Clasificar(p);
      if (filtro === 'indefinido') return c.indefinido;
      return c.tipo === filtro;
    });
    return porTipo.slice(0, 100);
  }, [posts, search, filtro, ut]);

  const conteos = useMemo(() => {
    const base = (posts || []).filter(esPosteReal)
      .filter(p => ut === 'todas' || (p.unidad_territorial || '—') === ut);
    let m1 = 0, m2 = 0, ind = 0, incompletos = 0;
    for (const p of base) {
      const c = m123Clasificar(p);
      if (c.indefinido) ind++; else if (c.tipo === 'm1') m1++; else if (c.tipo === 'm2') m2++;
      if (m123Incompleto(p)) incompletos++;
    }
    return { total: base.length, m1, m2, ind, incompletos };
  }, [posts, ut]);

  const FILTROS = [
    ['todos', 'Todos (' + conteos.total + ')'],
    ['m3', 'M3 · Todos (' + conteos.total + ')'],
    ['m1', 'M1 · E5 (' + conteos.m1 + ')'],
    ['m2', 'M2 · E6 (' + conteos.m2 + ')'],
    ['indefinido', 'Sin E5 ni E6 (' + conteos.ind + ')'],
    ['incompleto', 'Incompletos (' + conteos.incompletos + ')'],
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-4 sm:px-6 border-b border-stone-300">
        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-indigo-500/80">Scouting de mantenimiento</div>
        <h1 className="text-xl font-light text-stone-950 mt-1">Mantenimientos M1 · M2 · M3</h1>
        <p className="text-xs text-stone-500 mt-1">
          {conteos.total.toLocaleString()} postes reales{ut !== 'todas' ? ' en ' + ut : ''} · M3 aplica a todos.
        </p>
        <div className="mt-3">
          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 mb-1 block">1 · Unidad territorial</label>
          <select value={ut} onChange={e => {
              const valor = e.target.value;
              setUt(valor);
              // Zoom del mapa a los postes de la UT elegida (o a todos si es "todas").
              if (onZoomPosts) {
                onZoomPosts((posts || []).filter(esPosteReal)
                  .filter(p => valor === 'todas' || (p.unidad_territorial || '—') === valor));
              }
            }}
            className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 font-mono focus:outline-none focus:border-indigo-500">
            <option value="todas">Todas las UT ({utList.length})</option>
            {utList.map(u => <option key={u.clave} value={u.clave}>{u.clave} ({u.n})</option>)}
          </select>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por poste o clave…"
            className="w-full bg-stone-100 border border-stone-300 rounded-lg pl-10 pr-3 py-2.5 text-sm text-stone-950 placeholder-stone-500 focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {FILTROS.map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={'px-2.5 py-1 text-[11px] font-mono uppercase rounded border-2 transition-colors ' +
                (filtro === k ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'border-stone-300 text-stone-500 hover:border-stone-400')}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-stone-300/50">
        {list.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-stone-400">Sin postes que coincidan.</div>
        )}
        {list.map(p => {
          const c = m123Clasificar(p);
          // Si ya se capturó M1 o M2, esa captura define el tipo: no se dice "indefinido".
          const capturado = m123FaseHecha(p, 'm1') ? 'm1' : (m123FaseHecha(p, 'm2') ? 'm2' : null);
          const tipoMostrar = c.indefinido ? capturado : c.tipo;
          const badge = !tipoMostrar
            ? { t: 'Sin E5 ni E6', c: 'bg-amber-100 text-amber-700' }
            : tipoMostrar === 'm1'
              ? { t: c.indefinido ? '🌐 M1' : '🌐 M1 · E5', c: 'bg-blue-100 text-blue-700' }
              : { t: c.indefinido ? '🔌 M2' : '🔌 M2 · E6', c: 'bg-teal-100 text-teal-700' };
          return (
            <button key={p.id} onClick={() => onPick(p)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-100 text-left">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-stone-500" strokeWidth={1.5} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-bold text-stone-950">{p.id}</span>
                  <span className={'text-[10px] font-mono px-1.5 py-0.5 rounded ' + badge.c}>{badge.t}</span>
                  {m123FaseHecha(p, 'm3') && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">M3 {m123Avance(p, 'm3')}</span>}
                  {m123FaseHecha(p, 'm1') && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">M1 {m123Avance(p, 'm1')}</span>}
                  {m123FaseHecha(p, 'm2') && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">M2 {m123Avance(p, 'm2')}</span>}
                  {m123Incompleto(p) && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ Incompleto</span>}
                </div>
                <div className="text-xs text-stone-500 truncate font-mono">{p.unidad_territorial || '—'}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" strokeWidth={1.5} />
            </button>
          );
        })}
        {list.length >= 100 && <div className="px-4 py-2 text-center text-[11px] text-stone-400">Mostrando 100 — usa la búsqueda para afinar.</div>}
      </div>
    </div>
  );
}

// =============================================================================
// M123FasePicker — M3 siempre; M1/M2 automático por E5/E6, con override manual
// =============================================================================
function M123FasePicker({ post, onBack, onPick }) {
  const cls = m123Clasificar(post);
  const [manual, setManual] = useState(cls.indefinido); // indefinido arranca en manual

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-stone-600 hover:text-stone-950"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <div className="text-sm font-mono font-bold text-stone-950">{post.id}</div>
          <div className="text-xs text-stone-500 truncate font-mono">{post.unidad_territorial || ''}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Clasificación automática */}
        <div className={'p-3 rounded-lg border text-xs ' + (cls.indefinido ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800')}>
          {cls.indefinido ? (
            <>
              <div className="font-bold mb-0.5">Sin E5 ni E6</div>
              No tiene E5 (internet) ni E6 (conexión), así que no se puede clasificar solo.
              Haz primero el scouting de E5 o E6 y se clasificará automáticamente, o elige M1/M2 manualmente aquí.
            </>
          ) : (
            <>
              <div className="font-bold mb-0.5">
                {cls.tipo === 'm1' ? '🌐 Clasificado como M1 (internet propio)' : '🔌 Clasificado como M2 (jala de otro)'}
              </div>
              Automático por {cls.tipo === 'm1' ? 'E5 (internet) completada' : 'E6 (conexión) completada'}.
            </>
          )}
        </div>

        {!cls.indefinido && (
          <label className="flex items-center gap-2 text-xs text-stone-600 font-mono">
            <input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
            Elegir manualmente (ignorar clasificación automática)
          </label>
        )}

        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-stone-400 pt-1">Elige el mantenimiento</div>
        {M123_ORDER.map(k => {
          const cfg = M123[k];
          const started = m123FaseHecha(post, k);
          const esAuto = !cls.indefinido && cls.tipo === k;
          // M3 siempre. M1/M2: el automático siempre; el otro solo en manual (o si ya se empezó).
          const habilitado = k === 'm3' || esAuto || manual || started;
          const blocked = !habilitado;
          const porManual = k !== 'm3' && !esAuto && habilitado;
          return (
            <button key={k} type="button" disabled={blocked} onClick={() => !blocked && onPick(k)}
              className={'w-full text-left p-4 rounded-xl border-2 transition-all ' +
                (blocked ? 'border-stone-200 bg-stone-100 opacity-60 cursor-not-allowed' : 'border-stone-300 bg-stone-50 hover:border-indigo-500')}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">{cfg.emoji}</span>
                <span className="text-sm font-bold text-stone-950">{cfg.label}</span>
                {esAuto && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">automático</span>}
                {porManual && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">manual</span>}
                {started && <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{m123Avance(post, k)}</span>}
              </div>
              <div className="text-xs text-stone-500 mt-1">{cfg.aplica} · {cfg.steps.length} pasos</div>
              {blocked && (
                <div className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 flex-shrink-0" />
                  Este poste está clasificado como {String(cls.tipo || '').toUpperCase()}. Marca "elegir manualmente" para forzarlo.
                </div>
              )}
              {started && !blocked && <div className="mt-1 text-[11px] text-emerald-600">Continuar captura</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// M123CaptureForm — checklist con foto obligatoria por paso
// =============================================================================
function M123CaptureForm({ post, fase, profile, onBack, onSaved }) {
  const cfg = M123[fase];
  const cls = m123Clasificar(post);
  const formKey = 'm123_' + post.id + '_' + fase;
  const saved = useMemo(() => getPersistedForm(formKey), [formKey]);
  const [restored] = useState(() => !!saved);

  const prevFase = useMemo(() => {
    const f = m123Mgeneral(post)[fase];
    return (f && typeof f === 'object') ? f : {};
  }, [post, fase]);
  const prevChecks = (prevFase.checks && typeof prevFase.checks === 'object') ? prevFase.checks : {};

  const [checks, setChecks] = useState(() => {
    if (saved?.checks) return saved.checks;
    const init = {};
    for (const [id] of cfg.steps) {
      if (prevChecks[id]) init[id] = { result: prevChecks[id].result || 'ok', notes: prevChecks[id].notas || '' };
    }
    return init;
  });
  const [photos, setPhotos] = useState({}); // { checkId: [{ id, file, preview }] }
  const [generalNotes, setGeneralNotes] = useState(saved?.generalNotes ?? (prevFase.notas || ''));
  const [gps, setGps] = useState({});
  const [saving, setSaving] = useState(false);

  // Persistencia del formulario (misma mecánica que el scout de rutas)
  useEffect(() => {
    const state = { checks, generalNotes };
    persistForm(formKey, state);
    return onBackgroundSave(formKey, () => state);
  }, [formKey, checks, generalNotes]);

  const [photosHydrated, setPhotosHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPhotosHydrated(false);
    loadPhotos(formKey).then(p => {
      if (cancelled) return;
      if (p && Object.keys(p).length) {
        setPhotos(prev => {
          const merged = { ...p };
          for (const [k, arr] of Object.entries(prev || {})) if (arr?.length) merged[k] = arr;
          return merged;
        });
      }
      setPhotosHydrated(true);
    }).catch(() => { if (!cancelled) setPhotosHydrated(true); });
    return () => { cancelled = true; };
  }, [formKey]);
  useEffect(() => {
    if (!photosHydrated) return;
    savePhotos(formKey, photos);
  }, [formKey, photos, photosHydrated]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), source: 'device' }),
        () => {}, { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const setCheck = (id, field, val) => setChecks(prev => ({ ...prev, [id]: { ...(prev[id] || { result: 'ok', notes: '' }), [field]: val } }));
  const addPhoto = (id, file) => {
    const reader = new FileReader();
    reader.onload = ev => setPhotos(prev => ({ ...prev, [id]: [...(prev[id] || []), { id: Date.now() + Math.random(), file, preview: ev.target.result }] }));
    reader.readAsDataURL(file);
  };
  const removePhoto = (id, pid) => setPhotos(prev => ({ ...prev, [id]: (prev[id] || []).filter(x => x.id !== pid) }));

  const stepHasPhoto = (id) => (photos[id]?.length > 0) || ((prevChecks[id]?.photos || []).length > 0);
  const stepTouched = (id) => !!checks[id]?.result || (photos[id]?.length > 0) || !!checks[id]?.notes;

  const handleSave = async () => {
    const touched = cfg.steps.map(([id]) => id).filter(stepTouched);
    if (touched.length === 0) { alert('Marca al menos un paso antes de guardar.'); return; }
    const missing = touched.filter(id => !stepHasPhoto(id));
    if (missing.length) {
      alert('Falta foto en: ' + missing.map(id => m123StepLabel(cfg, id)).join(', ') + '.\n\nCada paso trabajado necesita al menos una foto.');
      return;
    }
    setSaving(true);
    try {
      // Subir fotos nuevas por paso (en DRY-RUN no se sube nada)
      const uploaded = {};
      for (const [id, arr] of Object.entries(photos)) {
        if (!arr?.length) continue;
        uploaded[id] = [];
        for (const ph of arr) {
          uploaded[id].push(M123_DRY_RUN ? '(pendiente-de-subir)' : await uploadStagePhoto(post.id, 'scout_' + id, ph.file));
        }
      }

      // Fusionar con lo previo (NO destructivo)
      const oldAttrs = post.stages?.[M123_STAGE_ID]?.attrs || {};
      const prevMant = (oldAttrs.mantenimiento && typeof oldAttrs.mantenimiento === 'object' && !Array.isArray(oldAttrs.mantenimiento)) ? oldAttrs.mantenimiento : {};
      const mergedChecks = { ...prevChecks };
      for (const id of touched) {
        const c = checks[id] || {};
        mergedChecks[id] = {
          label: m123StepLabel(cfg, id),
          result: c.result || 'ok',
          notas: c.notes || '',
          photos: [...((prevChecks[id]?.photos) || []), ...((uploaded[id]) || [])],
        };
      }
      const totalReq = cfg.steps.length;
      const doneCount = Object.keys(mergedChecks).length;
      const hasProblems = Object.values(mergedChecks).some(c => c.result === 'problema');
      const esAuto = !cls.indefinido && cls.tipo === fase;
      const faseRecord = {
        fase,
        fecha: new Date().toISOString(),
        resultado: hasProblems ? 'observacion' : 'ok',
        completo: doneCount >= totalReq,
        avance: doneCount + '/' + totalReq,
        notas: generalNotes || prevFase.notas || '',
        gps: gps.lat ? gps : (prevFase.gps || null),
        por: profile?.userId || prevFase.por || null,
        // Trazabilidad de la clasificación
        clasificacion: fase === 'm3' ? 'na' : (esAuto ? 'auto' : 'manual'),
        indefinido: fase === 'm3' ? false : cls.indefinido,
        e5: cls.e5,
        e6: cls.e6,
        checks: mergedChecks,
      };
      const mergedAttrs = { ...oldAttrs, mantenimiento: { ...prevMant, [fase]: faseRecord } };

      const maintPhotos = touched.flatMap(id => uploaded[id] || []).filter(u => typeof u === 'string' && u.startsWith('http'));
      const existingPhotos = normalizePhotoUrls([...(Array.isArray(post.stages?.[M123_STAGE_ID]?.photos) ? post.stages[M123_STAGE_ID].photos : []), post.stages?.[M123_STAGE_ID]?.photo]);
      const allPhotos = normalizePhotoUrls([...existingPhotos, ...maintPhotos]);

      if (M123_DRY_RUN) {
        console.log('[M123 DRY-RUN] camaras.attrs.mantenimiento.' + fase + ' =', faseRecord);
        console.log('[M123 DRY-RUN] updateStageAtomic(', post.id, ', "' + M123_STAGE_ID + '", { attrs, photoUrl })', { attrs: withStagePhotoUrls(mergedAttrs, allPhotos) });
        alert('DRY-RUN activo: NO se escribió en la base.\nRevisa la consola para ver el payload que se guardaría.\n\nPara guardar de verdad, pon M123_DRY_RUN = false (tras aprobación).');
        setSaving(false);
        return;
      }

      await updateStageAtomic(post.id, M123_STAGE_ID, {
        attrs: withStagePhotoUrls(mergedAttrs, allPhotos),
        photoUrl: allPhotos[0] || undefined,
        done: post.stages?.[M123_STAGE_ID]?.done || undefined,
      });
      clearPersistedForm(formKey);
      clearPhotos(formKey);
      onSaved();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setSaving(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3 sticky top-0 bg-amber-50 z-10">
        <button onClick={() => { clearPersistedForm(formKey); clearPhotos(formKey); onBack(); }} className="p-2 -ml-2 text-stone-600 hover:text-stone-950"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-bold text-stone-950">{post.id}</span>
            <span className="text-[13px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{cfg.emoji} {cfg.label}</span>
          </div>
          <div className="text-xs text-stone-500 truncate font-mono">{post.unidad_territorial || ''}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {M123_DRY_RUN && (
          <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Modo prueba (DRY-RUN): el guardado NO escribe en la base. Se habilita al aprobar.
          </div>
        )}
        {restored && (
          <div className="p-2.5 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {Object.values(photos).some(a => a?.length) ? 'Datos y fotos recuperados de sesión anterior.' : 'Datos recuperados de sesión anterior. Las fotos nuevas deben re-capturarse.'}
          </div>
        )}

        <div className="p-3 rounded-lg border border-stone-300 bg-stone-100">
          <div className="text-[12px] font-mono uppercase text-stone-500 mb-1">Tu ubicación</div>
          {gps.lat ? <div className="text-xs font-mono text-emerald-600">📡 {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} · ±{gps.accuracy}m</div> : <div className="text-xs text-stone-500">Obteniendo GPS…</div>}
        </div>

        <div className="space-y-3">
          {cfg.steps.map(([id, label]) => {
            const existingUrls = (prevChecks[id]?.photos || []).filter(u => typeof u === 'string' && u.startsWith('http'));
            const sessionPhotos = photos[id] || [];
            const noPhoto = existingUrls.length === 0 && sessionPhotos.length === 0;
            const result = checks[id]?.result || 'ok';
            return (
              <div key={id} className="border border-stone-300 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-stone-800">{label}</span>
                  <div className="flex gap-1">
                    {['ok', 'problema'].map(r => {
                      const active = result === r && !!checks[id]?.result;
                      return (
                        <button key={r} type="button" onClick={() => setCheck(id, 'result', r)}
                          className={'px-2 py-1 text-[11px] font-mono uppercase rounded border-2 ' +
                            (active ? (r === 'ok' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-orange-100 border-orange-500 text-orange-700') : 'border-stone-300 text-stone-500 hover:border-stone-400')}>
                          {r === 'ok' ? '✓ Hecho' : '⚠ Problema'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {existingUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {existingUrls.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                        <img src={u} alt="Foto guardada" className="w-16 h-16 object-cover rounded border border-emerald-300" />
                      </a>
                    ))}
                  </div>
                )}
                {sessionPhotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {sessionPhotos.map(ph => (
                      <div key={ph.id} className="relative group">
                        <img src={ph.preview} alt="Foto" className="w-16 h-16 object-cover rounded border border-stone-300" />
                        <button type="button" onClick={() => removePhoto(id, ph.id)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] shadow">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                    <Camera className="w-3 h-3" strokeWidth={1.5} /> Foto*
                    <input type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) addPhoto(id, e.target.files[0]); e.target.value = ''; }} className="hidden" />
                  </label>
                  <label className="flex-1 py-1.5 border border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-pointer rounded transition-colors">
                    <Upload className="w-3 h-3" strokeWidth={1.5} /> Galería
                    <input type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) addPhoto(id, e.target.files[0]); e.target.value = ''; }} className="hidden" />
                  </label>
                </div>
                {noPhoto && <p className="text-[10px] text-rose-500">Foto obligatoria</p>}
                <textarea value={checks[id]?.notes || ''} onChange={e => setCheck(id, 'notes', e.target.value)} rows={1} placeholder="Nota (opcional)"
                  className="w-full bg-stone-50 border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            );
          })}
        </div>

        <div>
          <div className="text-[12px] font-mono uppercase text-stone-500 mb-2">Notas generales</div>
          <textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} rows={2} placeholder="Observaciones adicionales…"
            className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-800 placeholder-stone-500 focus:outline-none focus:border-indigo-500 resize-none" />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-stone-300 bg-amber-50 sticky bottom-0">
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-stone-200 disabled:text-stone-500 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Check className="w-4 h-4" /> Guardar {fase.toUpperCase()}</>}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MigrarHistorico — vista previa y ejecución de la migración del silicón
// =============================================================================
export function MigrarHistorico({ posts, onBack }) {
  const plan = useMemo(() => planMigracion(posts), [posts]);
  const [corriendo, setCorriendo] = useState(false);
  const [hechos, setHechos] = useState(0);
  const [errores, setErrores] = useState([]);
  const [listo, setListo] = useState(false);

  const resumen = useMemo(() => {
    let m3 = 0, m1 = 0, m2 = 0, omitidos = 0;
    for (const it of plan) {
      if (it.fases.m3) m3++;
      if (it.fases.m1) m1++;
      if (it.fases.m2) m2++;
      if (it.acrilicoOmitido) omitidos++;
    }
    return { m3, m1, m2, omitidos };
  }, [plan]);

  const ejecutar = async () => {
    if (M123_DRY_RUN) {
      console.log('[M123 DRY-RUN] plan de migración:', plan);
      alert('DRY-RUN activo: no se escribió nada.\nEl plan quedó impreso en la consola.\n\nPara ejecutarla de verdad, pon M123_DRY_RUN = false.');
      return;
    }
    if (!window.confirm('Se van a actualizar ' + plan.length + ' postes. El histórico de silicón NO se borra. ¿Continuar?')) return;
    setCorriendo(true); setHechos(0); setErrores([]);
    for (const it of plan) {
      try { await aplicarMigracion(it); setHechos(h => h + 1); }
      catch (e) { setErrores(prev => [...prev, it.post.id + ': ' + (e?.message || e)]); }
    }
    setCorriendo(false); setListo(true);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 text-stone-600 hover:text-stone-950"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-600">Migración</div>
          <h1 className="text-base font-light text-stone-950">Histórico de silicón → M1/M2/M3</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="p-3 rounded-lg border border-stone-300 bg-stone-100 text-xs text-stone-600 space-y-1">
          <div><b className="text-stone-800">Coronas y brazos</b> → M3 (queda 4/5, incompleto: falta alinear antena)</div>
          <div><b className="text-stone-800">Acrílico</b> → M1 si tiene E5 · M2 si tiene E6</div>
          <div><b className="text-stone-800">Sin E5 ni E6</b> → su acrílico no se migra (solo su M3)</div>
          <div className="pt-1 text-emerald-700">El histórico <code>m1_mantenimiento</code> no se borra: queda como respaldo.</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[['Postes a actualizar', plan.length], ['Reciben M3', resumen.m3],
            ['Reciben M1', resumen.m1], ['Reciben M2', resumen.m2]].map(([lbl, n]) => (
            <div key={lbl} className="p-3 rounded-lg border border-stone-300 bg-stone-50">
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400">{lbl}</div>
              <div className="text-xl font-light text-stone-950">{n}</div>
            </div>
          ))}
        </div>

        {resumen.omitidos > 0 && (
          <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-800">
            {resumen.omitidos} poste(s) tienen acrílico pero no tienen E5 ni E6: su acrílico se omite, según lo acordado.
          </div>
        )}

        {plan.length > 0 && (
          <div className="border border-stone-300 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-stone-100 text-[10px] font-mono uppercase tracking-wider text-stone-500">Detalle</div>
            <div className="max-h-64 overflow-y-auto divide-y divide-stone-200">
              {plan.map(it => (
                <div key={it.post.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-stone-800">{it.post.id}</span>
                  <span className="text-stone-400 font-mono truncate">{it.post.unidad_territorial || ''}</span>
                  <span className="ml-auto flex gap-1 flex-shrink-0">
                    {Object.entries(it.fases).map(([fk, checks]) => (
                      <span key={fk} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {fk.toUpperCase()} +{Object.keys(checks).length}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.length === 0 && (
          <div className="p-4 text-center text-xs text-stone-400 border border-stone-300 rounded-lg">
            No hay nada que migrar: ningún poste tiene histórico de silicón pendiente de pasar.
          </div>
        )}

        {(corriendo || listo) && (
          <div className="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs text-emerald-800">
            {corriendo ? 'Migrando… ' : 'Terminado. '}{hechos} de {plan.length} postes actualizados.
          </div>
        )}
        {errores.length > 0 && (
          <div className="p-2.5 rounded-lg border border-red-300 bg-red-50 text-xs text-red-700">
            <div className="font-bold mb-1">{errores.length} error(es):</div>
            {errores.slice(0, 8).map((e, i) => <div key={i} className="font-mono">{e}</div>)}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-stone-300 bg-amber-50">
        <button onClick={ejecutar} disabled={corriendo || plan.length === 0 || listo}
          className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-200 disabled:text-stone-500 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
          {corriendo ? <><Loader2 className="w-4 h-4 animate-spin" /> Migrando…</> : <><Check className="w-4 h-4" /> {M123_DRY_RUN ? 'Simular migración (dry-run)' : 'Ejecutar migración'}</>}
        </button>
      </div>
    </div>
  );
}
