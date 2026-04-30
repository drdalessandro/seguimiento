// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { AppShell, ErrorBoundary, Loading, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconCalendarEvent,
  IconClipboardHeart,
  IconClipboardList,
  IconHomeHeart,
  IconReportMedical,
  IconStethoscope,
  IconUser,
} from '@tabler/icons-react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Route, Routes } from 'react-router';
import { DashboardPage } from './pages/DashboardPage';
import { EncounterPage } from './pages/EncounterPage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { EpaLogo } from './components/EpaLogo';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<EpaLogo size={28} />}
      menus={[
        {
          title: 'Inicio',
          links: [
            { icon: <IconHomeHeart />, label: 'Resumen', href: '/' },
            { icon: <IconUser />, label: 'Pacientes', href: '/Patient' },
          ],
        },
        {
          title: 'Consultas',
          links: [
            { icon: <IconClipboardList />, label: 'Todas las consultas', href: '/Encounter' },
            {
              icon: <IconClipboardHeart />,
              label: 'Mis consultas',
              href: `/Encounter?participant=Practitioner/${profile?.id}`,
            },
          ],
        },
        {
          title: 'Estudios y órdenes',
          links: [
            { icon: <IconStethoscope />, label: 'Pedidos pendientes', href: '/ServiceRequest?status=active' },
            { icon: <IconReportMedical />, label: 'Resultados', href: '/DiagnosticReport' },
          ],
        },
        {
          title: 'Agenda',
          links: [{ icon: <IconCalendarEvent />, label: 'Próximos turnos', href: '/Appointment' }],
        },
      ]}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={profile ? <DashboardPage /> : <LandingPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/Patient/:id">
              <Route index element={<PatientPage />} />
              <Route path="*" element={<PatientPage />} />
            </Route>
            <Route path="/Encounter/:id">
              <Route index element={<EncounterPage />} />
              <Route path="*" element={<EncounterPage />} />
            </Route>
            <Route path="/:resourceType/:id">
              <Route index element={<ResourcePage />} />
              <Route path="*" element={<ResourcePage />} />
            </Route>
            <Route path="/:resourceType" element={<SearchPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
