import type { ExchangeProvider } from '../../exchange-provider.js';
import { ExchangeProviderExecutionAdapter } from '../provider-adapter.js';
export { BinanceExchangeProvider, binanceQueryString, classifyBinanceError, createBinanceClientOrderId, normalizeBinanceSymbol, roundBinancePrice, roundBinanceQuantity, signBinanceRequest, validateBinanceMinimums } from './provider.js';
export class BinanceExecutionAdapter extends ExchangeProviderExecutionAdapter { constructor(provider: ExchangeProvider) { if (provider.metadata.id !== 'binance') throw new Error(`Expected binance provider, received ${provider.metadata.id}`); super(provider); } }
