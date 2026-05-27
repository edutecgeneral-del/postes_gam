#!/usr/bin/env bash
# deploy/deploy.sh — Build y publicación al VPS
#
# Uso:
#   1. Crea un archivo deploy/deploy.env con:
#        SSH_HOST=123.45.67.89       # IP o dominio del VPS
#        SSH_USER=root                # o tu usuario con acceso a /var/www
#        SSH_PORT=22                  # Hostinger por default es 22
#        REMOTE_PATH=/var/www/field-coord-v2
#
#   2. Asegúrate de tener tu llave SSH agregada al VPS (ssh-copy-id SSH_USER@SSH_HOST)
#
#   3. Ejecuta:
#        npm run deploy
#
# Lo que hace el script:
#   - Compila la app con vite build → dist/
#   - Sincroniza dist/ al VPS vía rsync (borra archivos obsoletos en remoto)
#   - Recarga Nginx en el servidor
#
# Requisitos locales: node, npm, rsync, ssh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Cargar variables de deploy
if [[ ! -f "deploy/deploy.env" ]]; then
  echo "❌ Falta deploy/deploy.env. Copia deploy/deploy.env.example y ajústalo."
  exit 1
fi
# shellcheck source=/dev/null
source deploy/deploy.env

: "${SSH_HOST:?SSH_HOST no definido en deploy.env}"
: "${SSH_USER:?SSH_USER no definido en deploy.env}"
: "${REMOTE_PATH:?REMOTE_PATH no definido en deploy.env}"
: "${SSH_PORT:=22}"
: "${APP_ROUTE:=/CI1215V2}"
: "${NGINX_CONF:=/etc/nginx/sites-available/gam-multi}"

echo "▶ Compilando con vite build…"
npm run build

# Escribir versión para verificar deploy
VERSION=$(date '+%Y%m%d-%H%M%S')
echo "$VERSION" > dist/version.txt
echo "   Versión: $VERSION"

echo "▶ Creando directorio remoto si no existe…"
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "mkdir -p ${REMOTE_PATH}/dist"

echo "▶ Sincronizando dist/ → ${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/dist/"
rsync -avz --delete \
  -e "ssh -p $SSH_PORT" \
  ./dist/ \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/dist/"

echo "▶ Configurando security headers en Nginx…"
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
  export APP_ROUTE='$APP_ROUTE'
  export NGINX_CONF='$NGINX_CONF'
  python3 - <<'PY'
import os
from pathlib import Path

conf_path = Path(os.environ['NGINX_CONF'])
route = os.environ['APP_ROUTE'].rstrip('/') or '/CI1215V2'
begin = '        # BEGIN ci1215v2-security-headers'
end = '        # END ci1215v2-security-headers'
block = f'''{begin}
        add_header X-Content-Type-Options \"nosniff\" always;
        add_header X-Frame-Options \"SAMEORIGIN\" always;
        add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;
        add_header Permissions-Policy \"camera=(self), microphone=(), geolocation=(self)\" always;
        add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;
        add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org; frame-ancestors 'self'\" always;
{end}'''

text = conf_path.read_text()

text = text.replace(f'location {route} {{', f'location ^~ {route} {{')
text = text.replace(f'location {route}/ {{', f'location ^~ {route}/ {{')

if begin in text and end in text:
    start = text.index(begin)
    stop = text.index(end, start) + len(end)
    text = text[:start] + block + text[stop:]
else:
    location_candidates = [
        f'location ^~ {route}',
        f'location ^~ {route}/',
        f'location {route}',
        f'location {route}/',
    ]
    loc = -1
    location_token = ''
    for candidate in location_candidates:
        loc = text.find(candidate)
        if loc != -1:
            location_token = candidate
            break
    if loc == -1:
        raise SystemExit(f'No encontré location para {route} en {conf_path}')
    location_end = text.find('\\n    }', loc)
    if location_end == -1:
        raise SystemExit(f'No pude delimitar el bloque {location_token}')
    try_pos = text.find('try_files', loc, location_end)
    insert_pos = location_end
    if try_pos != -1:
        try_line_end = text.find('\\n', try_pos)
        if try_line_end != -1 and try_line_end < location_end:
            insert_pos = try_line_end
    text = text[:insert_pos + 1] + block + '\\n' + text[insert_pos + 1:]

conf_path.write_text(text)
PY
" 2>/dev/null || echo "  ⚠ Security headers: actualiza manualmente"

echo "▶ Recargando Nginx en el servidor…"
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "nginx -t && systemctl reload nginx" || {
  echo "⚠ No se pudo recargar Nginx automáticamente (¿permisos?). Ejecuta manualmente:"
  echo "   ssh $SSH_USER@$SSH_HOST"
  echo "   sudo nginx -t && sudo systemctl reload nginx"
}

echo "✅ Deploy completo."
