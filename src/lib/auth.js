/**
 * src/lib/auth.js — Autenticación y permisos.
 *
 * Maneja la sesión Supabase Auth y expone helpers para chequear qué puede
 * hacer el usuario actual según su rol (admin, capturador, director).
 *
 * Se usa junto con LoginScreen.jsx y el hook useAuth() del App.jsx.
 */

import { getSupabase } from './supabase.js';

export const ROLES = {
  ADMIN: 'admin',
  CAPTURADOR: 'capturador',
  DIRECTOR: 'director',
  SCOUT: 'scout',
  SERVICIOS_URBANOS: 'servicios_urbanos',
  PARTICIPACION_CIUDADANA: 'participacion_ciudadana',
  RAAL: 'raal',
};

export const ALL_STAGE_IDS = ['marca', 'dado', 'parado', 'camaras', 'internet', 'conexion_poste', 'centro'];
export const RAAL_STAGE_IDS = ['dado', 'parado'];

// -----------------------------------------------------------------------------
// Login / Logout
// -----------------------------------------------------------------------------

export async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

/**
 * Subscribe a cambios de sesión. Devuelve un unsubscribe.
 */
export function onAuthChange(callback) {
  const sb = getSupabase();
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    callback(session);
  });
  return () => data?.subscription?.unsubscribe();
}

// -----------------------------------------------------------------------------
// Perfil del usuario (rol, allowed_stages, nombre)
// -----------------------------------------------------------------------------

/**
 * Carga el perfil completo del usuario actual desde Supabase.
 * Si el usuario está loggeado pero no tiene perfil en user_profiles,
 * devuelve null (hay que crearle el perfil — en ese caso el admin tiene que
 * asignarle rol desde la UI).
 */
export async function loadCurrentProfile() {
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) return null;

  const { data, error } = await sb.rpc('current_user_profile');
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const row = data[0];
  return {
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name || row.email?.split('@')[0] || 'Usuario',
    allowedStages: Array.isArray(row.allowed_stages) ? row.allowed_stages : ALL_STAGE_IDS,
    email: row.email,
  };
}

// -----------------------------------------------------------------------------
// Permisos (se calculan en el cliente para UI, pero RLS los refuerza en DB)
// -----------------------------------------------------------------------------

export function isAdmin(profile) {
  return profile?.role === ROLES.ADMIN;
}

export function isDirector(profile) {
  return profile?.role === ROLES.DIRECTOR;
}

export function isCapturador(profile) {
  return profile?.role === ROLES.CAPTURADOR;
}

export function isScout(profile) {
  return profile?.role === ROLES.SCOUT;
}

export function isServiciosUrbanos(profile) {
  return profile?.role === ROLES.SERVICIOS_URBANOS;
}

export function isParticipacionCiudadana(profile) {
  return profile?.role === ROLES.PARTICIPACION_CIUDADANA;
}

export function isRAAL(profile) {
  return profile?.role === ROLES.RAAL;
}

// SU y PC tienen mismos permisos
export function isCoordinador(profile) {
  return isServiciosUrbanos(profile) || isParticipacionCiudadana(profile);
}

/**
 * ¿Puede el usuario capturar/modificar una etapa?
 * - Admin: siempre sí
 * - Director/Coordinador: nunca (solo lectura o propuestas)
 * - Capturador: sí si la etapa está en su allowed_stages
 * - RAAL: solo E1-E3, y sus capturas necesitan confirmación scout
 */
export function canCaptureStage(profile, stageId) {
  if (!profile) return false;
  if (profile.role === ROLES.ADMIN) return true;
  if (profile.role === ROLES.DIRECTOR) return false;
  if (isCoordinador(profile)) return false; // proponen, no capturan
  if (profile.role === ROLES.CAPTURADOR) {
    return profile.allowedStages?.includes(stageId) || false;
  }
  if (profile.role === ROLES.RAAL) {
    return RAAL_STAGE_IDS.includes(stageId);
  }
  return false;
}

/**
 * ¿Puede el usuario crear/resolver incidencias?
 * - Admin y capturador: sí
 * - Director: no
 */
export function canManageIncidents(profile) {
  if (!profile) return false;
  return profile.role === ROLES.ADMIN
    || profile.role === ROLES.CAPTURADOR
    || profile.role === ROLES.SCOUT
    || profile.role === ROLES.SERVICIOS_URBANOS
    || profile.role === ROLES.RAAL
    || profile.role === ROLES.PARTICIPACION_CIUDADANA
    || profile.role === ROLES.PARTICIPACION_CIUDADANA;
}

/** Can mark incidents as 'atendida' (intermediate state, needs verification) */
export function canAttendIncidents(profile) {
  if (!profile) return false;
  return profile.role === ROLES.RAAL
    || profile.role === ROLES.CAPTURADOR
    || profile.role === ROLES.SERVICIOS_URBANOS
    || profile.role === ROLES.PARTICIPACION_CIUDADANA;
}

/** Can verify attended incidents and resolve them (final state) */
export function canResolveIncidents(profile) {
  if (!profile) return false;
  return profile.role === ROLES.ADMIN
    || profile.role === ROLES.SCOUT;
}


/**
 * ¿Puede el usuario modificar datos de postes en general (dirección, UT, etc.)?
 * - Admin: sí
 * - Capturador: sí (sirve por si la cuadrilla corrige la dirección al hacer marca)
 * - Director: no
 */
export function canEditPosts(profile) {
  if (!profile) return false;
  return profile.role === ROLES.ADMIN || profile.role === ROLES.CAPTURADOR;
}

/**
 * ¿Puede el usuario borrar postes o etapas? — Solo admin.
 */
export function canDelete(profile) {
  return profile?.role === ROLES.ADMIN;
}

/**
 * ¿Puede el usuario ver el audit log? — Admin y director.
 */
export function canViewAudit(profile) {
  return profile?.role === ROLES.ADMIN || profile?.role === ROLES.DIRECTOR;
}

/**
 * ¿Puede el usuario gestionar otros usuarios (crear, borrar, cambiar roles)? — Solo admin.
 */
export function canManageUsers(profile) {
  return profile?.role === ROLES.ADMIN;
}

/**
 * ¿Puede el usuario marcar / desmarcar postes como "revisado"? — Solo admin.
 * El backend tambien lo enforza con el trigger posts_revisado_admin_only.
 */
export function canMarkRevisado(profile) {
  return profile?.role === ROLES.ADMIN;
}

// -----------------------------------------------------------------------------
// Admin: crear / borrar / listar usuarios (vía Edge Functions)
// -----------------------------------------------------------------------------

export async function createUser({ email, password, role, displayName, allowedStages }) {
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) throw new Error('No hay sesión activa');

  const { data, error } = await sb.functions.invoke('create-user', {
    body: {
      email,
      password,
      role,
      display_name: displayName,
      allowed_stages: allowedStages,
    },
  });
  if (error) throw error;
  return data;
}

export async function deleteUser(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('delete-user', {
    body: { user_id: userId },
  });
  if (error) throw error;
  return data;
}

export async function listAllUsers() {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('list_users_with_email');
  if (error) throw error;
  return (data || []).map(row => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    allowedStages: row.allowed_stages || ALL_STAGE_IDS,
    createdAt: row.created_at,
  }));
}

/**
 * Actualiza los permisos (role + allowed_stages) de un usuario.
 * Solo admin puede llamarlo (RLS lo refuerza).
 */
export async function updateUserProfile(userId, { role, displayName, allowedStages }) {
  const sb = getSupabase();
  const updates = {};
  if (role !== undefined) updates.role = role;
  if (displayName !== undefined) updates.display_name = displayName;
  if (allowedStages !== undefined) updates.allowed_stages = allowedStages;

  const { error } = await sb
    .from('user_profiles')
    .update(updates)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function changeUserPassword(userId, newPassword) {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('change-password', {
    body: { user_id: userId, new_password: newPassword },
  });
  if (error) throw error;
  return data;
}

export default {
  ROLES,
  ALL_STAGE_IDS,
  signIn,
  signOut,
  getCurrentSession,
  onAuthChange,
  loadCurrentProfile,
  isAdmin,
  isDirector,
  isCapturador,
  canCaptureStage,
  canManageIncidents,
  canAttendIncidents,
  canResolveIncidents,
  canEditPosts,
  canDelete,
  canViewAudit,
  canManageUsers,
  canMarkRevisado,
  createUser,
  deleteUser,
  listAllUsers,
  updateUserProfile,
  changeUserPassword,
};
