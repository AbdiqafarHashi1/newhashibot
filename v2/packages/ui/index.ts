export type ShellKind = 'public' | 'customer' | 'admin';
export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'zinc' | 'cyan' | 'violet';
export type NavItem = { label: string; path: string; badge?: string; group?: string };
export type MetricCard = { label: string; value: string; trend?: string; tone?: Tone; empty?: boolean };
export type TableColumn<T> = { key: keyof T | string; header: string; render?: (row: T) => string };
export type ActionButton = { label: string; href?: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' };

export const v2Brand = {
  name: 'HashiBot',
  versionLabel: 'HashiBot 2.0',
  mark: '⚡',
  logoText: '⚡ HashiBot',
  favicon: '/favicon.svg',
  appIcon: '/icons/hashibot-v2.svg',
  typography: { sans: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif', mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace' },
  colors: {
    page: '#09090b', surface: '#18181b', surfaceRaised: '#27272a', border: '#3f3f46',
    text: '#f4f4f5', muted: '#a1a1aa', blue: '#2563eb', cyan: '#06b6d4', green: '#10b981', amber: '#f59e0b', red: '#ef4444', violet: '#8b5cf6'
  },
  classes: {
    page: 'min-h-screen bg-zinc-950 text-zinc-100 antialiased',
    header: 'sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl',
    sidebar: 'w-72 border-r border-zinc-800 bg-zinc-950/95 p-3 md:fixed md:inset-y-0',
    mobileNav: 'md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-xl',
    card: 'rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5 shadow-xl shadow-black/20',
    cardHover: 'transition-colors hover:border-zinc-700',
    input: 'w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none',
    primaryButton: 'inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500',
    secondaryButton: 'inline-flex items-center justify-center rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900',
    dangerButton: 'inline-flex items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20',
    responsiveGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4',
    table: 'w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 text-sm',
    empty: 'rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center'
  },
  auditSummary: {
    reuseVisually: ['dark zinc background', 'blue CTA', 'rounded cards', 'fixed header/sidebar', 'compact badges'],
    reuseWithImprovement: ['mobile navigation', 'pricing cards', 'auth forms', 'admin tables', 'loading and empty states'],
    inspirationOnly: ['signal education copy', 'market strip', 'grade visual language'],
    doNotReuse: ['root Supabase clients', 'exchange clients', 'trading logic', 'fake performance claims']
  }
} as const;

export function brandMark() { return v2Brand.logoText; }
export function pageHeader(title: string, eyebrow: string, actions: ActionButton[] = []) { return { component: 'PageHeader', title, eyebrow, actions, classes: 'mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between' }; }
export function statusBadge(label: string, tone: Tone = 'zinc') { return { component: 'StatusBadge', label, tone, classes: `rounded-full border px-2.5 py-1 text-xs font-semibold tone-${tone}` }; }
export function metricCard(card: MetricCard) { return { component: 'MetricCard', ...card, classes: v2Brand.classes.card }; }
export function alertBanner(title: string, message: string, tone: Tone = 'blue') { return { component: 'AlertBanner', title, message, tone, classes: 'rounded-2xl border p-4 text-sm' }; }
export function emptyState(title: string, message: string, action?: ActionButton) { return { component: 'EmptyState', title, message, action, classes: v2Brand.classes.empty }; }
export function loadingState(label = 'Loading secure platform data') { return { component: 'LoadingState', label, classes: 'animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6' }; }
export function errorState(title: string, message: string) { return { component: 'ErrorState', title, message, tone: 'red' as Tone, classes: 'rounded-2xl border border-red-500/30 bg-red-500/10 p-5' }; }
export function dataTable<T>(columns: TableColumn<T>[], rows: T[], emptyTitle = 'No records yet') { return { component: 'DataTable', columns: columns.map(c => c.header), rowCount: rows.length, rows, empty: rows.length === 0 ? emptyState(emptyTitle, 'This table will populate automatically when V2 platform APIs return live records.') : null, classes: v2Brand.classes.table, searchFilterReady: true }; }
export function formField(name: string, label: string, type = 'text') { return { component: 'FormField', name, label, type, classes: v2Brand.classes.input }; }
export function shellLayout(kind: ShellKind, navigation: NavItem[]) { return { component: 'ShellLayout', brand: brandMark(), kind, navigation, logo: v2Brand.appIcon, favicon: v2Brand.favicon, classes: { page: v2Brand.classes.page, header: v2Brand.classes.header, sidebar: kind === 'public' ? null : v2Brand.classes.sidebar, mobileNav: v2Brand.classes.mobileNav }, responsive: { desktopSidebar: kind !== 'public', mobileDrawer: true, bottomNav: kind !== 'public' } }; }
export function card(title: string, body: string, action?: ActionButton, tone: Tone = 'zinc') { return { component: 'Card', title, body, action, tone, classes: `${v2Brand.classes.card} ${v2Brand.classes.cardHover}` }; }
export function section(title: string, description: string, blocks: unknown[] = []) { return { component: 'Section', title, description, blocks, classes: 'py-10' }; }
