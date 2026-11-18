import {houseMoneyRisk,equityMode,topHourlyConfig,type HouseMoneyFacts} from './house-money-risk.ts';
import {rotationEntry} from './conditional-market.ts';
/** All monetary facts are reloaded from durable account/provider evidence by the RPC. */
export async function loadHouseMoneyFacts(db:any,x:any,now:string):Promise<HouseMoneyFacts>{
 const r=await db.rpc('observe_house_money_account',{p_customer:x.account.customer_id,p_account:x.account.id,p_observed:x.observed_at});
 if(r.error||!r.data)throw Error('HOUSE_MONEY_ACCOUNT_OBSERVATION_UNAVAILABLE');
 const f=r.data as HouseMoneyFacts;
 if(f.customerId!==x.account.customer_id||f.accountId!==x.account.id)throw Error('HOUSE_MONEY_SCOPE_MISMATCH');
 const rotation=rotationEntry(x.signal.symbol,now,x.account.provider.startsWith('MT5')&&x.account.policy_overrides?.policy_configuration?.allowedSymbols?.includes(x.signal.symbol));
 const d=houseMoneyRisk(equityMode(x.account.account_mode,x.product),f,now,topHourlyConfig(x.signal.strategy_id,x.signal.timeframe),rotation.riskMultiplier);
 const saved=await db.rpc('persist_house_money_decision',{p_customer:f.customerId,p_account:f.accountId,p_observed:f.observedAt,p_decision:d});
 if(saved.error)throw Error('HOUSE_MONEY_STATE_NOT_PERSISTED');return f;
}
