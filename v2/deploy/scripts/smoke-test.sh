#!/usr/bin/env bash
set -euo pipefail
checks=(login registration customer_approval mpesa_submission subscription_activation binance_setup bybit_setup mt5_setup executor_creation scanner signal_creation telegram_delivery execution_planning testnet_execution protection tp sl be recovery monitoring audit notifications research_lab mt5_bridge hashibridge admin_ui customer_ui)
for check in "${checks[@]}"; do
  echo "PENDING manual/API evidence: ${check}"
done
echo "Smoke checklist emitted. Replace PENDING with PASS/FAIL evidence during certification."
