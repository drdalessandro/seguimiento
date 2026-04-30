# Deploy — seguimiento.epa-bienestar.com.ar

Front estático servido por Nginx desde la **misma VPS** donde corre `api.epa-bienestar.com.ar` (Medplum self-hosted).

## Primera instalación

En la VPS, como root:

```bash
git clone https://github.com/drdalessandro/seguimiento /opt/seguimiento
cd /opt/seguimiento
git checkout claude/integrate-medplum-backend-zKqdJ
bash deploy/install.sh
```

Esto instala el vhost en `/etc/nginx/sites-available/`, pide el certificado a Let's Encrypt y recarga Nginx.

Configuración DNS necesaria antes de correr `install.sh`:

```
seguimiento.epa-bienestar.com.ar  A  <IP de la VPS>
```

## Actualizar el front

```bash
cd /opt/seguimiento
bash deploy/update.sh
```

`update.sh` hace `git pull` y recarga Nginx. **El build (`dist/`) viaja commiteado en el repo**, no hace falta correr `npm install` en la VPS.

## Rebuild local (cuando hay cambios de código)

En tu máquina, antes de pushear:

```bash
npm install
npm run build
git add dist/
git commit -m "build: rebuild para deploy"
git push
```

## Configuración

`.env.defaults` ya apunta a:

| Variable | Valor |
|---|---|
| `MEDPLUM_BASE_URL` | `https://api.epa-bienestar.com.ar/` |
| `MEDPLUM_CLIENT_ID` | `babb532b-3c00-404f-9564-6c3ab6f27511` (Seguimiento) |
| `GOOGLE_CLIENT_ID` | `472653584585-r9q1rl7…` (Seguimiento) |

Si querés cambiar algo localmente sin tocar el archivo committed, copiá a `.env`. Vite también lee `.env` y le da prioridad sobre `.env.defaults`.

## Project Secrets en Medplum (para los Bots)

Configurar en `app.epa-bienestar.com.ar` → **Project → Secrets**:

| Secret | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Bots `clinical-ai-suggest` y `clinical-ai-interpret` |
| `DEIDENTIFY_HMAC_KEY` | Pseudonimización determinística (cualquier string aleatorio largo) |

## Headers de seguridad

El vhost agrega CSP, HSTS, X-Frame-Options, etc. Si en algún momento se necesita embeber otro origen (p.ej. un PDF viewer externo), hay que actualizar `connect-src`/`frame-src` en `nginx/seguimiento.epa-bienestar.com.ar.conf`.
