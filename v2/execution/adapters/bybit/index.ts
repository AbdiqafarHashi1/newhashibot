import { ExchangeProviderExecutionAdapter } from '../provider-adapter.js';
import type { ExchangeProvider } from '../../exchange-provider.js';
export class BybitExecutionAdapter extends ExchangeProviderExecutionAdapter { constructor(provider: ExchangeProvider) { if (provider.metadata.id !== 'bybit') throw new Error(`Expected bybit provider, received ${provider.metadata.id}`); super(provider); } }
