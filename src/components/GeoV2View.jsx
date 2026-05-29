import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMapEvents } from 'react-leaflet';
import {
  Layers, Loader2, AlertCircle, X, ChevronRight, ChevronLeft,
  Save, Lock, Paintbrush, Filter, RotateCcw, ChevronDown, ChevronUp,
  Eraser,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { getGeoSupabase, hasGeoSupabase } from '../lib/supabaseGeo.js';

// ============================================================
// Configuracion estatica
// ============================================================

const GAM_CENTER = [19.493, -99.115];
const GAM_ZOOM = 12;
const STORAGE_KEY = 'geo_v2_config_v1';

const CATEGORIAS = [
  { id: 'capas_base',    label: 'Capas base' },
  { id: 'liberacion_ut', label: 'Liberación UT' },
  { id: 'scoutings',     label: 'Scoutings' },
];

const CAPAS = [
  {
    id: 'ut_gam',
    label: 'Unidades Territoriales',
    descripcion: 'Polígonos de las UT de la GAM',
    categoria: 'capas_base',
    defaultColor: '#e11d48',
    editable: false,
    popupFields: [
      { label: 'Clave UT', keys: ['CVE_UNIDAD_TERRITORIAL', 'clave_uat'] },
      { label: 'Nombre', keys: ['nombre_uat'] },
      { label: 'Zona territorial', keys: ['ZN_TERR', 'zt'] },
    ],
  },
  {
    id: 'liberacion_ut',
    label: 'Liberación UT',
    descripcion: 'Status de liberación (editable)',
    categoria: 'liberacion_ut',
    defaultColor: '#2563eb',
    editable: true,
    camposLockeados: ['nombre_uat', 'clave_uat', 'zt', 'ddto_local'],
    rolesEditores: ['admin', 'director', 'coordinador', 'capturador'],
    popupFields: [
      { label: 'Clave UT', keys: ['clave_uat'] },
      { label: 'Nombre', keys: ['nombre_uat'] },
      { label: 'Zona territorial', keys: ['zt'] },
      { label: 'Liberado', keys: ['liberado'] },
    ],
  },
];

const PALETAS = {
  vivos:     ['#e11d48', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#dc2626', '#65a30d', '#ea580c', '#7c3aed'],
  pasteles:  ['#fda4af', '#93c5fd', '#86efac', '#fde047', '#d8b4fe', '#67e8f9', '#fca5a5', '#bef264', '#fdba74', '#c4b5fd'],
  tierra:    ['#92400e', '#3f6212', '#854d0e', '#7c2d12', '#365314', '#a16207', '#78350f', '#451a03', '#9a3412', '#52525b'],
  frios:     ['#1e3a8a', '#155e75', '#0c4a6e', '#1e40af', '#0e7490', '#075985', '#1d4ed8', '#0369a1', '#312e81', '#164e63'],
  calidos:   ['#7f1d1d', '#7c2d12', '#78350f', '#9f1239', '#9a3412', '#a16207', '#b91c1c', '#c2410c', '#92400e', '#dc2626'],
  monoAzul:  ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
};
const PALETAS_LABELS = {
  vivos: 'Vivos (personalizable)',
  pasteles: 'Pasteles',
  tierra: 'Tierra',
  frios: 'Fríos',
  calidos: 'Cálidos',
  monoAzul: 'Mono azul',
};

const GRADIENTES = {
  azules:     ['#dbeafe', '#1e3a8a'],
  rojos:      ['#fee2e2', '#7f1d1d'],
  verdes:     ['#dcfce7', '#14532d'],
  viridis:    ['#fde047', '#22c55e', '#0e7490', '#581c87'],
  divergente: ['#1e40af', '#f3f4f6', '#991b1b'],
};
const GRADIENTES_LABELS = {
  azules: 'Azules',
  rojos: 'Rojos',
  verdes: 'Verdes',
  viridis: 'Viridis',
  divergente: 'Divergente (azul-rojo)',
};

const _dataCache = {};

// ============================================================
// Helpers
// ============================================================

function getPropValue(props, keys) {
  if (!props) return null;
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function colorForValue(value, paletaId, coloresCustom) {
  const colors = PALETAS[paletaId] || PALETAS.vivos;
  const key = value === null || value === undefined || value === '' ? '__VACIO__' : String(value);

  // Si la paleta es vivos y hay override personalizado, usarlo
  if (paletaId === 'vivos' && coloresCustom && coloresCustom[key]) {
    return coloresCustom[key];
  }

  if (key === '__VACIO__') return '#9ca3af';

  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h) + key.charCodeAt(i);
    h |= 0;
  }
  return colors[Math.abs(h) % colors.length];
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

function interpolate(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function gradientColor(value, min, max, gradId) {
  const colors = GRADIENTES[gradId] || GRADIENTES.azules;
  const num = Number(value);
  if (isNaN(num)) return '#9ca3af';
  if (min === max) return colors[colors.length - 1];
  let t = (num - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (colors.length === 2) return interpolate(colors[0], colors[1], t);
  const seg = t * (colors.length - 1);
  const i = Math.min(Math.floor(seg), colors.length - 2);
  return interpolate(colors[i], colors[i + 1], seg - i);
}

function prettyLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function isNumericField(fc, campo) {
  if (!fc) return false;
  let total = 0, numeric = 0;
  for (const f of fc.features) {
    const v = f.properties?.[campo];
    if (v === null || v === undefined || v === '') continue;
    total++;
    if (!isNaN(Number(v))) numeric++;
    if (total > 25) break;
  }
  return total >= 3 && (numeric / total) >= 0.8;
}

function uniqueValues(fc, campo) {
  if (!fc) return [];
  const set = new Set();
  fc.features.forEach(f => {
    const v = f.properties?.[campo];
    set.add(v === null || v === undefined || v === '' ? '__VACIO__' : String(v));
  });
  return Array.from(set).sort();
}

function minMaxField(fc, campo) {
  if (!fc) return { min: 0, max: 1 };
  let min = Infinity, max = -Infinity;
  fc.features.forEach(f => {
    const v = Number(f.properties?.[campo]);
    if (!isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  });
  if (min === Infinity) return { min: 0, max: 1 };
  return { min, max };
}

function rowsToFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(r => ({
      type: 'Feature',
      geometry: r.geom,
      properties: { ...(r.props || {}), __id: r.id, external_id: r.external_id },
    })),
  };
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  catch {}
}
function clearStoredConfig() {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch {}
}

// ============================================================
// Combobox (input + datalist HTML5 nativo)
// ============================================================
function Combobox({ value, onChange, options, placeholder, disabled, width }) {
  // options: [{ value, label }]
  // El input muestra el LABEL; al cambiar, traduce a value interno
  const dlistId = useMemo(() => 'cb_' + Math.random().toString(36).substring(2, 9), []);
  const [text, setText] = useState('');

  useEffect(() => {
    const found = options.find(o => o.value === value);
    if (found) setText(found.label);
    else if (value !== null && value !== undefined) setText(String(value));
    else setText('');
  }, [value, options]);

  function handleInput(typed) {
    setText(typed);
    if (typed === '') { onChange(null); return; }
    // Buscar por label exacto
    const byLabel = options.find(o => o.label === typed);
    if (byLabel) { onChange(byLabel.value); return; }
    // Buscar por value
    const byValue = options.find(o => String(o.value) === typed);
    if (byValue) { onChange(byValue.value); return; }
    // Texto libre
    onChange(typed);
  }

  return (
    <span style={{ display: 'inline-block', maxWidth: width || 200 }}>
      <input
        type="text"
        list={dlistId}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => handleInput(e.target.value)}
        className="text-xs px-2 py-1 border border-stone-300 rounded bg-white disabled:bg-stone-100 disabled:text-stone-400 w-full"
      />
      <datalist id={dlistId}>
        {options.map(opt => (
          <option key={opt.value} value={opt.label} />
        ))}
      </datalist>
    </span>
  );
}

// ============================================================
// Tracker de movimiento del mapa
// ============================================================
function MapMoveTracker({ onMove }) {
  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const c = map.getCenter();
      onMove([c.lat, c.lng], map.getZoom());
    },
  });
  return null;
}

// ============================================================
// FilterBar (combobox triple)
// ============================================================
function FilterBar({ filtro, onFiltroChange, capasActivasInfo }) {
  const capaSel = capasActivasInfo.find(c => c.id === filtro.capaId);
  const camposDeCapa = useMemo(() => {
    if (!capaSel?.fc) return [];
    const sample = capaSel.fc.features?.[0]?.properties || {};
    return Object.keys(sample).filter(k => !k.startsWith('__') && k !== 'external_id');
  }, [capaSel]);

  const valoresDeCampo = useMemo(() => {
    if (!capaSel?.fc || !filtro.campo) return [];
    return uniqueValues(capaSel.fc, filtro.campo);
  }, [capaSel, filtro.campo]);

  const hayFiltroActivo = filtro.capaId && filtro.campo && filtro.valor !== null && filtro.valor !== undefined && filtro.valor !== '';

  const optsCapas  = capasActivasInfo.map(c => ({ value: c.id, label: c.label }));
  const optsCampos = camposDeCapa.map(c => ({ value: c, label: prettyLabel(c) }));
  const optsValores = valoresDeCampo.map(v => ({
    value: v,
    label: v === '__VACIO__' ? '(vacío)' : v,
  }));

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-stone-300 z-[1000] flex-shrink-0 flex-wrap">
      <Filter className="w-4 h-4 text-stone-500" strokeWidth={1.8} />
      <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 hidden sm:inline">Filtro</span>

      <Combobox
        value={filtro.capaId}
        options={optsCapas}
        onChange={(v) => onFiltroChange({ capaId: v, campo: null, valor: null })}
        placeholder="Capa..."
        width={160}
      />

      <Combobox
        value={filtro.campo}
        options={optsCampos}
        onChange={(v) => onFiltroChange({ ...filtro, campo: v, valor: null })}
        placeholder="Campo..."
        disabled={!filtro.capaId || !capaSel}
        width={180}
      />

      <Combobox
        value={filtro.valor}
        options={optsValores}
        onChange={(v) => onFiltroChange({ ...filtro, valor: v })}
        placeholder="Valor..."
        disabled={!filtro.campo}
        width={200}
      />

      {hayFiltroActivo && (
        <button
          onClick={() => onFiltroChange({ capaId: null, campo: null, valor: null })}
          className="flex items-center gap-1 text-xs px-2 py-1 text-rose-600 hover:bg-rose-50 rounded"
          title="Limpiar filtro"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Limpiar</span>
        </button>
      )}

      <div className="flex-1" />
      {hayFiltroActivo && (
        <span className="text-[11px] text-stone-500 font-mono truncate">
          {prettyLabel(filtro.campo)} ≈ {filtro.valor === '__VACIO__' ? '(vacío)' : filtro.valor}
        </span>
      )}
    </div>
  );
}

// ============================================================
// PaletteCustomizer (color pickers por categoria unica)
// ============================================================
function PaletteCustomizer({ fc, campo, coloresCustom, onChange, onReset }) {
  const valores = useMemo(() => uniqueValues(fc, campo), [fc, campo]);
  if (!campo || valores.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-stone-100">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
          Colores por categoría
        </div>
        {coloresCustom && Object.keys(coloresCustom).length > 0 && (
          <button
            onClick={onReset}
            className="text-[10px] text-rose-600 hover:underline flex items-center gap-1"
            title="Volver a colores automáticos"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {valores.map(v => {
          const auto = colorForValue(v === '__VACIO__' ? null : v, 'vivos', null);
          const actual = (coloresCustom && coloresCustom[v]) || auto;
          const isOverride = !!(coloresCustom && coloresCustom[v]);
          return (
            <div key={v} className="flex items-center gap-2">
              <input
                type="color"
                value={actual}
                onChange={(e) => onChange(v, e.target.value)}
                className="w-6 h-5 border border-stone-300 rounded cursor-pointer flex-shrink-0"
              />
              <span className="text-[11px] text-stone-700 flex-1 truncate" title={v}>
                {v === '__VACIO__' ? <em className="text-stone-400">vacío</em> : v}
              </span>
              {isOverride && (
                <button
                  onClick={() => onChange(v, null)}
                  className="text-[10px] text-stone-400 hover:text-rose-500"
                  title="Volver al color automático"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// CategorizacionControl
// ============================================================
function CategorizacionControl({ capa, fc, config, onChange }) {
  const campos = useMemo(() => {
    if (!fc) return [];
    const sample = fc.features?.[0]?.properties || {};
    return Object.keys(sample).filter(k => !k.startsWith('__') && k !== 'external_id');
  }, [fc]);

  const camposNumericos = useMemo(() => {
    if (!fc) return [];
    return campos.filter(c => isNumericField(fc, c));
  }, [fc, campos]);

  const mode = config?.mode || 'uniform';

  function setColorCustom(valor, color) {
    const next = { ...(config?.coloresCustom || {}) };
    if (color === null) delete next[valor];
    else next[valor] = color;
    onChange({ ...config, coloresCustom: next });
  }

  function resetColoresCustom() {
    onChange({ ...config, coloresCustom: {} });
  }

  function setCategoricalCampo(nuevoCampo) {
    // Al cambiar el campo, resetear colores custom (categorías nuevas)
    onChange({ ...config, mode: 'categorical', campo: nuevoCampo, coloresCustom: {} });
  }

  return (
    <div className="mt-2 pt-2 border-t border-stone-100 space-y-2">
      <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-stone-500">
        <Paintbrush className="w-3 h-3" />
        Categorización
      </div>

      <div className="grid grid-cols-3 gap-1">
        {[
          { id: 'uniform',     label: 'Uniforme' },
          { id: 'categorical', label: 'Categórico' },
          { id: 'gradient',    label: 'Gradiente' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => onChange({ ...config, mode: m.id })}
            className={
              'text-[11px] px-1.5 py-1 rounded border ' +
              (mode === m.id
                ? 'bg-rose-50 border-rose-300 text-rose-700 font-medium'
                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'uniform' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config?.color || capa.defaultColor}
            onChange={e => onChange({ ...config, mode: 'uniform', color: e.target.value })}
            className="w-8 h-7 border border-stone-300 rounded cursor-pointer"
          />
          <span className="text-[11px] text-stone-600 font-mono">{config?.color || capa.defaultColor}</span>
        </div>
      )}

      {mode === 'categorical' && (
        <div className="space-y-1.5">
          <select
            value={config?.campo || ''}
            onChange={e => setCategoricalCampo(e.target.value || null)}
            className="w-full text-[11px] px-1.5 py-1 border border-stone-300 rounded bg-white"
          >
            <option value="">— Campo —</option>
            {campos.map(c => (
              <option key={c} value={c}>{prettyLabel(c)}</option>
            ))}
          </select>
          <select
            value={config?.paleta || 'vivos'}
            onChange={e => onChange({ ...config, mode: 'categorical', paleta: e.target.value, coloresCustom: e.target.value === 'vivos' ? (config?.coloresCustom || {}) : {} })}
            className="w-full text-[11px] px-1.5 py-1 border border-stone-300 rounded bg-white"
          >
            {Object.entries(PALETAS_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>

          {/* Color picker por categoría solo cuando paleta = vivos */}
          {(config?.paleta || 'vivos') === 'vivos' && config?.campo && fc && (
            <PaletteCustomizer
              fc={fc}
              campo={config.campo}
              coloresCustom={config.coloresCustom}
              onChange={setColorCustom}
              onReset={resetColoresCustom}
            />
          )}
        </div>
      )}

      {mode === 'gradient' && (
        <div className="space-y-1.5">
          <select
            value={config?.campo || ''}
            onChange={e => onChange({ ...config, mode: 'gradient', campo: e.target.value || null })}
            className="w-full text-[11px] px-1.5 py-1 border border-stone-300 rounded bg-white"
          >
            <option value="">— Campo numérico —</option>
            {camposNumericos.map(c => (
              <option key={c} value={c}>{prettyLabel(c)}</option>
            ))}
          </select>
          <select
            value={config?.gradiente || 'azules'}
            onChange={e => onChange({ ...config, mode: 'gradient', gradiente: e.target.value })}
            className="w-full text-[11px] px-1.5 py-1 border border-stone-300 rounded bg-white"
          >
            {Object.entries(GRADIENTES_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          {camposNumericos.length === 0 && (
            <div className="text-[10px] text-amber-700 italic">
              Esta capa no tiene campos numéricos
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CapaItem
// ============================================================
function CapaItem({ capa, activa, conteo, isLoading, onToggle, datos, config, onConfigChange, expandido, onToggleExpandir }) {
  const fc = datos[capa.id];
  return (
    <div className="rounded hover:bg-stone-50/60">
      <label className="flex items-start gap-2 cursor-pointer p-1.5">
        <input
          type="checkbox"
          checked={activa}
          onChange={() => onToggle(capa.id)}
          className="mt-0.5 accent-rose-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm border flex-shrink-0"
              style={{ background: capa.defaultColor, borderColor: capa.defaultColor }}
            />
            <span className="text-sm font-medium text-stone-900 truncate">{capa.label}</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">{capa.descripcion}</div>
          {isLoading && (
            <div className="flex items-center gap-1 text-[11px] text-stone-500 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
            </div>
          )}
          {!isLoading && activa && typeof conteo === 'number' && (
            <div className="text-[11px] text-stone-500 mt-1">{conteo} features</div>
          )}
        </div>
        {activa && !isLoading && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleExpandir(capa.id); }}
            className="p-0.5 text-stone-400 hover:text-stone-700"
            title={expandido ? 'Ocultar opciones' : 'Mostrar opciones'}
          >
            {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </label>
      {activa && expandido && fc && (
        <div className="px-3 pb-2">
          <CategorizacionControl
            capa={capa}
            fc={fc}
            config={config}
            onChange={(newConfig) => onConfigChange(capa.id, newConfig)}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// ControlCapas
// ============================================================
function ControlCapas({
  capasActivas, onToggle, conteos, cargando, datos,
  categorizacion, onCategorizacionChange,
  expandidos, onToggleExpandir,
  colapsado, onToggleColapsado,
  onReset,
}) {
  if (colapsado) {
    return (
      <button
        onClick={onToggleColapsado}
        className="absolute top-4 right-4 z-[1000] w-10 h-10 bg-white border border-stone-300 rounded-lg shadow-lg hover:bg-stone-50 flex items-center justify-center"
        title="Mostrar capas"
      >
        <Layers className="w-4 h-4 text-rose-500" strokeWidth={1.8} />
      </button>
    );
  }
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white border border-stone-300 rounded-lg shadow-lg w-72 max-h-[calc(100%-32px)] overflow-y-auto">
      <div className="sticky top-0 bg-white flex items-center gap-2 px-3 py-2 border-b border-stone-200 z-10">
        <Layers className="w-4 h-4 text-rose-500" strokeWidth={1.8} />
        <span className="text-xs font-mono uppercase tracking-wider text-stone-700 flex-1">Capas</span>
        <button
          onClick={onReset}
          className="p-1 hover:bg-stone-100 rounded text-stone-500 hover:text-rose-600"
          title="Reiniciar todo (vuelve al estado inicial)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleColapsado}
          className="p-1 hover:bg-stone-100 rounded text-stone-500"
          title="Colapsar panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="p-2 space-y-3">
        {CATEGORIAS.map(cat => {
          const items = CAPAS.filter(c => c.categoria === cat.id);
          return (
            <section key={cat.id}>
              <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-stone-500 mb-1 px-2 pb-1 border-b border-stone-100">
                {cat.label}
              </div>
              {items.length === 0 ? (
                <div className="text-[11px] text-stone-400 italic px-2 py-1">Sin capas todavía</div>
              ) : (
                <div className="space-y-1">
                  {items.map(capa => (
                    <CapaItem
                      key={capa.id}
                      capa={capa}
                      activa={capasActivas.has(capa.id)}
                      conteo={conteos[capa.id]}
                      isLoading={cargando.has(capa.id)}
                      onToggle={onToggle}
                      datos={datos}
                      config={categorizacion[capa.id]}
                      onConfigChange={onCategorizacionChange}
                      expandido={!!expandidos[capa.id]}
                      onToggleExpandir={onToggleExpandir}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Leyenda
// ============================================================
function Leyenda({ capa, config, fc }) {
  if (!config || !fc) return null;

  if (config.mode === 'uniform') {
    return (
      <div className="absolute bottom-4 right-4 z-[1000] bg-white border border-stone-300 rounded-lg shadow p-3 max-w-xs">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">{capa.label}</div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-3 h-3 rounded-sm border border-black/10" style={{ background: config.color || capa.defaultColor }} />
          <span className="text-stone-700">Color uniforme</span>
        </div>
      </div>
    );
  }

  if (config.mode === 'categorical' && config.campo) {
    const valores = uniqueValues(fc, config.campo);
    return (
      <div className="absolute bottom-4 right-4 z-[1000] bg-white border border-stone-300 rounded-lg shadow p-3 max-w-xs">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">
          {capa.label}: {prettyLabel(config.campo)}
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {valores.map(v => {
            const color = colorForValue(v === '__VACIO__' ? null : v, config.paleta, config.coloresCustom);
            return (
              <div key={v} className="flex items-center gap-2 text-xs">
                <span
                  className="w-3 h-3 rounded-sm border border-black/10 flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="truncate text-stone-700">
                  {v === '__VACIO__' ? <em className="text-stone-400">vacío</em> : v}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (config.mode === 'gradient' && config.campo) {
    const { min, max } = minMaxField(fc, config.campo);
    const colors = GRADIENTES[config.gradiente] || GRADIENTES.azules;
    const cssGradient = 'linear-gradient(to right, ' + colors.join(', ') + ')';
    return (
      <div className="absolute bottom-4 right-4 z-[1000] bg-white border border-stone-300 rounded-lg shadow p-3 w-56">
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">
          {capa.label}: {prettyLabel(config.campo)}
        </div>
        <div className="h-3 rounded border border-black/10" style={{ background: cssGradient }} />
        <div className="flex justify-between text-[10px] text-stone-600 mt-1 font-mono">
          <span>{Number.isInteger(min) ? min : min.toFixed(2)}</span>
          <span>{Number.isInteger(max) ? max : max.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================
// PanelEdicion
// ============================================================
function PanelEdicion({ feature, capa, userRole, collapsed, onToggleCollapse, onClose, onSave }) {
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => { setEdits({}); setSaveError(null); }, [feature?.properties?.__id]);

  if (!feature || !capa) return null;

  const props = feature.properties || {};
  const camposLockeados = new Set(capa.camposLockeados || []);
  const puedeEditar = capa.editable && (capa.rolesEditores || []).includes(userRole);
  const hayCambios = Object.keys(edits).length > 0;

  function handleField(key, value) {
    setEdits(prev => {
      const next = { ...prev };
      if (value === props[key] || (value === '' && props[key] == null)) delete next[key];
      else next[key] = value === '' ? null : value;
      return next;
    });
  }

  async function handleGuardar() {
    setSaving(true); setSaveError(null);
    try { await onSave(feature, edits); setEdits({}); }
    catch (e) { setSaveError(e.message || String(e)); }
    finally { setSaving(false); }
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="absolute top-1/2 -translate-y-1/2 right-0 z-[1001] bg-white border border-stone-300 rounded-l-lg shadow-lg p-2 hover:bg-stone-50"
        title="Mostrar panel"
      >
        <ChevronLeft className="w-4 h-4 text-stone-600" />
      </button>
    );
  }

  const allKeys = Object.keys(props).filter(k => !k.startsWith('__') && k !== 'external_id');
  const ordered = [
    ...allKeys.filter(k => camposLockeados.has(k)),
    ...allKeys.filter(k => !camposLockeados.has(k)),
  ];

  return (
    <div className="absolute top-0 right-0 z-[1001] h-full w-[400px] max-w-[90vw] bg-white border-l border-stone-300 shadow-xl flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-200 bg-stone-50 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">{capa.label}</div>
          <div className="text-sm font-bold text-stone-900 truncate">{props.nombre_uat || '(sin nombre)'}</div>
        </div>
        <button onClick={onToggleCollapse} className="p-1.5 hover:bg-stone-200 rounded" title="Ocultar panel">
          <ChevronRight className="w-4 h-4 text-stone-600" />
        </button>
        <button onClick={onClose} className="p-1.5 hover:bg-stone-200 rounded" title="Cerrar">
          <X className="w-4 h-4 text-stone-600" />
        </button>
      </div>

      {capa.editable && !puedeEditar && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex-shrink-0">
          <Lock className="inline w-3 h-3 mr-1" /> Tu rol no permite editar
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {ordered.map(key => {
          const value = key in edits ? edits[key] : props[key];
          const isLocked = camposLockeados.has(key);
          const readOnly = isLocked || !puedeEditar;
          const original = props[key];
          const isLongText = typeof original === 'string' && original.length > 60;
          const isURL = typeof value === 'string' && /^https?:\/\//.test(value);
          const isBool = ['liberado', 'tiene_contrato'].includes(key);
          const isNumeric = typeof original === 'number';

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500">{prettyLabel(key)}</label>
                {isLocked && <Lock className="w-3 h-3 text-stone-400" />}
                {key in edits && <span className="text-rose-500 text-[14px] leading-none" title="Cambio sin guardar">●</span>}
              </div>

              {readOnly ? (
                <div className="text-sm text-stone-700 px-2 py-1.5 bg-stone-50 rounded border border-stone-200 min-h-[34px]">
                  {isURL ? (
                    <a href={value} target="_blank" rel="noreferrer" className="text-rose-600 underline break-all">{value}</a>
                  ) : value !== null && value !== undefined && value !== '' ? (
                    <span className="break-words">{String(value)}</span>
                  ) : <span className="text-stone-400 italic">vacío</span>}
                </div>
              ) : isBool ? (
                <select
                  value={value ?? ''}
                  onChange={e => handleField(key, e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:border-rose-400"
                >
                  <option value="">(sin valor)</option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              ) : isLongText ? (
                <textarea
                  value={value ?? ''}
                  onChange={e => handleField(key, e.target.value)}
                  rows={3}
                  className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:border-rose-400 resize-y font-sans"
                />
              ) : (
                <input
                  type={isNumeric ? 'number' : 'text'}
                  step={isNumeric ? 'any' : undefined}
                  value={value ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    handleField(key, isNumeric && v !== '' ? Number(v) : v);
                  }}
                  className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded focus:outline-none focus:border-rose-400"
                />
              )}
            </div>
          );
        })}
      </div>

      {capa.editable && puedeEditar && (
        <div className="border-t border-stone-200 p-3 bg-stone-50 flex-shrink-0">
          {saveError && (
            <div className="text-xs text-rose-700 mb-2 px-2 py-1.5 bg-rose-50 border border-rose-200 rounded">{saveError}</div>
          )}
          <button
            onClick={handleGuardar}
            disabled={!hayCambios || saving}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando...' : hayCambios ? 'Guardar ' + Object.keys(edits).length + ' cambio' + (Object.keys(edits).length === 1 ? '' : 's') : 'Sin cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function GeoV2View({ userRole }) {
  const initial = useMemo(() => loadConfig() || {}, []);

  const [capasActivas, setCapasActivas]   = useState(new Set(initial.capasActivas || []));
  const [datos, setDatos]                 = useState(() => ({ ..._dataCache }));
  const [conteos, setConteos]             = useState(() => {
    const r = {};
    Object.keys(_dataCache).forEach(id => { r[id] = _dataCache[id].features.length; });
    return r;
  });
  const [cargando, setCargando]           = useState(new Set());
  const [error, setError]                 = useState(null);
  const [categorizacion, setCategorizacion] = useState(initial.categorizacion || {});
  const [expandidos, setExpandidos]       = useState(initial.expandidos || {});
  const [colapsado, setColapsado]         = useState(initial.colapsado || false);
  const [filtro, setFiltro]               = useState(initial.filtro || { capaId: null, campo: null, valor: null });
  const [mapCenter]                       = useState(initial.mapCenter || GAM_CENTER);
  const [mapZoom]                         = useState(initial.mapZoom || GAM_ZOOM);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedCapaId, setSelectedCapaId]   = useState(null);
  const [panelCollapsed, setPanelCollapsed]   = useState(false);

  const callbacksRef = useRef({});

  const lastCenterRef = useRef(initial.mapCenter || GAM_CENTER);
  const lastZoomRef = useRef(initial.mapZoom || GAM_ZOOM);
  useEffect(() => {
    saveConfig({
      capasActivas: Array.from(capasActivas),
      categorizacion, expandidos, colapsado, filtro,
      mapCenter: lastCenterRef.current,
      mapZoom: lastZoomRef.current,
    });
  }, [capasActivas, categorizacion, expandidos, colapsado, filtro]);

  function onMapMove(center, zoom) {
    lastCenterRef.current = center;
    lastZoomRef.current = zoom;
    saveConfig({
      capasActivas: Array.from(capasActivas),
      categorizacion, expandidos, colapsado, filtro,
      mapCenter: center, mapZoom: zoom,
    });
  }

  useEffect(() => {
    capasActivas.forEach(id => {
      if (!_dataCache[id] && !cargando.has(id)) {
        cargarCapa(id);
      }
    });
    // eslint-disable-next-line
  }, []);

  const noConfigurado = !hasGeoSupabase();

  async function cargarCapa(layerId) {
    setCargando(prev => new Set(prev).add(layerId));
    setError(null);
    try {
      const supabase = getGeoSupabase();
      const { data, error: err } = await supabase
        .from('features')
        .select('id, external_id, geom, props')
        .eq('layer_id', layerId);
      if (err) throw err;
      const fc = rowsToFeatureCollection(data || []);
      _dataCache[layerId] = fc;
      setDatos(d => ({ ...d, [layerId]: fc }));
      setConteos(c => ({ ...c, [layerId]: (data || []).length }));
    } catch (e) {
      console.error('[GeoV2] error cargando capa', layerId, e);
      setError('No se pudo cargar la capa ' + layerId + ': ' + (e.message || e));
      setCapasActivas(prev => { const n = new Set(prev); n.delete(layerId); return n; });
    } finally {
      setCargando(prev => { const n = new Set(prev); n.delete(layerId); return n; });
    }
  }

  function toggleCapa(layerId) {
    setCapasActivas(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
        if (selectedCapaId === layerId) { setSelectedFeature(null); setSelectedCapaId(null); }
        if (filtro.capaId === layerId) setFiltro({ capaId: null, campo: null, valor: null });
      } else {
        next.add(layerId);
        if (!_dataCache[layerId]) cargarCapa(layerId);
      }
      return next;
    });
  }

  function toggleExpandido(layerId) {
    setExpandidos(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  }

  function handleCategorizacionChange(layerId, newConfig) {
    setCategorizacion(prev => ({ ...prev, [layerId]: newConfig }));
  }

  function handleReset() {
    if (!window.confirm('¿Reiniciar todo? Se borran capas activas, categorizaciones, filtro y posición del mapa.')) return;
    clearStoredConfig();
    setCapasActivas(new Set());
    setCategorizacion({});
    setExpandidos({});
    setFiltro({ capaId: null, campo: null, valor: null });
    setColapsado(false);
    setSelectedFeature(null);
    setSelectedCapaId(null);
    setPanelCollapsed(false);
    lastCenterRef.current = GAM_CENTER;
    lastZoomRef.current = GAM_ZOOM;
    window.location.reload();
  }

  function handleEditarFeature(feature, capa) {
    setSelectedFeature(feature);
    setSelectedCapaId(capa.id);
    setPanelCollapsed(false);
  }

  async function handleSave(feature, edits) {
    const featureId = feature.properties.__id;
    if (!featureId) throw new Error('Feature sin id interno');
    const supabase = getGeoSupabase();
    const newProps = { ...feature.properties };
    Object.keys(newProps).forEach(k => { if (k.startsWith('__')) delete newProps[k]; });
    delete newProps.external_id;
    Object.assign(newProps, edits);
    const { error: err } = await supabase.from('features').update({ props: newProps }).eq('id', featureId);
    if (err) throw err;
    if (_dataCache[selectedCapaId]) {
      _dataCache[selectedCapaId] = {
        ..._dataCache[selectedCapaId],
        features: _dataCache[selectedCapaId].features.map(f =>
          f.properties.__id === featureId ? { ...f, properties: { ...f.properties, ...edits } } : f
        ),
      };
    }
    setDatos(d => {
      if (!d[selectedCapaId]) return d;
      return {
        ...d,
        [selectedCapaId]: {
          ...d[selectedCapaId],
          features: d[selectedCapaId].features.map(f =>
            f.properties.__id === featureId ? { ...f, properties: { ...f.properties, ...edits } } : f
          ),
        },
      };
    });
    setSelectedFeature(prev => prev ? { ...prev, properties: { ...prev.properties, ...edits } } : prev);
  }

  function styleFunctionFor(capa) {
    const cfg = categorizacion[capa.id];
    if (!cfg || cfg.mode === 'uniform') {
      const c = (cfg && cfg.color) || capa.defaultColor;
      return () => ({ color: c, weight: 1.5, opacity: 0.85, fillColor: c, fillOpacity: 0.25 });
    }
    if (cfg.mode === 'categorical' && cfg.campo) {
      return (feature) => {
        const v = feature.properties?.[cfg.campo];
        const c = colorForValue(v, cfg.paleta, cfg.coloresCustom);
        return { color: c, weight: 1.5, opacity: 0.9, fillColor: c, fillOpacity: 0.45 };
      };
    }
    if (cfg.mode === 'gradient' && cfg.campo) {
      const fc = datos[capa.id];
      const { min, max } = minMaxField(fc, cfg.campo);
      return (feature) => {
        const v = feature.properties?.[cfg.campo];
        const c = gradientColor(v, min, max, cfg.gradiente);
        return { color: c, weight: 1.5, opacity: 0.9, fillColor: c, fillOpacity: 0.55 };
      };
    }
    return () => ({ color: capa.defaultColor, weight: 1.5, opacity: 0.85, fillColor: capa.defaultColor, fillOpacity: 0.25 });
  }

  function filterFunctionFor(capa) {
    if (!filtro.capaId || filtro.capaId !== capa.id) return undefined;
    if (!filtro.campo) return undefined;
    if (filtro.valor === null || filtro.valor === undefined || filtro.valor === '') return undefined;

    // Verificar que el campo existe en la capa
    const fc = datos[capa.id];
    if (!fc || !fc.features?.length) return undefined;
    const sample = fc.features[0].properties || {};
    if (!(filtro.campo in sample)) return undefined;

    const valoresUnicos = uniqueValues(fc, filtro.campo);
    const valorStr = String(filtro.valor);
    const esExacto = valoresUnicos.includes(valorStr);
    const valorLower = valorStr.toLowerCase();

    return (feature) => {
      const v = feature.properties?.[filtro.campo];
      const vStr = v === null || v === undefined || v === '' ? '__VACIO__' : String(v);
      if (esExacto) return vStr === valorStr;
      if (v === null || v === undefined || v === '') return false;
      return String(v).toLowerCase().includes(valorLower);
    };
  }

  callbacksRef.current.handleEditarFeature = handleEditarFeature;

  function buildPopupHTML(capa, feature) {
    const props = feature.properties || {};
    const filas = (capa.popupFields || []).map(field => {
      const val = getPropValue(props, field.keys);
      return (
        '<div style="margin: 2px 0; color: #57534e;">' +
          '<strong style="color: #1c1917;">' + field.label + ':</strong> ' +
          (val !== null ? String(val) : '<em style="color:#9ca3af;">—</em>') +
        '</div>'
      );
    }).join('');
    const puedeEditar = capa.editable && (capa.rolesEditores || []).includes(userRole);
    const botonEditar = puedeEditar
      ? ('<button data-action="edit" style="margin-top:8px; padding:4px 10px; background:#e11d48; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-family:ui-monospace,monospace; text-transform:uppercase; letter-spacing:0.5px;">Editar</button>')
      : '';
    return (
      '<div style="font-family:ui-monospace,monospace; font-size:12px; min-width:200px;">' +
        '<div style="font-weight:bold; font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">' + capa.label + '</div>' +
        filas +
        botonEditar +
      '</div>'
    );
  }

  function onEachFeatureFor(capa) {
    return (feature, layer) => {
      layer.bindPopup(buildPopupHTML(capa, feature));
      layer.on('popupopen', (e) => {
        const el = e.popup.getElement();
        const btn = el && el.querySelector('[data-action="edit"]');
        if (btn) {
          btn.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            e.popup.close();
            callbacksRef.current.handleEditarFeature(feature, capa);
          };
        }
      });
    };
  }

  if (noConfigurado) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto bg-rose-50 border border-rose-300 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <h2 className="font-bold text-rose-900">Supabase Geo (v3) no configurado</h2>
          </div>
          <p className="text-sm text-rose-800">Faltan VITE_GEO_SUPABASE_URL y/o VITE_GEO_SUPABASE_ANON_KEY en el .env.</p>
        </div>
      </div>
    );
  }

  const capasActivasInfo = CAPAS
    .filter(c => capasActivas.has(c.id) && datos[c.id])
    .map(c => ({ id: c.id, label: c.label, fc: datos[c.id] }));

  const selectedCapa = selectedCapaId ? CAPAS.find(c => c.id === selectedCapaId) : null;

  const capaParaLeyenda = (() => {
    for (const c of CAPAS) {
      if (!capasActivas.has(c.id)) continue;
      const cfg = categorizacion[c.id];
      if (cfg && (cfg.mode === 'categorical' || cfg.mode === 'gradient') && cfg.campo) {
        return { capa: c, config: cfg, fc: datos[c.id] };
      }
      if (cfg && cfg.mode === 'uniform' && cfg.color) {
        return { capa: c, config: cfg, fc: datos[c.id] };
      }
    }
    return null;
  })();

  return (
    <div className="flex flex-col w-full h-[calc(100vh-53px)]">
      <FilterBar
        filtro={filtro}
        onFiltroChange={setFiltro}
        capasActivasInfo={capasActivasInfo}
      />

      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />
          <MapMoveTracker onMove={onMapMove} />

          {CAPAS.map(capa => {
            if (!capasActivas.has(capa.id)) return null;
            const fc = datos[capa.id];
            if (!fc) return null;
            const cfg = categorizacion[capa.id] || {};
            const filterKey = (filtro.capaId === capa.id) ? (filtro.campo + '=' + filtro.valor) : 'none';
            const customKey = cfg.coloresCustom ? JSON.stringify(cfg.coloresCustom) : '';
            const key = capa.id + '|' + (cfg.mode || 'u') + '|' + (cfg.campo || '') + '|' + (cfg.paleta || cfg.gradiente || cfg.color || '') + '|' + customKey + '|' + filterKey;
            return (
              <GeoJSON
                key={key}
                data={fc}
                style={styleFunctionFor(capa)}
                filter={filterFunctionFor(capa)}
                onEachFeature={onEachFeatureFor(capa)}
              />
            );
          })}
        </MapContainer>

        <ControlCapas
          capasActivas={capasActivas}
          onToggle={toggleCapa}
          conteos={conteos}
          cargando={cargando}
          datos={datos}
          categorizacion={categorizacion}
          onCategorizacionChange={handleCategorizacionChange}
          expandidos={expandidos}
          onToggleExpandir={toggleExpandido}
          colapsado={colapsado}
          onToggleColapsado={() => setColapsado(c => !c)}
          onReset={handleReset}
        />

        {capaParaLeyenda && (
          <Leyenda
            capa={capaParaLeyenda.capa}
            config={capaParaLeyenda.config}
            fc={capaParaLeyenda.fc}
          />
        )}

        <PanelEdicion
          feature={selectedFeature}
          capa={selectedCapa}
          userRole={userRole}
          collapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed(c => !c)}
          onClose={() => { setSelectedFeature(null); setSelectedCapaId(null); }}
          onSave={handleSave}
        />

        {error && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-rose-50 border border-rose-300 rounded-lg shadow-lg p-3 max-w-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-medium text-rose-900">{error}</div>
                <button onClick={() => setError(null)} className="text-[11px] text-rose-700 underline mt-1">cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
