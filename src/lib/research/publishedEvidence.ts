export interface PublishedResearchMetric {
  closedTrades: number; authorizedEntries: number; netReturnPct: number;
  maximumDrawdownPct: number; profitFactor: number | null;
}
export interface PublishedStudy {
  id: string; venue: string; dataUrl: string; historyMonths?: string[];
  experiment: { entryPolicy: string; partition: string; microTp2?: number };
  period: { start: string; end: string; days: number };
  summary: { signals: number; metrics: PublishedResearchMetric | null };
}
export interface PublishedEvidence {
  schema: 'mission2-research-results/v1'; generatedAt: string; missionStatus: string;
  studies: PublishedStudy[];
  strategyInventory: { strategy: string; classification: string; diagnosis: string; largestSingleStudyClosedSample: number }[];
  limitations: string[];
}
export async function loadPublishedEvidence(signal?: AbortSignal): Promise<PublishedEvidence> {
  const response = await fetch('/research/mission2-results.json', { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Research results could not be loaded. Please try again.');
  const report = await response.json();
  if (report.schema !== 'mission2-research-results/v1' || !Array.isArray(report.studies) || !Array.isArray(report.strategyInventory) || !Number.isFinite(Date.parse(report.generatedAt))) throw new Error('The research report could not be read.');
  return report;
}
export const evidenceNumber = (value: number | null | undefined, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
export const entryPolicyLabel = (policy: string) => ({ COMBINED: 'Immediate + conditional', IMMEDIATE_ONLY: 'Immediate only', CONDITIONAL_ONLY: 'Conditional only' })[policy] ?? policy;
