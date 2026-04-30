// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, List, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { Link } from 'react-router';

export function LandingPage(): JSX.Element {
  return (
    <Document width={620}>
      <Stack align="center" gap="md">
        <Title order={1} fz={32}>
          Seguimiento EPA Bienestar
        </Title>
        <Text ta="center" c="dimmed">
          Plataforma clínica para colegas médicos: historia clínica longitudinal, pedidos de
          laboratorio e imágenes, e interpretación asistida por IA, integrada con todos los
          programas de{' '}
          <Anchor href="https://www.epa-bienestar.com.ar" target="_blank">
            epa-bienestar.com.ar
          </Anchor>
          .
        </Text>
        <List size="sm" c="dimmed" withPadding>
          <List.Item>Historia unificada de los 6 programas (Mujer, Cardio, RHCV, SAC, AFACIMERA, Hábitos)</List.Item>
          <List.Item>Pedidos de estudios complementarios con catálogo LOINC</List.Item>
          <List.Item>Sugerencia de paneles diagnósticos por IA clínica</List.Item>
          <List.Item>Interpretación automática de resultados</List.Item>
        </List>
        <Button component={Link} to="/signin" size="lg" radius="xl" mt="sm">
          Ingresar
        </Button>
      </Stack>
    </Document>
  );
}
