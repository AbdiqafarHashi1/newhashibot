export const TEN_ASSET_PROFILE='crypto.ten-asset-pair-v1';
export const TEN_ASSET_SYMBOLS=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT'];
export const TEN_ALT_SYMBOLS=TEN_ASSET_SYMBOLS.filter(s=>!['BTCUSDT','ETHUSDT'].includes(s));
export const OPPORTUNITY_ORDER='qualified-opportunity/v1';
export const TEN_ASSET_CATALOG={id:TEN_ASSET_PROFILE,label:'Ten liquid assets · daily trend + alt momentum research',symbols:[...TEN_ASSET_SYMBOLS],costBps:26,warmupBars:201};

export const TEN_REGIME_PROFILE='crypto.ten-asset-regimes-v1';
export const TEN_ASSET_PROFILES=[TEN_ASSET_PROFILE,TEN_REGIME_PROFILE];
export const REGIME_OPPORTUNITY_ORDER='qualified-directional-opportunity/v1';
export const TEN_REGIME_CATALOG={...TEN_ASSET_CATALOG,id:TEN_REGIME_PROFILE,label:'Ten assets · bullish/bearish momentum + daily trend research'};
