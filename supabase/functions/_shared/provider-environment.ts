export type ProviderEnvironment='testnet'|'demo'|'live';
/** Closed endpoint mapping: credentials from one environment never select another host. */
export function providerEnvironmentContract(provider:string,requested?:string){
 const p=provider.toLowerCase();const environment=requested??(p==='binance'?'testnet':'demo');
 if(p==='binance'&&(environment==='testnet'||environment==='live'))return {environment,baseUrl:environment==='live'?'https://fapi.binance.com':'https://demo-fapi.binance.com'} as const;
 if(p==='bybit'&&(environment==='demo'||environment==='live'))return {environment,baseUrl:environment==='live'?'https://api.bybit.com':'https://api-demo.bybit.com'} as const;
 if((p==='mt5'||p==='mt5_personal'||p==='mt5_prop')&&(environment==='demo'||environment==='live'))return {environment,baseUrl:null} as const;
 throw Error('provider_environment_mismatch');
}
