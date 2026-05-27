// Parser de coordenadas multi-formato para CI1215V2
// Formatos soportados:
//   - Decimal:  "19.483191, -99.113322"  |  "19.483191 -99.113322"
//   - DMS:      "19°28'59.5\"N 99°06'48.0\"W"  (variantes: ° º, ' ', " ")
//   - URL Maps: cualquier URL con !3d!4d, /place/DMS/ o @lat,lng
// Retorna { lat, lng, source } o null.

const RX_DECIMAL_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const RX_DMS_ONE      = /(\d{1,3})[°º\s]+(\d{1,2})[\u2032'\s]+(\d{1,2}(?:\.\d+)?)[\u2033"'\s]*([NSEW])/i;
const RX_URL_DATA     = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const RX_URL_AT       = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

function dmsToDecimal(deg, min, sec, hem) {
  const sign = (hem === 'S' || hem === 'W') ? -1 : 1;
  return sign * (Number(deg) + Number(min) / 60 + Number(sec) / 3600);
}

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

function parseDMSPair(str) {
  const matches = [...str.matchAll(new RegExp(RX_DMS_ONE.source, 'gi'))];
  if (matches.length < 2) return null;

  const c1 = dmsToDecimal(matches[0][1], matches[0][2], matches[0][3], matches[0][4].toUpperCase());
  const c2 = dmsToDecimal(matches[1][1], matches[1][2], matches[1][3], matches[1][4].toUpperCase());
  const h1 = matches[0][4].toUpperCase();
  const h2 = matches[1][4].toUpperCase();

  let lat, lng;
  if ('NS'.includes(h1) && 'EW'.includes(h2))      { lat = c1; lng = c2; }
  else if ('EW'.includes(h1) && 'NS'.includes(h2)) { lat = c2; lng = c1; }
  else return null;

  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

export function parseCoordinates(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // 1) URL de Google Maps
  const looksLikeUrl = /^https?:\/\//i.test(raw) || raw.includes('google.com/maps') || raw.includes('maps.app.goo.gl');
  if (looksLikeUrl) {
    let decoded;
    try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }

    // (a) !3d{lat}!4d{lng}  - coords reales del place (mas confiable)
    const mData = decoded.match(RX_URL_DATA);
    if (mData) {
      const lat = parseFloat(mData[1]);
      const lng = parseFloat(mData[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng, source: 'url_data' };
    }

    // (b) /place/{DMS}/
    const mPlace = decoded.match(/\/place\/([^/]+?)\//);
    if (mPlace) {
      const placeStr = mPlace[1].replace(/\+/g, ' ');
      const dms = parseDMSPair(placeStr);
      if (dms) return { ...dms, source: 'url_place' };
    }

    // (c) @lat,lng (view center, ultimo recurso)
    const mAt = decoded.match(RX_URL_AT);
    if (mAt) {
      const lat = parseFloat(mAt[1]);
      const lng = parseFloat(mAt[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng, source: 'url_at' };
    }

    return null;
  }

  // 2) DMS pegado directo
  const dms = parseDMSPair(raw);
  if (dms) return { ...dms, source: 'dms' };

  // 3) Decimal pair
  const mDec = raw.match(RX_DECIMAL_PAIR);
  if (mDec) {
    const lat = parseFloat(mDec[1]);
    const lng = parseFloat(mDec[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, source: 'decimal' };
  }

  return null;
}
