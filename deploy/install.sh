#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright EPA Bienestar
# SPDX-License-Identifier: Apache-2.0
#
# Instalación inicial de consultorio.epa-bienestar.com.ar en la VPS.
# Idempotente: se puede correr varias veces.
#
# Uso (como root):
#   git clone https://github.com/drdalessandro/seguimiento /opt/consultorio
#   cd /opt/consultorio
#   bash deploy/install.sh
set -euo pipefail

DOMAIN="consultorio.epa-bienestar.com.ar"
REPO_DIR="/home/consultorio"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

if [[ "$(realpath "$(pwd)")" != "${REPO_DIR}" ]]; then
  echo "Este script asume que el repo está clonado en ${REPO_DIR}."
  echo "Ubicación actual: $(pwd)"
  exit 1
fi

echo ">>> Instalando vhost de nginx"
install -m 0644 "${REPO_DIR}/deploy/nginx/${DOMAIN}" "${NGINX_AVAILABLE}"
ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

# Limpieza de un eventual vhost anterior que servía el subdominio viejo
LEGACY="consultorio.epa-bienestar.com.ar"
if [[ -e "/etc/nginx/sites-enabled/${LEGACY}" ]]; then
  echo ">>> Removiendo vhost viejo ${LEGACY} (si existía)"
  rm -f "/etc/nginx/sites-enabled/${LEGACY}"
fi

echo ">>> Validando configuración de nginx"
nginx -t

echo ">>> Obteniendo certificado TLS (si no existe)"
if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@epa-bienestar.com.ar
else
  echo "Certificado ya existe, se renueva con cron de certbot."
fi

echo ">>> Recargando nginx"
systemctl reload nginx

echo ""
echo "Listo. Próximo paso: 'bash deploy/update.sh' cada vez que quieras publicar cambios."
