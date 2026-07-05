import React from 'react';
import type { V2PlatformApiClient } from './api-client.js';

export type UiAction = { label: string; action: string; payload?: Record<string, unknown> };
export type Field = { name: string; label: string; type?: string; value?: string };
export type FormModel = { id: string; title: string; fields: Field[]; submitLabel: string; submit: (api: V2PlatformApiClient, values: Record<string, unknown>) => Promise<unknown> };

export function StatusBadge({ label, tone = 'zinc' }: { label: string; tone?: string }) { return React.createElement('span', { className: `badge badge-${tone}` }, label); }
export function Card({ title, children, actions = [] }: { title: string; children?: React.ReactNode; actions?: UiAction[] }) {
  return React.createElement('section', { className: 'card' }, React.createElement('h3', null, title), React.createElement('div', null, children), actions.length ? React.createElement('div', { className: 'actions' }, actions.map(a => React.createElement('button', { key: a.action, 'data-action': a.action }, a.label))) : null);
}
export function MetricCard({ label, value, tone = 'blue' }: { label: string; value: string; tone?: string }) { return React.createElement(Card, { title: label }, React.createElement('strong', { className: `metric metric-${tone}` }, value)); }
export function DataTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  return React.createElement('table', { className: 'table' }, React.createElement('thead', null, React.createElement('tr', null, columns.map(c => React.createElement('th', { key: c }, c)))), React.createElement('tbody', null, rows.length ? rows.map((row, i) => React.createElement('tr', { key: i }, columns.map(c => React.createElement('td', { key: c }, String(row[c] ?? row[c.toLowerCase()] ?? '—'))))) : React.createElement('tr', null, React.createElement('td', { colSpan: columns.length }, 'No records yet'))));
}
export function RuntimeForm({ model }: { model: FormModel }) {
  return React.createElement('form', { id: model.id, 'data-platform-action': model.id }, React.createElement('h3', null, model.title), model.fields.map(f => React.createElement('label', { key: f.name }, f.label, React.createElement('input', { name: f.name, type: f.type ?? 'text', defaultValue: f.value ?? '' }))), React.createElement('button', { type: 'submit' }, model.submitLabel));
}
export async function submitRuntimeForm(api: V2PlatformApiClient, model: FormModel, values: Record<string, unknown>) { return model.submit(api, values); }
export function LoadingState() { return React.createElement('div', { className: 'state loading' }, 'Loading V2 platform state…'); }
export function ErrorState({ message }: { message: string }) { return React.createElement('div', { className: 'state error' }, message); }
export function EmptyState({ title, message }: { title: string; message: string }) { return React.createElement('div', { className: 'state empty' }, React.createElement('h3', null, title), React.createElement('p', null, message)); }
