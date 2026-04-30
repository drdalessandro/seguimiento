// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { MedplumClient } from '@medplum/core';
import type { Bundle, BundleEntry, CodeableConcept, Encounter, Patient, Practitioner, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { PROGRAM_TAG_SYSTEM } from '../../programs';
import type { OrderPanel } from './order-panels';

interface CreateOrderInput {
  medplum: MedplumClient;
  patient: Patient;
  encounter?: Encounter;
  practitioner: Practitioner;
  panel: OrderPanel;
  programCode?: string;
  clinicalNotes?: string;
}

/**
 * Una orden = un panel = N ServiceRequest (uno por estudio dentro del panel)
 * Todos comparten requisition (groupIdentifier) para que la UI pueda mostrarlos juntos.
 */
export async function createOrderFromPanel(input: CreateOrderInput): Promise<ServiceRequest[]> {
  const { medplum, patient, encounter, practitioner, panel, programCode, clinicalNotes } = input;

  const subject: Reference<Patient> = { reference: getReferenceString(patient) };
  const requester: Reference<Practitioner> = { reference: getReferenceString(practitioner) };
  const encounterRef: Reference<Encounter> | undefined = encounter
    ? { reference: getReferenceString(encounter) }
    : undefined;

  const requisitionValue = `panel-${panel.id}-${Date.now()}`;
  const tags = programCode
    ? [{ system: PROGRAM_TAG_SYSTEM, code: programCode, display: programCode }]
    : undefined;

  const category: CodeableConcept = panel.category === 'laboratory'
    ? {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratorio' },
        ],
      }
    : {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'imaging', display: 'Imágenes' },
        ],
      };

  const entries: BundleEntry[] = panel.items.map((item, idx) => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject,
      requester,
      encounter: encounterRef,
      authoredOn: new Date().toISOString(),
      category: [category],
      code: { coding: [{ system: item.system, code: item.code, display: item.display }] },
      requisition: { value: requisitionValue },
      note: clinicalNotes ? [{ text: clinicalNotes }] : undefined,
      meta: tags ? { tag: tags } : undefined,
    };
    return {
      fullUrl: `urn:uuid:sr-${idx}`,
      request: { method: 'POST', url: 'ServiceRequest' },
      resource: sr,
    };
  });

  const bundle: Bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
  const response = await medplum.executeBatch(bundle);
  return (response.entry ?? [])
    .map((e) => e.resource as ServiceRequest)
    .filter((r) => !!r && r.resourceType === 'ServiceRequest');
}

export async function createCustomOrder(
  medplum: MedplumClient,
  patient: Patient,
  practitioner: Practitioner,
  encounter: Encounter | undefined,
  category: 'laboratory' | 'imaging',
  code: { system: string; code: string; display: string },
  clinicalNotes?: string,
  programCode?: string
): Promise<ServiceRequest> {
  const tags = programCode
    ? [{ system: PROGRAM_TAG_SYSTEM, code: programCode, display: programCode }]
    : undefined;

  const sr: ServiceRequest = {
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: getReferenceString(patient) },
    requester: { reference: getReferenceString(practitioner) },
    encounter: encounter ? { reference: getReferenceString(encounter) } : undefined,
    authoredOn: new Date().toISOString(),
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: category,
            display: category === 'laboratory' ? 'Laboratorio' : 'Imágenes',
          },
        ],
      },
    ],
    code: { coding: [code] },
    note: clinicalNotes ? [{ text: clinicalNotes }] : undefined,
    meta: tags ? { tag: tags } : undefined,
  };
  return medplum.createResource(sr);
}
