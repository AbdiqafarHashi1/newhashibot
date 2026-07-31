/**
 * HashiBot Unified Trade Management Engine — Provider Capabilities Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  DEFAULT_BINANCE_PERSONAL_CAPABILITIES,
  DEFAULT_BYBIT_PERSONAL_CAPABILITIES,
  DEFAULT_MT5_PERSONAL_CAPABILITIES,
  DEFAULT_MT5_PROP_CAPABILITIES,
  getProviderCapabilities,
  hasRequiredCapabilities,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function runTests() {
  console.log("=== Running Trade Management Provider Capabilities Unit Tests ===");

  // Test 1: Validate Default Provider Capabilities
  console.log("Test 1: Validating default provider capabilities...");
  assert.equal(getProviderCapabilities("MT5_PERSONAL"), DEFAULT_MT5_PERSONAL_CAPABILITIES);
  assert.equal(getProviderCapabilities("MT5_PROP"), DEFAULT_MT5_PROP_CAPABILITIES);
  assert.equal(getProviderCapabilities("BINANCE"), DEFAULT_BINANCE_PERSONAL_CAPABILITIES);
  assert.equal(getProviderCapabilities("BYBIT"), DEFAULT_BYBIT_PERSONAL_CAPABILITIES);

  // Test 2: Check Capability Matrix Differences
  console.log("Test 2: Checking capability matrix differences...");
  assert.equal(DEFAULT_BINANCE_PERSONAL_CAPABILITIES.supports_reduce_only, true);
  assert.equal(DEFAULT_MT5_PERSONAL_CAPABILITIES.supports_reduce_only, false);
  assert.equal(DEFAULT_BYBIT_PERSONAL_CAPABILITIES.supports_multiple_tp_orders, true);

  // Test 3: Validate Capability Requirement Satisfiability
  console.log("Test 3: Validating capability requirement satisfiability...");
  const binanceCap = DEFAULT_BINANCE_PERSONAL_CAPABILITIES;
  const reqCheck = hasRequiredCapabilities(binanceCap, ["partial_close", "reduce_only"]);
  assert.equal(reqCheck.satisfied, true);
  assert.equal(reqCheck.missing.length, 0);

  const mt5Cap = DEFAULT_MT5_PERSONAL_CAPABILITIES;
  const mt5ReqCheck = hasRequiredCapabilities(mt5Cap, ["reduce_only"]);
  assert.equal(mt5ReqCheck.satisfied, false);
  assert.ok(mt5ReqCheck.missing.includes("reduce_only"));

  console.log("=== Trade Management Provider Capabilities Unit Tests Passed! ===");
}

runTests();
