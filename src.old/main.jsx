import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installStorage } from './lib/storage.js';
import { registerServiceWorker } from './lib/pwa.js';
import './index.css';

try { installStorage(); } catch (e) { console.warn('installStorage failed:', e); }

// Registrar service worker (solo en producción; en dev no hay SW)
try { registerServiceWorker(); } catch (e) { console.warn('SW register failed:', e); }

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 20, fontFamily: 'monospace', color: '#c00', background: '#fff', minHeight: '100vh' } },
        React.createElement('h2', null, 'Error en la app'),
        React.createElement('p', { style: { fontSize: 14 } }, 'Ocurrió un error inesperado. Intenta recargar la página.'),
        React.createElement('pre', { style: { fontSize: 11, color: '#999', marginTop: 8, maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap' } }, String(this.state.error?.message || '') + '\n' + String(this.state.error?.stack || '').split('\n').slice(0,3).join('\n')),
        React.createElement('button', { onClick: () => window.location.reload(), style: { marginTop: 10, padding: '8px 16px', cursor: 'pointer', border: '1px solid #c00', background: '#c00', color: '#fff', fontFamily: 'monospace' } }, 'Recargar')
      );
    }
    return this.props.children;
  }
}

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found');
  ReactDOM.createRoot(root).render(
    React.createElement(ErrorBoundary, null, React.createElement(App))
  );
} catch (e) {
  console.error('Bootstrap failed:', e);
  document.body.innerHTML = '<div style="padding:20px;font-family:monospace;color:#c00"><h2>Error al iniciar</h2><pre>' + (e?.message || e) + '</pre></div>';
}
