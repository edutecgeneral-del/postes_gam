// src/lib/utColors.js
// Paleta cíclica de 10 colores para diferenciar UTs en el mapa.
// El color se asigna por la POSICIÓN de la UT en la selección:
// la 1ª UT → color 0, la 11ª UT → color 0 de nuevo, etc.

export const UT_PALETTE = [
  '#E6194B', // rojo
  '#3CB44B', // verde
  '#4363D8', // azul
  '#F58231', // naranja
  '#911EB4', // morado
  '#00B8D4', // cian
  '#F032E6', // magenta
  '#9A6324', // marrón
  '#808000', // oliva
  '#E6739F', // rosa
];

// Construye un Map utId -> color según el orden de selección.
export function buildUTColorMap(selectedUts = []) {
  const m = new Map();
  selectedUts.forEach((ut, i) => {
    m.set(ut, UT_PALETTE[i % UT_PALETTE.length]);
  });
  return m;
}

// Color para una UT dada su posición (útil para chips de la UI).
export function colorForUTIndex(i) {
  return UT_PALETTE[i % UT_PALETTE.length];
}