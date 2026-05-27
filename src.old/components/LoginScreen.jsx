/**
 * src/components/LoginScreen.jsx — Pantalla de login con Supabase Auth.
 *
 * Se muestra cuando no hay sesión activa. Al hacer login exitoso, llama a
 * onLogin() para que el App principal re-chequee la sesión.
 */

import { useState } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { signIn } from '../lib/auth.js';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      if (onLogin) onLogin();
    } catch (err) {
      console.error('login error', err);
      const msg = err?.message || '';
      if (msg.includes('Invalid login credentials')) setError('Email o contraseña incorrectos.');
      else if (msg.includes('Email not confirmed')) setError('Tu cuenta no ha sido confirmada. Contacta al administrador.');
      else if (msg.includes('Too many requests') || msg.includes('rate limit')) setError('Demasiados intentos. Espera un momento antes de reintentar.');
      else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) setError('Error de conexión. Verifica tu internet y reintenta.');
      else setError(msg || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-stone-50 border border-stone-300 rounded-2xl p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-rose-700 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-950">CI1215</h1>
              <p className="text-xs text-stone-600">Alcaldía Gustavo A. Madero · ¡Late con fuerza!</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 placeholder-stone-500 focus:outline-none focus:border-rose-600"
                placeholder="tu@email.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Contraseña</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 placeholder-stone-500 focus:outline-none focus:border-rose-600"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-rose-700 hover:bg-rose-600 disabled:bg-stone-200 disabled:text-stone-500 text-white font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando sesión…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Iniciar sesión
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-stone-300">
            <p className="text-xs text-stone-500 text-center">
              ¿No tienes cuenta? Contacta con el administrador del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
