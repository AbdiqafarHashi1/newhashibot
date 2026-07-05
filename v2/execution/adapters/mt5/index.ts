import { ExchangeProviderExecutionAdapter } from '../provider-adapter.js';
import type { ExchangeProvider } from '../../exchange-provider.js';
export class Mt5ExecutionAdapter extends ExchangeProviderExecutionAdapter { constructor(provider: ExchangeProvider) { if (provider.metadata.id !== 'mt5') throw new Error(`Expected mt5 provider, received ${provider.metadata.id}`); super(provider); } }
