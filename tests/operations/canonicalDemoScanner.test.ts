import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildCanonicalDemoBundle} from '../../supabase/functions/_shared/canonical-demo-release';
import {LAUNCH_CANONICAL_REVIEWS} from '../../supabase/functions/_shared/launch-canonical-reviews';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog';

test('the installed twelve-strategy SQL bundle resolves into the actual scanner with exact frozen scopes and independent disable controls',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create function auth.role() returns text language sql as $$select 'service_role'::text$$;
   create table profiles(id uuid primary key,role text);
   create table strategy_release_candidates(id uuid primary key default gen_random_uuid(),strategy_id text,created_by uuid,development_run_id uuid not null,validation_run_id uuid not null,configuration_hash text,immutable_configuration jsonb,validation_end timestamptz,state text,promoted_at timestamptz);
   create unique index one_active_measured_strategy on strategy_release_candidates(strategy_id) where state='PROMOTED';
   create table strategy_configs(strategy_name text unique,enabled boolean,market_type text,allowed_symbols jsonb,allowed_timeframes jsonb,min_score numeric,min_rr numeric,params jsonb,updated_at timestamptz);
   create table backtest_runs(mode_slug text,strategy_name text,status text,dataset_name text,result_summary jsonb);
   create table phase_h_audit_events(customer_id uuid,actor_id uuid,event_type text,safe_metadata jsonb);
   insert into profiles values('00000000-0000-0000-0000-000000000001','admin');`);
  await db.exec(await readFile('supabase/migrations/20261112215402_canonical_demo_strategy_release.sql','utf8'));
  const bundle=buildCanonicalDemoBundle(LAUNCH_CANONICAL_REVIEWS.map(r=>r.strategyId),LAUNCH_CANONICAL_REVIEWS);
  await db.query('select install_canonical_demo_strategy_bundle($1,$2)',['00000000-0000-0000-0000-000000000001',JSON.stringify(bundle)]);
  const load=async()=>watchedStrategyCatalog((await db.query('select * from strategy_configs')).rows,(await db.query("select * from strategy_release_candidates where state='PROMOTED'")).rows);
  const catalog=await load(),enabled=catalog.filter(d=>d.config.enabled);
  assert.equal(enabled.length,12);
  assert.deepEqual(enabled.map(d=>d.id).sort(),bundle.strategies.map(s=>s.strategyId).sort());
  for(const item of bundle.strategies){
   const d=enabled.find(d=>d.id===item.strategyId)!,f=item.configuration.strategies[0];
   assert.equal(d.lifecycle,'ENABLED'); assert.equal(d.publicationMode,'LIVE'); assert.equal(d.certification,'PRODUCTION');
   assert.match(d.config.config_source!,/^measured_release:/); assert.equal(typeof d.evaluate,'function');
   assert.deepEqual(d.config.allowed_symbols,f.symbols); assert.deepEqual(d.config.allowed_timeframes,f.timeframes);
   assert.equal(d.config.min_score,f.minScore); assert.equal(d.config.min_rr,f.minRiskReward);
   assert.equal(d.config.max_bars_in_trade,f.maxBarsInTrade); assert.deepEqual(d.config.params,f.parameters);
  }
  // Mutable research values cannot silently replace the settings that passed.
  const first=bundle.strategies[0];
  await db.query("update strategy_configs set min_score=1,params='{}'::jsonb,allowed_symbols='[\"UNTESTED\"]'::jsonb where strategy_name=$1",[first.strategyName]);
  const unchanged=(await load()).find(d=>d.id===first.strategyId)!;
  assert.deepEqual(unchanged.config.params,first.configuration.strategies[0].parameters);
  assert.deepEqual(unchanged.config.allowed_symbols,first.configuration.strategies[0].symbols);
  await db.query('update strategy_configs set enabled=false where strategy_name=$1',[first.strategyName]);
  assert.equal((await load()).filter(d=>d.config.enabled).length,11);
  assert.equal((await load()).find(d=>d.id===first.strategyId)!.config.enabled,false);
  const sets=(await db.query<{result_summary:any}>('select result_summary from backtest_runs')).rows;
  assert.equal(sets.length,4);
  for(const {result_summary:s} of sets){
   assert.equal(s.scope,'SIGNALS_AND_DEMO');
   for(const entry of s.qualifiedSet.entries){
    const item=bundle.strategies.find(i=>i.strategyId===entry.strategyId)!;
    assert.ok(item); assert.deepEqual(entry.strategyParameters,item.configuration.strategies[0].parameters);
   }
  }
 }finally{await db.close();}
});
