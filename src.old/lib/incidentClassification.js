/**
 * src/lib/incidentClassification.js
 *
 * Funciones de Supabase para el sistema de categorías y clasificación
 * de incidencias. Solo admin/director pueden ver estos datos (RLS).
 */
import { getSupabase, hasSupabase } from './supabase.js';

function sb() {
  if (!hasSupabase()) throw new Error('Supabase no configurado');
  return getSupabase();
}

/**
 * Cargar todas las categorías activas.
 * Solo devuelve datos si el usuario es admin o director (RLS).
 */
export async function loadIncidentCategories() {
  try {
    const { data, error } = await sb()
      .from('incident_categories')
      .select('id, name, description, color, active, created_at')
      .eq('active', true)
      .order('name');
    if (error) {
      if (error.code === '42501' || (error.message || '').includes('permission')) return [];
      console.warn('[incidentClassification] loadCategories error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[incidentClassification] loadCategories exception:', e.message);
    return [];
  }
}

/**
 * Cargar clasificaciones existentes para un conjunto de incidencias.
 * Solo devuelve datos si el usuario es admin o director (RLS).
 */
export async function loadIncidentClassifications() {
  try {
    const { data, error } = await sb()
      .from('incident_classifications')
      .select('incident_id, category_id, classified_by_name, classified_at, notes, incident_categories ( name, color )');
    if (error) {
      if (error.code === '42501' || (error.message || '').includes('permission')) return {};
      console.warn('[incidentClassification] loadClassifications error:', error.message);
      return {};
    }
    const map = {};
    (data || []).forEach(c => {
      map[c.incident_id] = {
        categoryId: c.category_id,
        categoryName: c.incident_categories ? c.incident_categories.name : '?',
        categoryColor: c.incident_categories ? c.incident_categories.color : '#6B7280',
        classifiedByName: c.classified_by_name,
        classifiedAt: c.classified_at,
        notes: c.notes,
      };
    });
    return map;
  } catch (e) {
    console.warn('[incidentClassification] loadClassifications exception:', e.message);
    return {};
  }
}

/**
 * Clasificar o reclasificar una incidencia (admin only via RPC).
 */
export async function classifyIncident(incidentId, categoryId, notes) {
  const { error } = await sb().rpc('classify_incident', {
    p_incident_id: incidentId,
    p_category_id: categoryId,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Crear una nueva categoría de incidencias (admin only via RPC).
 */
export async function createCategory(name, description, color) {
  const { data, error } = await sb().rpc('create_incident_category', {
    p_name: name,
    p_description: description || null,
    p_color: color || '#6B7280',
  });
  if (error) throw new Error(error.message);
  return data;
}
