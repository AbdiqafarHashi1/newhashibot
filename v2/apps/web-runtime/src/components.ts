import React from 'react';
import type { V2PlatformApiClient } from './api-client.js';

export type UiAction = { label: string; action: string; payload?: Record<string, unknown> };
export type Field = { name: string; label: string; type?: string; value?: string };
export type FormModel = { id: string; title: string; fields: Field[]; submitLabel: string; submit: (api: V2PlatformApiClient, values: Record<string, unknown>) => Promise<unknown> };

const toneClass = (tone = 'zinc') => `tone-${tone}`;

export function StatusBadge({ label, tone = 'zinc' }: { label: string; tone?: string }) { return React.createElement('span', { className: `hb-badge ${toneClass(tone)}` }, label); }
export function ButtonLink({ label, href = '#', variant = 'secondary' }: { label: string; href?: string; variant?: 'primary'|'secondary'|'danger'|'ghost' }) { return React.createElement('a', { className: `hb-button hb-button-${variant}`, href }, label); }
export function Card({ title, children, actions = [], eyebrow }: { title: string; children?: React.ReactNode; actions?: UiAction[]; eyebrow?: string }) {
  return React.createElement('section', { className: 'hb-card' }, eyebrow ? React.createElement('p', { className: 'hb-eyebrow' }, eyebrow) : null, React.createElement('h3', null, title), children ? React.createElement('div', { className: 'hb-card-body' }, children) : null, actions.length ? React.createElement('div', { className: 'hb-actions' }, actions.map(a => React.createElement('button', { key: a.action, className: 'hb-button hb-button-secondary', 'data-action': a.action }, a.label))) : null);
}
export function MetricCard({ label, value, tone = 'blue', helper }: { label: string; value: string; tone?: string; helper?: string }) { return React.createElement('section', { className: `hb-metric ${toneClass(tone)}` }, React.createElement('span', null, label), React.createElement('strong', null, value), helper ? React.createElement('small', null, helper) : null); }
export function DataTable({ columns, rows, emptyMessage = 'No records yet' }: { columns: string[]; rows: Record<string, unknown>[]; emptyMessage?: string }) {
  return React.createElement('div', { className: 'hb-table-wrap' }, React.createElement('table', { className: 'hb-table' }, React.createElement('thead', null, React.createElement('tr', null, columns.map(c => React.createElement('th', { key: c }, c)))), React.createElement('tbody', null, rows.length ? rows.map((row, i) => React.createElement('tr', { key: i }, columns.map(c => React.createElement('td', { key: c }, String(row[c] ?? row[c.toLowerCase()] ?? '—'))))) : React.createElement('tr', null, React.createElement('td', { colSpan: columns.length }, React.createElement('div', { className: 'hb-empty-inline' }, emptyMessage))))));
}
export function RuntimeForm({ model }: { model: FormModel }) {
  return React.createElement('form', { className: 'hb-form', id: model.id, 'data-platform-action': model.id }, React.createElement('h3', null, model.title), model.fields.map(f => React.createElement('label', { key: f.name }, React.createElement('span', null, f.label), React.createElement('input', { name: f.name, type: f.type ?? 'text', defaultValue: f.value ?? '', placeholder: f.label }))), React.createElement('button', { className: 'hb-button hb-button-primary', type: 'submit' }, model.submitLabel));
}
export async function submitRuntimeForm(api: V2PlatformApiClient, model: FormModel, values: Record<string, unknown>) { return model.submit(api, values); }
export function LoadingState() { return React.createElement('div', { className: 'hb-state hb-loading' }, 'Loading secure platform data…'); }
export function ErrorState({ message }: { message: string }) { return React.createElement('div', { className: 'hb-state hb-error' }, message); }
export function EmptyState({ title, message }: { title: string; message: string }) { return React.createElement('div', { className: 'hb-state hb-empty' }, React.createElement('div', { className: 'hb-empty-icon' }, '◇'), React.createElement('h3', null, title), React.createElement('p', null, message)); }
export function FeatureGrid({ items }: { items: { title: string; body: string }[] }) { return React.createElement('div', { className: 'hb-grid hb-grid-3' }, items.map(item => React.createElement(Card, { key: item.title, title: item.title }, React.createElement('p', null, item.body)))); }
