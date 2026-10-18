import type {NewsState} from './account-execution-brain/types.ts';
/** Exact source terminal and complete current calendar coverage; no event guesses. */
export function observedMt5News(proof:any,now=Date.now()):NewsState{
 const unknown={in_high_impact_news_window:true,news_event_title:'NEWS_CALENDAR_UNVERIFIED',minutes_to_news:null,minutes_after_news:null};
 const identity=proof?.terminal_identity,c=identity?.economic_calendar,age=now-Date.parse(c?.observed_at),required=['USD','EUR','GBP','JPY','AUD','CAD','CHF'];
 if(c?.schema_version!=='mt5-economic-calendar/v1'||c.complete!==true||typeof c.high_impact_in_window!=='boolean'||!Number.isFinite(age)||age<0||age>60000||String(c.account_login)!==String(identity.account_login)||!identity.account_login||c.server!==identity.account_server||!c.server||!Number.isInteger(c.buffer_minutes)||c.buffer_minutes<30||!Array.isArray(c.currencies)||required.some(x=>!c.currencies.includes(x)))return unknown;
 return {in_high_impact_news_window:c.high_impact_in_window,news_event_title:c.high_impact_in_window?'MT5_HIGH_IMPACT_OR_UNTIMED_EVENT_WINDOW':'MT5_CALENDAR_CHECKED',minutes_to_news:null,minutes_after_news:null};
}
