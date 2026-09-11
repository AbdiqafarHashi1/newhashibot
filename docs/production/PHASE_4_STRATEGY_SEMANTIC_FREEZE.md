# Phase 4 Strategy Semantic Freeze

No parameter was tuned and no strategy was promoted based on historical performance.

| Strategy/group | Old browser behavior | Scanner behavior | Decision |
|---|---|---|---|
| Four canonical forex/metals strategies | Phase 3 compatibility route | canonical facade | Keep Phase 3 semantics; require explicit symbol. |
| CryptoMicroScalper | browser EMA/RSI/volume formula | no matching scanner evaluator found | RESEARCH_ONLY; do not promote. |
| CryptoCompressionBreakout | browser Donchian/compression formula | no matching scanner evaluator found | RESEARCH_ONLY; do not promote. |
| CryptoSwingContinuation | browser EMA continuation formula | scanner has differently named crypto trend-pullback | RESEARCH_ONLY; do not claim equivalence. |
| CryptoReversalExhaustion | browser reversal formula | distinct RESEARCH/SHADOW scanner evaluator | DUAL RESEARCH; fixture approval required. |
| CryptoMomentumBreakout | browser Keltner/volume formula | no matching scanner evaluator found | RESEARCH_ONLY; do not promote. |
| FXMicroScalper / SessionORB | browser-only | none proven | RESEARCH_ONLY. |
| MacroYieldDifferential | incomplete deterministic event context | none proven | BLOCKED; do not invent macro history. |

## Execution semantics
When OHLC touches stop and target and no ordering evidence exists, the frozen default is conservative stop-first. This is a correctness decision, not an optimization. Derived resolutions requiring lower-timeframe or tick evidence must not guess when evidence is absent.

## Provenance semantics
Historical simulation can emit price-touch and simulated events only. Broker fill, protection, and close confirmation require actual broker observations.
