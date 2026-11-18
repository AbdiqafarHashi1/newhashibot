# Frozen experiment metadata correction

The frozen experiment description mistakenly called the MicroScalper baseline target
1.5 R (the evaluator fallback). The actual unchanged production runtime resolves the
baseline to **1.8 R**, with stop ATR multiplier **1.4** and TP1 **1.2 R** through
`microScalperRuntimeParams`. The candidate remains the frozen explicit **2.4 R**.
No parameters were selected again after viewing the reserved October period.
The original freeze is retained rather than rewritten. Older run JSON field
`experiment.microTp2: 1.5` is a description error, not the actual evaluated target;
new result publication corrects that field explicitly.

All initial screens are provisional: OHLC costs/specifications are documented
assumptions, not historically certified venue contracts. January–March 2025 were
previously exposed research periods. October 20–27, 2026 was reserved for this
bounded comparison, but has now been observed and may not be reused as an
untouched optimization holdout. No strategy is promoted by these results.

Historical account grade now preserves the frozen plan's diagnostic grade instead
of deriving it again from score. The two rules agreed for every recorded setup in
the four baseline cohorts (January, February, March, October); this change prevents
future divergence without changing those recorded decisions.
