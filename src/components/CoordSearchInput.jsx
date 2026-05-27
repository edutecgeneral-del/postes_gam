import React, { useState } from 'react';
import { parseCoordinates } from '../lib/coords';

export default function CoordSearchInput({ onLocate, compact = false }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);

  function doLocate(text) {
    setError('');
    const result = parseCoordinates(text);
    if (!result) {
      setError('Formato no reconocido');
      setLastResult(null);
      return;
    }
    setLastResult(result);
    onLocate(result);
  }

  function handleSearch() {
    doLocate(value);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
    if (e.key === 'Escape') { setValue(''); setError(''); setLastResult(null); }
  }

  function handlePaste(e) {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!pasted) return;
    const result = parseCoordinates(pasted.trim());
    if (result) {
      setValue(pasted.trim());
      setTimeout(() => doLocate(pasted.trim()), 0);
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(''); }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="📍 lat,lng · DMS · URL Maps"
        title="Pega coords decimales, DMS, o URL completa de Google Maps"
        style={{
          padding: '6px 8px',
          border: error ? '1px solid #d33' : '1px solid #ccc',
          borderRadius: 4,
          fontSize: 13,
          minWidth: compact ? 180 : 240,
        }}
      />
      <button
        type="button"
        onClick={handleSearch}
        style={{
          padding: '6px 12px',
          background: '#1B3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Ir
      </button>
      {error && (
        <span style={{ color: '#d33', fontSize: 11 }}>{error}</span>
      )}
      {lastResult && !error && (
        <span style={{ color: '#1B3A6B', fontSize: 11, fontFamily: 'monospace' }}>
          ✓ {lastResult.lat.toFixed(6)}, {lastResult.lng.toFixed(6)} ({lastResult.source})
        </span>
      )}
    </div>
  );
}
