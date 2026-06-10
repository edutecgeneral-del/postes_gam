/**
 * src/components/FieldCaptureView.jsx — Captura en campo por etapa.
 *
 * Flujo inline (NO modal):
 * 1. Seleccionar etapa → 2. Ver postes pendientes → 3. Capturar datos inline
 *
 * Usa StageFormFields para renderizar exactamente los mismos campos que el
 * StageEditor del drawer (GPSField completo, fotos, bullet orientations, etc.)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, ChevronLeft, ChevronRight, Search, Check, AlertCircle, Loader2, Plus } from 'lucide-react';
import { StageFormFields, validateStageAttrs } from './StageFields.jsx';
import { normalizePhotoUrls, uploadStagePhoto, withStagePhotoUrls } from '../lib/data.js';
import { getPersistedForm, persistForm, clearPersistedForm, onBackgroundSave } from '../lib/formPersist.js';

const TOTAL_TARGET = 1215; // Meta total CI1215 — mantener sincronizado con App.jsx

export default function FieldCaptureView({ posts, stageDefs, onUpdatePost, userProfile, canCaptureStage, incidents, onCreateIncident, onRequestCreatePost, initialPostId, initialStageId, onClearTarget, onJumpToMap }) {
  const [selectedStageId, setSelectedStageId] = useState(initialStageId || null);
  const [selectedPostId, setSelectedPostId] = useState(initialPostId || null);
  const [searchText, setSearchText] = useState('');
  const [pendPage, setPendPage] = useState(0);
  const [donePage, setDonePage] = useState(0);
  const LIST_PAGE_SIZE = 10; // 10 elementos por página

  // Auto-open from map "Capturar" button
  useEffect(() => {
    if (initialPostId && initialStageId) {
      setSelectedStageId(initialStageId);
      setSelectedPostId(initialPostId);
      if (onClearTarget) onClearTarget();
    }
  }, [initialPostId, initialStageId]);

  // Reiniciar paginación al cambiar búsqueda o etapa
  useEffect(() => { setPendPage(0); setDonePage(0); }, [searchText, selectedStageId]);

  const selectedStage = stageDefs?.find(s => s.id === selectedStageId);

  const pendingPosts = useMemo(() => {
    if (!selectedStageId) return [];
    return posts.filter(p => !p.stages[selectedStageId]?.done && !p.blocked)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [posts, selectedStageId]);

  const donePosts = useMemo(() => {
    if (!selectedStageId) return [];
    return posts.filter(p => p.stages[selectedStageId]?.done);
  }, [posts, selectedStageId]);

  const filteredPending = useMemo(() => {
    if (!searchText.trim()) return pendingPosts;
    const q = searchText.toLowerCase();
    return pendingPosts.filter(p =>
      p.id.toLowerCase().includes(q) ||
      (p.direccion || '').toLowerCase().includes(q) ||
      (p.unidad_territorial || '').toLowerCase().includes(q)
    );
  }, [pendingPosts, searchText]);

  const filteredDone = useMemo(() => {
    if (!searchText.trim()) return donePosts;
    const q = searchText.toLowerCase();
    return donePosts.filter(p =>
      p.id.toLowerCase().includes(q) ||
      (p.direccion || '').toLowerCase().includes(q) ||
      (p.unidad_territorial || '').toLowerCase().includes(q)
    );
  }, [donePosts, searchText]);

  const selectedPost = posts.find(p => p.id === selectedPostId);
  const hasPermission = !selectedStageId || canCaptureStage(userProfile, selectedStageId);

  // ---- STAGE SELECTOR ----
  if (!selectedStageId) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-4 py-6 sm:px-6">
          <div className="mb-6">
            <div className="text-[12px] font-mono uppercase tracking-[0.25em] text-brand-400/80">Captura en campo</div>
            <h1 className="text-xl font-light text-stone-950 mt-1">Selecciona la etapa a capturar</h1>
            <p className="text-xs text-stone-500 mt-1">{posts.length} postes en el sistema</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stageDefs.filter(s => canCaptureStage(userProfile, s.id)).map(s => {
              const pending = posts.filter(p => !p.stages[s.id]?.done && !p.blocked).length;
              const done = posts.filter(p => p.stages[s.id]?.done).length;
              const canCapture = canCaptureStage(userProfile, s.id);
              const pct = Math.round((done / TOTAL_TARGET) * 100);
              const IconComponent = s.Icon;
              return (
                <button key={s.id} onClick={() => setSelectedStageId(s.id)}
                  className="flex items-start gap-4 p-4 rounded-xl border transition-all text-left border-stone-300 bg-stone-50 hover:border-stone-500 hover:bg-stone-200 active:scale-[0.98]">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}20` }}>
                    <IconComponent className="w-6 h-6" style={{ color: s.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold" style={{ color: s.color }}>E{s.num}</span>
                      <span className="text-sm font-medium text-stone-950">{s.name}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2">{s.desc}</p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[12px] font-mono mb-1">
                        <span className="text-brand-400">{pending} pendientes</span>
                        <span className="text-emerald-400">{done} completados · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- INLINE CAPTURE FORM ----
  if (selectedPost && selectedStage) {
    return (
      <InlineStageCaptureForm
        post={selectedPost}
        stage={selectedStage}
        incidents={incidents}
        userProfile={userProfile}
        onSave={(updatedPost) => {
          onUpdatePost(updatedPost);
          setSelectedPostId(null);
        }}
        onBack={() => setSelectedPostId(null)}
        onCreateIncident={onCreateIncident}
        onJumpToMap={onJumpToMap}
      />
    );
  }

  // ---- POST LIST ----
  const pendTotalPages = Math.max(1, Math.ceil(filteredPending.length / LIST_PAGE_SIZE));
  const pendSafePage = Math.min(pendPage, pendTotalPages - 1);
  const pagedPending = filteredPending.slice(pendSafePage * LIST_PAGE_SIZE, (pendSafePage + 1) * LIST_PAGE_SIZE);

  const doneTotalPages = Math.max(1, Math.ceil(filteredDone.length / LIST_PAGE_SIZE));
  const doneSafePage = Math.min(donePage, doneTotalPages - 1);
  const pagedDone = filteredDone.slice(doneSafePage * LIST_PAGE_SIZE, (doneSafePage + 1) * LIST_PAGE_SIZE);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3">
        <button onClick={() => { setSelectedStageId(null); setSearchText(''); }} className="p-2 text-stone-600 hover:text-stone-950 -ml-2">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${selectedStage.color}20` }}>
            <selectedStage.Icon className="w-4 h-4" style={{ color: selectedStage.color }} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono font-bold" style={{ color: selectedStage.color }}>E{selectedStage.num} · {selectedStage.name}</div>
            <div className="text-[12px] text-stone-500">{pendingPosts.length} pendientes · {donePosts.length} completados</div>
          </div>
        </div>
        {onRequestCreatePost && (
          <button onClick={() => onRequestCreatePost(selectedStageId)}
                  className="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-stone-950 text-xs font-medium rounded-lg px-3 py-2 transition-colors">
            <Plus className="w-4 h-4" /> Nuevo poste
          </button>
        )}
      </div>

      {!hasPermission && (
        <div className="mx-4 mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>No tienes permiso para capturar esta etapa.</span>
        </div>
      )}

      <div className="mx-4 mt-3 p-3 rounded-lg border" style={{ borderColor: `${selectedStage.color}30`, background: `${selectedStage.color}08` }}>
        <div className="text-xs text-stone-600">{selectedStage.desc}</div>
        {selectedStage.photoReq && <div className="text-[12px] text-stone-500 mt-1">📷 {selectedStage.photoReq}</div>}
        <div className="text-[12px] text-stone-500 mt-1">Campos: {selectedStage.attributes.map(a => a.label).join(' · ')}</div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                 placeholder="Buscar por ID, dirección o UT…"
                 className="w-full bg-stone-100 border border-stone-300 rounded-lg pl-10 pr-3 py-2.5 text-sm text-stone-950 placeholder-stone-500 focus:outline-none focus:border-brand-600" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Postes pendientes */}
        {filteredPending.length === 0 && filteredDone.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-500">
            <Check className="w-10 h-10 text-emerald-500 mb-3" />
            <p className="text-sm font-medium text-stone-700">{searchText ? 'Sin resultados' : '¡Todos los postes tienen esta etapa!'}</p>
          </div>
        ) : (
          <>
            {filteredPending.length > 0 && (
              <div className="px-4 py-3">
                <div className="border border-stone-300 rounded-lg overflow-hidden bg-stone-100">
                <div className="px-4 py-2 text-[12px] font-mono uppercase tracking-widest text-brand-400 bg-stone-200 border-b border-stone-300">
                  Pendientes · {filteredPending.length}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: '520px' }}>
                    <thead className="bg-stone-100/60 border-b border-stone-300 text-[12px] font-mono uppercase tracking-[0.15em] text-stone-500">
                      <tr>
                        <th className="text-left px-3 py-2 sticky left-0 bg-stone-50/95 z-10 min-w-[90px]">ID</th>
                        <th className="text-left px-3 py-2 min-w-[60px]">UT</th>
                        <th className="text-left px-3 py-2 min-w-[140px]">Dirección</th>
                        <th className="text-center px-3 py-2">Etapas</th>
                        <th className="text-right px-3 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPending.map(p => {
                        const stagesDone = Object.values(p.stages || {}).filter(s => s.done).length;
                        return (
                          <tr key={p.id} onClick={() => hasPermission && setSelectedPostId(p.id)}
                              className={`border-b border-stone-300/50 transition-colors ${hasPermission ? 'hover:bg-rose-500/5 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                            <td className="px-3 py-2 font-mono font-bold text-stone-950 whitespace-nowrap sticky left-0 bg-stone-50/95 z-10">
                              <span className="inline-flex items-center gap-1.5">
                                {onJumpToMap && (
                                  <button type="button" title="Ver en mapa"
                                          onClick={(e) => { e.stopPropagation(); onJumpToMap(p); }}
                                          className="text-stone-500 hover:text-purple-600 p-0.5 -ml-0.5 transition-colors">
                                    <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  </button>
                                )}
                                <span>{p.id}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-stone-700 whitespace-nowrap">{p.unidad_territorial}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-stone-600">{p.direccion || 'Sin dirección'}</td>
                            <td className="px-3 py-2 text-center font-mono text-stone-500 whitespace-nowrap">{stagesDone}/7</td>
                            <td className="px-3 py-2 text-right">
                              <span className="inline-block text-xs font-mono px-2 py-1 rounded whitespace-nowrap" style={{ background: `${selectedStage.color}15`, color: selectedStage.color }}>
                                Capturar
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePager page={pendSafePage} totalPages={pendTotalPages} total={filteredPending.length}
                            unitLabel="pendientes" onPage={setPendPage} />
                </div>
              </div>
            )}

            {/* Postes completados — editables */}
            {filteredDone.length > 0 && (
              <div className="px-4 py-3">
                <div className="border border-stone-300 rounded-lg overflow-hidden bg-stone-100">
                <div className="px-4 py-2 text-[12px] font-mono uppercase tracking-widest text-emerald-400 bg-stone-200 border-b border-stone-300">
                  Completados · {filteredDone.length} — toca para editar / agregar foto
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: '620px' }}>
                    <thead className="bg-stone-100/60 border-b border-stone-300 text-[12px] font-mono uppercase tracking-[0.15em] text-stone-500">
                      <tr>
                        <th className="text-left px-3 py-2 sticky left-0 bg-stone-50/95 z-10 min-w-[90px]">ID</th>
                        <th className="text-left px-3 py-2 min-w-[60px]">UT</th>
                        <th className="text-left px-3 py-2 min-w-[140px]">Dirección</th>
                        <th className="text-center px-3 py-2">Etapas</th>
                        <th className="text-left px-3 py-2">Estado</th>
                        <th className="text-right px-3 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDone.map(p => {
                        const d = p.stages[selectedStageId];
                        const hasPhoto = typeof d?.photo === 'string' && d.photo.startsWith('http');
                        const stagesDone = Object.values(p.stages || {}).filter(s => s.done).length;
                        return (
                          <tr key={p.id} onClick={() => hasPermission && setSelectedPostId(p.id)}
                              className={`border-b border-stone-300/50 transition-colors ${hasPermission ? 'hover:bg-rose-500/5 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                            <td className="px-3 py-2 font-mono font-bold text-stone-950 whitespace-nowrap sticky left-0 bg-stone-50/95 z-10">
                              <span className="inline-flex items-center gap-1.5">
                                {onJumpToMap && (
                                  <button type="button" title="Ver en mapa"
                                          onClick={(e) => { e.stopPropagation(); onJumpToMap(p); }}
                                          className="text-stone-500 hover:text-purple-600 p-0.5 -ml-0.5 transition-colors">
                                    <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  </button>
                                )}
                                <span>{p.id}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-stone-700 whitespace-nowrap">{p.unidad_territorial}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-stone-600">{p.direccion || 'Sin dirección'}</td>
                            <td className="px-3 py-2 text-center font-mono text-stone-500 whitespace-nowrap">
                              {stagesDone}/7
                              {d?.ts && <div className="text-[11px] text-stone-400">{new Date(d.ts).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })}</div>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {hasPhoto ? <span className="text-emerald-500">📷 foto</span> : <span className="text-brand-500">⚠ sin foto</span>}
                              {d?.verified && <span className="text-blue-500 ml-2">✔ verif.</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="inline-block text-xs font-mono px-2 py-1 rounded bg-stone-100 text-stone-600 border border-stone-300 whitespace-nowrap">Editar</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePager page={doneSafePage} totalPages={doneTotalPages} total={filteredDone.length}
                            unitLabel="completados" onPage={setDonePage} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TablePager — paginador estilo "Usuarios": contador + ‹ Anterior / Siguiente ›
// =============================================================================

function TablePager({ page, totalPages, total, unitLabel = 'registros', onPage }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5">
      <div className="text-xs font-mono text-stone-500">
        {total.toLocaleString()} {unitLabel} · Página {page + 1} de {totalPages}
      </div>
      <div className="flex gap-1">
        <button type="button" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}
                className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
        </button>
        <button type="button" disabled={page >= totalPages - 1} onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
                className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
          Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// InlineStageCaptureForm — captura inline (NO modal) con todos los campos
// =============================================================================

function InlineStageCaptureForm({ post, stage, onSave, onBack, incidents, onCreateIncident, userProfile, onJumpToMap }) {
  const existing = post.stages[stage.id] || {};
  const formKey = `capture_${post.id}_${stage.id}`;
  const saved = useMemo(() => getPersistedForm(formKey), [formKey]);
  const [restoredFromSave] = useState(() => !!saved);

  const [attrs, setAttrs] = useState(() => {
    if (saved?.attrs) return saved.attrs;
    if (existing.attrs && Object.keys(existing.attrs).length > 0) return { ...existing.attrs };
    const initial = {};
    (stage.attributes || []).forEach(a => { if (a.default !== undefined) initial[a.key] = a.default; });
    return initial;
  });
  const [notes, setNotes] = useState(saved?.notes ?? existing.notes ?? '');
  const [photoAdded, setPhotoAdded] = useState(saved?.photoAdded ?? (typeof existing.photo === 'string' && existing.photo.startsWith('http')));
  const [photoFiles, setPhotoFiles] = useState([]);
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-save form state
  useEffect(() => {
    const state = { attrs, notes, photoAdded };
    persistForm(formKey, state);
    return onBackgroundSave(formKey, () => state);
  }, [formKey, attrs, notes, photoAdded]);

  // Fotos existentes (URLs del bucket)
  const existingPhotos = normalizePhotoUrls([...(Array.isArray(existing.photos) ? existing.photos : []), existing.photo]);

  const stageIncidents = (incidents || []).filter(i => i.postId === post.id && i.stageId === stage.id);
  const setAttr = (key, val) => setAttrs(prev => ({ ...prev, [key]: val }));
  const canSave = validateStageAttrs(stage, attrs, photoAdded || existingPhotos.length > 0);

  const handlePhotoFile = (files) => {
    setPhotoFiles(Array.isArray(files) ? files : []);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upload photos first. If any upload fails, do not save the stage as complete.
      const uploadedUrls = [...existingPhotos];
      for (const file of photoFiles) {
        const url = await uploadStagePhoto(post.id, stage.id, file);
        uploadedUrls.push(url);
      }

      const isRAALUser = userProfile?.role === 'raal';

      // Use atomic RPC — only writes THIS stage, not all 7
      const { updateStageAtomic } = await import('../lib/data.js');
      const result = await updateStageAtomic(post.id, stage.id, {
        done: true,
        notes,
        attrs: withStagePhotoUrls(attrs, uploadedUrls),
        photoUrl: uploadedUrls[0] || null,
        needsScoutConfirm: isRAALUser ? true : undefined,
        expectedVersion: existing.version || null,
      });

      // Update local state via callback
      const updatedStage = {
        ...existing,
        done: true,
        ts: Date.now(),
        photo: uploadedUrls[0] || null,
        photos: uploadedUrls,
        notes,
        attrs: withStagePhotoUrls(attrs, uploadedUrls),
        needsScoutConfirm: isRAALUser ? true : (existing.needsScoutConfirm || false),
        version: result.version,
      };
      const updated = {
        ...post,
        stages: { ...post.stages, [stage.id]: updatedStage },
        lastUpdate: Date.now(),
      };
      await onSave(updated, true); // true = already persisted, skip dbSavePost
      clearPersistedForm(formKey);
    } catch (e) {
      if (e.message?.includes('CONFLICT')) {
        alert('⚠ Otro usuario modificó esta etapa.\nRecarga la página para ver los cambios actualizados.');
      } else {
        alert('Error al guardar: ' + (e?.message || e));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!window.confirm(`¿Deshacer E${stage.num} ${stage.name} en ${post.id}?\n\nLa etapa se marcará como pendiente. Los datos se conservan.`)) return;
    setSaving(true);
    try {
      const { updateStageAtomic } = await import('../lib/data.js');
      const result = await updateStageAtomic(post.id, stage.id, {
        done: false,
        expectedVersion: existing.version || null,
      });
      const updated = {
        ...post,
        stages: {
          ...post.stages,
          [stage.id]: { ...existing, done: false, ts: null, verified: false, verifiedBy: null, verifiedAt: null, version: result.version },
        },
        lastUpdate: Date.now(),
      };
      await onSave(updated, true);
    } catch (e) {
      if (e.message?.includes('CONFLICT')) {
        alert('⚠ Otro usuario modificó esta etapa. Recarga la página.');
      } else {
        alert('Error: ' + (e?.message || e));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-300 flex items-center gap-3 sticky top-0 bg-amber-50 z-10">
        <button onClick={() => { clearPersistedForm(formKey); onBack(); }} className="p-2 text-stone-600 hover:text-stone-950 -ml-2">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-mono font-bold text-stone-950">{post.id} — {post.direccion || 'Sin dirección'}</div>
          <div className="text-[12px] text-stone-500">{post.unidad_territorial} · {Object.values(post.stages).filter(s => s.done).length}/7 etapas</div>
        </div>
        {onJumpToMap && (
          <button
            type="button"
            onClick={() => onJumpToMap(post)}
            title="Ver este poste en el mapa de la app"
            className="p-2 text-stone-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors flex-shrink-0"
          >
            <MapPin className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
        <div className="px-2 py-1 rounded text-[12px] font-mono font-bold" style={{ background: `${stage.color}20`, color: stage.color }}>
          E{stage.num} · {stage.short}
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {restoredFromSave && (
          <div className="p-2.5 mb-4 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Datos recuperados de sesión anterior. Las fotos deben re-capturarse.
          </div>
        )}
        {/* Stage info */}
        <div className="p-3 mb-4 rounded-lg border" style={{ borderColor: `${stage.color}40`, background: `${stage.color}08` }}>
          <div className="text-sm font-medium" style={{ color: stage.color }}>{stage.name}</div>
          <p className="text-xs text-stone-600 mt-1">{stage.desc}</p>
        </div>

        {/* Campos de la etapa (foto + atributos + notas) */}
        <StageFormFields
          stage={stage}
          attrs={attrs}
          setAttr={setAttr}
          notes={notes}
          setNotes={setNotes}
          photoAdded={photoAdded}
          setPhotoAdded={setPhotoAdded}
          showPwd={showPwd}
          setShowPwd={setShowPwd}
          onPhotoFiles={handlePhotoFile}
          existingPhotos={existingPhotos}
          onCreateIncident={onCreateIncident}
          postId={post.id}
          attrsUpdated={existing.attrsUpdated}
        />

        {stageIncidents.length > 0 && (
          <div className="mt-3 text-[12px] font-mono uppercase tracking-wider px-2 py-1 bg-red-500/15 text-red-400 border border-red-500/30 inline-block">
            {stageIncidents.length} incidencia{stageIncidents.length > 1 ? 's' : ''} en esta etapa
          </div>
        )}
      </div>

      {/* Action bar — sticky bottom */}
      <div className="px-4 py-3 border-t border-stone-300 bg-amber-50 sticky bottom-0 flex gap-2">
        {existing.done && (
          <button onClick={handleUndo} disabled={saving}
                  className="px-4 py-3 border border-stone-300 text-stone-600 hover:border-red-500/50 hover:text-red-500 text-xs font-mono uppercase tracking-widest transition-colors">
            Deshacer
          </button>
        )}
        <button onClick={handleSave} disabled={!canSave || saving}
                className="flex-1 py-3 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-30"
                style={{ background: canSave ? stage.color : '#27272A', color: canSave ? '#fff' : '#52525B' }}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Check className="w-4 h-4" /> Marcar E{stage.num} completada</>}
        </button>
      </div>
    </div>
  );
}
