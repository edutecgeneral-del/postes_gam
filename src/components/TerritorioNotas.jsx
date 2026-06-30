import React, { useState, useEffect } from 'react';
import { getTerritorioNotas, upsertTerritorioNota } from '../lib/data.js';

// Notas generales editables del equipo: 1 nota por UT + 1 nota por cada punto.
// Lectura para todos; edicion solo si canEdit (admin). La persistencia es via RPC.
export default function TerritorioNotas({ utId, posts, canEdit, userName }) {
  const [loading, setLoading] = useState(true);
  const [notaUt, setNotaUt] = useState('');
  const [notasPunto, setNotasPunto] = useState({});
  const [showPuntos, setShowPuntos] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(function () {
    let cancel = false;
    setLoading(true);
    setError(null);
    getTerritorioNotas(utId)
      .then(function (rows) {
        if (cancel) return;
        var punto = {};
        var ut = '';
        (rows || []).forEach(function (r) {
          if (r.tipo === 'ut') { ut = r.texto || ''; }
          else if (r.tipo === 'punto' && r.post_id) { punto[r.post_id] = r.texto || ''; }
        });
        setNotaUt(ut);
        setNotasPunto(punto);
        setLoading(false);
      })
      .catch(function () {
        if (!cancel) { setError('No se pudieron cargar las notas'); setLoading(false); }
      });
    return function () { cancel = true; };
  }, [utId]);

  function startEdit(target) {
    setError(null);
    if (target === 'ut') setDraft(notaUt);
    else setDraft(notasPunto[target] || '');
    setEditing(target);
  }
  function cancelEdit() { setEditing(null); setDraft(''); }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (editing === 'ut') {
        await upsertTerritorioNota({ tipo: 'ut', texto: draft, utId: utId, userName: userName || null });
        setNotaUt(draft);
      } else {
        var pid = editing;
        await upsertTerritorioNota({ tipo: 'punto', texto: draft, postId: pid, postUtId: utId, userName: userName || null });
        setNotasPunto(function (prev) { var n = Object.assign({}, prev); n[pid] = draft; return n; });
      }
      setEditing(null);
      setDraft('');
    } catch (e) {
      setError('No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  }

  var conNota = (posts || []).filter(function (p) { return (notasPunto[p.id] || '').trim(); }).length;
  var total = (posts || []).length;

  if (loading) {
    return (
      <div className="mx-2 mt-2 mb-1 p-2 border border-stone-200 rounded bg-stone-50 text-xs text-stone-400 font-mono">
        Cargando notas...
      </div>
    );
  }

  return (
    <div className="mx-2 mt-2 mb-1 border border-amber-200 rounded bg-amber-50/40">
      <div className="p-2.5 border-b border-amber-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-700 font-semibold">Nota de la UT</span>
          {canEdit && editing !== 'ut' && (
            <button type="button" onClick={function () { startEdit('ut'); }}
              className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded border border-amber-300 text-amber-700 bg-white hover:bg-amber-50">
              Editar
            </button>
          )}
        </div>
        {editing === 'ut' ? (
          <div>
            <textarea value={draft} onChange={function (e) { setDraft(e.target.value); }}
              rows={3} autoFocus
              className="w-full text-sm border border-amber-300 rounded p-2 bg-white focus:outline-none focus:border-amber-500 resize-y"
              placeholder="Escribe una nota general de la UT..." />
            <div className="flex items-center gap-2 mt-1.5">
              <button type="button" disabled={saving} onClick={save}
                className="text-xs font-medium px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" disabled={saving} onClick={cancelEdit}
                className="text-xs font-medium px-3 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className={"text-sm whitespace-pre-wrap " + (notaUt.trim() ? "text-stone-700" : "text-stone-400 italic")}>
            {notaUt.trim() ? notaUt : 'Sin nota'}
          </p>
        )}
      </div>

      <div className="p-2.5">
        <button type="button" onClick={function () { setShowPuntos(function (v) { return !v; }); }}
          className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-stone-600 font-semibold">
          <span>Notas por punto ({conNota}/{total})</span>
          <span className="text-stone-400">{showPuntos ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {showPuntos && (
          <ul className="mt-2 divide-y divide-stone-100">
            {(posts || []).map(function (p) {
              var txt = notasPunto[p.id] || '';
              var isEd = editing === p.id;
              return (
                <li key={p.id} className="py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-rose-600 font-medium">{p.id}</span>
                    {canEdit && !isEd && (
                      <button type="button" onClick={function () { startEdit(p.id); }}
                        className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded border border-stone-300 text-stone-600 bg-white hover:bg-stone-100">
                        Editar
                      </button>
                    )}
                  </div>
                  {isEd ? (
                    <div>
                      <textarea value={draft} onChange={function (e) { setDraft(e.target.value); }}
                        rows={2} autoFocus
                        className="w-full text-sm border border-stone-300 rounded p-2 bg-white focus:outline-none focus:border-rose-400 resize-y"
                        placeholder={"Nota para " + p.id + "..."} />
                      <div className="flex items-center gap-2 mt-1.5">
                        <button type="button" disabled={saving} onClick={save}
                          className="text-xs font-medium px-3 py-1 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                          {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button type="button" disabled={saving} onClick={cancelEdit}
                          className="text-xs font-medium px-3 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-100">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={"text-sm whitespace-pre-wrap " + (txt.trim() ? "text-stone-700" : "text-stone-400 italic")}>
                      {txt.trim() ? txt : 'Sin nota'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="px-2.5 pb-2 text-xs text-red-600">{error}</div>
      )}
    </div>
  );
}