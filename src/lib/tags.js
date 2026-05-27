// src/lib/tags.js
//
// Cliente del sistema de etiquetas para CI1215V2.
// Patrón: catálogo en cache (TTL infinito hasta invalidate), mapeo snake->camel.
// Compatible con el patrón usado en src/lib/relocate.js y src/lib/data.js.
//
// Tablas Supabase v2 (rcwmjgcnpqlwrckcymrj):
//   - tag_categorias  (catálogo de categorías: lote, validacion, etc.)
//   - tags            (valores concretos: carga_inicial_2026_05_06, ...)
//   - post_tags       (asignación N:M)

import { getSupabase } from './supabase.js';

let _catalogCache = null;
let _catalogPromise = null;

/**
 * Fetch del catálogo completo (categorías + tags activos).
 * Cacheado en memoria; usa force=true tras crear/editar tags.
 * @param {boolean} force
 * @returns {Promise<{categorias: Array, tags: Array}>}
 */
export async function fetchTagCatalog(force = false) {
  if (!force && _catalogCache) return _catalogCache;
  if (!force && _catalogPromise) return _catalogPromise;

  _catalogPromise = (async () => {
    const sb = getSupabase();
    const [catRes, tagsRes] = await Promise.all([
      sb.from('tag_categorias').select('*').order('orden', { ascending: true }),
      sb.from('tags').select('*').eq('activo', true).order('orden', { ascending: true }),
    ]);

    if (catRes.error) throw catRes.error;
    if (tagsRes.error) throw tagsRes.error;

    const categorias = (catRes.data ?? []).map(c => ({
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      multiSelect: c.multi_select,
      color: c.color,
      orden: c.orden,
    }));

    const tags = (tagsRes.data ?? []).map(t => ({
      id: t.id,
      categoriaId: t.categoria_id,
      label: t.label,
      color: t.color,
      orden: t.orden,
      activo: t.activo,
    }));

    _catalogCache = { categorias, tags };
    return _catalogCache;
  })();

  try {
    return await _catalogPromise;
  } finally {
    _catalogPromise = null;
  }
}

export function invalidateTagCatalog() {
  _catalogCache = null;
  _catalogPromise = null;
}

// ---- Selectores puros ----------------------------------------------------

export function tagsForCategory(catalog, categoriaId) {
  if (!catalog) return [];
  return catalog.tags.filter(t => t.categoriaId === categoriaId);
}

export function getTagById(catalog, tagId) {
  return catalog?.tags.find(t => t.id === tagId) ?? null;
}

export function getCategoryById(catalog, categoriaId) {
  return catalog?.categorias.find(c => c.id === categoriaId) ?? null;
}

// ---- Mutaciones (admin only por RLS) -------------------------------------

/**
 * Asigna un tag a un poste. Solo admin (por RLS).
 * Si la categoría es single-select, considera removeAllTagsInCategoryFromPost antes.
 */
export async function assignTagToPost(postId, tagId, asignadoPor = null) {
  const sb = getSupabase();
  const { error } = await sb
    .from('post_tags')
    .insert({ post_id: postId, tag_id: tagId, asignado_por: asignadoPor });
  if (error) throw error;
}

export async function removeTagFromPost(postId, tagId) {
  const sb = getSupabase();
  const { error } = await sb
    .from('post_tags')
    .delete()
    .eq('post_id', postId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

/**
 * Quita todos los tags de una categoría de un poste (útil para single-select
 * antes de un nuevo assign).
 */
export async function removeAllTagsInCategoryFromPost(postId, categoriaId, catalog) {
  const tagIds = tagsForCategory(catalog, categoriaId).map(t => t.id);
  if (!tagIds.length) return;
  const sb = getSupabase();
  const { error } = await sb
    .from('post_tags')
    .delete()
    .eq('post_id', postId)
    .in('tag_id', tagIds);
  if (error) throw error;
}

// ---- Filtros sobre arrays de posts en cliente ----------------------------

/**
 * Devuelve los posts que tienen el tag especificado.
 * Asume que `post.tags` viene poblado por mapPostFromDb (ver INTEGRATION.md).
 */
export function filterPostsByTag(posts, tagId) {
  if (!tagId) return posts;
  if (tagId === '__none__') return posts.filter(p => !p.tags?.length);
  return posts.filter(p => p.tags?.some(t => t.id === tagId));
}

/**
 * Filtra por categoría: devuelve posts que tienen AL MENOS un tag de la categoría.
 * Útil para "mostrar solo postes con lote asignado".
 */
export function filterPostsByCategory(posts, categoriaId) {
  if (!categoriaId) return posts;
  return posts.filter(p => p.tags?.some(t => t.categoriaId === categoriaId));
}
