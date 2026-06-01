// src/components/AntenaForm.jsx
// PR B: Modal admin-only para registrar recuperacion de antena de internet.
import { useState } from 'react';
import { X, Check, Wifi } from 'lucide-react';
import { setPostAntenaRecuperada } from '../lib/data.js';

export default function AntenaForm({ post, currentUserId, onClose, onSaved }) {
  // El campo viene como snake_case desde Supabase y posiblemente camelCase desde el mapper
  const initial = post?.antenaRecuperada ?? post?.antena_recuperada ?? false;
  const [recuperada, setRecuperada] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  if (!post) return null;

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await setPostAntenaRecuperada(post.id, recuperada, currentUserId);
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Error al guardar');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center gap-2">
          <Wifi className="w-5 h-5 text-blue-500" strokeWidth={2} />
          <h2 className="text-sm font-mono font-bold text-stone-900 flex-1">
            Poste de Internet &mdash; Recuperar antena
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs font-mono text-stone-600 space-y-1 bg-stone-50 border border-stone-200 rounded px-3 py-2">
            <div><span className="text-stone-400">ID:</span> <span className="font-bold text-brand-500">{post.id}</span></div>
            <div><span className="text-stone-400">UT:</span> {post.unidad_territorial}</div>
            {post.direccion && <div className="truncate"><span className="text-stone-400">Dir:</span> {post.direccion}</div>}
          </div>

          <button
            onClick={() => setRecuperada(v => !v)}
            className={`w-full px-3 py-3 border-2 text-sm font-mono text-left flex items-center gap-2 transition-colors rounded ${
              recuperada
                ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                : 'bg-stone-50 border-stone-300 text-stone-700 hover:border-stone-500'
            }`}
          >
            {recuperada
              ? <Check className="w-5 h-5" strokeWidth={2.5} />
              : <div className="w-5 h-5 border-2 border-stone-400 rounded-sm" />}
            <span className="font-bold">Se recuperó la antena</span>
          </button>

          {err && (
            <div className="text-xs text-brand-600 font-mono bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded">
              {err}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-stone-200 flex gap-2 justify-end">
          <button onClick={onClose}
                  className="px-4 py-2 text-sm font-mono text-stone-600 hover:bg-stone-100 rounded">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 text-sm font-mono bg-blue-500 text-white hover:bg-blue-600 rounded disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}