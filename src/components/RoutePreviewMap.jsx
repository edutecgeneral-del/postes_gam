// components/RoutePreviewMap.jsx
// Mini-mapa de previsualización del recorrido de una ruta de scouting.
// Dibuja los postes en orden (numerados) y la línea que los conecta.
// Props: posts = [{ id, lat, lng, ... }] (en orden de visita), height (px)
import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';

const styleFn = (feat) => {
  const geom = feat.getGeometry();
  if (geom && geom.getType() === 'LineString') {
    return new Style({ stroke: new Stroke({ color: '#10b981', width: 3 }) });
  }
  const n = feat.get('n');
  return new Style({
    image: new CircleStyle({
      radius: 11,
      fill: new Fill({ color: '#0ea5e9' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    text: new Text({ text: String(n ?? ''), fill: new Fill({ color: '#ffffff' }), font: 'bold 11px sans-serif' }),
  });
};

export default function RoutePreviewMap({ posts = [], height = 220 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const srcRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const src = new VectorSource();
    srcRef.current = src;
    const map = new Map({
      target: elRef.current,
      layers: [
        new TileLayer({ source: new XYZ({ url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', maxZoom: 20 }) }),
        new VectorLayer({ source: src, style: styleFn }),
      ],
      view: new View({ center: fromLonLat([-99.13, 19.49]), zoom: 12 }),
      controls: [],
    });
    mapRef.current = map;
    return () => { map.setTarget(undefined); mapRef.current = null; srcRef.current = null; };
  }, []);

  useEffect(() => {
    const src = srcRef.current; const map = mapRef.current;
    if (!src || !map) return;
    src.clear();
    const pts = (posts || []).filter(p =>
      Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Number(p.lat) !== 0 && Number(p.lng) !== 0);
    if (pts.length === 0) { setTimeout(() => map.updateSize(), 60); return; }
    const coords = pts.map(p => fromLonLat([Number(p.lng), Number(p.lat)]));
    if (coords.length > 1) src.addFeature(new Feature({ geometry: new LineString(coords) }));
    pts.forEach((p, i) => {
      const f = new Feature({ geometry: new Point(coords[i]) });
      f.set('n', i + 1);
      src.addFeature(f);
    });
    const ext = src.getExtent();
    if (ext && Number.isFinite(ext[0])) {
      map.getView().fit(ext, { padding: [28, 28, 28, 28], maxZoom: 17, duration: 250 });
    }
    setTimeout(() => map.updateSize(), 60);
  }, [posts]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-stone-300" style={{ height }}>
      <div ref={elRef} className="absolute inset-0" />
    </div>
  );
}
