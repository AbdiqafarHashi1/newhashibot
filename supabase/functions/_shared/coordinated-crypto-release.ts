/** Scope measured by the frozen coordinated study; broad research eligibility is not a live grant. */
export const CRYPTO_TEAM_MEASURED_SCOPE=Object.freeze(['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT']);
export function teamReleaseScopeAllowed(strategy:{id:string;symbols:string[]}){return strategy.symbols.length>0&&strategy.symbols.every(s=>CRYPTO_TEAM_MEASURED_SCOPE.includes(s)&&!(strategy.id==='crypto.team-alt'&&['BTCUSDT','ETHUSDT'].includes(s)));}
