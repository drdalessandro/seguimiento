// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import type { Encounter } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { AiSuggestionsPanel } from './actions/AiSuggestionsPanel';
import { EditType } from './actions/EditType';

interface EncounterActionsProps {
  encounter: Encounter;
  onChange: (encounter: Encounter) => void;
}

export function EncounterActions(props: EncounterActionsProps): JSX.Element {
  return (
    <Stack p="xs" m="xs">
      <Title>Acciones de la consulta</Title>
      <EditType encounter={props.encounter} onChange={props.onChange} />
      <AiSuggestionsPanel encounter={props.encounter} />
    </Stack>
  );
}
