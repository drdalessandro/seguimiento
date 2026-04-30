// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
//
// Bot: clinical-ai-suggest
// Trigger: Subscription a Encounter (status=in-progress + nota cargada)
// Acción: lee historial reciente del paciente, lo de-identifica, llama Claude API
//         con el catálogo curado de paneles (data/core/order-panels.json) y
//         crea un Task "sugerencia IA pendiente de revisión médica" linkeado al
//         Encounter. Nunca crea ServiceRequests autom: el médico decide.
//
// Project Secrets requeridos en Medplum:
//   - ANTHROPIC_API_KEY
//   - DEIDENTIFY_HMAC_KEY
import type { BotEvent, MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Communication,
  Condition,
  Encounter,
  Observation,
  Patient,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { deidentifyPatient, newDeidentifyContext, sanitizeResource } from './deidentify';
import orderPanelsJson from '../../../data/core/order-panels.json';

interface Panel {
  id: string;
  category: 'laboratory' | 'imaging';
  label: string;
  description: string;
  programs?: string[];
}

interface ClaudeSuggestion {
  panelId: string;
  reason: string;
  priority: 'urgent' | 'routine' | 'optional';
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<Task | undefined> {
  const encounter = event.input;
  if (!encounter.subject?.reference) return undefined;

  const apiKey = event.secrets['ANTHROPIC_API_KEY']?.valueString;
  const hmacKey = event.secrets['DEIDENTIFY_HMAC_KEY']?.valueString;
  if (!apiKey || !hmacKey) {
    throw new Error('Missing Project Secret: ANTHROPIC_API_KEY o DEIDENTIFY_HMAC_KEY');
  }

  const ctx = newDeidentifyContext(hmacKey);
  const patient = await medplum.readReference(encounter.subject as Reference<Patient>);
  const dPatient = deidentifyPatient(ctx, patient);

  // Contexto longitudinal: últimas 30 observaciones, problemas activos, condiciones del encuentro
  const observations = await medplum.searchResources('Observation', {
    patient: getReferenceString(patient),
    _count: '30',
    _sort: '-_lastUpdated',
  });
  const conditions = await medplum.searchResources('Condition', {
    patient: getReferenceString(patient),
    'clinical-status': 'active',
    _count: '30',
  });
  const encounterConditions = await medplum.searchResources('Condition', {
    encounter: getReferenceString(encounter),
  });

  const sanitizedObs = observations.slice(0, 20).map((o) => extractObservation(ctx, o));
  const sanitizedCond = [...conditions, ...encounterConditions]
    .slice(0, 30)
    .map((c) => extractCondition(ctx, c));
  const sanitizedEncounter = sanitizeResource(ctx, encounter);

  // Filtrar paneles según el programa del paciente (si lo tiene)
  const allPanels = (orderPanelsJson as { panels: Panel[] }).panels;
  const programs = dPatient.programs ?? [];
  const availablePanels = allPanels
    .filter((p) => !p.programs || p.programs.some((pg) => programs.includes(pg)) || programs.length === 0)
    .map(({ id, category, label, description }) => ({ id, category, label, description }));

  const prompt = buildPrompt(dPatient, sanitizedEncounter, sanitizedObs, sanitizedCond, availablePanels);

  const suggestions = await callClaude(apiKey, prompt);
  if (suggestions.length === 0) return undefined;

  // Construir Task "pendiente de revisión médica"
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'proposal',
    priority: suggestions.some((s) => s.priority === 'urgent') ? 'urgent' : 'routine',
    code: {
      coding: [
        {
          system: 'https://epa-bienestar.com.ar/task-code',
          code: 'ai-order-suggestion',
          display: 'Sugerencia IA de estudios complementarios',
        },
      ],
    },
    description: 'Revisar sugerencias de paneles de estudios generadas por Claude.',
    for: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    requester: encounter.serviceProvider,
    authoredOn: new Date().toISOString(),
    note: [
      {
        text: JSON.stringify(suggestions, null, 2),
      },
    ],
    input: suggestions.map((s) => ({
      type: {
        coding: [
          { system: 'https://epa-bienestar.com.ar/ai-suggestion', code: s.panelId, display: s.priority },
        ],
      },
      valueString: s.reason,
    })),
    meta: encounter.meta?.tag ? { tag: encounter.meta.tag } : undefined,
  };

  const created = await medplum.createResource(task);

  // También enviamos una Communication informativa (audit trail visible en UI)
  const comm: Communication = {
    resourceType: 'Communication',
    status: 'completed',
    category: [
      {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/communication-category', code: 'notification' },
        ],
      },
    ],
    subject: encounter.subject,
    encounter: { reference: getReferenceString(encounter) },
    sent: new Date().toISOString(),
    payload: [
      {
        contentString: `IA generó ${suggestions.length} sugerencia(s) de estudios. Revisar en la pestaña de pedidos.`,
      },
    ],
    about: [{ reference: `Task/${created.id}` }],
    meta: encounter.meta?.tag ? { tag: encounter.meta.tag } : undefined,
  };
  await medplum.createResource(comm);

  return created;
}

function extractObservation(_ctx: ReturnType<typeof newDeidentifyContext>, o: Observation): Record<string, unknown> {
  return {
    code: o.code?.coding?.[0]?.code,
    display: o.code?.coding?.[0]?.display,
    value: o.valueQuantity
      ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}`
      : o.valueString ?? o.valueCodeableConcept?.coding?.[0]?.display,
    when: typeof o.effectiveDateTime === 'string' ? relativeDateLabel(o.effectiveDateTime) : undefined,
    components: o.component?.map((c) => ({
      code: c.code?.coding?.[0]?.code,
      value: c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit ?? ''}` : undefined,
    })),
  };
}

function extractCondition(_ctx: ReturnType<typeof newDeidentifyContext>, c: Condition): Record<string, unknown> {
  return {
    code: c.code?.coding?.[0]?.code,
    display: c.code?.coding?.[0]?.display,
    clinicalStatus: c.clinicalStatus?.coding?.[0]?.code,
    severity: c.severity?.coding?.[0]?.display,
    onset: typeof c.onsetDateTime === 'string' ? relativeDateLabel(c.onsetDateTime) : undefined,
  };
}

function relativeDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays > 0) return `${diffDays}d_ago`;
    return `${Math.abs(diffDays)}d_future`;
  } catch {
    return 'unknown';
  }
}

function buildPrompt(
  patient: { ageYears?: number; gender?: string; programs?: string[] },
  encounter: Record<string, unknown>,
  observations: unknown[],
  conditions: unknown[],
  availablePanels: Panel[]
): string {
  return `Sos un asistente clínico que sugiere paneles de estudios complementarios.
Trabajás SOLO con datos de-identificados. NO inventás identidad ni datos faltantes.

Datos del paciente:
- Edad: ${patient.ageYears ?? 'desconocida'}
- Género: ${patient.gender ?? 'desconocido'}
- Programas EPA: ${patient.programs?.join(', ') || 'ninguno'}

Encuentro actual (de-identificado):
${JSON.stringify(encounter)}

Observaciones recientes (de-identificadas, fechas relativas):
${JSON.stringify(observations)}

Condiciones activas:
${JSON.stringify(conditions)}

Catálogo de paneles disponibles (debés elegir SÓLO de esta lista):
${JSON.stringify(availablePanels)}

Tarea: identificar paneles relevantes para el cuadro clínico.
- Devolvé entre 0 y 5 paneles. Si no hay ninguno claramente indicado, devolvé [].
- Para cada uno, justificá brevemente con razones clínicas.
- Asigná prioridad: "urgent" (sospecha de cuadro grave), "routine" (control habitual), "optional" (complemento).

Respondé SOLO con un JSON válido en este formato exacto, sin texto adicional:
[{"panelId": "panel-rcv-basico", "reason": "...", "priority": "routine"}]`;
}

interface ClaudeMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callClaude(apiKey: string, prompt: string): Promise<ClaudeSuggestion[]> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }
  const json = (await res.json()) as ClaudeMessageResponse;
  const text = json.content?.find((c) => c.type === 'text')?.text ?? '[]';
  // El modelo puede envolver en ```json … ``` — extraer JSON pelado
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as ClaudeSuggestion[];
    return parsed.filter((s) => typeof s.panelId === 'string');
  } catch {
    return [];
  }
}
