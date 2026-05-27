// lib/routeLayer.js
// Capa OpenLayers para dibujar una ruta de scouting (línea + paradas numeradas).
// Importa por ruta específica para coincidir con el estilo de App.jsx.

import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style';

const ROUTE_COLOR = '#F43F5E';    // rose-500 (acento de la app)
const ROUTE_ENDPOINT = '#F59E0B'; // amber-500 (inicio/fin)

function lineStyle() {
  return new Style({
    stroke: new Stroke({ color: ROUTE_COLOR, width: 4, lineDash: [2, 9], lineCap: 'round' }),
  });
}

function stopStyle(label, isEndpoint) {
  return new Style({
    image: new CircleStyle({
      radius: isEndpoint ? 11 : 9,
      fill: new Fill({ color: isEndpoint ? ROUTE_ENDPOINT : ROUTE_COLOR }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    text: new Text({
      text: String(label),
      font: 'bold 11px monospace',
      fill: new Fill({ color: '#ffffff' }),
    }),
  });
}

export function createRouteLayer(map, { zIndex = 999 } = {}) {
  const source = new VectorSource();
  const layer = new VectorLayer({ source, zIndex, properties: { name: 'scouting-route' } });
  map.addLayer(layer);

  return {
    layer,
    source,

    // poles: array ordenado de { id, lat, lng }
    render(poles, { fit = false } = {}) {
      source.clear();
      if (!poles || poles.length === 0) return;

      if (poles.length >= 2) {
        const line = new Feature(new LineString(poles.map((p) => fromLonLat([p.lng, p.lat]))));
        line.setStyle(lineStyle());
        source.addFeature(line);
      }

      poles.forEach((p, idx) => {
        const f = new Feature(new Point(fromLonLat([p.lng, p.lat])));
        f.setStyle(stopStyle(idx + 1, idx === 0 || idx === poles.length - 1));
        f.set('poleId', p.id);
        source.addFeature(f);
      });

      if (fit) {
        const extent = source.getExtent();
        if (extent && Number.isFinite(extent[0])) {
          map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 17, duration: 300 });
        }
      }
    },

    fit() {
      const extent = source.getExtent();
      if (extent && Number.isFinite(extent[0])) {
        map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 17, duration: 300 });
      }
    },

    clear() { source.clear(); },
    remove() { map.removeLayer(layer); },
  };
}
