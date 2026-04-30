#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright EPA Bienestar
# SPDX-License-Identifier: Apache-2.0
#
# Actualización del front en la VPS:
#   - hace git pull
#   - el repo trae el dist/ ya buildeado, así que no hace falta npm install
#   - recarga nginx
#
# Uso:
#   cd /opt/seguimiento && bash deploy/update.sh
set -euo pipefail

REPO_DIR="/opt/seguimiento"

if [[ "$(realpath "$(pwd)")" != "${REPO_DIR}" ]]; then
  cd "${REPO_DIR}"
fi

echo ">>> git pull"
git fetch origin
git reset --hard origin/main 2>/dev/null || git reset --hard origin/claude/integrate-medplum-backend-zKqdJ

if [[ ! -d "dist" ]]; then
  echo ""
  echo "ERROR: no hay carpeta dist/ commiteada en el repo."
  echo "Hacé 'npm install && npm run build' antes de pushear."
  exit 1
fi

echo ">>> Recargando nginx"
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "Despliegue completo. Verificá: https://seguimiento.epa-bienestar.com.ar"
