// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { extractProgramCodes, getProgram, PROGRAMS } from '../../programs';

interface PatientProgramsProps {
  patient: Patient;
}

interface ProgramSummary {
  code: string;
  resourceCount: number;
  lastUpdated?: string;
}

export function PatientPrograms({ patient }: PatientProgramsProps): JSX.Element {
  const medplum = useMedplum();
  const [summaries, setSummaries] = useState<ProgramSummary[]>();

  const patientPrograms = useMemo(() => extractProgramCodes(patient.meta?.tag), [patient.meta?.tag]);

  useEffect(() => {
    async function load(): Promise<void> {
      const ref = getReferenceString(patient);
      const resourceTypes = ['Observation', 'Condition', 'Encounter', 'ServiceRequest', 'DiagnosticReport'] as const;
      const resources: Resource[] = [];
      for (const rt of resourceTypes) {
        const list = await medplum.searchResources(rt, { patient: ref, _count: '50' });
        resources.push(...list);
      }
      const counts = new Map<string, ProgramSummary>();
      for (const r of resources) {
        for (const c of extractProgramCodes(r.meta?.tag)) {
          const existing = counts.get(c) ?? { code: c, resourceCount: 0 };
          existing.resourceCount += 1;
          if (r.meta?.lastUpdated && (!existing.lastUpdated || r.meta.lastUpdated > existing.lastUpdated)) {
            existing.lastUpdated = r.meta.lastUpdated;
          }
          counts.set(c, existing);
        }
      }
      setSummaries(Array.from(counts.values()).sort((a, b) => b.resourceCount - a.resourceCount));
    }
    load().catch(console.error);
  }, [medplum, patient]);

  if (!summaries) {
    return <Loading />;
  }

  return (
    <Stack>
      <Card withBorder>
        <Title order={4}>Programas en los que participa</Title>
        <Group gap="xs" mt="sm">
          {patientPrograms.length === 0 && (
            <Text c="dimmed" size="sm">
              Este paciente no tiene tags de programa explícitos.
            </Text>
          )}
          {patientPrograms.map((code) => {
            const p = getProgram(code);
            return (
              <Badge key={code} color={p?.color ?? 'gray'} size="lg" variant="light">
                {p?.display ?? code}
              </Badge>
            );
          })}
        </Group>
      </Card>

      <Card withBorder>
        <Title order={4}>Actividad por programa (últimos recursos clínicos)</Title>
        <Table mt="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Programa</Table.Th>
              <Table.Th>Recursos</Table.Th>
              <Table.Th>Última actualización</Table.Th>
              <Table.Th>Enlace</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {summaries.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" size="sm">
                    Sin actividad de programas registrada para este paciente.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {summaries.map((s) => {
              const p = getProgram(s.code);
              return (
                <Table.Tr key={s.code}>
                  <Table.Td>
                    <Badge color={p?.color ?? 'gray'} variant="light">
                      {p?.display ?? s.code}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{s.resourceCount}</Table.Td>
                  <Table.Td>{s.lastUpdated ? new Date(s.lastUpdated).toLocaleString('es-AR') : '-'}</Table.Td>
                  <Table.Td>
                    {p?.url && (
                      <Anchor href={p.url} target="_blank" rel="noreferrer" size="sm">
                        Abrir programa
                      </Anchor>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder>
        <Title order={4}>Acceso rápido</Title>
        <Group gap="xs" mt="sm">
          {PROGRAMS.filter((p) => p.code !== 'seguimiento').map((p) => (
            <Anchor key={p.code} href={p.url} target="_blank" rel="noreferrer" size="sm">
              <Badge color={p.color} variant="outline">
                {p.shortLabel}
              </Badge>
            </Anchor>
          ))}
        </Group>
      </Card>
    </Stack>
  );
}
