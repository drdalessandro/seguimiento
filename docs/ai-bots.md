# Bots IA — clinical-ai-suggest & clinical-ai-interpret

Dos Bots de Medplum que llaman a la **API de Claude (Anthropic)** para asistir al médico en la consulta. **Todos los datos se de-identifican antes de salir del backend** (HMAC-SHA256 sobre identificadores, fechas convertidas a relativas, sin nombre/DNI/teléfono/dirección).

## Project Secrets requeridos

En `app.epa-bienestar.com.ar` → Project → Secrets:

| Secret | Valor | Para |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Llamadas a Claude API |
| `DEIDENTIFY_HMAC_KEY` | string aleatorio largo (32+ chars) | Pseudonimización determinística |

Generá la HMAC key con:

```bash
openssl rand -hex 32
```

## Bot 1: `clinical-ai-suggest`

- **Trigger**: Subscription a `Encounter?status=in-progress`
- **Entrada**: el Encounter recién creado/actualizado
- **Salida**: un `Task` con `code=ai-order-suggestion` linkeado al Encounter, conteniendo en `note[0].text` un JSON `[{ panelId, reason, priority }]`. La UI lo muestra en `AiSuggestionsPanel` (columna derecha del Encounter) y el médico acepta o descarta cada sugerencia.

Datos enviados a Claude (todos de-identificados):
- Edad calculada (años), género, programas EPA del paciente
- Encounter (sin subject ni participant)
- Últimas 20 Observations (códigos LOINC, valores, fechas relativas)
- Conditions activas + condiciones del Encounter
- Catálogo curado de paneles disponibles (filtrado por programa del paciente)

Modelo: `claude-sonnet-4-6`. Prompt en `src/bots/core/clinical-ai-suggest.ts`.

## Bot 2: `clinical-ai-interpret`

- **Trigger**: Subscription a `DiagnosticReport?status=final`
- **Entrada**: el reporte recién finalizado
- **Salida**:
  1. Update del `DiagnosticReport.conclusion` con resumen + hallazgos + recomendaciones
  2. Una `Communication` al practitioner solicitante (con `priority=urgent` si la IA flagea hallazgos críticos)

Datos enviados a Claude:
- Edad/género/programas (de-identificado)
- Reporte sin sujeto identificable
- Últimas 20 Observations del paciente para contexto longitudinal

## Deploy de los Bots

```bash
# 1. Build local
npm install
npm run build:bots

# Esto compila src/bots/**/*.ts a dist/bots/core/*.js (CommonJS, target es2020)

# 2. Subir el código compilado vía Medplum CLI o via UI
#    (en app.epa-bienestar.com.ar → Bot → "Editor" → pegar el .js)
#    Mismo proceso para clinical-ai-suggest.js y clinical-ai-interpret.js
```

El script `src/scripts/deploy-bots.ts` (provisto por el demo Medplum) lo automatiza si tenés un `medplum.config.json` configurado.

## Verificación post-deploy

1. Crear un Encounter de prueba con `status=in-progress`, sumar una `ClinicalImpression` y guardar.
2. Esperar 5–10 segundos. Debería aparecer un `Task` con code `ai-order-suggestion`.
3. Abrir el Encounter en seguimiento → columna derecha "Sugerencias IA" muestra cada panel sugerido con botón **✓ aceptar** y **✗ descartar**.
4. Aceptar uno → se crean los `ServiceRequest` reales con todos los códigos LOINC del panel.

## Auditoría / cumplimiento

- **Ley 25.326 (Argentina)**: los datos enviados a Claude no contienen nombre, DNI, dirección ni fechas exactas. Los identificadores van pseudonimizados con HMAC.
- **Auditabilidad**: cada llamada IA queda registrada como `Task` o `Communication` en FHIR, con timestamp, autor (el Bot) y resultado completo. Es revisable por cualquier admin desde `/Task?code=ai-order-suggestion`.
- **Decisión final**: la IA **nunca crea ServiceRequests directamente**. El médico siempre debe aceptar.
- **Reversibilidad**: el HMAC key es la misma entre runs, así que si en el futuro queremos reidentificar para depurar, podemos hacerlo desde el backend con acceso al secret.

## Roadmap

- v1 (actual): sugerencia + interpretación.
- v2: red de banderas críticas (umbrales fijos sin IA — ej. K+ > 6.5 → alerta inmediata).
- v3: feedback loop: cuando el médico descarta una sugerencia repetidamente, se loggea y se ajusta el prompt.
