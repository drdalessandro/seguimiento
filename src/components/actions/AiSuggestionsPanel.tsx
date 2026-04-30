// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
//
// Panel lateral en EncounterActions que muestra las sugerencias IA pendientes
// (Tasks con code "ai-order-suggestion") y deja al médico aceptar para crear
// las ServiceRequests reales o descartar.
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Encounter, Patient, Practitioner, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { IconCheck, IconRobot, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { extractProgramCodes } from '../../programs';
import { createOrderFromPanel } from '../orders/createOrder';
import { panelById } from '../orders/order-panels';

interface AiSuggestionsPanelProps {
  encounter: Encounter;
}

interface ParsedSuggestion {
  panelId: string;
  reason: string;
  priority: 'urgent' | 'routine' | 'optional';
}

export function AiSuggestionsPanel({ encounter }: AiSuggestionsPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner | undefined;
  const patient = useResource(encounter.subject) as Patient | undefined;
  const [tasks, setTasks] = useState<Task[]>();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = (): void => setRefreshKey((k) => k + 1);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    medplum
      .searchResources('Task', {
        encounter: getReferenceString(encounter),
        code: 'ai-order-suggestion',
        status: 'requested',
        _count: '5',
      })
      .then(setTasks)
      .catch(console.error);
  }, [medplum, encounter, refreshKey]);

  if (!tasks) return <Loader size="xs" />;
  if (tasks.length === 0) {
    return (
      <Card withBorder bg="gray.0">
        <Group gap="xs">
          <IconRobot size={16} />
          <Text size="xs" c="dimmed">
            La IA analiza la consulta y sugiere estudios cuando se carga la nota.
          </Text>
        </Group>
      </Card>
    );
  }

  async function handleAccept(task: Task, suggestion: ParsedSuggestion): Promise<void> {
    if (!patient || !profile) return;
    const panel = panelById(suggestion.panelId);
    if (!panel) {
      showNotification({ color: 'red', title: 'Error', message: 'Panel sugerido no existe en el catálogo' });
      return;
    }
    setWorking(`${task.id}:${suggestion.panelId}`);
    try {
      await createOrderFromPanel({
        medplum,
        patient,
        encounter,
        practitioner: profile,
        panel,
        programCode: extractProgramCodes(encounter.meta?.tag)[0],
        clinicalNotes: `Sugerido por IA — ${suggestion.reason}`,
      });
      // Marcar suggestion individual: agregamos un output al Task con accepted=true
      const remaining = parseSuggestions(task).filter((s) => s.panelId !== suggestion.panelId);
      if (remaining.length === 0) {
        await medplum.updateResource({ ...task, status: 'completed' });
      } else {
        await medplum.updateResource({
          ...task,
          note: [{ text: JSON.stringify(remaining, null, 2) }],
        });
      }
      showNotification({ color: 'green', title: 'Pedido creado', message: panel.label });
      refresh();
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setWorking(null);
    }
  }

  async function handleReject(task: Task, suggestion: ParsedSuggestion): Promise<void> {
    setWorking(`${task.id}:${suggestion.panelId}`);
    try {
      const remaining = parseSuggestions(task).filter((s) => s.panelId !== suggestion.panelId);
      if (remaining.length === 0) {
        await medplum.updateResource({ ...task, status: 'rejected' });
      } else {
        await medplum.updateResource({
          ...task,
          note: [{ text: JSON.stringify(remaining, null, 2) }],
        });
      }
      refresh();
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setWorking(null);
    }
  }

  return (
    <Stack gap="xs">
      <Group gap={6}>
        <IconRobot size={18} />
        <Title order={5}>Sugerencias IA</Title>
      </Group>
      {tasks.map((task) => {
        const suggestions = parseSuggestions(task);
        if (suggestions.length === 0) return null;
        return suggestions.map((s) => {
          const panel = panelById(s.panelId);
          const key = `${task.id}:${s.panelId}`;
          return (
            <Alert
              key={key}
              color={s.priority === 'urgent' ? 'red' : s.priority === 'optional' ? 'gray' : 'epa'}
              variant="light"
              p="xs"
            >
              <Group justify="space-between" align="flex-start" gap="xs">
                <div style={{ flex: 1 }}>
                  <Group gap={4}>
                    <Text fw={500} size="sm">
                      {panel?.label ?? s.panelId}
                    </Text>
                    <Badge size="xs" color={s.priority === 'urgent' ? 'red' : 'gray'}>
                      {s.priority}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mt={2}>
                    {s.reason}
                  </Text>
                </div>
                <Group gap={4}>
                  <Tooltip label="Aceptar y crear pedido">
                    <Button
                      size="compact-xs"
                      color="green"
                      variant="light"
                      loading={working === key}
                      onClick={() => handleAccept(task, s)}
                      disabled={!panel}
                    >
                      <IconCheck size={12} />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Descartar">
                    <Button
                      size="compact-xs"
                      color="gray"
                      variant="subtle"
                      loading={working === key}
                      onClick={() => handleReject(task, s)}
                    >
                      <IconX size={12} />
                    </Button>
                  </Tooltip>
                </Group>
              </Group>
            </Alert>
          );
        });
      })}
    </Stack>
  );
}

function parseSuggestions(task: Task): ParsedSuggestion[] {
  const text = task.note?.[0]?.text ?? '[]';
  try {
    const parsed = JSON.parse(text) as ParsedSuggestion[];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s.panelId === 'string') : [];
  } catch {
    return [];
  }
}
