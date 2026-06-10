---
name: fix-modulos-responsive-paginacion
description: Esfuerzo en curso para dejar cada módulo responsivo, paginado y filtrable sin tocar la BD
metadata:
  type: project
---

El usuario pidió corregir el proyecto (field-coord-app / Postes GAM · CI1215) **módulo por módulo** hasta que cada uno quede 100% responsivo, funcional, sin bugs, con paginación eficiente y filtros de búsqueda.

**Restricción dura:** NO tocar nada que afecte la base de datos (sin migraciones, sin cambiar consultas/escrituras). La paginación se hace **del lado del cliente** (cortando arrays ya cargados en memoria con `.slice`).

**Orden acordado:** en orden de pestañas → Dashboard, Mi Panel, Captura, Scouting, Mapa GPS, Postes, Incidencias, Propuestas, Inventario, Usuarios, Auditoría, Informe, Geo v2.

**Patrón usado:** componente `ListPager`/`Pager`/`TablePager` (prev/indicador/next) o footer Anterior/Siguiente; estado `page` + `useEffect` que resetea a 0 al cambiar filtros/búsqueda; `safePage = Math.min(page, totalPages-1)`. Para tablas densas, envolver en `overflow-x-auto` + `min-w-[Npx]`. Para headers, `flex-wrap` + `min-w-0`/`truncate`.

**Refinamiento (2026-06-10):** los componentes de paginación (`Pager` en ScoutingView, `TablePager` en FieldCaptureView) aceptan un prop `className` (default `px-4 py-2.5` aprox.) para controlar el padding del contenedor según dónde vivan. Preferencia del usuario: los paginadores van **fuera** de la caja con borde/fondo de la tabla, como hermanos dentro del wrapper de márgenes (`px-4 py-3`), alineados con la tabla (padding horizontal mínimo, p. ej. `px-1 pt-3`) y conservando `flex-wrap` para responsividad. Nota sobre celdas sticky: una primera columna `sticky` con fondo opaco tapaba el hover de la fila y, al darle hover propio, causaba un parpadeo (capa de composición desfasada); se resolvió quitando el `sticky` de esa columna (no era crítico, solo fijaba el ID en scroll horizontal de pantallas estrechas).

**Verificación:** `npm run build` (sin entorno para correr la app con login Supabase, así que la responsividad se valida por revisión de clases Tailwind, no en vivo). App.jsx es un monolito de ~8200 líneas; varias vistas viven ahí.

**Estado (primera pasada completada 2026-06-09):** los 13 módulos revisados. Paginación cliente añadida donde faltaba: Mi Panel (capturas), Captura (pendientes/completados, ListPager), Incidencias (25/pág), Propuestas (15/pág + búsqueda nueva), Inventario (30/pág por subtab), Usuarios (20/pág + búsqueda), Auditoría (25/pág sobre los 500 ya cargados + búsqueda). Fixes responsivos: tablas densas a `overflow-x-auto`+`min-w` (Postes Pipeline, Usuarios, Auditoría), headers a `flex-wrap`, overlays del Mapa GPS (leyenda `hidden sm:block`, botón "Cerca de mí" `top-16 sm:top-4`), roots planos (Usuarios/Auditoría/Informe) a `h-full overflow-y-auto p-4 sm:p-6`. Scouting y Geo v2 ya estaban bien (ajustes menores / ninguno). Falta pendiente: validación visual en dispositivo real (requiere login Supabase).

Ver también [[postes-gam-stack]].
