/**
 * src/components/StageFields.jsx — Componentes de formulario reutilizables.
 *
 * Extraídos de App.jsx para que los usen tanto el StageEditor (drawer),
 * como FieldCaptureView (captura en campo) y CreatePostForm (registro).
 */

import { useState, useEffect } from 'react';
import {
  Navigation, Camera, ArrowUpRight, Eye, EyeOff, Lock, Copy,
  CheckCircle2, Upload, X, Image as ImageIcon, AlertTriangle, AlertCircle, ListChecks
} from 'lucide-react';

// =============================================================================
// parseGoogleMapsLink — extrae lat/lng de links o coordenadas
// =============================================================================

export function parseGoogleMapsLink(text) {
  if (!text) return null;
  const s = text.trim();
  if (/goo\.gl\/maps|maps\.app\.goo\.gl/i.test(s)) {
    return { error: 'Los links cortos (goo.gl) no pueden decodificarse automáticamente. Abre el link en el navegador y copia la URL larga.' };
  }
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return { error: 'No pude encontrar coordenadas en ese texto.' };
}

// =============================================================================
// GPSField — captura completa de ubicación (device + link + manual)
// =============================================================================

export function GPSField({ value = {}, onChange, color = '#F59E0B' }) {
  const [linkInput, setLinkInput] = useState(value.link || '');
  const [parseMsg, setParseMsg] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState(null);

  useEffect(() => { setLinkInput(value.link || ''); }, [value.link]);

  const update = (patch) => { onChange({ ...value, ...patch }); };

  const handleExtract = () => {
    const result = parseGoogleMapsLink(linkInput);
    if (!result) { setParseMsg({ type: 'error', text: 'Pega primero un link o coordenadas' }); return; }
    if (result.error) { setParseMsg({ type: 'error', text: result.error }); return; }
    update({ lat: result.lat, lng: result.lng, link: linkInput, source: 'link', accuracy: null });
    setParseMsg({ type: 'ok', text: `Coordenadas extraídas: ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}` });
    setTimeout(() => setParseMsg(null), 3500);
  };

  const handleLinkPaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    setTimeout(() => {
      const result = parseGoogleMapsLink(pasted);
      if (result && !result.error) {
        update({ lat: result.lat, lng: result.lng, link: pasted, source: 'link', accuracy: null });
        setParseMsg({ type: 'ok', text: 'Coordenadas extraídas del link pegado' });
        setTimeout(() => setParseMsg(null), 3500);
      }
    }, 0);
  };

  const handleDeviceCapture = () => {
    if (!navigator.geolocation) {
      setCaptureMsg({ type: 'error', text: 'Este navegador no soporta geolocalización. Usa la opción de pegar link de Google Maps.' }); return;
    }
    // Verificar HTTPS
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      setCaptureMsg({ type: 'error', text: '⚠️ GPS requiere HTTPS. Abre la app desde https:// o usa "Pegar link de Google Maps".' }); return;
    }
    setCapturing(true);
    setCaptureMsg({ type: 'info', text: 'Solicitando permiso de ubicación… Acepta el permiso cuando tu navegador lo pida.' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const link = `https://maps.google.com/?q=${latitude},${longitude}`;
        update({ lat: latitude, lng: longitude, link, source: 'device', accuracy: Math.round(accuracy) });
        setLinkInput(link);
        setCapturing(false);
        setCaptureMsg({ type: 'ok', text: `✓ Ubicación capturada · precisión ±${Math.round(accuracy)} m` });
        setTimeout(() => setCaptureMsg(null), 4000);
      },
      (err) => {
        setCapturing(false);
        let msg = 'No se pudo obtener la ubicación.';
        if (err.code === 1) msg = 'Permiso denegado.\n\nEn iPhone: Ajustes → Safari → Ubicación → Permitir.\nEn Android: Toca el candado en la barra de dirección → Permisos → Ubicación → Permitir.';
        else if (err.code === 2) msg = 'Señal GPS no disponible. Sal a un área abierta e intenta de nuevo.';
        else if (err.code === 3) msg = 'Tiempo agotado. Intenta de nuevo en un lugar con mejor señal.';
        msg += '\n\n💡 Alternativa: abre Google Maps → mantén presionado tu ubicación → "Compartir" → copia el link y pégalo abajo.';
        setCaptureMsg({ type: 'error', text: msg });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const hasCoords = value.lat !== undefined && value.lng !== undefined && value.lat !== '' && value.lng !== '';

  return (
    <div className="space-y-3">
      <button type="button" onClick={handleDeviceCapture} disabled={capturing}
              className="w-full px-4 py-4 border-2 font-mono text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-colors disabled:opacity-50 rounded-lg"
              style={{ background: `${color}15`, borderColor: `${color}60`, color }}>
        {capturing ? (
          <><div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Obteniendo GPS…</>
        ) : (
          <><Navigation className="w-5 h-5" strokeWidth={1.5} /> 📍 Capturar mi ubicación</>
        )}
      </button>
      {captureMsg && (
        <div className={`text-[13px] font-mono px-3 py-2 border whitespace-pre-line ${
          captureMsg.type === 'error' ? 'border-red-500/40 bg-red-500/5 text-red-400' :
          captureMsg.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400' :
          'border-stone-300 bg-stone-100/50 text-stone-600'
        }`}>{captureMsg.text}</div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-stone-100" />
        <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">o pega link</span>
        <div className="flex-1 h-px bg-stone-100" />
      </div>

      <div>
        <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">Link de Google Maps</label>
        <div className="flex gap-2">
          <input type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)} onPaste={handleLinkPaste}
                 placeholder="https://maps.google.com/?q=..."
                 className="flex-1 bg-stone-50 border border-stone-300 px-3 py-2 text-xs text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-brand-600/50" />
          <button type="button" onClick={handleExtract}
                  className="px-3 py-2 border border-stone-300 text-stone-700 hover:border-brand-600/50 hover:text-brand-500 text-[13px] font-mono uppercase tracking-wider">
            Extraer
          </button>
        </div>
        {parseMsg && <div className={`mt-2 text-[13px] font-mono px-2 py-1.5 ${parseMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{parseMsg.text}</div>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-stone-100" />
        <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">o edita manualmente</span>
        <div className="flex-1 h-px bg-stone-100" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">Latitud</label>
          <input type="number" step="any" value={value.lat ?? ''} placeholder="19.334567"
                 onChange={e => update({ lat: e.target.value === '' ? '' : parseFloat(e.target.value), source: 'manual' })}
                 className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono tabular-nums focus:outline-none focus:border-brand-600/50" />
        </div>
        <div>
          <label className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-1 block">Longitud</label>
          <input type="number" step="any" value={value.lng ?? ''} placeholder="-99.123456"
                 onChange={e => update({ lng: e.target.value === '' ? '' : parseFloat(e.target.value), source: 'manual' })}
                 className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono tabular-nums focus:outline-none focus:border-brand-600/50" />
        </div>
      </div>

      {hasCoords && (
        <div className="p-3 bg-stone-100/60 border border-stone-300">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Ubicación registrada</span>
            <span className="text-[12px] font-mono uppercase tracking-wider"
                  style={{ color: value.source === 'device' ? '#10B981' : value.source === 'link' ? '#F59E0B' : '#A1A1AA' }}>
              {value.source === 'device' ? `📡 Dispositivo${value.accuracy ? ` · ±${value.accuracy}m` : ''}` :
               value.source === 'link' ? '🔗 Link' : '✏️ Manual'}
            </span>
          </div>
          <div className="font-mono text-sm text-stone-800 tabular-nums">
            {typeof value.lat === 'number' ? value.lat.toFixed(6) : value.lat}°, {typeof value.lng === 'number' ? value.lng.toFixed(6) : value.lng}°
          </div>
          <a href={`https://maps.google.com/?q=${value.lat},${value.lng}`} target="_blank" rel="noopener noreferrer"
             className="mt-1 inline-flex items-center gap-1 text-[13px] font-mono text-brand-500 hover:underline">
            Abrir en Google Maps <ArrowUpRight className="w-3 h-3" strokeWidth={1.5}/>
          </a>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// BulletOrientationsField — orientaciones dinámicas según cantidad_bullet
// =============================================================================

export function BulletOrientationsField({ count, value, onChange, color = '#F59E0B' }) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const current = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (current.length === safeCount) return;
    const next = [];
    for (let i = 0; i < safeCount; i++) next.push(current[i] || '');
    onChange(next);
  }, [safeCount]);

  if (safeCount === 0) {
    return (
      <div className="px-3 py-2.5 border border-dashed border-stone-300 bg-stone-100/30 text-[13px] text-stone-500 font-mono italic">
        Declara al menos una cámara Bullet para capturar su orientación.
      </div>
    );
  }

  const updateAt = (idx, val) => {
    const next = [...current];
    while (next.length < safeCount) next.push('');
    next[idx] = val;
    onChange(next.slice(0, safeCount));
  };

  return (
    <div className="space-y-1.5">
      {Array.from({ length: safeCount }).map((_, i) => {
        const filled = !!(current[i] && current[i].trim());
        return (
          <div key={i} className="flex items-stretch gap-2">
            <div className="flex-shrink-0 w-16 px-2 py-2 border text-[12px] font-mono uppercase tracking-wider flex items-center gap-1.5"
                 style={{ background: filled ? `${color}10` : '#18181B', borderColor: filled ? `${color}40` : '#27272A', color: filled ? color : '#71717A' }}>
              <Camera className="w-3 h-3" strokeWidth={1.5} /> B{i + 1}
            </div>
            <input type="text" value={current[i] || ''} onChange={e => updateAt(i, e.target.value)}
                   placeholder={`Hacia… (ej. Av. Reforma, esquina sur)`}
                   className="flex-1 bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-brand-600/50" />
          </div>
        );
      })}
      <div className="text-[12px] font-mono text-stone-500 mt-1">Las cámaras PTZ no requieren orientación (rotan 360°).</div>
    </div>
  );
}

// =============================================================================
// PhotoField — múltiples fotos (cámara + galería)
// =============================================================================

export function PhotoField({ photoReq, photoAdded, onToggle, color = '#F59E0B', onFileSelected, onFilesChange }) {
  const [previews, setPreviews] = useState([]);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems = files.map(file => ({ id: Date.now() + Math.random(), src: '', file }));
    setPreviews(prev => {
      const next = [...prev, ...newItems];
      if (onFilesChange) onFilesChange(next.map(p => p.file));
      return next;
    });

    newItems.forEach(item => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviews(prev => prev.map(p => p.id === item.id ? { ...p, src: ev.target.result } : p));
      };
      reader.readAsDataURL(item.file);
      if (onFileSelected) onFileSelected(item.file);
    });

    onToggle(true);
    e.target.value = '';
  };

  const removePhoto = (id) => {
    setPreviews(prev => {
      const next = prev.filter(p => p.id !== id);
      if (onFilesChange) onFilesChange(next.map(p => p.file));
      if (next.length === 0) {
        onToggle(false);
        if (onFileSelected) onFileSelected(null);
      }
      return next;
    });
  };

  return (
    <div className="p-4 border border-stone-300 bg-stone-100/40">
      <div className="flex items-start gap-2 mb-3">
        <Camera className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} strokeWidth={1.5} />
        <div>
          <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500">Requisito fotográfico</div>
          <div className="text-sm text-stone-700 mt-0.5">{photoReq}</div>
        </div>
      </div>

      {/* Previews de fotos ya adjuntas */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {previews.map(p => (
            <div key={p.id} className="relative group">
              {p.src ? (
                <img src={p.src} alt="Foto" className="w-full h-24 object-cover rounded border border-stone-300" />
              ) : (
                <div className="w-full h-24 rounded border border-stone-300 bg-stone-200 animate-pulse" />
              )}
              <button onClick={() => removePhoto(p.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/20 rounded-full flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botones para agregar más fotos (siempre visibles) */}
      <div className="flex gap-2">
        <label className="flex-1 py-3 border border-dashed border-stone-300 text-stone-600 hover:border-brand-600/50 hover:text-brand-500 flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-widest transition-colors cursor-pointer rounded">
          <Camera className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Tomar</span> foto
          <input type="file" accept="image/*" capture="environment" onChange={handleFiles} className="hidden" />
        </label>
        <label className="flex-1 py-3 border border-dashed border-stone-300 text-stone-600 hover:border-brand-600/50 hover:text-brand-500 flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-widest transition-colors cursor-pointer rounded">
          <Upload className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Seleccionar</span> galería
          <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
        </label>
      </div>

      {previews.length > 0 && (
        <div className="text-[12px] text-emerald-400 font-mono mt-2 text-center">
          {previews.length} foto{previews.length > 1 ? 's' : ''} adjunta{previews.length > 1 ? 's' : ''} ✓
        </div>
      )}
    </div>
  );
}

// =============================================================================
// StageAttributeField — renderiza un campo según su type
// =============================================================================

function showWhenPasses(cond, attrs) {
  if (!cond) return true;
  const cur = attrs?.[cond.key];
  if ('includes' in cond) return Array.isArray(cur) && cur.includes(cond.includes);
  return cur === cond.value;
}

export function StageAttributeField({ attr, value, attrs, onChange, color, showPwd, onTogglePwd }) {
  if (attr.type === 'select') {
    return (
      <select value={value || ''} onChange={e => onChange(attr.key, e.target.value)}
              className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-brand-600/50">
        <option value="">— Seleccionar —</option>
        {(attr.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (attr.type === 'gps') {
    return <GPSField value={value || {}} onChange={v => onChange(attr.key, v)} color={color} />;
  }

  if (attr.type === 'bullet_orientations') {
    return (
      <BulletOrientationsField
        count={attrs[attr.dependsOn] ?? 0}
        value={value || []}
        onChange={v => onChange(attr.key, v)}
        color={color}
      />
    );
  }

  if (attr.type === 'image') {
    const hasPhoto = value && typeof value === 'string' && value.startsWith('http');
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-stone-400 rounded-lg cursor-pointer hover:bg-stone-100 transition-colors">
          <Camera className="w-5 h-5 text-stone-500" />
          <span className="text-sm text-stone-600">{hasPhoto ? 'Cambiar foto' : 'Tomar foto'}</span>
          <input type="file" accept="image/*" capture="environment" className="hidden"
                 onChange={async (e) => {
                   const file = e.target.files?.[0];
                   if (!file) return;
                   try {
                     const { uploadStagePhoto } = await import('../lib/data.js');
                     const url = await uploadStagePhoto('cascajo', attr.key + '-' + Date.now(), file);
                     onChange(attr.key, url);
                   } catch(err) { alert('Error subiendo foto: ' + (err?.message || err)); }
                 }} />
        </label>
        {hasPhoto && (
          <a href={value} target="_blank" rel="noopener noreferrer">
            <img src={value} alt="Foto cascajo" className="w-full h-32 object-cover rounded border border-stone-300 hover:border-brand-600" />
          </a>
        )}
      </div>
    );
  }
  if (attr.type === 'boolean') {
    return (
      <button onClick={() => onChange(attr.key, !value)}
              className={`w-full px-3 py-2 border text-sm font-mono text-left flex items-center gap-2 transition-colors ${
                value ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-500'
              }`}>
        {value ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.5}/> : <div className="w-4 h-4 border border-stone-300"/>}
        Sí, confirmo
      </button>
    );
  }

  if (attr.type === 'multicheck') {
    const sel = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        {(attr.options || []).map(o => {
          const on = sel.includes(o.value);
          return (
            <button key={o.value} type="button"
              onClick={() => onChange(attr.key, on ? sel.filter(x => x !== o.value) : [...sel, o.value])}
              className={`w-full px-3 py-2 border text-sm font-mono text-left flex items-center gap-2 transition-colors ${
                on ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
                   : 'bg-stone-50 border-stone-300 text-stone-600 hover:border-stone-500'
              }`}>
              {on ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.5}/> : <div className="w-4 h-4 border border-stone-300"/>}
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (attr.type === 'number') {
    return (
      <input type="number" value={value ?? ''} placeholder={attr.placeholder} min={attr.min ?? 0}
             onChange={e => onChange(attr.key, e.target.value === '' ? '' : Math.max(attr.min ?? 0, Number(e.target.value)))}
             className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-brand-600/50" />
    );
  }

  if (attr.type === 'password') {
    return (
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input type={showPwd ? 'text' : 'password'} value={value || ''} placeholder={attr.placeholder}
                 onChange={e => onChange(attr.key, e.target.value)}
                 className="w-full bg-stone-50 border border-stone-300 pl-3 pr-10 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-brand-600/50" />
          <button type="button" onClick={onTogglePwd}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-950 p-1">
            {showPwd ? <EyeOff className="w-4 h-4" strokeWidth={1.5}/> : <Eye className="w-4 h-4" strokeWidth={1.5}/>}
          </button>
        </div>
        {value && (
          <button onClick={() => navigator.clipboard?.writeText(value)}
                  className="px-2.5 border border-stone-300 text-stone-600 hover:text-stone-950">
            <Copy className="w-4 h-4" strokeWidth={1.5}/>
          </button>
        )}
      </div>
    );
  }

  // Default: text
  return (
    <input type="text" value={value || ''} placeholder={attr.placeholder}
           onChange={e => onChange(attr.key, e.target.value)}
           className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 font-mono focus:outline-none focus:border-brand-600/50" />
  );
}

// =============================================================================
// StageFormFields — renderiza TODOS los campos de una etapa (reusable)
// =============================================================================

export function StageFormFields({ stage, attrs, setAttr, notes, setNotes, photoAdded, setPhotoAdded, showPwd, setShowPwd, onPhotoFiles, existingPhotos, onCreateIncident, postId, attrsUpdated }) {
  const [showEscalate, setShowEscalate] = useState(false);
  const [incType, setIncType] = useState('');
  const [incSev, setIncSev] = useState('media');
  const [incSubmitting, setIncSubmitting] = useState(false);
  const fieldDates = attrsUpdated || {};

  return (
    <div className="space-y-5">
      {/* Fotos existentes */}
      {existingPhotos && existingPhotos.length > 0 && (
        <div className="p-3 border border-stone-300 bg-stone-100/40">
          <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-2">Fotos registradas</div>
          <div className="grid grid-cols-3 gap-2">
            {existingPhotos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`Foto ${i+1}`} className="w-full h-24 object-cover rounded border border-stone-300 hover:border-brand-600 transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
      {/* Foto nueva */}
      <PhotoField photoReq={stage.photoReq} photoAdded={photoAdded} onToggle={setPhotoAdded} color={stage.color}
                  onFilesChange={onPhotoFiles} />

      {/* Atributos */}
      {(stage.attributes || []).length > 0 && (
        <div>
          <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-3">Datos de la etapa</div>
          <div className="space-y-3">
            {stage.attributes.map(a => {
              if (!showWhenPasses(a.showWhen, attrs)) return null;
              return (
              <div key={a.key}>
                <label className="text-xs text-stone-600 font-mono flex items-center gap-1.5 mb-1.5">
                  {a.label}
                  {a.required && <span className="text-brand-500">*</span>}
                  {a.sensitive && <Lock className="w-3 h-3 text-brand-500" strokeWidth={1.5}/>}
                  {fieldDates[a.key] && (
                    <span className="ml-auto text-[13px] text-stone-400 font-normal">
                      ✎ {new Date(fieldDates[a.key]).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })} {new Date(fieldDates[a.key]).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
                    </span>
                  )}
                </label>
                <StageAttributeField
                  attr={a}
                  value={attrs[a.key]}
                  attrs={attrs}
                  onChange={(key, val) => setAttr(key, val)}
                  color={stage.color}
                  showPwd={showPwd}
                  onTogglePwd={() => setShowPwd(!showPwd)}
                />
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Observaciones */}
      <div>
        <div className="text-[12px] font-mono uppercase tracking-widest text-stone-500 mb-2">Observaciones</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Opcional: anota algo sobre esta etapa…"
                  className="w-full bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-500 font-mono focus:outline-none focus:border-brand-600/50 resize-none" />
      </div>

      {/* REPORTAR INCIDENCIA — SIEMPRE visible */}
      {!showEscalate && (
        <button onClick={() => setShowEscalate(true)}
                className="w-full px-4 py-3 border-2 border-red-500 bg-red-100 text-red-700 hover:bg-red-100 hover:border-red-500 text-sm font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors rounded-lg font-bold">
          <AlertCircle className="w-5 h-5" strokeWidth={2}/>
          Reportar incidencia
        </button>
      )}
      {showEscalate && (
        <div className="p-4 border-2 border-red-500 bg-red-100 rounded-lg space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-red-600 font-bold">
            Nueva incidencia — E{stage.num} {stage.short}
          </div>
          <input type="text" value={incType} onChange={e => setIncType(e.target.value)}
                 placeholder="Describe la incidencia…"
                 className="w-full bg-stone-50 border-2 border-stone-300 px-3 py-2.5 text-sm text-stone-950 font-mono focus:outline-none focus:border-red-500 rounded" />
          <div className="flex gap-2">
            {['baja', 'media', 'alta'].map(sev => (
              <button key={sev} onClick={() => setIncSev(sev)}
                      className={`flex-1 px-3 py-2 text-xs font-mono uppercase tracking-wider border-2 rounded transition-colors font-bold ${
                        incSev === sev
                          ? (sev === 'alta' ? 'bg-red-100 border-red-500 text-red-600'
                            : sev === 'media' ? 'bg-amber-100 border-amber-500 text-amber-700'
                            : 'bg-stone-100 border-stone-400 text-stone-700')
                          : 'border-stone-300 text-stone-500 hover:border-stone-500'
                      }`}>{sev}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowEscalate(false); setIncType(''); }}
                    className="px-4 py-2.5 border-2 border-stone-300 text-stone-600 hover:border-stone-500 text-xs font-mono uppercase tracking-wider rounded font-bold">
              Cancelar
            </button>
            <button onClick={async () => {
              setIncSubmitting(true);
              try {
              if (onCreateIncident) {
                const created = await onCreateIncident({ postId, type: incType || 'Incidencia general', description: incType || 'Sin descripción', severity: incSev, stageId: stage.id, sourceNote: notes?.trim() || '' });
                alert('Incidencia registrada' + (created?.id ? ': ' + created.id : ''));
              } else {
                alert('Incidencia registrada: ' + (incType || 'Incidencia general') + ' (' + incSev + ')');
              }
              setShowEscalate(false);
              setIncType('');
              } catch (e) {
                console.error('create incident failed', e);
              } finally {
                setIncSubmitting(false);
              }
            }}
                    disabled={incSubmitting}
                    className="flex-1 px-4 py-2.5 bg-red-500 border-2 border-red-500 text-white hover:bg-red-600 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 rounded font-bold">
              <AlertCircle className="w-4 h-4" strokeWidth={2}/> {incSubmitting ? 'Creando...' : 'Crear incidencia'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// validateStageAttrs — valida que todos los campos requeridos estén llenos
// =============================================================================

export function validateStageAttrs(stage, attrs, photoAdded) {
  // Fotos son opcionales — no bloquean el guardado
  for (const a of stage.attributes) {
    if (!a.required) continue;
    const v = attrs[a.key];
    if (a.type === 'boolean') {
      if (!v) return false;
    } else if (a.type === 'gps') {
      if (!v || v.lat === undefined || v.lng === undefined || v.lat === '' || v.lng === '') return false;
      if (isNaN(v.lat) || isNaN(v.lng)) return false;
    } else if (a.type === 'bullet_orientations') {
      const count = Number(attrs[a.dependsOn]) || 0;
      const arr = Array.isArray(v) ? v : [];
      if (count > 0) {
        if (arr.length !== count) return false;
        if (arr.some(o => !o || !o.trim())) return false;
      }
    } else if (a.type === 'number') {
      if (v === undefined || v === '' || v === null || isNaN(v)) return false;
    } else if (v === undefined || v === '' || v === null) {
      return false;
    }
  }
  // Sin validaciones obligatorias — todos los campos son opcionales
  return true;
}
