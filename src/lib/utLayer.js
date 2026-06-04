// Capa de Unidades Territoriales (poligonos) para el mapa GPS.
// Datos: public/ut_boundaries.geojson (232 UTs en EPSG:4326).
import OLVectorLayer from 'ol/layer/Vector';
import OLVectorSource from 'ol/source/Vector';
import OLGeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill } from 'ol/style';

const ROSE_STROKE       = 'rgba(225, 29, 72, 0.55)';
const ROSE_FILL         = 'rgba(225, 29, 72, 0.04)';
const ROSE_HOVER_STROKE = 'rgba(225, 29, 72, 0.95)';
const ROSE_HOVER_FILL   = 'rgba(225, 29, 72, 0.14)';

const baseStyle = new Style({
  stroke: new Stroke({ color: ROSE_STROKE, width: 1.2 }),
  fill:   new Fill({ color: ROSE_FILL }),
});
const hoverStyle = new Style({
  stroke: new Stroke({ color: ROSE_HOVER_STROKE, width: 2.2 }),
  fill:   new Fill({ color: ROSE_HOVER_FILL }),
});
const invisibleStyle = new Style({
  stroke: new Stroke({ color: 'rgba(0,0,0,0)', width: 0 }),
  fill:   new Fill({ color: 'rgba(0,0,0,0)' }),
});

export function createUtLayer({ baseUrl = '/' } = {}) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const source = new OLVectorSource({
    format: new OLGeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }),
    url: `${normalized}ut_boundaries.geojson`,
    wrapX: false,
  });
  const layer = new OLVectorLayer({
    source,
    declutter: false,
    zIndex: 0,
    visible: false,
    properties: { id: 'ut-boundaries', utFilter: null },
  });
  layer.setStyle((feature) => {
    if (feature.get('__hover')) return hoverStyle;
    const filter = layer.get('utFilter');
    if (!filter) return baseStyle;
    const name = feature.get('nombre_uat');
    return filter.has(name) ? baseStyle : invisibleStyle;
  });
  return layer;
}

export function setUtFilter(layer, nameSet) {
  if (!layer) return;
  const value = (nameSet && nameSet.size > 0) ? nameSet : null;
  layer.set('utFilter', value);
  const source = layer.getSource();
  if (source) {
    source.forEachFeature((f) => f.changed());
  }
  layer.changed();
}

export function setUtHover(layer, feature) {
  if (!layer) return;
  const source = layer.getSource();
  if (!source) return;
  source.forEachFeature((f) => {
    if (f.get('__hover')) { f.unset('__hover'); f.changed(); }
  });
  if (feature) { feature.set('__hover', true); feature.changed(); }
}

export function getUtName(feature) {
  if (!feature) return null;
  const props = feature.getProperties() || {};
  return props.nombre_uat || props.NOMBRE || props.nombre || null;
}