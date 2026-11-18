# Execution diagnostic correction

The legacy provider decision codes are not an exclusive filter taxonomy:
- Binance `SKIPPED_LOW_CONFIDENCE` is also returned for insufficient margin.
- Binance `SKIPPED_MAX_POSITIONS_REACHED` is also returned when open portfolio risk exhausts its budget.

Therefore older published counters with those names cannot establish how many
opportunities were lost to confidence thresholds or position-count limits.
They remain the original provider codes, not relabeled evidence.

The authority now additionally exposes the actual violated rule ID, category,
severity and message. Historical account diagnostics retain those IDs with a
`BRAIN_RULE:` prefix. Execution eligibility, sizing, risk bounds and all legacy
codes are unchanged. The added test forces insufficient margin and requires the
real rule to remain identifiable.

Account-count capacity, capital/margin capacity and portfolio-risk capacity must
be measured separately before changing an execution policy. No production cap
is removed on the basis of ambiguous legacy counters.
