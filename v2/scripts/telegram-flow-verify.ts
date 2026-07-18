import { TemplateRenderer, ProfessionalDeliveryLedger, ProfessionalTelegramDispatcher, NewsPipeline, lifecycleIdempotencyKey, defaultTelegramChannels, renderWeeklyPerformanceCard } from '../packages/telegram-platform/index.js';
import { createPaperSignalPlan, advancePaperTrade, calculatePaperReport } from '../services/crypto-certification/index.js';

const now = '2026-07-18T00:00:00.000Z';
const renderer = new TemplateRenderer();
const plan = createPaperSignalPlan({ strategy:'manual-verification', symbol:'BTCUSDT', timeframe:'5m', direction:'long', createdAt:now, entry:100, stopLoss:95, tp1:105, tp2:110, expiresAt:'2026-07-18T00:10:00.000Z', timeStopAt:'2026-07-18T01:00:00.000Z', risk:'1%', grade:'A', confidence:'High', reason:'Deterministic safe paper verification fixture.' });
const candles = [{at:'2026-07-18T00:01:00.000Z',open:100,high:106,low:99,close:105},{at:'2026-07-18T00:02:00.000Z',open:105,high:111,low:104,close:110}];
const trade = advancePaperTrade(plan, candles);
const report = calculatePaperReport([trade]);
const freePreview = renderer.render('free_sample_signal',{symbol:plan.symbol,side:plan.direction.toUpperCase(),entry:'VIP zone withheld'});
const vipSignal = renderer.render('vip_full_signal',{signal_id:plan.signalId,symbol:plan.symbol,side:plan.direction.toUpperCase(),entry:String(plan.entry),sl:String(plan.stopLoss),tp1:String(plan.tp1),tp2:String(plan.tp2),risk:plan.risk,reason:plan.reason,time:now});
const adminAlert = renderer.render('admin_error',{source:'manual-telegram-flow-verify',severity:'info',message:'Safe verification alert; no real trade placed.',time:now});
const news = await new NewsPipeline({async fetch(){return [{headline:'Bitcoin liquidity improves during verification',source:'Manual Fixture',publishedAt:now,assets:['BTC']}];}},()=>new Date(now)).fetchFresh();
const ledger = new ProfessionalDeliveryLedger();
ledger.enqueue({idempotencyKey:lifecycleIdempotencyKey(plan.signalId,'signal.created',1),event:{type:'signal.created'},channel:defaultTelegramChannels[1],templateKey:'vip_full_signal',message:vipSignal,priority:90,maxAttempts:2});
const dispatcher = new ProfessionalTelegramDispatcher(ledger,{async send(_channel,message){return {ok:true,messageId:`verify-${message.length}`,response:{safe:true}};}},()=>new Date(now));
await dispatcher.drain();
console.log(JSON.stringify({safe:true,noRealTrades:true,freePreview,vipSignal,adminAlert,news,delivery:ledger.items[0],signalContinuity:trade.events.map(e=>({signalId:plan.signalId,type:e.type,version:e.version})),paperTradeFinalState:trade,weeklyCard:renderWeeklyPerformanceCard({period:'manual',verifiedTrades:report.verifiedTradeCount,winRate:report.winRate,netR:report.netR,drawdown:report.maxDrawdown,bestTrade:report.bestTrade,strategySplit:report.strategyDistribution})},null,2));
