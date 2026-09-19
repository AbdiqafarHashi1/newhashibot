# Prop authority ownership

- **Runtime Prop execution policy:** `account-execution-brain/mt5-prop-brain` through `AccountExecutionController`. It owns allow, reduce-risk, block, lock, sizing authorization, and runtime reason codes.
- **Historical challenge and funded simulation:** `professionalPropEngine` through `fullPropPipelineReplay`. It owns versioned profiles, historical phase progression, challenge/funded evidence, and rolling attempts.
- **Legacy/overlapping logic:** `propRulesEngine` is compatibility-only. It must not be composed with either authority to produce a second decision or certification claim.

Unknown profile rules remain unknown. Historical replay is not broker forward evidence.
