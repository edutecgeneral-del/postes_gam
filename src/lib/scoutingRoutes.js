// lib/scoutingRoutes.js
// Utilidades de rutas de scouting: geometría, ordenamiento y deep-link a Google Maps.
// La PERSISTENCIA vive en lib/data.js (createScoutingRoute, loadScoutingRoutes, ...),
// para usar el MISMO sistema que la vista Scouting. Aquí no se toca Supabase.

// ─── Geometría (haversine) ───────────────────────────────────────────────────
const R = 6371000; // metros
const toRad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLength(poles) {
  let total = 0;
  for (let i = 1; i < poles.length; i++) total += haversine(poles[i - 1], poles[i]);
  return total; // metros
}

// ─── Ordenamiento ──────────────────────────────────────────────────────────
export function nearestNeighbor(poles, startIndex = 0) {
  if (poles.length <= 2) return [...poles];
  const remaining = [...poles];
  const path = [remaining.splice(startIndex, 1)[0]];
  let current = path[0];
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < remaining.length; k++) {
      const d = haversine(current, remaining[k]);
      if (d < bestD) { bestD = d; best = k; }
    }
    current = remaining.splice(best, 1)[0];
    path.push(current);
  }
  return path;
}

// Mejora 2-opt sobre camino abierto. Apto para <= ~50 paradas.
export function twoOpt(route) {
  const n = route.length;
  if (n < 4) return [...route];
  const best = [...route];
  const d = (i, j) => haversine(best[i], best[j]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = i - 1;
        const b = j + 1;
        let delta = 0;
        if (a >= 0) delta += d(a, j) - d(a, i);
        if (b < n)  delta += d(i, b) - d(j, b);
        if (delta < -1e-6) {
          let lo = i, hi = j;
          while (lo < hi) { const t = best[lo]; best[lo] = best[hi]; best[hi] = t; lo++; hi--; }
          improved = true;
        }
      }
    }
  }
  return best;
}

export function optimizeRoute(poles, startIndex = 0) {
  return twoOpt(nearestNeighbor(poles, startIndex));
}

// ─── Deep-link a Google Maps ─────────────────────────────────────────────────
// Limite practico de la URL: origin + destination + 9 waypoints = 11 paradas.
export const GMAPS_MAX_STOPS = 11;

export function googleMapsUrl(poles) {
  if (!poles || poles.length < 1) return null;
  const fmt = (p) => `${p.lat},${p.lng}`;
  const mids = poles.slice(1, -1).slice(0, 9);
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('origin', fmt(poles[0]));
  params.set('destination', fmt(poles[poles.length - 1]));
  params.set('travelmode', 'driving');
  if (mids.length) params.set('waypoints', mids.map(fmt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function exceedsGmapsLimit(poles) {
  return (poles?.length ?? 0) > GMAPS_MAX_STOPS;
}

// Reordena un array de postes segun un array de IDs (resuelve contra los postes
// ya cargados en memoria).
export function resolveByIds(poleIds, poolById) {
  return (poleIds || []).map((id) => poolById.get(id)).filter(Boolean);
}
