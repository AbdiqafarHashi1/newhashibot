/**
 * HashiBot Unified Trade Management Engine — Provider Capability Abstraction
 * Phase 6 Architecture
 */

import { ProviderCapabilities, TradeProvider } from "./types.ts";

export const DEFAULT_MT5_PERSONAL_CAPABILITIES: ProviderCapabilities = Object.freeze({
  provider: "MT5_PERSONAL",
  supports_partial_close: true,
  supports_amend_stop_loss: true,
  supports_amend_take_profit: true,
  supports_reduce_only: false,
  supports_hedge_mode: true,
  supports_one_way_mode: false,
  supports_native_trailing_stop: true,
  supports_client_side_trailing: true,
  supports_multiple_tp_orders: false,
  supports_close_by_position_id: true,
  supports_close_by_symbol: true,
  supports_protection_query: true,
  supports_order_repair: true,
  supports_atomic_protection: true,
  minimum_order_quantity: 0.01,
  quantity_step: 0.01,
  price_tick: 0.00001,
});

export const DEFAULT_MT5_PROP_CAPABILITIES: ProviderCapabilities = Object.freeze({
  provider: "MT5_PROP",
  supports_partial_close: true,
  supports_amend_stop_loss: true,
  supports_amend_take_profit: true,
  supports_reduce_only: false,
  supports_hedge_mode: true,
  supports_one_way_mode: false,
  supports_native_trailing_stop: true,
  supports_client_side_trailing: true,
  supports_multiple_tp_orders: false,
  supports_close_by_position_id: true,
  supports_close_by_symbol: true,
  supports_protection_query: true,
  supports_order_repair: true,
  supports_atomic_protection: true,
  minimum_order_quantity: 0.01,
  quantity_step: 0.01,
  price_tick: 0.00001,
});

export const DEFAULT_BINANCE_PERSONAL_CAPABILITIES: ProviderCapabilities = Object.freeze({
  provider: "BINANCE",
  supports_partial_close: true,
  supports_amend_stop_loss: true,
  supports_amend_take_profit: true,
  supports_reduce_only: true,
  supports_hedge_mode: true,
  supports_one_way_mode: true,
  supports_native_trailing_stop: true,
  supports_client_side_trailing: true,
  supports_multiple_tp_orders: true,
  supports_close_by_position_id: false,
  supports_close_by_symbol: true,
  supports_protection_query: true,
  supports_order_repair: true,
  supports_atomic_protection: false,
  minimum_order_quantity: 0.001,
  quantity_step: 0.001,
  price_tick: 0.1,
});

export const DEFAULT_BYBIT_PERSONAL_CAPABILITIES: ProviderCapabilities = Object.freeze({
  provider: "BYBIT",
  supports_partial_close: true,
  supports_amend_stop_loss: true,
  supports_amend_take_profit: true,
  supports_reduce_only: true,
  supports_hedge_mode: true,
  supports_one_way_mode: true,
  supports_native_trailing_stop: true,
  supports_client_side_trailing: true,
  supports_multiple_tp_orders: true,
  supports_close_by_position_id: true,
  supports_close_by_symbol: true,
  supports_protection_query: true,
  supports_order_repair: true,
  supports_atomic_protection: true,
  minimum_order_quantity: 0.001,
  quantity_step: 0.001,
  price_tick: 0.1,
});

export function getProviderCapabilities(provider: TradeProvider): ProviderCapabilities {
  switch (provider) {
    case "MT5_PERSONAL":
      return DEFAULT_MT5_PERSONAL_CAPABILITIES;
    case "MT5_PROP":
      return DEFAULT_MT5_PROP_CAPABILITIES;
    case "BINANCE":
      return DEFAULT_BINANCE_PERSONAL_CAPABILITIES;
    case "BYBIT":
      return DEFAULT_BYBIT_PERSONAL_CAPABILITIES;
    default:
      return DEFAULT_MT5_PERSONAL_CAPABILITIES;
  }
}

/**
 * Validates if a set of required capability strings are satisfied by provider capabilities.
 */
export function hasRequiredCapabilities(
  capabilities: ProviderCapabilities,
  requirements: readonly string[]
): { satisfied: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const req of requirements) {
    switch (req) {
      case "partial_close":
        if (!capabilities.supports_partial_close) missing.push(req);
        break;
      case "amend_stop_loss":
        if (!capabilities.supports_amend_stop_loss) missing.push(req);
        break;
      case "amend_take_profit":
        if (!capabilities.supports_amend_take_profit) missing.push(req);
        break;
      case "reduce_only":
        if (!capabilities.supports_reduce_only) missing.push(req);
        break;
      case "native_trailing":
        if (!capabilities.supports_native_trailing_stop) missing.push(req);
        break;
      case "client_side_trailing":
        if (!capabilities.supports_client_side_trailing) missing.push(req);
        break;
      case "protection_query":
        if (!capabilities.supports_protection_query) missing.push(req);
        break;
      case "order_repair":
        if (!capabilities.supports_order_repair) missing.push(req);
        break;
      default:
        // Unknown custom requirement
        break;
    }
  }

  return { satisfied: missing.length === 0, missing };
}
