import { ExchangeProviderExecutionAdapter } from '../provider-adapter.js';
import type { ExchangeProvider } from '../../exchange-provider.js';
export class BinanceExecutionAdapter extends ExchangeProviderExecutionAdapter { constructor(provider: ExchangeProvider) { if (provider.metadata.id !== 'binance') throw new Error(`Expected binance provider, received ${provider.metadata.id}`); super(provider); } }
