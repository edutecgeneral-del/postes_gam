/**
 * Telemetría de errores para Field Coord v2.
 *
 * - Captura errores no controlados (window.onerror, unhandledrejection).
 * - Acepta reportes manuales vía reportError(err, source, extra).
 * - Dedupea errores idénticos en ventanas de 5s.
 * - Encola en localStorage cuando está offline o falla el insert,
 *   y reintenta al reconectar y al iniciar.
 * - Falla silenciosamente si Supabase no está configurado o si la
 *   tabla `app_error_logs` no existe: nunca rompe la app.
 */

import { getSupabase, hasSupabase } from './supabase.js';

const APP_VERSION = '1.1.0';
const BUILD_ID = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'unknown';
const STORAGE_KEY = 'pending_error_logs';
const MAX_PENDING = 50;
const DEDUP_WINDOW_MS = 5000;

const ctx = {
  user_id: null,
  user_email: null,
  user_role: null,
  active_view: null,
  current_action: null,
};

const recent = new Map();

export function setUserContext({ user_id = null, user_email = null, user_role = null } = {}) {
  ctx.user_id = user_id;
  ctx.user_email = user_email;
  ctx.user_role = user_role;
}

export function setActiveView(view) {
  ctx.active_view = view;
}

export function setCurrentAction(action) {
  ctx.current_action = action;
}

function buildPayload(error, source, extra) {
  const message = (error?.message ?? String(error ?? 'unknown')).slice(0, 2000);
  const stack = error?.stack ? String(error.stack).slice(0, 8000) : null;
  return {
    message,
    stack,
    source: source ? String(source).slice(0, 200) : null,
    user_id: ctx.user_id,
    user_email: ctx.user_email,
    user_role: ctx.user_role,
    app_version: `${APP_VERSION}+${BUILD_ID}`,
    active_view: ctx.active_view,
    current_action: ctx.current_action,
    user_agent: navigator.userAgent,
    is_online: navigator.onLine,
    url: window.location.href,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    extra: extra ?? null,
  };
}

function shouldReport(payload) {
  const key = `${payload.source}::${payload.message}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 100) {
    for (const [k, ts] of recent) if (now - ts > 60_000) recent.delete(k);
  }
  return true;
}

function enqueue(payload) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push(payload);
    while (queue.length > MAX_PENDING) queue.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage lleno o bloqueado */
  }
}

async function flushQueue() {
  if (!hasSupabase()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;
    const { error } = await getSupabase().from('app_error_logs').insert(queue);
    if (!error) localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin red o tabla inexistente: reintenta luego */
  }
}

async function send(payload) {
  if (!hasSupabase()) {
    enqueue(payload);
    return;
  }
  try {
    const { error } = await getSupabase().from('app_error_logs').insert(payload);
    if (error) enqueue(payload);
  } catch {
    enqueue(payload);
  }
}

export function reportError(error, source = 'manual', extra = null) {
  try {
    const payload = buildPayload(error, source, extra);
    if (!shouldReport(payload)) return;
    if (!navigator.onLine) {
      enqueue(payload);
      return;
    }
    send(payload);
  } catch {
    /* nunca dejar que el tracker rompa la app */
  }
}

export function initErrorTracker() {
  window.addEventListener('error', (event) => {
    const err = event.error || new Error(event.message || 'window error');
    reportError(err, 'window.onerror', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err = reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
    reportError(err, 'unhandledrejection');
  });

  window.addEventListener('online', () => {
    flushQueue();
  });

  if (navigator.onLine) flushQueue();
}
