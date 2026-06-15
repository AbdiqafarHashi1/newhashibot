# Execution State Root Cause

## Symptom
The admin execution page can show `Idle (auto-off)` while monitor and recovery remain enabled.

## Root cause
This is expected state separation, not a monitor/recovery failure. The entry engine, monitor engine, recovery engine, kill switch, emergency stop, and governor are separate controls.

`Idle (auto-off)` is shown when all of the following are true:

1. `kill_switch_enabled !== true`
2. `bot_paused !== true`
3. `auto_execute_testnet !== true`

So the exact reason auto execution is OFF in this state is:

```text
OFF because auto_execute_testnet=false
```

## State trace

| State source | Meaning | Effect |
|---|---|---|
| `auto_execute_testnet` | Enables automatic entry submission for qualified scanner signals | When false, the bot shows `Idle (auto-off)` and no automatic new entries are submitted |
| Governor state | Calculates risk and may block entries in normal mode | Visible separately; readonly/off-for-testing can change whether governor blocks entries |
| `kill_switch_enabled` | Admin kill switch for new entries | Shows `Kill Switch ON`; monitor can still manage open positions |
| `bot_paused` | Emergency stop / bot pause | Shows `Bot Paused`; blocks engines guarded by pause state |
| Monitor state | Tracks/syncs open execution truth | Can remain enabled even while auto entries are off |
| Recovery state | Protection/recovery management | Can remain enabled even while auto entries are off |

## Fix made

The bot state panel now prints an explicit `Auto execution reason` line, so operators can distinguish:

- `OFF because auto_execute_testnet=false`
- `OFF because kill_switch_enabled=true`
- `OFF because bot_paused=true (...)`
- `ON`

## Operator conclusion

When the UI says `Idle (auto-off)` and monitor/recovery are enabled, the bot is not contradictory: automatic new entries are disabled by `auto_execute_testnet=false`, while monitoring and protection recovery are still allowed to supervise existing positions.
