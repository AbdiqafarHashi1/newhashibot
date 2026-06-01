import { PackageCapability, slugFromPackageValue } from './packages';
import { CustomerBotSetup } from './types';

export type BotType = 'crypto_personal' | 'forex_mt5_personal' | 'forex_mt5_prop';
export type CapitalMode = 'personal' | 'prop';
export type BotSetupStatus = 'not_configured' | 'setup_requested' | 'pending_admin_setup' | 'configured' | 'paused' | 'running' | 'disabled';
export type RiskPreset = 'Conservative' | 'Balanced' | 'Aggressive' | 'Prop Safe';

export const BOT_SETUP_STATUSES: BotSetupStatus[] = [
  'not_configured',
  'setup_requested',
  'pending_admin_setup',
  'configured',
  'paused',
  'running',
  'disabled',
];

export const PERSONAL_RISK_PRESETS: RiskPreset[] = ['Conservative', 'Balanced', 'Aggressive'];
export const PROP_RISK_PRESETS: RiskPreset[] = ['Conservative', 'Prop Safe'];

export const RISK_PRESET_HELP: Record<RiskPreset, string> = {
  Conservative: 'Lower risk, fewer trades, and stricter protection.',
  Balanced: 'Moderate risk with normal signal usage for personal Bot setup.',
  Aggressive: 'Higher-risk personal mode only. Not available for prop accounts.',
  'Prop Safe': 'Prop mode only. Conservative by default with rule and drawdown protection wording.',
};

export function botTypeFromPackage(slugOrName?: string | null): BotType | null {
  const slug = slugFromPackageValue(slugOrName);
  if (slug === 'crypto_personal_bot') return 'crypto_personal';
  if (slug === 'forex_mt5_personal_bot') return 'forex_mt5_personal';
  if (slug === 'forex_mt5_prop_bot') return 'forex_mt5_prop';
  return null;
}

export function capitalModeFromPackage(slugOrName?: string | null): CapitalMode {
  return slugFromPackageValue(slugOrName) === 'forex_mt5_prop_bot' ? 'prop' : 'personal';
}

export function defaultBotRiskPreset(slugOrName?: string | null): RiskPreset {
  return slugFromPackageValue(slugOrName) === 'forex_mt5_prop_bot' ? 'Prop Safe' : 'Conservative';
}

export function riskOptionsForPackage(slugOrName?: string | null): RiskPreset[] {
  return slugFromPackageValue(slugOrName) === 'forex_mt5_prop_bot' ? PROP_RISK_PRESETS : PERSONAL_RISK_PRESETS;
}

export function splitSymbols(value: string) {
  return value.split(',').map(symbol => symbol.trim().toUpperCase()).filter(Boolean);
}

export function symbolsToText(symbols?: string[] | null) {
  return Array.isArray(symbols) ? symbols.join(', ') : '';
}

export function botSetupStatusLabel(status?: string | null) {
  const value = status || 'not_configured';
  return value.replace(/_/g, ' ');
}

export function setupProgress(setup: CustomerBotSetup | null, hasBotPackage: boolean) {
  if (!hasBotPackage) return [];
  return [
    { label: 'Choose Bot package', done: true },
    { label: 'Submit payment/package request', done: Boolean(setup?.access_request_id || setup?.subscription_id) },
    { label: 'Complete setup details and no-execution acknowledgement', done: Boolean(setup?.acknowledged_no_execution) },
    { label: 'Admin reviews setup details', done: ['pending_admin_setup', 'configured', 'paused', 'running'].includes(setup?.setup_status ?? '') },
    { label: 'Demo connector phase completed later', done: setup?.setup_status === 'configured' || setup?.setup_status === 'running' },
  ];
}

export function setupPackageSlug(setup?: CustomerBotSetup | null): PackageCapability | null {
  return slugFromPackageValue(setup?.package_slug);
}
