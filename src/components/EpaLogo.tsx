// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

interface EpaLogoProps {
  size?: number;
}

export function EpaLogo({ size = 32 }: EpaLogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="EPA Bienestar"
    >
      <defs>
        <linearGradient id="epa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#epa-grad)" />
      <path
        d="M14 33h8l4-9 6 18 4-12 3 6h11"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
