import type {ArbitrationCandidate} from './arbitrator.ts';
export interface ContextNode{value:number;feature:number;threshold:number;left:number;right:number;leaf:boolean}
export interface FrozenSleeveContextModel{id:string;baseline:number;trainingCount:number;trees:ContextNode[][]}
const symbols=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT'];
/** Exact contemporaneous feature order frozen by model-protocol.json. No outcome or future candle input. */
export function sleeveContextFeatures(c:Pick<ArbitrationCandidate,'side'|'symbol'|'entry'|'stop'|'riskReward'|'evidence'>):number[]{
 const e=c.evidence,a=e.adaptive_market as Record<string,unknown>|undefined;if(!symbols.includes(c.symbol)||!a||a.valid!==true||!(c.entry>0)||!['buy','sell'].includes(c.side))throw Error('CONTEXT_MODEL_IDENTITY_REQUIRED');
 const values=[c.side==='buy'?1:-1,e.macro_direction,e.macro_strength,e.volume_ratio,e.estimated_cost_r,c.riskReward,Math.abs(c.entry-c.stop)/c.entry,a.efficiency,a.relativeAtr,a.barRangeAtr,a.trendAtr,...symbols.map(s=>Number(s===c.symbol))];if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('CONTEXT_MODEL_FEATURES_REQUIRED');return values as number[];
}
/** Portable exported histogram-tree inference. No model fitting, network, or publication authority. */
export function predictSleeveContext(model:FrozenSleeveContextModel,features:readonly number[]):number{
 if(features.length!==16||features.some(v=>!Number.isFinite(v))||!Number.isFinite(model.baseline)||!Number.isInteger(model.trainingCount)||model.trainingCount<60||model.trees.length!==100)throw Error('CONTEXT_MODEL_FROZEN_SHAPE_INVALID');let value=model.baseline;
 for(const tree of model.trees){if(!tree.length||tree.length>13)throw Error('CONTEXT_MODEL_TREE_BOUND');let index=0,closed=false;const visited=new Set<number>();for(let step=0;step<=13;step++){if(visited.has(index)||!Number.isInteger(index)||index<0||index>=tree.length)throw Error('CONTEXT_MODEL_TREE_INVALID');visited.add(index);const n=tree[index];if(!Number.isFinite(n.value)||typeof n.leaf!=='boolean')throw Error('CONTEXT_MODEL_NODE_INVALID');if(n.leaf){value+=n.value;closed=true;break;}if(!Number.isInteger(n.feature)||n.feature<0||n.feature>=16||!Number.isFinite(n.threshold))throw Error('CONTEXT_MODEL_SPLIT_INVALID');index=features[n.feature]<=n.threshold?n.left:n.right;}if(!closed)throw Error('CONTEXT_MODEL_TREE_UNTERMINATED');}
 if(!Number.isFinite(value))throw Error('CONTEXT_MODEL_PREDICTION_INVALID');return value;
}
export function sleeveContextGate(prediction:number,declaredCostR:number){return Number.isFinite(prediction)&&Number.isFinite(declaredCostR)&&declaredCostR>=0&&prediction>=.15&&prediction-.5*declaredCostR>.05;}
