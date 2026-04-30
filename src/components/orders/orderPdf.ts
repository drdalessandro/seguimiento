// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { getDisplayString } from '@medplum/core';
import type { Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';

interface BuildPdfInput {
  patient: Patient;
  practitioner: Practitioner;
  serviceRequests: ServiceRequest[];
  panelLabel: string;
  clinicalNotes?: string;
}

/**
 * Genera un PDF imprimible de la orden usando la API de impresión nativa del browser.
 * Devuelve un Blob (application/pdf) listo para descargar o adjuntar.
 *
 * Implementación deliberadamente simple para no agregar dependencias pesadas:
 * - construye un HTML formateado
 * - lo abre en una ventana nueva con window.print()
 *
 * Para PDF binario adjuntable a DocumentReference, usar el Bot serverside con pdfmake.
 */
export function buildOrderPrintHtml(input: BuildPdfInput): string {
  const today = new Date().toLocaleDateString('es-AR');
  const patientName = getDisplayString(input.patient);
  const dni = input.patient.identifier?.find((id) => id.system?.includes('dni'))?.value ?? '-';
  const dob = input.patient.birthDate ?? '-';
  const practName = getDisplayString(input.practitioner);
  const matricula = input.practitioner.identifier?.find((id) => id.system?.includes('matricula'))?.value ?? '-';

  const items = input.serviceRequests
    .map((sr) => {
      const code = sr.code?.coding?.[0];
      return `<li><strong>${code?.code ?? ''}</strong> — ${code?.display ?? '(sin descripción)'}</li>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Orden — ${patientName}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; color: #111; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0369A1; padding-bottom: 12px; }
  h1 { color: #0369A1; margin: 0; font-size: 22px; }
  h2 { font-size: 16px; margin-top: 24px; }
  .meta { font-size: 13px; color: #555; line-height: 1.6; }
  ul { line-height: 1.7; }
  .signature { margin-top: 80px; border-top: 1px solid #999; padding-top: 6px; width: 320px; font-size: 12px; color: #555; }
  .footer { margin-top: 40px; font-size: 11px; color: #888; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>EPA Bienestar — Orden de ${input.panelLabel}</h1>
      <div class="meta">Fecha: ${today}</div>
    </div>
  </header>

  <h2>Paciente</h2>
  <div class="meta">
    <div>${patientName}</div>
    <div>DNI: ${dni}</div>
    <div>Fecha de nacimiento: ${dob}</div>
  </div>

  <h2>Estudios solicitados</h2>
  <ul>${items}</ul>

  ${input.clinicalNotes ? `<h2>Datos clínicos</h2><p>${input.clinicalNotes}</p>` : ''}

  <div class="signature">
    ${practName}<br/>
    Matrícula: ${matricula}
  </div>

  <div class="footer">
    Generado por seguimiento.epa-bienestar.com.ar — los códigos LOINC corresponden al estándar internacional.
  </div>
</body>
</html>`;
}

export function openOrderPrintWindow(input: BuildPdfInput): void {
  const html = buildOrderPrintHtml(input);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.addEventListener('load', () => {
    w.print();
  });
}
