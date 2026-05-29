// src/components/EnvBanner.jsx
// Banner visible que indica el ambiente actual (STAGING/LOCAL/PROD).
// Se activa con VITE_SHOW_ENV_BANNER=true en el .env.
// En producción real NO debe estar esa variable, así no se muestra a usuarios finales.

import React from 'react';

const ENV_CONFIG = [
  {
    matches: ['qogxkvkgpyfnqabzkfft'],
    label: 'STAGING (V3 CI)',
    bg: '#facc15',
    text: '#000',
    icon: '🧪',
  },
  {
    matches: ['rcwmjgcnpqlwrckcymrj'],
    label: 'PRODUCCIÓN REAL ⚠️ CUIDADO',
    bg: '#dc2626',
    text: '#fff',
    icon: '🔴',
  },
  {
    matches: ['127.0.0.1', 'localhost'],
    label: 'LOCAL',
    bg: '#3b82f6',
    text: '#fff',
    icon: '💻',
  },
];

function detectEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  for (const cfg of ENV_CONFIG) {
    if (cfg.matches.some((m) => url.includes(m))) {
      return cfg;
    }
  }
  return {
    label: 'AMBIENTE DESCONOCIDO',
    bg: '#6b7280',
    text: '#fff',
    icon: '❓',
  };
}

export default function EnvBanner() {
  const showBanner = import.meta.env.VITE_SHOW_ENV_BANNER === 'true';
  if (!showBanner) return null;

  const env = detectEnv();

  return (
    <div
      style={{
        backgroundColor: env.bg,
        color: env.text,
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 700,
        textAlign: 'center',
        letterSpacing: '0.05em',
        fontFamily: 'system-ui, sans-serif',
        userSelect: 'none',
        position: 'relative',
        zIndex: 9999,
        borderBottom: '2px solid rgba(0,0,0,0.2)',
      }}
    >
      {env.icon} {env.label} · {import.meta.env.VITE_SUPABASE_URL || '(sin URL)'}
    </div>
  );
}