// src/lib/informePdf.js
// PDF "Informe Ejecutivo" por Unidad Territorial - Alcaldia GAM.
// v5.1: poligono por estado; infografia con barras; "Internet (Modem)"; boton = E5;
//       chip boton 3 colores; 8m/13m (E2) con guion; 2 tarjetas verdes (Avance con dona);
//       numero de postes con halo verde; fuentes mas grandes.
// Datos: RPC get_informe_ut(clave). Contorno: public/ut_boundaries.geojson
// Los acentos van como escapes \uXXXX para evitar problemas de codificacion.

// ---- Paleta institucional GAM ----

import { agregarFichasA } from './fichasPdf.js';

const GUINDA = [157, 33, 72];
const DORADO = [178, 142, 92];
const GRIS = [85, 88, 90];
const GRIS_SUAVE = [232, 232, 232];
const BLANCO = [255, 255, 255];
const VERDE = [22, 143, 96];
const ROJO = [198, 40, 48];
const ROSA_TENUE = [247, 241, 243];
const AZUL = [37, 99, 235];
const AMBAR = [224, 158, 20];
const COLOR_ESTADO = { liberado: [22, 143, 96], pendiente: [224, 158, 20], urgencia: [198, 40, 48] };

const TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

const T = {
  informe: 'INFORME EJECUTIVO',
  concepto: 'CONCEPTO',
  cant: 'CANT.',
  estado: 'ESTADO',
  postesUt: 'POSTES EN LA UT',
  ptz: 'C\u00C1MARAS PTZ (360\u00B0)',
  bullet: 'C\u00C1MARAS BULLET (2 por poste)',
  panico: 'BOTONES DE P\u00C1NICO',
  internet: 'INTERNET (MODEM)',
  centro: 'CENTRO DE INTELIGENCIA',
  completo: 'COMPLETO',
  postes: 'POSTES',
  avance: 'AVANCE',
  camaras: 'C\u00C1MARAS',
  condicion: 'CONDICI\u00D3N Y UBICACI\u00D3N POR POSTE',
  cPtz: 'PTZ',
  cBullet1: 'BULLET 1',
  cBullet2: 'BULLET 2',
  cSos: 'BOT\u00D3N',
  cInternet: 'INTERNET',
  cCentro: 'CI',
  generado: 'Generado',
  alcaldia: 'Alcald\u00EDa Gustavo A. Madero',
  dgsu: 'Direcci\u00F3n General de Servicios Urbanos',
  mapaAttr: '\u00A9 OpenStreetMap \u00B7 \u00A9 CARTO',
  pagina: 'P\u00E1gina',
  de: 'de',
  entre: ', entre ',
  y: ' y ',
  cercaDe: ', cerca de ',
  col: 'Col. ',
  guion: '\u2014',
  sinPostes: 'Sin postes registrados en esta unidad territorial.',
  sinMapa: 'No se pudo generar el mapa.'
};

// ============ utilidades ============

async function cargarImagen(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

async function cargarPoligono(geojsonUrl, nombreUt) {
  if (!geojsonUrl || !nombreUt) return null;
  try {
    const resp = await fetch(geojsonUrl);
    if (!resp.ok) return null;
    const gj = await resp.json();
    const norm = function (s) { return String(s || '').trim().toUpperCase().replace(/\s+/g, ' '); };
    const objetivo = norm(nombreUt);
    const feats = (gj && gj.features) ? gj.features : [];
    for (let i = 0; i < feats.length; i++) {
      const props = feats[i].properties || {};
      const nm = props.nombre_uat || props.NOMBRE || props.nombre;
      if (norm(nm) === objetivo) return feats[i].geometry;
    }
    return null;
  } catch (e) { return null; }
}

function anillosDe(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates || [];
  if (geom.type === 'MultiPolygon') {
    const out = [];
    (geom.coordinates || []).forEach(function (poly) {
      (poly || []).forEach(function (an) { out.push(an); });
    });
    return out;
  }
  return [];
}

function fmtFecha(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function txtUbicacion(p) {
  const calle = (p.calle && String(p.calle).trim()) ? String(p.calle).trim() : T.guion;
  if (p.entre_1 && p.entre_2) return calle + T.entre + p.entre_1 + T.y + p.entre_2;
  if (p.entre_1) return calle + T.cercaDe + p.entre_1;
  if (p.entre_2) return calle + T.cercaDe + p.entre_2;
  return calle;
}

// ---- Web Mercator ----
function lng2tx(lng, z) { return (lng + 180) / 360 * Math.pow(2, z); }
function lat2ty(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
}

function cargarTile(url) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = url;
  });
}

async function componerMapa(geom, postes, wPx, hPx, colorUT) {
  const anillos = anillosDe(geom);
  const pts = postes.filter(function (p) {
    return typeof p.lat === 'number' && typeof p.lng === 'number';
  });
  if (anillos.length === 0 && pts.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const meter = function (lng, lat) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };
  anillos.forEach(function (an) { an.forEach(function (c) { meter(c[0], c[1]); }); });
  pts.forEach(function (p) { meter(p.lng, p.lat); });
  if (!isFinite(minLng)) return null;

  const dLng = (maxLng - minLng) || 0.002;
  const dLat = (maxLat - minLat) || 0.002;
  minLng -= dLng * 0.06; maxLng += dLng * 0.06;
  minLat -= dLat * 0.06; maxLat += dLat * 0.06;

  const wx = function (lng) { return (lng + 180) / 360; };
  const wy = function (lat) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };
  let wxMin = wx(minLng), wxMax = wx(maxLng);
  let wyMin = wy(maxLat), wyMax = wy(minLat);

  let spanX = wxMax - wxMin, spanY = wyMax - wyMin;
  const target = wPx / hPx;
  if (spanX / spanY < target) {
    const need = spanY * target, add = (need - spanX) / 2;
    wxMin -= add; wxMax += add; spanX = need;
  } else {
    const need = spanX / target, add = (need - spanY) / 2;
    wyMin -= add; wyMax += add; spanY = need;
  }

  const SCALE = wPx / spanX;
  let z = Math.round(Math.log2(SCALE / 256));
  if (z < 10) z = 10;
  if (z > 19) z = 19;
  const tileWorld = 1 / Math.pow(2, z);
  const tilePx = tileWorld * SCALE;
  const nTiles = Math.pow(2, z);

  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef0ea';
  ctx.fillRect(0, 0, wPx, hPx);

  const proj = function (lng, lat) {
    return [(wx(lng) - wxMin) * SCALE, (wy(lat) - wyMin) * SCALE];
  };

  const txA = Math.floor(wxMin / tileWorld), txB = Math.floor(wxMax / tileWorld);
  const tyA = Math.floor(wyMin / tileWorld), tyB = Math.floor(wyMax / tileWorld);
  const tareas = [];
  for (let tx = txA; tx <= txB; tx++) {
    for (let ty = tyA; ty <= tyB; ty++) {
      if (tx < 0 || ty < 0 || tx >= nTiles || ty >= nTiles) continue;
      const px = (tx * tileWorld - wxMin) * SCALE;
      const py = (ty * tileWorld - wyMin) * SCALE;
      const url = TILE_URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
      tareas.push(cargarTile(url).then(function (img) {
        if (!img) return;
        try { ctx.drawImage(img, px, py, tilePx + 0.6, tilePx + 0.6); } catch (e) {}
      }));
    }
  }
  await Promise.all(tareas);

  if (anillos.length > 0) {
    const cu = colorUT || [157, 33, 72];
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgb(' + cu[0] + ',' + cu[1] + ',' + cu[2] + ')';
    ctx.fillStyle = 'rgba(' + cu[0] + ',' + cu[1] + ',' + cu[2] + ',0.12)';
    anillos.forEach(function (an) {
      if (!an || an.length < 3) return;
      ctx.beginPath();
      an.forEach(function (c, i) {
        const p = proj(c[0], c[1]);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  pts.forEach(function (p, i) {
    const c = proj(p.lng, p.lat);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(157,33,72)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num != null ? p.num : (i + 1)), c[0], c[1] + 0.5);
  });

  try { return canvas.toDataURL('image/jpeg', 0.92); } catch (e) { return null; }
}

// ============ dibujo ============

function arco(doc, cx, cy, r, a1, a2, pasos) {
  for (let i = 0; i < pasos; i++) {
    const t1 = a1 + (a2 - a1) * i / pasos;
    const t2 = a1 + (a2 - a1) * (i + 1) / pasos;
    doc.line(cx + r * Math.cos(t1), cy + r * Math.sin(t1), cx + r * Math.cos(t2), cy + r * Math.sin(t2));
  }
}

function dona(doc, cx, cy, r, grosor, pct) {
  doc.setLineWidth(grosor);
  doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
  arco(doc, cx, cy, r, -Math.PI / 2, 1.5 * Math.PI, 72);
  const frac = Math.max(0, Math.min(100, pct)) / 100;
  if (frac > 0) {
    doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]);
    arco(doc, cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * 2 * Math.PI, Math.max(2, Math.round(72 * frac)));
  }
}

function icoPtz(doc, x, y, c) {
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(0.35);
  arco(doc, x, y + 0.6, 1.5, Math.PI, 2 * Math.PI, 12);
  doc.line(x - 1.9, y + 0.6, x + 1.9, y + 0.6);
  doc.circle(x, y + 0.1, 0.45, 'F');
}
function icoBullet(doc, x, y, c) {
  doc.setFillColor(c[0], c[1], c[2]);
  doc.roundedRect(x - 1.8, y - 0.9, 3, 1.8, 0.6, 0.6, 'F');
  doc.rect(x + 1.2, y - 0.4, 0.8, 0.8, 'F');
  doc.rect(x - 0.7, y + 0.9, 0.5, 0.7, 'F');
}
function icoSos(doc, x, y, c) {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setLineWidth(0.35);
  doc.circle(x, y, 1.5, 'S');
  doc.circle(x, y, 0.6, 'F');
}
function icoWifi(doc, x, y, c) {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setLineWidth(0.35);
  arco(doc, x, y + 1.1, 1.9, Math.PI * 1.15, Math.PI * 1.85, 10);
  arco(doc, x, y + 1.1, 1.1, Math.PI * 1.15, Math.PI * 1.85, 8);
  doc.circle(x, y + 0.9, 0.35, 'F');
}
function icoCentro(doc, x, y, c) {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setLineWidth(0.35);
  doc.line(x, y - 1.6, x + 1.5, y + 1.5);
  doc.line(x, y - 1.6, x - 1.5, y + 1.5);
  doc.line(x - 1.5, y + 1.5, x + 1.5, y + 1.5);
  doc.rect(x - 0.7, y + 0.3, 1.4, 0.4, 'F');
}
function icoPoste(doc, x, y, c) {
  doc.setFillColor(c[0], c[1], c[2]);
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(0.4);
  doc.rect(x - 0.35, y - 1, 0.7, 3.4, 'F');
  doc.line(x, y - 1, x + 1.7, y - 1);
  doc.circle(x + 1.9, y - 0.6, 0.7, 'F');
}

function chip(doc, x, y, texto, color) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.9);
  const w = doc.getTextWidth(texto) + 4;
  const h = 3.8;
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, w, h, 1.9, 1.9, 'F');
  doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.text(texto, x + w / 2, y + 2.6, { align: 'center' });
  return w;
}
// ============ documento ============

export async function generarInformePdf(datos, logoUrl, geojsonUrl) {
  const mod = await import('jspdf');
  const JsPDF = mod.jsPDF || mod.default;
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const W = 297, H = 210, M = 10;

  const postes = Array.isArray(datos.postes) ? datos.postes : [];
  const total = Number(datos.total_postes) || 0;

  const nPtz = postes.reduce(function (a, p) { return a + (Number(p.ptz) || 0); }, 0);
  const nBullet = postes.reduce(function (a, p) { return a + (Number(p.bullet) || 0); }, 0);
  // Regla: modem = E5. Chip boton: verde=E5, azul=solo E6 (sin modem), rojo=sin E5.
  const colorBoton = function (p) {
    if (p.internet === true) return VERDE;
    if (p.conexion === true) return AZUL;
    return ROJO;
  };
  const nModem = postes.filter(function (p) { return p.internet === true; }).length;
  const nBotonReq = postes.filter(function (p) { return p.internet === true || p.conexion !== true; }).length;
  const nCentro = postes.filter(function (p) { return p.centro === true; }).length;

  const ETAPAS_IDS = ['marca', 'dado', 'parado', 'camaras', 'internet', 'conexion_poste', 'centro'];
  const etapasHechas = ETAPAS_IDS.reduce(function (a, id) {
    return a + (Number((datos.etapas || {})[id]) || 0);
  }, 0);
  const pctAvance = total > 0 ? Math.round((etapasHechas / (total * 7)) * 100) : 0;

  const logo = logoUrl
    ? await cargarImagen(logoUrl.replace(/[^/]*$/, '') + 'gam-logo-informe.png')
    : null;
  const geom = await cargarPoligono(geojsonUrl, datos.nombre);
  const colorUT = COLOR_ESTADO[datos.estado] || GUINDA;
  const mapaImg = await componerMapa(geom, postes, 1264, 800, colorUT);

  function encabezado() {
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 0, 3, 20, 'F');
    if (logo) {
      let ratio = 2.55;
      try {
        const pr = doc.getImageProperties(logo);
        if (pr && pr.width && pr.height) ratio = pr.width / pr.height;
      } catch (e) {}
      let lh = 15, lw = 15 * ratio;
      if (lw > 64) { lw = 64; lh = 64 / ratio; }
      try { doc.addImage(logo, 'PNG', M, (20 - lh) / 2, lw, lh, undefined, 'FAST'); } catch (e) {}
    }
    doc.setTextColor(138, 138, 138);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.text(T.informe, W / 2, 8, { align: 'center', charSpace: 0.8 });
    doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17.1);
    const titulo = (datos.nombre || '').toUpperCase() + '  \u2014  ' + (datos.clave || '');
    doc.text(doc.splitTextToSize(titulo, 190)[0] || '', W / 2, 15.5, { align: 'center' });
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 20, W, 0.9, 'F');
    doc.setFillColor(DORADO[0], DORADO[1], DORADO[2]);
    doc.rect(0, 20.9, W, 0.7, 'F');
  }
  encabezado();

  const mapaX = M, mapaY = 26, mapaW = 158, mapaH = 100;
  if (mapaImg) {
    try { doc.addImage(mapaImg, 'JPEG', mapaX, mapaY, mapaW, mapaH, undefined, 'FAST'); } catch (e) {}
    doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
    doc.setLineWidth(0.4);
    doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3.8);
    doc.text(T.mapaAttr, mapaX + mapaW - 1, mapaY + mapaH - 1.2, { align: 'right' });
  } else {
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
    doc.roundedRect(mapaX, mapaY, mapaW, mapaH, 1.5, 1.5, 'FD');
    doc.setTextColor(170, 170, 170);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    doc.text(T.sinMapa, mapaX + mapaW / 2, mapaY + mapaH / 2, { align: 'center' });
  }

  // =============== INFOGRAFIA (derecha) ===============
  const tX = 174, tW = 113;

  const seccion = function (yy, titulo) {
    doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.text(titulo, tX + 2, yy, { charSpace: 0.6 });
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(tX + 2, yy + 1.7, tW - 4, 0.5, 'F');
  };

  const barra = function (yy, ico, label, hechos, tot, textoCount) {
    ico(doc, tX + 4, yy - 0.9, GRIS);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.1);
    doc.text(label, tX + 8.5, yy);
    const bx = tX + 54, bw = 41, by = yy - 2.4, bh = 3.2;
    doc.setFillColor(236, 236, 236);
    doc.roundedRect(bx, by, bw, bh, 1.6, 1.6, 'F');
    const pct = tot > 0 ? Math.max(0, Math.min(1, hechos / tot)) : 0;
    if (pct > 0) {
      const cf = pct >= 1 ? VERDE : AMBAR;
      doc.setFillColor(cf[0], cf[1], cf[2]);
      doc.roundedRect(bx, by, Math.max(bw * pct, bh), bh, 1.6, 1.6, 'F');
    }
    const ct = pct >= 1 ? VERDE : (pct > 0 ? AMBAR : ROJO);
    doc.setTextColor(ct[0], ct[1], ct[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.1);
    doc.text(textoCount, tX + tW - 2, yy, { align: 'right' });
  };

  seccion(31, 'INFRAESTRUCTURA');
  icoPoste(doc, tX + 4, 38.5, GRIS);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text('Postes en la UT', tX + 8.5, 39.5);
  // numero de postes: verde con un halo suave, mas a la derecha
  const cxN = tX + tW - 6, cyN = 40;
  try {
    doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
    doc.setGState(new doc.GState({ opacity: 0.14 }));
    doc.circle(cxN, cyN, 5.5, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch (e) {}
  doc.setTextColor(15, 110, 86);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(String(total), cxN, cyN + 1.9, { align: 'center' });
  const hayAltura = postes.some(function (p) { return p.poste_tipo === '8m' || p.poste_tipo === '13m'; });
  const n8 = postes.filter(function (p) { return p.poste_tipo === '8m'; }).length;
  const n13 = postes.filter(function (p) { return p.poste_tipo === '13m'; }).length;
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('Postes de 8 m: ' + (hayAltura ? n8 : '\u2013') + '        de 13 m: ' + (hayAltura ? n13 : '\u2013'), tX + 8.5, 45);

  seccion(54, 'C\u00C1MARAS');
  barra(62, icoPtz, 'PTZ (360\u00B0)', nPtz, total, nPtz + ' / ' + total);
  barra(70, icoBullet, 'Bullet (2 x poste)', nBullet, total * 2, nBullet + ' / ' + (total * 2));

  seccion(79, 'CONECTIVIDAD');
  barra(87, icoWifi, 'Internet (Modem)', nModem, total, nModem + ' / ' + total);
  barra(95, icoSos, 'Bot\u00F3n de p\u00E1nico', nModem, nBotonReq, nModem + ' / ' + nBotonReq);
  barra(103, icoCentro, 'Centro de inteligencia', nCentro, total, nCentro + ' / ' + total);

  // =============== 2 TARJETAS (verde, al ras del fondo del mapa) ===============
  const iW = (tW - 6) / 2, iH = 20;
  const iY = mapaY + mapaH - iH;

  // tarjeta Avance (porcentaje grande, sin dona)
  doc.setFillColor(234, 246, 240);
  doc.setDrawColor(183, 224, 205);
  doc.setLineWidth(0.4);
  doc.roundedRect(tX, iY, iW, iH, 2, 2, 'FD');
  doc.setTextColor(15, 110, 86);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18.9);
  doc.text(pctAvance + '%', tX + iW / 2, iY + 11, { align: 'center' });
  doc.setTextColor(47, 107, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text('Avance', tX + iW / 2, iY + 17, { align: 'center' });

  // tarjeta Camaras
  doc.setFillColor(234, 246, 240);
  doc.setDrawColor(183, 224, 205);
  doc.setLineWidth(0.4);
  doc.roundedRect(tX + iW + 6, iY, iW, iH, 2, 2, 'FD');
  doc.setTextColor(15, 110, 86);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19.8);
  doc.text(String(nPtz + nBullet), tX + iW + 6 + iW / 2, iY + 11, { align: 'center' });
  doc.setTextColor(47, 107, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.1);
  doc.text('C\u00E1maras', tX + iW + 6 + iW / 2, iY + 17, { align: 'center' });

  // =============== CONDICION POR POSTE (dos columnas) ===============
  let y = 132;
  doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(T.condicion, M, y);
  y += 1.8;
  doc.setDrawColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + 32, y);
  y += 4;

  if (postes.length === 0) {
    doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.6);
    doc.text(T.sinPostes, M, y + 3);
  } else {
    const colW = (W - M * 2 - 6) / 2;
    const filaH = 16;
    const yIni = y;
    let col = 0, fila = 0;

    postes.forEach(function (p, idx) {
      if (yIni + (fila + 1) * filaH > H - 14) {
        if (col === 0) { col = 1; fila = 0; }
        else {
          doc.addPage();
          encabezado();
          col = 0; fila = 0;
          y = 30;
          doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text(T.condicion, M, y);
          y += 4;
        }
      }
      const baseY = (doc.getNumberOfPages() > 1 && fila === 0 && col === 0) ? y : yIni;
      const x = M + col * (colW + 6);
      const fy = baseY + fila * filaH;

      if ((fila + col) % 2 === 0) {
        doc.setFillColor(250, 249, 248);
        doc.roundedRect(x, fy - 3, colW, filaH - 1, 1.5, 1.5, 'F');
      }

      doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
      doc.circle(x + 4, fy + 1.5, 3.2, 'F');
      doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.text(String(p.num != null ? p.num : (idx + 1)), x + 4, fy + 2.7, { align: 'center' });

      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.9);
      doc.text(doc.splitTextToSize(txtUbicacion(p), colW - 12)[0] || '', x + 10, fy + 1.2);

      const meta = [];
      if (p.colonia) meta.push(T.col + p.colonia);
      if (p.cp) meta.push('CP ' + p.cp);
      if (meta.length > 0) {
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.text(doc.splitTextToSize(meta.join('  \u00B7  '), colW - 12)[0] || '', x + 10, fy + 5);
      }

      const ptz = Number(p.ptz) || 0;
      const bullet = Number(p.bullet) || 0;
      const vr = function (ok) { return ok ? VERDE : ROJO; };
      const chips = [
        { txt: T.cPtz, col: vr(ptz > 0) },
        { txt: T.cBullet1, col: vr(bullet >= 1) },
        { txt: T.cBullet2, col: vr(bullet >= 2) },
        { txt: T.cSos, col: colorBoton(p) },
        { txt: T.cInternet, col: vr(p.internet === true || p.conexion === true) },
        { txt: T.cCentro, col: vr(p.centro === true) }
      ];
      let cx = x + 10;
      chips.forEach(function (c) { cx += chip(doc, cx, fy + 7.4, c.txt, c.col) + 1.4; });

      fila++;
    });
  }

  // =============== PIE ===============
  const nPags = doc.getNumberOfPages();
  for (let i = 1; i <= nPags; i++) {
    doc.setPage(i);
    doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, H - 8.5, W - M, H - 8.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.text(T.generado + ' ' + fmtFecha(datos.generado_at) + '  \u00B7  ' + T.alcaldia, M, H - 4.5);
    doc.text(T.pagina + ' ' + i + ' ' + T.de + ' ' + nPags, W - M, H - 4.5, { align: 'right' });
  }

  // Agregar las hojas de fichas (verticales) al mismo PDF
  const logoInforme = logoUrl ? await cargarImagen(logoUrl.replace(/[^/]*$/, '') + 'gam-logo-informe.png') : null;
  try { await agregarFichasA(doc, datos, logoInforme); } catch (e) {}

  doc.save('Informe_Ejecutivo_' + (datos.clave || 'UT').replace(/[^\w-]/g, '') + '.pdf');
}

export default { generarInformePdf };