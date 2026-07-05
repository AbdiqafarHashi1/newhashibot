# Planned `/v2` Folder Structure

No files are implemented by this plan. This is the target standalone structure.

```text
/v2
  /apps
    /web-customer
    /web-admin
    /telegram-platform
  /services
    /hashicore
    /market-intelligence
    /execution-orchestrator
    /monitoring
    /research-lab
  /packages
    /events
    /types
    /state-machines
    /runtime-cache
    /config
    /logging
    /security
    /supabase-client
  /execution
    /adapters
      /binance
      /bybit
      /mt5
      /mock
    /command-queue
    /executor-runtime
  /hashibridge
    /desktop-app
    /protocol
    /updater
    /local-queue
  /strategies
    /crypto
      /micro-scalper
      /compression-breakout
      /trend-pullback
      /reversal-exhaustion
    /forex
      /london-breakout
      /trend-pullback
      /new-york-continuation
      /swing-continuation
  /supabase
    /schema-docs
    /policies-docs
    /seed-docs
  /tests
    /unit
    /integration
    /contract
    /replay
    /e2e
  /docs
  /scripts
  /deploy
```

## Independence Requirement
Everything required to build, test, deploy, and operate V2 must live under `/v2`, except external managed services such as Supabase, hosting, exchanges, Telegram, and broker infrastructure.
