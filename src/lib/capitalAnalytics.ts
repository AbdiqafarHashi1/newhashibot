export interface CapitalAssumptions {
  startingCapital: number;
  riskPct: number;
}

export interface CapitalEstimate {
  totalReturnPct: number | null;
  estimatedPnl: number | null;
  estimatedFinalCapital: number | null;
  avgReturnPct: number | null;
  avgPnl: number | null;
  maxDrawdownPct: number | null;
  maxDrawdownAmount: number | null;
}

export const DEFAULT_CAPITAL_ASSUMPTIONS: CapitalAssumptions = {
  startingCapital: 1000,
  riskPct: 0.5,
};

export function validCapitalAssumptions(assumptions: CapitalAssumptions): CapitalAssumptions {
  return {
    startingCapital: Number.isFinite(assumptions.startingCapital) && assumptions.startingCapital > 0 ? assumptions.startingCapital : DEFAULT_CAPITAL_ASSUMPTIONS.startingCapital,
    riskPct: Number.isFinite(assumptions.riskPct) && assumptions.riskPct > 0 ? assumptions.riskPct : DEFAULT_CAPITAL_ASSUMPTIONS.riskPct,
  };
}

export function estimateCapitalFromR(
  rValues: Array<number | null | undefined>,
  rawAssumptions: CapitalAssumptions,
): CapitalEstimate {
  const assumptions = validCapitalAssumptions(rawAssumptions);
  const closedR = rValues.filter((value): value is number => Number.isFinite(Number(value))).map(Number);
  if (closedR.length === 0) {
    return {
      totalReturnPct: null,
      estimatedPnl: null,
      estimatedFinalCapital: null,
      avgReturnPct: null,
      avgPnl: null,
      maxDrawdownPct: null,
      maxDrawdownAmount: null,
    };
  }

  const totalR = closedR.reduce((sum, value) => sum + value, 0);
  const totalReturnPct = totalR * assumptions.riskPct;
  const estimatedPnl = assumptions.startingCapital * (totalReturnPct / 100);
  const avgReturnPct = totalReturnPct / closedR.length;
  const avgPnl = estimatedPnl / closedR.length;

  let equityPct = 0;
  let peakPct = 0;
  let maxDrawdownPct = 0;
  for (const value of closedR) {
    equityPct += value * assumptions.riskPct;
    peakPct = Math.max(peakPct, equityPct);
    maxDrawdownPct = Math.max(maxDrawdownPct, peakPct - equityPct);
  }

  return {
    totalReturnPct,
    estimatedPnl,
    estimatedFinalCapital: assumptions.startingCapital + estimatedPnl,
    avgReturnPct,
    avgPnl,
    maxDrawdownPct,
    maxDrawdownAmount: assumptions.startingCapital * (maxDrawdownPct / 100),
  };
}

export function formatMoney(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function formatPct(value: number | null | undefined, signed = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
