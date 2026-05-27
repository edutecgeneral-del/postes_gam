/**
 * Cliente de Supabase (singleton).
 *
 * Lee las credenciales de variables de entorno Vite:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Si cualquiera de las dos está ausente, `hasSupabase()` devuelve false y el
 * resto de la app cae automáticamente al fallback de localStorage.
 */

import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;

export function hasSupabase() {
  return Boolean(URL && ANON_KEY);
}

export function getSupabase() {
  if (!hasSupabase()) {
    throw new Error('Supabase no configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
  }
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

export default { getSupabase, hasSupabase };
