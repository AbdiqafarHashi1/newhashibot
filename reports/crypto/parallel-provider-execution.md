# Parallel Provider Execution — Phase X-D

Date: 2026-06-15

## Summary

Added `executeSignalAcrossProviders()` to submit the same approved signal request to multiple provider adapters while assigning a shared `execution_group_id`.

## Behavior

- One signal can fan out to Binance and Bybit in parallel.
- Each provider receives identical signal/trade intent plus provider metadata.
- Results are collected with `Promise.allSettled`, so one provider failure cannot block or cancel another provider.
- `execution_group_id` links per-provider executions for downstream audit/comparison.
- Single-provider mode can select the primary provider only.

## Database support

`execution_provider_controls` stores provider ON/OFF, parallel mode, primary provider, read-only mode, provider kill switch, profit-lock, monitor, and recovery controls.

## Validation evidence

The exchange provider test suite creates one successful mock provider and one failing provider, runs the router in parallel mode, and asserts both results are returned with the failing provider isolated.
