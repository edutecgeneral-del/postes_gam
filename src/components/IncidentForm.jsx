import { useState, useEffect } from 'react';
import { AlertTriangle, Lock, Loader2, Camera, X, Image as ImageIcon } from 'lucide-react';
import { fetchIncidentCategories } from '../lib/data.js';

/**
 * Formulario unico de incidencia, compartido por:
 *  - el detalle de una etapa (pasa stageId + sourceNote)
 *  - el detalle del poste (sin etapa)
 * La severidad NO se elige: la hereda la categoria (derivada de su color).
 * El bloqueo del poste es manual y opcional (checkbox).
 * Cada categoria seleccionada puede llevar SUS PROPIAS fotos (una incidencia por categoria).
 */
export default function IncidentForm({ post, stageId = null, sourceNote = '', title, onCreateIncident, onDone }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedCats, setSelectedCats] = useState([]);
  const [userNote, setUserNote] = useState('');
  const [block, setBlock] = useState(false);
  const [photosByCat, setPhotosByCat] = useState({}); // { [catId]: [{ file, url }] }
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

  // Revocar todas las object URLs al desmontar
  useEffect(function () {
    return function () {
      setPhotosByCat(function (prev) {
        Object.keys(prev).forEach(function (k) {
          (prev[k] || []).forEach(function (p) { try { URL.revokeObjectURL(p.url); } catch (e) {} });
        });
        return prev;
      });
    };
  }, []);

  function toggleCat(id) {
    setSelectedCats(function (prev) {
      return prev.includes(id) ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]);
    });
    // Si se deselecciona, limpiar sus fotos
    setPhotosByCat(function (prev) {
      if (!prev[id]) return prev;
      // ojo: usamos el estado de selectedCats previo via closure no es fiable aqui;
      // simplemente: si la categoria ya tenia fotos y se esta quitando, las soltamos.
      // Detectamos quitar comparando con la presencia actual se hace en el otro setState;
      // para mantener simple, no borramos aqui salvo que el toggle sea de quitar.
      return prev;
    });
  }

  // Limpia fotos de categorias que ya NO estan seleccionadas
  useEffect(function () {
    setPhotosByCat(function (prev) {
      let changed = false;
      const next = {};
      Object.keys(prev).forEach(function (k) {
        if (selectedCats.includes(k)) {
          next[k] = prev[k];
        } else {
          changed = true;
          (prev[k] || []).forEach(function (p) { try { URL.revokeObjectURL(p.url); } catch (e) {} });
        }
      });
      return changed ? next : prev;
    });
  }, [selectedCats]);

  function addPhotos(catId, fileList) {
    const fs = Array.from(fileList || []);
    if (fs.length === 0) return;
    const nuevos = fs.map(function (f) { return { file: f, url: URL.createObjectURL(f) }; });
    setPhotosByCat(function (prev) {
      const cur = prev[catId] || [];
      const copy = Object.assign({}, prev);
      copy[catId] = cur.concat(nuevos);
      return copy;
    });
  }

  function removePhoto(catId, idx) {
    setPhotosByCat(function (prev) {
      const cur = prev[catId] || [];
      const p = cur[idx];
      if (p) { try { URL.revokeObjectURL(p.url); } catch (e) {} }
      const copy = Object.assign({}, prev);
      copy[catId] = cur.filter(function (_, i) { return i !== idx; });
      return copy;
    });
  }

  function clearAllPhotos() {
    setPhotosByCat(function (prev) {
      Object.keys(prev).forEach(function (k) {
        (prev[k] || []).forEach(function (p) { try { URL.revokeObjectURL(p.url); } catch (e) {} });
      });
      return {};
    });
  }

  function catById(id) {
    for (let i = 0; i < catalog.length; i++) { if (catalog[i].id === id) return catalog[i]; }
    return null;
  }

  async function handleSubmit() {
    if (selectedCats.length === 0) { alert('Selecciona al menos una categoria del catalogo.'); return; }
    if (!userNote.trim()) { alert('La nota explicativa es obligatoria.'); return; }
    setSubmitting(true);
    try {
      if (onCreateIncident) {
        // Mapa catId -> [File] para que el handler suba las fotos a cada incidencia
        const filesByCat = {};
        selectedCats.forEach(function (cid) {
          filesByCat[cid] = (photosByCat[cid] || []).map(function (p) { return p.file; });
        });
        const created = await onCreateIncident({
          postId: post.id,
          categoryIds: selectedCats,
          userNote: userNote.trim(),
          description: userNote.trim(),
          stageId: stageId,
          sourceNote: sourceNote || '',
          forceBlock: block,
          photosByCat: filesByCat,
        });
        alert('Incidencia(s) registrada(s): ' + ((created && created.count) || 1));
      }
      setSelectedCats([]);
      setUserNote('');
      setBlock(false);
      clearAllPhotos();
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

      {selectedCats.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] text-stone-500 font-mono uppercase tracking-wider">Fotos por incidencia (opcional)</div>
          {selectedCats.map(function (cid) {
            const cat = catById(cid);
            if (!cat) return null;
            const col = cat.color || '#6B7280';
            const fotos = photosByCat[cid] || [];
            return (
              <div key={cid} className="p-2 border border-stone-200 rounded bg-stone-50/50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col }} />
                  <span className="text-[12px] font-medium text-stone-700">{cat.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-stone-400 rounded cursor-pointer hover:bg-stone-100 transition-colors">
                    <ImageIcon className="w-4 h-4 text-stone-500" />
                    <span className="text-xs text-stone-600">Galeria</span>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={function (e) { addPhotos(cid, e.target.files); e.target.value = ''; }} />
                  </label>
                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-stone-400 rounded cursor-pointer hover:bg-stone-100 transition-colors">
                    <Camera className="w-4 h-4 text-stone-500" />
                    <span className="text-xs text-stone-600">Camara</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={function (e) { addPhotos(cid, e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
                {fotos.length > 0 && (
                  <div className="text-[11px] text-stone-500 mt-1">{fotos.length + ' foto(s) agregada(s)'}</div>
                )}
                {fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {fotos.map(function (p, idx) {
                      return (
                        <div key={idx} className="relative">
                          <img src={p.url} alt={'foto ' + (idx + 1)} className="w-14 h-14 object-cover rounded border border-stone-300" />
                          <button type="button" onClick={function () { removePhoto(cid, idx); }}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700">
                            <X className="w-3 h-3" strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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