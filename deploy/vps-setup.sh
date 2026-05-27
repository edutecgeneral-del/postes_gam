#!/usr/bin/env bash
# deploy/vps-setup.sh — Configuración INICIAL del VPS (ejecutar UNA VEZ)
#
# Uso:
#   1. SSH al VPS:           ssh root@TU-IP
#   2. Sube este archivo:    scp deploy/vps-setup.sh root@TU-IP:~
#   3. Ejecuta en el VPS:    bash vps-setup.sh tu-dominio.com
#
# Qué hace:
#   - Actualiza el sistema
#   - Instala Nginx + Certbot
#   - Configura firewall básico (ufw)
#   - Crea la carpeta /var/www/field-coord
#   - Configura Nginx con el archivo del repo
#   - Solicita certificado SSL con Certbot

set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Uso: bash vps-setup.sh <tu-dominio.com>"
  echo "Si aún no tienes dominio, pasa solo la IP del servidor y ajusta después."
  exit 1
fi

echo "▶ Actualizando sistema…"
apt-get update -qq
apt-get upgrade -y -qq

echo "▶ Instalando paquetes base…"
apt-get install -y -qq nginx rsync ufw certbot python3-certbot-nginx

echo "▶ Configurando firewall (ufw)…"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "▶ Creando directorio del sitio…"
mkdir -p /var/www/field-coord/dist
chown -R www-data:www-data /var/www/field-coord

echo "▶ Configurando Nginx…"
# Copiar la config (ajusta el dominio)
cat > /etc/nginx/sites-available/field-coord <<NGINX_CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    root /var/www/field-coord/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    access_log /var/log/nginx/field-coord.access.log;
    error_log  /var/log/nginx/field-coord.error.log;
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/field-coord /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "▶ Solicitando certificado SSL con Certbot…"
if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "✅ SSL configurado correctamente"
else
  echo "⚠ Certbot falló. Puede que el DNS aún no propague. Ejecuta manualmente después:"
  echo "   certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VPS listo."
echo ""
echo "Siguientes pasos desde tu máquina local:"
echo "  1. Edita deploy/deploy.env con tu IP/dominio"
echo "  2. ssh-copy-id root@$DOMAIN"
echo "  3. npm run deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
