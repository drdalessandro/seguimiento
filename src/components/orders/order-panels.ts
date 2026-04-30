// SPDX-FileCopyrightText: Copyright EPA Bienestar
// SPDX-License-Identifier: Apache-2.0
import panelsJson from '../../../data/core/order-panels.json';

export interface OrderPanelItem {
  system: string;
  code: string;
  display: string;
}

export interface OrderPanel {
  id: string;
  category: 'laboratory' | 'imaging';
  label: string;
  description: string;
  indicaciones?: string[];
  programs?: string[];
  items: OrderPanelItem[];
}

interface OrderPanelsCatalog {
  version: string;
  panels: OrderPanel[];
}

export const orderPanelsCatalog = panelsJson as OrderPanelsCatalog;

export function panelById(id: string): OrderPanel | undefined {
  return orderPanelsCatalog.panels.find((p) => p.id === id);
}

export function panelsByCategory(category: OrderPanel['category']): OrderPanel[] {
  return orderPanelsCatalog.panels.filter((p) => p.category === category);
}

export function panelsForProgram(program: string | undefined): OrderPanel[] {
  if (!program) return orderPanelsCatalog.panels;
  return orderPanelsCatalog.panels.filter((p) => !p.programs || p.programs.includes(program));
}
