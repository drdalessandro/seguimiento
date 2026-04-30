// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
//
// Bot: clinical-ai-interpret
// Trigger: Subscription a DiagnosticReport con presentedForm o conclusion
// Acción: de-identifica el reporte + contexto longitudinal del paciente, llama
//         Claude para una interpretación con flag de hallazgos críticos.
//         Output: Communication al practitioner solicitante (urgente si crítico)
//         + actualiza el conclusion del DiagnosticReport con el resumen IA.
import type { BotEvent, MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Communication, DiagnosticReport, Observation, Patient, Reference } from '@medplum/fhirtypes';
import { deidentifyPatient, newDeidentifyContext, sanitizeResource } from './deidentify';

interface ClaudeInterpretation {
  summary: string;
  findings: Array<{ description: string; severity: 'normal' | 'borderline' | 'abnormal' | 'critical' }>;
  recommendations: string[];
  criticalAlert: boolean;
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<DiagnosticReport>
): Promise<Communication | undefined> {
  const report = event.input;
  if (!report.subject?.reference) return undefined;

  const apiKey = event.secrets['ANTHROPIC_API_KEY']?.valueString;
  const hmacKey = event.secrets['DEIDENTIFY_HMAC_KEY']?.valueString;
  if (!apiKey || !hmacKey) {
    throw new Error('Missing Project Secret: ANTHROPIC_API_KEY o DEIDENTIFY_HMAC_KEY');
  }

  const ctx = newDeidentifyContext(hmacKey);
  const patient = await medplum.readReference(report.subject as Reference<Patient>);
  const dPatient = deidentifyPatient(ctx, patient);

  // Contexto: últimas 20 observaciones para comparar con resultado actual
  const recentObs = await medplum.searchResources('Observation', {
    patient: getReferenceString(patient),
    _count: '20',
    _sort: '-_lastUpdated',
  });
  const sanitizedReport = sanitizeResource(ctx, report);
  const sanitizedHistory = recentObs.map((o) => sanitizeObs(o));

  const prompt = buildInterpretPrompt(dPatient, sanitizedReport, sanitizedHistory);
  const interpretation = await callClaude(apiKey, prompt);
  if (!interpretation) return undefined;

  // Actualizamos el report con la conclusion enriquecida
  const conclusionText = `[Interpretación IA] ${interpretation.summary}\n\nHallazgos:\n${interpretation.findings
    .map((f) => `- ${f.severity.toUpperCase()}: ${f.description}`)
    .join('\n')}\n\nRecomendaciones:\n${interpretation.recommendations.map((r) => `- ${r}`).join('\n')}`;

  await medplum.updateResource({
    ...report,
    conclusion: report.conclusion ? `${report.conclusion}\n\n${conclusionText}` : conclusionText,
  });

  // Communication al practitioner solicitante. Urgente si crítico.
  // Filtramos sólo refs a Practitioner (Communication.recipient acepta tipos limitados).
  const performerRefs = (report.performer ?? []).filter(
    (r) => r.reference?.startsWith('Practitioner/') || r.reference?.startsWith('PractitionerRole/')
  );
  const comm: Communication = {
    resourceType: 'Communication',
    status: 'completed',
    priority: interpretation.criticalAlert ? 'urgent' : 'routine',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/communication-category',
            code: interpretation.criticalAlert ? 'alert' : 'notification',
            display: interpretation.criticalAlert ? 'Alerta clínica' : 'Notificación',
          },
        ],
      },
    ],
    subject: report.subject as Reference<Patient>,
    recipient: performerRefs.length > 0 ? performerRefs : undefined,
    sent: new Date().toISOString(),
    about: [{ reference: `DiagnosticReport/${report.id}` }],
    payload: [{ contentString: conclusionText }],
    meta: report.meta?.tag ? { tag: report.meta.tag } : undefined,
  };
  return medplum.createResource(comm);
}

function sanitizeObs(o: Observation): Record<string, unknown> {
  return {
    code: o.code?.coding?.[0]?.code,
    display: o.code?.coding?.[0]?.display,
    value: o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}` : o.valueString,
    when: o.effectiveDateTime,
  };
}

function buildInterpretPrompt(
  patient: { ageYears?: number; gender?: string; programs?: string[] },
  report: Record<string, unknown>,
  history: unknown[]
): string {
  return `Sos un asistente clínico que interpreta resultados de estudios complementarios.
Datos de-identificados, sin nombres ni identificadores.

Paciente:
- Edad: ${patient.ageYears ?? 'desconocida'}
- Género: ${patient.gender ?? 'desconocido'}
- Programas EPA: ${patient.programs?.join(', ') || 'ninguno'}

Reporte actual (de-identificado):
${JSON.stringify(report)}

Historial reciente (últimas 20 observaciones):
${JSON.stringify(history)}

Tarea: interpretá el reporte en contexto del historial. Sé conciso y clínicamente útil.
- summary: 2-3 frases de interpretación general
- findings: lista de hallazgos relevantes con severidad ("normal" | "borderline" | "abnormal" | "critical")
- recommendations: acciones sugeridas (control, derivación, repetir estudio, etc.)
- criticalAlert: true SOLO si hay un hallazgo que requiere acción urgente del médico (ej: troponina elevada, K+ > 6.5, hemoglobina < 7).

Respondé SOLO con JSON válido en este formato exacto:
{
  "summary": "...",
  "findings": [{"description": "...", "severity": "normal"}],
  "recommendations": ["..."],
  "criticalAlert": false
}`;
}

interface ClaudeMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callClaude(apiKey: string, prompt: string): Promise<ClaudeInterpretation | undefined> {
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
  const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]) as ClaudeInterpretation;
  } catch {
    return undefined;
  }
}
