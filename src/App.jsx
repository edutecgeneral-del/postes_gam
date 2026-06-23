import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import {
  MapPin, Users, AlertTriangle, Package, BarChart3, CheckCircle2,
  Clock, XCircle, Search, Camera, FileText, ChevronRight, Plus, X, Edit2,
  Eye, EyeOff, Radio, HardHat, Wrench, Activity, Compass, Download, RefreshCw,
  TrendingUp, Filter, ArrowUpRight, Zap, Shield, Navigation, Layers,
  Calendar, MessageSquare, Image as ImageIcon, AlertCircle, CheckSquare,
  ChevronLeft, ChevronDown, Menu, Home, LogOut, Briefcase, Target, Box, Flag,
  Cable, Server, Wifi, Lock, Copy, Share2, Send, Upload, ListChecks, Moon, Sun, Loader2, Tag as TagIcon, ClipboardList
} from 'lucide-react';
import OLMap from 'ol/Map';
import OLView from 'ol/View';
import OLTileLayer from 'ol/layer/Tile';
import OLVectorLayer from 'ol/layer/Vector';
import OLXYZ from 'ol/source/XYZ';
import OLVectorSource from 'ol/source/Vector';
import OLFeature from 'ol/Feature';
import OLPoint from 'ol/geom/Point';
import { Style as OLStyle, Circle as OLCircle, Fill as OLFill, Stroke as OLStroke, Text as OLText } from 'ol/style';
import OLLineString from 'ol/geom/LineString';
import OLPolygon from 'ol/geom/Polygon';
import { fromLonLat as olFromLonLat, toLonLat as olToLonLat } from 'ol/proj';
import { Translate as OLTranslate } from 'ol/interaction';
import OLCollection from 'ol/Collection';
import { boundingExtent as olBoundingExtent } from 'ol/extent';
import { createUtLayer, setUtHover, getUtName, setUtFilter } from './lib/utLayer.js';
import UtReviewPanel from './components/UtReviewPanel.jsx';
import {
  loadAllData,
  savePost as dbSavePost,
  updateStageAtomic,
  updatePostMetadata,
  createIncidentAtomic,
  createIncidentsFromCatalog,
  fetchIncidentCategories,
  resolveIncidentAtomic,
  deleteIncidentAtomic,
  attendIncidentAtomic,
  uploadIncidentPhoto,
  revertIncidentToOpen,
  resetAllData as dbResetAll,
  deletePost as dbDeletePost,
  getPostHistory,
  uploadStagePhoto,
  deleteStagePhoto,
  loadProposals,
  createProposal,
  reviewProposal,
  verifyStage as dbVerifyStage,
  unverifyStage as dbUnverifyStage,
  loadUserNames,
  normalizePhotoUrls,
  SIN_CATEGORIZAR_UT,
  withStagePhotoUrls,
} from './lib/data.js';
import {
  signOut,
  onAuthChange,
  getCurrentSession,
  loadCurrentProfile,
  isAdmin as authIsAdmin,
  isDirector as authIsDirector,
  isCapturador as authIsCapturador,
  isScout as authIsScout,
  isRAAL as authIsRAAL,
  isCoordinador as authIsCoordinador,
  canCaptureStage,
  canManageIncidents,
  canAttendIncidents,
  canResolveIncidents,
  canEditPosts,
  canMarkRevisado,
  canDelete as authCanDelete,
  canViewAudit,
  canManageUsers,
  ROLES,
  ALL_STAGE_IDS,
} from './lib/auth.js';
import LoginScreen from './components/LoginScreen.jsx';
import UsersView from './components/UsersView.jsx';
import AuditView from './components/AuditView.jsx';
import CreatePostForm from './components/CreatePostForm.jsx';
import FieldCaptureView from './components/FieldCaptureView.jsx';
import ScoutingView from './components/ScoutingView.jsx';
import EstadoConexion from './components/EstadoConexion.jsx';
import GeoV2View from './components/GeoV2View.jsx';
import { PhotoField } from './components/StageFields.jsx';
import { getPersistedForm, persistForm, clearPersistedForm, onBackgroundSave } from './lib/formPersist.js';
import {
  loadIncidentCategories,
  loadIncidentClassifications,
  classifyIncident as dbClassifyIncident,
  createCategory as dbCreateCategory,
  updateCategory as dbUpdateCategory,
  deleteCategory as dbDeleteCategory,
  deactivateCategory as dbDeactivateCategory,
} from './lib/incidentClassification.js';
import { setActiveView, setUserContext } from './lib/errorTracker.js';
import { useFilters } from './hooks/useFilters.js';
import { FilterBarCollapsible } from './components/FilterBarCollapsible.jsx';
import { filterPosts } from './lib/filters.js';
import { UT_PALETTE } from './lib/utColors.js';
import RelocateConfirmModal from './components/RelocateConfirmModal.jsx';
import PostReubicacionHistory from './components/PostReubicacionHistory.jsx';
import PostFusionHistory from './components/PostFusionHistory.jsx';
import MapSearchBox from './components/MapSearchBox.jsx';
import { MapBottomSheet, useIsMobile } from './components/MapBottomSheet.jsx';
import { relocatePost } from './lib/relocate.js';
import { TagBadgeList } from './components/TagBadge';
import MergeModal from './components/MergeModal.jsx';
import { dbMergePosts } from './lib/data.js';
// PASO_11_REVISADO_UI: helpers para marcar/desmarcar postes (solo admin)
import { markPostRevisado as dbMarkPostRevisado, unmarkPostRevisado as dbUnmarkPostRevisado } from './lib/data.js';
import ScoutingRoutePanel from './components/ScoutingRoutePanel.jsx';
import EnvBanner from './components/EnvBanner.jsx';
import { assignTagToPost, removeTagFromPost, invalidateTagCatalog } from './lib/tags.js';
import AntenaForm from './components/AntenaForm.jsx';


// ============================================================================
// STAGE DEFINITIONS (7 etapas del pipeline)
// ============================================================================
function showWhenPasses(cond, attrs) {
  if (!cond) return true;
  const cur = attrs?.[cond.key];
  if ('includes' in cond) return Array.isArray(cur) && cur.includes(cond.includes);
  return cur === cond.value;
}
const STAGE_DEFS = [
{
    id: 'marca',
    num: 1,
    name: 'Marca en piso',
    short: 'Marca',
    color: '#64748B',
    Icon: Target,
    desc: 'Marca con aerosol en el punto exacto de instalación',
    photoReq: 'Foto horizontal que muestre claramente la marca en piso',
    checks: [],
    attributes: [
      { key: 'ubicacion_real', label: 'Ubicación marcada', type: 'gps' },

      { key: 'foto_norte', label: 'Foto — Norte', type: 'image' },
      { key: 'foto_sur',   label: 'Foto — Sur',   type: 'image' },
      { key: 'foto_este',  label: 'Foto — Este',  type: 'image' },
      { key: 'foto_oeste', label: 'Foto — Oeste', type: 'image' },

      {
        key: 'condiciones_sitio', label: 'Condiciones del sitio',
        type: 'multicheck', default: [],
        options: [
          { value: 'poda_regular', label: 'Requiere poda regular' },
          { value: 'punto_rojo',   label: 'Es punto rojo' },
          { value: 'alta_tension', label: 'Cerca de alta tensión (7m vertical)' },
          { value: 'inundacion',   label: 'Zona de inundación' },
          { value: 'otro',         label: 'Otro' },
        ],
      },
      { key: 'condiciones_sitio_otro', label: 'Describe la condición', type: 'text', showWhen: { key: 'condiciones_sitio', includes: 'otro' }, placeholder: 'Describe...' },

      {
        key: 'entorno_cercano', label: 'Presencia cercana',
        type: 'multicheck', default: [],
        options: [
          { value: 'escuela',         label: 'Escuela' },
          { value: 'mercado',         label: 'Mercado' },
          { value: 'tianguis',        label: 'Tianguis' },
          { value: 'hospital',        label: 'Hospital / clínica' },
          { value: 'centro_cultural', label: 'Centro cultural' },
          { value: 'deportivo',       label: 'Deportivo' },
          { value: 'otro',            label: 'Otro' },
        ],
      },
      { key: 'entorno_cercano_otro', label: 'Describe el entorno', type: 'text', showWhen: { key: 'entorno_cercano', includes: 'otro' }, placeholder: 'Describe...' },
    ],
  },
  {
    id: 'dado',
    num: 2,
    name: 'Dado',
    short: 'Dado',
    color: '#2563EB',
    Icon: Box,
    desc: 'Excavación y colocación del dado de cimentación',
    photoReq: 'Foto del dado colocado',
    checks: [],
    attributes: [
      { key: 'poste_tipo', label: 'Tipo de poste', type: 'select', options: ['8m', '13m'] },
      { key: 'ubicacion_real', label: 'Ubicación del dado', type: 'gps' },
    ],
  },
  {
    id: 'parado',
    num: 3,
    name: 'Poste instalado',
    short: 'Poste',
    color: '#8B5CF6',
    Icon: Flag,
    desc: 'Poste vertical instalado y conectado a electricidad',
    photoReq: 'Foto de luz violeta encendida de día, sin cascajo ni basura alrededor',
    checks: [],
    attributes: [
      { key: 'estado_luz', label: 'Estado de luz', type: 'select', options: ['Con luz', 'Conectado a luminaria', 'Equipo mojado', 'Sin luz', 'Otro'], required: true },
      { key: 'estado_luz_otro', label: 'Especificar otro estado', type: 'text', showWhen: { key: 'estado_luz', value: 'Otro' }, placeholder: 'Describe el estado...' },
      { key: 'ubicacion_real', label: 'Ubicación del poste', type: 'gps' },
    ],
  },
  {
    id: 'camaras',
    num: 4,
    name: 'Cámaras instaladas',
    short: 'Cámaras',
    color: '#F59E0B',
    Icon: Camera,
    desc: 'Cámaras instaladas y orientadas a avenidas o sitios de interés',
    photoReq: 'Foto que demuestre orientación a avenidas/sitios de interés sin apuntar a casas',
    checks: [],
    attributes: [
      { key: 'cantidad_ptz', label: 'Cámaras PTZ', type: 'number', default: 0, min: 0 },
      { key: 'cantidad_bullet', label: 'Cámaras Bullet', type: 'number', default: 0, min: 0 },
      { key: 'orientaciones_bullet', label: 'Orientación por cámara Bullet', type: 'bullet_orientations', dependsOn: 'cantidad_bullet' },
      { key: 'ubicacion_real', label: 'Ubicación de instalación', type: 'gps' },
      { key: 'cascajo', label: 'Cascajo o basura de instalación', type: 'select', options: ['Sin cascajo ni basura', 'Con cascajo o basura'], required: true },
      { key: 'cascajo_foto', label: 'Foto del cascajo/basura', type: 'image', showWhen: { key: 'cascajo', value: 'Con cascajo o basura' } },
      { key: 'boton_panico', label: 'Botón de pánico instalado', type: 'boolean', default: false },
      { key: 'boton_panico_foto', label: 'Foto del botón de pánico', type: 'image', showWhen: { key: 'boton_panico', value: true } },
    ],
  },
  {
    id: 'internet',
    num: 5,
    name: 'Punto de internet',
    short: 'Internet',
    color: '#EC4899',
    Icon: Wifi,
    desc: 'Punto de internet con fibra protegida y modem funcionando',
    photoReq: 'Foto de fibra instalada en zona protegida y modem funcionando',
    checks: [],
    attributes: [
      { key: 'folio', label: 'Folio', type: 'text', placeholder: 'F-2026-00045' },
      { key: 'telefono', label: 'Número de teléfono', type: 'text', placeholder: '+52 55 1234 5678' },
      { key: 'tipo_modem', label: 'Tipo de modem', type: 'select', options: ['Blanco', 'Negro', 'Blanco conejito'] },
      { key: 'usuario', label: 'Usuario', type: 'text' },
      { key: 'password', label: 'Contraseña', type: 'password', sensitive: true },
      { key: 'ubicacion_real', label: 'Ubicación del punto', type: 'gps' },
    ],
  },
  {
    id: 'conexion_poste',
    num: 6,
    name: 'Conexión a postes sin modem',
    short: 'Conex. postes',
    color: '#0E7490',
    Icon: Cable,
    desc: 'Interconexión con postes vecinos que no tienen modem propio',
    photoReq: 'Foto del cableado de interconexión realizado',
    checks: [],
    attributes: [
      { key: 'postes_conectados', label: 'IDs de postes conectados', type: 'text', placeholder: 'P-0042, P-0043' },
    ],
  },
  {
    id: 'centro',
    num: 7,
    name: 'Conexión a Centro de Inteligencia',
    short: 'C. Intel.',
    color: '#10B981',
    Icon: Server,
    desc: 'Validación de transmisión recibida en el Centro de Inteligencia',
    photoReq: 'Captura del panel del centro con la señal del poste recibida',
    checks: [],
    attributes: [
      { key: 'validado_por', label: 'Validado por', type: 'text', placeholder: 'Operador en centro' },
    ],
  },
];

const TOTAL_TARGET = 1215; // Meta total de postes CI1215

// Helper: Google Maps link from lat/lng
function mapsUrl(lat, lng) {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Helper: short address (max 30 chars) with Maps link
// Helper: display name for a post — shows num_poste if available
function postDisplayId(post) {
  if (post.numPoste != null) return `${post.id} (#${post.numPoste})`;
  return post.id;
}

function PostLabel({ post, showId = true, showAlias = true }) {
  const addr = post.direccion || 'Sin dirección';
  const short = addr.length > 35 ? addr.slice(0, 32) + '…' : addr;
  const link = mapsUrl(post.lat, post.lng);
  const badCoords = !post.lat || !post.lng || (Math.abs(post.lat) < 1 && Math.abs(post.lng) < 1);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {showId && <span className="font-mono font-bold text-rose-500 flex-shrink-0">{postDisplayId(post)}</span>}
      {badCoords && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 flex-shrink-0" title="Coordenadas inválidas">⚠ GPS</span>}
      {post.reubicado && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">📍 Reub.</span>}
      {showAlias && post.alias && (
        <span className="text-rose-600 font-medium flex-shrink-0">"{post.alias}"</span>
      )}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
           className="text-blue-500 hover:text-blue-700 underline truncate" title={addr}>
          {short}
        </a>
      ) : (
        <span className="text-stone-600 truncate">{short}</span>
      )}
    </span>
  );
}
const STAGE_BY_ID = Object.fromEntries(STAGE_DEFS.map(s => [s.id, s]));

// ============================================================================
// TERRITORIAL DATA
// ============================================================================

const ZONAS_TERRITORIALES = [
  'Centro Histórico', 'La Condesa', 'Roma Norte', 'Del Valle',
  'Coyoacán', 'Tlalpan', 'Xochimilco', 'Iztapalapa Oriente',
];

const STREETS = [
  'Av. Reforma', 'Av. Insurgentes', 'Calz. de Tlalpan', 'Av. Universidad',
  'Eje Central', 'Av. Cuauhtémoc', 'Calle Madero', 'Div. del Norte',
  'Av. Revolución', 'Calle 16 de Septiembre', 'Calz. México-Tacuba', 'Av. Chapultepec',
];

// El concepto de "cuadrillas" se eliminó a favor de usuarios individuales con roles.
// Se mantiene como array vacío para evitar romper referencias obsoletas hasta que
// se limpien del todo. La vista de cuadrillas fue reemplazada por UsersView.
const CREWS = [];

const INCIDENT_CATEGORIES = [
  { key: 'no_hay_poste',     emoji: '🚫', label: 'No hay poste',       cat: 'infra',    color: 'bg-red-100 text-red-700' },
  { key: 'dado_danado',      emoji: '🧱', label: 'Dado dañado',        cat: 'infra',    color: 'bg-red-100 text-red-700' },
  { key: 'poste_caido',      emoji: '📍', label: 'Poste caído',        cat: 'infra',    color: 'bg-red-100 text-red-700' },
  { key: 'faltan_camaras',   emoji: '📷', label: 'Faltan cámaras',     cat: 'equipo',   color: 'bg-amber-100 text-amber-700' },
  { key: 'camara_rota',      emoji: '📷', label: 'Cámara rota',        cat: 'equipo',   color: 'bg-amber-100 text-amber-700' },
  { key: 'sin_internet',     emoji: '🔌', label: 'Sin internet',       cat: 'equipo',   color: 'bg-amber-100 text-amber-700' },
  { key: 'modem_danado',     emoji: '📡', label: 'Modem dañado',       cat: 'equipo',   color: 'bg-amber-100 text-amber-700' },
  { key: 'sin_electricidad', emoji: '⚡', label: 'Sin electricidad',   cat: 'electrico', color: 'bg-blue-100 text-blue-700' },
  { key: 'cable_cortado',    emoji: '⚡', label: 'Cable cortado',      cat: 'electrico', color: 'bg-blue-100 text-blue-700' },
  { key: 'sin_luz_violeta',  emoji: '💡', label: 'Sin luz violeta',    cat: 'electrico', color: 'bg-blue-100 text-blue-700' },
  { key: 'reclamo_vecinal',  emoji: '👤', label: 'Reclamo vecinal',    cat: 'social',   color: 'bg-purple-100 text-purple-700' },
  { key: 'obstruccion',      emoji: '🗑️', label: 'Obstrucción',       cat: 'social',   color: 'bg-purple-100 text-purple-700' },
  { key: 'vandalismo',       emoji: '🔒', label: 'Vandalismo',         cat: 'social',   color: 'bg-purple-100 text-purple-700' },
  { key: 'mala_ubicacion',   emoji: '📍', label: 'Mala ubicación',     cat: 'ubicacion', color: 'bg-pink-100 text-pink-700' },
  { key: 'acceso_bloqueado', emoji: '🚧', label: 'Acceso bloqueado',   cat: 'ubicacion', color: 'bg-pink-100 text-pink-700' },
  { key: 'otro',             emoji: '✏️', label: 'Otro',               cat: 'otro',     color: 'bg-stone-100 text-stone-600' },
];

// Helper: get badge info for an incident type string
function getIncidentBadge(type) {
  if (!type) return { emoji: '⚠️', label: type || '?', color: 'bg-stone-100 text-stone-600' };
  const cat = INCIDENT_CATEGORIES.find(c => c.key === type || c.label === type);
  if (cat) return cat;
  // Try fuzzy match for legacy free-text types
  const lower = (type || '').toLowerCase();
  if (lower.includes('poste') && (lower.includes('no') || lower.includes('sin') || lower.includes('caído'))) return INCIDENT_CATEGORIES.find(c => c.key === 'no_hay_poste');
  if (lower.includes('cámara') || lower.includes('camara')) return INCIDENT_CATEGORIES.find(c => c.key === 'faltan_camaras');
  if (lower.includes('electric') || lower.includes('luz')) return INCIDENT_CATEGORIES.find(c => c.key === 'sin_electricidad');
  if (lower.includes('internet') || lower.includes('modem')) return INCIDENT_CATEGORIES.find(c => c.key === 'sin_internet');
  if (lower.includes('reclamo') || lower.includes('vecin')) return INCIDENT_CATEGORIES.find(c => c.key === 'reclamo_vecinal');
  if (lower.includes('vandal') || lower.includes('robo')) return INCIDENT_CATEGORIES.find(c => c.key === 'vandalismo');
  return { emoji: '⚠️', label: type, color: 'bg-stone-100 text-stone-600' };
}

// ============================================================================
// DATA GENERATION
// ============================================================================

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateAddress(rng, i) {
  const street = STREETS[Math.floor(rng() * STREETS.length)];
  const num = Math.floor(rng() * 2800) + 50;
  return `${street} ${num}`;
}

function emptyStages() {
  const st = {};
  STAGE_DEFS.forEach(s => {
    st[s.id] = { done: false, ts: null, photo: null, capturedBy: null, verified: false, verifiedBy: null, verifiedAt: null, notes: '', attrs: {} };
  });
  return st;
}


// Derived helpers
function currentStageOf(post) {
  if (post.blocked) return { state: 'bloqueado' };
  for (const s of STAGE_DEFS) {
    if (!post.stages[s.id]?.done) return { state: 'pendiente', stage: s };
  }
  return { state: 'completado' };
}
function completedStageCount(post) {
  return STAGE_DEFS.filter(s => post.stages[s.id]?.done).length;
}
// Normaliza un poste para el panel de rutas de scouting.
function postToScoutPole(p) {
  const cs = currentStageOf(p);
  return {
    id: p.id,
    clave: p.alias ? `${p.id} · ${p.alias}` : p.id,
    lat: p.lat,
    lng: p.lng,
    ut: p.unidad_territorial,
    etapa: cs.state === 'completado' ? 'completado' : cs.state === 'bloqueado' ? 'bloqueado' : cs.stage?.id,
  };
}


// ============================================================================
// STORAGE HELPERS (v2 schema)
// ============================================================================

const STORAGE_KEYS = {
  // Solo preferencias de UI — los datos reales viven en tablas normalizadas
  // (posts, post_stages, incidents, unidades_territoriales, crews).
  viewMode:     'fcoord:viewmode:v8',
  activeCrewId: 'fcoord:activecrew:v8',
};

async function storageGet(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function storageSet(key, value) {
  try { await window.storage.set(key, JSON.stringify(value)); } catch (e) { console.error('storage set failed', e); }
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function StageBadge({ stage, done, active, size = 'sm' }) {
  const s = STAGE_BY_ID[stage];
  const sz = size === 'sm' ? 'w-5 h-5 text-[13px]' : 'w-8 h-8 text-sm';
  return (
    <div className={`${sz} flex items-center justify-center rounded-full font-mono font-bold transition-all`}
         style={{
           background: done ? s.color : active ? `${s.color}25` : '#18181B',
           color: done ? '#fff' : active ? s.color : '#52525B',
           border: active ? `1.5px solid ${s.color}` : '1px solid #27272A',
           boxShadow: active ? `0 0 10px ${s.color}55` : 'none',
         }}>
      {done ? '✓' : s.num}
    </div>
  );
}

function StagePipeline({ post, size = 'sm', onStageClick }) {
  const cur = currentStageOf(post);
  const activeId = cur.state === 'pendiente' ? cur.stage.id : null;
  return (
    <div className="flex items-center gap-0">
      {STAGE_DEFS.map((s, i) => {
        const done = post.stages[s.id]?.done;
        const active = s.id === activeId;
        return (
          <Fragment key={s.id}>
            <button
              type="button"
              onClick={() => onStageClick && onStageClick(s)}
              className={onStageClick ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}>
              <StageBadge stage={s.id} done={done} active={active} size={size} />
            </button>
            {i < STAGE_DEFS.length - 1 && (
              <div className={`${size === 'sm' ? 'h-0.5 w-2' : 'h-0.5 w-4'} transition-colors`}
                   style={{ background: done && post.stages[STAGE_DEFS[i + 1].id]?.done ? s.color : '#27272A' }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function StatusChip({ post }) {
  if (post.blocked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded-sm font-mono font-medium tracking-wide uppercase"
            style={{ background: '#EF444420', color: '#EF4444', border: '1px solid #EF444440' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Bloqueado
      </span>
    );
  }
  const cur = currentStageOf(post);
  if (cur.state === 'completado') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded-sm font-mono font-medium tracking-wide uppercase"
            style={{ background: '#10B98120', color: '#10B981', border: '1px solid #10B98140' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Completado
      </span>
    );
  }
  const s = cur.stage;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded-sm font-mono font-medium tracking-wide uppercase"
          style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      Sig: E{s.num}
    </span>
  );
}

function StatCard({ label, value, sub, accent = '#F59E0B', icon: Icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`relative bg-stone-100/60 border border-stone-300 p-5 overflow-hidden group hover:border-stone-500 transition-colors text-left w-full ${onClick ? 'cursor-pointer' : ''}`}>
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.15em] text-stone-500 mb-2">{label}</div>
          <div className="text-3xl font-mono font-light text-stone-950 tabular-nums">{value}</div>
          {sub && <div className="text-xs text-stone-500 mt-1 font-mono">{sub}</div>}
        </div>
        {Icon && <Icon className="w-4 h-4 text-stone-500 group-hover:text-stone-600 transition-colors" strokeWidth={1.5} />}
      </div>
    </Tag>
  );
}

// ============================================================================
// MAP VIEW — OpenLayers con tiles reales (CARTO Voyager — modo claro)
//
// Fuera del sandbox del artifact, OpenLayers se importa como dependencia
// normal desde npm. Los tiles de CARTO se sirven vía XYZ directamente.
// Si CARTO falla o está caído, hay fallback a OpenStreetMap.
// ============================================================================

const CARTO_LIGHT_URLS = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
];
const CARTO_DARK_URLS = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];
const OSM_URLS = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
];
const MAP_TILE_URL_VERSION = '20260509-desktop-basemap';
const MAP_TILE_PROVIDER_STORAGE_KEY = 'ci1215-map-tile-provider-v2';
const versionedTileUrls = (urls) => urls.map(url => `${url}?v=${MAP_TILE_URL_VERSION}`);
const MAP_TILE_PROVIDERS = {
  carto: {
    label: 'CARTO',
    getUrls: (darkMode) => versionedTileUrls(darkMode ? CARTO_DARK_URLS : CARTO_LIGHT_URLS),
    attributions: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © CARTO',
  },
  osm: {
    label: 'OSM',
    getUrls: () => versionedTileUrls(OSM_URLS),
    attributions: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

function defaultMapTileProvider() {
  try {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone;
    return !isMobile && isStandalone ? 'osm' : 'carto';
  } catch {
    return 'carto';
  }
}

function readStoredMapTileProvider() {
  try {
    const provider = localStorage.getItem(MAP_TILE_PROVIDER_STORAGE_KEY);
    return MAP_TILE_PROVIDERS[provider] ? provider : defaultMapTileProvider();
  } catch {
    return defaultMapTileProvider();
  }
}

function createMapTileSource(providerId, darkMode, onTileError, onTileLoadEnd) {
  const provider = MAP_TILE_PROVIDERS[providerId] || MAP_TILE_PROVIDERS.carto;
  const source = new OLXYZ({
    urls: provider.getUrls(darkMode),
    attributions: provider.attributions,
    maxZoom: 19,
  });
  source.on('tileloaderror', onTileError);
  source.on('tileloadend', onTileLoadEnd);
  return source;
}

// Distancia Haversine entre dos puntos lat/lng en metros (precisión GPS real)
// Convex hull (Andrew's monotone chain). Input/output: array de {lng, lat}.
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const cross = (O, A, B) => (A.lng - O.lng) * (B.lat - O.lat) - (A.lat - O.lat) * (B.lng - O.lng);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function centroidLngLat(points) {
  if (!points.length) return null;
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.lng; sy += p.lat; }
  return { lng: sx / points.length, lat: sy / points.length };
}

function haversineMeters(latA, lngA, latB, lngB) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatMeters(m) {
  if (m == null || Number.isNaN(m)) return '';
  if (m < 100) return `${m.toFixed(1)} m`;
  return `${Math.round(m)} m`;
}

function colorOfPost(p) {
  if (p.blocked) return '#EF4444';
  const cur = currentStageOf(p);
  if (cur.state === 'completado') return '#10B981';
  return cur.stage.color;
}

// Cache de estilos de los puntos del mapa (evita crear miles de objetos OLStyle).
// Color del anillo "Revisado" en el mapa. Es un ANILLO exterior (halo), no el
// relleno, así NO choca con los colores de etapa del punto. Cambia el tono aquí.
const REVISADO_RING_COLOR = '#FFFFFF';
const SELECTED_COLOR = '#39FF14'; // verde fluorescente: punto seleccionado o encontrado en busqueda
const HALO_MODE = 'C'; // PRUEBA halos: A=poligono seleccionado, B=filtro UT, C=ambos. Sin disparador => 0 halos
const __POST_STYLE_CACHE = new Map();
function cachedPostStyle(color, state /* 'normal' | 'sel' | 'editing' */, revisado = false) {
  const key = (state === 'editing' ? 'editing' : `${color}|${state}`) + (revisado ? '|R' : '');
  let st = __POST_STYLE_CACHE.get(key);
  if (!st) {
    const radius = state === 'editing' ? 12 : (state === 'sel' ? 10 : 5);
    const dot = new OLStyle({
      image: new OLCircle({
        radius,
        fill: new OLFill({ color: state === 'editing' ? '#A855F7' : (state === 'sel' ? SELECTED_COLOR : color) }),
        stroke: new OLStroke({
          color: state === 'editing' ? '#FFFFFF' : (state === 'sel' ? '#0A2E0A' : '#0A0E14'),
          width: state === 'editing' ? 3 : (state === 'sel' ? 3 : 1),
        }),
      }),
    });
    const layers = [];
    if (state === 'sel') {
      // Halo verde fluorescente para que el punto seleccionado/buscado no se pierda
      layers.push(new OLStyle({
        image: new OLCircle({
          radius: radius + 6,
          fill: new OLFill({ color: 'rgba(57, 255, 20, 0.22)' }),
          stroke: new OLStroke({ color: SELECTED_COLOR, width: 2 }),
        }),
      }));
    }
    if (revisado) {
      // Halo exterior punteado: marca "revisado" sin tapar el color de etapa.
      layers.push(new OLStyle({
        image: new OLCircle({
          radius: radius + 4,
          stroke: new OLStroke({ color: REVISADO_RING_COLOR, width: 2.5, lineDash: [3, 3] }),
        }),
      }));
    }
    layers.push(dot);
    st = layers.length === 1 ? layers[0] : layers;
    __POST_STYLE_CACHE.set(key, st);
  }
  return st;
}

// ---- Detección de UT por ubicación (punto-en-polígono con ut_boundaries.geojson) ----
let __utPolysPromise = null;
function loadUtPolys() {
  if (!__utPolysPromise) {
    const url = `${import.meta.env.BASE_URL}ut_boundaries.geojson`;
    __utPolysPromise = fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar el mapa de UT')))
      .then(gj => (gj.features || []).map(ft => ({
        nombre: (ft.properties?.nombre_uat || '').trim(),
        geom: ft.geometry,
      })))
      .catch(e => { __utPolysPromise = null; throw e; });
  }
  return __utPolysPromise;
}
function __pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function __pointInPolygon(lng, lat, polygon) {
  if (!polygon.length || !__pointInRing(lng, lat, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) {
    if (__pointInRing(lng, lat, polygon[k])) return false; // dentro de un hueco
  }
  return true;
}
function detectUtNombre(lng, lat, polys) {
  for (const p of polys) {
    const g = p.geom;
    if (!g) continue;
    if (g.type === 'Polygon') {
      if (__pointInPolygon(lng, lat, g.coordinates)) return p.nombre;
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        if (__pointInPolygon(lng, lat, poly)) return p.nombre;
      }
    }
  }
  return null;
}
function __normUt(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

const MAP_VIEW_STORAGE_KEY = 'ci1215-map-view';
function readStoredMapView() {
  try {
    const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // Validar que la vista guardada caiga dentro de CDMX/GAM; si no, ignorarla
    // (evita quedarse atorado sobre el mar por una vista vieja corrupta).
    const enCDMX = v.lng > -99.6 && v.lng < -98.8 && v.lat > 19.0 && v.lat < 19.9;
    if (typeof v.lng === 'number' && typeof v.lat === 'number' && typeof v.zoom === 'number' && enCDMX) return v;
  } catch {}
  return null;
}

function MapView({ posts, setPosts, selectedPost, setSelectedPost, openPostDetail, filters, onCapturePost, stageDefs, darkMode,
                   measureMode = false, setMeasureMode, measurePoints = [], setMeasurePoints,
                   editingPostId, onConfirmRelocate, onCancelRelocate,
                   addingMode, onMapClickForNewPost, focusPost, focusKey, isAdmin, canMerge = false, onMergePosts, onCompareDetail, incidents = [], userNames = {}, unidadesTerritoriales = [], onRefresh, onClickAntena, onToggleRevisado }) {
  const containerRef = useRef(null);
  const isMobile = useIsMobile();
  const mapRef = useRef(null);
  const featByIdRef = useRef(new Map());
  const prevSpecialRef = useRef(new Set());
  const vectorSourceRef = useRef(null);
  const haloSourceRef = useRef(null);
  const haloLayerRef = useRef(null);
  const haloPhaseRef = useRef(0);
  const userLocSourceRef = useRef(null);
  const baseLayerRef = useRef(null);
  const initialTileProvider = useMemo(readStoredMapTileProvider, []);
  const tileProviderRef = useRef(initialTileProvider);
  const tileErrorCountRef = useRef(0);
  const tileLoadCountRef = useRef(0);
  const tileWatchTimerRef = useRef(null);
  const tileWatchCycleRef = useRef(0);
  const tileErrorHandlerRef = useRef(() => {});
  const tileLoadEndHandlerRef = useRef(() => {});
  const applyTileProviderRef = useRef(() => {});
  const [hover, setHover] = useState(null);
  const [showUts, setShowUts] = useState(false);
  const [utHoverName, setUtHoverName] = useState(null);
  const [reviewUt, setReviewUt] = useState(null);
  const [utPicker, setUtPicker] = useState(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  // Refs para que los handlers del map (closure inicial) lean el estado actual
  const addingModeRef = useRef(addingMode);
  useEffect(() => { addingModeRef.current = addingMode; }, [addingMode]);

  const measureModeRef = useRef(measureMode);
  useEffect(() => { measureModeRef.current = measureMode; }, [measureMode]);

  const measurePointsRef = useRef(measurePoints);
  useEffect(() => { measurePointsRef.current = measurePoints; }, [measurePoints]);

  const measureLayerRef = useRef(null);
  const measureSourceRef = useRef(null);

  const utPolygonLayerRef = useRef(null);
  const utPolygonSourceRef = useRef(null);
  const onMapClickForNewPostRef = useRef(onMapClickForNewPost);
  useEffect(() => { onMapClickForNewPostRef.current = onMapClickForNewPost; }, [onMapClickForNewPost]);
  // PR B Lote 3: capa de iconos antena (admin)
  const antenaLayerRef = useRef(null);
  const antenaSourceRef = useRef(null);
  const onClickAntenaRef = useRef(onClickAntena);
  useEffect(() => { onClickAntenaRef.current = onClickAntena; }, [onClickAntena]);
  const translateRef = useRef(null);
  const [tileProvider, setTileProvider] = useState(initialTileProvider);
  const [tileNotice, setTileNotice] = useState(null);
  const [cardPosts, setCardPosts] = useState([]); // postes mostrados en tarjetas (multi, para comparar)
  const [highlightedPostId, setHighlightedPostId] = useState(null); // punto resaltado en verde (persistente hasta elegir otro)
  const [editingUtPostId, setEditingUtPostId] = useState(null); // tarjeta con el editor de UT abierto
  const [utQuery, setUtQuery] = useState(''); // texto del buscador de UT
  const [utSuggestion, setUtSuggestion] = useState(null); // sugerencia de UT por ubicación

  // Detectar UT sugerida por ubicación cuando se abre el editor de UT
  useEffect(() => {
    if (!editingUtPostId) { setUtSuggestion(null); return; }
    const p = cardPosts.find(x => x.id === editingUtPostId);
    if (!p || !p.lat || !p.lng || Math.abs(p.lat) <= 1 || Math.abs(p.lng) <= 1) { setUtSuggestion({ none: true }); return; }
    let cancel = false;
    setUtSuggestion({ loading: true });
    loadUtPolys()
      .then(polys => {
        if (cancel) return;
        const nombre = detectUtNombre(p.lng, p.lat, polys);
        if (!nombre) { setUtSuggestion({ none: true }); return; }
        const ut = (unidadesTerritoriales || []).find(u => __normUt(u.nombre) === __normUt(nombre));
        setUtSuggestion({ nombreDetectado: nombre, ut: ut || null, enCatalogo: !!ut });
      })
      .catch(() => { if (!cancel) setUtSuggestion({ error: true }); });
    return () => { cancel = true; };
  }, [editingUtPostId, cardPosts, unidadesTerritoriales]);

  // Sincronizar visibilidad de la capa UT con el toggle + filtro UT del FilterBar.
  // La capa es visible si: el usuario activo el boton UT del mapa O hay filtro arriba.
  useEffect(() => {
    const hayFiltro = (filters?.uts?.length || 0) > 0;
    if (utPolygonLayerRef.current) {
      utPolygonLayerRef.current.setVisible(hayFiltro || showUts);
    }
    if (!showUts && !hayFiltro) setUtHoverName(null);
  }, [showUts, filters?.uts]);

  // Handler de hover sobre poligonos UT (tooltip flotante)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const onMove = (evt) => {
      if (!utPolygonLayerRef.current || !utPolygonLayerRef.current.getVisible()) {
        if (utHoverName) setUtHoverName(null);
        return;
      }
      let found = null;
      map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
        if (layer === utPolygonLayerRef.current) { found = feature; return true; }
      }, { hitTolerance: 0 });
      const name = getUtName(found);
      setUtHoverName(name);
      setUtHover(utPolygonLayerRef.current, found);
    };
    map.on('pointermove', onMove);
    return () => { map.un('pointermove', onMove); };
  }, [showUts]);
  const [mergeSel, setMergeSel] = useState([]); // postes marcados para fusion (max 2)
  const [mergeOpenMap, setMergeOpenMap] = useState(false);
  const [userLoc, setUserLoc] = useState(null);   // {lat, lng, accuracy}
  const [showNearby, setShowNearby] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(20);
  const [showScout, setShowScout] = useState(false); // panel de rutas de scouting
  const [routeSel, setRouteSel] = useState([]);       // paradas de la ruta (controlado por panel + clic en mapa)
  const scoutActiveRef = useRef(false);
  useEffect(() => { scoutActiveRef.current = showScout; }, [showScout]);

  // Postes normalizados para el panel de rutas { id, clave, lat, lng, ut, etapa }.
  // Usa TODOS los postes (no el filtro global) para no perder paradas al cargar rutas guardadas.
  const scoutPoles = useMemo(() => (
    posts
      .filter(p => p.lat && p.lng && !(Math.abs(p.lat) < 1 && Math.abs(p.lng) < 1))
      .map(postToScoutPole)
  ), [posts]);

  const filtered = useMemo(() => {
    let result = filterPosts(posts, filters, stageDefs, 'map', incidents || []);
    // Filtro "cerca de mí"
    if (showNearby && userLoc) {
      result = result.map(p => ({
        ...p,
        _dist: Math.sqrt(Math.pow((p.lat - userLoc.lat) * 111320, 2) + Math.pow((p.lng - userLoc.lng) * 111320 * Math.cos(userLoc.lat * Math.PI / 180), 2)),
      })).sort((a, b) => a._dist - b._dist).slice(0, nearbyCount);
    }
    return result;
  }, [posts, filters, stageDefs, showNearby, userLoc, nearbyCount]);

  // Track user location — solo cuando el usuario lo pide
  const [gpsError, setGpsError] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef(null);

  const startGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsError('GPS no disponible'); return; }
    if (watchIdRef.current) return; // ya activo
    setGpsActive(true);
    setGpsError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }); setGpsError(null); },
      (err) => { setGpsError(err.code === 1 ? 'Permiso denegado' : err.code === 2 ? 'GPS no disponible' : 'GPS timeout'); setGpsActive(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => {
    return () => { if (watchIdRef.current) navigator.geolocation?.clearWatch(watchIdRef.current); };
  }, []);

  const startTileWatch = useCallback((providerId) => {
    const cycle = ++tileWatchCycleRef.current;
    if (tileWatchTimerRef.current) clearTimeout(tileWatchTimerRef.current);
    tileWatchTimerRef.current = setTimeout(() => {
      if (cycle !== tileWatchCycleRef.current || tileLoadCountRef.current > 0) return;

      if (providerId !== 'osm') {
        applyTileProviderRef.current('osm', 'No se recibieron tiles de CARTO; usando OSM.');
        return;
      }

      setTileNotice('No se recibieron tiles del mapa base. Revisa conexión o reintenta.');
      setTilesFailed(true);
    }, 4500);
  }, []);

  const applyTileProvider = useCallback((providerId, notice = null) => {
    const nextProvider = MAP_TILE_PROVIDERS[providerId] ? providerId : 'carto';
    tileProviderRef.current = nextProvider;
    tileErrorCountRef.current = 0;
    tileLoadCountRef.current = 0;
    setTileProvider(nextProvider);
    setTileNotice(notice);
    setTilesFailed(Boolean(notice));
    try { localStorage.setItem(MAP_TILE_PROVIDER_STORAGE_KEY, nextProvider); } catch {}

    if (!baseLayerRef.current) return;
    baseLayerRef.current.setSource(createMapTileSource(
      nextProvider,
      darkMode,
      () => tileErrorHandlerRef.current(),
      () => tileLoadEndHandlerRef.current()
    ));
    startTileWatch(nextProvider);
  }, [darkMode, startTileWatch]);

  useEffect(() => {
    applyTileProviderRef.current = applyTileProvider;
  }, [applyTileProvider]);

  useEffect(() => {
    tileErrorHandlerRef.current = () => {
      tileErrorCountRef.current += 1;
      if (tileErrorCountRef.current < 3) return;

      if (tileProviderRef.current !== 'osm') {
        applyTileProvider('osm', 'CARTO no respondió; usando OSM.');
        return;
      }

      setTileNotice('Mapa base sin conexión. Reintenta o cambia proveedor.');
      setTilesFailed(true);
    };
  }, [applyTileProvider]);

  useEffect(() => {
    tileLoadEndHandlerRef.current = () => {
      tileLoadCountRef.current += 1;
      if (tileLoadCountRef.current === 1) {
        if (tileWatchTimerRef.current) clearTimeout(tileWatchTimerRef.current);
        setTileNotice(null);
        setTilesFailed(false);
      }
    };
  }, []);

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const located = posts.filter(p => p.lat && p.lng && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1);
    const lats = located.map(p => p.lat);
    const lngs = located.map(p => p.lng);
    const centerLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -99.1332;
    const centerLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 19.4326;

    const baseSource = createMapTileSource(
      tileProviderRef.current,
      darkMode,
      () => tileErrorHandlerRef.current(),
      () => tileLoadEndHandlerRef.current()
    );
    const baseLayer = new OLTileLayer({ source: baseSource });
    baseLayerRef.current = baseLayer;

    const vectorSource = new OLVectorSource();
    vectorSourceRef.current = vectorSource;

    const userLocSource = new OLVectorSource();
      const haloSource = new OLVectorSource();
      const haloLayer = new OLVectorLayer({
        source: haloSource,
        zIndex: 5,
        style: (feature) => {
          const estado = feature.get('estado') || 'no_definido';
          const phase = haloPhaseRef.current;
          const isAnimated = estado === 'verificado' || estado === 'no_existe';
          let color, radius, opacity;
          if (estado === 'verificado') {
            color = '#BC955C';
            radius = isAnimated ? (14 + Math.sin(phase) * 4) : 14;
            opacity = isAnimated ? (0.5 + Math.sin(phase) * 0.2) : 0.4;
          } else if (estado === 'no_existe') {
            color = '#9F2241';
            radius = isAnimated ? (14 + Math.sin(phase) * 4) : 14;
            opacity = isAnimated ? (0.5 + Math.sin(phase) * 0.2) : 0.4;
          } else {
            color = '#55585A';
            radius = 11;
            opacity = 0.25;
          }
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          const rgbaFill = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          const rgbaStroke = `rgba(${r}, ${g}, ${b}, ${Math.min(opacity + 0.2, 1)})`;
          const haloStyle = new OLStyle({
              image: new OLCircle({
                radius,
                fill: new OLFill({ color: rgbaFill }),
                stroke: new OLStroke({ color: rgbaStroke, width: 1.5 }),
              }),
            });
            if (!feature.get('verificadoCampo')) return haloStyle;
            return [haloStyle, new OLStyle({
              image: new OLCircle({
                radius: 19,
                fill: null,
                stroke: new OLStroke({ color: '#D946EF', width: 2.5 }),
              }),
            })];
        },
      });
      haloSourceRef.current = haloSource;
      haloLayerRef.current = haloLayer;
    userLocSourceRef.current = userLocSource;

    // Capa de Unidades Territoriales (lazy: invisible hasta el toggle)
    const utLayer = createUtLayer({ baseUrl: import.meta.env.BASE_URL });
    utPolygonLayerRef.current = utLayer;
    utPolygonSourceRef.current = utLayer.getSource();

    const map = new OLMap({
      target: containerRef.current,
      controls: [], // Use our custom controls instead of defaults
      layers: [
        baseLayer,
        utLayer,
        haloLayer,
        new OLVectorLayer({ source: vectorSource, zIndex: 10 }),
        new OLVectorLayer({ source: userLocSource, zIndex: 20 }),
      ],
      view: new OLView({ center: olFromLonLat([centerLng, centerLat]), zoom: 12 }),
    });

    // Click → addingMode tiene prioridad; si no, mostrar tarjeta del feature
    map.on('click', (e) => {
      if (addingModeRef.current) {
        const [lng, lat] = olToLonLat(e.coordinate);
        if (onMapClickForNewPostRef.current) onMapClickForNewPostRef.current(lat, lng);
        return;
      }
      // Modo regla: registrar poste A o calcular distancia A→B
      if (measureModeRef.current) {
        const mf = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: 6 });
        const mp = mf?.get('post');
        if (mp && mp.lat && mp.lng) {
          const curr = measurePointsRef.current || [];
          if (curr.length === 0 || curr.length === 2) {
            setMeasurePoints([{ id: mp.id, lat: mp.lat, lng: mp.lng }]);
          } else if (curr[0].id !== mp.id) {
            setMeasurePoints([curr[0], { id: mp.id, lat: mp.lat, lng: mp.lng }]);
          }
        }
        return;
      }
      // Scouting activo: clic en un poste lo agrega/quita de la ruta
      if (scoutActiveRef.current) {
        const sf = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: 6 });
        const sp = sf?.get('post');
        if (sp && sp.lat && sp.lng) {
          const pole = postToScoutPole(sp);
          setRouteSel(prev => prev.some(x => x.id === pole.id) ? prev.filter(x => x.id !== pole.id) : [...prev, pole]);
          return;
        }
      }
      const feat = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: 6 });
      if (feat) {
        const post = feat.get('post');
        if (post) { setHighlightedPostId(post.id); setCardPosts(prev => prev.find(x => x.id === post.id) ? prev : [...prev, post]); return; }
      }
      setCardPosts([]);
    });

    let __lastHover = 0;
    map.on('pointermove', (e) => {
      if (e.dragging) { setHover(null); return; }
      const __now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (__now - __lastHover < 70) return; // throttle: ~14 detecciones/seg máx
      __lastHover = __now;
      const pixel = map.getEventPixel(e.originalEvent);
      const feat = map.forEachFeatureAtPixel(pixel, f => f, { hitTolerance: 4 });
      if (feat?.get('post')) {
        setHover({ post: feat.get('post'), x: pixel[0], y: pixel[1] });
        map.getTargetElement().style.cursor = 'pointer';
      } else {
        setHover(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    mapRef.current = map;
    map.on('moveend', () => {
      try {
        const v = map.getView();
        const cc = olToLonLat(v.getCenter());
        localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({ lng: cc[0], lat: cc[1], zoom: v.getZoom() }));
      } catch {}
    });
    startTileWatch(tileProviderRef.current);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.updateSize());
      ro.observe(containerRef.current);
    }
    const fitTimer = setTimeout(() => {
      map.updateSize();
      const savedView = readStoredMapView();
      if (savedView) {
        try {
          map.getView().setCenter(olFromLonLat([savedView.lng, savedView.lat]));
          map.getView().setZoom(savedView.zoom);
        } catch {}
        return;
      }
      const validPosts = posts.filter(p => p.lat && p.lng && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1);
      if (validPosts.length > 0) {
        try {
          const extent = olBoundingExtent(validPosts.map(p => olFromLonLat([p.lng, p.lat])));
          map.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 15 });
        } catch {}
      }
    }, 100);

    return () => {
      clearTimeout(fitTimer);
      if (tileWatchTimerRef.current) clearTimeout(tileWatchTimerRef.current);
      if (ro) try { ro.disconnect(); } catch {}
      try { map.setTarget(undefined); } catch {}
      mapRef.current = null; vectorSourceRef.current = null; userLocSourceRef.current = null;
    };
  }, [darkMode, startTileWatch]); // PASO_8_V2_ZOOM_FIX: removido posts.length para no reinicializar el mapa al merge/captura/edicion (preserva zoom)

  // PASO_8_V2_INITIAL_FIT: ajustar la vista inicial al bounding box de los
  // postes UNA sola vez por montaje del componente. Si hay savedView valido
  // en localStorage, el init del mapa ya lo respeta y aqui NO hacemos nada.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (initialFitDoneRef.current) return;
    if (!mapRef.current) return;
    if (!posts || posts.length === 0) return;
    initialFitDoneRef.current = true;
    const savedView = readStoredMapView();
    if (savedView) return; // ya restaurado por el init
    const validPosts = posts.filter(p => p.lat && p.lng && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1);
    if (validPosts.length === 0) return;
    try {
      const extent = olBoundingExtent(validPosts.map(p => olFromLonLat([p.lng, p.lat])));
      mapRef.current.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 15 });
    } catch {}
  }, [posts]);

  // Cambiar tiles del mapa según el tema
  useEffect(() => {
    if (!baseLayerRef.current) return;
    applyTileProvider(tileProviderRef.current);
  }, [darkMode, applyTileProvider]);

  // Construir los features UNA sola vez por cambio de datos (filtered).
  // Evita recrear miles de geometrías y estilos en cada clic o selección.
  useEffect(() => {
    const src = vectorSourceRef.current;
    if (!src) return;
    src.clear();
    const byId = new Map();
    const feats = filtered.map(p => {
      const feat = new OLFeature({ geometry: new OLPoint(olFromLonLat([p.lng, p.lat])) });
      feat.set('post', p);
      feat.setStyle(cachedPostStyle(colorOfPost(p), 'normal', !!p.revisado));
      byId.set(p.id, feat);
      return feat;
    });
    src.addFeatures(feats);
    featByIdRef.current = byId;
    prevSpecialRef.current = new Set();
  }, [filtered]);

  // Resaltar selección/edición tocando SOLO los features afectados (no los miles).
  useEffect(() => {
    const byId = featByIdRef.current;
    if (!byId || byId.size === 0) return;
    const special = new Set();
    if (selectedPost?.id) special.add(selectedPost.id);
    for (const c of cardPosts) special.add(c.id);
    if (editingPostId) special.add(editingPostId);
    if (highlightedPostId) special.add(highlightedPostId);
    // Regresar a 'normal' los que dejaron de estar seleccionados
    for (const id of prevSpecialRef.current) {
      if (special.has(id)) continue;
      const f = byId.get(id); const p = f?.get('post');
      if (f && p) f.setStyle(cachedPostStyle(colorOfPost(p), 'normal', !!p.revisado));
    }
    // Aplicar el estilo especial a los actuales
    for (const id of special) {
      const f = byId.get(id); const p = f?.get('post');
      if (!f || !p) continue;
      f.setStyle(cachedPostStyle(colorOfPost(p), editingPostId === id ? 'editing' : 'sel', !!p.revisado));
    }
    prevSpecialRef.current = special;
  }, [filtered, selectedPost, cardPosts, editingPostId, highlightedPostId]);

  // Zoom/centrar al bounding box de las UTs seleccionadas (cuando cambia filters.uts)
  useEffect(() => {
    if (!mapRef.current || !filters?.uts?.length) return;
    const valid = filtered.filter(p => p.lat && p.lng && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1);
    if (!valid.length) return;
    try {
      const extent = olBoundingExtent(valid.map(p => olFromLonLat([p.lng, p.lat])));
      mapRef.current.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 500, maxZoom: 16 });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.uts]);

  // Sincroniza el filtro UT (FilterBar arriba) con la capa visual.
  // Reemplaza el codigo viejo de convex hull. Ahora pintamos el poligono REAL del GeoJSON.
  useEffect(() => {
    if (!utPolygonLayerRef.current) return;
    const utsIds = (filters && filters.uts) || [];
    if (utsIds.length > 0) {
      const idToName = new Map((unidadesTerritoriales || []).map(u => [u.id, u.nombre]));
      const names = new Set(utsIds.map(id => idToName.get(id)).filter(Boolean));
      setUtFilter(utPolygonLayerRef.current, names);
    } else {
      setUtFilter(utPolygonLayerRef.current, null);
    }
  }, [filters?.uts, unidadesTerritoriales]);

  // Handler de click sobre poligono UT: abre el panel de revision.
  // Postes tienen prioridad: si hay poste bajo el pixel, ignora el click sobre UT.
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const onClick = (e) => {
      if (!utPolygonLayerRef.current || !utPolygonLayerRef.current.getVisible()) return;
      const postFeat = map.forEachFeatureAtPixel(e.pixel, (f, l) => {
        if (l !== utPolygonLayerRef.current && f.get('post')) return f;
      }, { hitTolerance: 6 });
      if (postFeat) return;
      // Junta TODAS las UT bajo el click (no solo la mas chica) para poder elegir.
      const utHits = [];
      map.forEachFeatureAtPixel(e.pixel, (f, l) => {
        if (l === utPolygonLayerRef.current) {
          const g = f.getGeometry();
          const a = g ? g.getArea() : Infinity;
          utHits.push({ feat: f, area: a });
        }
        return false;
      }, { hitTolerance: 0 });
      if (utHits.length === 0) return;
      const seenUt = new Set();
      const utOpts = [];
      utHits.sort((p, q) => p.area - q.area).forEach(h => {
        const nm = getUtName(h.feat);
        if (!nm) return;
        const uo = (unidadesTerritoriales || []).find(u => u.nombre === nm);
        if (!uo || seenUt.has(uo.id)) return;
        seenUt.add(uo.id);
        utOpts.push(uo);
      });
      if (utOpts.length === 0) return;
      if (utOpts.length === 1) { setReviewUt(utOpts[0]); return; }
      const utEv = e.originalEvent;
      setUtPicker({ x: utEv ? utEv.clientX : 0, y: utEv ? utEv.clientY : 0, options: utOpts });
    };
    map.on('click', onClick);
    return () => { map.un('click', onClick); };
  }, [unidadesTerritoriales]);

  // Sincroniza halos de estado con los postes.
  // Si hay filtro UT activo (FilterBar arriba), solo se muestran halos de postes en esas UTs.
  useEffect(() => {
    const src = haloSourceRef.current;
    if (!src) return;
    src.clear();
    const utsFilter = (filters && filters.uts) || [];
    const hayFiltroUt = utsFilter.length > 0;
    const utSel = reviewUt ? reviewUt.id : null;
    (posts || []).forEach(p => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      // Si hay filtro UT activo, ocultar halos de postes que no esten en esas UTs
      const enFiltro = hayFiltroUt && utsFilter.includes(p.unidad_territorial);
      const enSeleccion = !!utSel && p.unidad_territorial === utSel;
      const mostrarHalo = HALO_MODE === 'A' ? enSeleccion : HALO_MODE === 'B' ? enFiltro : (enSeleccion || enFiltro);
      if (!mostrarHalo) return;
      const f = new OLFeature({
        geometry: new OLPoint(olFromLonLat([p.lng, p.lat])),
      });
      f.set('estado', p.estado_verificacion || 'no_definido');
        f.set('verificadoCampo', p.verificado_campo === true);
      f.set('postId', p.id);
      src.addFeature(f);
    });
  }, [posts, filters?.uts, reviewUt]);

  // Animacion del halo: solo afecta verificado/no_existe; no_definido queda estatico.
  useEffect(() => {
    if (!haloLayerRef.current) return;
    const id = setInterval(() => {
      haloPhaseRef.current = (haloPhaseRef.current + 0.18) % (2 * Math.PI);
      if (haloLayerRef.current) haloLayerRef.current.changed();
    }, 80);
    return () => clearInterval(id);
  }, []);

  // Antena: la capa de iconos en el mapa fue retirada (se evita duplicidad).
  // La gestión de antena ahora vive dentro del panel de detalle del poste.

  // Translate interaction — solo activa cuando hay editingPostId
  useEffect(() => {
    if (!mapRef.current || !vectorSourceRef.current) return;
    const map = mapRef.current;
    // Limpiar interaction previa
    if (translateRef.current) {
      map.removeInteraction(translateRef.current);
      translateRef.current = null;
    }
    if (!editingPostId) return;
    const target = vectorSourceRef.current.getFeatures().find(f => f.get('post')?.id === editingPostId);
    if (!target) return;
    const translate = new OLTranslate({ features: new OLCollection([target]) });
    translate.on('translateend', (ev) => {
      const feat = ev.features.getArray()[0];
      const coords = feat?.getGeometry().getCoordinates();
      if (!coords) return;
      const [lng, lat] = olToLonLat(coords);
      if (onConfirmRelocate) onConfirmRelocate(editingPostId, lat, lng);
    });
    map.addInteraction(translate);
    translateRef.current = translate;
    return () => {
      if (translateRef.current) {
        map.removeInteraction(translateRef.current);
        translateRef.current = null;
      }
    };
  }, [editingPostId, onConfirmRelocate]);

  // User location dot
  useEffect(() => {
    const src = userLocSourceRef.current;
    if (!src || !userLoc) return;
    src.clear();
    const feat = new OLFeature({ geometry: new OLPoint(olFromLonLat([userLoc.lng, userLoc.lat])) });
    feat.setStyle(new OLStyle({
      image: new OLCircle({
        radius: 8,
        fill: new OLFill({ color: 'rgba(59, 130, 246, 0.8)' }),
        stroke: new OLStroke({ color: '#ffffff', width: 3 }),
      }),
    }));
    src.addFeature(feat);
    // Accuracy circle
    const accFeat = new OLFeature({ geometry: new OLPoint(olFromLonLat([userLoc.lng, userLoc.lat])) });
    accFeat.setStyle(new OLStyle({
      image: new OLCircle({
        radius: 20,
        fill: new OLFill({ color: 'rgba(59, 130, 246, 0.1)' }),
        stroke: new OLStroke({ color: 'rgba(59, 130, 246, 0.3)', width: 1 }),
      }),
    }));
    src.addFeature(accFeat);
  }, [userLoc]);

  // Cursor crosshair en addingMode o measureMode
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = (addingMode || measureMode) ? 'crosshair' : '';
  }, [addingMode, measureMode]);

  // Limpiar puntos de medición al salir del modo regla
  useEffect(() => {
    if (!measureMode && setMeasurePoints) setMeasurePoints([]);
  }, [measureMode, setMeasurePoints]);

  // Layer de medición: línea A→B + etiqueta con distancia + marcadores
  useEffect(() => {
    if (!mapRef.current) return;
    if (!measureLayerRef.current) {
      const src = new OLVectorSource();
      const layer = new OLVectorLayer({ source: src, zIndex: 1000 });
      mapRef.current.addLayer(layer);
      measureLayerRef.current = layer;
      measureSourceRef.current = src;
    }
    const src = measureSourceRef.current;
    src.clear();
    if (!measurePoints || measurePoints.length === 0) return;
    const a = measurePoints[0];
    const coordA = olFromLonLat([a.lng, a.lat]);
    const aMarker = new OLFeature({ geometry: new OLPoint(coordA) });
    aMarker.setStyle(new OLStyle({
      image: new OLCircle({
        radius: 8,
        fill: new OLFill({ color: '#F59E0B' }),
        stroke: new OLStroke({ color: '#FFFFFF', width: 2 }),
      }),
    }));
    src.addFeature(aMarker);
    if (measurePoints.length === 2) {
      const b = measurePoints[1];
      const coordB = olFromLonLat([b.lng, b.lat]);
      const bMarker = new OLFeature({ geometry: new OLPoint(coordB) });
      bMarker.setStyle(new OLStyle({
        image: new OLCircle({
          radius: 8,
          fill: new OLFill({ color: '#EF4444' }),
          stroke: new OLStroke({ color: '#FFFFFF', width: 2 }),
        }),
      }));
      src.addFeature(bMarker);
      const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      const lineFeat = new OLFeature({ geometry: new OLLineString([coordA, coordB]) });
      lineFeat.setStyle(new OLStyle({
        stroke: new OLStroke({ color: '#F59E0B', width: 3, lineDash: [6, 4] }),
        text: new OLText({
          text: formatMeters(dist),
          font: 'bold 13px monospace',
          fill: new OLFill({ color: '#1F2937' }),
          backgroundFill: new OLFill({ color: 'rgba(255, 230, 100, 0.95)' }),
          backgroundStroke: new OLStroke({ color: '#92400E', width: 1 }),
          padding: [3, 6, 3, 6],
          placement: 'line',
          overflow: true,
        }),
      }));
      src.addFeature(lineFeat);
    }
  }, [measurePoints]);

  // Centrar en selección externa (cuando se hace click en pin → drawer abre → mantener centrado)
  useEffect(() => {
    if (!mapRef.current || !selectedPost) return;
    mapRef.current.getView().animate({ center: olFromLonLat([selectedPost.lng, selectedPost.lat]), duration: 400 });
  }, [selectedPost?.id]);

  // Foco en un poste (search box, jump desde lista/captura) — centra, hace zoom calle,
  // y abre la tarjeta para identificar el pin SIN abrir el drawer.
  const focusOnPost = useCallback((p) => {
    if (!mapRef.current || !p?.lat || !p?.lng) return;
    setHighlightedPostId(p.id);
    setCardPosts(prev => prev.find(x => x.id === p.id) ? prev : [...prev, p]);
    const view = mapRef.current.getView();
    view.animate({
      center: olFromLonLat([p.lng, p.lat]),
      zoom: Math.max(view.getZoom() || 13, 17),
      duration: 600,
    });
  }, []);

  // Reaccionar a peticiones externas de foco (cambio en focusKey)
  useEffect(() => {
    if (focusKey && focusPost) focusOnPost(focusPost);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const zoomIn = () => mapRef.current?.getView().animate({ zoom: mapRef.current.getView().getZoom() + 1, duration: 200 });
  const zoomOut = () => mapRef.current?.getView().animate({ zoom: mapRef.current.getView().getZoom() - 1, duration: 200 });
  const fitAll = () => {
    if (!mapRef.current || !posts.length) return;
    const valid = posts.filter(p => p.lat && p.lng && Math.abs(p.lat) > 1 && Math.abs(p.lng) > 1);
    if (!valid.length) return;
    mapRef.current.getView().fit(olBoundingExtent(valid.map(p => olFromLonLat([p.lng, p.lat]))), { padding: [40, 40, 40, 40], duration: 400, maxZoom: 15 });
  };
  const goLastView = () => {
    const v = readStoredMapView();
    if (v && mapRef.current) mapRef.current.getView().animate({ center: olFromLonLat([v.lng, v.lat]), zoom: v.zoom, duration: 400 });
  };
  const centerOnMe = () => {
    if (!mapRef.current || !userLoc) return;
    mapRef.current.getView().animate({ center: olFromLonLat([userLoc.lng, userLoc.lat]), zoom: 16, duration: 400 });
  };

  // ----- helpers autor/fecha de la ultima etapa hecha -----
  function ultimaEtapaCard(post) {
    let best = null;
    for (const def of STAGE_DEFS) {
      const st = post.stages?.[def.id];
      if (!st?.done) continue;
      const t = new Date(st.ts || 0).getTime();
      if (!best || t >= best.t) best = { def, s: st, t };
    }
    return best;
  }
  function tiempoRelativoCard(ts) {
    if (!ts) return '';
    const min = Math.floor((Date.now() - new Date(ts)) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
    return `hace ${Math.floor(min / 1440)} d`;
  }

  // Render de una tarjeta de poste (multi-comparacion en el mapa)
  const renderCard = (post) => {
    const cur = currentStageOf(post);
    const stagesDone = STAGE_DEFS.filter(s => post.stages[s.id]?.done).length;
    const marked = !!mergeSel.find(x => x.id === post.id);
    return (
      <div key={post.id} className={`bg-stone-50/95 border ${marked ? 'border-amber-400' : 'border-stone-300'} backdrop-blur-sm rounded-lg overflow-hidden shadow-2xl shrink-0`}>
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-rose-500 font-mono font-bold text-sm">{postDisplayId(post)}</div>
              {post.alias && <div className="text-rose-600 text-xs font-medium">"{post.alias}"</div>}
              <div className="text-stone-600 text-xs mt-0.5">
                {(() => {
                  const utObj = (unidadesTerritoriales || []).find(u => u.id === post.unidad_territorial);
                  return utObj ? `${utObj.id} · ${utObj.nombre}` : (post.unidad_territorial || 'Sin UT');
                })()}
                {isAdmin && (
                  <button onClick={() => { setEditingUtPostId(editingUtPostId === post.id ? null : post.id); setUtQuery(''); }}
                          title="Editar UT" className="ml-1.5 text-blue-500 hover:text-blue-700 align-middle">✎</button>
                )}
              </div>
              {post.reubicado && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">📍 Reubicado</span>}
            </div>
            <button onClick={() => setCardPosts(prev => prev.filter(x => x.id !== post.id))} className="text-stone-500 hover:text-stone-950 p-1 -mr-1 -mt-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs mt-2">
            {post.lat && post.lng ? (
              <a href={`https://www.google.com/maps?q=${post.lat},${post.lng}`} target="_blank" rel="noopener noreferrer"
                 className="text-blue-500 hover:text-blue-700 underline">
                📍 {(post.direccion && !post.direccion.startsWith('Lat ') ? post.direccion : `${Number(post.lat).toFixed(5)}, ${Number(post.lng).toFixed(5)}`)}
              </a>
            ) : <span className="text-stone-700">{post.direccion || 'Sin dirección'}</span>}
          </div>

          {isAdmin && editingUtPostId === post.id && (() => {
            const q = utQuery.trim().toLowerCase();
            const matches = (unidadesTerritoriales || [])
              .filter(u => !q || (u.nombre || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q))
              .slice(0, 8);
            const saveUt = async (u) => {
              try {
                await updatePostMetadata(post.id, { unidad_territorial: u.id, zona_territorial: u.zona || 'Sin categorizar' });
                setCardPosts(prev => prev.map(x => x.id === post.id ? { ...x, unidad_territorial: u.id, zona_territorial: u.zona || 'Sin categorizar' } : x));
                setEditingUtPostId(null);
                onRefresh?.();
              } catch (e) { alert('No se pudo cambiar la UT: ' + (e?.message || e)); }
            };
            return (
              <div className="mt-2 border border-blue-200 bg-blue-50/70 rounded p-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700 mb-1">Asignar Unidad Territorial</div>
                {utSuggestion?.loading && <div className="text-[11px] text-stone-500 mb-1">📍 Detectando por ubicación…</div>}
                {utSuggestion?.enCatalogo && utSuggestion.ut && (
                  <button onClick={() => saveUt(utSuggestion.ut)}
                          className="w-full text-left text-[11px] px-2 py-1.5 mb-1.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center gap-1.5 hover:bg-emerald-100">
                    <span className="shrink-0">📍 Sugerida:</span>
                    <span className="font-mono text-emerald-600 shrink-0">{utSuggestion.ut.id}</span>
                    <span className="truncate font-medium">{utSuggestion.ut.nombre}</span>
                  </button>
                )}
                {utSuggestion?.nombreDetectado && !utSuggestion.enCatalogo && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1 mb-1.5">
                    📍 Cae en "{utSuggestion.nombreDetectado}", pero esa UT no está en el catálogo. Elige otra abajo.
                  </div>
                )}
                {utSuggestion?.none && <div className="text-[11px] text-stone-500 mb-1.5">No se detectó UT por ubicación. Busca manualmente.</div>}
                <input autoFocus type="text" value={utQuery} onChange={e => setUtQuery(e.target.value)}
                       placeholder="Buscar UT por nombre o clave…"
                       className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800 focus:outline-none focus:border-blue-500" />
                <div className="mt-1 max-h-40 overflow-auto">
                  {matches.length === 0 ? (
                    <div className="text-[11px] text-stone-500 px-1 py-1">Sin coincidencias.</div>
                  ) : matches.map(u => (
                    <button key={u.id} onClick={() => saveUt(u)}
                            className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-blue-100 text-stone-700 flex items-center gap-1.5">
                      <span className="font-mono text-stone-400 shrink-0">{u.id}</span>
                      <span className="truncate">{u.nombre}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setEditingUtPostId(null)} className="mt-1 text-[11px] text-stone-500 hover:text-stone-700">Cancelar</button>
              </div>
            );
          })()}

          <div className="mt-3"><StagePipeline post={post} size="sm" /></div>

          <div className="flex items-center gap-3 mt-3 text-[12px] font-mono text-stone-500 flex-wrap">
            <span>{stagesDone}/7 etapas</span>
            <StatusChip post={post} />
            {post.adminApproved && <span className="text-emerald-400">✓ Aprobado</span>}
            {/* PR B - Parte 7: Indicador de boton de panico cuando E5 internet esta done */}
            {post.stages?.internet?.done && (
              post.stages?.camaras?.attrs?.boton_panico === true ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Botón pánico
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  ⚠ Falta botón pánico
                </span>
              )
            )}
            {post.stages?.conexion_poste?.attrs?.avance_con_pendientes && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-500">
                    ⚠ Avanzó sin {(post.stages.conexion_poste.attrs.avance_con_pendientes || []).map((s, i) => { const d = STAGE_DEFS.find(x => x.id === s); return <span key={s} style={{ color: d?.color }} className="font-semibold">{i > 0 ? ', ' : ''}{d ? ('E' + d.num) : s}</span>; })}
                  </span>
                )}
            {/* PR B - Parte 6: Toggle tag Internet a Futuro (admin only) */}
            {isAdmin && (() => {
              const hasIFTag = post.tags?.some(t => t.id === 'internet_futuro_priorizado');
              const applyLocalIF = (add) => {
                const upd = (p) => {
                  if (!p || p.id !== post.id) return p;
                  const others = (p.tags || []).filter(t => t.id !== 'internet_futuro_priorizado');
                  return { ...p, tags: add ? [...others, { id: 'internet_futuro_priorizado', label: 'Internet futuro' }] : others };
                };
                setCardPosts(prev => prev.map(upd));
                setSelectedPost(prev => upd(prev));
              };
              return (
                <button onClick={async (e) => {
                  e.stopPropagation();
                  const add = !hasIFTag;
                  applyLocalIF(add); // optimista: el chip cambia de inmediato
                  try {
                    if (add) {
                      await assignTagToPost(post.id, 'internet_futuro_priorizado', null);
                    } else {
                      await removeTagFromPost(post.id, 'internet_futuro_priorizado');
                    }
                    invalidateTagCatalog();
                    onRefresh?.(); // sincroniza en segundo plano (sin bloquear)
                  } catch (err) {
                    const msg = String(err?.message || err).toLowerCase();
                    const esDuplicado = err?.code === '23505' || msg.includes('duplicate') || msg.includes('duplicad');
                    if (add && esDuplicado) {
                      // Ya estaba asignado: lo tratamos como exito y sincronizamos
                      invalidateTagCatalog();
                      onRefresh?.();
                    } else {
                      applyLocalIF(!add); // revertir en error real
                      alert('Error: ' + (err?.message || err));
                    }
                  }
                }}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    hasIFTag
                      ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                      : 'bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200'
                  }`}>
                  {hasIFTag ? '✓' : '+'} Internet futuro
                </button>
              );
            })()}
          </div>

          {userLoc && (
            <div className="text-[12px] font-mono text-stone-500 mt-2">
              📏 {Math.round(Math.sqrt(Math.pow((post.lat - userLoc.lat) * 111320, 2) + Math.pow((post.lng - userLoc.lng) * 111320 * Math.cos(userLoc.lat * Math.PI / 180), 2)))} m de ti
            </div>
          )}
        </div>

        {(() => {
          const _names = (typeof userNames !== 'undefined' && userNames) ? userNames : {};
          const _incs = (typeof incidents !== 'undefined' && incidents) ? incidents : [];
          const ult = ultimaEtapaCard(post);
          const s = ult?.s;
          const autor = s ? (_names[s.capturedBy] || 'Sin autor') : 'Sin captura';
          const etiq = ult ? `E${ult.def.num}` : null;
          const fecha = s ? tiempoRelativoCard(s.ts) : '';
          const incAbiertas = _incs.filter(i => i.post_id === post.id && i.status === 'abierta').length;
          return (
            <div className="px-4 py-2 border-t border-stone-200 bg-stone-100/60 flex flex-col gap-1 text-[11px] font-mono text-stone-500">
              <div className="flex items-center justify-between">
                <span className="text-stone-700">👤 Ultima edición: {autor}{etiq && <span className="text-stone-400"> · {etiq}</span>}</span>
                {fecha && <span>🕒 {fecha}</span>}
              </div>
              <div className="text-stone-600">✏️ Creado por: {post.createdBy ? (_names[post.createdBy] || 'Usuario') : (post.origen === 'carga_arcgis' ? '📥 Carga ArcGIS' : '—')}</div>
              {(incAbiertas > 0 || s?.verified) && (
                <div className="flex items-center gap-3">
                  {incAbiertas > 0 && <span className="text-rose-600">⚠ {incAbiertas} incidencia{incAbiertas > 1 ? 's' : ''}</span>}
                  {s?.verified && <span className="text-emerald-600">✓ {etiq} verificada</span>}
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex border-t border-stone-300 flex-wrap">
          <button onClick={() => focusOnPost(post)}
                  className="flex-1 px-3 py-2.5 text-xs font-mono text-purple-500 hover:bg-stone-50 flex items-center justify-center gap-1.5 transition-colors">
            <Search className="w-3 h-3" /> Zoom
          </button>
          <a href={`https://maps.google.com/?q=${post.lat},${post.lng}`} target="_blank" rel="noopener noreferrer"
             className="flex-1 px-3 py-2.5 text-xs font-mono text-blue-400 hover:bg-stone-50 flex items-center justify-center gap-1.5 border-l border-stone-300 transition-colors">
            <Navigation className="w-3 h-3" /> Navegar
          </a>
          {cur?.stage && onCapturePost && (
            <button onClick={() => { onCapturePost(post, cur.stage); setCardPosts(prev => prev.filter(x => x.id !== post.id)); }}
                    className="flex-1 px-3 py-2.5 text-xs font-mono text-rose-400 hover:bg-stone-50 flex items-center justify-center gap-1.5 border-l border-stone-300 transition-colors">
              <Compass className="w-3 h-3" /> Cap E{cur.stage.num}
            </button>
          )}
          {canMerge && (
            <button onClick={() => {
              setMergeSel(prev => {
                if (prev.find(x => x.id === post.id)) return prev.filter(x => x.id !== post.id);
                if (prev.length >= 2) return prev;
                return [...prev, post];
              });
            }}
                    className={`flex-1 px-3 py-2.5 text-xs font-mono ${marked ? 'text-amber-700 bg-amber-50' : 'text-amber-600'} hover:bg-stone-50 flex items-center justify-center gap-1.5 border-l border-stone-300 transition-colors`}>
              {marked ? '✓ Marcado' : '⚲ Fusion'}
            </button>
          )}
          {isAdmin && onToggleRevisado && (
            <button onClick={async () => {
              try {
                await onToggleRevisado(post);
                setCardPosts(prev => prev.map(x => x.id === post.id ? { ...x, revisado: !x.revisado } : x));
              } catch (e) { alert('No se pudo cambiar revisado: ' + (e?.message || e)); }
            }}
                    className={`flex-1 px-3 py-2.5 text-xs font-mono ${post.revisado ? 'text-emerald-700 bg-emerald-50' : 'text-stone-600'} hover:bg-stone-50 flex items-center justify-center gap-1.5 border-l border-stone-300 transition-colors`}>
              {post.revisado ? '✓ Revisado' : '○ Revisar'}
            </button>
          )}
          <button onClick={() => { setSelectedPost(post); setCardPosts([]); }}
                  className="flex-1 px-3 py-2.5 text-xs font-mono text-stone-700 hover:bg-stone-50 flex items-center justify-center gap-1.5 border-l border-stone-300 transition-colors">
            <Eye className="w-3 h-3" /> Detalle
          </button>
        </div>
      </div>
    );
  };
  const tileProviderLabel = MAP_TILE_PROVIDERS[tileProvider]?.label || 'Base';
  const switchTileProvider = () => {
    applyTileProvider(tileProviderRef.current === 'carto' ? 'osm' : 'carto');
  };

  return (
    <div className="relative w-full h-full border border-stone-300 overflow-hidden" style={{ background: '#0A0E14' }}>
      <div ref={containerRef} className="w-full h-full" style={{ background: darkMode ? '#0A0E14' : '#F5F5F0' }} />

      {tilesFailed && (
        <div className="absolute top-4 right-4 bg-white/95 border border-rose-300 px-3 py-2 font-mono text-[12px] text-stone-700 z-10 backdrop-blur-sm rounded shadow-sm max-w-[280px]">
          <div className="text-rose-500">{tileNotice || 'Mapa base en fallback.'}</div>
          <div className="mt-1 flex gap-2">
            <button onClick={() => applyTileProvider(tileProviderRef.current)}
                    className="text-blue-500 hover:underline">Reintentar</button>
            <button onClick={switchTileProvider}
                    className="text-blue-500 hover:underline">Cambiar a {tileProviderRef.current === 'carto' ? 'OSM' : 'CARTO'}</button>
          </div>
        </div>
      )}

      {/* Banner: modo edición de ubicación */}
      {editingPostId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-purple-100 border-2 border-purple-400 px-4 py-2 font-mono text-xs text-purple-800 backdrop-blur-sm shadow-lg rounded flex items-center gap-3">
          <span>📍 Modo edición — arrastra el punto morado, luego suelta para confirmar</span>
          <button onClick={onCancelRelocate} className="text-purple-600 hover:text-purple-900 underline whitespace-nowrap">Cancelar</button>
        </div>
      )}

      {/* Banner: modo agregar */}
      {addingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-100 border-2 border-emerald-400 px-4 py-2 font-mono text-xs text-emerald-800 backdrop-blur-sm shadow-lg rounded">
          <span>+ Modo agregar — toca el mapa donde va el nuevo poste</span>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && !cardPosts.length && (
        <div className="absolute bg-stone-50/95 border border-stone-300 p-3 font-mono text-xs pointer-events-none backdrop-blur-sm z-20"
             style={{ left: Math.min(hover.x + 14, (containerRef.current?.clientWidth || 800) - 250), top: Math.max(hover.y - 80, 10), width: 230 }}>
          <div className="text-rose-500 font-bold tracking-wider">{hover.post.id}</div>
          <div className="text-stone-600 mt-1 text-[13px]">{hover.post.unidad_territorial} · {hover.post.zona_territorial}</div>
          <div className="text-stone-500 mt-0.5 text-[13px] truncate">{hover.post.direccion}</div>
          <div className="mt-2"><StatusChip post={hover.post} /></div>
        </div>
      )}

      {/* Tarjetas de postes (multi-comparacion) */}
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
      )}
      {mergeSel.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-stone-50/95 border border-amber-400 backdrop-blur-sm rounded-lg shadow-2xl px-4 py-2 flex items-center gap-3">
          <span className="text-xs font-mono text-stone-700">Fusion: {mergeSel.map(p => p.id).join(' + ')}</span>
          {mergeSel.length === 2 ? (
            <>
            <button onClick={() => { if (onCompareDetail) onCompareDetail(mergeSel[0], mergeSel[1]); }}
                    className="text-xs font-medium bg-stone-700 hover:bg-stone-800 text-white rounded px-3 py-1">Comparar detalle</button>
            <button onClick={() => setMergeOpenMap(true)}
                    className="text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded px-3 py-1">Fusionar estos 2</button>
            </>
          ) : (
            <span className="text-[11px] text-stone-500">marca 1 mas</span>
          )}
          <button onClick={() => setMergeSel([])} className="text-stone-400 hover:text-stone-700 text-xs">limpiar</button>
        </div>
      )}
      {mergeOpenMap && mergeSel.length === 2 && (
        <MergeModal postA={mergeSel[0]} postB={mergeSel[1]} stageDefs={STAGE_DEFS} incidents={incidents} userNames={userNames}
          onConfirm={async (principalId, secundarioId, stageChoices, keepAddress) => {
            if (onMergePosts) await onMergePosts(principalId, secundarioId, stageChoices, keepAddress);
            setMergeOpenMap(false); setMergeSel([]);
          }}
          onCancel={() => setMergeOpenMap(false)} />
      )}

      {/* Controles */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-0 border border-stone-300 bg-white/90 z-10 rounded-lg overflow-hidden">
        <button onClick={zoomIn} className="w-11 h-11 flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-stone-50 font-mono text-lg">+</button>
        <button onClick={zoomOut} className="w-11 h-11 flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-stone-50 font-mono text-lg border-t border-stone-300">−</button>
        <button onClick={goLastView} className="w-11 h-11 flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-stone-50 border-t border-stone-300" title="Volver a ultima vista">
          <Navigation className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button onClick={fitAll} className="w-11 h-11 flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-stone-50 border-t border-stone-300" title="Ver todos los postes">
          <Home className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button onClick={() => setShowUts(v => !v)}
                className={`w-11 h-11 flex items-center justify-center border-t border-stone-300 font-mono text-[10px] font-bold ${showUts ? 'text-rose-500 bg-rose-50' : 'text-stone-600 hover:text-rose-500 hover:bg-stone-50'}`}
                title="Mostrar Unidades Territoriales">
          UT
        </button>
        <button onClick={() => setShowScout(v => !v)}
                className={`w-11 h-11 flex items-center justify-center border-t border-stone-300 ${showScout ? 'text-rose-500 bg-rose-50' : 'text-stone-600 hover:text-rose-500 hover:bg-stone-50'}`}
                title="Rutas de scouting">
          <Compass className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button onClick={switchTileProvider}
                className="w-11 h-11 flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-stone-50 border-t border-stone-300"
                title={`Mapa base: ${tileProviderLabel}. Cambiar proveedor`}>
          <Layers className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button onClick={() => {
          if (userLoc) { centerOnMe(); return; }
          startGPS();
        }} className={`w-11 h-11 flex items-center justify-center hover:bg-stone-50 border-t border-stone-300 ${userLoc ? 'text-blue-500' : 'text-stone-400'}`} title="Mi ubicación">
          <Navigation className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Tooltip de UT al hover */}
      {utPicker && (
        <>
          <div onClick={() => setUtPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div
            style={{ position: 'fixed', left: Math.max(8, Math.min(utPicker.x, window.innerWidth - 232)), top: Math.max(8, Math.min(utPicker.y, window.innerHeight - (48 + utPicker.options.length * 40))), zIndex: 999 }}
            className="bg-white border border-stone-300 rounded-lg shadow-lg py-1 w-56 max-w-[90vw]"
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-stone-500 border-b border-stone-300">
              Elegi la unidad territorial
            </div>
            {utPicker.options.map(u => (
              <button
                key={u.id}
                onClick={() => { setReviewUt(u); setUtPicker(null); }}
                className="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 truncate"
              >
                {u.nombre}
              </button>
            ))}
          </div>
        </>
      )}
      {reviewUt && (
        <UtReviewPanel
          ut={reviewUt}
          onRefresh={onRefresh}
          stageDefs={STAGE_DEFS}
          posts={(posts || []).filter(p => p.unidad_territorial === reviewUt.id)}
          onClose={() => setReviewUt(null)}
          onPostClick={(post, stageId) => { setReviewUt(null); openPostDetail(post, stageId || null); }}
          onIrAlPunto={(post) => {
            if (typeof post.lng === 'number' && typeof post.lat === 'number' && mapRef.current) {
              mapRef.current.getView().animate({
                center: olFromLonLat([post.lng, post.lat]),
                zoom: 19,
                duration: 800,
              });
            }
            // Abrir el panel de detalles del poste
            if (typeof setSelectedPost === 'function') {
              setSelectedPost(post);
            }
          }}
          onToggleVerificadoCampo={async (postId, value) => {
            const prevPosts = posts;
            setPosts(prev => prev.map(p =>
              p.id === postId
                ? { ...p, verificado_campo: value, verificado_campo_at: value ? new Date().toISOString() : null }
                : p
            ));
            try {
              const { updatePostVerificadoCampo } = await import('./lib/data.js');
              await updatePostVerificadoCampo(postId, value);
            } catch (err) {
              console.error('Error actualizando verificado_campo:', err);
              setPosts(prevPosts);
              alert('Error al actualizar la verificacion en campo. Intenta de nuevo.');
            }
          }}
          onChangeEstado={async (postId, nuevoEstado) => {
            const prevPosts = posts;
            setPosts(prev => prev.map(p =>
              p.id === postId
                ? { ...p, estado_verificacion: nuevoEstado, estado_verificacion_at: new Date().toISOString() }
                : p
            ));
            try {
              const { updatePostEstadoVerificacion } = await import('./lib/data.js');
              await updatePostEstadoVerificacion(postId, nuevoEstado);
            } catch (err) {
              console.error('Error actualizando estado_verificacion:', err);
              setPosts(prevPosts);
              alert('Error al actualizar el estado. Intenta de nuevo.');
            }
          }}
        />
      )}
      {utHoverName && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-white/95 px-3 py-1.5 rounded-full border border-rose-300 text-rose-700 font-mono text-xs shadow-md backdrop-blur-sm pointer-events-none">
          {utHoverName}
        </div>
      )}

      {/* User location badge */}
      {userLoc && (
        <div className="absolute top-4 left-4 bg-white/90 border border-stone-300 px-3 py-2 font-mono text-[12px] z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-blue-400">GPS · ±{userLoc.accuracy}m</span>
          </div>
        </div>
      )}
      {!userLoc && gpsError && (
        <div className="absolute top-4 left-4 bg-white/90 border border-red-300 px-3 py-2 font-mono text-[12px] z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-red-500">⚠ {gpsError}</span>
            <button onClick={startGPS} className="text-blue-500 underline">Reintentar</button>
          </div>
        </div>
      )}

      {/* Buscador de postes — esquina superior izquierda */}
      <div className="absolute top-4 left-4 z-40">
        <MapSearchBox posts={posts} onSelect={focusOnPost} />
      </div>

      {/* Nearby button — baja en móvil para no encimarse con el buscador */}
      <div className="absolute top-16 sm:top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        <button onClick={() => {
          if (!userLoc) { startGPS(); return; }
          setShowNearby(!showNearby);
        }}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-wider border backdrop-blur-sm transition-colors ${
                  showNearby ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/90 border-stone-300 text-stone-600 hover:border-stone-500'
                }`}>
          {!userLoc ? '📍 Activar GPS' : showNearby ? `📍 ${filtered.length} cerca de mí` : '📍 Cerca de mí'}
        </button>
      </div>

      {/* Contador */}
      <div className="absolute bottom-4 left-4 bg-white/90 border border-stone-300 px-4 py-3 font-mono text-xs backdrop-blur-sm z-10">
        <div className="text-stone-500 uppercase tracking-widest text-[12px] mb-1">Mostrando</div>
        <div className="text-rose-500 text-lg font-light">{filtered.length.toLocaleString()}</div>
        <div className="text-stone-500 text-[12px]">de {posts.length.toLocaleString()} postes</div>
      </div>

      {/* Attribution */}
      <div className="absolute bottom-1 right-1 text-[9px] text-stone-400 font-mono z-10">© OSM · CARTO</div>

      {/* Leyenda - colapsable (click en el titulo para abrir/cerrar), oculta en movil */}
      <details open className="hidden sm:block absolute top-4 right-4 bg-white/90 border border-stone-300 px-3 py-2 font-mono text-[12px] z-10 backdrop-blur-sm max-h-[80vh] overflow-auto">
        <summary className="text-stone-500 uppercase tracking-widest cursor-pointer select-none">Leyenda</summary>

        <div className="text-stone-400 text-[10px] uppercase mt-2 mb-1">Etapa (relleno del punto)</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {STAGE_DEFS.map(s => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-stone-600">E{s.num} {s.short}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /><span className="text-stone-600">Completado</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /><span className="text-stone-600">Bloqueado</span></div>
        </div>

        <div className="text-stone-400 text-[10px] uppercase mt-2 mb-1">Verificacion (halo del punto)</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'rgba(85,88,90,0.25)', border: '1.5px solid rgba(85,88,90,0.45)' }} /><span className="text-stone-600">Sin verificar</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'rgba(188,149,92,0.5)', border: '1.5px solid #BC955C' }} /><span className="text-stone-600">Verif. a distancia</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'rgba(159,34,65,0.5)', border: '1.5px solid #9F2241' }} /><span className="text-stone-600">No existe</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-dashed border-stone-500 shrink-0" /><span className="text-stone-600">Revisado</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ border: '2px solid #D946EF' }} /><span className="text-stone-600">Verif. en campo</span></div>
        </div>

        <div className="text-stone-400 text-[10px] uppercase mt-2 mb-1">Otros</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: 'rgba(57,255,20,0.22)', border: '2px solid #39FF14' }} /><span className="text-stone-600">Seleccionado</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" /><span className="text-blue-400">Yo (ubicacion)</span></div>
        </div>
      </details>

      {/* Panel de rutas de scouting */}
      {showScout && (
        <ScoutingRoutePanel
          map={mapRef.current}
          poles={scoutPoles}
          selected={routeSel}
          setSelected={setRouteSel}
          userLoc={userLoc}
          onRequestGPS={startGPS}
          userNames={userNames}
          onClose={() => setShowScout(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// DASHBOARD
// ============================================================================

function Dashboard({ posts, incidents, inventoryTotals, setActiveTab, onNavigatePostes }) {
  const stats = useMemo(() => {
    const stageCount = {};
    STAGE_DEFS.forEach(s => stageCount[s.id] = 0);
    let completados = 0, bloqueados = 0;
    posts.forEach(p => {
      if (p.blocked) { bloqueados++; return; }
      const cur = currentStageOf(p);
      if (cur.state === 'completado') { completados++; return; }
      stageCount[cur.stage.id]++;
    });
    // Also count stages done (funnel)
    const funnel = STAGE_DEFS.map(s => ({
      ...s,
      count: posts.filter(p => p.stages[s.id]?.done).length,
    }));
    return { stageCount, completados, bloqueados, funnel, total: posts.length };
  }, [posts]);

  const pct = (stats.completados / TOTAL_TARGET) * 100;
  const openIncidents = incidents.filter(i => i.status === 'abierta').length;
  const criticalIncidents = incidents.filter(i => i.status === 'abierta' && i.severity === 'alta').length;

  const byUT = useMemo(() => {
    const groups = {};
    posts.forEach(p => {
      if (!groups[p.unidad_territorial]) {
        groups[p.unidad_territorial] = {
          ut: p.unidad_territorial, zona: p.zona_territorial, total: 0, done: 0, blocked: 0,
        };
      }
      groups[p.unidad_territorial].total++;
      if (p.blocked) groups[p.unidad_territorial].blocked++;
      else if (currentStageOf(p).state === 'completado') groups[p.unidad_territorial].done++;
    });
    return Object.values(groups).sort((a, b) => a.ut.localeCompare(b.ut));
  }, [posts]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-end justify-between border-b border-stone-300 pb-4 flex-wrap gap-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-1">Panel de Control</div>
          <h1 className="text-3xl font-light text-stone-950">Avance del proyecto</h1>
          <p className="text-sm text-stone-500 mt-1 font-mono">CI1215 · {posts.length} registrados de {TOTAL_TARGET.toLocaleString()} postes · 7 etapas</p>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-stone-500">Completados</div>
          <div className="text-5xl font-mono font-light text-rose-500 tabular-nums leading-none">
            {pct.toFixed(1)}<span className="text-2xl text-stone-500">%</span>
          </div>
          <div className="text-[12px] text-stone-500 font-mono mt-1">
            {stats.completados.toLocaleString()} de {TOTAL_TARGET.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-stone-100/40 border border-stone-300 p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Avance por etapa</span>
          <span className="text-[12px] font-mono text-stone-500">% de {TOTAL_TARGET.toLocaleString()} meta</span>
        </div>
        <div className="space-y-2">
          {stats.funnel.map((s) => {
            const widthPct = (s.count / TOTAL_TARGET) * 100;
            return (
              <div key={s.id} onClick={() => onNavigatePostes?.({ stage: s.id })}
                   className="flex items-center gap-3 cursor-pointer hover:bg-stone-50/60 rounded px-1 -mx-1 py-0.5 transition-colors">
                <div className="w-28 sm:w-32 flex items-center gap-2 flex-shrink-0">
                  <StageBadge stage={s.id} done={true} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-stone-700 truncate">{s.short}</div>
                    <div className="text-[13px] font-mono text-stone-500">Etapa {s.num}</div>
                  </div>
                </div>
                <div className="flex-1 h-6 bg-stone-50 border border-stone-300 relative overflow-hidden">
                  <div className="h-full transition-all flex items-center justify-end pr-2"
                       style={{ width: `${Math.min(100, Math.max(2, widthPct))}%`, background: `${s.color}40`, borderRight: `2px solid ${s.color}` }}>
                    <span className="text-[12px] font-mono font-bold" style={{ color: s.color }}>
                      {s.count}
                    </span>
                  </div>
                </div>
                <div className="w-12 text-right">
                  <div className="text-xs font-mono tabular-nums text-stone-700">{widthPct.toFixed(0)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Completados" value={stats.completados.toLocaleString()} sub="todos los pasos" accent="#10B981" icon={CheckCircle2}
                  onClick={() => onNavigatePostes?.({ stage: 'completado' })} />
        <StatCard label="Bloqueados" value={stats.bloqueados.toLocaleString()} sub="requieren atención" accent="#EF4444" icon={AlertTriangle}
                  onClick={() => onNavigatePostes?.({ stage: 'bloqueado' })} />
        <StatCard label="Incidencias abiertas" value={openIncidents} sub={`${criticalIncidents} críticas`} accent="#F59E0B" icon={AlertCircle}
                  onClick={() => setActiveTab('incidencias')} />
        <StatCard label="Modems desplegados" value={inventoryTotals.modems.toLocaleString()} sub={`${inventoryTotals.camTotal} cámaras`} accent="#8B5CF6" icon={Package}
                  onClick={() => setActiveTab('inventario')} />
      </div>

      {/* By UT */}
      <div className="bg-stone-100/40 border border-stone-300">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-300">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-500" strokeWidth={1.5} />
            <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Avance por Unidad Territorial</h3>
          </div>
          <button onClick={() => setActiveTab('postes')}
                  className="text-xs font-mono text-stone-500 hover:text-rose-500 flex items-center gap-1">
            Explorar <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {byUT.map(ut => {
            const pctUT = ut.total ? (ut.done / ut.total) * 100 : 0;
            return (
              <div key={ut.ut} onClick={() => onNavigatePostes?.({ ut: ut.ut })}
                   className="px-4 sm:px-5 py-2.5 hover:bg-stone-50/40 border-b border-stone-300/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-rose-500 truncate">{ut.ut}</div>
                    <div className="text-[12px] text-stone-500 font-mono truncate">{ut.zona}</div>
                  </div>
                  <div className="font-mono text-xs text-stone-600 tabular-nums flex-shrink-0">{pctUT.toFixed(0)}%</div>
                  <div className="text-right font-mono text-[12px] text-stone-500 whitespace-nowrap flex-shrink-0">
                    <span className="text-emerald-500">{ut.done}</span>
                    <span className="text-stone-400 mx-1">/</span>
                    {ut.total}
                    {ut.blocked > 0 && <span className="text-red-500 ml-2">⚠{ut.blocked}</span>}
                  </div>
                </div>
                <div className="h-2 bg-stone-50 border border-stone-300 relative mt-1.5">
                  <div className="h-full bg-emerald-500" style={{ width: `${pctUT}%` }} />
                  {ut.blocked > 0 && (
                    <div className="h-full bg-red-500 absolute right-0 top-0" style={{ width: `${(ut.blocked / ut.total) * 100}%` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-stone-100/40 border border-stone-300">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={1.5} />
              <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Incidencias abiertas</h3>
            </div>
            <button onClick={() => setActiveTab('incidencias')}
                    className="text-xs font-mono text-stone-500 hover:text-rose-500">Ver todas</button>
          </div>
          <div className="divide-y divide-stone-300/60 max-h-72 overflow-y-auto">
            {incidents.filter(i => i.status === 'abierta').slice(0, 5).map(i => (
              <div key={i.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-rose-500">{i.postId}</span>
                  <span className={`text-[12px] font-mono uppercase tracking-wider ${
                    i.severity === 'alta' ? 'text-red-500' : i.severity === 'media' ? 'text-rose-500' : 'text-stone-500'
                  }`}>{i.severity}</span>
                </div>
                <div className="text-sm text-stone-700 mt-0.5">{i.type}</div>
                <div className="flex items-center gap-2 text-[12px] text-stone-500 font-mono mt-1">
                  {i.reportedByName && <span>👤 {i.reportedByName}</span>}
                  <span>{new Date(i.createdAt).toLocaleDateString('es-MX')}</span>
                </div>
              </div>
            ))}
            {incidents.filter(i => i.status === 'abierta').length === 0 && (
              <div className="px-5 py-8 text-center text-stone-500 text-sm font-mono">Sin incidencias abiertas</div>
            )}
          </div>
        </div>

        <div className="bg-stone-100/40 border border-stone-300">
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-300">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-violet-500" strokeWidth={1.5} />
              <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Inventario desplegado</h3>
            </div>
            <button onClick={() => setActiveTab('inventario')}
                    className="text-xs font-mono text-stone-500 hover:text-rose-500">Ver detalle</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <Wifi className="w-5 h-5 mx-auto text-pink-400 mb-1" strokeWidth={1.5}/>
                <div className="text-3xl font-mono font-light text-stone-950 tabular-nums">{inventoryTotals.modems}</div>
                <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Modems</div>
              </div>
              <div className="text-center">
                <Camera className="w-5 h-5 mx-auto text-rose-400 mb-1" strokeWidth={1.5}/>
                <div className="text-3xl font-mono font-light text-stone-950 tabular-nums">{inventoryTotals.camTotal}</div>
                <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Cámaras</div>
              </div>
            </div>
            <div className="space-y-1.5 pt-3 border-t border-stone-300">
              <div className="flex items-center justify-between text-[13px] font-mono">
                <span className="text-stone-600">Blanco</span>
                <span className="text-stone-800 tabular-nums">{inventoryTotals.modemsBlanco}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-mono">
                <span className="text-stone-600">Negro</span>
                <span className="text-stone-800 tabular-nums">{inventoryTotals.modemsNegro}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-mono">
                <span className="text-stone-600">Blanco conejito</span>
                <span className="text-pink-300 tabular-nums">{inventoryTotals.modemsConejito}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-mono pt-2 border-t border-stone-300/60 mt-2">
                <span className="text-violet-400">PTZ</span>
                <span className="text-violet-300 tabular-nums">{inventoryTotals.ptz}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-mono">
                <span className="text-sky-400">Bullet</span>
                <span className="text-sky-300 tabular-nums">{inventoryTotals.bullet}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RAAL DASHBOARD — solo E2 (Dado) y E3 (Poste colocado)
// ============================================================================
function RAALDashboard({ posts }) {
  const raalStages = STAGE_DEFS.filter(s => s.id === 'dado' || s.id === 'parado');

  const stats = useMemo(() => {
    const dadoDone = posts.filter(p => p.stages.dado?.done).length;
    const paradoDone = posts.filter(p => p.stages.parado?.done).length;
    const dadoPending = posts.filter(p => !p.stages.dado?.done && !p.blocked).length;
    const paradoPending = posts.filter(p => p.stages.dado?.done && !p.stages.parado?.done && !p.blocked).length;
    const needsConfirm = posts.filter(p => 
      (p.stages.dado?.needsScoutConfirm && !p.stages.dado?.scoutConfirmed) ||
      (p.stages.parado?.needsScoutConfirm && !p.stages.parado?.scoutConfirmed)
    ).length;
    return { dadoDone, paradoDone, dadoPending, paradoPending, needsConfirm, total: posts.length };
  }, [posts]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="border-b border-stone-300 pb-4">
        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-amber-500/80 mb-1">RAAL</div>
        <h1 className="text-2xl font-light text-stone-950">Avance — Dado y Poste colocado</h1>
        <p className="text-sm text-stone-500 mt-1 font-mono">{posts.length} postes registrados</p>
      </div>

      {/* Progress cards */}
      <div className="grid grid-cols-2 gap-4">
        {raalStages.map(s => {
          const done = posts.filter(p => p.stages[s.id]?.done).length;
          const pct = posts.length ? ((done / posts.length) * 100).toFixed(1) : '0.0';
          return (
            <div key={s.id} className="p-5 border border-stone-300 bg-stone-100/40">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <span className="text-xs font-mono uppercase tracking-widest text-stone-700">E{s.num} {s.name}</span>
              </div>
              <div className="text-4xl font-mono font-light tabular-nums" style={{ color: s.color }}>
                {done}
                <span className="text-lg text-stone-400">/{posts.length}</span>
              </div>
              <div className="mt-2 h-2 bg-stone-50 border border-stone-300">
                <div className="h-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
              </div>
              <div className="text-[11px] font-mono text-stone-500 mt-1">{pct}% completado</div>
            </div>
          );
        })}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-2xl font-mono font-light text-blue-500">{stats.dadoPending}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Sin dado</div>
        </div>
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-2xl font-mono font-light text-orange-500">{stats.paradoPending}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Dado sin poste</div>
        </div>
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-2xl font-mono font-light text-rose-500">{stats.needsConfirm}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Por confirmar</div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="border border-stone-300 bg-stone-100/40">
        <div className="px-5 py-3 border-b border-stone-300">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Últimas capturas E2/E3</span>
        </div>
        <div className="divide-y divide-stone-300/50 max-h-60 overflow-y-auto">
          {posts
            .filter(p => p.stages.dado?.done || p.stages.parado?.done)
            .sort((a, b) => {
              const tsA = Math.max(a.stages.dado?.ts ? new Date(a.stages.dado.ts).getTime() : 0, a.stages.parado?.ts ? new Date(a.stages.parado.ts).getTime() : 0);
              const tsB = Math.max(b.stages.dado?.ts ? new Date(b.stages.dado.ts).getTime() : 0, b.stages.parado?.ts ? new Date(b.stages.parado.ts).getTime() : 0);
              return tsB - tsA;
            })
            .slice(0, 10)
            .map(p => (
              <div key={p.id} className="px-5 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-rose-500 font-bold">{p.id}</span>
                  {p.alias && <span className="text-rose-600 text-xs ml-2">"{p.alias}"</span>}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  {p.stages.dado?.done && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">E2 ✓</span>}
                  {p.stages.parado?.done && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">E3 ✓</span>}
                </div>
              </div>
            ))
          }
          {posts.filter(p => p.stages.dado?.done || p.stages.parado?.done).length === 0 && (
            <div className="px-5 py-8 text-center text-stone-500 text-sm">Sin capturas aún</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MI PANEL — Aportaciones del usuario actual
// ============================================================================
function MiPanel({ posts, incidents, profile, userRole, stageDefs }) {
  const userId = profile?.userId;

  // Capturas del usuario (post_stages donde captured_by = userId)
  const myCaptures = useMemo(() => {
    if (!userId) return [];
    const results = [];
    posts.forEach(p => {
      Object.entries(p.stages).forEach(([sid, d]) => {
        if (d.done && d.capturedBy === userId) {
          const sd = stageDefs.find(s => s.id === sid);
          results.push({ postId: p.id, alias: p.alias, stageId: sid, stageName: sd?.name || sid, stageNum: sd?.num, color: sd?.color, ts: d.ts, photo: d.photo });
        }
      });
    });
    return results.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [posts, userId, stageDefs]);

  // Verificaciones del usuario
  const myVerifications = useMemo(() => {
    if (!userId) return [];
    const results = [];
    posts.forEach(p => {
      Object.entries(p.stages).forEach(([sid, d]) => {
        if (d.verified && d.verifiedBy === userId) {
          const sd = stageDefs.find(s => s.id === sid);
          results.push({ postId: p.id, alias: p.alias, stageId: sid, stageName: sd?.name || sid, stageNum: sd?.num, color: sd?.color, ts: d.verifiedAt });
        }
      });
    });
    return results.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [posts, userId, stageDefs]);

  // Incidencias creadas por el usuario
  const myIncidents = useMemo(() => {
    return incidents.filter(i => i.capturedBy === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [incidents, userId]);

  // Resumen de etapas capturadas
  const capturesByStage = useMemo(() => {
    const counts = {};
    myCaptures.forEach(c => {
      counts[c.stageId] = (counts[c.stageId] || 0) + 1;
    });
    return stageDefs.map(s => ({ ...s, count: counts[s.id] || 0 })).filter(s => s.count > 0);
  }, [myCaptures, stageDefs]);

  const today = new Date().toDateString();
  const capturesToday = myCaptures.filter(c => c.ts && new Date(c.ts).toDateString() === today).length;

  // Búsqueda + paginación de "Últimas capturas" (cliente, sin tocar la BD)
  const [capSearch, setCapSearch] = useState('');
  const [capPage, setCapPage] = useState(0);
  const capPageSize = 15;

  const filteredCaptures = useMemo(() => {
    if (!capSearch.trim()) return myCaptures;
    const q = capSearch.toLowerCase();
    return myCaptures.filter(c =>
      c.postId.toLowerCase().includes(q) ||
      (c.alias || '').toLowerCase().includes(q) ||
      (c.stageName || '').toLowerCase().includes(q)
    );
  }, [myCaptures, capSearch]);

  useEffect(() => { setCapPage(0); }, [capSearch]);

  const capTotalPages = Math.max(1, Math.ceil(filteredCaptures.length / capPageSize));
  const capSafePage = Math.min(capPage, capTotalPages - 1);
  const capPageData = filteredCaptures.slice(capSafePage * capPageSize, (capSafePage + 1) * capPageSize);

  return (
    <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
      <div className="border-b border-stone-300 pb-4">
        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-blue-500/80 mb-1">Mi Panel</div>
        <h1 className="text-2xl font-light text-stone-950">{profile?.displayName || 'Usuario'}</h1>
        <p className="text-xs text-stone-500 mt-1 font-mono">{userRole} · Resumen de aportaciones</p>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-3xl font-mono font-light text-blue-500">{myCaptures.length}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Capturas</div>
        </div>
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-3xl font-mono font-light text-emerald-500">{myVerifications.length}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Verificaciones</div>
        </div>
        <div className="p-4 border border-stone-300 bg-stone-100/40 text-center">
          <div className="text-3xl font-mono font-light text-amber-500">{capturesToday}</div>
          <div className="text-[10px] font-mono uppercase text-stone-500 mt-1">Hoy</div>
        </div>
      </div>

      {/* Capturas por etapa */}
      {capturesByStage.length > 0 && (
        <div className="border border-stone-300 bg-stone-100/40">
          <div className="px-4 py-3 border-b border-stone-300">
            <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Capturas por etapa</span>
          </div>
          <div className="p-4 space-y-2">
            {capturesByStage.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-24 flex items-center gap-2 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-xs font-mono text-stone-700">E{s.num}</span>
                </div>
                <div className="flex-1 h-4 bg-stone-50 border border-stone-300 relative">
                  <div className="h-full" style={{ width: `${Math.min(100, (s.count / posts.length) * 100)}%`, background: `${s.color}60`, borderRight: `2px solid ${s.color}` }} />
                </div>
                <span className="text-sm font-mono font-bold w-10 text-right" style={{ color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimas capturas */}
      <div className="border border-stone-300 bg-stone-100/40">
        <div className="px-4 py-3 border-b border-stone-300 flex items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Últimas capturas</span>
          <span className="text-[10px] font-mono text-stone-400 flex-shrink-0">{myCaptures.length} total</span>
        </div>
        {myCaptures.length > 0 && (
          <div className="px-4 py-2 border-b border-stone-300/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" strokeWidth={1.5} />
              <input value={capSearch} onChange={e => setCapSearch(e.target.value)}
                     placeholder="Buscar por poste, alias o etapa…"
                     className="w-full bg-stone-50 border border-stone-300 pl-8 pr-3 py-1.5 text-xs font-mono text-stone-700 placeholder-stone-400 focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
        )}
        <div className="divide-y divide-stone-300/50 max-h-72 overflow-y-auto">
          {capPageData.map((c) => (
            <div key={`${c.postId}-${c.stageId}`} className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm text-rose-500 font-bold flex-shrink-0">{c.postId}</span>
                {c.alias && <span className="text-rose-600 text-[10px] truncate">"{c.alias}"</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: `${c.color}20`, color: c.color }}>
                  E{c.stageNum}
                </span>
                {c.ts && <span className="text-[10px] font-mono text-stone-400">
                  {new Date(c.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                </span>}
              </div>
            </div>
          ))}
          {filteredCaptures.length === 0 && (
            <div className="px-4 py-8 text-center text-stone-500 text-sm">
              {capSearch ? 'Sin resultados para tu búsqueda' : 'Sin capturas aún — ¡a trabajar!'}
            </div>
          )}
        </div>
        {capTotalPages > 1 && (
          <div className="px-4 py-2 border-t border-stone-300/60 flex items-center justify-between">
            <button onClick={() => setCapPage(p => Math.max(0, p - 1))} disabled={capSafePage === 0}
                    className="text-[10px] font-mono uppercase px-2.5 py-1 border border-stone-300 text-stone-600 disabled:opacity-40 enabled:hover:border-blue-500/50 enabled:hover:text-blue-600 transition-colors">‹ Ant</button>
            <span className="text-[10px] font-mono text-stone-500 tabular-nums">{capSafePage + 1} / {capTotalPages}</span>
            <button onClick={() => setCapPage(p => Math.min(capTotalPages - 1, p + 1))} disabled={capSafePage >= capTotalPages - 1}
                    className="text-[10px] font-mono uppercase px-2.5 py-1 border border-stone-300 text-stone-600 disabled:opacity-40 enabled:hover:border-blue-500/50 enabled:hover:text-blue-600 transition-colors">Sig ›</button>
          </div>
        )}
      </div>

      {/* Incidencias reportadas */}
      {myIncidents.length > 0 && (
        <div className="border border-stone-300 bg-stone-100/40">
          <div className="px-4 py-3 border-b border-stone-300 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Mis incidencias</span>
            <span className="text-[10px] font-mono text-stone-400">{myIncidents.length}</span>
          </div>
          <div className="divide-y divide-stone-300/50 max-h-48 overflow-y-auto">
            {myIncidents.slice(0, 10).map(inc => (
              <div key={inc.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs text-rose-500">{inc.postId}</span>
                  <span className="text-xs text-stone-600 ml-2">{inc.type}</span>
                </div>
                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${inc.status === 'abierta' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  {inc.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verificaciones */}
      {myVerifications.length > 0 && (
        <div className="border border-stone-300 bg-stone-100/40">
          <div className="px-4 py-3 border-b border-stone-300 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-stone-600">Mis verificaciones</span>
            <span className="text-[10px] font-mono text-stone-400">{myVerifications.length}</span>
          </div>
          <div className="divide-y divide-stone-300/50 max-h-48 overflow-y-auto">
            {myVerifications.slice(0, 10).map((v, i) => (
              <div key={`${v.postId}-${v.stageId}-${i}`} className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-mono text-sm text-rose-500">{v.postId}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">E{v.stageNum} ✓</span>
                  {v.ts && <span className="text-[10px] font-mono text-stone-400">
                    {new Date(v.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// POSTS LIST
// ============================================================================

const POSTS_PAGE_STORAGE_KEY = 'ci1215-postes-page';

function readStoredPostsPage() {
  try {
    const stored = Number.parseInt(localStorage.getItem(POSTS_PAGE_STORAGE_KEY) || '0', 10);
    return Number.isInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function PostsList({ posts, onSelect, filterCtx, page, setPage, isAdmin, canMerge = false, userNames = {}, incidents = [], onDeletePosts, onMergePosts, readOnly, onCreatePost, onJumpToMap, unidadesTerritoriales = [] }) {
  const { filters } = filterCtx;
  const [search, setSearch] = useState('');
  const [viewType, setViewType] = useState('detalle'); // 'pipeline' | 'detalle'
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [selectedForDelete, setSelectedForDelete] = useState(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 10;

  // Etapa "actual" cuando hay exactamente una seleccionada — para columnas específicas
  const filteredStageDef = filters.stages?.length === 1
    ? STAGE_DEFS.find(s => s.id === filters.stages[0])
    : null;

  const filtered = useMemo(() => {
    const mode = viewType === 'detalle' ? 'list-detalle' : 'list-pipeline';
    let result = filterPosts(posts, filters, STAGE_DEFS, mode, incidents || []);
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
  useEffect(() => { setPage(0); }, [filters, search]);

  const utList = useMemo(() => [...new Set(posts.map(p => p.unidad_territorial))].sort(), [posts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const exportCSV = () => {
    const rows = [
      ['id', 'latitud', 'longitud', 'unidad_territorial', 'zona_territorial', 'direccion', 'etapa_actual', 'etapas_completadas', 'cuadrilla', 'bloqueado'],
      ...filtered.map(p => {
        const cur = currentStageOf(p);
        const curStr = p.blocked ? 'bloqueado' : cur.state === 'completado' ? 'completado' : `E${cur.stage.num} - ${cur.stage.name}`;
        return [
          p.id, p.lat, p.lng, p.unidad_territorial, p.zona_territorial, p.direccion,
          curStr, completedStageCount(p), p.blocked ? 'sí' : 'no'
        ];
      })
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postes_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareWhatsApp = () => {
    if (filtered.length === 0) return;
    const lines = filtered.slice(0, 20).map(p => {
      const cur = currentStageOf(p);
      const estado = p.blocked ? '🔴 Bloqueado' : cur.state === 'completado' ? '✅ Completado' : `${cur.stage.num}. ${cur.stage.name}`;
      return `${p.id} · ${p.unidad_territorial}\n📍 ${p.direccion}\n🗺️ https://maps.google.com/?q=${p.lat},${p.lng}\n📋 ${estado}`;
    });
    const header = `*Coordinación de campo* (${filtered.length} postes${filtered.length > 20 ? ', mostrando primeros 20' : ''})\n\n`;
    const text = header + lines.join('\n\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
      <div className="flex items-end justify-between border-b border-stone-300 pb-4 flex-wrap gap-2">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-1">Catálogo</div>
          <h1 className="text-3xl font-light text-stone-950">Registro de postes</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={shareWhatsApp}
                  className="flex items-center gap-2 px-3 py-2 border border-stone-300 text-stone-600 hover:border-emerald-500/50 hover:text-emerald-500 text-xs font-mono uppercase tracking-widest transition-colors">
            <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} /> WhatsApp
          </button>
          <button onClick={exportCSV}
                  className="flex items-center gap-2 px-3 py-2 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 text-xs font-mono uppercase tracking-widest transition-colors">
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-stretch">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5}/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                 placeholder="Buscar por ID, dirección, UT, zona…"
                 className="w-full h-8 bg-stone-100/60 border border-stone-300 pl-9 pr-3 text-sm text-stone-800 font-mono placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
        </div>
        <FilterBarCollapsible
          posts={posts}
          {...filterCtx}
          stageDefs={STAGE_DEFS}
          userNames={userNames}
          mode="list-detalle"
          menuAlign="left"
          incidents={incidents}
          unidadesTerritoriales={unidadesTerritoriales}
        />
        <div className="text-xs font-mono text-stone-500 ml-auto flex flex-wrap items-center justify-end gap-2">
          {isAdmin && selectedForDelete.size > 0 && (
            <button onClick={async () => {
              if (!window.confirm(`¿Eliminar ${selectedForDelete.size} poste(s)?\n\nSe borrarán etapas, fotos, incidencias y scouting. NO se puede deshacer.`)) return;
              setDeleting(true);
              for (const id of selectedForDelete) { try { await onDeletePosts(id); } catch (e) { console.error(e); } }
              setSelectedForDelete(new Set());
              setDeleting(false);
            }} disabled={deleting}
              className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-[11px] font-medium rounded px-2 h-8">
              {deleting ? '…' : `🗑 Eliminar (${selectedForDelete.size})`}
            </button>
          )}
          {canMerge && selectedForDelete.size === 2 && (
            <button onClick={() => setMergeOpen(true)}
              className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium rounded px-2 h-8">
              Fusionar
            </button>
          )}
          {mergeOpen && selectedForDelete.size === 2 && (() => {
            const _sel = posts.filter(p => selectedForDelete.has(p.id));
            return (
              <MergeModal postA={_sel[0]} postB={_sel[1]} stageDefs={STAGE_DEFS} incidents={incidents} userNames={userNames}
                onConfirm={async (principalId, secundarioId, stageChoices, keepAddress) => {
                  await onMergePosts(principalId, secundarioId, stageChoices, keepAddress);
                  setMergeOpen(false);
                  setSelectedForDelete(new Set());
                }}
                onCancel={() => setMergeOpen(false)} />
            );
          })()}
          {canMerge && filtered.length > 0 && (
            <button onClick={() => {
              if (selectedForDelete.size === pageData.length) setSelectedForDelete(new Set());
              else setSelectedForDelete(new Set(pageData.map(p => p.id)));
            }}
              className="inline-flex items-center h-8 text-[10px] text-stone-400 hover:text-stone-700 border border-stone-300 px-1.5 rounded">
              {selectedForDelete.size === pageData.length ? '☐ Ninguno' : '☑ Página'}
            </button>
          )}
          {filtered.length.toLocaleString()} resultados
          <div className="flex h-8 border border-stone-300 ml-2">
            <button onClick={() => setViewType('pipeline')}
                    className={`flex items-center px-2 text-[12px] font-mono uppercase ${viewType === 'pipeline' ? 'bg-rose-700 text-rose-50' : 'text-stone-500 hover:text-stone-950'}`}>
              Pipeline
            </button>
            <button onClick={() => setViewType('detalle')}
                    className={`flex items-center px-2 text-[12px] font-mono uppercase ${viewType === 'detalle' ? 'bg-rose-700 text-rose-50' : 'text-stone-500 hover:text-stone-950'}`}>
              Detalle
            </button>
          </div>
          {!readOnly && onCreatePost && (
            <button onClick={onCreatePost}
                    className="flex items-center gap-1.5 ml-2 px-3 h-8 bg-rose-700 hover:bg-rose-600 text-white text-[12px] font-mono uppercase tracking-widest transition-colors rounded">
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Table — Pipeline view */}
      {viewType === 'pipeline' && (
      <div className="border border-stone-300 bg-white overflow-x-auto">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-white border-b border-stone-300 text-[12px] font-mono uppercase tracking-[0.15em] text-stone-500">
          <div className="col-span-2">ID</div>
          <div className="col-span-1">UT</div>
          <div className="col-span-3">Dirección</div>
          <div className="col-span-4">Pipeline 1 → 7</div>
          <div className="col-span-2 text-right">Estado</div>
        </div>
        <div>
          {pageData.map(p => (
            <div key={p.id}>
              <div onClick={() => onSelect(p)} className="w-full grid grid-cols-12 gap-2 px-4 py-3 border-b border-stone-300/50 hover:bg-rose-500/5 hover:border-rose-600/20 transition-colors text-left items-center cursor-pointer">
                <div className="col-span-2 font-mono text-sm text-rose-500 flex items-center gap-1.5 flex-wrap">
                  {onJumpToMap && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onJumpToMap(p); }}
                      title="Ver en mapa"
                      className="text-stone-500 hover:text-purple-600 p-0.5 -ml-0.5 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                  <span>{p.id}</span>
                  {p.tags?.length > 0 && <TagBadgeList tags={p.tags} size="xs" limit={2} />}
                </div>
                <div className="col-span-1 font-mono text-xs text-stone-700">{p.unidad_territorial}</div>
                <div className="col-span-3 text-xs text-stone-600 truncate">{p.direccion}</div>
                <div className="col-span-4"><StagePipeline post={p} size="sm" /></div>
                <div className="col-span-2 flex justify-end"><StatusChip post={p} /></div>
              </div>
            </div>
          ))}
          {pageData.length === 0 && (
            <div className="px-4 py-12 text-center text-stone-500 text-sm font-mono">Sin resultados</div>
          )}
        </div>
        </div>
      </div>
      )}

      {/* Table — Detailed view with adaptable columns */}
      {viewType === 'detalle' && (
      <div className="border border-stone-300 bg-white overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: filteredStageDef ? '700px' : '900px' }}>
          <thead className="bg-white border-b border-stone-300 text-[12px] font-mono uppercase tracking-[0.15em] text-stone-500">
            <tr>
              {canMerge && <th className="w-8 px-1 py-2"></th>}
              <th className="text-left px-3 py-2 min-w-[70px]">ID</th>
              <th className="text-left px-3 py-2 min-w-[60px]">UT</th>
              <th className="text-left px-3 py-2 min-w-[120px]">Dirección</th>
              {/* Columnas dinámicas según filtro de etapa */}
              {filteredStageDef ? (
                <>
                  <th className="text-center px-2 py-2" style={{ color: filteredStageDef.color }}>Hecha</th>
                  {filteredStageDef.attributes.filter(a => !a.showWhen).map(a => (
                    <th key={a.key} className="text-left px-2 py-2 min-w-[80px]" style={{ color: filteredStageDef.color }}>{a.label}</th>
                  ))}
                  <th className="text-center px-2 py-2" style={{ color: filteredStageDef.color }}>Foto</th>
                  <th className="text-left px-2 py-2">Quién</th>
                  <th className="text-left px-2 py-2">Fecha</th>
                  <th className="text-center px-2 py-2">Verif.</th>
                </>
              ) : (
                <>
                  {STAGE_DEFS.map(s => (
                    <th key={s.id} className="text-center px-2 py-2 min-w-[70px]" style={{ color: s.color }}>E{s.num}</th>
                  ))}
                  <th className="text-center px-2 py-2">Verif.</th>
                </>
              )}
              <th className="text-left px-2 py-2 hidden lg:table-cell">Último editor</th>
              <th className="text-left px-2 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(p => {
              const isExpanded = expandedPostId === p.id;
              const verifiedCount = STAGE_DEFS.filter(s => p.stages[s.id]?.verified).length;
              const doneCount = STAGE_DEFS.filter(s => p.stages[s.id]?.done).length;
              const photoCount = STAGE_DEFS.filter(s => p.stages[s.id]?.photo).length;

              return (
                <Fragment key={p.id}>
                  <tr onClick={() => setExpandedPostId(isExpanded ? null : p.id)}
                      className={`border-b border-stone-300/50 hover:bg-rose-500/5 hover:border-rose-600/20 cursor-pointer transition-colors ${isExpanded ? 'bg-rose-500/5' : ''}`}>
                    {canMerge && (
                      <td className="px-1 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedForDelete.has(p.id)}
                          onChange={() => setSelectedForDelete(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                          className="w-3.5 h-3.5 accent-red-500" />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-rose-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {onJumpToMap && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onJumpToMap(p); }}
                            title="Ver en mapa"
                            className="text-stone-500 hover:text-purple-600 p-0.5 -ml-0.5 transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                        <span>{postDisplayId(p)}</span>
                        {p.alias && <span className="text-rose-600 text-[10px] font-medium">"{p.alias}"</span>}
                        {p.tags?.length > 0 && (
                          <span className="inline-flex">
                            <TagBadgeList tags={p.tags} size="xs" limit={2} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-stone-700">{p.unidad_territorial}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {p.lat && p.lng ? (
                        <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                           onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700 underline text-xs">
                          📍 {(p.direccion && !p.direccion.startsWith('Lat ') ? p.direccion : `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`).slice(0,30)}
                        </a>
                      ) : <span className="text-stone-600 text-xs">{p.direccion || '—'}</span>}
                    </td>

                    {filteredStageDef ? (
                      <>
                        <td className="px-2 py-2 text-center">
                          {p.stages[filteredStageDef.id]?.done
                            ? <span className="text-emerald-400 font-bold">✓</span>
                            : <span className="text-stone-500">pendiente</span>}
                        </td>
                        {filteredStageDef.attributes.filter(a => !a.showWhen).map(a => {
                          const d = p.stages[filteredStageDef.id];
                          const val = d?.attrs?.[a.key];
                          let display = '—';
                          if (d?.done && val !== undefined && val !== null && val !== '') {
                            if (a.type === 'image' && typeof val === 'string' && val.startsWith('http')) display = <a href={val} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><img src={val} alt="" className="w-8 h-8 object-cover rounded border border-stone-300 hover:border-rose-600 inline-block" /></a>;
                            else if (a.type === 'gps' && val && typeof val === 'object' && val.lat) display = `${Number(val.lat).toFixed(4)},${Number(val.lng).toFixed(4)}`;
                            else if (a.type === 'password') display = '•••••';
                            else if (a.type === 'bullet_orientations') display = (Array.isArray(val) ? val : []).filter(v => v).join(', ') || '—';
                            else if (a.type === 'select' && a.options) {
                              const otherAttr = filteredStageDef.attributes.find(x => x.showWhen?.key === a.key);
                              const otherVal = otherAttr && d?.attrs?.[otherAttr.key];
                              display = String(val) + (val === otherAttr?.showWhen?.value && otherVal ? ` — ${otherVal}` : '');
                            }
                            else if (typeof val === 'boolean') display = val ? '✓' : '✗';
                            else if (typeof val === 'object') display = JSON.stringify(val).slice(0, 25);
                            else display = String(val).slice(0, 25);
                          }
                          return <td key={a.key} className="px-2 py-2 text-stone-700 font-mono text-[13px] whitespace-nowrap">{display}</td>;
                        })}
                        <td className="px-2 py-2 text-center">
                          {p.stages[filteredStageDef.id]?.photo ? (
                            typeof p.stages[filteredStageDef.id]?.photo === 'string' && p.stages[filteredStageDef.id]?.photo.startsWith('http') ? (
                              <a href={p.stages[filteredStageDef.id]?.photo} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                <img src={p.stages[filteredStageDef.id]?.photo} alt="" className="w-8 h-8 object-cover rounded border border-stone-300 hover:border-rose-600 inline-block" />
                              </a>
                            ) : <span className="text-stone-400">—</span>
                          ) : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-2 py-2 text-stone-600 text-[13px] font-mono whitespace-nowrap">
                          {p.stages[filteredStageDef.id]?.capturedBy ? '👤' : '—'}
                        </td>
                        <td className="px-2 py-2 text-stone-500 text-[13px] font-mono whitespace-nowrap">
                          {p.stages[filteredStageDef.id]?.ts
                            ? new Date(p.stages[filteredStageDef.id]?.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {p.stages[filteredStageDef.id]?.verified
                            ? <span className="text-emerald-400">✓</span>
                            : p.stages[filteredStageDef.id]?.done
                              ? <span className="text-rose-400">⏳</span>
                              : <span className="text-stone-400">—</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        {STAGE_DEFS.map(s => {
                          const d = p.stages[s.id];
                          if (!d?.done) return <td key={s.id} className="px-2 py-2 text-center"><span className="text-stone-400">—</span></td>;
                          // Mostrar dato clave de la etapa
                          const attrs = d.attrs || {};
                          let keyVal = '';
                          if (s.id === 'dado' && attrs.tipo_poste) keyVal = attrs.tipo_poste;
                          else if (s.id === 'parado' && attrs.estado_luz) keyVal = attrs.estado_luz === 'Otro' ? attrs.estado_luz_otro || 'Otro' : attrs.estado_luz;
                          else if (s.id === 'camaras') keyVal = `${attrs.cantidad_ptz || 0}P ${attrs.cantidad_bullet || 0}B${attrs.cascajo === 'Con cascajo o basura' ? ' 🟡' : ''}`;
                          else if (s.id === 'internet' && attrs.folio_fibra) keyVal = attrs.folio_fibra;
                          else if (s.id === 'conexion_poste' && attrs.postes_conectados) keyVal = attrs.postes_conectados;
                          else if (s.id === 'centro' && attrs.validado_por) keyVal = attrs.validado_por;
                          else if (attrs.ubicacion_real?.lat) keyVal = '📍';

                          const photoUrl = typeof d.photo === 'string' && d.photo.startsWith('http') ? d.photo : null;
                          return (
                            <td key={s.id} className="px-1 py-1.5 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                {photoUrl ? (
                                  <a href={photoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                    <img src={photoUrl} alt="" className="w-8 h-8 object-cover rounded border border-stone-300 hover:border-rose-600" />
                                  </a>
                                ) : (
                                  <span className="text-emerald-400 text-[12px]">✓</span>
                                )}
                                {keyVal && <span className="text-[13px] font-mono text-stone-600 truncate max-w-[60px]">{keyVal}</span>}
                                {d.verified && <span className="text-blue-400 text-[8px]">✔verif</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center font-mono">
                          <span className={verifiedCount === doneCount && doneCount > 0 ? 'text-emerald-400' : verifiedCount > 0 ? 'text-rose-400' : 'text-stone-500'}>
                            {verifiedCount}/{doneCount}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2 hidden lg:table-cell text-[11px] font-mono text-stone-500 whitespace-nowrap">
                      {(() => {
                        let lastEditor = null, lastTs = 0;
                        STAGE_DEFS.forEach(s => {
                          const d = p.stages[s.id];
                          if (d?.done && d.ts) {
                            const t = new Date(d.ts).getTime();
                            if (t > lastTs) { lastTs = t; lastEditor = d.capturedBy; }
                          }
                        });
                        if (!lastEditor) return '—';
                        const name = userNames[lastEditor] || '?';
                        const date = lastTs ? new Date(lastTs) : null;
                        const ago = date ? `${date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : '';
                        return <span title={name}>{name.split(' ')[0]} <span className="text-stone-400">{ago}</span></span>;
                      })()}
                    </td>
                    <td className="px-2 py-2"><StatusChip post={p} /></td>
                  </tr>

                  {/* Fila expandida — muestra detalle de todas las etapas */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={50} className="bg-amber-50 border-b border-stone-300 px-4 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {STAGE_DEFS.map(s => {
                            const d = p.stages[s.id];
                            if (!d?.done) return (
                              <div key={s.id} onClick={(e) => { e.stopPropagation(); onSelect(p, s.id); }}
                                   className="p-2 border border-stone-300/50 bg-stone-100/20 opacity-50 cursor-pointer hover:opacity-75 hover:border-stone-400">
                                <div className="text-[12px] font-mono" style={{ color: s.color }}>E{s.num} {s.name}</div>
                                <div className="text-[12px] text-stone-500">Pendiente</div>
                              </div>
                            );
                            return (
                              <div key={s.id} onClick={(e) => { e.stopPropagation(); onSelect(p, s.id); }}
                                   className="p-2 border border-stone-300 bg-stone-100/40 cursor-pointer hover:border-rose-400 hover:bg-stone-100/60 transition-colors">
                                <div className="flex items-center justify-between">
                                  <span className="text-[12px] font-mono font-bold" style={{ color: s.color }}>E{s.num} {s.name}</span>
                                  <span className={`text-[13px] font-mono ${d.verified ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {d.verified ? '✓ Verif.' : '⏳'}
                                  </span>
                                </div>
                                {d.ts && <div className="text-[13px] text-stone-500 mt-0.5">{new Date(d.ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })}</div>}
                                {/* Foto thumbnail */}
                                {d.photo && typeof d.photo === 'string' && (
                                  <a href={d.photo} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-block mt-1">
                                    <img src={d.photo} alt="" className="w-12 h-12 object-cover rounded border border-stone-300 hover:border-rose-600" />
                                  </a>
                                )}
                                {/* Atributos */}
                                {d?.attrs && Object.keys(d.attrs).length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {Object.entries(d.attrs).map(([k, v]) => {
                                      const ad = s.attributes.find(a => a.key === k);
                                      if (!ad) return null;
                                      // Respetar showWhen: no mostrar campos condicionales cuya condición no se cumple
                                      if (!showWhenPasses(ad.showWhen, d.attrs)) return null;
                                      let display;
                                      if (ad.type === 'image' && typeof v === 'string' && v.startsWith('http')) {
                                        display = <a href={v} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-block"><img src={v} alt="" className="w-10 h-10 object-cover rounded border border-stone-300 hover:border-rose-600" /></a>;
                                      }
                                      else if (ad.type === 'gps' && v?.lat) display = `${Number(v.lat).toFixed(4)},${Number(v.lng).toFixed(4)}`;
                                      else if (ad.type === 'password') display = '•••••';
                                      else if (ad.type === 'bullet_orientations' && Array.isArray(v)) display = v.filter(x => x).join(', ');
                                      else if (typeof v === 'boolean') display = v ? 'Sí' : 'No';
                                      else display = String(v).slice(0, 30);
                                      return <div key={k} className="text-[13px] font-mono"><span className="text-stone-500">{ad.label}:</span> <span className="text-stone-700">{display}</span></div>;
                                    })}
                                  </div>
                                )}
                                {d.notes && <div className="text-[13px] text-stone-500 mt-1 italic">"{d.notes}"</div>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); onSelect(p); }} className="text-[12px] font-mono text-rose-400 hover:text-rose-300 px-2 py-1 border border-stone-300 hover:border-rose-600/50">
                            Ver detalle completo →
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pageData.length === 0 && (
              <tr><td colSpan={50} className="px-4 py-12 text-center text-stone-500 font-mono">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-mono text-stone-500">
            {filtered.length.toLocaleString()} postes · Página {safePage + 1} de {totalPages}
          </div>
          <div className="flex gap-1">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
            </button>
            <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GPS PARSING & CAPTURE
// ============================================================================

/**
 * Intenta extraer lat/lng de una URL de Google Maps o de texto con coordenadas.
 * Soporta:
 *   - https://www.google.com/maps/place/.../@19.3345,-99.1200,17z
 *   - https://maps.google.com/?q=19.3345,-99.1200
 *   - https://maps.google.com/?ll=19.3345,-99.1200
 *   - https://www.google.com/maps/@19.3345,-99.1200,17z
 *   - "19.3345, -99.1200" (texto plano)
 * No soporta shortlinks (goo.gl/maps, maps.app.goo.gl) porque requieren resolver el redirect.
 */
function parseGoogleMapsLink(text) {
  if (!text) return null;
  const s = text.trim();

  // Shortlink — no se puede resolver sin fetch (CORS)
  if (/goo\.gl\/maps|maps\.app\.goo\.gl/i.test(s)) {
    return { error: 'Los links cortos (goo.gl) no pueden decodificarse automáticamente. Abre el link en el navegador y copia la URL larga.' };
  }

  // Patrones por orden de especificidad
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,               // @lat,lng
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,          // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,         // ?ll=lat,lng
    /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/,     // ?center=lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,           // !3dLAT!4dLNG
    /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/,      // coordenadas puras
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return { error: 'No pude encontrar coordenadas en ese texto.' };
}

/**
 * Componente reutilizable para capturar ubicación GPS.
 * value = { lat, lng, link, accuracy, source }
 */
function GPSField({ value = {}, onChange, color = '#F59E0B' }) {
  const [linkInput, setLinkInput] = useState(value.link || '');
  const [parseMsg, setParseMsg] = useState(null); // {type, text}
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState(null);

  useEffect(() => { setLinkInput(value.link || ''); }, [value.link]);

  const update = (patch) => {
    onChange({ ...value, ...patch });
  };

  const handleExtract = () => {
    const result = parseGoogleMapsLink(linkInput);
    if (!result) {
      setParseMsg({ type: 'error', text: 'Pega primero un link o coordenadas' });
      return;
    }
    if (result.error) {
      setParseMsg({ type: 'error', text: result.error });
      return;
    }
    update({
      lat: result.lat,
      lng: result.lng,
      link: linkInput,
      source: 'link',
      accuracy: null,
    });
    setParseMsg({ type: 'ok', text: `Coordenadas extraídas: ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}` });
    setTimeout(() => setParseMsg(null), 3500);
  };

  // También extraer al pegar
  const handleLinkPaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    setTimeout(() => {
      const result = parseGoogleMapsLink(pasted);
      if (result && !result.error) {
        update({
          lat: result.lat, lng: result.lng,
          link: pasted, source: 'link', accuracy: null,
        });
        setParseMsg({ type: 'ok', text: 'Coordenadas extraídas del link pegado' });
        setTimeout(() => setParseMsg(null), 3500);
      }
    }, 0);
  };

  const handleDeviceCapture = () => {
    if (!navigator.geolocation) {
      setCaptureMsg({ type: 'error', text: 'Este navegador no soporta geolocalización' });
      return;
    }
    setCapturing(true);
    setCaptureMsg({ type: 'info', text: 'Obteniendo ubicación del dispositivo…' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const link = `https://maps.google.com/?q=${latitude},${longitude}`;
        update({
          lat: latitude,
          lng: longitude,
          link,
          source: 'device',
          accuracy: Math.round(accuracy),
        });
        setLinkInput(link);
        setCapturing(false);
        setCaptureMsg({
          type: 'ok',
          text: `Ubicación capturada · precisión ±${Math.round(accuracy)} m`
        });
        setTimeout(() => setCaptureMsg(null), 4000);
      },
      (err) => {
        setCapturing(false);
        let msg = 'No se pudo obtener la ubicación';
        if (err.code === 1) msg = 'Permiso denegado. Permite el acceso a la ubicación en el navegador.';
        else if (err.code === 2) msg = 'Señal no disponible. Intenta salir a un área abierta.';
        else if (err.code === 3) msg = 'Tiempo de espera agotado. Intenta de nuevo.';
        setCaptureMsg({ type: 'error', text: msg });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const hasCoords = value.lat !== undefined && value.lng !== undefined && value.lat !== '' && value.lng !== '';

  return (
    <div className="space-y-3">
      {/* Botón principal: capturar del dispositivo */}
      <button type="button" onClick={handleDeviceCapture} disabled={capturing}
              className="w-full px-4 py-3 border font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{
                background: `${color}10`,
                borderColor: `${color}60`,
                color,
              }}>
        {capturing ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Obteniendo…
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4" strokeWidth={1.5} />
            Usar mi ubicación actual (GPS / Wi-Fi)
          </>
        )}
      </button>
      {captureMsg && (
        <div className={`text-[13px] font-mono px-3 py-2 border ${
          captureMsg.type === 'error' ? 'border-red-500/40 bg-red-500/5 text-red-400' :
          captureMsg.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400' :
          'border-stone-300 bg-stone-200 text-stone-600'
        }`}>
          {captureMsg.text}
        </div>
      )}

      {/* Separador */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-stone-100" />
        <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">o pega link</span>
        <div className="flex-1 h-px bg-stone-100" />
      </div>

      {/* Link de Google Maps */}
      <div>
        <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">
          Link de Google Maps
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onPaste={handleLinkPaste}
            placeholder="https://maps.google.com/?q=..."
            className="flex-1 bg-stone-50 border border-stone-300 px-3 py-2 text-xs text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-rose-600/50"
          />
          <button type="button" onClick={handleExtract}
                  className="px-3 py-2 border border-stone-300 text-stone-700 hover:border-rose-600/50 hover:text-rose-500 text-[13px] font-mono uppercase tracking-wider">
            Extraer
          </button>
        </div>
        {parseMsg && (
          <div className={`mt-2 text-[13px] font-mono px-2 py-1.5 ${
            parseMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'
          }`}>
            {parseMsg.text}
          </div>
        )}
      </div>

      {/* Separador */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-stone-100" />
        <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">o edita manualmente</span>
        <div className="flex-1 h-px bg-stone-100" />
      </div>

      {/* Lat / Lng manuales */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">
            Latitud
          </label>
          <input
            type="number" step="any"
            value={value.lat ?? ''}
            onChange={e => update({ lat: e.target.value === '' ? '' : parseFloat(e.target.value), source: 'manual' })}
            placeholder="19.334567"
            className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono tabular-nums focus:outline-none focus:border-rose-600/50"
          />
        </div>
        <div>
          <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">
            Longitud
          </label>
          <input
            type="number" step="any"
            value={value.lng ?? ''}
            onChange={e => update({ lng: e.target.value === '' ? '' : parseFloat(e.target.value), source: 'manual' })}
            placeholder="-99.123456"
            className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono tabular-nums focus:outline-none focus:border-rose-600/50"
          />
        </div>
      </div>

      {/* Estado actual */}
      {hasCoords && (
        <div className="p-3 bg-stone-100/60 border border-stone-300">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Ubicación registrada</span>
            <span className="text-[12px] font-mono uppercase tracking-wider"
                  style={{ color: value.source === 'device' ? '#10B981' : value.source === 'link' ? '#F59E0B' : '#A1A1AA' }}>
              {value.source === 'device' ? `📡 Dispositivo${value.accuracy ? ` · ±${value.accuracy}m` : ''}` :
               value.source === 'link' ? '🔗 Link' : '✏️ Manual'}
            </span>
          </div>
          <div className="font-mono text-sm text-stone-800 tabular-nums">
            {typeof value.lat === 'number' ? value.lat.toFixed(6) : value.lat}°, {typeof value.lng === 'number' ? value.lng.toFixed(6) : value.lng}°
          </div>
          <a href={`https://maps.google.com/?q=${value.lat},${value.lng}`} target="_blank" rel="noopener noreferrer"
             className="mt-1 inline-flex items-center gap-1 text-[13px] font-mono text-rose-500 hover:underline">
            Abrir en Google Maps <ArrowUpRight className="w-3 h-3" strokeWidth={1.5}/>
          </a>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BULLET CAMERA ORIENTATIONS — lista dinámica según cantidad_bullet
// ============================================================================

function BulletOrientationsField({ count, value, onChange, color = '#F59E0B' }) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const current = Array.isArray(value) ? value : [];

  // Sincroniza la longitud del array cuando cambia el conteo
  useEffect(() => {
    if (current.length === safeCount) return;
    const next = [];
    for (let i = 0; i < safeCount; i++) next.push(current[i] || '');
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCount]);

  if (safeCount === 0) {
    return (
      <div className="px-3 py-2.5 border border-dashed border-stone-300 bg-stone-100 text-[13px] text-stone-500 font-mono italic">
        Declara al menos una cámara Bullet para capturar su orientación.
      </div>
    );
  }

  const updateAt = (idx, val) => {
    const next = [...current];
    while (next.length < safeCount) next.push('');
    next[idx] = val;
    onChange(next.slice(0, safeCount));
  };

  return (
    <div className="space-y-1.5">
      {Array.from({ length: safeCount }).map((_, i) => {
        const filled = !!(current[i] && current[i].trim());
        return (
          <div key={i} className="flex items-stretch gap-2">
            <div className="flex-shrink-0 w-16 px-2 py-2 border text-[12px] font-mono uppercase tracking-wider flex items-center gap-1.5"
                 style={{
                   background: filled ? `${color}10` : '#18181B',
                   borderColor: filled ? `${color}40` : '#27272A',
                   color: filled ? color : '#71717A',
                 }}>
              <Camera className="w-3 h-3" strokeWidth={1.5} />
              B{i + 1}
            </div>
            <input
              type="text"
              value={current[i] || ''}
              onChange={e => updateAt(i, e.target.value)}
              placeholder={`Hacia… (ej. Av. Reforma, esquina sur)`}
              className="flex-1 bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-rose-600/50"
            />
          </div>
        );
      })}
      <div className="text-[12px] font-mono text-stone-500 mt-1">
        Las cámaras PTZ no requieren orientación (rotan 360°).
      </div>
    </div>
  );
}

// ============================================================================
// STAGE EDITOR (inside drawer)
// ============================================================================

// Mantenimiento editable dentro del editor de etapa (sincronizado con Scouting)
// E4 (camaras) → Silicón M1 ; E6 (conexion_poste) → Antena/PoE M2 ; E7 pendiente
const STAGE_MAINT = {
  camaras: {
    fase: 'm1_mantenimiento', title: '🔧 Silicón (M1)',
    items: [
      ['sil_corona_1', 'Corona 1'], ['sil_corona_2', 'Corona 2'],
      ['sil_brazo_izq', 'Brazo izq'], ['sil_brazo_der', 'Brazo der'],
      ['sil_acrilico', 'Acrílico'],
    ],
  },
  conexion_poste: {
    fase: 'm2_poe_alineacion', title: '📡 Antena y PoE (M2)',
    items: [
      ['e6_inyector', 'Conectar antena a inyector'], ['e6_alinear', 'Alinear antena'],
    ],
  },
};

function StageEditor({ post, stage, onUpdate, onClose, onCreateIncident, incidents }) {
  const existing = post.stages[stage.id] || {};
  const formKey = `stage_${post.id}_${stage.id}`;
  const saved = useMemo(() => getPersistedForm(formKey), [formKey]);

  const [attrs, setAttrs] = useState(() => {
    if (saved?.attrs) return saved.attrs;
    if (existing.attrs && Object.keys(existing.attrs).length > 0) return existing.attrs;
    const initial = {};
    (stage.attributes || []).forEach(a => {
      if (a.default !== undefined) initial[a.key] = a.default;
    });
    return initial;
  });
  const [notes, setNotes] = useState(saved?.notes ?? existing.notes ?? '');
  const [checks, setChecks] = useState((stage.checks || []).map(() => false));
  const existingPhotos = normalizePhotoUrls([...(Array.isArray(existing.photos) ? existing.photos : []), existing.photo]);
  const [photoAdded, setPhotoAdded] = useState(saved?.photoAdded ?? (existingPhotos.length > 0));
  const [photoFiles, setPhotoFiles] = useState([]);
  const [showPwd, setShowPwd] = useState(false);

  // Mantenimiento de esta etapa (silicón / antena-PoE), sincronizado con Scouting
  const maintCfg = STAGE_MAINT[stage.id] || null;
  const [maintChecks, setMaintChecks] = useState(() => {
    const prev = existing.attrs?.mantenimiento?.[maintCfg?.fase]?.checks || {};
    const init = {};
    if (maintCfg) for (const [id] of maintCfg.items) {
      const c = prev[id];
      init[id] = { result: c?.result || null, notas: c?.notas || '', photos: Array.isArray(c?.photos) ? c.photos : [] };
    }
    return init;
  });
  const [maintPhotoFiles, setMaintPhotoFiles] = useState({}); // { [id]: File[] }
  const setMaintCheck = (id, field, val) => setMaintChecks(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }));

  // Auto-save form state
  useEffect(() => {
    const state = { attrs, notes, photoAdded };
    persistForm(formKey, state);
    return onBackgroundSave(formKey, () => state);
  }, [formKey, attrs, notes, photoAdded]);

  const handlePhotoFile = (files) => {
    setPhotoFiles(Array.isArray(files) ? files : []);
  };
  const [showEscalate, setShowEscalate] = useState(false);
  const [incCats, setIncCats] = useState([]); const [incCatalog, setIncCatalog] = useState([]); const [incCatalogLoading, setIncCatalogLoading] = useState(false);
  const [incSev, setIncSev] = useState('media');
  const [incUserNote, setIncUserNote] = useState('');
  const [incSubmitting, setIncSubmitting] = useState(false);
  const stageIncidents = (incidents || []).filter(i => i.postId === post.id && i.stageId === stage.id);

  const canSave = () => true; // Todos los campos son opcionales

  const handleSave = async () => {
    try {
      // Subir fotos nuevas. Si alguna falla, no cerrar ni marcar como guardado.
      const uploadedUrls = [...existingPhotos];
      for (const file of photoFiles) {
        const url = await uploadStagePhoto(post.id, stage.id, file);
        uploadedUrls.push(url);
      }
      const attrsWithPhotos = withStagePhotoUrls(attrs, uploadedUrls);

      // Mantenimiento: subir fotos nuevas de cada check y fusionar en attrs.mantenimiento
      if (maintCfg) {
        const prevMant = (attrs.mantenimiento && typeof attrs.mantenimiento === 'object' && !Array.isArray(attrs.mantenimiento)) ? attrs.mantenimiento : {};
        const mergedChecks = {};
        let anyTouched = false;
        const allMaintPhotos = [];
        // Categoria comodin del catalogo para checks en problema (resuelta una vez)
        let _genCatId = null;
        try { const _cats = await fetchIncidentCategories(); _genCatId = (_cats || []).find(x => x.code === 'incidencia_general' || x.name === 'Incidencia general')?.id || null; } catch (err) { console.error('maint catalog resolve failed', err); }
        for (const [id, label] of maintCfg.items) {
          const c = maintChecks[id] || {};
          const newFiles = maintPhotoFiles[id] || [];
          const uploaded = [];
          for (const f of newFiles) {
            const u = await uploadStagePhoto(post.id, `scout_${id}`, f);
            uploaded.push(u);
          }
          const photos = normalizePhotoUrls([...(c.photos || []), ...uploaded]);
          allMaintPhotos.push(...photos);
          if (c.result || c.notas || photos.length) {
            anyTouched = true;
            mergedChecks[id] = { label, result: c.result || 'ok', notas: c.notas || '', photos };
            // crear incidencia si el check quedó en problema
            if (c.result === 'problema' && onCreateIncident) {
              const _maintNote = maintCfg.title + ' - ' + label + (c.notas ? (': ' + c.notas) : ''); try { if (_genCatId) { await onCreateIncident({ postId: post.id, categoryIds: [_genCatId], description: _maintNote, severity: 'alta', stageId: stage.id, sourceNote: c.notas || '', userNote: _maintNote }); } else { await onCreateIncident({ postId: post.id, type: label, description: c.notas || label, severity: 'alta', stageId: stage.id, sourceNote: c.notas || '' }); } } catch {}
            }
          }
        }
        if (anyTouched) {
          const totalReq = maintCfg.items.length;
          const doneCount = Object.keys(mergedChecks).length;
          const hasProblems = Object.values(mergedChecks).some(c => c.result === 'problema');
          attrsWithPhotos.mantenimiento = {
            ...prevMant,
            [maintCfg.fase]: {
              fase: maintCfg.fase,
              fecha: new Date().toISOString(),
              resultado: hasProblems ? 'observacion' : 'ok',
              completo: doneCount >= totalReq,
              avance: `${doneCount}/${totalReq}`,
              checks: mergedChecks,
            },
          };
          // anexar fotos de mantenimiento a la galería de la etapa (photos/photo y __photo_urls)
          for (const u of allMaintPhotos) if (!uploadedUrls.includes(u)) uploadedUrls.push(u);
          attrsWithPhotos.__photo_urls = withStagePhotoUrls(attrsWithPhotos, uploadedUrls).__photo_urls;
        }
      }

      const updated = {
        ...post,
        stages: {
          ...post.stages,
          [stage.id]: {
            ...existing,
            done: true,
            ts: Date.now(),
            photo: uploadedUrls[0] || null,
            photos: uploadedUrls,
            notes,
            attrs: attrsWithPhotos,
          },
        },
        lastUpdate: Date.now(),
      };
      onUpdate(updated);
      clearPersistedForm(formKey);
      onClose();
    } catch (e) {
      alert('No se pudo guardar la etapa porque una foto no terminó de subir.\n\n' + (e?.message || e));
    }
  };

  const handleUndo = () => {
    if (!window.confirm(`¿Deshacer E${stage.num} ${stage.name} en ${post.id}?\n\nLa etapa se marcará como pendiente. Los datos capturados se conservan por si necesitas re-completarla.`)) return;
    clearPersistedForm(formKey);
    const updated = {
      ...post,
      stages: {
        ...post.stages,
        [stage.id]: { ...existing, done: false, ts: null, verified: false, verifiedBy: null, verifiedAt: null },
      },
      lastUpdate: Date.now(),
    };
    onUpdate(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-amber-50 border border-stone-300 max-w-md w-full max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-stone-300" style={{ borderBottomColor: `${stage.color}40` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <StageBadge stage={stage.id} done={existing.done} active={!existing.done} size="md" />
              <div>
                <div className="text-[12px] font-mono uppercase tracking-[0.25em]" style={{ color: stage.color }}>
                  Etapa {stage.num} · {post.id}
                </div>
                <h2 className="text-lg font-light text-stone-950">{stage.name}</h2>
              </div>
            </div>
            <button onClick={onClose} className="text-stone-500 hover:text-stone-950 p-1">
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-xs text-stone-600">{stage.desc}</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Photo — con upload real */}
          {existingPhotos.length > 0 && (
            <div className="p-3 border border-stone-300 bg-stone-100/40">
              <div className="text-[12px] font-mono uppercase text-stone-500 mb-2">Fotos registradas</div>
              <div className="grid grid-cols-3 gap-2">
                {existingPhotos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-24 object-cover rounded border border-stone-300 hover:border-rose-600" />
                  </a>
                ))}
              </div>
            </div>
          )}
          <PhotoField photoReq={stage.photoReq} photoAdded={photoAdded} onToggle={setPhotoAdded}
                      color={stage.color} onFilesChange={handlePhotoFile} />

          {/* Stage-specific attributes */}
          {(stage.attributes || []).length > 0 && (
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">Datos de la etapa</div>
              <div className="space-y-3">
                {stage.attributes.map(a => {
                  if (!showWhenPasses(a.showWhen, attrs)) return null;
                  return (
                  <div key={a.key}>
                    <label className="text-xs text-stone-600 font-mono flex items-center gap-1.5 mb-1.5">
                      {a.label}
                      {a.required && <span className="text-rose-500">*</span>}
                      {a.sensitive && <Lock className="w-3 h-3 text-rose-500" strokeWidth={1.5}/>}
                    </label>
                    {a.type === 'image' ? (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-stone-400 rounded-lg cursor-pointer hover:bg-stone-100 transition-colors">
                          <Camera className="w-5 h-5 text-stone-500" />
                          <span className="text-sm text-stone-600">{attrs[a.key] && typeof attrs[a.key] === 'string' && attrs[a.key].startsWith('http') ? 'Cambiar foto' : 'Tomar foto'}</span>
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                                 onChange={async (e) => {
                                   const file = e.target.files?.[0];
                                   if (!file) return;
                                   try {
                                     const url = await uploadStagePhoto('cascajo', a.key + '-' + Date.now(), file);
                                     setAttrs(prev => ({...prev, [a.key]: url}));
                                   } catch(err) { alert('Error subiendo foto: ' + (err?.message || err)); }
                                 }} />
                        </label>
                        {attrs[a.key] && typeof attrs[a.key] === 'string' && attrs[a.key].startsWith('http') && (
                          <a href={attrs[a.key]} target="_blank" rel="noopener noreferrer">
                            <img src={attrs[a.key]} alt="Foto" className="w-full h-32 object-cover rounded border border-stone-300 hover:border-rose-600" />
                          </a>
                        )}
                      </div>
                    ) : a.type === 'select' ? (
                      <select value={attrs[a.key] || ''} onChange={e => setAttrs({...attrs, [a.key]: e.target.value})}
                              className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                        <option value="">— Seleccionar —</option>
                        {a.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : a.type === 'gps' ? (
                      <GPSField value={attrs[a.key] || {}}
                                onChange={v => setAttrs({...attrs, [a.key]: v})}
                                color={stage.color} />
                    ) : a.type === 'bullet_orientations' ? (
                      <BulletOrientationsField
                        count={attrs[a.dependsOn] ?? 0}
                        value={attrs[a.key] || []}
                        onChange={v => setAttrs({...attrs, [a.key]: v})}
                        color={stage.color} />
                    ) : a.type === 'boolean' ? (
                      <button onClick={() => setAttrs({...attrs, [a.key]: !attrs[a.key]})}
                              className={`w-full px-3 py-2 border text-sm font-mono text-left flex items-center gap-2 transition-colors ${
                                attrs[a.key]
                                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
                                  : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-500'
                              }`}>
                        {attrs[a.key] ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.5}/> : <div className="w-4 h-4 border border-stone-300"/>}
                        Sí, confirmo
                      </button>
                      ) : a.type === 'multicheck' ? (
                      <div className="space-y-1.5">
                        {a.options.map(o => {
                          const sel = Array.isArray(attrs[a.key]) ? attrs[a.key] : [];
                          const on = sel.includes(o.value);
                          return (
                            <button key={o.value} type="button"
                              onClick={() => setAttrs({ ...attrs, [a.key]: on ? sel.filter(v => v !== o.value) : [...sel, o.value] })}
                              className={`w-full px-3 py-2 border text-sm font-mono text-left flex items-center gap-2 transition-colors ${
                                on ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600'
                                  : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-500'
                              }`}>
                              {on ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.5}/> : <div className="w-4 h-4 border border-stone-300"/>}
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : a.type === 'number' ? (
                      <input type="number" value={attrs[a.key] ?? ''}
                             onChange={e => setAttrs({...attrs, [a.key]: e.target.value === '' ? '' : Math.max(a.min ?? 0, Number(e.target.value))})}
                             placeholder={a.placeholder} min={a.min ?? 0}
                             className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50" />
                    ) : a.type === 'password' ? (
                      <div className="relative">
                        <input type={showPwd ? 'text' : 'password'} value={attrs[a.key] || ''}
                               onChange={e => setAttrs({...attrs, [a.key]: e.target.value})}
                               placeholder={a.placeholder}
                               className="w-full bg-stone-50 border border-stone-300 pl-3 pr-10 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50" />
                        <button type="button" onClick={() => setShowPwd(!showPwd)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-950 p-1">
                          {showPwd ? <EyeOff className="w-4 h-4" strokeWidth={1.5}/> : <Eye className="w-4 h-4" strokeWidth={1.5}/>}
                        </button>
                      </div>
                    ) : (
                      <input type="text" value={attrs[a.key] || ''} onChange={e => setAttrs({...attrs, [a.key]: e.target.value})}
                             placeholder={a.placeholder}
                             className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50" />
                    )}
                  </div>
                ); })}
              </div>
            </div>
          )}

          {/* Mantenimiento de la etapa (silicón / antena-PoE) */}
          {maintCfg && (
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">{maintCfg.title}</div>
              <div className="space-y-3">
                {maintCfg.items.map(([id, label]) => {
                  const c = maintChecks[id] || {};
                  const files = maintPhotoFiles[id] || [];
                  return (
                    <div key={id} className="p-3 border border-stone-300 bg-stone-100/40 rounded-lg">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium text-stone-800">{label}</span>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button type="button" onClick={() => setMaintCheck(id, 'result', c.result === 'ok' ? null : 'ok')}
                                  className={`px-2 py-1 text-xs font-mono border transition-colors ${c.result === 'ok' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700' : 'bg-stone-50 border-stone-300 text-stone-500 hover:border-emerald-400'}`}>✓ Hecho</button>
                          <button type="button" onClick={() => setMaintCheck(id, 'result', c.result === 'problema' ? null : 'problema')}
                                  className={`px-2 py-1 text-xs font-mono border transition-colors ${c.result === 'problema' ? 'bg-red-500/15 border-red-500 text-red-700' : 'bg-stone-50 border-stone-300 text-stone-500 hover:border-red-400'}`}>⚠ Problema</button>
                        </div>
                      </div>
                      {(c.photos || []).length > 0 && (
                        <div className="flex gap-1.5 mb-2 flex-wrap">
                          {c.photos.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`f${i + 1}`} className="w-12 h-12 object-cover rounded border border-stone-300 hover:border-rose-600" />
                            </a>
                          ))}
                        </div>
                      )}
                      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-stone-400 rounded-lg cursor-pointer hover:bg-stone-100 transition-colors mb-2">
                        <Camera className="w-4 h-4 text-stone-500" />
                        <span className="text-xs text-stone-600">{files.length ? `${files.length} foto(s) nueva(s)` : 'Agregar foto (opcional)'}</span>
                        <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                               onChange={e => { const fs = Array.from(e.target.files || []); setMaintPhotoFiles(prev => ({ ...prev, [id]: [...(prev[id] || []), ...fs] })); e.target.value = ''; }} />
                      </label>
                      <input type="text" value={c.notas || ''} onChange={e => setMaintCheck(id, 'notas', e.target.value)}
                             placeholder="Nota (opcional)"
                             className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Checklist (solo si la etapa define checks) */}
          {(stage.checks || []).length > 0 && (
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" strokeWidth={1.5}/> Checklist obligatorio
              </div>
              <div className="space-y-2">
                {stage.checks.map((check, i) => (
                  <button key={i} onClick={() => setChecks(c => c.map((v, idx) => idx === i ? !v : v))}
                          className={`w-full px-3 py-2.5 border text-sm text-left flex items-center gap-3 transition-colors ${
                            checks[i]
                              ? 'bg-emerald-500/5 border-emerald-500/40 text-stone-800'
                              : 'bg-stone-100/40 border-stone-300 text-stone-600 hover:border-stone-500'
                          }`}>
                    <div className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 ${
                      checks[i] ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300'
                    }`}>
                      {checks[i] && <CheckCircle2 className="w-3 h-3 text-stone-950" strokeWidth={3}/>}
                    </div>
                    {check}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Observaciones + escalar a incidencia */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Observaciones</div>
              {stageIncidents.length > 0 && (
                <span className="text-[12px] font-mono uppercase tracking-wider px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30">
                  {stageIncidents.length} {stageIncidents.length === 1 ? 'incidencia' : 'incidencias'}
                </span>
              )}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                      placeholder="Opcional: anota algo sobre esta etapa…"
                      className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-rose-600/50 resize-none" />

            {!showEscalate && (
              <button onClick={async () => { setShowEscalate(true); if (incCatalog.length === 0) { setIncCatalogLoading(true); try { setIncCatalog(await fetchIncidentCategories()); } catch (err) { console.error('fetch catalog failed', err); } finally { setIncCatalogLoading(false); } } }}
                      className="mt-4 w-full px-4 py-3 border-2 border-red-500 bg-red-100 text-red-700 hover:bg-red-100 hover:border-red-500 text-sm font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors rounded-lg font-bold">
                <AlertTriangle className="w-5 h-5" strokeWidth={2}/>
                Reportar incidencia
              </button>
            )}
            {showEscalate && (
              <div className="mt-2 p-3 border border-red-500/30 bg-red-500/5 space-y-2">
                <div className="text-[12px] font-mono uppercase tracking-widest text-red-400">
                  Nueva incidencia ligada a E{stage.num} · {stage.short}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {incCatalogLoading && <span className="text-[11px] text-stone-400 font-mono">Cargando catalogo...</span>}
                  {!incCatalogLoading && incCatalog.length === 0 && <span className="text-[11px] text-stone-400 font-mono">Sin catalogo disponible</span>}
                  {incCatalog.map(cat => {
                    const sel = incCats.includes(cat.id);
                    return (
                      <button key={cat.id} type="button"
                              onClick={() => setIncCats(prev => prev.includes(cat.id) ? prev.filter(x => x !== cat.id) : [...prev, cat.id])}
                              className={'px-2 py-1 text-[11px] font-mono border transition-colors ' + (sel ? 'bg-red-500/20 border-red-500/60 text-red-300' : 'border-stone-300 text-stone-600 hover:border-stone-500')}>
                        {cat.name}{cat.bloquea ? ' *' : ''}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className="block text-[11px] text-red-400 font-mono mb-1">Nota explicativa *</label>
                  <textarea value={incUserNote} onChange={e => setIncUserNote(e.target.value)}
                            rows={2} placeholder="Describe qué observas y por qué es un problema…"
                            className="w-full bg-stone-50 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-red-500/50 resize-none" />
                </div>
                <div className="flex gap-1.5">
                  {['baja', 'media', 'alta'].map(sev => (
                    <button key={sev} onClick={() => setIncSev(sev)}
                            className={`flex-1 px-2 py-1.5 text-[12px] font-mono uppercase tracking-wider border transition-colors ${
                              incSev === sev
                                ? (sev === 'alta' ? 'bg-red-500/15 border-red-500/50 text-red-500'
                                  : sev === 'media' ? 'bg-rose-500/15 border-rose-600/50 text-rose-500'
                                  : 'bg-stone-200/30 border-stone-300 text-stone-700')
                                : 'border-stone-300 text-stone-500 hover:border-stone-500'
                            }`}>{sev}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowEscalate(false); setIncUserNote(''); }}
                          className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-stone-500 text-[12px] font-mono uppercase tracking-wider">
                    Cancelar
                  </button>
                  <button onClick={async () => {
                    if (incCats.length === 0) { alert('Selecciona al menos una categoria del catalogo.'); return; } if (!incUserNote.trim()) {
                      alert('La nota explicativa es obligatoria.');
                      return;
                    }
                    setIncSubmitting(true);
                    try {
                    if (onCreateIncident) {
                      const created = await onCreateIncident({
                        postId: post.id, categoryIds: incCats, description: incUserNote.trim(),
                        severity: incSev,
                        stageId: stage.id, sourceNote: notes.trim() || '',
                        userNote: incUserNote.trim(),
                      });
                      alert('Incidencia(s) registrada(s): ' + (created?.count || 1));
                    } else {
                      alert('Incidencia(s) registrada(s) (' + incSev + ')');
                    }
                    setShowEscalate(false);
                    setIncCats([]);
                    setIncUserNote('');
                    } catch (e) {
                      console.error('create incident failed', e);
                    } finally {
                      setIncSubmitting(false);
                    }
                  }}
                          disabled={incSubmitting || !incUserNote.trim() || incCats.length === 0}
                          className="flex-1 px-3 py-1.5 bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 disabled:opacity-30 text-[12px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" strokeWidth={1.5}/> {incSubmitting ? 'Creando...' : 'Crear incidencia'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {existing.done && (
              <button onClick={handleUndo}
                      className="px-4 py-2.5 border border-stone-300 text-stone-600 hover:border-red-500/50 hover:text-red-500 text-xs font-mono uppercase tracking-widest transition-colors">
                Deshacer
              </button>
            )}
            <button onClick={handleSave} disabled={!canSave()}
                    className="flex-1 px-4 py-2.5 disabled:opacity-30 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    style={{
                      background: canSave() ? stage.color : '#27272A',
                      color: canSave() ? '#fff' : '#52525B',
                    }}>
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.5}/>
              {existing.done ? 'Actualizar' : 'Marcar etapa completa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// POST DETAIL DRAWER
// ============================================================================

function ZoomablePhoto({ src, alt = '', thumbClass = 'w-6 h-6', borderClass = 'border-stone-300 hover:border-rose-600' }) {
  const [hover, setHover] = useState(false);
  const [locked, setLocked] = useState(false);
  const show = hover || locked;
  return (
    <span className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <img src={src} alt={alt}
        onClick={(e) => { e.stopPropagation(); setLocked((v) => !v); }}
        className={`${thumbClass} object-cover rounded border ${borderClass} inline-block cursor-zoom-in`} />
      {show && (
        <div onClick={(e) => { e.stopPropagation(); setLocked(false); setHover(false); }}
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${locked ? 'bg-black/75' : 'bg-black/40 pointer-events-none'}`}>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()}
            className={`max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl ${locked ? 'cursor-zoom-out' : ''}`} />
          {locked && <div className="fixed top-4 right-4 text-white/90 text-xs font-mono bg-black/50 px-2 py-1 rounded">Clic fuera para cerrar</div>}
        </div>
      )}
    </span>
  );
}

function PostDetailDrawer({ post, onClose, onUpdate, onUpdateMeta, incidents, onCreateIncident, viewMode, userNames = {}, isAdmin = false, onVerifyStage, onUnverifyStage, onDelete, initialStageId, onStartEditPosition, onRequestRelocate, canViewHistory = false, historyRefreshKey, onOpenAntena, onToggleRevisado }) {
  const [editingStage, setEditingStage] = useState(() => initialStageId ? (STAGE_DEFS.find(s => s.id === initialStageId) || null) : null);
  const [notes, setNotes] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockType, setBlockType] = useState('');
  const [blockDesc, setBlockDesc] = useState('');
  const [blockDetail, setBlockDetail] = useState('');
  const [blockUserNote, setBlockUserNote] = useState('');
  const [showReubForm, setShowReubForm] = useState(false);
  const [reubLat, setReubLat] = useState('');
  const [reubLng, setReubLng] = useState('');
  const [blockSev, setBlockSev] = useState('media');
  const [showPassword, setShowPassword] = useState({});
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasValue, setAliasValue] = useState(post.alias || '');
  const [editingNum, setEditingNum] = useState(false);
  const [numValue, setNumValue] = useState(post.numPoste ?? '');
  const [editingIps, setEditingIps] = useState(false);
  const [ipsDraft, setIpsDraft] = useState({});
  const [savingIps, setSavingIps] = useState(false);
  const [ipsError, setIpsError] = useState(null);
  const [confirmingDeleteIps, setConfirmingDeleteIps] = useState(false);
  const [deletingIps, setDeletingIps] = useState(false);
  const handleStartEditIps = async () => {
    setIpsError(null);
    try {
      const { getEquiposForPost } = await import('./lib/data.js');
      const fresh = await getEquiposForPost(post.id);
      const draft = {};
      ['antena_5ac', 'antena_ap', 'camara_ptz', 'camara_bullet_1', 'camara_bullet_2', 'boton_panico'].forEach(k => {
        draft[k] = fresh[k] ? { ...fresh[k] } : { ip: null, no_instalado: false, motivo: null };
      });
      setIpsDraft(draft);
      setEditingIps(true);
    } catch (err) {
      setIpsError('No se pudo cargar IPs: ' + (err?.message || err));
    }
  };
  const handleDeleteIps = async () => {
    setDeletingIps(true); setIpsError(null);
    try {
      const { unassignIpsFromPost } = await import('./lib/data.js');
      await unassignIpsFromPost(post.id);
      const cp = { ...(post.stages.conexion_poste || {}) };
      const cpAttrs = { ...(cp.attrs || {}) };
      delete cpAttrs.modem_origen; delete cpAttrs.equipos; delete cpAttrs.asignado_por_user_id; delete cpAttrs.asignado_at;
      const e5 = { ...(post.stages.internet || {}) };
      const e5Attrs = { ...(e5.attrs || {}) };
      delete e5Attrs.no_aplica; delete e5Attrs.recibe_internet_de;
      onUpdate({ ...post, stages: { ...post.stages, conexion_poste: { ...cp, done: false, attrs: cpAttrs }, internet: { ...e5, done: false, attrs: e5Attrs } } });
      setConfirmingDeleteIps(false);
      setEditingIps(false);
    } catch (err) {
      setIpsError('No se pudo eliminar: ' + (err?.message || err));
    } finally {
      setDeletingIps(false);
    }
  };
  const handleSaveIps = async () => {
    setSavingIps(true); setIpsError(null);
    try {
      const mod = post.stages.conexion_poste.attrs.modem_origen;
      const { assignIpsToPost } = await import('./lib/data.js');
      await assignIpsToPost(post.id, mod, ipsDraft);
      const cp = post.stages.conexion_poste;
      onUpdate({ ...post, stages: { ...post.stages, conexion_poste: { ...cp, done: true, attrs: { ...cp.attrs, equipos: ipsDraft } } } });
      setEditingIps(false);
    } catch (err) {
      setIpsError(err?.message || String(err));
    } finally {
      setSavingIps(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const h = await getPostHistory(post.id);
      setHistory(h);
    } catch (e) {
      console.error('Failed to load history', e);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const cur = currentStageOf(post);
  const postIncidents = incidents.filter(i => i.postId === post.id);

  // assignCrew removed — users work individually, not in crews

  const toggleBlock = () => {
    if (post.blocked) {
      onUpdate({ ...post, blocked: false, blockReason: null, lastUpdate: Date.now() });
    } else {
      setShowBlockForm(true);
    }
  };

  const submitBlock = async () => {
    if (!blockType) return;
    if (!blockUserNote.trim()) {
      alert('La nota explicativa es obligatoria.');
      return;
    }
    const cat = INCIDENT_CATEGORIES.find(c => c.key === blockType);
    const typeName = blockType === 'otro' ? (blockDesc.trim() || 'Otro') : (cat?.label || blockType);
    const autoSev = ['no_hay_poste', 'poste_caido', 'vandalismo', 'sin_electricidad'].includes(blockType) ? 'alta'
      : ['faltan_camaras', 'camara_rota', 'sin_internet', 'modem_danado', 'cable_cortado'].includes(blockType) ? 'media' : 'baja';
    // Atomic: creates incident + blocks post in one RPC call
    try {
      await onCreateIncident({
        postId: post.id,
        type: typeName,
        description: blockDetail.trim() || typeName,
        severity: autoSev,
        blockPost: !post.blocked,  // no re-bloquear si ya está bloqueado
        userNote: blockUserNote.trim(),
      });
      onUpdate({ ...post, blocked: true, lastUpdate: Date.now() }, true);
      setShowBlockForm(false);
      setBlockType('');
      setBlockDesc('');
      setBlockDetail('');
      setBlockUserNote('');
    } catch (e) {
      console.error('block incident failed', e);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex" onClick={onClose}>
        <div className="flex-1 bg-black/40 backdrop-blur-sm" />
        <div className="w-full max-w-xl bg-amber-50 border-l border-stone-300 h-full overflow-y-auto"
             onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-amber-50 border-b border-stone-300 z-10">
            <div className="px-6 py-4 flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-rose-400/80">Poste</div>
                <h2 className="text-2xl font-mono font-light text-rose-500">{postDisplayId(post)}</h2>
                <div className="text-[10px] font-mono text-stone-400">ID interno: {post.id}</div>
                <div className="text-[10px] font-mono text-stone-400">Creado por: {post.createdBy ? (userNames[post.createdBy] || 'Usuario') : (post.origen === 'carga_arcgis' ? '📥 Carga ArcGIS' : '—')}</div>
                {post.stages?.conexion_poste?.attrs?.avance_con_pendientes ? (
                  <div className="mt-2 text-[12px] leading-snug font-mono text-amber-900 bg-amber-200 border border-amber-500 border-l-4 border-l-amber-700 rounded px-2.5 py-1.5">
                    ⚠️ Avanzó a la fase de red (IPs) sin completar: {(post.stages.conexion_poste.attrs.avance_con_pendientes || []).map((s, i) => { const d = STAGE_DEFS.find(x => x.id === s); return <span key={s} style={{ color: d?.color }} className="font-semibold">{i > 0 ? ', ' : ''}{d ? ('E' + d.num + ' ' + d.name) : s}</span>; })}
                    {(post.stages.conexion_poste.attrs.avance_override_nombre || userNames[post.stages.conexion_poste.attrs.avance_override_por]) ? (' - por ' + (post.stages.conexion_poste.attrs.avance_override_nombre || userNames[post.stages.conexion_poste.attrs.avance_override_por])) : ''}
                    {post.stages.conexion_poste.attrs.avance_override_at ? (' - ' + new Date(post.stages.conexion_poste.attrs.avance_override_at).toLocaleDateString('es-MX')) : ''}
                  </div>
                ) : null}
                {/* PASO_11_REVISADO_UI: estado de revision + boton (solo admin) */}
                {(() => {
                  const isRevisado = !!post.revisado;
                  const revAt = post.revisado_at || post.revisadoAt;
                  const revBy = post.revisado_por_user_id || post.revisadoPorUserId;
                  const revByName = revBy ? (userNames[revBy] || 'Usuario') : null;
                  const fmt = (iso) => {
                    if (!iso) return '';
                    try {
                      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                    } catch { return iso; }
                  };
                  if (isRevisado) {
                    return (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded">
                          ✓ Revisado{revByName ? ` por ${revByName}` : ''}{revAt ? ` el ${fmt(revAt)}` : ''}
                        </span>
                        {isAdmin && onToggleRevisado && (
                          <button onClick={() => onToggleRevisado(post)}
                                  className="text-[11px] font-mono text-stone-500 hover:text-rose-600 underline">
                            Desmarcar
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (isAdmin && onToggleRevisado) {
                    return (
                      <div className="mt-1.5">
                        <button onClick={() => onToggleRevisado(post)}
                                className="text-[11px] font-mono uppercase tracking-widest px-3 py-1 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded">
                          ✓ Marcar revisado
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* Alias — editable */}
                {editingAlias ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input type="text" value={aliasValue} onChange={e => setAliasValue(e.target.value)}
                           placeholder="Ej: Frente a la escuela"
                           className="flex-1 bg-stone-50 border-2 border-rose-400 rounded px-2 py-1 text-sm text-stone-950 font-medium focus:outline-none" autoFocus />
                    <button onClick={() => {
                      if (onUpdateMeta) onUpdateMeta(post.id, { alias: aliasValue.trim() });
                      else if (onUpdate) onUpdate({ ...post, alias: aliasValue.trim() });
                      setEditingAlias(false);
                    }} className="text-emerald-600 text-xs font-bold px-2 py-1 bg-emerald-100 rounded">✓</button>
                    <button onClick={() => { setEditingAlias(false); setAliasValue(post.alias || ''); }}
                            className="text-stone-500 text-xs px-2 py-1">✗</button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2 cursor-pointer group" onClick={() => onUpdate && setEditingAlias(true)}>
                    {post.alias ? (
                      <span className="text-sm text-rose-600 font-medium">"{post.alias}"</span>
                    ) : (
                      <span className="text-xs text-stone-400 italic">Sin alias — toca para agregar</span>
                    )}
                    <Edit2 className="w-3 h-3 text-stone-400 opacity-50 group-hover:opacity-100" />
                  </div>
                )}
                {/* NÃºmero de poste (#N) â€” editable */}
                {editingNum ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-stone-500 font-mono">N° poste:</span>
                    <input type="number" value={numValue} onChange={e => setNumValue(e.target.value)}
                           placeholder="Ej: 5" autoFocus
                           className="w-20 bg-stone-50 border-2 border-rose-400 rounded px-2 py-1 text-sm text-stone-950 font-mono focus:outline-none" />
                    <button onClick={() => {
                      const parsed = numValue === '' || numValue === null ? null : parseInt(numValue, 10);
                      if (onUpdateMeta) onUpdateMeta(post.id, { numPoste: parsed });
                      else if (onUpdate) onUpdate({ ...post, numPoste: parsed });
                      setEditingNum(false);
                    }} className="text-emerald-600 text-xs font-bold px-2 py-1 bg-emerald-100 rounded">âœ“</button>
                    <button onClick={() => { setEditingNum(false); setNumValue(post.numPoste ?? ''); }}
                            className="text-stone-500 text-xs px-2 py-1">âœ—</button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2 cursor-pointer group" onClick={() => onUpdate && setEditingNum(true)}>
                    <span className="text-xs text-stone-500 font-mono">N° poste:</span>
                    {post.numPoste != null ? (
                      <span className="text-sm text-stone-700 font-mono font-bold">#{post.numPoste}</span>
                    ) : (
                      <span className="text-xs text-stone-400 italic">Sin número — toca para agregar</span>
                    )}
                    <Edit2 className="w-3 h-3 text-stone-400 opacity-50 group-hover:opacity-100" />
                  </div>
                )}
                <div className="mt-1 text-xs text-stone-500 font-mono">
                  {post.unidad_territorial} Â· {post.zona_territorial}
                </div>
                {/* Dirección con Maps link */}
                <div className="mt-0.5 text-xs truncate">
                  {post.lat && post.lng ? (
                    <a href={`https://www.google.com/maps?q=${post.lat},${post.lng}`} target="_blank" rel="noopener noreferrer"
                       className="text-blue-500 hover:text-blue-700 underline">
                      📍 {(post.direccion && !post.direccion.startsWith('Lat ') ? post.direccion : `${Number(post.lat).toFixed(5)}, ${Number(post.lng).toFixed(5)}`)}
                    </a>
                  ) : (
                    <span className="text-stone-600">{post.direccion || 'Sin dirección'}</span>
                  )}
                </div>
                {/* Reubicado badge + coordenadas originales */}
                {post.reubicado && (
                  <div className="mt-1.5 p-2 bg-purple-50 border border-purple-200 rounded">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">📍 REUBICADO</span>
                    </div>
                    {post.latOriginal && post.lngOriginal && (
                      <div className="text-[13px] text-stone-600">
                        <span className="text-stone-500">Ubicación original: </span>
                        <a href={`https://www.google.com/maps?q=${post.latOriginal},${post.lngOriginal}`} target="_blank" rel="noopener noreferrer"
                           className="text-purple-500 hover:text-purple-700 underline">
                          {Number(post.latOriginal).toFixed(5)}, {Number(post.lngOriginal).toFixed(5)}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button onClick={onClose} className="text-stone-500 hover:text-stone-950 p-2">
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
              <StatusChip post={post} />
              <span className="text-[12px] font-mono text-stone-500">
                {post.unidad_territorial || 'Sin UT'}
              </span>
            </div>
            {/* Pipeline header */}
            <div className="px-6 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Pipeline</span>
                <span className="text-[12px] font-mono text-stone-500">{completedStageCount(post)} / {STAGE_DEFS.length} etapas</span>
              </div>
              <StagePipeline post={post} size="md" onStageClick={s => setEditingStage(s)} />
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Blocked banner */}
            {post.blocked && (
              <div className="border border-red-500/40 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={1.5}/>
                  <span className="text-sm font-mono uppercase tracking-widest text-red-500">Bloqueado</span>
                </div>
                <div className="text-sm text-stone-700">{post.blockReason}</div>
                <button onClick={toggleBlock}
                        className="mt-3 px-3 py-1.5 border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-mono uppercase tracking-wider">
                  Desbloquear
                </button>
              </div>
            )}

            {/* Antena de internet (movido desde el mapa) */}
            {onOpenAntena && post.stages?.internet?.done && (() => {
              const isRecuperada = post.antenaRecuperada === true || post.antena_recuperada === true;
              return (
                <div className="border border-blue-200 bg-blue-50/60 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
                    <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Antena de internet</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      isRecuperada
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {isRecuperada ? '✓ Antena recuperada' : '⚠ Antena sin recuperar'}
                    </span>
                    {onOpenAntena && (
                      <button onClick={() => onOpenAntena(post)}
                              className="text-xs font-mono px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded">
                        {isRecuperada ? 'Editar' : 'Recuperar antena'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* GPS */}
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1">Coordenadas GPS</div>
              <div className="font-mono text-sm text-stone-800 tabular-nums">
                {post.lat.toFixed(6)}°, {post.lng.toFixed(6)}°
              </div>
              <div className="flex gap-3 mt-1">
                <a href={`https://maps.google.com/?q=${post.lat},${post.lng}`} target="_blank" rel="noopener noreferrer"
                   className="text-xs font-mono text-rose-500 hover:underline flex items-center gap-1">
                  Google Maps <ArrowUpRight className="w-3 h-3" strokeWidth={1.5}/>
                </a>
                <button onClick={() => copyToClipboard(`${post.lat},${post.lng}`)}
                        className="text-xs font-mono text-stone-500 hover:text-stone-950 flex items-center gap-1">
                  <Copy className="w-3 h-3" strokeWidth={1.5}/> Copiar
                </button>
                <button onClick={() => {
                  const txt = `${post.id} · ${post.direccion}\nhttps://maps.google.com/?q=${post.lat},${post.lng}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
                }} className="text-xs font-mono text-emerald-500 hover:underline flex items-center gap-1">
                  <Share2 className="w-3 h-3" strokeWidth={1.5}/> WhatsApp
                </button>
              </div>
            </div>

            {/* Crew assignment */}
            {/* UT info */}
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-2">Unidad territorial</div>
              <div className="text-sm text-stone-800 font-mono">{post.unidad_territorial || 'SIN-CAT'}</div>
            </div>

            {/* Next action */}
            {!post.blocked && cur.state === 'pendiente' && (
              <div className="border p-4" style={{ borderColor: `${cur.stage.color}60`, background: `${cur.stage.color}08` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-mono uppercase tracking-widest" style={{ color: cur.stage.color }}>
                      Siguiente acción
                    </div>
                    <div className="text-sm text-stone-950 mt-1">E{cur.stage.num} · {cur.stage.name}</div>
                    <div className="text-xs text-stone-600 mt-1">{cur.stage.desc}</div>
                  </div>
                  <cur.stage.Icon className="w-6 h-6 flex-shrink-0" style={{ color: cur.stage.color }} strokeWidth={1.5}/>
                </div>
                <button onClick={() => setEditingStage(cur.stage)}
                        className="mt-3 w-full px-4 py-2 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                        style={{ background: cur.stage.color, color: '#fff' }}>
                  <Plus className="w-4 h-4" strokeWidth={1.5}/> Registrar avance
                </button>
              </div>
            )}

            {/* Stage history */}
            <div>
              <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">Historial de etapas</div>
              <div className="space-y-2">
                {STAGE_DEFS.map(s => {
                  const d = post.stages[s.id];
                  const stagePhotos = normalizePhotoUrls([...(Array.isArray(d.photos) ? d.photos : []), d.photo]);
                  const stageOpenInc = incidents.filter(i => i.postId === post.id && i.stageId === s.id && i.status === 'abierta').length;
                  return (
                    <div key={s.id} onClick={() => setEditingStage(s)} role="button" tabIndex={0}
                            className={`w-full text-left border transition-colors cursor-pointer ${
                              stageOpenInc > 0
                                ? 'border-red-500/30 hover:border-red-500/50 bg-red-500/5'
                                : d.done
                                ? 'border-stone-300 hover:border-stone-500 bg-stone-100/40'
                                : 'border-stone-300 hover:border-stone-500 bg-stone-100/20 opacity-60'
                            }`}>
                      <div className="p-3 flex items-start gap-3">
                        <StageBadge stage={s.id} done={d.done} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm text-stone-800 flex items-center gap-2">
                              {s.name}
                              {stageOpenInc > 0 && (
                                <span className="text-[12px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2}/>
                                  {stageOpenInc}
                                </span>
                              )}
                            </div>
                            {d.done && (
                              <span className="text-[12px] font-mono text-stone-500 flex-shrink-0">
                                {new Date(d.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                              </span>
                            )}
                          </div>
                          {d.done ? (
                            <>
                              <div className="text-[12px] font-mono text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                {d.capturedBy && userNames[d.capturedBy] && (
                                  <span className="text-stone-600">👤 {userNames[d.capturedBy]}</span>
                                )}
                                {stagePhotos.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    {stagePhotos.slice(0, 4).map((url, idx) => (
                                      <ZoomablePhoto key={url} src={url} alt={`Foto ${idx + 1}`} thumbClass="w-6 h-6" />
                                    ))}
                                    {stagePhotos.length > 4 && <span className="text-[10px] text-stone-500">+{stagePhotos.length - 4}</span>}
                                    {isAdmin && onUpdate && (
                                      <button onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!window.confirm('¿Eliminar las fotos de esta etapa?')) return;
                                        for (const url of stagePhotos) {
                                          try { await deleteStagePhoto(url); } catch (err) { console.warn('Storage delete:', err); }
                                        }
                                        const updated = { ...post, stages: { ...post.stages, [s.id]: { ...d, photo: null, photos: [] } }, lastUpdate: Date.now() };
                                        onUpdate(updated);
                                      }} className="text-[10px] text-red-400 hover:text-red-600" title="Quitar fotos">✕</button>
                                    )}
                                  </span>
                                )}
                                {d.photo && typeof d.photo === 'string' && !d.photo.startsWith('http') && <span>📷</span>}
                                {d.verified ? (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    ✓ Verificado
                                    {d.verifiedBy && userNames[d.verifiedBy] && (
                                      <span className="text-stone-500">por {userNames[d.verifiedBy]}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-rose-500/60">⏳ Sin verificar</span>
                                )}
                              </div>
                              {isAdmin && d.done && (
                                <div className="mt-1">
                                  {!d.verified ? (
                                    <button onClick={(e) => { e.stopPropagation(); onVerifyStage?.(post.id, s.id); }}
                                            className="text-[12px] font-mono uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                      Verificar
                                    </button>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); onUnverifyStage?.(post.id, s.id); }}
                                            className="text-[12px] font-mono uppercase tracking-wider px-2 py-0.5 bg-stone-100 border border-stone-300 text-stone-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
                                      Quitar verificación
                                    </button>
                                  )}
                                </div>
                              )}
                              {Object.keys(d.attrs || {}).length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {Object.entries(d.attrs).map(([k, v]) => {
                                    const attrDef = s.attributes.find(a => a.key === k);
                                    if (!attrDef) return null;
                                    const isSensitive = attrDef.sensitive;
                                    const showing = showPassword[`${s.id}:${k}`];

                                    // GPS type: render as block with link
                                    if (attrDef.type === 'gps' && v && v.lat !== undefined && v.lng !== undefined) {
                                      return (
                                        <div key={k} className="text-[13px] font-mono">
                                          <div className="flex items-center gap-2">
                                            <span className="text-stone-500">{attrDef.label}:</span>
                                            <span className="text-stone-700 tabular-nums">
                                              {Number(v.lat).toFixed(6)}°, {Number(v.lng).toFixed(6)}°
                                            </span>
                                            <span className="text-[13px] uppercase tracking-wider"
                                                  style={{ color: v.source === 'device' ? '#10B981' : v.source === 'link' ? '#F59E0B' : '#71717A' }}>
                                              {v.source === 'device' ? `📡${v.accuracy ? ` ±${v.accuracy}m` : ''}` :
                                               v.source === 'link' ? '🔗' : '✏️'}
                                            </span>
                                          </div>
                                          <a href={v.link || `https://maps.google.com/?q=${v.lat},${v.lng}`}
                                             target="_blank" rel="noopener noreferrer"
                                             onClick={(e) => e.stopPropagation()}
                                             className="text-rose-500 hover:underline flex items-center gap-1 mt-0.5">
                                            Abrir en Maps <ArrowUpRight className="w-3 h-3" strokeWidth={1.5}/>
                                          </a>
                                        </div>
                                      );
                                    }

                                    // Bullet orientations: lista
                                    if (attrDef.type === 'bullet_orientations') {
                                      const list = Array.isArray(v) ? v.filter(x => x && x.trim()) : [];
                                      if (list.length === 0) return null;
                                      return (
                                        <div key={k} className="text-[13px] font-mono">
                                          <span className="text-stone-500">{attrDef.label}:</span>
                                          <div className="mt-1 ml-2 space-y-0.5">
                                            {list.map((o, i) => (
                                              <div key={i} className="flex items-start gap-2">
                                                <span className="text-rose-500/70 text-[12px] flex-shrink-0 mt-px">B{i + 1}:</span>
                                                <span className="text-stone-700">{o}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div key={k} className="flex items-center gap-2 text-[13px] font-mono">
                                        <span className="text-stone-500">{attrDef.label}:</span>
                                        {typeof v === 'boolean' ? (
                                          <span className={v ? 'text-emerald-500' : 'text-red-500'}>
                                            {v ? '✓ Sí' : '✗ No'}
                                          </span>
                                        ) : isSensitive ? (
                                          <>
                                            <span className="text-rose-500">
                                              {showing ? v : '••••••••'}
                                            </span>
                                            <button onClick={(e) => { e.stopPropagation(); setShowPassword({...showPassword, [`${s.id}:${k}`]: !showing}); }}
                                                    className="text-stone-500 hover:text-stone-950">
                                              {showing ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); copyToClipboard(v); }}
                                                    className="text-stone-500 hover:text-stone-950">
                                              <Copy className="w-3 h-3"/>
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-stone-700">{String(v)}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {d.notes && (
                                <div className="mt-1 text-[13px] text-stone-500 italic">"{d.notes}"</div>
                              )}
                              {d.attrs?.mantenimiento && typeof d.attrs.mantenimiento === 'object' && (
                                <div className="mt-2 space-y-2">
                                  {Object.entries(d.attrs.mantenimiento).map(([faseKey, fase]) => {
                                    if (!fase || typeof fase !== 'object') return null;
                                    const faseTitle = { m1_mantenimiento: 'M1 · Mantenimiento', m2_poe_alineacion: 'M2 · PoE y alineación', m3_centro: 'M3 · Centro' }[faseKey] || faseKey;
                                    const mChecks = (fase.checks && typeof fase.checks === 'object') ? fase.checks : {};
                                    return (
                                      <div key={faseKey} className="border border-sky-300 bg-sky-50/50 rounded p-2" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between">
                                          <span className="text-[12px] font-mono uppercase tracking-wider text-sky-700">🔧 {faseTitle}</span>
                                          <span className="text-[11px] font-mono text-sky-600">{fase.avance || ''}{fase.completo ? ' ✓' : ''}</span>
                                        </div>
                                        <div className="mt-1 space-y-1">
                                          {Object.entries(mChecks).map(([cid, c]) => (
                                            <div key={cid} className="text-[12px] font-mono flex items-start gap-2">
                                              <span className={c?.result === 'problema' ? 'text-red-500' : 'text-emerald-600'}>{c?.result === 'problema' ? '⚠' : '✓'}</span>
                                              <span className="text-stone-600 flex-shrink-0">{c?.label || cid}:</span>
                                              <span className="text-stone-700 flex-1">{c?.notas || '—'}</span>
                                              {Array.isArray(c?.photos) && c.photos.length > 0 && (
                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                  {c.photos.slice(0, 3).map((url, i) => (
                                                    <ZoomablePhoto key={url} src={url} alt={`f${i + 1}`} thumbClass="w-5 h-5" borderClass="border-sky-300 hover:border-sky-500" />
                                                  ))}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        {fase.notas && <div className="mt-1 text-[12px] text-stone-500 italic">"{fase.notas}"</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-[12px] font-mono text-stone-500 mt-0.5">Sin iniciar</div>
                          )}
                        </div>
                        <Edit2 className="w-3.5 h-3.5 text-stone-500 flex-shrink-0 mt-1" strokeWidth={1.5}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {post.stages?.conexion_poste?.attrs?.modem_origen && (
              <div className="border border-stone-300 rounded-md p-3 mb-2 bg-stone-50/40">
                <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">IPs asignadas</div>
                <div className="text-[12px] font-mono text-stone-600 mb-2">Módem origen: <span className="text-stone-900 font-semibold">{post.stages.conexion_poste.attrs.modem_origen}</span></div>
                <div className="space-y-1.5">
                  {[
                    { key: 'antena_5ac', label: 'Antena 5AC' },
                    { key: 'antena_ap', label: 'Antena AP' },
                    { key: 'camara_ptz', label: 'Cámara PTZ' },
                    { key: 'camara_bullet_1', label: 'Cámara Bullet 1' },
                    { key: 'camara_bullet_2', label: 'Cámara Bullet 2' },
                    { key: 'boton_panico', label: 'Botón de Pánico' },
                  ].map(eq => {
                    const e = post.stages.conexion_poste.attrs.equipos?.[eq.key] || {};
                    return (
                      <div key={eq.key} className="flex items-center justify-between gap-2 p-2 bg-white border border-stone-200">
                        <span className="font-mono text-xs text-stone-700 flex-shrink-0">{eq.label}</span>
                        {e.no_instalado
                          ? <span className="font-mono text-xs text-stone-400 italic">No instalado</span>
                          : <span className="font-mono text-xs text-emerald-700">{e.ip || '-'}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Incidents */}
            {postIncidents.length > 0 && (
              <div>
                <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">Incidencias</div>
                <div className="space-y-2">
                  {postIncidents.map(i => (
                    <div key={i.id} className="p-3 bg-stone-100/40 border border-stone-300">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-rose-500">{i.id}</span>
                        <span className={`text-[12px] font-mono uppercase ${
                          i.status === 'abierta' ? 'text-red-500' : 'text-emerald-500'
                        }`}>{i.status}</span>
                      </div>
                      <div className="text-sm text-stone-700 mt-1">{i.type}</div>
                      {i.userNote && (
                        <div className="text-xs text-stone-600 mt-1 bg-stone-50 border-l-2 border-stone-300 pl-2 py-1">{i.userNote}</div>
                      )}
                      {!i.userNote && i.description && (
                        <div className="text-xs text-stone-500 mt-1">{i.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-stone-400 font-mono">
                        {i.reportedByName && <span>👤 {i.reportedByName}</span>}
                        <span>{new Date(i.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Block/unblock */}
            {!showBlockForm && (
              <button onClick={() => setShowBlockForm(true)}
                      className="w-full px-4 py-2.5 border border-stone-300 text-stone-600 hover:border-red-500/50 hover:text-red-500 text-xs font-mono uppercase tracking-widest transition-colors">
                {post.blocked ? 'Añadir incidencia' : 'Reportar bloqueo'}
              </button>
            )}
            {showBlockForm && (
              <div className="border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                <div className="text-[12px] font-mono uppercase tracking-widest text-red-400">Reportar incidencia</div>
                {/* Category selector */}
                <div className="grid grid-cols-2 gap-1.5">
                  {INCIDENT_CATEGORIES.map(cat => (
                    <button key={cat.key} onClick={() => { setBlockType(cat.key); if (cat.key !== 'otro') setBlockDesc(prev => prev || ''); }}
                      className={`px-2 py-2 text-[13px] font-medium rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                        blockType === cat.key ? `${cat.color} border-current shadow-sm` : 'border-stone-300 text-stone-600 hover:border-stone-400'
                      }`}>
                      <span>{cat.emoji}</span> {cat.label}
                    </button>
                  ))}
                </div>
                {/* Custom type input for "Otro" */}
                {blockType === 'otro' && (
                  <input type="text" value={blockDesc} onChange={e => setBlockDesc(e.target.value)}
                         placeholder="Escribe el tipo de problema…"
                         className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 rounded focus:outline-none focus:border-red-500/50" />
                )}
                {/* Description — works for all types */}
                <textarea value={blockDetail} onChange={e => setBlockDetail(e.target.value)}
                          rows={2} placeholder="Detalle adicional (opcional)…"
                          className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-red-500/50 resize-none rounded" />
                {/* Mandatory user note */}
                <div>
                  <label className="block text-[11px] text-red-500 font-mono mb-1">Nota explicativa *</label>
                  <textarea value={blockUserNote} onChange={e => setBlockUserNote(e.target.value)}
                            rows={2} placeholder="Describe qué observas y por qué levantas esta incidencia…"
                            className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-red-500/50 resize-none rounded" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowBlockForm(false)}
                          className="px-3 py-2 border border-stone-300 text-stone-600 hover:border-stone-500 text-xs font-mono uppercase tracking-wider rounded">Cancelar</button>
                  <button onClick={submitBlock} disabled={!blockType || !blockUserNote.trim()}
                          className="flex-1 px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-500 hover:bg-red-500/30 disabled:opacity-30 text-xs font-mono uppercase tracking-wider rounded">
                    Reportar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reubicar poste — solo admin */}
          {isAdmin && onUpdate && (
            <div className="mt-4 pt-4 border-t border-stone-300 space-y-2">
              {onStartEditPosition && !showReubForm && (
                <button onClick={() => { onClose(); onStartEditPosition(post.id); }}
                  className="w-full px-4 py-2.5 border border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 text-xs font-mono uppercase tracking-widest transition-colors rounded flex items-center justify-center gap-2">
                  🎯 Mover en mapa (drag)
                </button>
              )}
              {!showReubForm ? (
                <button onClick={() => { setShowReubForm(true); setReubLat(''); setReubLng(''); }}
                  className="w-full px-4 py-2.5 border border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50 text-xs font-mono uppercase tracking-widest transition-colors rounded flex items-center justify-center gap-2">
                  📍 Reubicar (coords manuales)
                </button>
              ) : (
                <div className="space-y-3 p-3 border border-purple-200 bg-purple-50/30 rounded">
                  <div className="text-xs font-mono uppercase tracking-widest text-purple-600 font-bold">Reubicar poste</div>
                  <p className="text-[11px] text-stone-500">Las coordenadas actuales se guardarán como "ubicación original".</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-stone-500 uppercase">Latitud</label>
                      <input type="number" step="any" value={reubLat} onChange={e => setReubLat(e.target.value)}
                        placeholder="19.48324" className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-stone-500 uppercase">Longitud</label>
                      <input type="number" step="any" value={reubLng} onChange={e => setReubLng(e.target.value)}
                        placeholder="-99.11325" className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-purple-500" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      const lat = parseFloat(reubLat);
                      const lng = parseFloat(reubLng);
                      if (isNaN(lat) || isNaN(lng) || Math.abs(lat) < 1 || Math.abs(lng) < 1) {
                        alert('Coordenadas inválidas. Ingresa latitud y longitud válidas.');
                        return;
                      }
                      if (!onRequestRelocate) {
                        alert('Función de reubicación no disponible.');
                        return;
                      }
                      setShowReubForm(false);
                      setReubLat(''); setReubLng('');
                      onRequestRelocate({
                        postId: post.id,
                        postLabel: postDisplayId(post),
                        coordsAnterior: { lat: post.lat, lng: post.lng },
                        coordsNueva:    { lat, lng },
                        source: 'manual',
                      });
                    }}
                      disabled={!reubLat || !reubLng}
                      className="flex-1 px-3 py-2 bg-purple-600 text-white text-xs font-mono uppercase tracking-widest rounded hover:bg-purple-700 disabled:opacity-40 transition-colors">
                      ✓ Reubicar
                    </button>
                    <button onClick={() => setShowReubForm(false)}
                      className="px-3 py-2 border border-stone-300 text-stone-500 text-xs font-mono uppercase tracking-widest rounded hover:bg-stone-100 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Historial de reubicaciones — solo admin/director */}
          <PostFusionHistory
            postId={post.id}
            canView={canViewHistory}
            refreshKey={historyRefreshKey}
          />
          <PostReubicacionHistory
            postId={post.id}
            canView={canViewHistory}
            refreshKey={historyRefreshKey}
          />

          {/* Historial de cambios */}
          <div className="mt-6 pt-4 border-t border-stone-300">
            <button onClick={loadHistory} disabled={loadingHistory}
                    className="w-full px-4 py-2.5 border border-stone-300 text-stone-600 hover:bg-stone-100 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors rounded">
              {loadingHistory ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</> :
               history ? <><RefreshCw className="w-4 h-4" strokeWidth={1.5} /> Actualizar historial</> :
               <><Clock className="w-4 h-4" strokeWidth={1.5} /> Ver historial de cambios</>}
            </button>
            {history && history.length === 0 && (
              <div className="text-xs text-stone-500 text-center mt-2">Sin cambios registrados</div>
            )}
            {history && history.length > 0 && (
              <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto">
                {history.map(entry => {
                  const stageLabel = entry.stageId ? (STAGE_BY_ID[entry.stageId]?.short || entry.stageId) : '';
                  const stageColor = entry.stageId ? (STAGE_BY_ID[entry.stageId]?.color || '#888') : '#888';
                  const dateStr = new Date(entry.ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short' });
                  const timeStr = new Date(entry.ts).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
                  const user = entry.userEmail?.split('@')[0] || '?';

                  return (
                    <div key={entry.id} className="p-3 border border-stone-300 rounded-lg bg-white shadow-sm text-xs">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-stone-950 font-bold">{dateStr} {timeStr}</span>
                        {stageLabel && <span className="px-1.5 py-0.5 rounded text-[13px] font-bold" style={{ background: `${stageColor}20`, color: stageColor }}>{stageLabel}</span>}
                        <span className="ml-auto text-stone-500">👤 {user}</span>
                      </div>
                      {entry.action === 'INSERT' && <div className="text-emerald-600 font-mono">+ Creado</div>}
                      {entry.action === 'DELETE' && <div className="text-red-500 font-mono">✕ Eliminado</div>}
                      {entry.changes.map((c, i) => {
                        const fieldLabel = STAGE_DEFS.flatMap(s => s.attributes).find(a => a.key === c.field)?.label || c.field;
                        let fromStr = c.from === null || c.from === undefined ? '—' : typeof c.from === 'object' ? JSON.stringify(c.from).slice(0, 40) : String(c.from).slice(0, 40);
                        let toStr = c.to === null || c.to === undefined ? '—' : typeof c.to === 'object' ? JSON.stringify(c.to).slice(0, 40) : String(c.to).slice(0, 40);
                        if (c.field === 'done') { fromStr = c.from ? '✓' : '—'; toStr = c.to ? '✓ completada' : '↩ deshecha'; }
                        if (c.field === 'verified') { fromStr = c.from ? '✓' : '—'; toStr = c.to ? '✓ verificada' : '↩ sin verificar'; }
                        if (c.field === 'photo_url') { fromStr = c.from ? '📷' : '—'; toStr = c.to ? '📷 foto nueva' : '—'; }
                        return (
                          <div key={i} className="flex items-center gap-1 text-[13px] font-mono mt-0.5">
                            <span className="text-stone-500 min-w-[80px]">{fieldLabel}:</span>
                            {fromStr !== '—' && <span className="text-red-400 line-through">{fromStr}</span>}
                            {fromStr !== '—' && <span className="text-stone-400">→</span>}
                            <span className="text-emerald-600 font-medium">{toStr}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Borrar poste — solo admin */}
          {onDelete && (
            <div className="mt-6 pt-4 border-t border-stone-300">
              <button onClick={() => onDelete(post.id)}
                      className="w-full px-4 py-2.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 text-xs font-mono uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4" strokeWidth={1.5} /> Borrar poste {post.id}
              </button>
              <div className="text-[12px] text-stone-500 text-center mt-1">Se borrarán etapas, fotos e incidencias</div>
            </div>
          )}
        </div>
      </div>
      {editingStage && (
        <StageEditor post={post} stage={editingStage} onUpdate={onUpdate}
                     onClose={() => setEditingStage(null)}
                     onCreateIncident={onCreateIncident}
                     incidents={incidents} />
      )}
    </>
  );
}

// ============================================================================
// CREWS VIEW
// ============================================================================

function CrewsView({ posts }) {
  const crewData = useMemo(() => CREWS.map(c => {
    const crewPosts = posts.filter(p => p.crewId === c.id);
    const done = crewPosts.filter(p => !p.blocked && currentStageOf(p).state === 'completado').length;
    const blocked = crewPosts.filter(p => p.blocked).length;
    const active = crewPosts.length - done - blocked;
    const stageCount = STAGE_DEFS.reduce((acc, s) => {
      acc[s.id] = crewPosts.filter(p => p.stages[s.id]?.done).length;
      return acc;
    }, {});
    return { ...c, posts: crewPosts, done, active, blocked, total: crewPosts.length, stageCount };
  }), [posts]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-end justify-between border-b border-stone-300 pb-4">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-1">Recursos humanos</div>
          <h1 className="text-3xl font-light text-stone-950">Cuadrillas de campo</h1>
          <p className="text-sm text-stone-500 mt-1 font-mono">
            {CREWS.length} cuadrillas · {CREWS.reduce((s, c) => s + c.members, 0)} operarios
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {crewData.map(c => {
          const pct = c.total ? (c.done / c.total) * 100 : 0;
          return (
            <div key={c.id} className="bg-stone-100/40 border border-stone-300 hover:border-rose-600/30 transition-colors">
              <div className="px-5 py-4 border-b border-stone-300 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-rose-500" strokeWidth={1.5} />
                    <div className="font-mono text-xs text-rose-500 uppercase tracking-widest">{c.id}</div>
                  </div>
                  <div className="text-xl text-stone-950 mt-1">{c.name}</div>
                  <div className="text-xs text-stone-500 font-mono mt-1">
                    Líder: {c.leader} · {c.members} operarios
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Zona</div>
                  <div className="text-sm text-stone-800 font-mono">{c.zone}</div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Avance global</span>
                    <span className="font-mono text-sm text-rose-500 tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-stone-50 border border-stone-300 relative overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${(c.done / Math.max(c.total, 1)) * 100}%` }} />
                    <div className="h-full bg-rose-600" style={{ width: `${(c.active / Math.max(c.total, 1)) * 100}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${(c.blocked / Math.max(c.total, 1)) * 100}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Total</div>
                    <div className="font-mono text-lg text-stone-800 tabular-nums">{c.total}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Hechos</div>
                    <div className="font-mono text-lg text-emerald-500 tabular-nums">{c.done}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Activo</div>
                    <div className="font-mono text-lg text-rose-500 tabular-nums">{c.active}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Bloq.</div>
                    <div className="font-mono text-lg text-red-500 tabular-nums">{c.blocked}</div>
                  </div>
                </div>

                {/* Stage mini-bars */}
                <div className="pt-2 border-t border-stone-300">
                  <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-2">Etapas completadas</div>
                  <div className="grid grid-cols-7 gap-1">
                    {STAGE_DEFS.map(s => {
                      const count = c.stageCount[s.id];
                      const stagePct = c.total ? (count / c.total) * 100 : 0;
                      return (
                        <div key={s.id} className="text-center">
                          <div className="h-10 bg-stone-50 relative flex items-end">
                            <div className="w-full transition-all" style={{ height: `${Math.max(5, stagePct)}%`, background: s.color }} />
                          </div>
                          <div className="text-[13px] font-mono text-stone-500 mt-1">E{s.num}</div>
                          <div className="text-[12px] font-mono text-stone-600 tabular-nums">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// INCIDENTS VIEW
// ============================================================================

// =============================================================================
// ProposalsView — propuestas de edición (SU/PC crean, admin revisa)
// =============================================================================
function ProposalsView({ proposals, posts, userNames, isAdmin, isCoordinador, onCreateProposal, onReview }) {
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('pendiente');
  const [newPostId, setNewPostId] = useState('');
  const [newType, setNewType] = useState('edit');
  const [newChanges, setNewChanges] = useState('');
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PROP_PAGE_SIZE = 15;

  const filtered = useMemo(() => {
    let res = proposals.filter(p => filter === 'todas' || p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(p => {
        const post = posts.find(pp => pp.id === p.postId);
        return (p.postId || '').toLowerCase().includes(q)
          || (p.changes?.descripcion || '').toLowerCase().includes(q)
          || (p.reason || '').toLowerCase().includes(q)
          || (userNames[p.proposedBy] || '').toLowerCase().includes(q)
          || (post?.direccion || '').toLowerCase().includes(q);
      });
    }
    return res;
  }, [proposals, filter, search, posts, userNames]);
  const pendingCount = proposals.filter(p => p.status === 'pendiente').length;

  // Reiniciar paginación al cambiar filtro/búsqueda (cliente, sin tocar la BD)
  useEffect(() => { setPage(0); }, [filter, search]);
  const propTotalPages = Math.max(1, Math.ceil(filtered.length / PROP_PAGE_SIZE));
  const propSafePage = Math.min(page, propTotalPages - 1);
  const pagedProposals = filtered.slice(propSafePage * PROP_PAGE_SIZE, (propSafePage + 1) * PROP_PAGE_SIZE);

  const handleCreate = async () => {
    if (!newPostId || !newChanges.trim()) return;
    setSaving(true);
    try {
      await onCreateProposal({ postId: newPostId, proposalType: newType, changes: { descripcion: newChanges.trim() }, reason: newReason.trim() });
      setShowCreate(false);
      setNewPostId(''); setNewChanges(''); setNewReason('');
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-light text-stone-950">Propuestas de edición</h1>
            <p className="text-xs text-stone-600 mt-1">{pendingCount} pendientes · {proposals.length} total</p>
          </div>
          {isCoordinador && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-rose-700 hover:bg-rose-600 text-white text-sm font-medium rounded-lg px-3 py-2 flex-shrink-0">
              <Plus className="w-4 h-4" /> Nueva propuesta
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar poste, descripción, razón, autor…"
                   className="w-full bg-stone-100 border border-stone-300 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-stone-800 placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
          </div>
          {['pendiente', 'aprobada', 'rechazada', 'todas'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-mono uppercase rounded-lg border ${filter === f ? 'bg-rose-700 text-white border-rose-700' : 'border-stone-300 text-stone-600'}`}>
              {f} {f === 'pendiente' && pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-500">Sin propuestas {filter !== 'todas' ? filter + 's' : ''}</div>
        ) : (
          <div className="space-y-3">
            {pagedProposals.map(p => {
              const post = posts.find(pp => pp.id === p.postId);
              const userName = userNames[p.proposedBy] || p.proposedBy?.slice(0, 8) || '?';
              const reviewerName = p.reviewedBy ? (userNames[p.reviewedBy] || '?') : null;
              return (
                <div key={p.id} className="border border-stone-300 rounded-lg p-4 bg-stone-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm font-bold text-stone-950">{p.postId}</span>
                    <span className={`text-[13px] font-mono uppercase px-1.5 py-0.5 rounded ${
                      p.proposalType === 'reubicacion' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                    }`}>{p.proposalType === 'reubicacion' ? '📍 Reubicación' : '✏️ Edición'}</span>
                    <span className={`ml-auto text-[12px] font-mono uppercase px-2 py-0.5 rounded-full ${
                      p.status === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                      p.status === 'aprobada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                    }`}>{p.status}</span>
                  </div>
                  {post && <div className="text-xs text-stone-600 mb-1">{post.direccion}</div>}
                  <div className="text-sm text-stone-800 mb-2">{p.changes?.descripcion || JSON.stringify(p.changes)}</div>
                  {p.reason && <div className="text-xs text-stone-500 italic mb-2">Razón: {p.reason}</div>}
                  <div className="text-[12px] text-stone-500">
                    👤 {userName} · {new Date(p.proposedAt).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </div>
                  {p.status !== 'pendiente' && reviewerName && (
                    <div className="text-[12px] text-stone-500 mt-1">
                      Revisado por {reviewerName}: {p.reviewNotes || '—'}
                    </div>
                  )}
                  {/* Admin review buttons */}
                  {isAdmin && p.status === 'pendiente' && onReview && (
                    <div className="mt-3 pt-3 border-t border-stone-200 space-y-2">
                      <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                        placeholder="Notas de revisión (opcional)…" rows={1}
                        className="w-full bg-white border border-stone-300 rounded px-3 py-1.5 text-xs text-stone-800 placeholder-stone-500 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => { onReview(p.id, true, reviewNotes); setReviewNotes(''); }}
                          className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg">✓ Aprobar</button>
                        <button onClick={() => { onReview(p.id, false, reviewNotes); setReviewNotes(''); }}
                          className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg">✗ Rechazar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {propTotalPages > 1 && (
          <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
            <div className="text-xs font-mono text-stone-500">
              {filtered.length.toLocaleString()} propuestas · Página {propSafePage + 1} de {propTotalPages}
            </div>
            <div className="flex gap-1">
              <button disabled={propSafePage === 0} onClick={() => setPage(Math.max(0, propSafePage - 1))}
                      className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
              </button>
              <button disabled={propSafePage >= propTotalPages - 1} onClick={() => setPage(Math.min(propTotalPages - 1, propSafePage + 1))}
                      className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
                Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear propuesta */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-stone-50 border border-stone-300 rounded-xl max-w-md w-full p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-stone-950 mb-4">Nueva propuesta</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewType('edit')} className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 ${newType === 'edit' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'border-stone-300 text-stone-500'}`}>✏️ Edición</button>
                  <button onClick={() => setNewType('reubicacion')} className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 ${newType === 'reubicacion' ? 'bg-orange-100 border-orange-500 text-orange-700' : 'border-stone-300 text-stone-500'}`}>📍 Reubicación</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Poste *</label>
                <select value={newPostId} onChange={e => setNewPostId(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950">
                  <option value="">Seleccionar poste…</option>
                  {posts.map(p => <option key={p.id} value={p.id}>{p.id} — {p.direccion || 'Sin dirección'}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Descripción del cambio *</label>
                <textarea value={newChanges} onChange={e => setNewChanges(e.target.value)} rows={3}
                  placeholder={newType === 'reubicacion' ? 'Describe a dónde se debe mover y por qué…' : 'Describe qué cambio propones…'}
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 placeholder-stone-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Razón (opcional)</label>
                <input type="text" value={newReason} onChange={e => setNewReason(e.target.value)}
                  placeholder="¿Por qué se necesita este cambio?"
                  className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 placeholder-stone-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 bg-stone-100 text-stone-800 text-sm rounded-lg py-3">Cancelar</button>
                <button onClick={handleCreate} disabled={saving || !newPostId || !newChanges.trim()}
                  className="flex-1 bg-rose-700 hover:bg-rose-600 disabled:bg-stone-200 text-white text-sm font-bold rounded-lg py-3">
                  {saving ? 'Enviando…' : 'Enviar propuesta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IncidentsView({ incidents, posts, onResolve, onSelectPost, isAdmin, isDirector, profile, onDelete, onAttend, canAttend, canResolve, onRevert, externalNav }) {
  const [filter, setFilter] = useState(externalNav?.filter || 'abierta');
  const [search, setSearch] = useState(externalNav?.search || '');
  const [filterCategory, setFilterCategory] = useState('todas');
  const [filterPost, setFilterPost] = useState('todas'); // 'todas' | 'poste_13m' | 'falta_camaras' | 'falta_silicon'
  const [page, setPage] = useState(0);
  const INC_PAGE_SIZE = 10;

  // Sync with external navigation (from Informe cards)
  useEffect(() => {
    if (externalNav?.ts) {
      setFilter(externalNav.filter || 'abierta');
      setSearch(externalNav.search || '');
      setFilterCategory('todas');
      setFilterPost('todas');
    }
  }, [externalNav?.ts]);

  // Reiniciar paginación al cambiar filtros/búsqueda (cliente, sin tocar la BD)
  useEffect(() => { setPage(0); }, [filter, search, filterCategory, filterPost]);

  // Attend flow state
  const [attendingId, setAttendingId] = useState(null);
  const [attendPhotoFile, setAttendPhotoFile] = useState(null);
  const [movingIncidentId, setMovingIncidentId] = useState(null);
  const [moveTargetStage, setMoveTargetStage] = useState('');
  const [attendNote, setAttendNote] = useState('');
  const [attending, setAttending] = useState(false);

  // Classification system state (admin/director only)
  const [categories, setCategories] = useState([]);
  const [classifications, setClassifications] = useState({});
  const [classLoaded, setClassLoaded] = useState(false);
  const [classifyingId, setClassifyingId] = useState(null); // incident being classified
  const [selectedCatId, setSelectedCatId] = useState('');
  const [classNotes, setClassNotes] = useState('');
  const [classifying, setClassifying] = useState(false);

  // New category form
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6B7280');
  const [creatingCat, setCreatingCat] = useState(false);

  // Gestionar categorías (admin only): editar / eliminar
  const [showManageCat, setShowManageCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatColor, setEditCatColor] = useState('#6B7280');
  const [savingCat, setSavingCat] = useState(false);
  const [busyCatId, setBusyCatId] = useState(null);

  const canSeeClassification = isAdmin || isDirector;

  // Load categories and classifications for admin/director
  useEffect(() => {
    if (!canSeeClassification) return;
    let cancelled = false;
    (async () => {
      const [cats, cls] = await Promise.all([
        loadIncidentCategories(),
        loadIncidentClassifications(),
      ]);
      if (cancelled) return;
      setCategories(cats);
      setClassifications(cls);
      setClassLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [canSeeClassification]);

  const filtered = incidents.filter(i => {
    if (filter !== 'todas' && i.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchPost = i.postId?.toLowerCase().includes(q);
      const matchReporter = (i.reportedByName || '').toLowerCase().includes(q);
      const matchNote = (i.userNote || '').toLowerCase().includes(q);
      const matchType = (i.type || '').toLowerCase().includes(q);
      const post = posts.find(p => p.id === i.postId);
      const matchUT = (post?.unidad_territorial || '').toLowerCase().includes(q);
      if (!matchPost && !matchReporter && !matchNote && !matchType && !matchUT) return false;
    }
    // Filter by category (admin/director only)
    if (filterCategory !== 'todas' && canSeeClassification) {
      const cls = classifications[i.id];
      if (filterCategory === 'sin_clasificar') {
        if (cls) return false;
      } else {
        if (!cls || cls.categoryId !== filterCategory) return false;
      }
    }
    // Filter by post characteristics (poste 13m / faltan cámaras / falta silicón)
    if (filterPost !== 'todas') {
      const post = posts.find(p => p.id === i.postId);
      if (!post) return false;
      if (filterPost === 'poste_13m' && post.stages?.dado?.attrs?.poste_tipo !== '13m') return false;
      if (filterPost === 'falta_camaras' && post.stages?.camaras?.done) return false;
      if (filterPost === 'avanzo_huecos' && !(post.stages?.conexion_poste?.attrs?.avance_con_pendientes?.length)) return false;
      if (filterPost === 'falta_silicon') {
        const sil = ['sil_corona_1','sil_corona_2','sil_brazo_izq','sil_brazo_der','sil_acrilico'];
        const checks = post.stages?.camaras?.attrs?.mantenimiento?.m1_mantenimiento?.checks || {};
        if (sil.every(id => checks[id]?.result === 'ok')) return false;
      }
    }
    return true;
  }).sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)));

  const stats = {
    total: incidents.length,
    abiertas: incidents.filter(i => i.status === 'abierta').length,
    resueltas: incidents.filter(i => i.status === 'resuelta').length,
    criticas: incidents.filter(i => i.status === 'abierta' && i.severity === 'alta').length,
    atendidas: incidents.filter(i => i.status === 'atendida').length,
    sinClasificar: canSeeClassification ? incidents.filter(i => !classifications[i.id]).length : 0,
  };

  // Paginación cliente
  const incTotalPages = Math.max(1, Math.ceil(filtered.length / INC_PAGE_SIZE));
  const incSafePage = Math.min(page, incTotalPages - 1);
  const pagedIncidents = filtered.slice(incSafePage * INC_PAGE_SIZE, (incSafePage + 1) * INC_PAGE_SIZE);

  const handleClassify = async (incidentId) => {
    if (!selectedCatId) return;
    setClassifying(true);
    try {
      await dbClassifyIncident(incidentId, selectedCatId, classNotes.trim() || null);
      const cat = categories.find(c => c.id === selectedCatId);
      setClassifications(prev => ({
        ...prev,
        [incidentId]: {
          categoryId: selectedCatId,
          categoryName: cat?.name || '?',
          categoryColor: cat?.color || '#6B7280',
          classifiedByName: profile?.display_name || 'Admin',
          classifiedAt: new Date().toISOString(),
          notes: classNotes.trim() || null,
        },
      }));
      setClassifyingId(null);
      setSelectedCatId('');
      setClassNotes('');
    } catch (e) {
      alert('Error al clasificar: ' + e.message);
    } finally {
      setClassifying(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const newId = await dbCreateCategory(newCatName.trim(), newCatDesc.trim() || null, newCatColor);
      setCategories(prev => [...prev, { id: newId, name: newCatName.trim(), description: newCatDesc.trim(), color: newCatColor, active: true }]);
      setShowNewCat(false);
      setNewCatName('');
      setNewCatDesc('');
      setNewCatColor('#6B7280');
    } catch (e) {
      alert('Error al crear categoría: ' + e.message);
    } finally {
      setCreatingCat(false);
    }
  };

  const startEditCategory = (c) => {
    setEditingCatId(c.id);
    setEditCatName(c.name || '');
    setEditCatDesc(c.description || '');
    setEditCatColor(c.color || '#6B7280');
  };

  const handleUpdateCategory = async () => {
    if (!editCatName.trim() || !editingCatId) return;
    setSavingCat(true);
    try {
      await dbUpdateCategory(editingCatId, {
        name: editCatName.trim(),
        description: editCatDesc.trim() || null,
        color: editCatColor,
      });
      setCategories(prev => prev.map(c => c.id === editingCatId
        ? { ...c, name: editCatName.trim(), description: editCatDesc.trim(), color: editCatColor }
        : c));
      setEditingCatId(null);
    } catch (e) {
      alert('Error al actualizar categoría: ' + e.message);
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (c) => {
    if (!window.confirm(`¿Eliminar la categoría "${c.name}"? Esta acción no se puede deshacer.`)) return;
    setBusyCatId(c.id);
    try {
      await dbDeleteCategory(c.id);
      setCategories(prev => prev.filter(x => x.id !== c.id));
    } catch (e) {
      if (e.code === 'EN_USO') {
        const desactivar = window.confirm(
          `No se puede borrar "${c.name}" porque ya está en uso por incidencias clasificadas.\n\n¿Quieres DESACTIVARLA? (se oculta de la lista conservando el historial)`
        );
        if (desactivar) {
          try {
            await dbDeactivateCategory(c.id);
            setCategories(prev => prev.filter(x => x.id !== c.id));
          } catch (e2) {
            alert('Error al desactivar categoría: ' + e2.message);
          }
        }
      } else {
        alert('Error al eliminar categoría: ' + e.message);
      }
    } finally {
      setBusyCatId(null);
    }
  };

  const CAT_COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#06B6D4', '#EC4899', '#6B7280', '#DC2626', '#059669'];

  const exportIncidenciasCSV = () => {
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('es-MX') : '';
    const catLabel = filterCategory === 'todas' ? 'Todas' :
      filterCategory === 'sin_clasificar' ? 'Sin clasificar' :
      (categories.find(c => c.id === filterCategory)?.name || filterCategory);
    const rows = [
      ['ID', 'Poste', 'UT', 'Lat', 'Lng', 'Tipo', 'Descripcion', 'Severidad', 'Estado', 'Etapa', 'Categoria', 'Reporto', 'Nota', 'Atendio', 'Resolvio', 'Creado', 'Resuelto'],
      ...filtered.map(i => {
        const post = posts.find(p => p.id === i.postId);
        const cls = classifications[i.id];
        const catName = cls ? (cls.categoryName || categories.find(c => c.id === cls.categoryId)?.name || '') : 'Sin clasificar';
        return [
          i.id, i.postId, post?.unidad_territorial || '', post?.lat ?? '', post?.lng ?? '', i.type || '', i.description || '',
          i.severity || '', i.status || '', i.stageId || '', catName,
          i.reportedByName || '', i.userNote || '', i.attendedByName || '', i.resolvedByName || '',
          fmt(i.createdAt), fmt(i.resolvedAt),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidencias_${catLabel.replace(/[^a-zA-Z0-9]+/g, '_')}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
      <div className="flex items-end justify-between border-b border-stone-300 pb-4 flex-wrap gap-2">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-1">Registro</div>
          <h1 className="text-3xl font-light text-stone-950">Incidencias y bloqueos</h1>
        </div>
        {/* Acciones: exportar (admin/director) + gestionar categorías (admin) */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canSeeClassification && (
            <button onClick={exportIncidenciasCSV}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-emerald-600 hover:text-emerald-600 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors">
              <Download className="w-3 h-3" /> Exportar
            </button>
          )}
          {isAdmin && (
            <>
              <button onClick={() => { setShowNewCat(!showNewCat); setShowManageCat(false); }}
                      className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-500 hover:text-rose-500 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <TagIcon className="w-3 h-3" /> {showNewCat ? 'Cerrar' : 'Nueva categoría'}
              </button>
              <button onClick={() => { setShowManageCat(!showManageCat); setShowNewCat(false); setEditingCatId(null); }}
                      className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-blue-500 hover:text-blue-500 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <Edit2 className="w-3 h-3" /> {showManageCat ? 'Cerrar' : 'Gestionar categorías'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* New category form (admin only) */}
      {isAdmin && showNewCat && (
        <div className="border border-rose-300 bg-rose-50/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-rose-600 font-medium">Crear nueva categoría de incidencia</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">Nombre *</label>
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                     placeholder="Ej: Falla de cimentación"
                     className="w-full bg-white border border-stone-300 rounded px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-rose-500" />
            </div>
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">Descripción</label>
              <input type="text" value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)}
                     placeholder="Opcional"
                     className="w-full bg-white border border-stone-300 rounded px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-rose-500" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-stone-500 mb-1.5">Color de la categoría</label>
            <div className="flex gap-2 flex-wrap">
              {CAT_COLORS.map(c => (
                <button key={c} onClick={() => setNewCatColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${newCatColor === c ? 'border-stone-800 scale-110' : 'border-transparent'}`}
                        style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNewCat(false)} className="px-3 py-2 border border-stone-300 text-stone-600 text-xs font-mono rounded">Cancelar</button>
            <button onClick={handleCreateCategory} disabled={!newCatName.trim() || creatingCat}
                    className="px-4 py-2 bg-rose-600 text-white text-xs font-mono uppercase rounded disabled:opacity-40 flex items-center gap-1.5">
              {creatingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Crear
            </button>
          </div>
        </div>
      )}

      {/* Gestionar categorías (admin only): editar / eliminar */}
      {isAdmin && showManageCat && (
        <div className="border border-blue-300 bg-blue-50/30 rounded-lg p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-700 font-medium">Gestionar categorías de incidencia</div>
          {categories.length === 0 ? (
            <div className="text-sm text-stone-500">No hay categorías.</div>
          ) : (
            <div className="space-y-2">
              {categories.map(c => (
                <div key={c.id} className="bg-white border border-stone-200 rounded p-2.5">
                  {editingCatId === c.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)}
                               placeholder="Nombre *"
                               className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-blue-500" />
                        <input type="text" value={editCatDesc} onChange={e => setEditCatDesc(e.target.value)}
                               placeholder="Descripción (opcional)"
                               className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {CAT_COLORS.map(col => (
                          <button key={col} onClick={() => setEditCatColor(col)}
                                  className={`w-6 h-6 rounded-full border-2 transition-transform ${editCatColor === col ? 'border-stone-800 scale-110' : 'border-transparent'}`}
                                  style={{ background: col }} />
                        ))}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingCatId(null)} className="px-3 py-1.5 border border-stone-300 text-stone-600 text-xs font-mono rounded">Cancelar</button>
                        <button onClick={handleUpdateCategory} disabled={!editCatName.trim() || savingCat}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-mono uppercase rounded disabled:opacity-40 flex items-center gap-1.5">
                          {savingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: c.color || '#6B7280' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-800 truncate">{c.name}</div>
                        {c.description && <div className="text-[11px] text-stone-500 truncate">{c.description}</div>}
                      </div>
                      <button onClick={() => startEditCategory(c)}
                              className="px-2.5 py-1 text-xs font-mono text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Editar
                      </button>
                      <button onClick={() => handleDeleteCategory(c)} disabled={busyCatId === c.id}
                              className="px-2.5 py-1 text-xs font-mono text-rose-600 hover:bg-rose-50 rounded flex items-center gap-1 disabled:opacity-40">
                        {busyCatId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} accent="#6B7280" icon={FileText} />
        <StatCard label="Abiertas" value={stats.abiertas} accent="#EF4444" icon={AlertTriangle} />
        <StatCard label="Críticas" value={stats.criticas} accent="#F59E0B" icon={Zap} sub="alta severidad" />
        <StatCard label="Atendidas" value={stats.atendidas} accent="#3B82F6" icon={Clock} sub="pendientes de verificar" />
        <StatCard label="Resueltas" value={stats.resueltas} accent="#10B981" icon={CheckCircle2} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar poste, reportó, nota…"
                 className="w-full bg-stone-100/60 border border-stone-300 pl-9 pr-3 py-1.5 text-sm text-stone-800 font-mono placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
        </div>
        <div className="flex border border-stone-300">
          {['abierta', 'atendida', 'resuelta', 'todas'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
                    className={`px-4 py-2 text-xs font-mono uppercase tracking-widest ${
                      filter === f ? 'bg-rose-700 text-rose-50' : 'text-stone-600 hover:bg-stone-50'
                    }`}>{f}</button>
          ))}
        </div>
        {/* Category filter (admin/director) */}
        {canSeeClassification && classLoaded && categories.length > 0 && (
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="bg-stone-100 border border-stone-300 px-3 py-2 text-xs font-mono text-stone-700 focus:outline-none focus:border-rose-500">
            <option value="todas">Todas las categorías</option>
            <option value="sin_clasificar">⚠ Sin clasificar ({stats.sinClasificar})</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {/* Filtros por tipo de poste */}
        {[
          { key: 'poste_13m',     label: '📏 13m',           activeClass: 'bg-violet-100 border-violet-400 text-violet-700' },
          { key: 'falta_camaras', label: '🎥 Sin cámaras',   activeClass: 'bg-amber-100 border-amber-400 text-amber-700' },
          { key: 'falta_silicon', label: '🔵 Sin silicón',   activeClass: 'bg-sky-100 border-sky-400 text-sky-700' },
          { key: 'avanzo_huecos', label: '⚠️ Avanzó con huecos', activeClass: 'bg-amber-200 border-amber-500 text-amber-900' },
        ].map(({ key, label, activeClass }) => (
          <button key={key}
                  onClick={() => setFilterPost(prev => prev === key ? 'todas' : key)}
                  className={`px-3 py-2 text-xs font-mono border transition-colors ${
                    filterPost === key ? activeClass : 'bg-stone-100 border-stone-300 text-stone-600 hover:border-stone-400'
                  }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="border border-stone-300 divide-y divide-stone-300/60">
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-stone-500 font-mono text-sm">Sin incidencias en este filtro</div>
        )}
        {pagedIncidents.map(i => {
          const post = posts.find(p => p.id === i.postId);
          const cls = classifications[i.id];
          const isClassifying = classifyingId === i.id;
          return (
            <div key={i.id} className="px-5 py-4 hover:bg-rose-500/5 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  i.severity === 'alta' ? 'bg-red-500' : i.severity === 'media' ? 'bg-amber-500' : 'bg-gray-400'
                } ${i.status === 'abierta' ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0">
                  {/* Row 1: ID, post, UT, severity, status */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs text-stone-500">{i.id}</span>
                    <button onClick={() => post && onSelectPost(post)}
                            className="font-mono text-sm text-rose-500 hover:underline">{i.postId}</button>
                    {post && <span className="text-[13px] text-stone-500">{post.unidad_territorial}</span>}
                    <span className={`text-[12px] font-mono uppercase tracking-widest px-2 py-0.5 ${
                      i.severity === 'alta' ? 'bg-red-500/15 text-red-500' :
                      i.severity === 'media' ? 'bg-rose-500/15 text-rose-500' :
                      'bg-stone-200/30 text-stone-600'
                    }`}>{i.severity}</span>
                    {i.status === 'atendida' && (
                      <span className="text-[12px] font-mono uppercase tracking-widest px-2 py-0.5 bg-blue-500/15 text-blue-600">Atendida</span>
                    )}
                    {i.status === 'resuelta' && (
                      <span className="text-[12px] font-mono uppercase tracking-widest px-2 py-0.5 bg-emerald-500/15 text-emerald-500">Resuelta</span>
                    )}
                  </div>

                  {/* Row 2: Type + stage badge */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-stone-800">{i.type}</span>
                    {i.stageId && (() => {
                      const sd = STAGE_BY_ID[i.stageId];
                      if (!sd) return null;
                      return (
                        <span className="text-[12px] font-mono uppercase tracking-wider px-1.5 py-0.5 flex items-center gap-1"
                              style={{ background: `${sd.color}15`, color: sd.color, border: `1px solid ${sd.color}40` }}>
                          <sd.Icon className="w-2.5 h-2.5" strokeWidth={2}/>
                          E{sd.num} · {sd.short}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Row 3: User note (nota explicativa) */}
                  {i.userNote && (
                    <div className="mt-1.5 text-sm text-stone-700 bg-stone-100/50 border-l-2 border-stone-400 pl-3 py-1.5 rounded-r">
                      {i.userNote}
                    </div>
                  )}

                  {/* Row 3b: legacy sourceNote if different */}
                  {i.sourceNote && i.sourceNote !== i.description && i.sourceNote !== i.userNote && (
                    <div className="mt-2 pl-3 border-l-2 border-stone-300 text-[13px] text-stone-600 italic">
                      "{i.sourceNote}"
                      <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 not-italic mt-0.5">
                        nota original de la etapa
                      </div>
                    </div>
                  )}

                  {/* Row 4: Reporter + date */}
                  <div className="flex items-center gap-3 mt-2 text-[12px] font-mono text-stone-500 flex-wrap">
                    {i.reportedByName && (
                      <span className="flex items-center gap-1">
                        👤
                        {i.reportedByName}
                      </span>
                    )}
                    <span>{new Date(i.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Row 5: Attended info (if status is atendida or resuelta) */}
                  {i.attendedByName && (
                    <div className="mt-2 flex items-center gap-2 text-[12px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-mono">
                        ✅ Atendida por {i.attendedByName}
                      </span>
                      {i.attendedAt && (
                        <span className="text-stone-400 font-mono">{new Date(i.attendedAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  )}
                  {(i.attendedNote || i.attendedPhotoUrl) && (
                    <div className="mt-1 flex items-start gap-2">
                      {i.attendedPhotoUrl && (
                        <a href={i.attendedPhotoUrl} target="_blank" rel="noopener noreferrer">
                          <img src={i.attendedPhotoUrl} alt="Evidencia" className="w-16 h-16 object-cover rounded border border-blue-300 hover:border-blue-500 flex-shrink-0" />
                        </a>
                      )}
                      {i.attendedNote && (
                        <div className="text-xs text-blue-600 bg-blue-50 border-l-2 border-blue-300 pl-2 py-1 rounded-r flex-1">
                          {i.attendedNote}
                        </div>
                      )}
                    </div>
                  )}
                  {i.resolvedByName && i.status === 'resuelta' && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-emerald-600 font-mono">
                      ✔️ Verificada por {i.resolvedByName}
                    </div>
                  )}

                  {/* Row 6: Classification badge (admin/director only) */}
                  {canSeeClassification && classLoaded && (
                    <div className="mt-2">
                      {cls ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                                style={{ background: `${cls.categoryColor}20`, color: cls.categoryColor, border: `1px solid ${cls.categoryColor}40` }}>
                            <TagIcon className="w-3 h-3" /> {cls.categoryName}
                          </span>
                          <span className="text-[11px] text-stone-400 font-mono">
                            por {cls.classifiedByName} · {new Date(cls.classifiedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                          </span>
                          {isAdmin && (
                            <button onClick={() => { setClassifyingId(i.id); setSelectedCatId(cls.categoryId); setClassNotes(cls.notes || ''); }}
                                    className="text-[11px] text-rose-500 hover:underline font-mono">Reclasificar</button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            ⚠ Sin clasificar
                          </span>
                          {isAdmin && (
                            <button onClick={() => { setClassifyingId(i.id); setSelectedCatId(''); setClassNotes(''); }}
                                    className="text-[11px] text-rose-500 hover:underline font-mono">Clasificar</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Classification form (admin only, inline) */}
                  {isAdmin && isClassifying && (
                    <div className="mt-3 p-3 border border-rose-300 bg-rose-50/30 rounded-lg space-y-2">
                      <div className="text-[11px] font-mono uppercase tracking-widest text-rose-600">
                        {cls ? 'Reclasificar' : 'Clasificar'} incidencia {i.id}
                      </div>
                      <select value={selectedCatId} onChange={e => setSelectedCatId(e.target.value)}
                              className="w-full bg-white border border-stone-300 rounded px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-rose-500">
                        <option value="">Seleccionar categoría…</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <input type="text" value={classNotes} onChange={e => setClassNotes(e.target.value)}
                             placeholder="Nota de clasificación (opcional)"
                             className="w-full bg-white border border-stone-300 rounded px-3 py-1.5 text-xs text-stone-700 focus:outline-none focus:border-rose-500" />
                      <div className="flex gap-2">
                        <button onClick={() => setClassifyingId(null)}
                                className="px-3 py-1.5 border border-stone-300 text-stone-600 text-xs font-mono rounded">Cancelar</button>
                        <button onClick={() => handleClassify(i.id)} disabled={!selectedCatId || classifying}
                                className="flex-1 px-3 py-1.5 bg-rose-600 text-white text-xs font-mono rounded disabled:opacity-40 flex items-center justify-center gap-1.5">
                          {classifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <TagIcon className="w-3 h-3" />}
                          {cls ? 'Reclasificar' : 'Clasificar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {/* Field roles: mark as attended */}
                  {i.status === 'abierta' && canAttend && !canResolve && (
                    attendingId === i.id ? (
                      <div className="space-y-2 w-52">
                        <div className="text-[10px] font-mono text-blue-600 uppercase tracking-wider">Evidencia de atención</div>
                        <textarea value={attendNote} onChange={e => setAttendNote(e.target.value)}
                                  rows={2} placeholder="Qué se hizo para resolver... *"
                                  className="w-full bg-white border border-blue-300 rounded px-2 py-1.5 text-[11px] text-stone-700 focus:outline-none focus:border-blue-500 resize-none" />
                        <label className="flex items-center gap-2 px-2 py-1.5 border border-dashed border-blue-300 rounded cursor-pointer hover:bg-blue-50 transition-colors">
                          <Camera className="w-4 h-4 text-blue-400" />
                          <span className="text-[11px] text-blue-600">{attendPhotoFile ? attendPhotoFile.name.slice(0,20) : 'Foto evidencia *'}</span>
                          <input type="file" accept="image/*" capture="environment" className="hidden"
                                 onChange={e => setAttendPhotoFile(e.target.files?.[0] || null)} />
                        </label>
                        <div className="flex gap-1">
                          <button onClick={() => { setAttendingId(null); setAttendPhotoFile(null); }}
                                  className="flex-1 px-2 py-1.5 border border-stone-300 text-stone-500 text-[10px] font-mono rounded">Cancelar</button>
                          <button onClick={async () => {
                                    if (!attendNote.trim()) { alert('La nota es obligatoria.'); return; }
                                    if (!attendPhotoFile) { alert('La foto es obligatoria.'); return; }
                                    setAttending(true);
                                    try {
                                      await onAttend(i.id, attendNote.trim(), attendPhotoFile);
                                      setAttendingId(null);
                                      setAttendNote('');
                                      setAttendPhotoFile(null);
                                    } catch (e) {
                                      console.error('attend submit failed', e);
                                    } finally {
                                      setAttending(false);
                                    }
                                  }} disabled={attending || !attendNote.trim() || !attendPhotoFile}
                                  className="flex-1 px-2 py-1.5 bg-blue-500 text-white text-[10px] font-mono rounded disabled:opacity-40 flex items-center justify-center gap-1">
                            {attending ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓'} Enviar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAttendingId(i.id); setAttendNote(''); setAttendPhotoFile(null); }}
                              className="px-3 py-1.5 border border-blue-400 text-blue-500 hover:bg-blue-500/10 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                        Atendida
                      </button>
                    )
                  )}
                  {/* Admin/Scout: verify attended → resolve, or direct resolve */}
                  {i.status === 'atendida' && canResolve && onResolve && (
                    <button onClick={() => onResolve(i.id)}
                            className="px-3 py-1.5 border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                      Verificar
                    </button>
                  )}
                  {(i.status === "atendida" || i.status === "resuelta") && canResolve && onRevert && (
                    <button onClick={() => onRevert(i.id)}
                            className="px-3 py-1.5 border border-amber-400 text-amber-500 hover:bg-amber-500/10 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                      Devolver
                    </button>
                  )}
                  {i.status === "atendida" && isAdmin && i.attendedPhotoUrl && (
                    movingIncidentId === i.id ? (
                      <div className="space-y-1.5 w-44">
                        <select value={moveTargetStage} onChange={e => setMoveTargetStage(e.target.value)}
                                className="w-full bg-white border border-purple-300 rounded px-2 py-1.5 text-[11px] text-stone-700 font-mono focus:outline-none focus:border-purple-500">
                          <option value="">Seleccionar etapa...</option>
                          {STAGE_DEFS.map(s => (
                            <option key={s.id} value={s.id}>{s.id === i.stageId ? "\u2022 " : ""}E{s.num} {s.short}</option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <button onClick={() => { setMovingIncidentId(null); setMoveTargetStage(''); }}
                                  className="flex-1 px-2 py-1 border border-stone-300 text-stone-500 text-[10px] font-mono rounded">Cancelar</button>
                          <button disabled={!moveTargetStage} onClick={async () => {
                            const sd = STAGE_DEFS.find(s => s.id === moveTargetStage);
                            const lb = sd ? "E" + sd.num + " " + sd.short : moveTargetStage;
                            try {
                              const m = await import("./lib/data.js");
                              await m.updateStageAtomic(i.postId, moveTargetStage, { done: true, notes: (i.attendedNote || "") + " [evidencia " + i.id + "]", photoUrl: i.attendedPhotoUrl });
                              setMovingIncidentId(null); setMoveTargetStage('');
                              alert("Datos movidos a " + lb + " del poste " + i.postId + ". Presiona SYNC para actualizar la vista.");
                            } catch(e) { alert("Error: " + (e?.message || e)); }
                          }}
                                  className="flex-1 px-2 py-1 bg-purple-500 text-white text-[10px] font-mono rounded disabled:opacity-40">Mover</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setMovingIncidentId(i.id); setMoveTargetStage(i.stageId || ''); }}
                              className="px-3 py-1.5 border border-purple-400 text-purple-500 hover:bg-purple-500/10 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                        Mover a etapa
                      </button>
                    )
                  )}
                  {i.status === 'abierta' && canResolve && onResolve && (
                    <button onClick={() => onResolve(i.id)}
                            className="px-3 py-1.5 border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-mono uppercase tracking-wider whitespace-nowrap">
                      Resolver
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={() => onDelete(i.id)}
                            className="px-3 py-1.5 border border-red-300 text-red-400 hover:bg-red-500/10 hover:border-red-500 text-xs font-mono uppercase tracking-wider whitespace-nowrap transition-colors">
                      Borrar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {incTotalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-mono text-stone-500">
            {filtered.length.toLocaleString()} incidencias · Página {incSafePage + 1} de {incTotalPages}
          </div>
          <div className="flex gap-1">
            <button disabled={incSafePage === 0} onClick={() => setPage(Math.max(0, incSafePage - 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
            </button>
            <button disabled={incSafePage >= incTotalPages - 1} onClick={() => setPage(Math.min(incTotalPages - 1, incSafePage + 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
              Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INVENTORY VIEW — Modems y Cámaras instalados
// ============================================================================

const MODEM_TYPE_COLORS = {
  'Blanco':           { bg: 'bg-stone-200/30',  border: 'border-stone-300/40',  text: 'text-stone-700' },
  'Negro':            { bg: 'bg-gray-300/20',  border: 'border-gray-400/40',  text: 'text-stone-600' },
  'Blanco conejito':  { bg: 'bg-pink-300/10',  border: 'border-pink-400/40',  text: 'text-pink-300' },
};

// ============================================================================
// INFORME DE INCIDENCIAS — Reporte ejecutivo para Alcalde y Directores
// ============================================================================

function InformeIncidenciasView({ incidents, posts, onNavigate, onNavigatePostes }) {
  const [periodoFiltro, setPeriodoFiltro] = useState('todo');
  const [exportando, setExportando] = useState(false);
  const [categories, setCategories] = useState([]);
  const [classifications, setClassifications] = useState({});
  const reportRef = useRef(null);

  // Load classification data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, cls] = await Promise.all([
          loadIncidentCategories(),
          loadIncidentClassifications(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setClassifications(cls);
      } catch (e) { console.warn('[InformeIncidencias] classification load error:', e); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Period filter
  const ahora = new Date();
  const filteredByPeriod = useMemo(() => {
    if (periodoFiltro === 'todo') return incidents;
    const dias = periodoFiltro === '7d' ? 7 : periodoFiltro === '30d' ? 30 : periodoFiltro === '90d' ? 90 : 9999;
    const desde = new Date(ahora.getTime() - dias * 86400000);
    return incidents.filter(i => new Date(i.createdAt) >= desde);
  }, [incidents, periodoFiltro]);

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const total = filteredByPeriod.length;
    const abiertas = filteredByPeriod.filter(i => i.status === 'abierta').length;
    const atendidas = filteredByPeriod.filter(i => i.status === 'atendida').length;
    const resueltas = filteredByPeriod.filter(i => i.status === 'resuelta').length;
    const criticas = filteredByPeriod.filter(i => i.severity === 'alta' && i.status !== 'resuelta').length;

    // Resolution time (average days for resolved ones)
    const resolvedWithTime = filteredByPeriod.filter(i => i.status === 'resuelta' && i.resolvedAt && i.createdAt);
    const avgResolution = resolvedWithTime.length > 0
      ? resolvedWithTime.reduce((sum, i) => sum + (new Date(i.resolvedAt) - new Date(i.createdAt)) / 86400000, 0) / resolvedWithTime.length
      : null;

    const tasaResolucion = total > 0 ? Math.round((resueltas / total) * 100) : 0;

    return { total, abiertas, atendidas, resueltas, criticas, avgResolution, tasaResolucion };
  }, [filteredByPeriod]);

  // ---- By severity ----
  const bySeverity = useMemo(() => {
    const map = { alta: 0, media: 0, baja: 0 };
    filteredByPeriod.forEach(i => { map[i.severity] = (map[i.severity] || 0) + 1; });
    return map;
  }, [filteredByPeriod]);

  // ---- By type (top 10) ----
  const byType = useMemo(() => {
    const map = {};
    filteredByPeriod.forEach(i => { map[i.type] = (map[i.type] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredByPeriod]);

  // ---- By UT ----
  const byUT = useMemo(() => {
    const map = {};
    filteredByPeriod.forEach(i => {
      const post = posts.find(p => p.id === i.postId);
      const ut = post?.unidad_territorial || 'Sin UT';
      if (!map[ut]) map[ut] = { total: 0, abiertas: 0, criticas: 0 };
      map[ut].total++;
      if (i.status === 'abierta') map[ut].abiertas++;
      if (i.severity === 'alta' && i.status !== 'resuelta') map[ut].criticas++;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filteredByPeriod, posts]);

  // ---- By category (if classifications available) ----
  const byCategory = useMemo(() => {
    if (!categories.length) return [];
    const map = {};
    let sinCat = 0;
    filteredByPeriod.forEach(i => {
      const cls = classifications[i.id];
      if (cls) {
        const key = cls.categoryName;
        if (!map[key]) map[key] = { count: 0, color: cls.categoryColor };
        map[key].count++;
      } else {
        sinCat++;
      }
    });
    const result = Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
    if (sinCat > 0) result.push({ name: 'Sin clasificar', count: sinCat, color: '#6B7280' });
    return result;
  }, [filteredByPeriod, classifications, categories]);

  // ---- Timeline (last 30 days, by day) ----
  const timeline = useMemo(() => {
    const days = 30;
    const result = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(ahora.getTime() - d * 86400000);
      const key = date.toISOString().split('T')[0];
      const dayIncs = incidents.filter(i => { try { return i.createdAt && new Date(i.createdAt).toISOString().startsWith(key); } catch { return false; } });
      const dayResolved = incidents.filter(i => { try { return i.resolvedAt && new Date(i.resolvedAt).toISOString().startsWith(key); } catch { return false; } });
      result.push({
        date: key,
        label: date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
        nuevas: dayIncs.length,
        resueltas: dayResolved.length,
      });
    }
    return result;
  }, [incidents]);

  const maxTimeline = Math.max(1, ...timeline.map(d => Math.max(d.nuevas, d.resueltas)));

  // ---- Critical open incidents list ----
  const criticalOpen = useMemo(() => {
    return filteredByPeriod
      .filter(i => i.status === 'abierta' && i.severity === 'alta')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 10);
  }, [filteredByPeriod]);

  // ---- Export as text summary ----
  const handleExportText = () => {
    setExportando(true);
    const lines = [
      `INFORME DE INCIDENCIAS — ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Periodo: ${periodoFiltro === 'todo' ? 'Todo el proyecto' : `Últimos ${periodoFiltro.replace('d', ' días')}`}`,
      '',
      '═══ RESUMEN EJECUTIVO ═══',
      `Total de incidencias: ${kpis.total}`,
      `Abiertas: ${kpis.abiertas}  |  Atendidas: ${kpis.atendidas}  |  Resueltas: ${kpis.resueltas}`,
      `Críticas sin resolver: ${kpis.criticas}`,
      `Tasa de resolución: ${kpis.tasaResolucion}%`,
      kpis.avgResolution !== null ? `Tiempo promedio de resolución: ${kpis.avgResolution.toFixed(1)} días` : '',
      '',
      '═══ POR SEVERIDAD ═══',
      `Alta: ${bySeverity.alta}  |  Media: ${bySeverity.media}  |  Baja: ${bySeverity.baja}`,
      '',
      '═══ POR TIPO (Top 10) ═══',
      ...byType.map(([type, count]) => `  • ${type}: ${count}`),
      '',
      '═══ POR UNIDAD TERRITORIAL ═══',
      ...byUT.map(([ut, v]) => `  • ${ut}: ${v.total} total, ${v.abiertas} abiertas, ${v.criticas} críticas`),
    ];
    if (criticalOpen.length > 0) {
      lines.push('', '═══ INCIDENCIAS CRÍTICAS ABIERTAS ═══');
      criticalOpen.forEach(i => {
        const post = posts.find(p => p.id === i.postId);
        lines.push(`  • [${i.id}] Poste ${i.postId} (${post?.unidad_territorial || '?'}) — ${i.type}`);
        if (i.userNote) lines.push(`    Nota: ${i.userNote}`);
        lines.push(`    Desde: ${new Date(i.createdAt).toLocaleDateString('es-MX')}`);
      });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-incidencias-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExportando(false), 1000);
  };

  // ---- WhatsApp share summary ----
  const handleShareWhatsApp = () => {
    const text = [
      `📋 *INFORME DE INCIDENCIAS*`,
      `📅 ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      ``,
      `📊 *Resumen:*`,
      `• Total: ${kpis.total}`,
      `• 🔴 Abiertas: ${kpis.abiertas}`,
      `• 🟡 Atendidas: ${kpis.atendidas}`,
      `• 🟢 Resueltas: ${kpis.resueltas}`,
      `• ⚠️ Críticas: ${kpis.criticas}`,
      `• Tasa de resolución: ${kpis.tasaResolucion}%`,
      kpis.avgResolution !== null ? `• Tiempo promedio resolución: ${kpis.avgResolution.toFixed(1)} días` : '',
    ];
    if (criticalOpen.length > 0) {
      text.push('', `🚨 *Incidencias críticas abiertas (${criticalOpen.length}):*`);
      criticalOpen.slice(0, 5).forEach(i => {
        text.push(`• ${i.postId}: ${i.type}`);
      });
      if (criticalOpen.length > 5) text.push(`  … y ${criticalOpen.length - 5} más`);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text.filter(Boolean).join('\n'))}`, '_blank');
  };

  const Bar = ({ value, max, color, label, sub, onClick }) => (
    <div className={`flex items-center gap-3 ${onClick ? 'cursor-pointer hover:bg-stone-100/60 -mx-2 px-2 py-0.5 rounded transition-colors' : ''}`}
         onClick={onClick}>
      <span className="w-32 text-xs font-mono text-stone-600 truncate text-right">{label}</span>
      <div className="flex-1 bg-stone-200/40 h-6 relative overflow-hidden">
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />
        <span className="absolute inset-y-0 right-2 flex items-center text-xs font-mono font-semibold text-stone-700">{value}</span>
      </div>
      {onClick && <ArrowUpRight className="w-3 h-3 text-stone-400 flex-shrink-0" strokeWidth={1.5} />}
      {sub && <span className="text-[11px] text-stone-500 w-20">{sub}</span>}
    </div>
  );

  const maxByType = Math.max(1, ...byType.map(([, v]) => v));
  const maxByUT = Math.max(1, ...byUT.map(([, v]) => v.total));

  return (
    <div className="space-y-6 h-full overflow-y-auto p-4 sm:p-6" ref={reportRef}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-950 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-rose-500" strokeWidth={1.5} />
            Informe de Incidencias
          </h2>
          <p className="text-xs font-mono text-stone-500 mt-0.5">
            Reporte ejecutivo · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period filter */}
          <div className="flex border border-stone-300">
            {[['7d', '7 días'], ['30d', '30 días'], ['90d', '90 días'], ['todo', 'Todo']].map(([val, lbl]) => (
              <button key={val} onClick={() => setPeriodoFiltro(val)}
                      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest ${
                        periodoFiltro === val ? 'bg-rose-700 text-white' : 'text-stone-600 hover:bg-stone-50'
                      }`}>{lbl}</button>
            ))}
          </div>
          {/* Actions */}
          <button onClick={handleExportText}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 text-xs font-mono text-stone-600 hover:bg-stone-50">
            <Download className="w-3 h-3" /> {exportando ? 'Exportado ✓' : 'Exportar .txt'}
          </button>
          <button onClick={handleShareWhatsApp}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-mono hover:bg-emerald-800">
            <Send className="w-3 h-3" /> WhatsApp
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: kpis.total, accent: '#6B7280', icon: FileText, nav: 'todas' },
          { label: 'Abiertas', value: kpis.abiertas, accent: '#EF4444', icon: AlertTriangle, nav: 'abierta' },
          { label: 'Atendidas', value: kpis.atendidas, accent: '#3B82F6', icon: Clock, nav: 'atendida' },
          { label: 'Resueltas', value: kpis.resueltas, accent: '#10B981', icon: CheckCircle2, nav: 'resuelta' },
          { label: 'Críticas', value: kpis.criticas, accent: '#F59E0B', icon: Zap, nav: 'abierta' },
          { label: 'Resolución', value: `${kpis.tasaResolucion}%`, accent: '#8B5CF6', icon: TrendingUp, nav: null },
        ].map((s, idx) => (
          <div key={idx}
               onClick={() => s.nav && onNavigate?.(s.nav)}
               className={`bg-stone-50 border border-stone-300/60 p-4 transition-all ${s.nav ? 'cursor-pointer hover:border-rose-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-3.5 h-3.5" style={{ color: s.accent }} strokeWidth={1.5} />
              <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500">{s.label}</span>
              {s.nav && <ArrowUpRight className="w-3 h-3 text-stone-400 ml-auto" strokeWidth={1.5} />}
            </div>
            <span className="text-2xl font-bold font-mono" style={{ color: s.accent }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Avg resolution time callout */}
      {kpis.avgResolution !== null && (
        <div className="bg-amber-50 border border-amber-300/50 px-4 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-stone-700">
            Tiempo promedio de resolución: <strong className="text-amber-700 font-mono">{kpis.avgResolution.toFixed(1)} días</strong>
          </span>
        </div>
      )}

      {/* TIMELINE chart (last 30 days) */}
      <div className="bg-stone-50 border border-stone-300/60 p-5">
        <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-stone-500 mb-4">
          Tendencia últimos 30 días — <span className="text-rose-500">nuevas</span> vs <span className="text-emerald-600">resueltas</span>
        </h3>
        <div className="flex items-end gap-[2px] h-28 overflow-x-auto">
          {timeline.map((d, i) => (
            <div key={i} className="flex-1 min-w-[8px] flex flex-col items-center gap-[1px] group relative">
              <div className="w-full bg-rose-500/70 transition-all duration-300"
                   style={{ height: `${(d.nuevas / maxTimeline) * 80}%`, minHeight: d.nuevas ? 2 : 0 }} />
              <div className="w-full bg-emerald-500/70 transition-all duration-300"
                   style={{ height: `${(d.resueltas / maxTimeline) * 80}%`, minHeight: d.resueltas ? 2 : 0 }} />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1 bg-stone-800 text-white text-[10px] font-mono px-2 py-1 rounded hidden group-hover:block whitespace-nowrap z-10">
                {d.label}: {d.nuevas} nuevas, {d.resueltas} resueltas
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] font-mono text-stone-400">{timeline[0]?.label}</span>
          <span className="text-[10px] font-mono text-stone-400">{timeline[timeline.length - 1]?.label}</span>
        </div>
      </div>

      {/* Two columns: Severity + Top Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Severity */}
        <div className="bg-stone-50 border border-stone-300/60 p-5">
          <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-stone-500 mb-4">Por severidad</h3>
          <div className="space-y-3">
            <Bar value={bySeverity.alta} max={kpis.total || 1} color="#EF4444" label="Alta" />
            <Bar value={bySeverity.media} max={kpis.total || 1} color="#F59E0B" label="Media" />
            <Bar value={bySeverity.baja} max={kpis.total || 1} color="#6B7280" label="Baja" />
          </div>
        </div>

        {/* By Type top 10 */}
        <div className="bg-stone-50 border border-stone-300/60 p-5">
          <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-stone-500 mb-4">Top tipos de incidencia</h3>
          <div className="space-y-2">
            {byType.length === 0 && <p className="text-sm text-stone-400 font-mono">Sin datos</p>}
            {byType.map(([type, count], idx) => (
              <Bar key={type} value={count} max={maxByType} color={idx < 3 ? '#E11D48' : '#9F1239'} label={type}
                   onClick={() => onNavigate?.('todas', type)} />
            ))}
          </div>
        </div>
      </div>

      {/* By UT */}
      <div className="bg-stone-50 border border-stone-300/60 p-5">
        <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-stone-500 mb-4">Por Unidad Territorial</h3>
        {byUT.length === 0 && <p className="text-sm text-stone-400 font-mono">Sin datos</p>}
        <div className="space-y-2">
          {byUT.map(([ut, v]) => (
            <div key={ut} className="flex items-center gap-3 cursor-pointer hover:bg-stone-100/60 -mx-2 px-2 py-0.5 rounded transition-colors"
                 onClick={() => onNavigate?.('todas', ut)}>
              <span className="w-32 text-xs font-mono text-stone-600 truncate text-right">{ut}</span>
              <div className="flex-1 h-6 bg-stone-200/40 relative overflow-hidden flex">
                <div className="h-full bg-red-500/70" style={{ width: `${(v.abiertas / maxByUT) * 100}%` }} />
                <div className="h-full bg-amber-500/50" style={{ width: `${((v.total - v.abiertas) / maxByUT) * 100}%` }} />
                <span className="absolute inset-y-0 right-2 flex items-center text-xs font-mono font-semibold text-stone-700">
                  {v.total} {v.criticas > 0 && <span className="ml-1 text-red-500">({v.criticas} ⚠)</span>}
                </span>
              </div>
              <ArrowUpRight className="w-3 h-3 text-stone-400 flex-shrink-0" strokeWidth={1.5} />
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-[11px] font-mono text-stone-500">
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500/70 inline-block" /> Abiertas</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-500/50 inline-block" /> Atendidas/Resueltas</span>
        </div>
      </div>

      {/* By Classification category */}
      {byCategory.length > 0 && (
        <div className="bg-stone-50 border border-stone-300/60 p-5">
          <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-stone-500 mb-4">Por clasificación</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {byCategory.map(c => (
              <div key={c.name} className="border border-stone-300/40 p-3 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <div>
                  <span className="text-sm font-semibold text-stone-800">{c.count}</span>
                  <span className="text-xs text-stone-500 ml-1.5">{c.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical open incidents table */}
      {criticalOpen.length > 0 && (
        <div className="bg-red-50/50 border border-red-300/40 p-5">
          <h3 className="text-xs font-mono uppercase tracking-[0.15em] text-red-600 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
            Incidencias críticas abiertas ({criticalOpen.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase tracking-widest text-stone-500 border-b border-red-200/60">
                  <th className="pb-2 pr-4">Poste</th>
                  <th className="pb-2 pr-4">UT</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Reportó</th>
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2">Días abierta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200/40">
                {criticalOpen.map(i => {
                  const post = posts.find(p => p.id === i.postId);
                  const diasAbierta = Math.floor((ahora - new Date(i.createdAt)) / 86400000);
                  return (
                    <tr key={i.id} className="hover:bg-red-100/30 cursor-pointer" onClick={() => onNavigate?.('abierta', i.postId)}>
                      <td className="py-2 pr-4 font-mono text-rose-600 text-xs underline">{i.postId}</td>
                      <td className="py-2 pr-4 text-xs text-stone-600">{post?.unidad_territorial || '—'}</td>
                      <td className="py-2 pr-4 text-xs text-stone-800">{i.type}</td>
                      <td className="py-2 pr-4 text-xs text-stone-600">{i.reportedByName || '—'}</td>
                      <td className="py-2 pr-4 text-xs font-mono text-stone-500">
                        {new Date(i.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="py-2">
                        <span className={`text-xs font-mono font-bold ${diasAbierta > 7 ? 'text-red-600' : diasAbierta > 3 ? 'text-amber-600' : 'text-stone-600'}`}>
                          {diasAbierta}d
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="text-center py-4 border-t border-stone-300/40">
        <p className="text-[11px] font-mono text-stone-400 uppercase tracking-widest">
          Generado automáticamente · Field Coord · {new Date().toLocaleString('es-MX')}
        </p>
      </div>
    </div>
  );
}

function InventoryView({ posts, onSelectPost }) {
  const [subtab, setSubtab] = useState('modems');
  const [search, setSearch] = useState('');
  const [filterUT, setFilterUT] = useState('todas');
  const [filterCrew, setFilterCrew] = useState('todas');
  const [filterModemType, setFilterModemType] = useState('todos');
  const [revealedPwd, setRevealedPwd] = useState({});
  const [page, setPage] = useState(0);
  const INV_PAGE_SIZE = 10;

  const modems = useMemo(() => posts
    .filter(p => p.stages.internet.done)
    .map(p => {
      const d = p.stages.internet;
      return {
        postId: p.id, ut: p.unidad_territorial, zona: p.zona_territorial,
        direccion: p.direccion, ts: d.ts,
        folio: d.attrs?.folio || '', telefono: d.attrs?.telefono || '',
        tipo_modem: d.attrs?.tipo_modem || '', usuario: d.attrs?.usuario || '',
        password: d.attrs?.password || '', ubicacion: d.attrs?.ubicacion_real || null,
      };
    }).sort((a, b) => b.ts - a.ts), [posts]);

  const cameraInstalls = useMemo(() => posts
    .filter(p => p.stages.camaras.done)
    .map(p => {
      const d = p.stages.camaras;
      const ptz = Number(d.attrs?.cantidad_ptz) || 0;
      const bullet = Number(d.attrs?.cantidad_bullet) || 0;
      const orientaciones = Array.isArray(d.attrs?.orientaciones_bullet) ? d.attrs.orientaciones_bullet : [];
      return {
        postId: p.id, ut: p.unidad_territorial, zona: p.zona_territorial,
        direccion: p.direccion, ts: d.ts,
        ptz, bullet, total: ptz + bullet, orientaciones,
        ubicacion: d.attrs?.ubicacion_real || null,
      };
    }).sort((a, b) => b.ts - a.ts), [posts]);

  const modemStats = useMemo(() => {
    const byType = { 'Blanco': 0, 'Negro': 0, 'Blanco conejito': 0, 'Sin tipo': 0 };
    modems.forEach(m => { byType[m.tipo_modem || 'Sin tipo'] = (byType[m.tipo_modem || 'Sin tipo'] || 0) + 1; });
    return { total: modems.length, byType };
  }, [modems]);

  const cameraStats = useMemo(() => {
    let ptz = 0, bullet = 0;
    cameraInstalls.forEach(c => { ptz += c.ptz; bullet += c.bullet; });
    return { postes: cameraInstalls.length, ptz, bullet, total: ptz + bullet };
  }, [cameraInstalls]);

  const utList = useMemo(() => [...new Set(posts.map(p => p.unidad_territorial))].sort(), [posts]);

  const filteredModems = modems.filter(m => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.postId.toLowerCase().includes(q) && !m.folio.toLowerCase().includes(q) &&
          !m.telefono.toLowerCase().includes(q) && !m.usuario.toLowerCase().includes(q) &&
          !m.direccion.toLowerCase().includes(q)) return false;
    }
    if (filterUT !== 'todas' && m.ut !== filterUT) return false;
    if (filterModemType !== 'todos' && m.tipo_modem !== filterModemType) return false;
    return true;
  });

  const filteredCameras = cameraInstalls.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.postId.toLowerCase().includes(q) && !c.direccion.toLowerCase().includes(q) &&
          !c.orientaciones.some(o => o.toLowerCase().includes(q))) return false;
    }
    if (filterUT !== 'todas' && c.ut !== filterUT) return false;
    return true;
  });

  // Paginación cliente del subtab activo (sin tocar la BD)
  useEffect(() => { setPage(0); }, [subtab, search, filterUT, filterCrew, filterModemType]);
  const activeList = subtab === 'modems' ? filteredModems : filteredCameras;
  const invTotalPages = Math.max(1, Math.ceil(activeList.length / INV_PAGE_SIZE));
  const invSafePage = Math.min(page, invTotalPages - 1);
  const pagedModems = filteredModems.slice(invSafePage * INV_PAGE_SIZE, (invSafePage + 1) * INV_PAGE_SIZE);
  const pagedCameras = filteredCameras.slice(invSafePage * INV_PAGE_SIZE, (invSafePage + 1) * INV_PAGE_SIZE);

  const exportCSV = (rows, name) => {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportModemsCSV = () => exportCSV([
    ['poste_id','ut','zona','direccion','folio','telefono','tipo_modem','usuario','password','cuadrilla','lat','lng','link','fecha'],
    ...filteredModems.map(m => [m.postId,m.ut,m.zona,m.direccion,m.folio,m.telefono,m.tipo_modem,m.usuario,m.password,'',m.ubicacion?.lat||'',m.ubicacion?.lng||'',m.ubicacion?.link||'',new Date(m.ts).toISOString()])
  ], 'modems');

  const exportCamerasCSV = () => exportCSV([
    ['poste_id','ut','zona','direccion','ptz','bullet','total','orientaciones_bullet','cuadrilla','lat','lng','fecha'],
    ...filteredCameras.map(c => [c.postId,c.ut,c.zona,c.direccion,c.ptz,c.bullet,c.total,c.orientaciones.join(' | '),'',c.ubicacion?.lat||'',c.ubicacion?.lng||'',new Date(c.ts).toISOString()])
  ], 'camaras');

  return (
    <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
      <div className="flex items-end justify-between border-b border-stone-300 pb-4 flex-wrap gap-2">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-1">Inventario desplegado</div>
          <h1 className="text-3xl font-light text-stone-950">Equipos instalados en campo</h1>
          <p className="text-sm text-stone-500 mt-1 font-mono">Modems con credenciales, cámaras con orientaciones y ubicación GPS</p>
        </div>
        <button onClick={subtab === 'modems' ? exportModemsCSV : exportCamerasCSV}
                className="flex items-center gap-2 px-3 py-2 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 text-xs font-mono uppercase tracking-widest transition-colors">
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> Exportar
        </button>
      </div>

      <div className="flex border border-stone-300">
        <button onClick={() => setSubtab('modems')}
                className={`flex-1 px-4 py-3 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${
                  subtab === 'modems' ? 'bg-pink-500/10 text-pink-400 border-b-2 border-pink-500' : 'text-stone-600 hover:bg-stone-50'
                }`}>
          <Wifi className="w-4 h-4" strokeWidth={1.5}/> Modems · {modemStats.total}
        </button>
        <button onClick={() => setSubtab('camaras')}
                className={`flex-1 px-4 py-3 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${
                  subtab === 'camaras' ? 'bg-rose-500/10 text-rose-400 border-b-2 border-rose-600' : 'text-stone-600 hover:bg-stone-50'
                }`}>
          <Camera className="w-4 h-4" strokeWidth={1.5}/> Cámaras · {cameraStats.total}
        </button>
      </div>

      {subtab === 'modems' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1">Total</div>
            <div className="text-2xl font-mono font-light text-stone-950 tabular-nums">{modemStats.total}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1">Blanco</div>
            <div className="text-2xl font-mono font-light text-stone-950 tabular-nums">{modemStats.byType['Blanco']}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1">Negro</div>
            <div className="text-2xl font-mono font-light text-stone-950 tabular-nums">{modemStats.byType['Negro']}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-pink-400 mb-1">Blanco conejito</div>
            <div className="text-2xl font-mono font-light text-pink-300 tabular-nums">{modemStats.byType['Blanco conejito']}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1">Postes con cámaras</div>
            <div className="text-2xl font-mono font-light text-stone-950 tabular-nums">{cameraStats.postes}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-violet-400 mb-1">PTZ</div>
            <div className="text-2xl font-mono font-light text-violet-300 tabular-nums">{cameraStats.ptz}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-sky-400 mb-1">Bullet</div>
            <div className="text-2xl font-mono font-light text-sky-300 tabular-nums">{cameraStats.bullet}</div>
          </div>
          <div className="bg-stone-100/40 border border-stone-300 p-4">
            <div className="text-[12px] font-mono uppercase tracking-widest text-rose-400 mb-1">Total cámaras</div>
            <div className="text-2xl font-mono font-light text-rose-300 tabular-nums">{cameraStats.total}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5}/>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                 placeholder={subtab === 'modems' ? 'Buscar ID, folio, teléfono, usuario, dirección…' : 'Buscar ID, dirección, orientación…'}
                 className="w-full bg-stone-100/60 border border-stone-300 pl-9 pr-3 py-2 text-sm text-stone-800 font-mono placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
        </div>
        <select value={filterUT} onChange={e => setFilterUT(e.target.value)}
                className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
          <option value="todas">Todas las UT</option>
          {utList.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filterCrew} onChange={e => setFilterCrew(e.target.value)}
                className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
          <option value="todas">Todas las cuadrillas</option>

        </select>
        {subtab === 'modems' && (
          <select value={filterModemType} onChange={e => setFilterModemType(e.target.value)}
                  className="bg-stone-100/60 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
            <option value="todos">Todos los tipos</option>
            {['Blanco', 'Negro', 'Blanco conejito'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div className="text-xs font-mono text-stone-500 ml-auto">
          {(subtab === 'modems' ? filteredModems : filteredCameras).length.toLocaleString()} resultados
        </div>
      </div>

      {subtab === 'modems' ? (
        <div className="border border-stone-300 bg-stone-100 divide-y divide-stone-300/50">
          {filteredModems.length === 0 && (
            <div className="px-6 py-16 text-center text-stone-500 font-mono text-sm">Sin modems instalados con estos filtros</div>
          )}
          {pagedModems.map(m => {
            const typeStyle = MODEM_TYPE_COLORS[m.tipo_modem] || { bg: 'bg-gray-100', border: 'border-stone-300', text: 'text-stone-600' };
            const pwdVisible = revealedPwd[m.postId];
            return (
              <div key={m.postId} className="p-4 hover:bg-rose-500/5 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => {
                      const post = posts.find(p => p.id === m.postId);
                      if (post) onSelectPost(post);
                    }} className="font-mono text-sm text-rose-500 hover:underline">
                      {m.postId}
                    </button>
                    <span className="text-[13px] font-mono text-stone-600">{m.ut}</span>
                    <span className={`px-2 py-0.5 text-[12px] font-mono uppercase tracking-widest ${typeStyle.bg} ${typeStyle.text} border ${typeStyle.border}`}>
                      {m.tipo_modem || 'Sin tipo'}
                    </span>
                  </div>
                  <div className="text-[12px] font-mono text-stone-500">
                    {new Date(m.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}
                    
                  </div>
                </div>
                <div className="text-[13px] text-stone-500 mb-3">{m.direccion}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Folio', m.folio],
                    ['Teléfono', m.telefono],
                    ['Usuario', m.usuario],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mb-0.5">{label}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-stone-800 truncate">{value || '—'}</span>
                        {value && (
                          <button onClick={() => navigator.clipboard?.writeText(value)}
                                  className="text-stone-500 hover:text-rose-500 flex-shrink-0" title="Copiar">
                            <Copy className="w-3 h-3" strokeWidth={1.5}/>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div>
                    <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mb-0.5 flex items-center gap-1">
                      Contraseña <Lock className="w-2.5 h-2.5" strokeWidth={1.5}/>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-rose-500 truncate">
                        {m.password ? (pwdVisible ? m.password : '••••••••') : '—'}
                      </span>
                      {m.password && (<>
                        <button onClick={() => setRevealedPwd({...revealedPwd,[m.postId]:!pwdVisible})}
                                className="text-stone-500 hover:text-rose-500 flex-shrink-0" title={pwdVisible ? 'Ocultar' : 'Mostrar'}>
                          {pwdVisible ? <EyeOff className="w-3 h-3" strokeWidth={1.5}/> : <Eye className="w-3 h-3" strokeWidth={1.5}/>}
                        </button>
                        <button onClick={() => navigator.clipboard?.writeText(m.password)}
                                className="text-stone-500 hover:text-rose-500 flex-shrink-0" title="Copiar">
                          <Copy className="w-3 h-3" strokeWidth={1.5}/>
                        </button>
                      </>)}
                    </div>
                  </div>
                </div>
                {m.ubicacion && (
                  <div className="mt-3 pt-3 border-t border-stone-300/50 flex items-center gap-3 text-[12px] font-mono">
                    <span className="text-stone-500">GPS:</span>
                    <span className="text-stone-600 tabular-nums">{Number(m.ubicacion.lat).toFixed(6)}, {Number(m.ubicacion.lng).toFixed(6)}</span>
                    <a href={m.ubicacion.link || `https://maps.google.com/?q=${m.ubicacion.lat},${m.ubicacion.lng}`}
                       target="_blank" rel="noopener noreferrer"
                       className="text-rose-500 hover:underline flex items-center gap-0.5">
                      Maps <ArrowUpRight className="w-2.5 h-2.5" strokeWidth={1.5}/>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-stone-300 bg-stone-100 divide-y divide-stone-300/50">
          {filteredCameras.length === 0 && (
            <div className="px-6 py-16 text-center text-stone-500 font-mono text-sm">Sin cámaras instaladas con estos filtros</div>
          )}
          {pagedCameras.map(c => (
            <div key={c.postId} className="p-4 hover:bg-rose-500/5 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => {
                    const post = posts.find(p => p.id === c.postId);
                    if (post) onSelectPost(post);
                  }} className="font-mono text-sm text-rose-500 hover:underline">
                    {c.postId}
                  </button>
                  <span className="text-[13px] font-mono text-stone-600">{c.ut}</span>
                  {c.ptz > 0 && (
                    <span className="px-2 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[12px] font-mono uppercase tracking-widest">
                      PTZ × {c.ptz}
                    </span>
                  )}
                  {c.bullet > 0 && (
                    <span className="px-2 py-0.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[12px] font-mono uppercase tracking-widest">
                      Bullet × {c.bullet}
                    </span>
                  )}
                </div>
                <div className="text-[12px] font-mono text-stone-500">
                  {new Date(c.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}
                  
                </div>
              </div>
              <div className="text-[13px] text-stone-500">{c.direccion}</div>
              {c.orientaciones.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {c.orientaciones.map((o, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px] font-mono">
                      <span className="px-1.5 py-0.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[13px] uppercase tracking-wider">B{i+1}</span>
                      <span className="text-stone-700 truncate">{o}</span>
                    </div>
                  ))}
                </div>
              )}
              {c.ubicacion && (
                <div className="flex items-center gap-3 text-[12px] font-mono">
                  <span className="text-stone-500">GPS:</span>
                  <span className="text-stone-600 tabular-nums">{Number(c.ubicacion.lat).toFixed(6)}, {Number(c.ubicacion.lng).toFixed(6)}</span>
                  <a href={c.ubicacion.link || `https://maps.google.com/?q=${c.ubicacion.lat},${c.ubicacion.lng}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-rose-500 hover:underline flex items-center gap-0.5">
                    Maps <ArrowUpRight className="w-2.5 h-2.5" strokeWidth={1.5}/>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {invTotalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
          <div className="text-xs font-mono text-stone-500">
            {activeList.length.toLocaleString()} {subtab === 'modems' ? 'modems' : 'cámaras'} · Página {invSafePage + 1} de {invTotalPages}
          </div>
          <div className="flex gap-1">
            <button disabled={invSafePage === 0} onClick={() => setPage(Math.max(0, invSafePage - 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
            </button>
            <button disabled={invSafePage >= invTotalPages - 1} onClick={() => setPage(Math.min(invTotalPages - 1, invSafePage + 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-rose-600/50 hover:text-rose-500 disabled:opacity-30 text-xs font-mono flex items-center gap-1">
              Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FIELD CREW VIEW
// ============================================================================

function FieldCrewView({ posts, activeCrewId, setActiveCrewId, onSelectPost }) {
  const crew = CREWS.find(c => c.id === activeCrewId);
  const myPosts = posts.filter(p => p.crewId === activeCrewId);

  const pendingStart = myPosts.filter(p => !p.blocked && completedStageCount(p) === 0);
  const inProgress = myPosts.filter(p => !p.blocked && completedStageCount(p) > 0 && currentStageOf(p).state !== 'completado');
  const done = myPosts.filter(p => !p.blocked && currentStageOf(p).state === 'completado');
  const blocked = myPosts.filter(p => p.blocked);

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-y-auto">
      <div className="bg-stone-100/60 border border-stone-300 p-4">
        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80 mb-2">Operando como</div>
        <select value={activeCrewId || ''} onChange={e => setActiveCrewId(e.target.value)}
                className="w-full bg-amber-50 border border-stone-300 px-3 py-2.5 text-base text-stone-950 font-mono focus:outline-none focus:border-rose-600/50">
          {CREWS.map(c => <option key={c.id} value={c.id}>{c.id} · {c.name} · {c.zone}</option>)}
        </select>
        {crew && (
          <div className="mt-2 text-xs text-stone-500 font-mono">
            Líder: {crew.leader} · {crew.members} operarios · {myPosts.length} postes
          </div>
        )}
      </div>

      <div>
        <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-stone-500 mb-1">Hoy</div>
        <h2 className="text-2xl text-stone-950 font-light">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-stone-100/40 border border-stone-300 p-3 text-center">
          <div className="text-2xl font-mono font-light text-emerald-500 tabular-nums">{done.length}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">Hechos</div>
        </div>
        <div className="bg-stone-100/40 border border-stone-300 p-3 text-center">
          <div className="text-2xl font-mono font-light text-rose-500 tabular-nums">{inProgress.length}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">En proc.</div>
        </div>
        <div className="bg-stone-100/40 border border-stone-300 p-3 text-center">
          <div className="text-2xl font-mono font-light text-stone-700 tabular-nums">{pendingStart.length}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">Por iniciar</div>
        </div>
        <div className="bg-stone-100/40 border border-stone-300 p-3 text-center">
          <div className="text-2xl font-mono font-light text-red-500 tabular-nums">{blocked.length}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">Bloq.</div>
        </div>
      </div>

      {[
        { title: 'En proceso', items: inProgress, color: '#F59E0B', icon: Activity },
        { title: 'Por iniciar', items: pendingStart, color: '#64748B', icon: Clock },
        { title: 'Bloqueados', items: blocked, color: '#EF4444', icon: AlertTriangle },
        { title: 'Completados', items: done, color: '#10B981', icon: CheckCircle2 },
      ].map(group => group.items.length > 0 && (
        <div key={group.title}>
          <div className="flex items-center gap-2 mb-2">
            <group.icon className="w-3.5 h-3.5" style={{ color: group.color }} strokeWidth={1.5} />
            <div className="text-xs font-mono uppercase tracking-widest text-stone-600">{group.title}</div>
            <div className="text-xs font-mono text-stone-500">({group.items.length})</div>
            <div className="flex-1 h-px bg-stone-100 ml-2" />
          </div>
          <div className="space-y-1.5">
            {group.items.slice(0, 10).map(p => {
              const cur = currentStageOf(p);
              return (
                <button key={p.id} onClick={() => onSelectPost(p)}
                        className="w-full p-3 bg-stone-100/40 border border-stone-300 hover:border-rose-600/40 transition-colors text-left">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-rose-500">{p.id}</span>
                        <span className="text-[12px] font-mono text-stone-500">{p.unidad_territorial}</span>
                      </div>
                      <div className="text-xs text-stone-700 truncate mt-0.5">{p.direccion}</div>
                      <div className="font-mono text-[12px] text-stone-500 tabular-nums mt-0.5">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-500 flex-shrink-0" strokeWidth={1.5} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <StagePipeline post={p} size="sm" />
                    <StatusChip post={p} />
                  </div>
                  {!p.blocked && cur.state === 'pendiente' && (
                    <div className="mt-2 text-[12px] font-mono flex items-center gap-1.5" style={{ color: cur.stage.color }}>
                      <ArrowUpRight className="w-3 h-3" strokeWidth={1.5}/>
                      Próximo: E{cur.stage.num} · {cur.stage.name}
                    </div>
                  )}
                </button>
              );
            })}
            {group.items.length > 10 && (
              <div className="text-center text-[13px] text-stone-500 font-mono pt-1">
                + {group.items.length - 10} más
              </div>
            )}
          </div>
        </div>
      ))}

      {myPosts.length === 0 && (
        <div className="text-center py-12 text-stone-500 font-mono text-sm border border-stone-300 border-dashed">
          Esta cuadrilla no tiene postes asignados
        </div>
      )}
    </div>
  );
}

// ============================================================================
// WHATSAPP COMPOSER — plantillas + selección + preview + envío
// ============================================================================

const WA_TEMPLATES = [
  {
    id: 'ruta_dia',
    name: 'Ruta del día',
    desc: 'Lista de postes asignados con links de Google Maps',
    Icon: Navigation,
    build: ({ posts, includeGPS, includeStage, includeAddress }) => {
      const header = `*Ruta del día*\n_${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}_\n\n`;
      const items = posts.map((p, i) => {
        const cur = currentStageOf(p);
        const estado = p.blocked ? '🔴 Bloqueado' : cur.state === 'completado' ? '✅ Completado' : `E${cur.stage.num} · ${cur.stage.name}`;
        let line = `*${i + 1}.* \`${p.id}\` · ${p.unidad_territorial}`;
        if (includeAddress) line += `\n📍 ${p.direccion || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}`;
        if (includeStage) line += `\n🧩 ${estado}`;
        if (includeGPS) line += `\n🗺️ https://maps.google.com/?q=${p.lat},${p.lng}`;
        return line;
      });
      return header + items.join('\n\n') + `\n\n_Total: ${posts.length} postes_`;
    },
  },
  {
    id: 'pendientes',
    name: 'Pendientes de etapa',
    desc: 'Postes que requieren completar una etapa específica',
    Icon: Clock,
    build: ({ posts, includeGPS, includeStage, includeAddress }) => {
      const header = `*Pendientes*\n\n`;
      const items = posts.map((p, i) => {
        const cur = currentStageOf(p);
        const next = p.blocked ? '🔴 Bloqueado' : cur.state === 'completado' ? '✅ Completado' : `Siguiente: E${cur.stage.num} · ${cur.stage.name}`;
        let line = `*${i + 1}.* \`${p.id}\` · ${p.unidad_territorial}`;
        if (includeAddress) line += `\n📍 ${p.direccion || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}`;
        if (includeStage) line += `\n➡️ ${next}`;
        if (includeGPS) line += `\n🗺️ https://maps.google.com/?q=${p.lat},${p.lng}`;
        return line;
      });
      return header + items.join('\n\n');
    },
  },
  {
    id: 'bloqueos',
    name: 'Postes bloqueados',
    desc: 'Reporte de bloqueos que requieren atención',
    Icon: AlertTriangle,
    build: ({ posts, includeGPS, includeStage, includeAddress }) => {
      const header = `*⚠️ Postes bloqueados*\n\n`;
      const items = posts.map((p, i) => {
        let line = `*${i + 1}.* \`${p.id}\` · ${p.unidad_territorial}`;
        if (includeAddress) line += `\n📍 ${p.direccion || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}`;
        if (includeStage) line += `\n🔴 Bloqueado`;
        if (includeGPS) line += `\n🗺️ https://maps.google.com/?q=${p.lat},${p.lng}`;
        return line;
      });
      return header + items.join('\n\n') + `\n\n_Requieren intervención inmediata_`;
    },
  },
  {
    id: 'convocatoria',
    name: 'Convocatoria punto de encuentro',
    desc: 'Cita en un punto específico',
    Icon: Radio,
    build: ({ posts, includeGPS }) => {
      if (!posts.length) return '';
      const p = posts[0];
      let msg = `*Punto de encuentro*\n\n`;
      msg += `📌 Poste \`${p.id}\`\n📍 ${p.direccion || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}\n🏷️ ${p.unidad_territorial} · ${p.zona_territorial}\n`;
      if (includeGPS) msg += `🗺️ https://maps.google.com/?q=${p.lat},${p.lng}\n`;
      msg += `\n_Confirmar al llegar_`;
      return msg;
    },
    maxPosts: 1,
  },
  {
    id: 'personalizado',
    name: 'Personalizado',
    desc: 'Edita el mensaje libremente',
    Icon: FileText,
    build: ({ posts, custom, includeGPS, includeStage, includeAddress }) => {
      const header = custom ? `${custom}\n\n` : '';
      const items = posts.map((p, i) => {
        const cur = currentStageOf(p);
        const estado = p.blocked ? '🔴 Bloqueado' : cur.state === 'completado' ? '✅ Completado' : `E${cur.stage.num}`;
        let line = `*${i + 1}.* \`${p.id}\``;
        if (includeAddress) line += ` · ${p.direccion || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`}`;
        if (includeStage) line += ` · ${estado}`;
        if (includeGPS) line += `\n🗺️ https://maps.google.com/?q=${p.lat},${p.lng}`;
        return line;
      });
      return header + items.join('\n');
    },
  },
];

function WhatsAppComposer({ posts, onClose, initialSelection = [] }) {
  const [templateId, setTemplateId] = useState('ruta_dia');
  const [recipientType, setRecipientType] = useState('open'); // 'open' abre WA para seleccionar contacto
  const [manualPhone, setManualPhone] = useState('');
  const [customText, setCustomText] = useState('');
  const [includeGPS, setIncludeGPS] = useState(true);
  const [includeAddress, setIncludeAddress] = useState(true);
  const [includeStage, setIncludeStage] = useState(true);
  const [selectionFilter, setSelectionFilter] = useState({ mode: initialSelection.length ? 'initial' : 'filtered', ut: 'todas', stage: 'todas' });
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelection.map(p => p.id)));
  const [copied, setCopied] = useState(false);

  const template = WA_TEMPLATES.find(t => t.id === templateId);

  // Candidatos según modo
  const candidates = useMemo(() => {
    let base = posts;
    if (selectionFilter.mode === 'filtered') {
      base = posts.filter(p => {
        if (selectionFilter.ut !== 'todas' && p.unidad_territorial !== selectionFilter.ut) return false;
        if (selectionFilter.stage !== 'todas') {
          const cur = currentStageOf(p);
          if (selectionFilter.stage === 'bloqueado' && !p.blocked) return false;
          if (selectionFilter.stage === 'completado' && (p.blocked || cur.state !== 'completado')) return false;
          if (selectionFilter.stage !== 'bloqueado' && selectionFilter.stage !== 'completado') {
            if (p.blocked || cur.state !== 'pendiente' || cur.stage.id !== selectionFilter.stage) return false;
          }
        }
        return true;
      });
    } else if (selectionFilter.mode === 'initial') {
      base = initialSelection.length ? posts.filter(p => selectedIds.has(p.id)) : [];
    }
    if (search) {
      const q = search.toLowerCase();
      base = base.filter(p => p.id.toLowerCase().includes(q) || (p.direccion || '').toLowerCase().includes(q) || (p.alias || '').toLowerCase().includes(q));
    }
    return base;
  }, [posts, selectionFilter, search, initialSelection, selectedIds]);

  // Aplicar auto-selección inicial según plantilla
  useEffect(() => {
    if (templateId === 'bloqueos') {
      const ids = posts.filter(p => p.blocked).map(p => p.id);
      setSelectedIds(new Set(ids));
      setSelectionFilter(f => ({ ...f, mode: 'manual' }));
    }
  }, [templateId]); // eslint-disable-line

  const selectedPosts = posts.filter(p => selectedIds.has(p.id));
  const effectivePosts = template.maxPosts ? selectedPosts.slice(0, template.maxPosts) : selectedPosts;

  const phone = recipientType === 'manual' ? manualPhone.replace(/\D/g, '') : '';

  const messageText = template.build({
    posts: effectivePosts,
    includeGPS, includeStage, includeAddress,
    custom: customText,
  });

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;
  const canSend = effectivePosts.length > 0 || messageText.length > 0;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(candidates.map(p => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  const copyMessage = () => {
    navigator.clipboard?.writeText(messageText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="ml-auto w-full max-w-5xl bg-amber-50 border-l border-stone-300 h-full overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-300 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Send className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-emerald-500">Coordinación</div>
              <h2 className="text-xl font-light text-stone-950">Enviar por WhatsApp</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-950 p-2">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden grid lg:grid-cols-[1fr_400px]">
          {/* Left panel: config */}
          <div className="overflow-y-auto p-6 space-y-5 border-r border-stone-300">
            {/* Step 1: Template */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-rose-700 text-stone-950 flex items-center justify-center text-[12px] font-mono font-bold">1</div>
                <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Plantilla</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {WA_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setTemplateId(t.id)}
                          className={`text-left p-3 border transition-colors ${
                            templateId === t.id
                              ? 'border-rose-600/60 bg-rose-500/5'
                              : 'border-stone-300 hover:border-stone-500 bg-stone-100/40'
                          }`}>
                    <div className="flex items-center gap-2">
                      <t.Icon className="w-4 h-4" strokeWidth={1.5}
                              style={{ color: templateId === t.id ? '#F59E0B' : '#71717A' }}/>
                      <div className="text-sm text-stone-800">{t.name}</div>
                    </div>
                    <div className="text-[13px] text-stone-500 mt-1">{t.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Step 2: Recipient */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-rose-700 text-stone-950 flex items-center justify-center text-[12px] font-mono font-bold">2</div>
                <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Destinatario</h3>
              </div>
              <div className="flex gap-1 mb-3 border border-stone-300">
                {[
                  { id: 'manual', label: 'Teléfono manual' },
                  { id: 'open', label: 'Elegir al enviar' },
                ].map(o => (
                  <button key={o.id} onClick={() => setRecipientType(o.id)}
                          className={`flex-1 px-3 py-2 text-xs font-mono uppercase tracking-wider ${
                            recipientType === o.id ? 'bg-rose-700 text-stone-950' : 'text-stone-600 hover:bg-stone-50'
                          }`}>{o.label}</button>
                ))}
              </div>
              {recipientType === 'manual' && (
                <div>
                  <input type="tel" value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                         placeholder="+52 55 1234 5678"
                         className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
                  <div className="text-[12px] text-stone-500 mt-1 font-mono">Incluye código de país. Se limpian caracteres no numéricos automáticamente.</div>
                </div>
              )}
              {recipientType === 'open' && (
                <div className="text-xs text-stone-500 font-mono p-3 border border-stone-300 bg-stone-100">
                  WhatsApp abrirá una pantalla para seleccionar el contacto antes de enviar.
                </div>
              )}
            </section>

            {/* Step 3: Posts selection */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-rose-700 text-stone-950 flex items-center justify-center text-[12px] font-mono font-bold">3</div>
                <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Postes</h3>
                <span className="ml-auto text-xs font-mono text-rose-500">{selectedIds.size} seleccionados</span>
              </div>

              <div className="flex gap-1 border border-stone-300 mb-3">
                {[
                  { id: 'initial', label: initialSelection.length ? 'Seleccionados' : 'Ninguno' },
                  { id: 'filtered', label: 'Por filtros' },
                  { id: 'manual', label: 'Manual' },
                ].map(o => (
                  <button key={o.id} onClick={() => setSelectionFilter({...selectionFilter, mode: o.id})}
                          className={`flex-1 px-2 py-1.5 text-[12px] font-mono uppercase tracking-wider ${
                            selectionFilter.mode === o.id ? 'bg-rose-700 text-stone-950' : 'text-stone-600 hover:bg-stone-50'
                          }`}>{o.label}</button>
                ))}
              </div>

              {selectionFilter.mode === 'filtered' && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select value={selectionFilter.ut} onChange={e => setSelectionFilter({...selectionFilter, ut: e.target.value})}
                          className="bg-stone-50 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                    <option value="todas">Todas UT</option>
                    {[...new Set(posts.map(p => p.unidad_territorial))].sort().map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select value={selectionFilter.stage} onChange={e => setSelectionFilter({...selectionFilter, stage: e.target.value})}
                          className="bg-stone-50 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                    <option value="todas">Todas etapas</option>
                    {STAGE_DEFS.map(s => <option key={s.id} value={s.id}>E{s.num} · {s.short}</option>)}
                    <option value="completado">Completado</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                  <select value={'todas'} onChange={() => {}} style={{display:'none'}}
                          className="bg-stone-50 border border-stone-300 px-2 py-1.5 text-xs text-stone-800 font-mono focus:outline-none focus:border-rose-600/50">
                    <option value="todas">Todas cuadrillas</option>
          
                  </select>
                </div>
              )}

              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5}/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                       className="w-full bg-stone-50 border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-800 font-mono placeholder-stone-500 focus:outline-none focus:border-rose-600/50" />
              </div>

              <div className="flex gap-2 mb-2">
                <button onClick={selectAll} className="text-[12px] font-mono uppercase tracking-wider text-rose-500 hover:underline">
                  Seleccionar todos ({candidates.length})
                </button>
                <button onClick={selectNone} className="text-[12px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-950">
                  Limpiar
                </button>
              </div>

              <div className="border border-stone-300 max-h-64 overflow-y-auto">
                {candidates.length === 0 && (
                  <div className="text-center py-6 text-stone-500 font-mono text-xs">Sin candidatos</div>
                )}
                {candidates.slice(0, 200).map(p => {
                  const isSel = selectedIds.has(p.id);
                  return (
                    <button key={p.id} onClick={() => toggleSelect(p.id)}
                            className={`w-full px-3 py-2 flex items-center gap-3 border-b border-stone-300/50 text-left transition-colors ${
                              isSel ? 'bg-rose-500/5' : 'hover:bg-stone-100/60'
                            }`}>
                      <div className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 ${
                        isSel ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300'
                      }`}>
                        {isSel && <CheckCircle2 className="w-3 h-3 text-stone-950" strokeWidth={3}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-rose-500">{p.id} · <span className="text-stone-600">{p.unidad_territorial}</span></div>
                        <div className="text-[13px] text-stone-500 truncate">{p.direccion}</div>
                      </div>
                      <StatusChip post={p} />
                    </button>
                  );
                })}
                {candidates.length > 200 && (
                  <div className="text-center py-2 text-[12px] text-stone-500 font-mono">+ {candidates.length - 200} más (usa filtros para reducir)</div>
                )}
              </div>
            </section>

            {/* Step 4: Options */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-rose-700 text-stone-950 flex items-center justify-center text-[12px] font-mono font-bold">4</div>
                <h3 className="text-sm font-mono uppercase tracking-widest text-stone-700">Contenido</h3>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'gps', label: 'Incluir link de Google Maps', value: includeGPS, set: setIncludeGPS },
                  { key: 'addr', label: 'Incluir dirección', value: includeAddress, set: setIncludeAddress },
                  { key: 'stage', label: 'Incluir etapa actual', value: includeStage, set: setIncludeStage },
                ].map(opt => (
                  <button key={opt.key} onClick={() => opt.set(!opt.value)}
                          className="w-full flex items-center gap-3 px-3 py-2 border border-stone-300 hover:border-stone-500 text-left">
                    <div className={`w-4 h-4 border flex items-center justify-center ${
                      opt.value ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300'
                    }`}>
                      {opt.value && <CheckCircle2 className="w-3 h-3 text-stone-950" strokeWidth={3}/>}
                    </div>
                    <span className="text-xs text-stone-700">{opt.label}</span>
                  </button>
                ))}
              </div>

              {templateId === 'personalizado' && (
                <div className="mt-3">
                  <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">Mensaje libre</label>
                  <textarea value={customText} onChange={e => setCustomText(e.target.value)} rows={4}
                            placeholder="Escribe el encabezado o mensaje personalizado…"
                            className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-rose-600/50 resize-none" />
                </div>
              )}
            </section>
          </div>

          {/* Right panel: preview + send */}
          <div className="flex flex-col bg-[#0A1A14] overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-300 flex-shrink-0">
              <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-emerald-500 mb-1">Vista previa</div>
              <div className="text-xs text-stone-600 font-mono">
                {phone ? `Para: +${phone}` : recipientType === 'open' ? 'Al enviar, elige contacto' : 'Falta destinatario'}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2260%22%20height%3D%2260%22%3E%3Crect%20fill%3D%22%23083024%22%20width%3D%2260%22%20height%3D%2260%22%2F%3E%3Cpath%20d%3D%22M0%2030h60M30%200v60%22%20stroke%3D%22%23042d20%22%20stroke-width%3D%220.5%22%2F%3E%3C%2Fsvg%3E')]">
              <div className="ml-auto max-w-sm bg-[#005c4b] text-zinc-50 px-4 py-3 rounded-lg rounded-tr-sm shadow-xl whitespace-pre-wrap text-[13px] font-sans leading-relaxed">
                {messageText || <span className="italic text-stone-600">El mensaje aparecerá aquí</span>}
                <div className="text-[12px] text-emerald-200/60 text-right mt-1">
                  {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="text-center mt-3 text-[12px] font-mono text-emerald-700/60">
                {messageText.length} caracteres · {effectivePosts.length} postes
              </div>
            </div>
            <div className="p-4 border-t border-stone-300 bg-amber-50 space-y-2 flex-shrink-0">
              <div className="flex gap-2">
                <button onClick={copyMessage} disabled={!messageText}
                        className="flex-1 px-3 py-2.5 border border-stone-300 text-stone-700 hover:border-rose-600/50 disabled:opacity-30 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2">
                  {copied ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={1.5}/> Copiado</> :
                            <><Copy className="w-4 h-4" strokeWidth={1.5}/> Copiar texto</>}
                </button>
                <a href={canSend ? waUrl : '#'}
                   onClick={e => { if (!canSend) e.preventDefault(); }}
                   target="_blank" rel="noopener noreferrer"
                   className={`flex-[2] px-4 py-2.5 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${
                     canSend ? 'bg-emerald-500 text-stone-950 hover:bg-emerald-400' : 'bg-stone-100 text-stone-500 cursor-not-allowed'
                   }`}>
                  <Send className="w-4 h-4" strokeWidth={2}/> Abrir en WhatsApp
                </a>
              </div>
              <div className="text-[12px] font-mono text-stone-500 text-center">
                Se abre WhatsApp Web o la app móvil con el mensaje prellenado
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NAVEGACIÓN CATEGORIZADA (header desktop + sidemenu móvil)
// ============================================================================

// Categorías de navegación. Cada grupo referencia ids de appTabs; el orden
// dentro de tabIds define el orden de aparición. Los grupos/módulos se filtran
// luego según los permisos (appTabs ya viene filtrado por rol).
const NAV_GROUPS = [
  { id: 'dashboard',      label: 'Dashboard',      tabIds: ['dashboard', 'mipanel'] },
  { id: 'trabajo',        label: 'Trabajo',        tabIds: ['captura', 'scouting', 'mapa', 'postes'] },
  { id: 'administrativo', label: 'Administrativo', tabIds: ['incidencias', 'propuestas', 'inventario', 'usuarios', 'auditoria', 'informe', 'geo_v2'] },
];

// Resuelve NAV_GROUPS contra las pestañas visibles (appTabs) y descarta los
// grupos que queden sin módulos para el rol actual.
function buildNavGroups(appTabs) {
  return NAV_GROUPS
    .map(g => ({ ...g, tabs: g.tabIds.map(id => appTabs.find(t => t.id === id)).filter(Boolean) }))
    .filter(g => g.tabs.length > 0);
}

// Navegación del header en escritorio (lg+): categorías centradas con menú
// desplegable al pasar el cursor por encima. Resalta la categoría y el módulo
// activos. Las categorías con un solo módulo navegan directo (sin desplegable).
function DesktopNav({ groups, activeTab, setActiveTab }) {
  const [openGroup, setOpenGroup] = useState(null);
  return (
    <nav className="hidden lg:flex flex-1 items-center justify-center gap-1">
      {groups.map(g => {
        const isActiveGroup = g.tabs.some(t => t.id === activeTab);
        const single = g.tabs.length === 1;
        return (
          <div
            key={g.id}
            className="relative"
            onMouseEnter={() => setOpenGroup(g.id)}
            onMouseLeave={() => setOpenGroup(null)}
          >
            <button
              onClick={() => { if (single) setActiveTab(g.tabs[0].id); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider rounded transition-colors ${
                isActiveGroup
                  ? 'text-rose-600 bg-rose-500/10'
                  : 'text-stone-500 hover:text-rose-600 hover:bg-rose-500/10'
              }`}
            >
              <span>{g.label}</span>
              {!single && (
                <ChevronDown className={`w-3 h-3 transition-transform ${openGroup === g.id ? 'rotate-180' : ''}`} strokeWidth={1.5} />
              )}
            </button>
            {!single && openGroup === g.id && (
              // pt-1.5 actúa de puente para que el cursor llegue al menú sin cerrarlo
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-1.5 z-40">
                <div className="min-w-[200px] bg-stone-50 border border-stone-300 rounded-lg shadow-xl py-1.5">
                  {g.tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTab(t.id); setOpenGroup(null); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-colors border-l-2 ${
                        activeTab === t.id
                          ? 'text-rose-600 bg-rose-500/10 border-rose-600'
                          : 'text-stone-600 hover:text-rose-600 hover:bg-rose-500/10 border-transparent'
                      }`}
                    >
                      <t.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function FieldCoordApp() {
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [posts, setPosts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [proposals, setProposals] = useState([]);

  // Autenticación y perfil del usuario
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPost, setSelectedPost] = useState(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [comparePair, setComparePair] = useState(null); // [A,B] comparar detalle 50/50
  const [initialStageId, setInitialStageId] = useState(null);
  const selectedPostRef = useRef(null);
  const postDetailHistoryRef = useRef(false);
  const filterCtx = useFilters();           // Postes (lista) + navegación desde Dashboard/Informe
  const mapFilterCtx = useFilters('map_');  // Mapa GPS — filtros independientes del módulo Postes
  const [postsPage, setPostsPage] = useState(readStoredPostsPage);
  const [incidenciasNav, setIncidenciasNav] = useState({ filter: 'abierta', search: '', ts: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [captureTarget, setCaptureTarget] = useState(null);
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('ci1215-theme') === 'dark'; } catch { return false; } });

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  // Sincroniza la clase .dark del <html> y persiste (aplica también al cargar)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('ci1215-theme', darkMode ? 'dark' : 'light'); } catch {}
  }, [darkMode]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [createPostDefaultStage, setCreatePostDefaultStage] = useState(null);
  // Edición de ubicación desde el mapa (drag de un poste)
  const [editingPostId, setEditingPostId] = useState(null);
  // Modo "+ Nuevo aquí" — click en mapa coloca un poste nuevo
  const [addingPostMode, setAddingPostMode] = useState(false);
  const [pendingNewPostCoord, setPendingNewPostCoord] = useState(null);
  // Reubicación — estado compartido por flujo drag y flujo manual del drawer
  const [relocateRequest, setRelocateRequest] = useState(null);
  const [relocateSubmitting, setRelocateSubmitting] = useState(false);
  const [relocateError, setRelocateError] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // Foco en mapa (jump desde Postes / Captura) — sin abrir drawer
  const [mapFocusPost, setMapFocusPost] = useState(null);
  const [mapFocusKey, setMapFocusKey] = useState(0);
  const [unidadesTerritoriales, setUnidadesTerritoriales] = useState([]);
  // PR B Lote 3: state para el modal de recuperar antena (admin)
  const [antenaModalPost, setAntenaModalPost] = useState(null);
  const [userNames, setUserNames] = useState({}); // {userId: displayName}

  // Admin: "Ver como" otro rol + preview celular
  const [viewAsRole, setViewAsRole] = useState(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  const realIsAdmin = profile ? authIsAdmin(profile) : false;

  // Derivados del profile — con override de "ver como"
  const effectiveProfile = viewAsRole ? { ...profile, role: viewAsRole } : profile;
  const userRole = effectiveProfile?.role || null;
  const isAdmin = viewAsRole ? viewAsRole === 'admin' : (profile ? authIsAdmin(profile) : false);
  const isDirector = viewAsRole ? viewAsRole === 'director' : (profile ? authIsDirector(profile) : false);
  const isCapturador = viewAsRole ? viewAsRole === 'capturador' : (profile ? authIsCapturador(profile) : false);
  const isScout = viewAsRole ? viewAsRole === 'scout' : (profile ? authIsScout(profile) : false);
  const isRAAL = viewAsRole ? viewAsRole === 'raal' : (profile ? authIsRAAL(profile) : false);
  const isCoordinador = viewAsRole ? (viewAsRole === 'servicios_urbanos' || viewAsRole === 'participacion_ciudadana') : (profile ? authIsCoordinador(profile) : false);
  const readOnly = isDirector || isCoordinador;
  const raalReadOnlyPostes = isRAAL; // RAAL can capture but not edit postes in drawer
  const canDelete = isAdmin;

  const inventoryTotals = useMemo(() => {
    let modems = 0, modemsBlanco = 0, modemsNegro = 0, modemsConejito = 0;
    let ptz = 0, bullet = 0, camPostes = 0;
    posts.forEach(p => {
      if (p.stages.internet?.done) {
        modems++;
        const t = p.stages.internet.attrs?.tipo_modem;
        if (t === 'Blanco') modemsBlanco++;
        else if (t === 'Negro') modemsNegro++;
        else if (t === 'Blanco conejito') modemsConejito++;
      }
      if (p.stages.camaras?.done) {
        camPostes++;
        ptz += Number(p.stages.camaras.attrs?.cantidad_ptz) || 0;
        bullet += Number(p.stages.camaras.attrs?.cantidad_bullet) || 0;
      }
    });
    return { modems, modemsBlanco, modemsNegro, modemsConejito, ptz, bullet, camTotal: ptz + bullet, camPostes };
  }, [posts]);

  // -------------------------------------------------------------------
  // AUTH: subscribe a cambios de sesión
  // -------------------------------------------------------------------
  useEffect(() => {
    let unsubscribe = null;
    (async () => {
      try {
        const s = await getCurrentSession();
        setSession(s);
        unsubscribe = onAuthChange((newSession) => {
          // PASO_9_AUTH_REFRESH_FIX:
          // Si solo cambio el JWT (mismo usuario), mantener la session anterior.
          // El SDK de Supabase ya maneja el nuevo token internamente; aqui solo
          // evitamos que React detecte un cambio espurio que dispare useEffects
          // dependientes (loadCurrentProfile -> setProfile -> refreshData -> 11
          // requests a post_stages cada vez que el usuario cambia de pestana).
          setSession(prev => {
            if (prev && newSession && prev.user?.id === newSession.user?.id) {
              return prev; // misma referencia, React no re-renderiza
            }
            return newSession; // sesion realmente cambio (login/logout/usuario distinto)
          });
          if (!newSession) {
            // Logout: limpiar todo
            setProfile(null);
            setPosts([]);
            setIncidents([]);
            setLoaded(false);
          }
        });
      } catch (e) {
        console.error('Auth init failed:', e);
        setSession(null); // Show login screen instead of infinite spinner
      }
    })();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // -------------------------------------------------------------------
  // AUTH: cargar perfil cuando hay sesión
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    loadCurrentProfile()
      .then(p => {
        if (!p) {
          setProfileError('Tu cuenta no tiene un rol asignado. Contacta al administrador.');
          setProfile(null);
        } else {
          setProfile(p);
        }
      })
      .catch(e => {
        console.error('loadCurrentProfile failed', e);
        setProfileError(e?.message || 'Error cargando perfil');
        setProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [session]);

  useEffect(() => {
    if (!profile) {
      setUserContext();
      setActiveView(null);
      return;
    }
    setUserContext({
      user_id: profile.userId,
      user_email: profile.email,
      user_role: profile.role,
    });
  }, [profile]);

  useEffect(() => {
    setActiveView(profile ? activeTab : null);
  }, [profile, activeTab]);

  useEffect(() => {
    try { localStorage.setItem(POSTS_PAGE_STORAGE_KEY, String(postsPage)); } catch {}
  }, [postsPage]);

  useEffect(() => {
    selectedPostRef.current = selectedPost;
  }, [selectedPost]);

  useEffect(() => {
    const onPopState = () => {
      if (!selectedPostRef.current || !postDetailHistoryRef.current) return;
      postDetailHistoryRef.current = false;
      setSelectedPost(null);
      setInitialStageId(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openPostDetail = useCallback((post, stageId = null) => {
    if (activeTab === 'postes' && !selectedPostRef.current && !postDetailHistoryRef.current) {
      try {
        window.history.pushState({ ci1215PostDetail: post.id }, '', window.location.href);
        postDetailHistoryRef.current = true;
      } catch {}
    }
    setSelectedPost(post);
    setInitialStageId(stageId);
  }, [activeTab]);

  const closePostDetail = useCallback(() => {
    setSelectedPost(null);
    setInitialStageId(null);
    if (!postDetailHistoryRef.current) return;
    postDetailHistoryRef.current = false;
    try { window.history.back(); } catch {}
  }, []);

  // -------------------------------------------------------------------
  // DATA: cargar una vez tenemos perfil válido + auto-refresh cada 30s
  // -------------------------------------------------------------------
  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const { posts: p, incidents: i, unidadesTerritoriales: uts } = await loadAllData();
      setPosts(p);
      setSelectedPost(prev => prev ? (p.find(x => x.id === prev.id) || prev) : prev);
      setIncidents(i);
      setUnidadesTerritoriales(uts || []);
      setLastRefresh(Date.now());

      if (!silent) {
        try { const props = await loadProposals(); setProposals(props); } catch (e) { console.warn('proposals load:', e); }
      }

      // Resolver nombres de usuarios que capturaron etapas
      const allUserIds = new Set();
      for (const post of p) {
        for (const sid of Object.keys(post.stages)) {
          const s = post.stages[sid];
          if (s.capturedBy) allUserIds.add(s.capturedBy);
          if (s.verifiedBy) allUserIds.add(s.verifiedBy);
        }
      }
      for (const inc of i) {
        if (inc.capturedBy) allUserIds.add(inc.capturedBy);
      }
      if (allUserIds.size > 0) {
        try {
          const names = await loadUserNames([...allUserIds]);
          setUserNames(names);
        } catch (e) { console.warn('loadUserNames failed', e); }
      }
    } catch (e) {
      if (!silent) {
        console.error('load failed', e);
        alert('No se pudo cargar datos.\n\n' + (e?.message || e));
        setPosts([]);
        setIncidents([]);
      } else {
        console.warn('silent refresh failed', e);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    if (!profile) return;
    // Capturadores van directo a Captura, scouts a Scouting
    if (profile.role === 'capturador') setActiveTab('captura');
    if (profile.role === 'scout') setActiveTab('scouting');
    (async () => {
      await refreshData(false);
      setLoaded(true);
    })();
  }, [profile, refreshData]);

  // Auto-refresh DESACTIVADO a propósito: la recarga automática (cada 30s y al
  // volver a la pestaña/ventana) reiniciaba el mapa y hacía perder el seguimiento
  // del trabajo. La actualización ahora es manual, con el botón de refrescar.

  // -------------------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------------------
  const handleLogout = async () => {
    try {
      await signOut();
      // el listener de onAuthChange se encarga del resto
    } catch (e) {
      console.error('signOut failed', e);
      alert('Error al cerrar sesión: ' + (e?.message || e));
    }
  };

  // === Edición de ubicación / creación desde mapa ===
  const handleStartEditPosition = useCallback((postId) => {
    setSelectedPost(null);  // cerrar drawer si está abierto
    setAddingPostMode(false);
    setEditingPostId(postId);
  }, []);

  const handleCancelRelocate = useCallback(() => {
    setEditingPostId(null);
  }, []);

  const handleToggleAddingMode = useCallback(() => {
    setEditingPostId(null);
    setAddingPostMode(prev => !prev);
  }, []);

  const handleMapClickForNewPost = useCallback((lat, lng) => {
    setAddingPostMode(false);
    setPendingNewPostCoord({ lat, lng });
    setShowCreatePost(true);
  }, []);

  const updatePost = useCallback(async (updated, alreadyPersisted = false) => {
    if (readOnly) {
      alert('Tu cuenta (director) tiene acceso de solo lectura.');
      return;
    }
    // Optimistic update en UI
    const withTimestamp = { ...updated, lastUpdate: Date.now() };
    setPosts(prev => prev.map(p => p.id === updated.id ? withTimestamp : p));
    setSelectedPost(prev => prev?.id === updated.id ? withTimestamp : prev);

    // Skip DB write if already persisted by atomic RPC
    if (alreadyPersisted) return;

    // Legacy path — uses savePost (writes all 7 stages)
    try {
      await dbSavePost(withTimestamp);
    } catch (e) {
      console.error('savePost failed', e);
      alert('No se pudo guardar el cambio. Revisa tu conexión.\n\n' + (e?.message || e));
    }
  }, [readOnly]);

  // Drag end del mapa → abre el modal compartido de confirmación.
  // El modal recolecta motivo + nota y dispara handleRelocateConfirm.
  const handleConfirmRelocate = useCallback((postId, newLat, newLng) => {
    const post = posts.find(p => p.id === postId);
    if (!post) { setEditingPostId(null); return; }
    setRelocateRequest({
      postId: post.id,
      postLabel: postDisplayId(post),
      coordsAnterior: { lat: post.lat, lng: post.lng },
      coordsNueva:    { lat: newLat,  lng: newLng  },
      source: 'drag',
    });
  }, [posts]);

  // Confirmación del modal → RPC relocate_post (atómico).
  const handleRelocateConfirm = useCallback(async (payload) => {
    if (!relocateRequest) return;
    setRelocateSubmitting(true);
    setRelocateError(null);

    const result = await relocatePost({
      postId:     relocateRequest.postId,
      motivo:     payload.motivo,
      nota:       payload.nota,
      latNueva:   payload.latNueva,
      lngNueva:   payload.lngNueva,
      distanciaM: payload.distanciaM,
    });

    setRelocateSubmitting(false);
    if (!result.ok) {
      setRelocateError(result.error);
      return;
    }

    // Aplica el resultado al state local (RPC devuelve snake_case → mapeo a camelCase)
    const r = result.data;
    const patch = {
      lat: r.lat,
      lng: r.lng,
      latOriginal: r.lat_original != null ? Number(r.lat_original) : null,
      lngOriginal: r.lng_original != null ? Number(r.lng_original) : null,
      reubicado: r.reubicado,
      reubicadoAt: r.reubicado_at,
      reubicadoPor: r.reubicado_por,
      lastUpdate: Date.now(),
    };
    setPosts(prev => prev.map(p => p.id === r.post_id ? { ...p, ...patch } : p));
    setSelectedPost(prev => prev?.id === r.post_id ? { ...prev, ...patch } : prev);

    setRelocateRequest(null);
    setEditingPostId(null);
    setHistoryRefreshKey(k => k + 1);
  }, [relocateRequest]);

  // Cerrar modal sin confirmar (cancel / click fuera / Esc)
  const handleRelocateClose = useCallback(() => {
    if (relocateSubmitting) return;
    setRelocateRequest(null);
    setRelocateError(null);
    setEditingPostId(null);  // snap-back si fue drag
  }, [relocateSubmitting]);

  // Metadata-only update (alias, dirección, UT, coords) — atomic RPC, never touches stages
  const updatePostMeta = useCallback(async (postId, fields) => {
    try {
      await updatePostMetadata(postId, fields);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...fields, lastUpdate: Date.now() } : p));
      setSelectedPost(prev => prev?.id === postId ? { ...prev, ...fields, lastUpdate: Date.now() } : prev);
    } catch (e) {
      console.error('updatePostMeta failed', e);
      alert('No se pudo guardar. ' + (e?.message || e));
    }
  }, []);

  const createIncident = useCallback(async (data) => {
    if (!canManageIncidents(profile)) {
      alert('No tenés permisos para crear incidencias.');
      throw new Error('Sin permisos para crear incidencias.');
    }
    // Validate user_note is provided
    if (!data.userNote?.trim() && !data.sourceNote?.trim() && !data.description?.trim()) {
      alert('Se requiere una nota explicativa para levantar la incidencia.');
      throw new Error('Se requiere una nota explicativa para levantar la incidencia.');
    }
    try {
      // Rama catalogo: si llegan categoryIds, usar la RPC que crea N incidencias clasificadas
      if (Array.isArray(data.categoryIds) && data.categoryIds.length > 0) {
        const res = await createIncidentsFromCatalog({
          postId: data.postId,
          categoryIds: data.categoryIds,
          severity: data.severity,
          note: data.userNote || data.description || '',
          stageId: data.stageId,
          sourceNote: data.sourceNote,
        });
        const reporter = profile?.display_name || profile?.email || 'Sin nombre';
        const nowMs = Date.now();
        const created = (res?.incidents || []).map(it => ({
          id: it.id,
          postId: data.postId,
          type: it.type,
          description: data.userNote || data.description || '',
          severity: data.severity,
          status: 'abierta',
          capturedBy: null,
          stageId: data.stageId || null,
          sourceNote: data.sourceNote || '',
          userNote: data.userNote || data.description || '',
          reportedByName: reporter,
          attendedBy: null, attendedByName: '', attendedAt: null, attendedNote: '', attendedPhotoUrl: null,
          resolvedBy: null, resolvedByName: '',
          createdAt: nowMs, resolvedAt: null,
          categoryId: it.category_id || null,
          categoryName: it.type || null,
          categoryColor: null,
        }));
        if (created.length > 0) setIncidents(prev => [...created, ...prev]);
        if (res?.blocked) {
          setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, blocked: true, lastUpdate: Date.now() } : p));
        }
        return { id: created[0]?.id, count: res?.count || created.length };
      }
      const newInc = await createIncidentAtomic({
        postId: data.postId,
        type: data.type,
        description: data.description,
        severity: data.severity,
        stageId: data.stageId,
        sourceNote: data.sourceNote,
        blockPost: data.blockPost || false,
        userNote: data.userNote || data.description || '',
        reportedByName: profile?.display_name || profile?.email || 'Sin nombre',
      });
      // Ensure new fields are present even if data.js doesn't map them yet
      const enrichedInc = {
        ...newInc,
        userNote: newInc.userNote || data.userNote || data.description || '',
        reportedByName: newInc.reportedByName || profile?.display_name || profile?.email || 'Sin nombre',
      };
      setIncidents(prev => [enrichedInc, ...prev]);
      // If blocked, update local post state
      if (data.blockPost) {
        setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, blocked: true, lastUpdate: Date.now() } : p));
      }
      return enrichedInc;
    } catch (e) {
      console.error('createIncident failed', e);
      alert('No se pudo crear la incidencia.\n\n' + (e?.message || e));
      throw e;
    }
  }, [profile]);

  const resolveIncident = useCallback(async (id) => {
    if (!canResolveIncidents(profile)) {
      alert('Solo admin o scout pueden verificar y resolver incidencias.'); return;
    }
    if (false && !canManageIncidents(profile)) {
      alert('No tenés permisos para resolver incidencias.');
      return;
    }
    try {
      const result = await resolveIncidentAtomic(id);
      // Update incidents in state
      setIncidents(prev => prev.map(i => i.id === id ? { ...i, status: 'resuelta', resolvedAt: Date.now() } : i));
      // Auto-unblock handled by RPC — sync local state
      if (result.autoUnblocked) {
        setPosts(prev => prev.map(p => p.id === result.postId ? { ...p, blocked: false, lastUpdate: Date.now() } : p));
      }
    } catch (e) {
      console.error('resolveIncident failed', e);
      alert('No se pudo resolver la incidencia.\n\n' + (e?.message || e));
    }
  }, [profile]);

  


  const attendIncident = useCallback(async (id, note, photoFile) => {
    if (!canAttendIncidents(profile) && !canResolveIncidents(profile)) {
      alert('No tienes permisos para marcar incidencias como atendidas.');
      throw new Error('Sin permisos para atender incidencias.');
    }
    try {
      // Upload photo first if provided
      let photoUrl = null;
      if (photoFile) {
        photoUrl = await uploadIncidentPhoto(id, photoFile);
      }
      const result = await attendIncidentAtomic(id, note, photoUrl);
      setIncidents(prev => prev.map(i => i.id === id ? {
        ...i,
        status: 'atendida',
        attendedBy: result.attendedBy,
        attendedByName: result.attendedByName,
        attendedAt: result.attendedAt,
        attendedNote: note || '',
        attendedPhotoUrl: photoUrl,
      } : i));
    } catch (e) {
      console.error('attendIncident failed', e);
      alert('No se pudo marcar como atendida. ' + (e?.message || e));
      throw e;
    }
  }, [profile]);


  const revertIncident = useCallback(async (id) => {
    if (!canResolveIncidents(profile)) {
      alert('Solo admin o scout pueden devolver incidencias.');
      return;
    }
    if (!window.confirm('Devolver esta incidencia a estado "abierta"? Se borrarán los datos de atención (nota y foto).')) return;
    try {
      const result = await revertIncidentToOpen(id);
      setIncidents(prev => prev.map(i => i.id === id ? {
        ...i, status: 'abierta',
        attendedBy: null, attendedByName: '', attendedAt: null,
        attendedNote: '', attendedPhotoUrl: null,
        resolvedAt: null, resolvedBy: null, resolvedByName: '',
      } : i));
      if (result?.post_id) {
        setPosts(prev => prev.map(p => p.id === result.post_id ? { ...p, blocked: true, lastUpdate: Date.now() } : p));
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    }
  }, [profile]);

  const deleteIncident = useCallback(async (id) => {
    if (!isAdmin) {
      alert('Solo administradores pueden borrar incidencias.');
      return;
    }
    if (!window.confirm('¿Borrar esta incidencia? Esta acción no se puede deshacer.')) return;
    try {
      const result = await deleteIncidentAtomic(id);
      setIncidents(prev => prev.filter(i => i.id !== id));
      if (result.autoUnblocked) {
        setPosts(prev => prev.map(p => p.id === result.postId ? { ...p, blocked: false, lastUpdate: Date.now() } : p));
      }
    } catch (e) {
      console.error('deleteIncident failed', e);
      alert('No se pudo borrar la incidencia. ' + (e?.message || e));
    }
  }, [isAdmin]);

  const resetData = async () => {
    if (!canDelete) {
      alert('Solo los administradores pueden borrar todos los datos.');
      return;
    }
    if (!window.confirm('Esto va a borrar TODOS los postes, etapas e incidencias de la base de datos. ¿Continuar?')) {
      setShowResetConfirm(false);
      return;
    }
    try {
      await dbResetAll();
      setPosts([]);
      setIncidents([]);
      setShowResetConfirm(false);
      setSelectedPost(null);
      alert('Datos borrados.');
    } catch (e) {
      console.error('resetData failed', e);
      alert('Error al borrar los datos.\n\n' + (e?.message || e));
    }
  };

  const handleVerifyStage = useCallback(async (postId, stageId) => {
    if (!isAdmin) { alert('Solo los administradores pueden verificar etapas.'); return; }
    try {
      const result = await dbVerifyStage(postId, stageId);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return { ...p, stages: { ...p.stages, [stageId]: { ...p.stages[stageId], ...result } } };
      }));
      // Actualizar userNames con el admin que verificó
      if (result.verifiedBy && !userNames[result.verifiedBy]) {
        loadUserNames([result.verifiedBy]).then(names => setUserNames(prev => ({ ...prev, ...names }))).catch(() => {});
      }
    } catch (e) { alert('Error al verificar: ' + (e?.message || e)); }
  }, [isAdmin, userNames]);

  const handleUnverifyStage = useCallback(async (postId, stageId) => {
    if (!isAdmin) return;
    try {
      const result = await dbUnverifyStage(postId, stageId);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return { ...p, stages: { ...p.stages, [stageId]: { ...p.stages[stageId], ...result } } };
      }));
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  }, [isAdmin]);

  const handleDeletePost = useCallback(async (postId) => {
    if (!isAdmin) { alert('Solo administradores pueden borrar postes.'); return; }
    if (!window.confirm(`¿Estás seguro de borrar el poste ${postId}?\n\nSe borrarán todas sus etapas, fotos, incidencias y datos de scouting. Esta acción NO se puede deshacer.`)) return;
    try {
      await dbDeletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      closePostDetail();
    } catch (e) {
      alert('Error al borrar: ' + (e?.message || e));
    }
  }, [isAdmin, closePostDetail]);

  const handleApprovePost = useCallback(async (postId, approve) => {
    if (!isAdmin) return;
    try {
      const { approvePost: doApprove, unapprovePost: doUnapprove } = await import('./lib/data.js');
      if (approve) {
        const result = await doApprove(postId);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, adminApproved: true, approvedBy: result.approvedBy, approvedAt: result.approvedAt } : p));
      } else {
        await doUnapprove(postId);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, adminApproved: false, approvedBy: null, approvedAt: null } : p));
      }
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  }, [isAdmin]);

  const handlePostCreated = (newPost) => {
    setPosts(prev => [...prev, newPost]);
    setShowCreatePost(false);
    // No abrir drawer para capturadores
    if (!isCapturador) setSelectedPost(newPost);
  };

  const appTabs = [
    { id: 'dashboard',   label: 'Dashboard',    icon: BarChart3,     show: isAdmin || isDirector || isCoordinador || isRAAL },
    { id: 'mipanel',     label: 'Mi Panel',     icon: Users,         show: isCapturador || isScout || isCoordinador || isRAAL },
    { id: 'captura',     label: 'Captura',       icon: Compass,       show: isAdmin || isCapturador || isRAAL || isScout },
    { id: 'scouting',    label: 'Scouting',      icon: Eye,           show: isAdmin || isScout || isCapturador || isCoordinador },
    { id: 'mapa',        label: 'Mapa GPS',     icon: MapPin,        show: true },
    { id: 'postes',      label: 'Postes',       icon: Briefcase,     show: isAdmin || isDirector || isCoordinador || isRAAL },
    { id: 'incidencias', label: 'Incidencias',  icon: AlertTriangle, show: true },
    { id: 'propuestas',  label: 'Propuestas',   icon: FileText,      show: isAdmin || isCoordinador },
    { id: 'inventario',  label: 'Inventario',   icon: Package,       show: isAdmin || isDirector },
    { id: 'usuarios',    label: 'Usuarios',     icon: Users,         show: isAdmin },
    { id: 'auditoria',   label: 'Auditoría',    icon: ListChecks,    show: isAdmin || isDirector },
    { id: 'informe',     label: 'Informe',      icon: ClipboardList, show: isAdmin || isDirector },
    { id: 'geo_v2',      label: 'Geo v2',       icon: Layers,        show: isAdmin || isDirector || isCoordinador },
  ].filter(t => t.show);

  // Navegación categorizada (header desktop + sidemenu móvil), derivada de appTabs.
  const navGroups = buildNavGroups(appTabs);

  // ---- LOGIN GATE ----
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="inline-block w-12 h-12 border-2 border-rose-600/20 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) {
    return <LoginScreen onLogin={() => getCurrentSession().then(s => setSession(s))} />;
  }
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-2 border-rose-600/20 border-t-rose-500 rounded-full animate-spin mb-4" />
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500">Cargando perfil…</div>
        </div>
      </div>
    );
  }
  if (profileError || !profile) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-stone-950 mb-2">Acceso no configurado</h2>
          <p className="text-sm text-stone-600 mb-4">{profileError || 'Tu cuenta no tiene un rol asignado. Contacta al administrador del sistema.'}</p>
          <button onClick={handleLogout} className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm rounded-lg">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-2 border-rose-600/20 border-t-rose-500 rounded-full animate-spin mb-4" />
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500">Cargando datos del proyecto…</div>
        </div>
      </div>
    );
  }

  const appContent = (
    <div className={`min-h-screen bg-amber-50 text-stone-950 flex flex-col ${mobilePreview ? 'max-w-[390px] mx-auto border-x border-stone-300 shadow-2xl' : ''}`}>
      <EstadoConexion />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        body, html, * { font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif; }
        .font-mono, [class*="font-mono"] { font-family: 'IBM Plex Mono', ui-monospace, monospace !important; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #27272a; }
        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>

      {/* Header */}
      <header className={`border-b ${__BUILD_ENV__ === 'v3' ? 'border-b-[2.5px] border-teal-300' : 'border-stone-300'} bg-stone-50 backdrop-blur-md sticky top-0 z-30`}>
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-5 min-w-0">
            <button onClick={() => setSidebarOpen(o => !o)} className="lg:hidden text-stone-600 hover:text-stone-950">
              <Menu className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 md:w-9 md:h-9 bg-rose-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5 text-white" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-[10px] md:text-[12px] font-mono uppercase tracking-[0.15em] text-rose-600 leading-none font-semibold truncate">
                    <span className="hidden sm:inline">Alcaldía GAM · ¡Late con fuerza!</span>
                    <span className="sm:hidden">CI1215</span>
                  </div>
                  {__BUILD_ENV__ === 'v3' && (
                    <span className="text-[8px] md:text-[9px] font-mono uppercase tracking-wider px-1.5 py-[1px] rounded bg-teal-50 text-teal-700 border border-teal-200 flex-shrink-0">v3</span>
                  )}
                </div>
                <div className="text-[10px] md:text-xs font-mono text-stone-600 truncate">
                  {posts.length} postes · v{__BUILD_VERSION__}
                  {__BUILD_ENV__ === 'v3' && <span className="text-teal-600"> · v3</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Navegación centrada por categorías (solo escritorio) */}
          <DesktopNav groups={navGroups} activeTab={activeTab} setActiveTab={setActiveTab} />

          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Admin: Ver como otro rol */}
            {realIsAdmin && (
              <select value={viewAsRole || ''} onChange={e => { setViewAsRole(e.target.value || null); setActiveTab('dashboard'); }}
                className="bg-stone-100 border border-stone-300 text-stone-700 text-[10px] font-mono rounded h-7 px-1.5 focus:outline-none max-w-[100px] md:max-w-none"
                title="Ver como otro rol">
                <option value="">👁 Admin</option>
                <option value="capturador">👁 Capturador</option>
                <option value="scout">👁 Scout</option>
                <option value="director">👁 Director</option>
                <option value="servicios_urbanos">👁 Serv.Urb</option>
                <option value="participacion_ciudadana">👁 Part.Ciud</option>
                <option value="raal">👁 RAAL</option>
              </select>
            )}

            {/* Simulando badge */}
            {viewAsRole && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono font-bold hidden sm:inline">SIMULANDO</span>}

            <div className="hidden md:flex items-center gap-2 h-7 px-2 border border-stone-300 rounded font-mono text-[11px] uppercase tracking-widest text-stone-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sync
            </div>

            <div className="hidden sm:flex items-center gap-1.5 h-7 px-2 border border-stone-300 rounded text-[11px] font-mono">
              <span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded-full font-bold ${
                isAdmin ? 'bg-rose-700/20 text-rose-500'
                : isDirector ? 'bg-purple-500/20 text-purple-400'
                : isScout ? 'bg-emerald-500/20 text-emerald-500'
                : isCoordinador ? 'bg-orange-500/20 text-orange-500'
                : isRAAL ? 'bg-amber-500/20 text-amber-600'
                : 'bg-blue-500/20 text-blue-400'
              }`}>{viewAsRole || profile.role}</span>
              <span className="text-stone-600 hidden md:inline">{profile.displayName}</span>
            </div>

            <button onClick={() => setShowWhatsApp(true)}
                    className="hidden sm:flex items-center gap-1 h-7 px-2 border border-emerald-500/40 rounded text-emerald-500 hover:bg-emerald-500/10 text-[11px] font-mono uppercase tracking-widest transition-colors">
              <Send className="w-3 h-3" strokeWidth={2}/>
              <span className="hidden md:inline">WA</span>
            </button>

            <button onClick={() => refreshData(false)} disabled={refreshing}
                    className={`h-7 w-7 flex items-center justify-center border border-stone-300 text-stone-600 hover:text-rose-500 transition-colors rounded ${refreshing ? 'animate-spin text-rose-400' : ''}`}
                    title={lastRefresh ? `Última actualización: ${new Date(lastRefresh).toLocaleTimeString('es-MX')}` : 'Recargar datos'}>
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>

            <button onClick={toggleDarkMode}
                    className="h-7 w-7 flex items-center justify-center border border-stone-300 text-stone-600 hover:text-rose-500 transition-colors rounded" title={darkMode ? 'Modo claro' : 'Modo oscuro'}>
              {darkMode ? <Sun className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />}
            </button>

            <button onClick={handleLogout}
                    className="h-7 w-7 flex items-center justify-center text-stone-500 hover:text-red-400 transition-colors rounded" title="Cerrar sesión">
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Backdrop con blur: cierra el menú al tocar afuera (solo móvil) */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            className="lg:hidden fixed top-[53px] left-0 right-0 bottom-0 z-10 bg-stone-900/10 backdrop-blur-sm transition-opacity"
          />
        )}
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                        fixed top-[53px] left-0 h-[calc(100vh-53px)]
                        w-60 border-r border-stone-300 bg-amber-50 z-20 flex flex-col transition-transform lg:hidden`}>
          <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
            {navGroups.map(g => (
              <div key={g.id}>
                <div className="px-3 mb-1 text-[10px] font-mono uppercase tracking-[0.25em] text-stone-400">{g.label}</div>
                <div className="space-y-0.5">
                  {g.tabs.map(t => (
                    <button key={t.id} onClick={() => { setActiveTab(t.id); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-mono uppercase tracking-wider transition-colors ${
                              activeTab === t.id
                                ? 'bg-rose-500/10 text-rose-500 border-l-2 border-rose-600'
                                : 'text-stone-500 hover:text-stone-950 hover:bg-stone-50 border-l-2 border-transparent'
                            }`}>
                      <t.icon className="w-4 h-4" strokeWidth={1.5} />
                      <span className="text-xs">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-stone-300">
            <div className="text-[13px] font-mono uppercase tracking-[0.25em] text-stone-500 mb-2">Stages del pipeline</div>
            {STAGE_DEFS.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[12px] font-mono text-stone-500 mb-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="truncate">{s.num}. {s.name}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'dashboard' && !isRAAL && <Dashboard posts={posts} incidents={incidents} inventoryTotals={inventoryTotals} setActiveTab={setActiveTab}
            onNavigatePostes={(f) => { filterCtx.setFilters(prev => ({ ...prev, stages: f.stage && f.stage !== 'todas' ? [f.stage] : [], uts: f.ut && f.ut !== 'todas' ? [f.ut] : [] })); setActiveTab('postes'); }} />}
          {activeTab === 'dashboard' && isRAAL && <RAALDashboard posts={posts} />}
          {activeTab === 'mipanel' && <MiPanel posts={posts} incidents={incidents} profile={profile} userRole={userRole} stageDefs={STAGE_DEFS} />}
          {activeTab === 'geo_v2' && <GeoV2View userRole={userRole} />}
          {activeTab === 'mapa' && (
            <div className="h-full flex flex-col">
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-300 flex items-center gap-3 flex-wrap">
                <div>
                  <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-rose-400/80">Vista geoespacial</div>
                  <h1 className="text-xl font-light text-stone-950">Mapa GPS</h1>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {canEditPosts(profile) && !readOnly && (
                    <button onClick={handleToggleAddingMode}
                      className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
                        addingPostMode
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                          : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-emerald-400'
                      }`}>
                      {addingPostMode ? '✕ Cancelar' : '+ Nuevo aquí'}
                    </button>
                  )}
                  <FilterBarCollapsible
                    posts={posts}
                    {...mapFilterCtx}
                    stageDefs={STAGE_DEFS}
                    userNames={userNames}
                    mode="map"
                    showVerified={false}
                    incidents={incidents}
                    measureMode={measureMode}
                    setMeasureMode={setMeasureMode}
                    unidadesTerritoriales={unidadesTerritoriales}
                  />
                </div>
              </div>
              <div className="flex-1 p-4">
                <MapView posts={posts} setPosts={setPosts} selectedPost={selectedPost} setSelectedPost={setSelectedPost} openPostDetail={openPostDetail} filters={mapFilterCtx.filters} incidents={incidents} userNames={userNames}
                         stageDefs={STAGE_DEFS} darkMode={darkMode}
                         measureMode={measureMode} setMeasureMode={setMeasureMode}
                         measurePoints={measurePoints} setMeasurePoints={setMeasurePoints}
                         editingPostId={editingPostId}
                         onConfirmRelocate={handleConfirmRelocate}
                         onCancelRelocate={handleCancelRelocate}
                         isAdmin={isAdmin}
                         canMerge={isAdmin || isCapturador}
                         unidadesTerritoriales={unidadesTerritoriales}
                         onRefresh={() => refreshData(true)}
                         onClickAntena={(post) => setAntenaModalPost(post)}
                          onToggleRevisado={async (p) => {
                            if (p.revisado) {
                              await dbUnmarkPostRevisado(p.id);
                              setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: false, revisadoAt: null, revisadoPorUserId: null } : x));
                            } else {
                              const updated = await dbMarkPostRevisado(p.id, profile.userId);
                              const ra = updated?.revisado_at || new Date().toISOString();
                              const rby = updated?.revisado_por_user_id || profile.userId;
                              setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: true, revisadoAt: ra, revisadoPorUserId: rby } : x));
                            }
                          }}
            onMergePosts={async (principalId, secundarioId, stageChoices, keepAddress) => { await dbMergePosts(principalId, secundarioId, stageChoices, keepAddress); await refreshData(true); }}
            onCompareDetail={(a, b) => setComparePair([a, b])}
            addingMode={addingPostMode}
                         onMapClickForNewPost={handleMapClickForNewPost}
                         focusPost={mapFocusPost}
                         focusKey={mapFocusKey}
                         onCapturePost={!readOnly ? (post, stage) => {
                           setSelectedPost(null);
                           setCaptureTarget({ postId: post.id, stageId: stage.id });
                           setActiveTab('captura');
                         } : null} />
              </div>
            </div>
          )}
          {activeTab === 'postes' && <PostsList posts={posts} onSelect={openPostDetail} filterCtx={filterCtx} incidents={incidents}
            page={postsPage} setPage={setPostsPage}
            isAdmin={isAdmin} canMerge={isAdmin || isCapturador} userNames={userNames} onDeletePosts={async (postId) => { await dbDeletePost(postId); setPosts(prev => prev.filter(p => p.id !== postId)); }}
            onMergePosts={async (principalId, secundarioId, stageChoices, keepAddress) => { await dbMergePosts(principalId, secundarioId, stageChoices, keepAddress); await refreshData(true); }}
            readOnly={readOnly} onCreatePost={() => setShowCreatePost(true)}
            onJumpToMap={(p) => { setMapFocusPost(p); setMapFocusKey(k => k + 1); setActiveTab('mapa'); }}
            unidadesTerritoriales={unidadesTerritoriales} />}
          {activeTab === 'captura' && !readOnly && (
            <FieldCaptureView
              posts={posts}
              stageDefs={STAGE_DEFS}
              onUpdatePost={updatePost}
              userProfile={profile}
              canCaptureStage={canCaptureStage}
              initialPostId={captureTarget?.postId}
              initialStageId={captureTarget?.stageId}
              onClearTarget={() => setCaptureTarget(null)}
              incidents={incidents}
              onCreateIncident={createIncident}
              onRequestCreatePost={(stageId) => {
                setCreatePostDefaultStage(stageId);
                setShowCreatePost(true);
              }}
              onJumpToMap={(p) => { setMapFocusPost(p); setMapFocusKey(k => k + 1); setActiveTab('mapa'); }}
            />
          )}
          {activeTab === 'scouting' && (isAdmin || isScout || isCapturador || isCoordinador) && (
            <ScoutingView
              posts={posts}
              stageDefs={STAGE_DEFS}
              profile={profile}
              userNames={userNames}
              isAdmin={isAdmin}
              isCoordinador={isCoordinador}
              onPostApproved={handleApprovePost}
              onCreateIncident={createIncident}
              incidents={incidents}
              onSelectPost={setSelectedPost}
              onOpenPostDetail={openPostDetail}
            />
          )}
          {activeTab === 'incidencias' && <IncidentsView incidents={incidents} posts={posts} onResolve={readOnly ? null : resolveIncident} onSelectPost={setSelectedPost} isAdmin={isAdmin} isDirector={isDirector} profile={profile} onDelete={isAdmin ? deleteIncident : null} onAttend={attendIncident} canAttend={canAttendIncidents(effectiveProfile)} canResolve={canResolveIncidents(effectiveProfile)} onRevert={revertIncident} externalNav={incidenciasNav} />}
          {activeTab === 'propuestas' && (isAdmin || isCoordinador) && (
            <ProposalsView
              proposals={proposals}
              posts={posts}
              userNames={userNames}
              isAdmin={isAdmin}
              isCoordinador={isCoordinador}
              onCreateProposal={async (data) => {
                await createProposal(data);
                const props = await loadProposals();
                setProposals(props);
              }}
              onReview={isAdmin ? async (id, approved, notes) => {
                await reviewProposal(id, approved, notes);
                const props = await loadProposals();
                setProposals(props);
              } : null}
            />
          )}
          {activeTab === 'inventario' && <InventoryView posts={posts} onSelectPost={setSelectedPost} />}
          {activeTab === 'usuarios' && isAdmin && <UsersView currentProfile={profile} />}
          {activeTab === 'auditoria' && (isAdmin || isDirector) && <AuditView />}
          {activeTab === 'informe' && (isAdmin || isDirector) && <InformeIncidenciasView incidents={incidents} posts={posts}
            onNavigate={(filter, search) => {
              setIncidenciasNav({ filter: filter || 'todas', search: search || '', ts: Date.now() });
              setActiveTab('incidencias');
            }}
            onNavigatePostes={(ut) => {
              filterCtx.setFilters(prev => ({ ...prev, stages: [], uts: ut ? [ut] : [] }));
              setActiveTab('postes');
            }}
          />}
        </main>
      </div>

      {selectedPost && (
        <PostDetailDrawer post={selectedPost} onClose={closePostDetail}
            onToggleRevisado={async (p) => {
              if (!profile) return;
              try {
                if (p.revisado) {
                  await dbUnmarkPostRevisado(p.id);
                  setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: false, revisado_at: null, revisadoAt: null, revisado_por_user_id: null, revisadoPorUserId: null } : x));
                  setSelectedPost(prev => prev && prev.id === p.id ? { ...prev, revisado: false, revisado_at: null, revisadoAt: null, revisado_por_user_id: null, revisadoPorUserId: null } : prev);
                } else {
                  const updated = await dbMarkPostRevisado(p.id, profile.userId);
                  const ra = updated?.revisado_at || new Date().toISOString();
                  const rby = updated?.revisado_por_user_id || profile.userId;
                  setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: true, revisado_at: ra, revisadoAt: ra, revisado_por_user_id: rby, revisadoPorUserId: rby } : x));
                  setSelectedPost(prev => prev && prev.id === p.id ? { ...prev, revisado: true, revisado_at: ra, revisadoAt: ra, revisado_por_user_id: rby, revisadoPorUserId: rby } : prev);
                }
              } catch (e) {
                console.error('toggle revisado failed', e);
                alert('No se pudo cambiar el estado de revisado: ' + (e?.message || e));
              }
            }}
                          initialStageId={initialStageId}
                          onUpdate={(readOnly || raalReadOnlyPostes) ? null : updatePost}
                          onUpdateMeta={(readOnly || raalReadOnlyPostes) ? null : updatePostMeta}
                          incidents={incidents}
                          onCreateIncident={(readOnly || raalReadOnlyPostes) ? null : createIncident} viewMode={isAdmin ? 'supervisor' : 'campo'}
                          userNames={userNames} isAdmin={isAdmin}
                          onVerifyStage={handleVerifyStage} onUnverifyStage={handleUnverifyStage}
                          onStartEditPosition={isAdmin && !readOnly ? handleStartEditPosition : null}
                          onRequestRelocate={isAdmin && !readOnly ? setRelocateRequest : null}
                          canViewHistory={isAdmin || isDirector}
                          historyRefreshKey={historyRefreshKey}
                          onDelete={isAdmin ? handleDeletePost : null}
                          onOpenAntena={(isAdmin || isCapturador) ? (p) => setAntenaModalPost(p) : null} />
      )}
      {comparePair && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/60 backdrop-blur-sm">
          <div className="flex items-center justify-between bg-stone-900 text-stone-100 px-4 py-2 shrink-0">
            <span className="text-sm font-mono">Comparar para fusion - {postDisplayId(comparePair[0])} vs {postDisplayId(comparePair[1])}</span>
            <button onClick={() => setComparePair(null)} className="text-stone-300 hover:text-white text-sm font-mono underline">cerrar</button>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row gap-px bg-stone-700 overflow-hidden">
            {comparePair.map((cp) => (
              <div key={cp.id} className="flex-1 relative bg-stone-100 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                <PostDetailDrawer post={cp} onClose={() => setComparePair(null)}
                onToggleRevisado={async (p) => {
              if (!profile) return;
              try {
                if (p.revisado) {
                  await dbUnmarkPostRevisado(p.id);
                  setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: false, revisado_at: null, revisadoAt: null, revisado_por_user_id: null, revisadoPorUserId: null } : x));
                  setSelectedPost(prev => prev && prev.id === p.id ? { ...prev, revisado: false, revisado_at: null, revisadoAt: null, revisado_por_user_id: null, revisadoPorUserId: null } : prev);
                } else {
                  const updated = await dbMarkPostRevisado(p.id, profile.userId);
                  const ra = updated?.revisado_at || new Date().toISOString();
                  const rby = updated?.revisado_por_user_id || profile.userId;
                  setPosts(prev => prev.map(x => x.id === p.id ? { ...x, revisado: true, revisado_at: ra, revisadoAt: ra, revisado_por_user_id: rby, revisadoPorUserId: rby } : x));
                  setSelectedPost(prev => prev && prev.id === p.id ? { ...prev, revisado: true, revisado_at: ra, revisadoAt: ra, revisado_por_user_id: rby, revisadoPorUserId: rby } : prev);
                }
              } catch (e) {
                console.error('toggle revisado failed', e);
                alert('No se pudo cambiar el estado de revisado: ' + (e?.message || e));
              }
            }}
                                  onUpdate={(readOnly || raalReadOnlyPostes) ? null : updatePost}
                                  onUpdateMeta={(readOnly || raalReadOnlyPostes) ? null : updatePostMeta}
                                  incidents={incidents}
                                  onCreateIncident={(readOnly || raalReadOnlyPostes) ? null : createIncident}
                                  viewMode={isAdmin ? 'supervisor' : 'campo'}
                                  userNames={userNames} isAdmin={isAdmin}
                                  onVerifyStage={handleVerifyStage} onUnverifyStage={handleUnverifyStage}
                                  onStartEditPosition={null} onRequestRelocate={null}
                                  canViewHistory={isAdmin || isDirector}
                                  historyRefreshKey={historyRefreshKey}
                                  onDelete={null}
                                  onOpenAntena={isAdmin ? (p) => setAntenaModalPost(p) : null} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showWhatsApp && (
        <WhatsAppComposer posts={posts} onClose={() => setShowWhatsApp(false)}
                          initialSelection={selectedPost ? [selectedPost] : []} />
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
             onClick={() => setShowResetConfirm(false)}>
          <div className="bg-amber-50 border border-stone-300 max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-rose-500" strokeWidth={1.5} />
              <h2 className="text-lg font-light text-stone-950">Restablecer datos</h2>
            </div>
            <p className="text-sm text-stone-600 mb-6">
              Esto borrará todos los postes, etapas e incidencias de la base de datos. Solo un administrador puede recrear los datos. ¿Continuar?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 text-xs font-mono uppercase tracking-widest border border-stone-300 text-stone-600 hover:border-stone-500">
                Cancelar
              </button>
              <button onClick={resetData}
                      className="px-4 py-2 text-xs font-mono uppercase tracking-widest bg-rose-700 text-stone-950 hover:bg-rose-600">
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR B Lote 3: Modal Recuperar antena (admin only) */}
      {antenaModalPost && (
        <AntenaForm
          post={antenaModalPost}
          currentUserId={profile?.userId}
          onClose={() => setAntenaModalPost(null)}
          onSaved={() => refreshData(true)}
        />
      )}

      {/* Modal: Crear poste */}
      {showCreatePost && (
        <CreatePostForm
          unidadesTerritoriales={unidadesTerritoriales}
          stageDefs={STAGE_DEFS}
          defaultStageId={createPostDefaultStage}
          initialPosition={pendingNewPostCoord}
          onCreated={(p) => { handlePostCreated(p); setPendingNewPostCoord(null); }}
          onClose={() => { setShowCreatePost(false); setCreatePostDefaultStage(null); setPendingNewPostCoord(null); }}
        />
      )}

      {/* Modal de confirmación de reubicación (compartido drag + manual) */}
      <RelocateConfirmModal
        open={!!relocateRequest}
        onClose={handleRelocateClose}
        onConfirm={handleRelocateConfirm}
        postLabel={relocateRequest?.postLabel}
        coordsAnterior={relocateRequest?.coordsAnterior}
        coordsNueva={relocateRequest?.coordsNueva}
        submitting={relocateSubmitting}
        errorMessage={relocateError}
      />

      {/* Admin toolbar is now integrated in the header */}
    </div>
  );

  if (mobilePreview) {
    return (
      <>
        <EnvBanner />
        <div className="min-h-screen bg-stone-700 flex justify-center">
          <div className="w-[390px] min-h-screen bg-amber-50 border-x-4 border-stone-500 shadow-2xl overflow-hidden">
            {appContent}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <EnvBanner />
      {appContent}
    </>
  );
}
