/**
 * src/components/CreatePostForm.jsx — Crear poste + capturar etapa.
 *
 * Flujo:
 * 1. Seleccionar etapa a registrar
 * 2. Capturar datos de la etapa (GPS, foto, campos)
 *    → la dirección se auto-genera desde GPS o se escribe manual
 * 3. UT: texto libre, opcional
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { StageFormFields, validateStageAttrs } from './StageFields.jsx';
import { getPersistedForm, persistForm, clearPersistedForm, onBackgroundSave } from '../lib/formPersist.js';
import { withStagePhotoUrls } from '../lib/data.js';
// Dynamic imports in handleSave for atomic operations

export default function CreatePostForm({ unidadesTerritoriales, stageDefs, defaultStageId, initialPosition, onCreated, onClose }) {
  const formKey = 'createpost';
  // Si venimos del flujo "+ Nuevo aquí" del mapa, ignoramos cualquier draft previo.
  // El usuario está creando un poste FRESCO con coords del mapa, no continuando uno viejo.
  const cameFromMap = !!(initialPosition?.lat && initialPosition?.lng);
  const saved = useMemo(() => cameFromMap ? null : getPersistedForm(formKey), [cameFromMap]);
  const [restoredFromSave] = useState(() => !!saved);

  // Si entramos desde mapa, limpiar el draft persistido para no contaminar futuros opens
  useEffect(() => {
    if (cameFromMap) {
      try { clearPersistedForm(formKey); } catch {}
    }
  }, [cameFromMap]);

  // Etapa seleccionada
  const [selectedStageId, setSelectedStageId] = useState(saved?.selectedStageId ?? defaultStageId ?? null);
  const selectedStage = stageDefs?.find(s => s.id === selectedStageId);

  // Campos de la etapa
  const [stageAttrs, setStageAttrs] = useState(() => {
    // Base: draft persistido (solo cuando NO venimos del mapa), o defaults del stage
    const initial = saved?.stageAttrs ? { ...saved.stageAttrs } : {};
    if (!saved?.stageAttrs && defaultStageId) {
      const stage = stageDefs?.find(s => s.id === defaultStageId);
      stage?.attributes.forEach(a => { if (a.default !== undefined) initial[a.key] = a.default; });
    }
    // Seed con coords del mapa: si vienen, sobreescribe ubicacion_real con shape completo
    if (initialPosition?.lat && initialPosition?.lng) {
      initial.ubicacion_real = {
        lat: initialPosition.lat,
        lng: initialPosition.lng,
        source: 'manual', // marcado manual porque vino del click en mapa
      };
    }
    return initial;
  });
  const [stageNotes, setStageNotes] = useState(saved?.stageNotes ?? '');
  const [photoAdded, setPhotoAdded] = useState(saved?.photoAdded ?? false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [showPwd, setShowPwd] = useState(false);

  // Datos del poste (después de la etapa)
  const [direccion, setDireccion] = useState(saved?.direccion ?? '');
  const [alias, setAlias] = useState(saved?.alias ?? '');
  const [numPoste, setNumPoste] = useState(saved?.numPoste ?? '');
  const [shiftNumbers, setShiftNumbers] = useState(saved?.shiftNumbers ?? false);
  const [ut, setUt] = useState(saved?.ut ?? 'SIN-CAT');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Auto-save form state
  useEffect(() => {
    const state = { selectedStageId, stageAttrs, stageNotes, photoAdded, direccion, alias, numPoste, shiftNumbers, ut };
    persistForm(formKey, state);
    return onBackgroundSave(formKey, () => state);
  }, [selectedStageId, stageAttrs, stageNotes, photoAdded, direccion, alias, numPoste, shiftNumbers, ut]);

  const setAttr = (key, val) => setStageAttrs(prev => ({ ...prev, [key]: val }));

  const handlePhotoFile = (files) => {
    setPhotoFiles(Array.isArray(files) ? files : []);
  };

  // Cambiar etapa → reset (pero preserva ubicacion_real si vino del mapa)
  const handleStageChange = (stageId) => {
    setSelectedStageId(stageId || null);
    setStageNotes('');
    setPhotoAdded(false);
    setPhotoFiles([]);
    setShowPwd(false);
    const fresh = {};
    if (stageId) {
      const stage = stageDefs.find(s => s.id === stageId);
      stage?.attributes.forEach(a => { if (a.default !== undefined) fresh[a.key] = a.default; });
    }
    // Si venimos del mapa, las coords son del poste, no de una etapa específica.
    // Las preservamos al cambiar de etapa.
    if (initialPosition?.lat && initialPosition?.lng) {
      fresh.ubicacion_real = {
        lat: initialPosition.lat,
        lng: initialPosition.lng,
        source: 'manual',
      };
    }
    setStageAttrs(fresh);
  };

  // Auto-fill dirección desde GPS
  const gps = stageAttrs.ubicacion_real;
  const hasGPS = gps?.lat && gps?.lng;

  useEffect(() => {
    if (hasGPS && !direccion) {
      setDireccion(`Lat ${Number(gps.lat).toFixed(5)}, Lng ${Number(gps.lng).toFixed(5)}`);
    }
  }, [hasGPS, gps?.lat, gps?.lng]);

  // Validación
  const canSave = !!selectedStage; // Solo necesita seleccionar etapa

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { createPostAtomic, uploadStagePhoto: uploadPhoto } = await import('../lib/data.js');
      const lat = gps?.lat ? Number(gps.lat) : 0;
      const lng = gps?.lng ? Number(gps.lng) : 0;

      // Validar coordenadas — no permitir 0,0
      if (!lat || !lng || (Math.abs(lat) < 1 && Math.abs(lng) < 1)) {
        if (!window.confirm('⚠ Este poste no tiene coordenadas GPS válidas.\n\nSe guardará con lat=0, lng=0 y aparecerá como ⚠GPS en el mapa.\n\n¿Continuar de todas formas?')) {
          setSaving(false);
          return;
        }
      }

      const utValue = ut || 'SIN-CAT';
      const dirText = direccion.trim() || (lat ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Sin dirección');
      const parsedNum = numPoste ? parseInt(numPoste, 10) : null;

      const newPost = await createPostAtomic({
        direccion: dirText,
        alias: alias.trim(),
        numPoste: parsedNum,
        lat, lng,
        unidad_territorial: utValue,
        zona_territorial: unidadesTerritoriales?.find(u => u.id === utValue)?.zona || 'Sin categorizar',
        initialStageId: selectedStageId,
        initialAttrs: stageAttrs,
        initialNotes: stageNotes,
      });

      // Upload photos after post exists. If any upload fails, do not pretend the photo was saved.
      const uploadedUrls = [];
      for (const file of photoFiles) {
        const url = await uploadPhoto(newPost.id, selectedStageId, file);
        uploadedUrls.push(url);
      }

      // Update photo URL in stage if photos were uploaded
      if (uploadedUrls.length > 0 && selectedStageId) {
        const { updateStageAtomic } = await import('../lib/data.js');
        const attrsWithPhotos = withStagePhotoUrls(stageAttrs, uploadedUrls);
        await updateStageAtomic(newPost.id, selectedStageId, { attrs: attrsWithPhotos, photoUrl: uploadedUrls[0] });
        newPost.stages[selectedStageId].photo = uploadedUrls[0];
        newPost.stages[selectedStageId].photos = uploadedUrls;
        newPost.stages[selectedStageId].attrs = attrsWithPhotos;
      }

      if (onCreated) { clearPersistedForm(formKey); onCreated(newPost); }
    } catch (e) {
      console.error('createPost failed', e);
      setError(e?.message || 'No se pudo crear el poste.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-stone-50 border border-stone-300 rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-300 sticky top-0 bg-stone-50 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-700/20 flex items-center justify-center">
              <Plus className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-950">Nuevo poste</h3>
              <p className="text-xs text-stone-500">Selecciona la etapa y captura los datos</p>
            </div>
          </div>
          <button onClick={() => { clearPersistedForm(formKey); onClose(); }} className="text-stone-500 hover:text-stone-900 p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {restoredFromSave && (
            <div className="p-2.5 rounded-lg border border-blue-300 bg-blue-50 text-xs text-blue-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Datos recuperados de sesión anterior. Las fotos deben re-capturarse.
            </div>
          )}

          {/* 1. Selector de etapa */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-2">Etapa a registrar *</label>
            <div className="grid grid-cols-2 gap-2">
              {(stageDefs || []).map(s => {
                const isSelected = selectedStageId === s.id;
                const IconComponent = s.Icon;
                return (
                  <button key={s.id} onClick={() => handleStageChange(isSelected ? null : s.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left ${
                      isSelected ? 'border-brand-600/50 bg-brand-500/10' : 'border-stone-300 bg-stone-100 hover:border-stone-500'
                    }`}>
                    <IconComponent className="w-5 h-5 flex-shrink-0" style={{ color: s.color }} />
                    <div>
                      <div className="text-xs font-mono font-bold" style={{ color: isSelected ? s.color : '#a1a1aa' }}>E{s.num}</div>
                      <div className="text-[12px] text-stone-600 leading-tight">{s.short}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Campos de la etapa (incluye GPS) */}
          {selectedStage && (
            <div className="border border-stone-300 rounded-lg p-4 space-y-4" style={{ borderColor: `${selectedStage.color}40` }}>
              <div className="text-sm font-medium" style={{ color: selectedStage.color }}>
                E{selectedStage.num} · {selectedStage.name}
              </div>
              <p className="text-xs text-stone-600">{selectedStage.desc}</p>

              <StageFormFields
                stage={selectedStage}
                attrs={stageAttrs}
                setAttr={setAttr}
                notes={stageNotes}
                setNotes={setStageNotes}
                photoAdded={photoAdded}
                setPhotoAdded={setPhotoAdded}
                showPwd={showPwd}
                setShowPwd={setShowPwd}
                onPhotoFiles={handlePhotoFile}
              />
            </div>
          )}

          {/* 3. Dirección (después del GPS, auto-fill) */}
          {selectedStage && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Dirección / referencia
                <span className="text-stone-500 ml-1">(se auto-genera desde GPS, puedes editarla)</span>
              </label>
              <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                     placeholder="Se llenará automáticamente con las coordenadas"
                     className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
            </div>
          )}

          {/* 3b. Alias */}
          {selectedStage && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Alias / nombre corto
                <span className="text-stone-500 ml-1">(para identificar rápido)</span>
              </label>
              <input type="text" value={alias} onChange={e => setAlias(e.target.value)}
                     placeholder="Ej: Frente a la escuela, Esquina farmacia"
                     className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
            </div>
          )}

          {/* 4. UT (texto libre, opcional) */}
          {selectedStage && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Num Poste
                <span className="text-stone-500 ml-1">(número visible del poste)</span>
              </label>
              <div className="flex items-center gap-2">
                <input type="number" value={numPoste} onChange={e => setNumPoste(e.target.value)}
                       placeholder="Ej: 5"
                       className="flex-1 bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-brand-600 font-mono" />
                {numPoste && (
                  <label className="flex items-center gap-1.5 text-[11px] text-stone-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={shiftNumbers} onChange={e => setShiftNumbers(e.target.checked)}
                           className="w-3.5 h-3.5 accent-brand-500" />
                    Recorrer posteriores
                  </label>
                )}
              </div>
              {numPoste && shiftNumbers && (
                <div className="text-[10px] text-amber-600 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠ Los postes con número ≥ {numPoste} se recorrerán +1
                </div>
              )}
            </div>
          )}

          {selectedStage && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Unidad territorial
              </label>
              <select value={ut} onChange={e => setUt(e.target.value)}
                     className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 focus:outline-none focus:border-brand-600">
                <option value="SIN-CAT">Sin categorizar</option>
                {unidadesTerritoriales?.map(u => (
                  <option key={u.id} value={u.id}>{u.id}{u.zona ? ` · ${u.zona}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Info si no hay etapa seleccionada */}
          {!selectedStage && (
            <div className="text-xs text-stone-500 bg-stone-100/50 border border-stone-300 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-1.5 text-brand-500" />
              Selecciona una etapa arriba para capturar la ubicación GPS y los datos del poste.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm rounded-lg py-3">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!canSave || saving}
                    className="flex-1 bg-brand-700 hover:bg-brand-600 disabled:bg-stone-200 disabled:text-stone-500 text-stone-950 text-sm font-medium rounded-lg py-3 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</> : <><Check className="w-4 h-4" /> Crear poste</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
