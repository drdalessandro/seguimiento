// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
//
// De-identificación determinística (HMAC-SHA256) para datos enviados a Claude.
// Cumple con Ley 25.326: el LLM no recibe nombre, DNI, dirección ni fechas exactas.
// La pseudonimización es reversible (mantenemos un mapa por bot run).
import * as crypto from 'crypto';
import type { Patient, Practitioner, Reference, Resource } from '@medplum/fhirtypes';

export interface DeidentifiedPatient {
  id: string;
  pseudoId: string;
  ageYears?: number;
  gender?: string;
  programs?: string[];
}

export interface DeidentifyContext {
  hmacKey: string;
  // Mapa pseudo→real para reidentificar al guardar la respuesta
  reverseMap: Map<string, string>;
}

export function newDeidentifyContext(hmacKey: string): DeidentifyContext {
  return { hmacKey, reverseMap: new Map() };
}

function hmac(ctx: DeidentifyContext, value: string): string {
  return crypto.createHmac('sha256', ctx.hmacKey).update(value).digest('hex').slice(0, 16);
}

export function pseudoRef(ctx: DeidentifyContext, ref: Reference | undefined): string | undefined {
  if (!ref?.reference) return undefined;
  const pseudo = `pat_${hmac(ctx, ref.reference)}`;
  ctx.reverseMap.set(pseudo, ref.reference);
  return pseudo;
}

export function deidentifyPatient(ctx: DeidentifyContext, patient: Patient): DeidentifiedPatient {
  const pseudoId = `pat_${hmac(ctx, `Patient/${patient.id}`)}`;
  ctx.reverseMap.set(pseudoId, `Patient/${patient.id}`);

  let ageYears: number | undefined;
  if (patient.birthDate) {
    const birth = new Date(patient.birthDate);
    const now = new Date();
    ageYears = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
      ageYears -= 1;
    }
  }

  return {
    id: patient.id as string,
    pseudoId,
    ageYears,
    gender: patient.gender,
    programs: patient.meta?.tag
      ?.filter((t) => t.system === 'https://epa-bienestar.com.ar/programa')
      .map((t) => t.code as string),
  };
}

/**
 * Devuelve un objeto "sanitizado" sin campos PII conocidos.
 * Conserva valor clínico (códigos, valores, unidades, fecha relativa).
 */
export function sanitizeResource(ctx: DeidentifyContext, r: Resource): Record<string, unknown> {
  const cleaned = JSON.parse(JSON.stringify(r));

  // Recorrer y limpiar PII conocidas
  removeKeys(cleaned, [
    'name',
    'telecom',
    'address',
    'photo',
    'contact',
    'identifier',
    'communication',
    'maritalStatus',
    'preferred',
    'qualification',
  ]);

  // Reemplazar fechas absolutas por relativas (días desde "hoy") en campos comunes
  for (const dateField of ['effectiveDateTime', 'authoredOn', 'issued', 'recordedDate', 'onsetDateTime']) {
    if (typeof cleaned[dateField] === 'string') {
      cleaned[dateField] = relativeDateLabel(cleaned[dateField]);
    }
  }
  if (cleaned.period) {
    if (typeof cleaned.period.start === 'string') cleaned.period.start = relativeDateLabel(cleaned.period.start);
    if (typeof cleaned.period.end === 'string') cleaned.period.end = relativeDateLabel(cleaned.period.end);
  }

  // Pseudonimizar referencias
  if (cleaned.subject) cleaned.subject = { reference: pseudoRef(ctx, cleaned.subject as Reference) };
  if (cleaned.patient) cleaned.patient = { reference: pseudoRef(ctx, cleaned.patient as Reference) };

  // Limpiar metadata sensible
  if (cleaned.meta) {
    delete cleaned.meta.lastUpdated;
    delete cleaned.meta.author;
    delete cleaned.meta.versionId;
    delete cleaned.meta.source;
  }

  return cleaned;
}

function removeKeys(obj: unknown, keys: string[]): void {
  if (Array.isArray(obj)) {
    obj.forEach((item) => removeKeys(item, keys));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      delete (obj as Record<string, unknown>)[k];
    }
    for (const v of Object.values(obj)) {
      removeKeys(v, keys);
    }
  }
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
    return 'unknown_date';
  }
}

/**
 * Información del médico sin PII (rol, especialidades, no nombre/matrícula).
 */
export function deidentifyPractitioner(_ctx: DeidentifyContext, p: Practitioner): { roleCodes: string[] } {
  return {
    roleCodes:
      p.qualification?.flatMap((q) => q.code?.coding?.map((c) => c.code).filter((c): c is string => !!c) ?? []) ?? [],
  };
}
