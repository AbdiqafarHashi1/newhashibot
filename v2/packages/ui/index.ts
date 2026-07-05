export type NavItem = { label: string; path: string; badge?: string };
export type MetricCard = { label: string; value: string; trend?: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'zinc' };
export type TableColumn<T> = { key: keyof T | string; header: string; render?: (row: T) => string };
export type ActionButton = { label: string; href?: string; variant?: 'primary' | 'secondary' | 'danger' };

export function brandMark() { return '⚡ HashiBot'; }
export function pageHeader(title: string, eyebrow: string, actions: ActionButton[] = []) { return { component: 'PageHeader', title, eyebrow, actions }; }
export function statusBadge(label: string, tone: MetricCard['tone'] = 'zinc') { return { component: 'StatusBadge', label, tone }; }
export function metricCard(card: MetricCard) { return { component: 'MetricCard', ...card }; }
export function alertBanner(title: string, message: string, tone: MetricCard['tone'] = 'blue') { return { component: 'AlertBanner', title, message, tone }; }
export function emptyState(title: string, message: string, action?: ActionButton) { return { component: 'EmptyState', title, message, action }; }
export function dataTable<T>(columns: TableColumn<T>[], rows: T[]) { return { component: 'DataTable', columns: columns.map(c => c.header), rowCount: rows.length }; }
export function formField(name: string, label: string, type = 'text') { return { component: 'FormField', name, label, type }; }
export function shellLayout(kind: 'public' | 'customer' | 'admin', navigation: NavItem[]) { return { component: 'ShellLayout', brand: brandMark(), kind, navigation }; }
export function card(title: string, body: string, action?: ActionButton) { return { component: 'Card', title, body, action }; }
