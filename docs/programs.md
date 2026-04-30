# Tags por programa — contrato compartido

EPA Bienestar agrupa 6 programas satélite que escriben directo en el backend FHIR central (`api.epa-bienestar.com.ar`). Para que `seguimiento.epa-bienestar.com.ar` pueda mostrar la historia unificada y filtrar por programa, **cada recurso creado por un programa debe llevar un `meta.tag` estandarizado**.

## System

```
https://epa-bienestar.com.ar/programa
```

## Códigos canónicos

| Código | Display | URL del programa |
|---|---|---|
| `mujer` | Programa Mujer | https://mujer.epa-bienestar.com.ar |
| `cardio` | Programa Cardio | https://cardio.epa-bienestar.com.ar |
| `rhcv` | Programa RHCV | https://rhcv.epa-bienestar.com.ar |
| `sac` | Residencias SAC | https://sac.epa-bienestar.com.ar |
| `afacimera` | Estudiantes / AFACIMERA | https://afacimera.epa-bienestar.com.ar |
| `habitos` | Programa Hábitos | https://habitos.epa-bienestar.com.ar |
| `seguimiento` | Consultorio Seguimiento (este front) | https://seguimiento.epa-bienestar.com.ar |

## Cómo lo aplican los programas

Cada programa, antes de hacer `medplum.createResource(...)` o `medplum.upsertResource(...)`, debe inyectar el tag:

```ts
const programa: Coding = {
  system: 'https://epa-bienestar.com.ar/programa',
  code: 'cardio',
  display: 'Programa Cardio',
};

await medplum.createResource({
  ...resource,
  meta: { ...(resource.meta ?? {}), tag: [...(resource.meta?.tag ?? []), programa] },
});
```

Aplica a todos los recursos clínicos creados por el programa: `Patient`, `Observation`, `Condition`, `QuestionnaireResponse`, `Encounter`, `ServiceRequest`, `DiagnosticReport`, `Communication`, `Task`, etc.

Un mismo recurso **puede tener varios tags** (ej. una paciente del Programa Mujer también vista en RHCV).

## Búsqueda por programa

Medplum indexa `meta.tag` automáticamente:

```
GET /Patient?_tag=https://epa-bienestar.com.ar/programa|cardio
GET /Observation?patient=Patient/123&_tag=https://epa-bienestar.com.ar/programa|mujer
```

Cualquier recurso sin tag se considera "creado en seguimiento" (default).

## AccessPolicy

Las plantillas de `AccessPolicy` en `data/core/access-policies.json` filtran por este tag para limitar a profesionales por programa (ej. un médico del Programa Mujer no ve datos de Hábitos a menos que tenga acceso multi-programa).

## Migración de datos existentes

Si los programas ya están escribiendo sin tag, se puede backfillear con un Bot único de migración o vía SQL en el Postgres del backend. La política de seguimiento es: **los datos sin tag siguen visibles para roles admin**, pero no aparecen en las vistas filtradas por programa.
