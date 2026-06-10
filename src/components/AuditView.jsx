/**
 * src/components/AuditView.jsx — Historial de auditoría (admin/director).
 *
 * Lee de v_audit_recent. Muestra quién hizo qué y cuándo.
 */

import { useState, useEffect } from 'react';
import { History, Loader2, AlertCircle, RefreshCw, User, Database, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSupabase } from '../lib/supabase.js';

const ACTION_COLORS = {
  INSERT: 'text-green-400 bg-green-500/10 border-green-500/30',
  UPDATE: 'text-brand-400 bg-brand-500/10 border-brand-500/30',
  DELETE: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const TABLE_LABELS = {
  posts: 'Poste',
  post_stages: 'Etapa',
  incidents: 'Incidencia',
  unidades_territoriales: 'UT',
  user_profiles: 'Usuario',
};

export default function AuditView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const AUDIT_PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      let q = sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(500);
      if (filterAction) q = q.eq('action', filterAction);
      if (filterTable) q = q.eq('table_name', filterTable);
      const { data, error } = await q;
      if (error) throw error;
      setEntries(data || []);
    } catch (e) {
      setError(e?.message || 'Error cargando audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterAction, filterTable]);
  useEffect(() => { setPage(0); }, [search, entries]);

  const describeChange = (entry) => {
    if (entry.action === 'INSERT') return `Creó ${TABLE_LABELS[entry.table_name] || entry.table_name} ${entry.row_id || ''}`;
    if (entry.action === 'DELETE') return `Borró ${TABLE_LABELS[entry.table_name] || entry.table_name} ${entry.row_id || ''}`;
    // UPDATE: mostrar qué campos cambiaron
    if (entry.action === 'UPDATE' && entry.old_data && entry.new_data) {
      const changed = [];
      for (const key of Object.keys(entry.new_data)) {
        const oldVal = entry.old_data[key];
        const newVal = entry.new_data[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changed.push(key);
        }
      }
      const changedStr = changed.length > 0 ? ` · Cambió: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? '…' : ''}` : '';
      return `Actualizó ${TABLE_LABELS[entry.table_name] || entry.table_name} ${entry.row_id || ''}${changedStr}`;
    }
    return `${entry.action} en ${entry.table_name}`;
  };

  // Búsqueda + paginación cliente (la consulta a la BD no cambia)
  const filteredEntries = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase();
        return (e.user_display_name || '').toLowerCase().includes(q)
          || (e.user_email || '').toLowerCase().includes(q)
          || (e.table_name || '').toLowerCase().includes(q)
          || (TABLE_LABELS[e.table_name] || '').toLowerCase().includes(q)
          || String(e.row_id ?? '').toLowerCase().includes(q)
          || (e.action || '').toLowerCase().includes(q);
      })
    : entries;
  const auditTotalPages = Math.max(1, Math.ceil(filteredEntries.length / AUDIT_PAGE_SIZE));
  const auditSafePage = Math.min(page, auditTotalPages - 1);
  const pagedEntries = filteredEntries.slice(auditSafePage * AUDIT_PAGE_SIZE, (auditSafePage + 1) * AUDIT_PAGE_SIZE);

  return (
    <div className="space-y-4 h-full overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <History className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-950">Auditoría</h2>
            <p className="text-xs text-stone-600">Últimas 500 acciones</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario, tabla, ID…"
                   className="bg-stone-100 border border-stone-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-950 placeholder-stone-500 focus:outline-none focus:border-purple-500 w-44" />
          </div>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-950">
            <option value="">Todas las acciones</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)}
            className="bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-stone-950">
            <option value="">Todas las tablas</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
        </div>
      ) : (
        <div className="bg-stone-50 border border-stone-300 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-stone-100/50 text-xs text-stone-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fecha / hora</th>
                <th className="text-left px-4 py-2 font-medium">Acción</th>
                <th className="text-left px-4 py-2 font-medium">Usuario</th>
                <th className="text-left px-4 py-2 font-medium">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {pagedEntries.map(e => (
                <tr key={e.id} className="border-t border-stone-300 hover:bg-stone-100/30">
                  <td className="px-4 py-2 text-xs text-stone-600 whitespace-nowrap">
                    {new Date(e.ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-mono rounded px-2 py-0.5 border ${ACTION_COLORS[e.action] || 'text-stone-600 bg-stone-100 border-stone-300'}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-stone-500" />
                      <span className="text-stone-800">{e.user_display_name || e.user_email || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-stone-700">
                    {describeChange(e)}
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-stone-500 text-sm">
                    <Database className="w-8 h-8 mx-auto mb-2 text-stone-400" />
                    {search.trim() ? 'Sin registros que coincidan con la búsqueda.' : 'No hay registros con esos filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && auditTotalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-mono text-stone-500">
            {filteredEntries.length.toLocaleString()} registros · Página {auditSafePage + 1} de {auditTotalPages}
          </div>
          <div className="flex gap-1">
            <button disabled={auditSafePage === 0} onClick={() => setPage(Math.max(0, auditSafePage - 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-purple-500 hover:text-purple-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
            </button>
            <button disabled={auditSafePage >= auditTotalPages - 1} onClick={() => setPage(Math.min(auditTotalPages - 1, auditSafePage + 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-purple-500 hover:text-purple-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
