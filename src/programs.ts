// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';

export const PROGRAM_TAG_SYSTEM = 'https://epa-bienestar.com.ar/programa';

export interface ProgramDefinition {
  code: string;
  display: string;
  shortLabel: string;
  url: string;
  color: string;
}

export const PROGRAMS: ProgramDefinition[] = [
  {
    code: 'mujer',
    display: 'Programa Mujer',
    shortLabel: 'Mujer',
    url: 'https://mujer.epa-bienestar.com.ar',
    color: 'pink',
  },
  {
    code: 'cardio',
    display: 'Programa Cardio',
    shortLabel: 'Cardio',
    url: 'https://cardio.epa-bienestar.com.ar',
    color: 'red',
  },
  {
    code: 'rhcv',
    display: 'Programa RHCV',
    shortLabel: 'RHCV',
    url: 'https://rhcv.epa-bienestar.com.ar',
    color: 'orange',
  },
  {
    code: 'sac',
    display: 'Residencias SAC',
    shortLabel: 'SAC',
    url: 'https://sac.epa-bienestar.com.ar',
    color: 'indigo',
  },
  {
    code: 'afacimera',
    display: 'AFACIMERA',
    shortLabel: 'AFACIMERA',
    url: 'https://afacimera.epa-bienestar.com.ar',
    color: 'teal',
  },
  {
    code: 'habitos',
    display: 'Programa Hábitos',
    shortLabel: 'Hábitos',
    url: 'https://habitos.epa-bienestar.com.ar',
    color: 'green',
  },
  {
    code: 'seguimiento',
    display: 'Consultorio Seguimiento',
    shortLabel: 'Seguimiento',
    url: 'https://seguimiento.epa-bienestar.com.ar',
    color: 'epa',
  },
];

const PROGRAM_BY_CODE = new Map(PROGRAMS.map((p) => [p.code, p]));

export function getProgram(code: string | undefined): ProgramDefinition | undefined {
  if (!code) return undefined;
  return PROGRAM_BY_CODE.get(code);
}

export function programCoding(code: string): Coding {
  const program = getProgram(code);
  return {
    system: PROGRAM_TAG_SYSTEM,
    code,
    display: program?.display ?? code,
  };
}

export function extractProgramCodes(tags: Coding[] | undefined): string[] {
  if (!tags) return [];
  return tags
    .filter((t) => t.system === PROGRAM_TAG_SYSTEM && !!t.code)
    .map((t) => t.code as string);
}
