// Capa de Unidades Territoriales (poligonos) para el mapa GPS.
// Datos: public/ut_boundaries.geojson (232 UTs en EPSG:4326).
import OLVectorLayer from 'ol/layer/Vector';
import OLVectorSource from 'ol/source/Vector';
import OLGeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill } from 'ol/style';

const ROSE_STROKE       = 'rgba(0, 102, 255, 0.55)';
const ROSE_FILL         = 'rgba(0, 102, 255, 0.05)';
const ROSE_HOVER_STROKE = 'rgba(0, 102, 255, 0.95)';
const ROSE_HOVER_FILL   = 'rgba(0, 102, 255, 0.16)';

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

// Estilos por estado de entrega de la UT (liberado/pendiente/urgencia)
const ESTADO_STYLES = {
  liberado:  new Style({ stroke: new Stroke({ color: 'rgba(16, 185, 129, 0.85)', width: 2 }), fill: new Fill({ color: 'rgba(16, 185, 129, 0.28)' }) }),
  pendiente: new Style({ stroke: new Stroke({ color: 'rgba(245, 158, 11, 0.85)', width: 2 }), fill: new Fill({ color: 'rgba(245, 158, 11, 0.28)' }) }),
  urgencia:  new Style({ stroke: new Stroke({ color: 'rgba(239, 68, 68, 0.9)',   width: 2 }), fill: new Fill({ color: 'rgba(239, 68, 68, 0.30)' }) }),
};

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
    // Modo "colorear por estado": si esta activo, pinta verde/amarillo/rojo segun el estado de la UT.
    const estadoMap = layer.get('estadoMap');
    if (estadoMap) {
      const nm = feature.get('nombre_uat');
      const est = estadoMap[nm];
      if (feature.get('__hover') && est) return ESTADO_STYLES[est];
      return est ? ESTADO_STYLES[est] : invisibleStyle;
    }
    if (feature.get('__hover')) return hoverStyle;
    const filter = layer.get('utFilter');
    if (!filter) return baseStyle;
    const name = feature.get('nombre_uat');
    return filter.has(name) ? baseStyle : undefined;
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

// Activa el modo "colorear por estado". estadoMap = { nombre_uat: 'liberado'|'pendiente'|'urgencia' }.
// Pasa null para desactivar y volver al comportamiento normal.
export function setUtEstadoMap(layer, estadoMap) {
  if (!layer) return;
  // estadoMap = objeto (aunque este vacio) => modo estado ACTIVO; null/undefined => modo apagado.
  // Un objeto vacio significa "activo pero ninguna UT coincide" (todo invisible), NO azul.
  layer.set('estadoMap', estadoMap ? estadoMap : null);
  const source = layer.getSource();
  if (source) source.forEachFeature((f) => f.changed());
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
// Capa gemela de UT para modo DGSU: mismo GeoJSON, borde azul tenue (distinguir de CI rojo).
const BLUE_STROKE = 'rgba(0, 102, 255, 0.55)';
const BLUE_FILL   = 'rgba(0, 102, 255, 0.05)';
export function createUtLayerDGSU({ baseUrl = '/' } = {}) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const source = new OLVectorSource({
    format: new OLGeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }),
    url: `${normalized}ut_boundaries.geojson`,
    wrapX: false,
  });
  const dgsuStyle = new Style({
    stroke: new Stroke({ color: BLUE_STROKE, width: 1.2 }),
    fill:   new Fill({ color: BLUE_FILL }),
  });
  const dgsuHoverStyle = new Style({
    stroke: new Stroke({ color: 'rgba(215,47,137,0.95)', width: 2.5 }),
    fill:   new Fill({ color: 'rgba(215,47,137,0.22)' }),
  });
  const layer = new OLVectorLayer({
    source,
    declutter: false,
    zIndex: 1,
    visible: false,
    properties: { id: 'ut-boundaries-dgsu' },
  });
  layer.setStyle((feature) => (feature.get('__hover') ? dgsuHoverStyle : dgsuStyle));
  return layer;
}