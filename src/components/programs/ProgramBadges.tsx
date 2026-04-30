// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group } from '@mantine/core';
import type { Coding } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { extractProgramCodes, getProgram } from '../../programs';

interface ProgramBadgesProps {
  tags: Coding[] | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function ProgramBadges({ tags, size = 'sm' }: ProgramBadgesProps): JSX.Element | null {
  const codes = extractProgramCodes(tags);
  if (codes.length === 0) {
    return null;
  }
  return (
    <Group gap={4}>
      {codes.map((code) => {
        const program = getProgram(code);
        return (
          <Badge key={code} size={size} color={program?.color ?? 'gray'} variant="light">
            {program?.shortLabel ?? code}
          </Badge>
        );
      })}
    </Group>
  );
}
