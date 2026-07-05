# V2 Forex Strategies

The forex strategies are implemented in `v2/strategies/index.ts` through the shared professional framework. They are session aware and use forex-specific volatility/RR assumptions.

- `forex.london-breakout`: trades only London/Asia-London conditions with Asian range structure and expansion confirmation.
- `forex.trend-pullback`: trades liquid London/New York sessions with trend and pullback quality filters.
- `forex.new-york-continuation`: requires New York open/overlap, trend continuation and no counter-trend state.
- `forex.swing-continuation`: longer-duration 1h/4h continuation requiring HTF alignment, structure and stronger RR.
