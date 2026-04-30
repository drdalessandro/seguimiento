// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import type {
  Attachment,
  DiagnosticReport,
  DocumentReference,
  Patient,
  Practitioner,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconFileUpload, IconReportMedical } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { extractProgramCodes, getProgram } from '../../programs';

interface PatientOrdersProps {
  patient: Patient;
}

export function PatientOrders({ patient }: PatientOrdersProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner | undefined;
  const [orders, setOrders] = useState<ServiceRequest[]>();
  const [reports, setReports] = useState<DiagnosticReport[]>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const ref = getReferenceString(patient);
    medplum
      .searchResources('ServiceRequest', { patient: ref, _count: '100', _sort: '-_lastUpdated' })
      .then(setOrders)
      .catch(console.error);
    medplum
      .searchResources('DiagnosticReport', { patient: ref, _count: '100', _sort: '-_lastUpdated' })
      .then(setReports)
      .catch(console.error);
  }, [medplum, patient, refreshKey]);

  const [uploadFor, setUploadFor] = useState<ServiceRequest | null>(null);
  const [opened, handlers] = useDisclosure(false);

  function openUpload(sr: ServiceRequest): void {
    setUploadFor(sr);
    handlers.open();
  }

  async function handleUploaded(): Promise<void> {
    handlers.close();
    setUploadFor(null);
    setRefreshKey((k) => k + 1);
  }

  if (!orders || !reports) {
    return <Loader />;
  }

  const reportsByRequest = new Map<string, DiagnosticReport[]>();
  for (const r of reports) {
    for (const ref of r.basedOn ?? []) {
      if (ref.reference) {
        const list = reportsByRequest.get(ref.reference) ?? [];
        list.push(r);
        reportsByRequest.set(ref.reference, list);
      }
    }
  }

  return (
    <Stack>
      <Card withBorder>
        <Title order={4}>Pedidos del paciente</Title>
        {orders.length === 0 ? (
          <Alert mt="sm" variant="light">
            Sin pedidos cargados.
          </Alert>
        ) : (
          <Table mt="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Estudio</Table.Th>
                <Table.Th>Categoría</Table.Th>
                <Table.Th>Programa</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Resultado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {orders.map((sr) => {
                const code = sr.code?.coding?.[0];
                const cat = sr.category?.[0]?.coding?.[0]?.code;
                const tags = extractProgramCodes(sr.meta?.tag);
                const linked = reportsByRequest.get(`ServiceRequest/${sr.id}`) ?? [];
                return (
                  <Table.Tr key={sr.id}>
                    <Table.Td>
                      <Text size="sm">
                        <Badge variant="light" color="epa" size="xs" mr={6}>
                          {code?.code}
                        </Badge>
                        {code?.display}
                      </Text>
                    </Table.Td>
                    <Table.Td>{cat === 'laboratory' ? 'Laboratorio' : cat === 'imaging' ? 'Imágenes' : '-'}</Table.Td>
                    <Table.Td>
                      {tags.map((t) => {
                        const p = getProgram(t);
                        return (
                          <Badge key={t} color={p?.color ?? 'gray'} variant="light" size="xs">
                            {p?.shortLabel ?? t}
                          </Badge>
                        );
                      })}
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={sr.status === 'active' ? 'orange' : 'gray'}>
                        {sr.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{sr.authoredOn ? new Date(sr.authoredOn).toLocaleDateString('es-AR') : '-'}</Table.Td>
                    <Table.Td>
                      {linked.length > 0 ? (
                        <Badge color="green" variant="light" leftSection={<IconReportMedical size={12} />}>
                          {linked.length} reporte(s)
                        </Badge>
                      ) : (
                        <Button size="compact-xs" variant="light" leftSection={<IconFileUpload size={12} />} onClick={() => openUpload(sr)}>
                          Cargar
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Modal opened={opened} onClose={handlers.close} title="Cargar resultado" size="lg">
        {uploadFor && profile && (
          <UploadResult
            medplum={medplum}
            patient={patient}
            practitioner={profile}
            serviceRequest={uploadFor}
            onDone={handleUploaded}
          />
        )}
      </Modal>
    </Stack>
  );
}

interface UploadResultProps {
  medplum: ReturnType<typeof useMedplum>;
  patient: Patient;
  practitioner: Practitioner;
  serviceRequest: ServiceRequest;
  onDone: () => void;
}

function UploadResult({ medplum, patient, practitioner, serviceRequest, onDone }: UploadResultProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [status, setStatus] = useState<DiagnosticReport['status']>('final');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!file) return;
    setSubmitting(true);
    try {
      const binary = await medplum.createBinary({
        data: file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      const attachment: Attachment = {
        contentType: binary.contentType,
        url: binary.url,
        title: file.name,
      };
      const docRef: DocumentReference = await medplum.createResource({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: createReference(patient),
        author: [createReference(practitioner)],
        date: new Date().toISOString(),
        content: [{ attachment }],
        meta: serviceRequest.meta,
      });
      const report: DiagnosticReport = await medplum.createResource({
        resourceType: 'DiagnosticReport',
        status,
        code: serviceRequest.code ?? { coding: [{ display: 'Resultado' }] },
        subject: serviceRequest.subject,
        basedOn: [{ reference: `ServiceRequest/${serviceRequest.id}` }],
        encounter: serviceRequest.encounter,
        effectiveDateTime: new Date().toISOString(),
        issued: new Date().toISOString(),
        performer: [createReference(practitioner)],
        conclusion: conclusion || undefined,
        presentedForm: [attachment],
        result: undefined,
        meta: serviceRequest.meta,
      });
      // Marcamos la ServiceRequest como completed
      await medplum.updateResource({ ...serviceRequest, status: 'completed' });
      showNotification({
        color: 'green',
        title: 'Resultado cargado',
        message: `DiagnosticReport ${report.id} y DocumentReference ${docRef.id}`,
      });
      onDone();
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const code = serviceRequest.code?.coding?.[0];

  return (
    <Stack>
      <Card withBorder bg="gray.0">
        <Text size="sm">
          <strong>{code?.code}</strong> {code?.display}
        </Text>
      </Card>
      <FileInput
        label="Archivo de resultado (PDF, imagen)"
        placeholder="Seleccionar archivo"
        value={file}
        onChange={setFile}
        accept="application/pdf,image/*"
        leftSection={<IconFileUpload size={16} />}
      />
      <Select
        label="Estado"
        data={[
          { value: 'preliminary', label: 'Preliminar' },
          { value: 'final', label: 'Final' },
          { value: 'amended', label: 'Modificado' },
        ]}
        value={status}
        onChange={(v) => v && setStatus(v as DiagnosticReport['status'])}
      />
      <Textarea
        label="Conclusión / interpretación clínica"
        placeholder="Hallazgos relevantes y recomendaciones"
        value={conclusion}
        onChange={(e) => setConclusion(e.currentTarget.value)}
        minRows={3}
      />
      <Group justify="flex-end">
        <Button onClick={handleSubmit} loading={submitting} disabled={!file}>
          Subir resultado
        </Button>
      </Group>
    </Stack>
  );
}
