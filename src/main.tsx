// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { getConfig } from './config';

const medplum = new MedplumClient({
  onUnauthenticated: () => (window.location.href = '/'),
  baseUrl: getConfig().baseUrl,
  clientId: getConfig().clientId,
});

// Paleta EPA Bienestar (cardio-celeste sobre blanco)
const theme = createTheme({
  primaryColor: 'epa',
  colors: {
    epa: [
      '#E0F4FB',
      '#B8E3F4',
      '#86CEEB',
      '#4FB6DD',
      '#26A0D1',
      '#0EA5E9',
      '#0284C7',
      '#0369A1',
      '#075985',
      '#0C4A6E',
    ],
  },
  defaultRadius: 'md',
  headings: {
    sizes: {
      h1: { fontSize: '1.25rem', fontWeight: '600', lineHeight: '2.0' },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.125rem',
  },
});

const container = document.getElementById('root') as HTMLDivElement;
const root = createRoot(container);
root.render(
  <StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme}>
          <Notifications />
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </StrictMode>
);
