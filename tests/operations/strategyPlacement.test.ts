import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STRATEGY_PLACEMENTS,PROP_CURATED_STRATEGIES} from '../../supabase/functions/_shared/strategy-placement-policy.ts';
import {COST_POSITIVE_CONFIG_IDS} from '../../supabase/functions/_shared/cost-positive-configs.ts';
import {PERSONAL_FOREX_STRATEGIES,PERSONAL_CRYPTO_STRATEGIES} from '../../supabase/functions/_shared/strategy-deployment-policy.ts';
import {VIP_CONFIG_IDS} from '../../supabase/functions/_shared/vip-signal-policy.ts';
import {executionStrategyPresets,executionStrategyDisplayName} from '../../supabase/functions/_shared/execution-strategy-presets.ts';
import {defaultTierStrategies} from '../../supabase/functions/_shared/execution-tier-presets.ts';
test('every retained configuration has a placement; original catalogue remains intact',()=>{
 assert.equal(Object.keys(STRATEGY_PLACEMENTS).length,21);
 assert.equal(COST_POSITIVE_CONFIG_IDS.length,16);
 for(const id of COST_POSITIVE_CONFIG_IDS)assert.ok(STRATEGY_PLACEMENTS[id]);
 assert.equal(Object.keys(STRATEGY_PLACEMENTS).filter(id=>id.startsWith('gold.turbo-')).length,5);
});
test('defaults and signals exclude paused/rebuild entries without deleting admin comparisons',()=>{
 for(const id of [...PERSONAL_FOREX_STRATEGIES,...PERSONAL_CRYPTO_STRATEGIES,...VIP_CONFIG_IDS,...PROP_CURATED_STRATEGIES])assert.ok(['CORE','ALTERNATIVE'].includes(STRATEGY_PLACEMENTS[id].status));
 assert.ok(!VIP_CONFIG_IDS.includes('crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006'));
 const comparison=executionStrategyPresets('MT5_PROP','demo','PROP_FUNDED').find(p=>p.id==='all-reviewed-comparison')!;
 assert.ok(comparison.ids.includes('gold.frontier-compression-15-24-1.5-5-h96'));
 for(const p of executionStrategyPresets('MT5_PROP','demo','PROP_FUNDED').filter(p=>p.id!=='all-reviewed-comparison'))assert.ok(p.ids.every(id=>(PROP_CURATED_STRATEGIES as readonly string[]).includes(id)));
});
test('placement never grants live execution or overrides provider availability',()=>{
 assert.deepEqual(defaultTierStrategies('BINANCE','live','PERSONAL'),[]);
 assert.deepEqual(defaultTierStrategies('MT5_PROP','live','PROP_FUNDED'),[]);
 assert.match(executionStrategyDisplayName('gold.frontier-compression-15-24-1.5-5-h96','x'),/Paused/);
 assert.equal(defaultTierStrategies('BINANCE','testnet','PERSONAL').length,1);
});
