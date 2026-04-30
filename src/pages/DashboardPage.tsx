// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconActivity, IconClipboardList, IconStethoscope, IconUser } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { PROGRAM_TAG_SYSTEM, PROGRAMS } from '../programs';

interface ProgramStats {
  code: string;
  patients: number;
  encounters: number;
  pendingOrders: number;
}

export function DashboardPage(): JSX.Element {
  const medplum = useMedplum();
  const [stats, setStats] = useState<ProgramStats[]>();
  const [globalStats, setGlobalStats] = useState<{ totalPatients: number; pendingTasks: number; pendingOrders: number }>();

  useEffect(() => {
    async function load(): Promise<void> {
      const programStats: ProgramStats[] = [];
      for (const p of PROGRAMS.filter((pg) => pg.code !== 'seguimiento')) {
        const tagFilter = `${PROGRAM_TAG_SYSTEM}|${p.code}`;
        const [patientBundle, encounterBundle, ordersBundle] = await Promise.all([
          medplum.search('Patient', { _tag: tagFilter, _summary: 'count' }),
          medplum.search('Encounter', { _tag: tagFilter, _summary: 'count' }),
          medplum.search('ServiceRequest', { _tag: tagFilter, status: 'active', _summary: 'count' }),
        ]);
        programStats.push({
          code: p.code,
          patients: patientBundle.total ?? 0,
          encounters: encounterBundle.total ?? 0,
          pendingOrders: ordersBundle.total ?? 0,
        });
      }
      const [allPatients, allTasks, allOrders] = await Promise.all([
        medplum.search('Patient', { _summary: 'count' }),
        medplum.search('Task', { code: 'ai-order-suggestion', status: 'requested', _summary: 'count' }),
        medplum.search('ServiceRequest', { status: 'active', _summary: 'count' }),
      ]);
      setStats(programStats);
      setGlobalStats({
        totalPatients: allPatients.total ?? 0,
        pendingTasks: allTasks.total ?? 0,
        pendingOrders: allOrders.total ?? 0,
      });
    }
    load().catch(console.error);
  }, [medplum]);

  return (
    <Stack p="md" gap="md">
      <Title order={2}>Resumen del consultorio</Title>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <KpiCard
          icon={<IconUser size={28} />}
          label="Pacientes totales"
          value={globalStats?.totalPatients ?? '—'}
          href="/Patient"
          color="epa"
        />
        <KpiCard
          icon={<IconClipboardList size={28} />}
          label="Pedidos activos"
          value={globalStats?.pendingOrders ?? '—'}
          href="/ServiceRequest?status=active"
          color="orange"
        />
        <KpiCard
          icon={<IconActivity size={28} />}
          label="Sugerencias IA pendientes"
          value={globalStats?.pendingTasks ?? '—'}
          href="/Task?code=ai-order-suggestion&status=requested"
          color="grape"
        />
      </SimpleGrid>

      <Title order={3} mt="md">
        Por programa
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {(stats ?? []).map((s) => {
          const p = PROGRAMS.find((pg) => pg.code === s.code);
          return (
            <Card key={s.code} withBorder shadow="xs">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Badge color={p?.color ?? 'gray'} variant="filled" size="lg">
                    {p?.display ?? s.code}
                  </Badge>
                </div>
                <IconStethoscope size={20} color="#0369A1" />
              </Group>
              <Stack gap={4} mt="md">
                <Text size="sm">
                  <strong>{s.patients}</strong> pacientes
                </Text>
                <Text size="sm">
                  <strong>{s.encounters}</strong> consultas
                </Text>
                <Text size="sm">
                  <strong>{s.pendingOrders}</strong> estudios pendientes
                </Text>
              </Stack>
              <Group gap="xs" mt="sm">
                <Anchor component={Link} to={`/Patient?_tag=${PROGRAM_TAG_SYSTEM}|${s.code}`} size="xs">
                  Ver pacientes
                </Anchor>
                {p?.url && (
                  <Anchor href={p.url} target="_blank" size="xs">
                    Abrir programa →
                  </Anchor>
                )}
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

interface KpiCardProps {
  icon: JSX.Element;
  label: string;
  value: number | string;
  href: string;
  color: string;
}

function KpiCard({ icon, label, value, href, color }: KpiCardProps): JSX.Element {
  return (
    <Card component={Link} to={href} withBorder shadow="xs" style={{ textDecoration: 'none' }}>
      <Group>
        <Badge color={color} variant="light" size="xl" circle>
          {icon}
        </Badge>
        <div>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="xl" fw={600}>
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  );
}
