// ============================================================================
// useFilters.js — Hook con state de filtros + sync bidireccional con URL
// ----------------------------------------------------------------------------
// Lee de window.location.search al montar; escribe vía replaceState al
// cambiar; escucha popstate para back/forward del navegador.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { paramsToFilters, filtersToParams, EMPTY_FILTERS } from '../lib/filters';

function readFromURL(prefix = '') {
  if (typeof window === 'undefined') return { ...EMPTY_FILTERS };
  return paramsToFilters(window.location.search, prefix);
}

function writeToURL(filters, prefix = '') {
  if (typeof window === 'undefined') return;
  const sp = filtersToParams(filters, window.location.search, prefix);
  const qs = sp.toString();
  const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);
}

// `prefix` aísla este conjunto de filtros del resto: cada instancia de
// useFilters con un prefix distinto mantiene su propio estado y sus propias
// claves en la URL. Así Mapa GPS y Postes no comparten filtros.
export function useFilters(prefix = '') {
  const [filters, setFilters] = useState(() => readFromURL(prefix));

  useEffect(() => {
    writeToURL(filters, prefix);
  }, [filters, prefix]);

  useEffect(() => {
    const onPop = () => setFilters(readFromURL(prefix));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [prefix]);

  const toggleArrayValue = useCallback((dim, value) => {
    setFilters(prev => {
      const cur = prev[dim] || [];
      const next = cur.includes(value)
        ? cur.filter(v => v !== value)
        : [...cur, value];
      return { ...prev, [dim]: next };
    });
  }, []);

  const setVerified = useCallback((value) => {
    setFilters(prev => ({ ...prev, verified: value || null }));
  }, []);

  const clearDim = useCallback((dim) => {
    setFilters(prev => ({
      ...prev,
      [dim]: dim === 'verified' ? null : [],
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
  }, []);

  const isEmpty =
       !filters.stages?.length
    && !filters.uts?.length
    && !filters.capturadores?.length
    && !filters.tags?.length
    && !filters.verified
    && !filters.maint
    && !filters.incType
    && !filters.createdFrom
    && !filters.createdTo
    && !filters.modFrom
    && !filters.modTo;

  return {
    filters,
    setFilters,
    toggleArrayValue,
    setVerified,
    clearDim,
    clearAll,
    isEmpty,
  };
}
