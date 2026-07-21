// src/lib/fichasPdf.js
// PDF "Fichas de Poste" por Unidad Territorial - Alcaldia GAM.
// Vertical (A4 retrato), 2 postes por hoja: foto grande arriba + ficha abajo.
// Foto: E4 (camaras) con respaldo a E3 (parado); viene en datos.postes[].foto (del RPC).
// Mismo estilo que el Informe Ejecutivo (header blanco con acento guinda).
// Los acentos van como escapes \uXXXX para evitar problemas de codificacion.

const GUINDA = [157, 33, 72];
const DORADO = [178, 142, 92];
const GRIS = [85, 88, 90];
const GRIS_SUAVE = [232, 232, 232];
const BLANCO = [255, 255, 255];
const VERDE = [22, 143, 96];
const ROJO = [198, 40, 48];
const AZUL = [37, 99, 235];

const T = {
  fichas: 'FICHAS DE POSTE',
  cPtz: 'PTZ',
  cBullet1: 'BULLET 1',
  cBullet2: 'BULLET 2',
  cSos: 'BOT\u00D3N',
  cInternet: 'INTERNET',
  cCentro: 'CI',
  sinFoto: 'Sin foto disponible',
  generado: 'Generado',
  alcaldia: 'Alcald\u00EDa Gustavo A. Madero',
  pagina: 'P\u00E1gina',
  de: 'de',
  entre: ', entre ',
  y: ' y ',
  cercaDe: ', cerca de ',
  col: 'Col. ',
  guion: '\u2014'
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

// Devuelve { data, w, h } de una foto (base64 + dimensiones reales) o null.
function cargarFoto(url) {
  return new Promise(function (resolve) {
    if (!url) { resolve(null); return; }
    fetch(url).then(function (r) {
      if (!r.ok) { resolve(null); return; }
      return r.blob();
    }).then(function (blob) {
      if (!blob) { resolve(null); return; }
      const fr = new FileReader();
      fr.onload = function () {
        const data = fr.result;
        const img = new Image();
        img.onload = function () { resolve({ data: data, w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = function () { resolve(null); };
        img.src = data;
      };
      fr.onerror = function () { resolve(null); };
      fr.readAsDataURL(blob);
    }).catch(function () { resolve(null); });
  });
}
// ============ dibujo ============

function chip(doc, x, y, texto, color) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const w = doc.getTextWidth(texto) + 5;
  const h = 4.6;
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, w, h, 2.3, 2.3, 'F');
  doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.text(texto, x + w / 2, y + 3.1, { align: 'center' });
  return w;
}

// Color del boton: verde = tiene E5 (modem); azul = solo E6; rojo = sin E5.
function colorBoton(p) {
  if (p.internet === true) return VERDE;
  if (p.conexion === true) return AZUL;
  return ROJO;
}

// Dibuja una ficha (foto + datos) dentro de una mitad de la hoja.
// yTop = borde superior de la mitad; hMitad = alto disponible.
function dibujarFicha(doc, p, foto, yTop, hMitad, M, W) {
  const ancho = W - M * 2;
  const infoH = 26;                 // alto reservado para los datos de abajo
  const fotoY = yTop + 2;
  const fotoMaxH = hMitad - infoH - 4;
  const fotoMaxW = ancho;

  // marco de la foto
  doc.setFillColor(238, 238, 238);
  doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, fotoY, fotoMaxW, fotoMaxH, 2, 2, 'FD');

  if (foto && foto.data && foto.w && foto.h) {
    // encajar la foto dentro del marco conservando proporcion (contain)
    const escala = Math.min(fotoMaxW / foto.w, fotoMaxH / foto.h);
    const iw = foto.w * escala, ih = foto.h * escala;
    const ix = M + (fotoMaxW - iw) / 2, iy = fotoY + (fotoMaxH - ih) / 2;
    try { doc.addImage(foto.data, 'JPEG', ix, iy, iw, ih, undefined, 'FAST'); } catch (e) {}
  } else {
    doc.setTextColor(165, 165, 165);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(T.sinFoto, M + fotoMaxW / 2, fotoY + fotoMaxH / 2, { align: 'center' });
  }

  // ---- datos abajo ----
  const dy = fotoY + fotoMaxH + 6;

  // numero del poste (circulo guinda)
  doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
  doc.circle(M + 5, dy + 1, 4.5, 'F');
  doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(p.num != null ? p.num : ''), M + 5, dy + 2.6, { align: 'center' });

  // calle / entre
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(txtUbicacion(p), ancho - 16)[0] || '', M + 12, dy + 1);

  // colonia / cp
  const meta = [];
  if (p.colonia) meta.push(T.col + p.colonia);
  if (p.cp) meta.push('CP ' + p.cp);
  if (meta.length > 0) {
    doc.setTextColor(90, 90, 90);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(meta.join('  \u00B7  '), ancho - 16)[0] || '', M + 12, dy + 6);
  }

  // chips de estado
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
  let cx = M + 12;
  chips.forEach(function (c) { cx += chip(doc, cx, dy + 10, c.txt, c.col) + 2; });
}

// ============ documento ============

export async function generarFichasPdf(datos, logoUrl) {
  const mod = await import('jspdf');
  const JsPDF = mod.jsPDF || mod.default;
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const W = 210, H = 297, M = 12;

  const postes = Array.isArray(datos.postes) ? datos.postes : [];

  // Logo a color (mismo que el informe): reemplaza "-blanco" en la ruta si aplica.
  const logo = logoUrl
    ? await cargarImagen(logoUrl.replace(/[^/]*$/, '') + 'gam-logo-informe.png')
    : null;

  // Precargar todas las fotos en paralelo (E4 con respaldo a E3 ya viene en p.foto).
  const fotos = await Promise.all(postes.map(function (p) { return cargarFoto(p.foto); }));

  function encabezado() {
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 0, 3, 20, 'F');
    if (logo) {
      let ratio = 2.55;
      try {
        const pr = doc.getImageProperties(logo);
        if (pr && pr.width && pr.height) ratio = pr.width / pr.height;
      } catch (e) {}
      let lh = 13, lw = 13 * ratio;
      if (lw > 55) { lw = 55; lh = 55 / ratio; }
      try { doc.addImage(logo, 'PNG', M, (20 - lh) / 2, lw, lh, undefined, 'FAST'); } catch (e) {}
    }
    doc.setTextColor(138, 138, 138);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(T.fichas, W / 2, 8, { align: 'center', charSpace: 0.8 });
    doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const titulo = (datos.nombre || '').toUpperCase() + '  \u2014  ' + (datos.clave || '');
    doc.text(doc.splitTextToSize(titulo, 175)[0] || '', W / 2, 15.5, { align: 'center' });
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 20, W, 0.9, 'F');
    doc.setFillColor(DORADO[0], DORADO[1], DORADO[2]);
    doc.rect(0, 20.9, W, 0.7, 'F');
  }

  function pie(nPag, nTotal) {
    doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(T.generado + ' ' + fmtFecha(datos.generado_at) + '  \u00B7  ' + T.alcaldia, M, H - 6);
    doc.text(T.pagina + ' ' + nPag + ' ' + T.de + ' ' + nTotal, W - M, H - 6, { align: 'right' });
  }

  if (postes.length === 0) {
    encabezado();
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Sin postes registrados en esta unidad territorial.', W / 2, 60, { align: 'center' });
    pie(1, 1);
    doc.save('Fichas_' + (datos.clave || 'UT').replace(/[^\w-]/g, '') + '.pdf');
    return;
  }

  // 2 postes por hoja
  const yTop = 26;                       // inicio del area de contenido
  const yBot = H - 12;                   // fin (antes del pie)
  const hMitad = (yBot - yTop - 4) / 2;  // alto de cada mitad (con separacion)
  const nPags = Math.ceil(postes.length / 2);

  postes.forEach(function (p, idx) {
    const enHoja = idx % 2;              // 0 = arriba, 1 = abajo
    if (enHoja === 0) {
      if (idx > 0) doc.addPage();
      encabezado();
      pie(Math.floor(idx / 2) + 1, nPags);
    }
    const y = yTop + enHoja * (hMitad + 4);
    dibujarFicha(doc, p, fotos[idx], y, hMitad, M, W);

    // separador entre las 2 fichas de la hoja
    if (enHoja === 0) {
      doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, yTop + hMitad + 2, W - M, yTop + hMitad + 2);
    }
  });

  doc.save('Fichas_' + (datos.clave || 'UT').replace(/[^\w-]/g, '') + '.pdf');
}

export default { generarFichasPdf };
// Agrega las hojas de fichas a un doc jsPDF ya existente (para unir con el Informe).
// No crea ni guarda el PDF; solo dibuja paginas nuevas verticales.
export async function agregarFichasA(doc, datos, logo) {
  const W = 210, H = 297, M = 12;
  const postes = Array.isArray(datos.postes) ? datos.postes : [];
  if (postes.length === 0) return;

  const fotos = await Promise.all(postes.map(function (p) { return cargarFoto(p.foto); }));

  function encabezado() {
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 0, 3, 20, 'F');
    if (logo) {
      let ratio = 2.55;
      try {
        const pr = doc.getImageProperties(logo);
        if (pr && pr.width && pr.height) ratio = pr.width / pr.height;
      } catch (e) {}
      let lh = 13, lw = 13 * ratio;
      if (lw > 55) { lw = 55; lh = 55 / ratio; }
      try { doc.addImage(logo, 'PNG', M, (20 - lh) / 2, lw, lh, undefined, 'FAST'); } catch (e) {}
    }
    doc.setTextColor(138, 138, 138);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(T.fichas, W / 2, 8, { align: 'center', charSpace: 0.8 });
    doc.setTextColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const titulo = (datos.nombre || '').toUpperCase() + '  \u2014  ' + (datos.clave || '');
    doc.text(doc.splitTextToSize(titulo, 175)[0] || '', W / 2, 15.5, { align: 'center' });
    doc.setFillColor(GUINDA[0], GUINDA[1], GUINDA[2]);
    doc.rect(0, 20, W, 0.9, 'F');
    doc.setFillColor(DORADO[0], DORADO[1], DORADO[2]);
    doc.rect(0, 20.9, W, 0.7, 'F');
  }

  function pie() {
    doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(T.generado + ' ' + fmtFecha(datos.generado_at) + '  \u00B7  ' + T.alcaldia, M, H - 6);
    const n = doc.getNumberOfPages();
    doc.text(T.pagina + ' ' + n, W - M, H - 6, { align: 'right' });
  }

  const yTop = 26;
  const yBot = H - 12;
  const hMitad = (yBot - yTop - 4) / 2;

  postes.forEach(function (p, idx) {
    const enHoja = idx % 2;
    if (enHoja === 0) {
      doc.addPage('a4', 'portrait');   // nueva hoja vertical
      encabezado();
      pie();
    }
    const y = yTop + enHoja * (hMitad + 4);
    dibujarFicha(doc, p, fotos[idx], y, hMitad, M, W);
    if (enHoja === 0) {
      doc.setDrawColor(GRIS_SUAVE[0], GRIS_SUAVE[1], GRIS_SUAVE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, yTop + hMitad + 2, W - M, yTop + hMitad + 2);
    }
  });
}