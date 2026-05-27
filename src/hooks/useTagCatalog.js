// src/hooks/useTagCatalog.js
//
// Hook React para consumir el catálogo de tags.
// Cacheado a nivel módulo en src/lib/tags.js, así que llamarlo en muchos
// componentes no genera fetches duplicados.

import { useEffect, useState } from 'react';
import { fetchTagCatalog } from '../lib/tags.js';

export function useTagCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTagCatalog()
      .then(data => {
        if (!cancelled) {
          setCatalog(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
          // Si tienes errorTracker integrado, descomenta:
          // import('../lib/errorTracker.js').then(m => m.errorTracker?.captureError?.(err, { source: 'useTagCatalog' }));
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { catalog, error, loading };
}
