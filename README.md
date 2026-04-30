<h1 align="center">Seguimiento — EPA Bienestar</h1>
<p align="center">Plataforma clínica unificada con historia longitudinal, órdenes de estudios y soporte de IA, integrada al backend Medplum self-hosted en <a href="https://api.epa-bienestar.com.ar">api.epa-bienestar.com.ar</a>.</p>

URL pública: **https://seguimiento.epa-bienestar.com.ar**

---

## Qué hace

- **Historia longitudinal unificada** de los 6 programas EPA (Mujer, Cardio, RHCV, SAC, AFACIMERA, Hábitos), agregando lo que cada programa escribe en el backend FHIR central.
- **Pedidos de estudios complementarios**: catálogo curado de paneles con códigos LOINC (laboratorio + imágenes), generación de PDF imprimible, carga y vinculación de resultados como `DiagnosticReport`.
- **Asistencia por IA** vía Bots de Medplum + Claude API:
  - sugerencia de paneles de estudios según el cuadro clínico
  - interpretación automática de resultados con detección de hallazgos críticos
- **De-identificación previa** de todos los datos enviados a Claude (HMAC sobre identificadores, fechas relativas, sin nombre/DNI/dirección) — Ley 25.326.
- **Multi-tenant lógico**: un único Project Medplum, recursos taggeados por programa con `meta.tag` (`https://epa-bienestar.com.ar/programa|<código>`).

## Stack

- React 19 + Vite + Mantine 8
- Medplum 5 (cliente FHIR, componentes, Bots)
- Claude Sonnet 4.6 vía Anthropic API (desde los Bots)
- Despliegue: build estático servido por Nginx en la misma VPS que el backend

## Estructura

```
src/
  App.tsx                         layout principal y rutas
  programs.ts                     definición de los 6 programas + helper de tags
  bots/core/
    clinical-ai-suggest.ts        Bot: sugerencia de estudios via Claude
    clinical-ai-interpret.ts      Bot: interpretación de DiagnosticReport
    deidentify.ts                 utilitarios HMAC para anonimizar antes de enviar a Claude
  components/
    EpaLogo.tsx                   logo SVG inline (sin assets externos)
    orders/                       OrdersPanel, PatientOrders, catálogo, PDF
    programs/                     badges + resumen de programas del paciente
    actions/AiSuggestionsPanel    UI para aceptar/descartar sugerencias IA
  pages/
    DashboardPage.tsx             home con KPIs y vistas por programa
    EncounterPage / PatientPage   chart clínico
data/
  core/
    order-panels.json             catálogo curado de paneles (LOINC)
    access-policies.json          AccessPolicy ejemplo (multi-programa, cardio, mujer)
    ai-bots.json                  bundle de Bots y Subscriptions IA
deploy/
  nginx/                          vhost para seguimiento.epa-bienestar.com.ar
  install.sh, update.sh           scripts de deploy a la VPS
docs/
  programs.md                     contrato de tags entre programas
  ai-bots.md                      operación de los Bots IA
```

## Configuración

`.env.defaults` (commiteado, valores no secretos):

```
MEDPLUM_BASE_URL=https://api.epa-bienestar.com.ar/
MEDPLUM_CLIENT_ID=babb532b-3c00-404f-9564-6c3ab6f27511   # Seguimiento
GOOGLE_CLIENT_ID=472653584585-r9q1rl7junfi6nb2s78ajccv5n2aj6ie.apps.googleusercontent.com
```

Project Secrets en `app.epa-bienestar.com.ar` (para los Bots):

| Secret | Para |
|---|---|
| `ANTHROPIC_API_KEY` | Llamadas a Claude API |
| `DEIDENTIFY_HMAC_KEY` | Pseudonimización (`openssl rand -hex 32`) |

## Desarrollo local

```bash
npm install
npm run dev      # localhost:3000
```

## Build + deploy a la VPS

```bash
# en local
npm install
npm run build
git add dist/
git commit -m "build: nuevo dist"
git push origin claude/integrate-medplum-backend-zKqdJ

# en la VPS
cd /opt/seguimiento
bash deploy/update.sh
```

Detalles completos en [`deploy/README.md`](./deploy/README.md).

## Tests

```bash
npm test
```

## Licencia

Apache 2.0. Basado en el ejemplo `medplum-chart-demo` de Medplum.
