// Capa de Unidades Territoriales (poligonos) para el mapa GPS.
// Datos: public/ut_boundaries.geojson (232 UTs en EPSG:4326).
// La capa se carga LAZY: el geojson solo se descarga la primera vez que se hace visible.
import OLVectorLayer from 'ol/layer/Vector';
import OLVectorSource from 'ol/source/Vector';
import OLGeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill } from 'ol/style';

// Paleta rose pastel - hace match con GeoV2View para consistencia visual
const ROSE_STROKE         = 'rgba(225, 29, 72, 0.55)';  // rose-600 @ 55% alpha
const ROSE_FILL           = 'rgba(225, 29, 72, 0.04)';  // muy sutil para no tapar el mapa base
const ROSE_HOVER_STROKE   = 'rgba(225, 29, 72, 0.95)';
const ROSE_HOVER_FILL     = 'rgba(225, 29, 72, 0.14)';

const baseStyle = new Style({
  stroke: new Stroke({ color: ROSE_STROKE, width: 1.2 }),
  fill:   new Fill({ color: ROSE_FILL }),
});

const hoverStyle = new Style({
  stroke: new Stroke({ color: ROSE_HOVER_STROKE, width: 2.2 }),
  fill:   new Fill({ color: ROSE_HOVER_FILL }),
});

/**
 * Crea la capa de Unidades Territoriales para inyectar en el mapa GPS.
 * Lazy por default: invisible hasta que el usuario active el toggle.
 *
 * @param {Object} opts
 * @param {string} opts.baseUrl  - Base path de la app (ej '/CI1215V3/' en prod, '/' en dev)
 * @returns {OLVectorLayer}
 */
export function createUtLayer({ baseUrl = '/' } = {}) {
  // Normalizar baseUrl: que siempre termine en '/'
  const normalized = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  const source = new OLVectorSource({
    format: new OLGeoJSON({
      dataProjection: 'EPSG:4326',     // El archivo viene en lat/lng (WGS84)
      featureProjection: 'EPSG:3857',  // OpenLayers usa Web Mercator internamente
    }),
    url: `${normalized}ut_boundaries.geojson`,
    wrapX: false,
  });

  const layer = new OLVectorLayer({
    source,
    style: baseStyle,
    declutter: false,
    zIndex: 1,                            // Por debajo de los postes (que estan en zIndex mayor)
    visible: false,                       // LAZY: invisible hasta primer toggle
    properties: { id: 'ut-boundaries' },  // Para identificarla luego
  });

  return layer;
}

/**
 * Aplica estilo hover a un feature, restaurando el resto al estilo base.
 * Llamar con feature=null para limpiar todos los hovers.
 *
 * @param {OLVectorLayer} layer
 * @param {OLFeature|null} feature
 */
export function setUtHover(layer, feature) {
  if (!layer) return;
  const source = layer.getSource();
  if (!source) return;
  source.forEachFeature((f) => f.setStyle(undefined));
  if (feature) feature.setStyle(hoverStyle);
}

/**
 * Devuelve el nombre legible de una UT desde el feature del geojson.
 * Para usar en tooltip al hover.
 */
export function getUtName(feature) {
  if (!feature) return null;
  const props = feature.getProperties() || {};
  return props.nombre_uat || props.NOMBRE || props.nombre || null;
}