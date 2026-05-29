import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// La app se sirve en producción bajo la ruta `/CI1215V3/` del VPS.
// En dev (npm run dev) se sirve en raíz `/` como siempre.
// Vite usa `base` para prefijar las URLs de JS/CSS/imágenes generadas.
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  const base = isBuild ? '/CI1215V3/' : '/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false, // lo registramos manualmente desde main.jsx para tener control de la UI

        // Archivos que se incluyen en el precache + sus iconos
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon-180x180.png',
        ],

        manifest: {
          id: '/CI1215V3/',
          name: 'Coordinación de Campo · GAM',
          short_name: 'CI1215',
          description: 'Captura y monitoreo de postes de videovigilancia GAM',
          theme_color: '#b91c4e',
          background_color: '#fffbea',
          display: 'standalone',
          orientation: 'portrait',
          lang: 'es-MX',
          // En producción la app vive bajo /CI1215V3/
          scope: base,
          start_url: base,
          icons: [
            { src: 'pwa-64x64.png',  sizes: '64x64',   type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          categories: ['productivity', 'utilities'],
        },

        workbox: {
          // Precache de toda la app — incluimos HTML como fallback offline.
          // Las navegaciones online prefieren NetworkFirst (regla más abajo).
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          // Subir el límite por archivo a 5 MB (el chunk de OL ronda los 270 KB pero por si crece)
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Limpiar caches viejos automáticamente
          cleanupOutdatedCaches: true,

          // Importante: SPA fallback respetando el subpath /CI1215V3/
          navigateFallback: `${base}index.html`,
          // Excluir requests a Supabase y a los tiles del navigateFallback
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/rest\//,
            /supabase\.co/,
            /basemaps\.cartocdn\.com/,
            /tile\.openstreetmap\.org/,
          ],

          runtimeCaching: [
            // ── App shell (HTML) — NetworkFirst para propagar deploys rápido ──
            // Online: pide HTML al servidor (timeout 8s para 4G mexicano),
            // si llega → HTML fresco con referencia al bundle nuevo.
            // Offline o red muy lenta: cae al runtime cache, y si está vacío
            // workbox usa navigateFallback (precache).
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-shell-v1',
                networkTimeoutSeconds: 8,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ── Tiles de CARTO Voyager (modo claro) ─────────────────────
            {
              urlPattern: ({ url }) =>
                url.hostname.endsWith('basemaps.cartocdn.com'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'carto-tiles-v3',
                expiration: {
                  maxEntries: 1500,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ── Tiles de OpenStreetMap (fallback que ya tienen) ────────
            {
              urlPattern: ({ url }) =>
                url.hostname.endsWith('tile.openstreetmap.org'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-v3',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ── Lecturas Supabase (REST GET) ─────────────────────────────
            // NetworkFirst: si hay red, datos frescos; si no, sirve del cache
            {
              urlPattern: ({ url, request }) =>
                url.hostname.endsWith('.supabase.co') &&
                url.pathname.startsWith('/rest/v1/') &&
                request.method === 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-reads-v1',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24, // 1 día
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ── Storage (fotos en bucket Supabase) ───────────────────────
            {
              urlPattern: ({ url, request }) =>
                url.hostname.endsWith('.supabase.co') &&
                url.pathname.includes('/storage/v1/') &&
                request.method === 'GET',
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-storage-v1',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ── Google Fonts ─────────────────────────────────────────────
            {
              urlPattern: ({ url }) =>
                url.hostname === 'fonts.googleapis.com' ||
                url.hostname === 'fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-v1',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],

          // Para escrituras Supabase (POST/PATCH/DELETE) NO usamos cache.
          // En el futuro pueden migrarse a Background Sync con una cola IndexedDB.
        },

        devOptions: {
          // Dejarlo en false simplifica el debug en dev. Activarlo solo si
          // se necesita probar el SW localmente.
          enabled: false,
        },
      }),
    ],
    define: {
      __BUILD_VERSION__: JSON.stringify(
        new Date()
          .toLocaleString('sv', { timeZone: 'America/Mexico_City' })
          .replace(/[-: ]/g, '')
          .slice(2, 12)
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            ol: ['ol'],
            vendor: ['react', 'react-dom', 'lucide-react'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
