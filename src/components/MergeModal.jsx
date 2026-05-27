import { useState } from 'react';

function fmtDate(ts) {
  if (!ts) return 's/f';
  try {
    return new Date(ts).toLocaleString('es-MX', {
      year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return 's/f'; }
}

function stagePhotos(stage) {
  if (!stage) return [];
  if (Array.isArray(stage.photos) && stage.photos.length) return stage.photos.filter(Boolean);
  if (stage.photo) return [stage.photo];
  return [];
}

function stageValores(stage) {
  const attrs = (stage && stage.attrs) || {};
  const out = [];
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === '') continue;
    const kl = k.toLowerCase();
    if (kl.indexOf('photo') >= 0 || kl.indexOf('foto') >= 0 || kl.indexOf('url') >= 0) continue;
    if (typeof v === 'object') continue;
    const vs = String(v);
    if (vs.indexOf('http') === 0) continue;
    out.push([k, vs]);
  }
  return out;
}

function capturadoPor(stage, userNames) {
  const uid = stage && stage.capturedBy;
  if (!uid) return 'desconocido';
  return userNames[uid] || (uid.length > 8 ? uid.slice(0, 8) + '...' : uid);
}

function StageSide({ post, stage, userNames, selected }) {
  const photos = stagePhotos(stage);
  const valores = stageValores(stage);
  return (
    <div className={'rounded border p-2 text-[12px] ' + (selected ? 'border-rose-500 ring-1 ring-rose-300 bg-rose-50' : 'border-stone-200 bg-stone-50')}>
      <div className="font-mono text-[11px] text-stone-400 mb-1">{post.id}</div>
      {photos.length > 0 ? (
        <div className="flex gap-1 mb-1 flex-wrap items-end">
          {photos.slice(0, 3).map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt="" className="w-14 h-14 object-cover rounded border border-stone-300" />
            </a>
          ))}
          {photos.length > 3 && <span className="text-[10px] text-stone-400">+{photos.length - 3}</span>}
        </div>
      ) : (
        <div className="text-[11px] text-stone-400 mb-1">Sin foto</div>
      )}
      <div className="text-stone-600">Capturo: <span className="text-stone-800">{capturadoPor(stage, userNames)}</span></div>
      <div className="text-stone-600">Fecha: <span className="font-mono text-stone-800">{fmtDate(stage && stage.ts)}</span></div>
      {valores.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {valores.map(([k, v]) => (
            <div key={k} className="text-[11px] text-stone-600"><span className="text-stone-400">{k}:</span> {v}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentsBox({ post, incidents }) {
  const list = (incidents || []).filter(i => i.postId === post.id);
  if (list.length === 0) {
    return <div className="text-[11px] text-stone-400">{post.id}: sin incidencias</div>;
  }
  return (
    <div className="text-[11px]">
      <div className="font-mono text-stone-500 mb-0.5">{post.id}: {list.length} incidencia(s)</div>
      <ul className="space-y-0.5">
        {list.slice(0, 6).map(i => (
          <li key={i.id} className="text-stone-600">
            <span className={'font-bold ' + (i.severity === 'alta' ? 'text-red-600' : i.severity === 'media' ? 'text-amber-600' : 'text-stone-500')}>{i.type}</span>
            <span className="text-stone-400"> ({i.severity || 's/sev'}) - {i.status || 's/estado'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MergeModal({ postA, postB, stageDefs, onConfirm, onCancel, incidents = [], userNames = {} }) {
  const [principalId, setPrincipalId] = useState(postA.id);
  const [stageSource, setStageSource] = useState({});
  const [addressSource, setAddressSource] = useState('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const conflicts = stageDefs.filter(s => postA.stages[s.id]?.done && postB.stages[s.id]?.done);
  const onlyA = stageDefs.filter(s => postA.stages[s.id]?.done && !postB.stages[s.id]?.done);
  const onlyB = stageDefs.filter(s => !postA.stages[s.id]?.done && postB.stages[s.id]?.done);

  const srcFor = (stageId) => stageSource[stageId] || (principalId === postA.id ? 'A' : 'B');

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const principalPost = principalId === postA.id ? postA : postB;
      const secundarioPost = principalId === postA.id ? postB : postA;
      const stageChoices = {};
      for (const s of conflicts) {
        const chosenPost = srcFor(s.id) === 'A' ? postA : postB;
        if (chosenPost.id === secundarioPost.id) stageChoices[s.id] = 'secundario';
      }
      const addrPost = addressSource === 'A' ? postA : postB;
      const keepAddress = addrPost.id === principalPost.id ? 'principal' : 'secundario';
      await onConfirm(principalPost.id, secundarioPost.id, stageChoices, keepAddress);
    } catch (e) {
      setError(e?.message || 'Error al fusionar');
      setBusy(false);
    }
  };

  const Toggle = ({ value, onChange, labelA, labelB }) => (
    <div className="flex border border-stone-300 rounded overflow-hidden text-[11px] font-mono">
      <button onClick={() => onChange('A')}
        className={'px-2 py-1 ' + (value === 'A' ? 'bg-rose-600 text-white' : 'bg-stone-50 text-stone-600')}>
        {labelA}
      </button>
      <button onClick={() => onChange('B')}
        className={'px-2 py-1 ' + (value === 'B' ? 'bg-rose-600 text-white' : 'bg-stone-50 text-stone-600')}>
        {labelB}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-50 rounded-xl border border-stone-300 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-stone-300 flex items-center justify-between">
          <h2 className="text-lg font-light text-stone-950">Fusionar postes</h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700 text-xl">x</button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[12px] font-mono uppercase tracking-wider text-stone-500 mb-2">Cual ID sobrevive</div>
            <Toggle value={principalId === postA.id ? 'A' : 'B'}
              onChange={(v) => setPrincipalId(v === 'A' ? postA.id : postB.id)}
              labelA={postA.id + ' (#' + (postA.numPoste ?? '?') + ')'}
              labelB={postB.id + ' (#' + (postB.numPoste ?? '?') + ')'} />
            <p className="text-[11px] text-stone-500 mt-1">El otro poste quedara archivado (no se borra).</p>
          </div>

          <div>
            <div className="text-[12px] font-mono uppercase tracking-wider text-stone-500 mb-2">Incidencias</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border border-stone-200 rounded bg-stone-100/50"><IncidentsBox post={postA} incidents={incidents} /></div>
              <div className="p-2 border border-stone-200 rounded bg-stone-100/50"><IncidentsBox post={postB} incidents={incidents} /></div>
            </div>
          </div>

          <div>
            <div className="text-[12px] font-mono uppercase tracking-wider text-stone-500 mb-2">Direccion a conservar</div>
            <div className="grid grid-cols-2 gap-2 text-[12px] mb-2">
              <div className="p-2 border border-stone-200 rounded bg-stone-100/50">
                <div className="font-mono text-stone-400">{postA.id}</div>
                <div className="text-stone-700">{postA.direccion || '-'}</div>
              </div>
              <div className="p-2 border border-stone-200 rounded bg-stone-100/50">
                <div className="font-mono text-stone-400">{postB.id}</div>
                <div className="text-stone-700">{postB.direccion || '-'}</div>
              </div>
            </div>
            <Toggle value={addressSource} onChange={setAddressSource}
              labelA={'Usar ' + postA.id} labelB={'Usar ' + postB.id} />
          </div>

          {conflicts.length > 0 && (
            <div>
              <div className="text-[12px] font-mono uppercase tracking-wider text-stone-500 mb-2">
                Conflictos de etapas (ambos tienen datos)
              </div>
              <div className="space-y-3">
                {conflicts.map(s => {
                  const sel = srcFor(s.id);
                  return (
                    <div key={s.id} className="p-2 border border-stone-200 rounded">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold" style={{ color: s.color }}>E{s.num}</span>
                          <span className="text-[13px] text-stone-700">{s.name}</span>
                        </div>
                        <Toggle value={sel}
                          onChange={(v) => setStageSource(prev => ({ ...prev, [s.id]: v }))}
                          labelA={postA.id} labelB={postB.id} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <StageSide post={postA} stage={postA.stages[s.id]} userNames={userNames} selected={sel === 'A'} />
                        <StageSide post={postB} stage={postB.stages[s.id]} userNames={userNames} selected={sel === 'B'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(onlyA.length > 0 || onlyB.length > 0) && (
            <div>
              <div className="text-[12px] font-mono uppercase tracking-wider text-stone-400 mb-2">Se conservan automaticamente</div>
              <div className="space-y-2">
                {onlyA.map(s => (
                  <div key={s.id} className="p-2 border border-stone-200 rounded">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono font-bold" style={{ color: s.color }}>E{s.num}</span>
                      <span className="text-[13px] text-stone-700">{s.name}</span>
                      <span className="text-[11px] text-stone-400">({postA.id})</span>
                    </div>
                    <StageSide post={postA} stage={postA.stages[s.id]} userNames={userNames} selected={false} />
                  </div>
                ))}
                {onlyB.map(s => (
                  <div key={s.id} className="p-2 border border-stone-200 rounded">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono font-bold" style={{ color: s.color }}>E{s.num}</span>
                      <span className="text-[13px] text-stone-700">{s.name}</span>
                      <span className="text-[11px] text-stone-400">({postB.id})</span>
                    </div>
                    <StageSide post={postB} stage={postB.stages[s.id]} userNames={userNames} selected={false} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-stone-300 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded">Cancelar</button>
          <button onClick={handleConfirm} disabled={busy}
            className="px-4 py-2 text-sm bg-rose-700 hover:bg-rose-800 text-white rounded font-medium">
            {busy ? 'Fusionando...' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
