# CI1215V2 — Sesión 2026-05-10 (resumen y entrega)

## Snapshot de producción

| Item | Valor |
|---|---|
| **URL** | `https://ci1215.duckdns.org/CI1215V2/` |
| **BUILD_ID** | `20260510-172419` (5:24pm hora México) |
| **Bundle activo** | `index-8oFcCxx2.js` (414 KB / 104 KB gzip) |
| **Reemplazó** | `index-DWtjYZ07.js` + `virtual_pwa-register-ukDt0OEW.js` |
| **VPS** | `2.24.194.161` |
| **Path local** | `~/Downloads/field-coord-v2/` |
| **Supabase v2** | `rcwmjgcnpqlwrckcymrj.supabase.co` (cliente: `sb`) |

Deploy completado, nginx recargado limpio, validado en incognito.

---

## Features nuevas en producción

### 1. Filtros multi-select con URL params
- Un solo state compartido entre mapa y lista (antes había dos: `mapFilter` y `listFilter`).
- Multi-select para etapas, UTs y capturadores; single para verificación.
- Sincronizados a la URL (compartibles vía link).
- Contadores por opción ("cuántos habría si solo esta opción estuviera marcada en esa dimensión, manteniendo otros filtros activos").
- Archivos: `src/lib/filters.js`, `src/hooks/useFilters.js`, `src/components/FilterBar.jsx`.

### 2. Drag para reubicar postes (admin)
- Botón "🎯 Mover en mapa (drag)" en `PostDetailDrawer`.
- Activa OpenLayers `Translate` interaction solo sobre el feature seleccionado.
- Modal confirma coords antes/después + distancia en metros.
- Persiste TODOS los campos (`reubicado`, `latOriginal`, `lngOriginal`, `reubicadoAt`, `reubicadoPor`) vía `savePost` legacy.

### 3. Click en mapa para crear poste
- Botón "+ Nuevo aquí" en el topbar del mapa (admin + capturador).
- Click coloca punto → abre `CreatePostForm` con `initialPosition={lat, lng}` prellenado.
- Cursor crosshair en modo agregar.
- Banner morado/verde indica modo activo.

### 4. Propagación rápida de Service Worker
- **NetworkFirst** para navegaciones HTML (vite.config.js): el SW intenta la red primero (timeout 8s para 4G mexicano), cae a cache offline si falla.
- **Polling cada 5 min** + check al volver al foreground (pwa.js): `registration.update()` explícito en pestaña visible.
- Resultado: **futuros deploys se propagan en segundos sin requerir actualización manual de los capturadores.**

---

## Bugs fixed esta sesión

### A. Draft persistido contaminaba CreatePostForm desde mapa
- Síntoma: "+ Nuevo aquí" abría form, click en mapa, pero al guardar pedía "GPS inválido" aunque las coords estaban en la dirección autogenerada.
- Causa raíz 1: `formPersist.js` restauraba draft viejo de localStorage que tenía basura (URL parcial de Google Sheets en OBSERVACIONES).
- Causa raíz 2: `handleStageChange` hacía `setStageAttrs({})` que limpiaba el seed de coords si tocabas otra etapa.
- Fix: detectar `cameFromMap` (presencia de `initialPosition`), ignorar draft + limpiar localStorage al montar, y preservar `ubicacion_real` en `handleStageChange`.
- Shape correcto: `{lat, lng, source: 'manual'}` — el `source` es lo que hacía que `GPSField` renderizara el badge "✏️ Manual" y reconociera las coords como válidas.

### B. Filtros viejos hardcoded a `posts.length` en lugar de `TOTAL_TARGET=1215`
- Resuelto en pase anterior pero validado aquí.

---

## Pendientes inmediatos

### Hoy o mañana

1. **WhatsApp a Gabriel, domitilio, y Alemán** — última ronda de actualización manual. Después de hoy, deploys son transparentes.
2. **Localizar a Alemán** (no apareció en `app_error_logs`):
   ```sql
   select id, email, role, full_name, last_sign_in_at
   from public.user_profiles
   where email ilike '%aleman%' or full_name ilike '%aleman%'
   order by created_at desc;
   ```
3. **Validar propagación SW** consultando `app_error_logs` después de que actualicen — `app_version` debe traer sufijo `+2605101724` o posterior; `current_action` poblado.

### Validación post-deploy en producción

- Abrir `https://ci1215.duckdns.org/CI1215V2/` en **incognito**.
- "+ Nuevo aquí" → click mapa → form abre limpio con coords reales (no placeholders grises).
- Drag de un poste existente → modal confirma → persiste.
- DevTools → Network: primer `index.html` debe ser status 200 fresco (NetworkFirst funcionando).

---

## Backlog técnico (no urgente)

- **Bug latente flujo viejo "Reubicar (coords manuales)"** en `PostDetailDrawer` línea 3242: usa RPC `update_post_metadata` que NO acepta `reubicado/latOriginal/lngOriginal/reubicadoAt/reubicadoPor`. Estos quedan solo en estado local. Considerar extender RPC o migrar ese flujo a `savePost`. (El flujo nuevo de drag SÍ persiste todo correctamente.)
- **Kill switch SW** vía columna `min_required_build` en config table de Supabase v2; cliente compara con BUILD_ID al arrancar, fuerza `updateSWFn(true)` sin esperar visibility.
- **nginx Cache-Control** específico para `/CI1215V2/sw.js`: `no-cache, no-store, must-revalidate`.
- **CSS warning**: `@import 'ol/ol.css'` debe ir al inicio del archivo CSS (cosmético).
- **Vite warning**: `data.js` dynamic+static imported — limpiar para mejor chunking (cosmético).
- **`git init` local** — esta sesión confirmó nuevamente la utilidad.

### Pre-existentes (de sesiones anteriores)

- SQL UPDATE para marcar E1 (marca) como done en los 992 postes que ya tienen E2 (dado).
- Edge Functions v1 → v2 pendientes: `delete-user`, `change-password`, `emergency-rls`.
- Geocoding ~164 Plus Codes restantes vía Nominatim.
- `pg_cron` retención `app_error_logs` >90 días.
- Dashboard top-errores recurrentes para admin panel.
- Telemetría: extender read access a `director` cambiando `role in ('admin','director')` en `current_user_is_admin()`.

---

## Lecciones técnicas reutilizables

- **Service Worker con `globPatterns` incluyendo HTML**: ciclo vicioso para propagar deploys. Solución: HTML en precache como fallback offline + regla NetworkFirst para navegaciones en runtime caching, con timeout generoso (8s para 4G).
- **`registerType: 'autoUpdate'` en vite-pwa** ya activa skipWaiting + clientsClaim, pero NO es suficiente sin NetworkFirst en HTML.
- **`registration.update()` polling cada 5 min**: el default del browser es ~24h, demasiado lento para iteración activa.
- **Drafts persistidos**: cuando agregas un punto de entrada nuevo a un form (como `initialPosition`), considera si el draft debe ignorarse. Sin esto, basura vieja contamina seeds.
- **`handleStageChange` que hace `setStageAttrs({})`**: borra cualquier seed externo. Si tienes datos que deben persistir al cambiar de etapa, hay que re-aplicarlos en el handler.
- **OpenLayers `Translate` filtrada a un solo feature** (vía `Collection` con un elemento): permite drag selectivo sin habilitar drag global sobre 992 features.
- **Archivos del chat en Mac**: caen en `~/Downloads/files/` (no en `~/Downloads/`). El usuario debe mover manualmente, o el wrapper de carpeta `field-coord-v2/` se copia entero con `cp -R`.
- **`localStorage.removeItem(...)` es JS del browser, no shell**: pegar en DevTools Console, no en zsh.

---

## Constantes técnicas (preservar para el siguiente chat)

```
VPS:                2.24.194.161 (root SSH password)
URL prod:           https://ci1215.duckdns.org/CI1215V2/
Path local:         /Users/josealbertosobrinomar/Downloads/field-coord-v2
Bundle activo:      index-8oFcCxx2.js (BUILD_ID 20260510-172419)
nginx config:       /etc/nginx/sites-available/gam-multi
nginx snippet:      /etc/nginx/snippets/ci1215v2-security.conf
Supabase v2:        rcwmjgcnpqlwrckcymrj.supabase.co (cliente: sb)
Supabase v1 legacy: wmwbflhtwnlmcxxinutb.supabase.co
Email admin:        jose.sobrino.mar@gmail.com
TOTAL_TARGET:       1215 postes (definido App.jsx:202 y FieldCaptureView.jsx:17)
Postes cargados:    992
Stages:             marca → dado → parado → camaras → internet → conexion_poste → centro
Roles:              admin, capturador, director, scout, servicios_urbanos,
                    participacion_ciudadana, raal
PostgREST limit:    max-rows=1000 por request (usar paginación con while)
```

---

## Estructura de archivos en este paquete

```
field-coord-v2/
├── README-sesion-2026-05-10.md       (este archivo)
├── vite.config.js                    (con NetworkFirst para HTML)
├── patch_app_jsx.py                  (script idempotente: filtros multi-select)
├── patch_app_jsx_movecrear.py        (script idempotente: drag + add)
└── src/
    ├── App.jsx                       (6,504 líneas, todos los patches aplicados)
    ├── lib/
    │   ├── filters.js                (NUEVO: funciones puras de filtrado)
    │   └── pwa.js                    (con polling cada 5 min)
    ├── hooks/
    │   └── useFilters.js             (NUEVO: state + URL sync bidireccional)
    └── components/
        ├── CreatePostForm.jsx        (con fix de draft + initialPosition)
        └── FilterBar.jsx             (NUEVO: chips multi-select con popover)
```

## Despliegue (si necesitas re-deployar)

```bash
cd ~/Downloads/field-coord-v2
npm run build           # debe terminar con "✓ built in X.Xs"
npm run deploy          # build → rsync VPS → nginx reload
```
