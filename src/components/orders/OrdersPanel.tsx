// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString, Operator } from '@medplum/core';
import type { Encounter, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { IconFlask, IconPrinter, IconReportMedical, IconStethoscope, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { extractProgramCodes, getProgram } from '../../programs';
import { createOrderFromPanel } from './createOrder';
import { openOrderPrintWindow } from './orderPdf';
import { orderPanelsCatalog } from './order-panels';
import type { OrderPanel } from './order-panels';

interface OrdersPanelProps {
  encounter: Encounter;
}

export function OrdersPanel({ encounter }: OrdersPanelProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner | undefined;
  const patient = useResource(encounter.subject) as Patient | undefined;
  const [opened, handlers] = useDisclosure(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const programCodes = useMemo(() => extractProgramCodes(encounter.meta?.tag), [encounter.meta?.tag]);
  const primaryProgram = programCodes[0];

  const [orders, setOrders] = useState<ServiceRequest[]>();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = (): void => setRefreshKey((k) => k + 1);

  useEffect(() => {
    medplum
      .searchResources('ServiceRequest', {
        encounter: getReferenceString(encounter),
        _count: '50',
        _sort: '-_lastUpdated',
      })
      .then(setOrders)
      .catch(console.error);
  }, [medplum, encounter, refreshKey]);

  async function handleSubmit(): Promise<void> {
    if (!selectedPanelId || !patient || !profile) return;
    const panel = orderPanelsCatalog.panels.find((p) => p.id === selectedPanelId);
    if (!panel) return;
    setSubmitting(true);
    try {
      const created = await createOrderFromPanel({
        medplum,
        patient,
        encounter,
        practitioner: profile,
        panel,
        programCode: primaryProgram,
        clinicalNotes,
      });
      showNotification({
        color: 'green',
        title: 'Pedido creado',
        message: `${created.length} estudios solicitados (${panel.label})`,
      });
      handlers.close();
      setSelectedPanelId(null);
      setClinicalNotes('');
      refresh();
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(sr: ServiceRequest): Promise<void> {
    try {
      await medplum.updateResource({ ...sr, status: 'revoked' });
      refresh();
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }

  function handlePrint(group: GroupedOrders): void {
    if (!patient || !profile) return;
    openOrderPrintWindow({
      patient,
      practitioner: profile,
      serviceRequests: group.orders,
      panelLabel: group.label,
      clinicalNotes: group.orders.find((o) => o.note?.[0]?.text)?.note?.[0]?.text,
    });
  }

  if (!patient) return <Loader />;

  const groupedActive = groupByRequisition((orders ?? []).filter((o) => o.status === 'active'));
  const groupedDone = groupByRequisition((orders ?? []).filter((o) => o.status !== 'active'));

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between" align="center">
          <div>
            <Text fw={500}>Pedidos de esta consulta</Text>
            <Text size="xs" c="dimmed">
              Laboratorio e imágenes con códigos LOINC. La IA puede sugerir paneles desde la columna derecha.
            </Text>
          </div>
          <Group gap="xs">
            <Button leftSection={<IconFlask size={16} />} onClick={handlers.open}>
              Pedir panel
            </Button>
          </Group>
        </Group>
      </Card>

      {groupedActive.length === 0 && (
        <Alert color="gray" variant="light">
          Aún no hay pedidos activos.
        </Alert>
      )}

      {groupedActive.map((g) => (
        <OrderGroupCard key={g.requisition} group={g} onPrint={handlePrint} onCancel={handleCancel} />
      ))}

      {groupedDone.length > 0 && (
        <>
          <Divider label="Históricos" labelPosition="center" />
          {groupedDone.map((g) => (
            <OrderGroupCard key={g.requisition} group={g} onPrint={handlePrint} onCancel={async () => undefined} historic />
          ))}
        </>
      )}

      <Modal opened={opened} onClose={handlers.close} title="Solicitar panel de estudios" size="lg">
        <Stack>
          <Select
            label="Panel"
            placeholder="Elegí un panel curado"
            searchable
            data={orderPanelsCatalog.panels.map((p) => ({
              value: p.id,
              label: `${p.category === 'laboratory' ? '🧪' : '🩻'} ${p.label}`,
            }))}
            value={selectedPanelId}
            onChange={setSelectedPanelId}
          />
          {selectedPanelId && (
            <PanelPreview panel={orderPanelsCatalog.panels.find((p) => p.id === selectedPanelId)!} />
          )}
          <Textarea
            label="Datos clínicos relevantes"
            placeholder="Ej: paciente con HTA, controles iniciales del Programa Cardio"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.currentTarget.value)}
            minRows={3}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={handlers.close} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={!selectedPanelId}>
              Crear pedido
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function PanelPreview({ panel }: { panel: OrderPanel }): JSX.Element {
  return (
    <Card withBorder bg="gray.0">
      <Text size="sm" fw={500}>
        {panel.label}
      </Text>
      <Text size="xs" c="dimmed" mb="xs">
        {panel.description}
      </Text>
      <Stack gap={4}>
        {panel.items.map((it) => (
          <Text key={it.code} size="xs">
            <Badge size="xs" variant="light" color="epa" mr={6}>
              {it.code}
            </Badge>
            {it.display}
          </Text>
        ))}
      </Stack>
    </Card>
  );
}

interface GroupedOrders {
  requisition: string;
  label: string;
  category: 'laboratory' | 'imaging' | string;
  orders: ServiceRequest[];
  authoredOn?: string;
}

function groupByRequisition(orders: ServiceRequest[]): GroupedOrders[] {
  const map = new Map<string, GroupedOrders>();
  for (const sr of orders) {
    const key = sr.requisition?.value ?? sr.id ?? 'sin-id';
    const cat = sr.category?.[0]?.coding?.[0]?.code ?? 'order';
    const existing = map.get(key);
    if (existing) {
      existing.orders.push(sr);
    } else {
      map.set(key, {
        requisition: key,
        label: sr.code?.coding?.[0]?.display ?? 'Pedido',
        category: cat,
        orders: [sr],
        authoredOn: sr.authoredOn,
      });
    }
  }
  // Refinamos label si hay panel: usamos el primer code display como representativo
  return Array.from(map.values()).sort((a, b) => (b.authoredOn ?? '').localeCompare(a.authoredOn ?? ''));
}

interface OrderGroupCardProps {
  group: GroupedOrders;
  onPrint: (g: GroupedOrders) => void;
  onCancel: (sr: ServiceRequest) => Promise<void>;
  historic?: boolean;
}

function OrderGroupCard({ group, onPrint, onCancel, historic }: OrderGroupCardProps): JSX.Element {
  const isLab = group.category === 'laboratory';
  const tagCodes = extractProgramCodes(group.orders[0]?.meta?.tag);
  return (
    <Card withBorder shadow="xs">
      <Group justify="space-between" align="flex-start">
        <Group gap="xs">
          {isLab ? <IconFlask size={20} /> : <IconReportMedical size={20} />}
          <div>
            <Text fw={500}>{isLab ? 'Laboratorio' : 'Imágenes'}</Text>
            <Text size="xs" c="dimmed">
              {group.authoredOn ? new Date(group.authoredOn).toLocaleString('es-AR') : ''}
            </Text>
          </div>
          {tagCodes.map((c) => {
            const p = getProgram(c);
            return (
              <Badge key={c} color={p?.color ?? 'gray'} variant="light" size="sm">
                {p?.shortLabel ?? c}
              </Badge>
            );
          })}
        </Group>
        <Group gap="xs">
          <Tooltip label="Imprimir orden (PDF)">
            <ActionIcon variant="light" onClick={() => onPrint(group)}>
              <IconPrinter size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Divider my="sm" />
      <Stack gap={6}>
        {group.orders.map((sr) => {
          const code = sr.code?.coding?.[0];
          return (
            <Group key={sr.id} justify="space-between">
              <Group gap="xs">
                <Badge size="xs" variant="light" color="epa">
                  {code?.code}
                </Badge>
                <Text size="sm">{code?.display}</Text>
                {sr.status !== 'active' && (
                  <Badge size="xs" color="gray" variant="outline">
                    {sr.status}
                  </Badge>
                )}
              </Group>
              {!historic && sr.status === 'active' && (
                <Tooltip label="Anular">
                  <ActionIcon variant="subtle" color="red" onClick={() => onCancel(sr)}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          );
        })}
      </Stack>
      {!isLab && !historic && (
        <Alert mt="sm" color="blue" variant="light" icon={<IconStethoscope />}>
          Cuando llegue el resultado del estudio, subilo desde la pestaña Estudios del paciente para vincularlo a este pedido.
        </Alert>
      )}
    </Card>
  );
}
