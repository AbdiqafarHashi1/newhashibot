/** Target-free SPOT research contract. Zero numeric RR is explicitly NOT_APPLICABLE. */
export const DAILY_TREND_ID='crypto.daily-ema-trend';
export const DAILY_TREND_PROFILE='crypto.daily-ema-trend-v1';
export const PROMISING_PAIR_PROFILE='crypto.daily-alt-pair-v1';
export const DAILY_EXIT_POLICY='daily-ema-trail/v1';
export const DAILY_SYMBOLS=['BTCUSDT','ETHUSDT'];
export const dailyEvidence=(e:Readonly<Record<string,unknown>>)=>e.exit_policy===DAILY_EXIT_POLICY&&e.research_only===true&&e.instrument_type==='SPOT'&&e.score_is_probability===false;
export const dailyCandidate=(c:{strategyId:string;strategyVersion:string;symbol:string;timeframe:string;side:string;targets:readonly number[];riskReward:number;evidence:Readonly<Record<string,unknown>>})=>c.strategyId===DAILY_TREND_ID&&c.strategyVersion==='1.0.0'&&DAILY_SYMBOLS.includes(c.symbol)&&c.timeframe==='1d'&&c.side==='buy'&&c.targets.length===0&&c.riskReward===0&&dailyEvidence(c.evidence);

export const DAILY_PROFILES=[DAILY_TREND_PROFILE,PROMISING_PAIR_PROFILE];
