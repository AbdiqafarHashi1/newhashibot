import {PERSONAL_GROWTH_STRATEGIES} from './strategy-deployment-policy.ts';
import {COST_POSITIVE_CONFIG_IDS} from './cost-positive-configs.ts';
export const VIP_CONFIG_IDS=[...PERSONAL_GROWTH_STRATEGIES];
export const VIP_EXCLUDED_STRATEGIES=new Set(COST_POSITIVE_CONFIG_IDS.filter(id=>!VIP_CONFIG_IDS.includes(id)));
// Classification snapshot: the 1,159 recovered closed source trades. No public probability claims.
const INTRADAY=new Set(['crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006','crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006','forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008','forex.native-squeeze-15-48-2-3-usdjpy-h12']);
export const vipSetupTag=(id:string)=>INTRADAY.has(id)?'⚡ INTRADAY SETUP · Follow SL/TP updates':'🎯 TREND RUNNER · Overnight/multi-day holding possible · Follow SL/TP updates';
export const VIP_RISK_FOOTER='Risk & Discipline\n• Standard Account: Risk 0.5%–1.5% max per trade (Max 3 open trades total; max 1 per symbol)\n• Prop Firm Account: Risk 0.25%–0.50% max per trade (Max 2 open trades total; max 1 per symbol)\n• Never stack same-direction trades or over-leverage.';
export function assertVipStrategy(id:unknown){if(typeof id!=='string'||!VIP_CONFIG_IDS.includes(id))throw Error('VIP_STRATEGY_NOT_ADMITTED');}

export function removeRawWinRates(text:string){return text.replace(/\b(?:win[ -]?rate|WR)\s*[:=]?\s*\d+(?:\.\d+)?\s*%/gi,'historical setup classification').replace(/\b\d+(?:\.\d+)?\s*%\s*(?:win[ -]?rate|WR)\b/gi,'historical setup classification');}
