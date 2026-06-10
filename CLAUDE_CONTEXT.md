# CLAUDE_CONTEXT.md — Resumen de sesión

> Documento de continuidad. Guarda el estado exacto de la sesión para retomar el trabajo sin perder contexto.
> **Fecha de la sesión:** 2026-06-09 · **Rama:** `main` · **Último commit:** `fe073cc`

---

## 1. Objetivo general del proyecto

**App:** `field-coord-app` — "Postes GAM / CI1215", PWA de coordinación de campo para captura y monitoreo de **postes de videovigilancia** (etapas E1–E7, incidencias, scouting, inventario de módems/cámaras).

**Stack:** React 18 + Vite 5 + Tailwind 3 + Supabase (`@supabase/supabase-js`) · Mapas con **OpenLayers** (Mapa GPS) y **Leaflet/react-leaflet** (Geo v2) · `idb` para offline · PWA (`vite-plugin-pwa`).

**Objetivo de la sesión:** corregir el proyecto **módulo por módulo** hasta que cada uno quede:
- 100 % responsivo
- funcional y libre de bugs
- con **paginación eficiente** y **filtros de búsqueda**

**Restricción dura (del usuario):** **NO tocar nada que afecte la base de datos** — sin migraciones, sin cambiar consultas de escritura, sin alterar esquema/datos. Toda la paginación es **del lado del cliente** (`.slice` sobre arrays ya cargados en memoria).

Tras completar los 13 módulos, la sesión siguió con una serie de **ajustes de UI**: formato de tablas/paginación en Captura, unificación de paginadores, ocultar botón del header, scrollbar personalizado, menú hamburguesa con backdrop, y **modo oscuro**.

---

## 2. Decisiones tomadas

| Decisión | Detalle |
|---|---|
| **Orden de trabajo** | En orden de pestañas: Dashboard → Mi Panel → Captura → Scouting → Mapa GPS → Postes → Incidencias → Propuestas → Inventario → Usuarios → Auditoría → Informe → Geo v2. |
| **Paginación** | Siempre **cliente** (`.slice`). Patrón: estado `page` + `useEffect` que resetea a 0 al cambiar filtros/búsqueda; `safePage = Math.min(page, totalPages-1)`. |
| **Tablas densas** | Envolver en `overflow-x-auto` + `min-w-[Npx]` y columna ID `sticky left-0` para móvil. |
| **Headers** | `flex-wrap` + `min-w-0`/`truncate` para no desbordar en móvil. |
| **Tamaño de página** | **10** en Postes, Incidencias, Inventario, Usuarios, Auditoría, Captura y Scouting. **15** en Mi Panel ("Últimas capturas") y Propuestas. |
| **Formato de paginador unificado** | Estilo "Usuarios": contador `N · Página X de Y` + botones **‹ Anterior / Siguiente ›**, **transparente** (sin fondo ni borde). Aplicado en Captura y Scouting. |
| **Modo oscuro** | En lugar de editar miles de clases en componentes, **remapeo por CSS** bajo `.dark` de superficies/neutros (stone/amber/white). Acentos (rose/brand, emerald, blue…) se conservan. |
| **Verificación** | Solo `npm run build` (exit 0). **No** se pudo correr la app en vivo (requiere login Supabase / `.env`), así que la responsividad se validó por revisión de clases Tailwind. |
| **Scrollbar** | Final: **track blanco** + **thumb `#ad5069`** (mismo en claro y oscuro, por pedido explícito). |

---

## 3. Archivos creados o modificados

**Modificados (sin commitear):**
- `src/App.jsx` — Dashboard, MiPanel, PostsList, IncidentsView, ProposalsView, InventoryView, MapView (header/overlays), toggle + `useEffect` de modo oscuro, backdrop del menú hamburguesa, remoción del botón "Vista móvil".
- `src/components/FieldCaptureView.jsx` — listas → **tablas estilo Postes**, paginación (`TablePager`), tarjetas con margen.
- `src/components/ScoutingView.jsx` — header `flex-wrap`, componente `Pager`, paginación de lista de rutas y de pendientes/completados en `RouteDetail`.
- `src/components/UsersView.jsx` — búsqueda + paginación + tabla con scroll horizontal + raíz `h-full overflow-y-auto p-4 sm:p-6`.
- `src/components/AuditView.jsx` — búsqueda + paginación (sobre los 500 ya cargados) + tabla con scroll horizontal + raíz scrollable.
- `src/index.css` — scrollbar (blanco + `#ad5069`) y bloque completo de **modo oscuro**.
- `index.html` — script anti-parpadeo (FOUC) que aplica `.dark` antes del render.
- `tailwind.config.js` — `darkMode: 'class'`.

**Creados:**
- `memory/fix-modulos-responsive-paginacion.md` — nota de proyecto sobre el esfuerzo (restricción no-BD, patrón, progreso).
- `memory/MEMORY.md` — índice de memoria.
- `CLAUDE_CONTEXT.md` — este documento.

> `git status`: `M index.html, src/App.jsx, src/components/AuditView.jsx, src/components/FieldCaptureView.jsx, src/components/ScoutingView.jsx, src/components/UsersView.jsx, src/index.css, tailwind.config.js` · sin trackear: `.idea/`, `memory/`, `CLAUDE_CONTEXT.md`.

---

## 4. Funciones / componentes implementados

- **`TablePager`** (`FieldCaptureView.jsx`) — paginador. Empezó estilo "Postes" (con input "Ir a página") y luego se reescribió a estilo "Usuarios" (‹ Anterior / Siguiente ›) y **transparente**.
- **`Pager`** (`ScoutingView.jsx`) — paginador estilo "Usuarios", transparente. Reutilizado en la lista de rutas y en las listas de `RouteDetail`.
- **Estado + slicing de paginación** agregado en: MiPanel (capturas), FieldCaptureView (pendientes/completados), IncidentsView, ProposalsView (+ búsqueda nueva), InventoryView (por subtab módems/cámaras), UsersView (+ búsqueda), AuditView (+ búsqueda). PostsList ya tenía paginación (se ajustó tamaño a 10).
- **Tablas estilo Postes** en Captura: `overflow-x-auto` + `<table min-w>` + columna ID `sticky` + botón "ver en mapa".
- **Sincronización de modo oscuro**: `toggleDarkMode` simplificado + `useEffect([darkMode])` que hace `documentElement.classList.toggle('dark', darkMode)` y persiste en `localStorage('ci1215-theme')`.
- **Backdrop del menú hamburguesa** con `backdrop-blur-sm` que cierra al tocar afuera (`lg:hidden`, `z-10`, debajo del `<aside>` `z-20`).

---

## 5. Problemas encontrados y cómo se resolvieron

| Problema | Solución |
|---|---|
| `App.jsx` (~429 KB / 8200+ líneas) excede el límite de lectura. | Lectura por rangos + `grep`/`Glob` dirigidos. |
| Dashboard "Avance por UT" con `grid-cols-12` se aplastaba en móvil. | Reestructurado a `flex` con barra de progreso a lo ancho; `truncate`. |
| Tabla **Pipeline** de Postes se aplastaba (sin scroll). | Envuelta en `overflow-x-auto` + `min-w-[760px]`. |
| Overlays del **Mapa GPS** se encimaban en móvil (buscador ocupa toda la fila). | Leyenda `hidden sm:block`; botón "Cerca de mí" `top-16 sm:top-4`. |
| Listas grandes renderizaban todo (cientos/miles de nodos). | Paginación cliente a 10–15 por página. |
| Tablas de Captura **pegadas a los márgenes**. | Cada sección envuelta en tarjeta `border rounded-lg overflow-hidden` con wrapper `px-4 py-3`. |
| Paginadores con estilos distintos. | Unificados al formato "Usuarios" transparente. |
| **Modo oscuro**: miles de clases claras fijas, inviable editarlas todas. | Remapeo centralizado por CSS bajo `.dark` (superficies/neutros), acentos intactos. |
| Parpadeo (FOUC) al cargar en oscuro. | Script inline en `index.html` que aplica `.dark` antes del render. |
| Botón "Vista móvil" sobraba en el header. | Botón eliminado; `mobilePreview` queda en `false` (sin romper nada). |
| ESLint sin configuración en el repo (`npm run lint` falla). | Preexistente; se verifica con `npm run build`. |

---

## 6. Tareas pendientes

- [ ] **Verificación visual en vivo** (móvil y desktop, claro y oscuro). Requiere credenciales Supabase / `.env` para correr `npm run dev` y loguearse.
- [ ] **Commit** de los cambios (siguen sin commitear; ver §9). Recomendado: crear rama, no commitear en `main` directo.
- [ ] **Modo oscuro — afinado:** revisar paneles con tinte ámbar y combinaciones acento-sobre-acento de bajo contraste; decidir si el **scrollbar** en oscuro debe diferir (hoy es blanco por pedido explícito y contrasta fuerte con la UI oscura).
- [ ] **Limpieza menor:** estado `mobilePreview` quedó como código muerto (línea `if (mobilePreview)` ~8283 de `App.jsx` nunca se ejecuta). Opcional removerlo.
- [ ] (Opcional) Unificar también los pies de paginación de **Incidencias / Propuestas / Inventario** al mismo componente/estilo exacto si se quiere 100 % consistencia.

---

## 7. Próximos pasos recomendados

1. **Correr la app** con `.env` válido y revisar cada módulo en anchos 360/768/1280 px, en claro y oscuro.
2. **Crear rama y commitear**: `git switch -c fix/responsive-paginacion-darkmode` y commits temáticos (paginación, responsividad, dark mode, scrollbar).
3. **Afinar dark mode** sobre hallazgos visuales (ajustes puntuales en `src/index.css`, bloque `.dark`).
4. Considerar **`/code-review`** del diff antes de mergear.
5. Si se quiere, retomar la idea de extraer componentes grandes de `App.jsx` (monolito) — fuera de alcance de esta sesión.

---

## 8. Comandos importantes ejecutados

```bash
# Verificación tras CADA cambio (única validación disponible sin login):
npm run build            # esperado: "✓ built" (exit 0)

# Correr en local (requiere variables de entorno Supabase):
npm run dev

# Lint NO funciona (sin config de ESLint en el repo) — no usar como gate:
# npm run lint  -> "ESLint couldn't find a configuration file"

# Estado git al cierre:
git status --short
git rev-parse --abbrev-ref HEAD   # main
git log -1 --oneline              # fe073cc
```

> El build siempre cerró en **exit 0**. Bundle principal ~744 KB (gzip ~199 KB) — grande, pero es preexistente y fuera de alcance.

---

## 9. Contexto técnico para continuar exactamente donde quedamos

### Arquitectura / ubicación de módulos
- **`src/App.jsx`** es un **monolito** (~8200 líneas). Allí viven: `Dashboard`, `RAALDashboard`, `MiPanel`, `MapView` (OpenLayers), `PostsList`, `ProposalsView`, `IncidentsView`, `InventoryView`, `InformeIncidenciasView`, `Dashboard` y el shell (header + `<aside>` + `<main>`).
  - Las líneas se **desplazan** con cada edición; localizar con `grep -n "function <Nombre>"` en vez de fiarse de números.
- Componentes en archivos propios: `FieldCaptureView.jsx` (Captura), `ScoutingView.jsx` (Scouting), `GeoV2View.jsx` (Geo v2), `UsersView.jsx`, `AuditView.jsx`, más `MapBottomSheet`, `MapSearchBox`, `FilterBar*`, `StageFields`, etc.
- Navegación: `activeTab` en el shell; `appTabs` define las pestañas (`{ id, label, icon, show }`).

### Patrón de paginación (cliente)
```js
const [page, setPage] = useState(0);
const PAGE_SIZE = 10;
useEffect(() => { setPage(0); }, [/* filtros, búsqueda */]);
const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
const safePage = Math.min(page, totalPages - 1);
const paged = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
// render paged; footer "Anterior/Siguiente" (transparente)
```
**Tamaños por módulo:** Postes `pageSize=10` · Incidencias `INC_PAGE_SIZE=10` · Inventario `INV_PAGE_SIZE=10` · Usuarios `USERS_PAGE_SIZE=10` · Auditoría `AUDIT_PAGE_SIZE=10` · Captura `LIST_PAGE_SIZE=10` · Scouting `ROUTES_PAGE_SIZE=10` y `RD_PAGE_SIZE=10` · Mi Panel `capPageSize=15` · Propuestas `PROP_PAGE_SIZE=15`.

### Modo oscuro
- Toggle (botón ☀️/🌙) en el header de `App.jsx`; estado `darkMode` (init desde `localStorage('ci1215-theme')`).
- `useEffect([darkMode])` aplica/quita la clase `dark` en `document.documentElement` y persiste. `index.html` la aplica antes del render (anti-FOUC).
- **`src/index.css`** contiene el bloque `/* MODO OSCURO */`: variables `--dk-*` y overrides `.dark .bg-*`, `.dark .text-*`, `.dark .border-*`, `.dark .divide-*`, `.dark .hover\:*`, `.dark .placeholder-*`. **Para ajustar el dark mode se edita aquí, no los componentes.**
- El **mapa** ya conmuta tiles CARTO claros/oscuros y fondo vía el prop `darkMode` (no depende del CSS).
- Especificidad: `.dark .clase` (0,2,0) gana sobre la utilidad Tailwind (0,1,0). Las variantes con opacidad llevan `\/` escapado (ej. `.dark .bg-stone-100\/40`).

### Theming de marca (preexistente)
- Variables `--brand-50..900` en `:root` (rose) y `[data-env="v3"]` (teal). Tailwind expone `brand-*` vía `rgb(var(--brand-x) / <alpha-value>)`.

### Scrollbar (`src/index.css`)
- Track **`#ffffff`**, thumb **`#ad5069`** (hover `#934458`), 8px, thumb redondeado con borde blanco de 2px (`background-clip: padding-box`). Firefox: `scrollbar-color: #ad5069 #ffffff`. Aplica igual en claro y oscuro.

### Menú / shell
- `<header>` `bg-stone-50 sticky top-0 z-30`; `<aside>` `bg-amber-50 z-20` (drawer móvil con `translate-x`); **backdrop** `lg:hidden z-10` con `backdrop-blur-sm` que cierra al tocar afuera; `<main>` `flex-1 overflow-hidden relative`.
- Vistas "planas" (Usuarios/Auditoría/Informe) usan raíz `h-full overflow-y-auto p-4 sm:p-6` para scrollear dentro de `<main overflow-hidden>`.

### Git
- Rama **`main`**, **cambios sin commitear** (8 archivos M + `memory/`, `.idea/`, `CLAUDE_CONTEXT.md` sin trackear). Crear rama antes de commitear.

### Memoria persistente
- `memory/MEMORY.md` (índice) + `memory/fix-modulos-responsive-paginacion.md` (detalle del esfuerzo y restricción no-BD).
