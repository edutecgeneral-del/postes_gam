# Fix: CreatePostForm + flujo "+ Nuevo aquí" desde mapa

## El bug

Cuando creabas poste desde el botón "+ Nuevo aquí" del mapa, el form se abría,
pero al guardar mostraba "este poste no tiene coordenadas GPS válidas" aunque
mi código pasaba las coords correctas como `initialPosition`.

## Las causas (eran dos)

1. **Draft persistido viejo** — `formPersist.js` guarda el state en localStorage
   en cada cambio. Si abrías el form vía mapa, el draft viejo se restauraba y
   contaminaba mi seed de coords. El screenshot mostraba basura clara: una URL
   parcial de Google Sheets en OBSERVACIONES que NO venía de mi flujo.

2. **`handleStageChange` borraba el seed** — al cambiar de etapa, hacía
   `setStageAttrs({})` que limpiaba `ubicacion_real`. Las coords iniciales
   se perdían si tocabas otra etapa antes de E1.

## Los arreglos

Solo se cambia `src/components/CreatePostForm.jsx`:

1. **Detección `cameFromMap`** — si `initialPosition` viene, ignora el draft
   persistido. El usuario está creando algo nuevo, no continuando.

2. **`clearPersistedForm` automático** — al abrir desde mapa, limpia el draft
   para que futuros opens no se contaminen.

3. **`handleStageChange` preserva el seed** — al cambiar etapa, si las coords
   vinieron del mapa, las re-aplica. La ubicación es del poste, no de la etapa.

4. **Shape correcto de `ubicacion_real`** — incluye `source: 'manual'` para
   que el GPSField la reconozca como ubicación válida (sin esto el badge de
   "Ubicación registrada" no se renderizaba).

## Despliegue

```bash
cd ~/Downloads/field-coord-v2
cp src/components/CreatePostForm.jsx src/components/CreatePostForm.jsx.bak.preFix

# Reemplaza con el fix
cp /path/a/outputs/field-coord-v2/src/components/CreatePostForm.jsx src/components/CreatePostForm.jsx

# Probar local
npm run dev
```

## Limpieza adicional recomendada

Si tienes basura viejas en el draft persistido (la URL de Google Sheets), ábre
DevTools en el navegador, ve a **Application → Local Storage** y borra la
entrada `fcoord:form:createpost` (o similar). El próximo `+ Nuevo aquí` ya
limpia esto automáticamente, pero si has tocado el form en sesiones previas
sin guardar, conviene limpiarlo una vez a mano.

O por consola del browser:

```js
localStorage.removeItem('fcoord:form:createpost');
```

## Validación

1. Refresca `localhost:5173/`
2. Mapa → "+ Nuevo aquí" → click en cualquier punto
3. El form debe abrir con:
   - Sin basura en OBSERVACIONES (start clean)
   - Los inputs LATITUD/LONGITUD con valores REALES (no placeholders grises)
   - Un badge azul/morado que dice "✏️ Manual" debajo de los inputs
   - Dirección autogenerada con las mismas coords
4. Si tocas otra etapa y vuelves a E1, las coords siguen ahí
5. Guardar → no debe pedir confirm de "GPS inválido"

