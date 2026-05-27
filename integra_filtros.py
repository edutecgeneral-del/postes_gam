#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, os, datetime
PATH = "src/App.jsx"
if not os.path.exists(PATH):
    print("No encuentro src/App.jsx. Corre desde la raiz del proyecto."); sys.exit(1)
src = open(PATH, encoding="utf-8").read()
orig = src
cambios = []

imp_anchor = "import { FilterBar } from './components/FilterBar.jsx';"
imp_new = "import { FilterBarCollapsible } from './components/FilterBarCollapsible.jsx';"
if imp_new in src:
    cambios.append("import: ya estaba")
elif imp_anchor in src:
    src = src.replace(imp_anchor, imp_anchor + "\n" + imp_new, 1)
    cambios.append("import: agregado")
else:
    print("No encontre el import de FilterBar. Abortando."); sys.exit(1)

old = '''                  <FilterBar
                    posts={posts}
                    {...filterCtx}
                    stageDefs={STAGE_DEFS}
                    userNames={userNames}
                    mode="map"
                    showVerified={false}
                    incidents={incidents}
                  />'''
new = '''                  <FilterBarCollapsible
                    posts={posts}
                    {...filterCtx}
                    stageDefs={STAGE_DEFS}
                    userNames={userNames}
                    mode="map"
                    showVerified={false}
                    incidents={incidents}
                  />'''
if "<FilterBarCollapsible" in src:
    cambios.append("mapa FilterBar: ya estaba")
elif old in src:
    src = src.replace(old, new, 1)
    cambios.append("mapa FilterBar: cambiado a colapsable")
else:
    print("No encontre el FilterBar del mapa exacto. Abortando."); sys.exit(1)

if src == orig:
    print("Nada que cambiar."); sys.exit(0)

stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bak = f"{PATH}.bak.preFiltrosColapsables-{stamp}"
open(bak, "w", encoding="utf-8").write(orig)
open(PATH, "w", encoding="utf-8").write(src)
print("Backup:", bak)
for c in cambios: print(" -", c)
print("OK")
