import {subscriberCopySafe} from './subscriber-copy.ts';
import {trackedSetupSections} from './conditional-intelligence.ts';
import type {IntelligenceOutput} from './intelligence-engine.ts';
import type {EditorialPublication} from './telegram-product.ts';

/** A stored evidence record is required; the score means feed coverage, never predictive confidence. */
export function intelligencePublication(output: IntelligenceOutput, audience: 'free'|'vip', now = Date.now()): EditorialPublication {
  if(!subscriberCopySafe(`${output.title}\n${output.summary}`))throw Error('SUBSCRIBER_DIAGNOSTIC_BLOCKED');
  const failedFeeds=Array.isArray(output.metadata?.feed_health)?output.metadata.feed_health:[];
  if(failedFeeds.some((f:any)=>f.status!=='available'&&typeof f.error_message==='string'&&f.error_message.length>0&&output.summary.includes(f.error_message)))throw Error('INTELLIGENCE_SOURCE_DIAGNOSTIC_IN_SUMMARY');
  const generated = Date.parse(String(output.freshness.generated_at));
  if (output.status !== 'generated' || !output.summary.trim() || !Number.isFinite(generated) || generated > now+5000 || now-generated > 15*60_000) throw Error('INTELLIGENCE_EVIDENCE_INSUFFICIENT');
  const sources = Object.entries(output.data_sources).filter(([,v])=>typeof v === 'string' && v !== 'unavailable');
  if (!sources.length) throw Error('INTELLIGENCE_SOURCES_REQUIRED');
  const slot = Math.floor(generated/(30*60_000));
  return {
    content_id: `intelligence:${output.market}:${output.event_type}:${slot}`, content_type: output.event_type === 'news_digest' ? 'NEWS_DIGEST' : output.event_type === 'market_wrap' ? 'MARKET_WRAP' : output.event_type === 'watchlist_pattern_update' ? 'WATCHLIST_UPDATE' : 'MORNING_BRIEF',
    audience, title: output.title, sections: [{body:output.summary},...trackedSetupSections(output.metadata?.tracked_setups,audience),...(audience==='vip'?[{heading:'Volatility & discipline',body:'Macro releases can widen spreads and accelerate price swings. Keep position sizes within your account plan and avoid adding correlated exposure.'},...(slot%8===0?[{heading:'Hands-free account discipline',body:'HashiBot Automated Execution · $100/month. Automated House-Money risk caps, single-symbol locks and disciplined sizing help prevent FOMO and over-leveraging. Account rules and market risk still apply. https://hashibot.app/execution'}]:[])]:[]),...(audience==='free'?[{heading:'VIP analysis',body:'Follow the complete Crypto and Forex/Gold setup stream, strategy updates and tracked follow-ups with VIP. $29/month or KES 3,500/30 days. https://hashibot.app/vip'}]:[]),{heading:'Evidence',body:`Record: ${output.event_id}\n${sources.map(([name,source])=>`${name}: ${source}`).join('\n')}\nFetched/generated: ${new Date(generated).toISOString()}\nRegime descriptions are heuristics, not forecasts.`}],
    source_type:'APPROVED_INTELLIGENCE',source_ids:[output.event_id],market_scope:[output.market],generated_at:new Date(generated).toISOString(),expires_at:new Date(generated+30*60_000).toISOString(),evidence_class:'LIVE',author_type:'SYSTEM',requires_approval:false,approval_state:'NOT_REQUIRED',compliance_state:'APPROVED',dedupe_key:`${audience}:${output.market}:${output.event_type}:${slot}`,
  };
}
