---
name: ui-contraste-texto-legibilidad
description: Preferencia del usuario por contraste/legibilidad de texto — texto claro sobre fondos oscuros, oscuro sobre fondos claros
metadata:
  type: feedback
---

En Postes GAM · CI1215 el código base reutiliza `text-stone-950` (casi negro) sobre fondos de marca oscuros en muchos lugares, lo que da contraste pobre. En una pasada de pulido visual (2026-06-10) el usuario hizo corregir varios casos y dejó claras estas preferencias:

- **Botones de acción con fondo oscuro** (`bg-brand-700`, `bg-rose-700`): usar `text-white`, no `text-stone-950`. Ej. corregidos: "Crear usuario", "Nuevo poste" (Captura), botón "Guardar" del modal editar usuario, botón "Nuevo" de Postes.
- **Chips/filtros en estado seleccionado** sobre `bg-rose-700` (filtros de Incidencias abierta/atendida/resuelta/todas; toggle Pipeline/Detalle de Postes): usar `text-rose-50` (claro de la misma familia rose), no `text-stone-950`.
- **Títulos de tabla/sección sobre fondos claros** (`bg-stone-200`): NO usar tonos claros como `emerald-400` ni `brand-400` (recordar: `brand` = teal en V3, se ve verdoso/esmeralda ilegible). Usar colores oscuros visibles. En Captura quedó "Pendientes" = `text-rose-600` y "Completados" = `text-blue-600`.
- **Botones disabled con fondo claro** (`disabled:bg-stone-200`): añadir `disabled:text-stone-500` para que el texto siga legible mientras el fondo aclara (p. ej. durante un guardado con spinner).

**Why:** el contraste pobre es un problema recurrente del proyecto; el usuario lo detecta a simple vista y prioriza legibilidad.

**How to apply:** al crear o editar botones, chips y títulos, revisar contraste texto/fondo. Fondo oscuro → texto blanco/claro; fondo claro → texto oscuro. Validar con `npm run build`.

Ver también [[fix-modulos-responsive-paginacion]].
