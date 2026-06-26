import { useState, useEffect } from 'react';
import { AlertTriangle, Lock, Loader2 } from 'lucide-react';
import { fetchIncidentCategories } from '../lib/data.js';

/**
 * Formulario unico de incidencia, compartido por:
 *  - el detalle de una etapa (pasa stageId + sourceNote)
 *  - el detalle del poste (sin etapa)
 * La severidad NO se elige: la hereda la categoria (derivada de su color).
 * El bloqueo del poste es manual y opcional (checkbox).
 */
export default function IncidentForm({ post, stageId = null, sourceNote = '', title, onCreateIncident, onDone }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCats, setSelectedCats] = useState([]);
  const [userNote, setUserNote] = useState('');
  const [block, setBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(function () {
    let alive = true;
    setCatalogLoading(true);
    fetchIncidentCategories()
      .then(function (cats) { if (alive) setCatalog(cats || []); })
      .catch(function (err) { console.error('fetch catalog failed', err); })
      .finally(function () { if (alive) setCatalogLoading(false); });
    return function () { alive = false; };
  }, []);

  function toggleCat(id) {
    setSelectedCats(function (prev) {
      return prev.includes(id) ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]);
    });
  }

  async function handleSubmit() {
    if (selectedCats.length === 0) { alert('Selecciona al menos una categoria del catalogo.'); return; }
    if (!userNote.trim()) { alert('La nota explicativa es obligatoria.'); return; }
    setSubmitting(true);
    try {
      if (onCreateIncident) {
        const created = await onCreateIncident({
          postId: post.id,
          categoryIds: selectedCats,
          userNote: userNote.trim(),
          description: userNote.trim(),
          stageId: stageId,
          sourceNote: sourceNote || '',
          forceBlock: block,
        });
        alert('Incidencia(s) registrada(s): ' + ((created && created.count) || 1));
      }
      setSelectedCats([]);
      setUserNote('');
      setBlock(false);
      if (onDone) onDone();
    } catch (e) {
      console.error('create incident failed', e);
      alert('Error al crear la incidencia: ' + ((e && e.message) || e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 p-3 border border-red-500/30 bg-red-500/5 space-y-3 rounded">
      <div className="text-[12px] font-mono uppercase tracking-widest text-red-400">
        {title || 'Nueva incidencia'}
      </div>

      {catalogLoading ? (
        <div className="text-xs text-stone-500 font-mono">Cargando catalogo...</div>
      ) : catalog.length === 0 ? (
        <div className="text-xs text-stone-400 font-mono">Sin catalogo disponible</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {catalog.map(function (cat) {
            const sel = selectedCats.includes(cat.id);
            const col = cat.color || '#6B7280';
            const cls = 'px-2 py-2 text-[13px] font-medium rounded-lg border transition-all text-left flex items-center gap-1.5 ' + (sel ? 'shadow-sm' : 'border-stone-300 text-stone-600 hover:border-stone-400');
            const stl = sel ? { background: col + '1A', borderColor: col + '80', color: col } : {};
            return (
              <button key={cat.id} type="button" onClick={function () { toggleCat(cat.id); }} className={cls} style={stl}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col }} />
                {sel ? '\u2713 ' : ''}{cat.name}
              </button>
            );
          })}
        </div>
      )}

      <div>
        <label className="block text-[11px] text-red-500 font-mono mb-1">Nota explicativa *</label>
        <textarea value={userNote} onChange={function (e) { setUserNote(e.target.value); }}
          rows={2} placeholder="Describe que observas y por que levantas esta incidencia..."
          className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-red-500/50 resize-none rounded" />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-2 border border-amber-400/60 bg-amber-50/40 rounded">
        <input type="checkbox" checked={block} onChange={function (e) { setBlock(e.target.checked); }} className="w-4 h-4 accent-amber-600" />
        <Lock className="w-3 h-3 text-amber-700" strokeWidth={2} />
        <span className="text-[12px] font-mono uppercase tracking-wider text-amber-800">Bloquear este poste</span>
      </label>

      <div className="flex gap-2">
        <button onClick={function () { if (onDone) onDone(); }}
          className="px-3 py-2 border border-stone-300 text-stone-600 hover:border-stone-500 text-xs font-mono uppercase tracking-wider rounded">Cancelar</button>
        <button onClick={handleSubmit} disabled={submitting || selectedCats.length === 0 || !userNote.trim()}
          className="flex-1 px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-500 hover:bg-red-500/30 disabled:opacity-30 text-xs font-mono uppercase tracking-wider rounded flex items-center justify-center gap-1.5">
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />}
          {submitting ? 'Creando...' : 'Reportar incidencia'}
        </button>
      </div>
    </div>
  );
}