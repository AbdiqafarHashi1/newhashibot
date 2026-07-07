export interface UniverseGroup {
  group_name: string;
  display_name: string;
  market_type: 'crypto' | 'forex';
  symbols: string[];
  is_enabled: boolean;
  is_default: boolean;
}

export const DEFAULT_UNIVERSE_GROUPS: UniverseGroup[] = [
  {
    group_name: 'crypto_core',
    display_name: 'Crypto Core (BTC, ETH, SOL)',
    market_type: 'crypto',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
    is_enabled: true,
    is_default: true,
  },
  {
    group_name: 'crypto_extended',
    display_name: 'Crypto Extended (Top 20)',
    market_type: 'crypto',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'INJUSDT', 'SUIUSDT'],
    is_enabled: false,
    is_default: false,
  },
  {
    group_name: 'forex_core',
    display_name: 'Forex Core (EUR, GBP, JPY)',
    market_type: 'forex',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY'],
    is_enabled: false,
    is_default: false,
  },
  {
    group_name: 'forex_extended',
    display_name: 'Forex Extended (Majors)',
    market_type: 'forex',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'],
    is_enabled: false,
    is_default: false,
  },
];

export function getUniverseGroup(name: string): UniverseGroup | undefined {
  return DEFAULT_UNIVERSE_GROUPS.find((g) => g.group_name === name);
}

export function getDefaultUniverseGroup(): UniverseGroup {
  return DEFAULT_UNIVERSE_GROUPS.find((g) => g.is_default) ?? DEFAULT_UNIVERSE_GROUPS[0];
}

export function getEnabledUniverseGroups(): UniverseGroup[] {
  return DEFAULT_UNIVERSE_GROUPS.filter((g) => g.is_enabled);
}

export function getSymbolsForUniverse(groupName: string): string[] {
  const group = getUniverseGroup(groupName);
  return group?.symbols ?? getDefaultUniverseGroup().symbols;
}

export function getCryptoSymbolsForUniverse(groupName: string): string[] {
  const group = getUniverseGroup(groupName);
  if (!group) return getDefaultUniverseGroup().symbols;
  return group.market_type === 'crypto' ? group.symbols : [];
}

export function getForexSymbolsForUniverse(groupName: string): string[] {
  const group = getUniverseGroup(groupName);
  if (!group) return [];
  return group.market_type === 'forex' ? group.symbols : [];
}

export function isForexUniverseEnabled(groupName: string): boolean {
  const group = getUniverseGroup(groupName);
  if (!group) return false;
  return group.market_type === 'forex' && group.is_enabled;
}

export function isCryptoExtendedEnabled(groupName: string): boolean {
  return groupName === 'crypto_extended';
}

export function isForexUniverse(groupName: string): boolean {
  const group = getUniverseGroup(groupName);
  return group?.market_type === 'forex' || false;
}

export function validateUniverseGroup(groupName: string): { valid: boolean; error: string | null } {
  const group = getUniverseGroup(groupName);
  if (!group) return { valid: false, error: `Unknown universe group: ${groupName}` };
  if (!group.is_enabled && !group.is_default) {
    return { valid: false, error: `Universe group ${groupName} is not enabled` };
  }
  return { valid: true, error: null };
}

export function getProductionDefaultUniverse(): string {
  return 'crypto_core';
}

export function shouldScanForex(groupName: string, forexFlagEnabled: boolean): boolean {
  if (!forexFlagEnabled) return false;
  return isForexUniverseEnabled(groupName);
}

export function getMaxSymbolsForUniverse(groupName: string): number {
  const group = getUniverseGroup(groupName);
  if (!group) return 5;
  return group.symbols.length;
}
