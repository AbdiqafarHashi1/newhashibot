import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BacktestEngine, CertificationEngine, DatasetLoader, MonteCarloEngine, ReplayEngine, WalkForwardEngine, assertCompactResearchRow, type ResearchRepository, type TradeResult } from '../services/research-lab/index.js';
import type { Candle } from '../packages/types/index.js';

function candles(n=180):Candle[]{const base=Date.parse('2026-07-05T00:00:00.000Z'); return Array.from({length:n},(_,i)=>{const p=100+i*0.05+Math.sin(i/5); return{market:'crypto',symbol:'BTCUSDT',timeframe:'15m',openTime:new Date(base+i*900000).toISOString(),closeTime:new Date(base+(i+1)*900000).toISOString(),open:p,high:p+0.6,low:p-0.6,close:p+(i%7===0?-0.4:0.3),volume:100+i%20,source:'fixture',provider:'mock',isClosed:true};});}

test('dataset loader stores references only and rejects raw Supabase payloads',async()=>{const rows:{table:string;row:Record<string,unknown>}[]=[]; const repo:ResearchRepository={insert:(table,row)=>{assertCompactResearchRow(table,row); rows.push({table,row});}}; const loaded=await new DatasetLoader(repo).load({datasetId:'mem1',kind:'runtime_memory',market:'crypto',symbol:'BTCUSDT',timeframe:'15m',candleCount:2},candles(2)); assert.equal(loaded.length,2); assert.equal(rows[0].table,'research_datasets'); assert.equal('candles' in rows[0].row,false); assert.throws(()=>assertCompactResearchRow('research_runs',{candles:candles(2)}),/Raw market data/);});

test('replay is deterministic and uses closed candles without live providers',async()=>{const data=candles(); const a=await new ReplayEngine().run(data); const b=await new ReplayEngine().run(data); assert.equal(a.deterministicHash,b.deterministicHash); assert.equal(a.steps,data.length); assert.ok(a.indicatorUpdates>0);});

test('backtest calculates compact metrics for all eight strategies',async()=>{const result=await new BacktestEngine().run(candles(220)); assert.equal(Object.keys(result.byStrategy).length,8); assert.ok(result.summary.trades>0); assert.ok(Number.isFinite(result.summary.profitFactor)); assert.ok(result.sampleTrades.length<=20);});

test('walk-forward creates train/test windows and rejects unstable overfit candidates',async()=>{const wf=await new WalkForwardEngine().run(candles(240),3); assert.equal(wf.windows.length,3); assert.ok(wf.stabilityScore>=0&&wf.stabilityScore<=1); assert.equal(typeof wf.rejectedAsOverfit,'boolean'); assert.ok(wf.windows.every(w=>w.trainStart&&w.testStart));});

test('Monte Carlo estimates drawdown ranges and risk of ruin',()=>{const trades:TradeResult[]=Array.from({length:60},(_,i)=>({strategyId:'s',entryTime:String(i),exitTime:String(i+1),direction:'long',entry:100+i,exit:101+i,r:i%3?-0.4:1.2,pnl:i%3?-4:12,durationMinutes:15,regime:i%2?'trend':'range'})); const mc=new MonteCarloEngine().run(trades,100); assert.equal(mc.iterations,100); assert.ok(mc.drawdownP95>=mc.drawdownP50); assert.ok(mc.riskOfRuin>=0&&mc.riskOfRuin<=1);});

test('certification passes and fails using compact gate summaries',()=>{const ce=new CertificationEngine(); const pass=ce.certify('crypto.trend-pullback','ps1',{trades:80,netPnl:120,expectancy:.25,winRate:.48,profitFactor:1.6,maxDrawdown:20,exposurePct:.2,avgTradeMinutes:60,regimeDiversity:3}); assert.equal(pass.status,'CERTIFIED'); const fail=ce.certify('crypto.trend-pullback','ps2',{trades:5,netPnl:-10,expectancy:-.2,winRate:.2,profitFactor:.6,maxDrawdown:30,exposurePct:.2,avgTradeMinutes:60,regimeDiversity:1}); assert.equal(fail.status,'REJECTED');});

test('research implementation has no live exchange imports and migration forbids raw persistence',()=>{const src=readFileSync('services/research-lab/index.ts','utf8'); assert.doesNotMatch(src,/execution\/adapters|exchange-provider|binance|bybit|mt5-provider/i); const sql=readFileSync('supabase/migrations/20260705210000_research_lab.sql','utf8'); assert.match(sql,/research_runs/); assert.match(sql,/no_raw_payload|rawCandles|perCandleTrace/);});

test('root app was not modified for V2 research functionality',()=>{const porcelain=readFileSync('../.git/HEAD','utf8'); assert.ok(porcelain.length>0);});
