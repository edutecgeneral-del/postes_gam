/**
 * Cliente Supabase para la capa geoespacial (proyecto v3).
 *
 * Singleton aparte del cliente principal (src/lib/supabase.js), porque
 * la sección "Geo v2" lee del schema `geo` que vive en otro proyecto
 * Supabase (v3 - qogxkvkgpyfnqabzkfft).
 *
 * Lee las credenciales de:
 *   VITE_GEO_SUPABASE_URL
 *   VITE_GEO_SUPABASE_ANON_KEY
 *
 * Si cualquiera de las dos está ausente, `hasGeoSupabase()` devuelve false
 * y la sección Geo v2 puede mostrar un estado vacío con instrucciones.
 */

import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_GEO_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_GEO_SUPABASE_ANON_KEY;

let client = null;

export function hasGeoSupabase() {
  return Boolean(URL && ANON_KEY);
}

export function getGeoSupabase() {
  if (!hasGeoSupabase()) {
    throw new Error(
      'Supabase Geo (v3) no configurado. Revisa VITE_GEO_SUPABASE_URL y VITE_GEO_SUPABASE_ANON_KEY en .env'
    );
  }
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: {
        persistSession: false,    // este cliente es solo de lectura geo, sin sesión propia
        autoRefreshToken: false,
      },
      db: {
        schema: 'geo',            // todas las queries por defecto van al schema geo
      },
    });
  }
  return client;
}

export default { getGeoSupabase, hasGeoSupabase };