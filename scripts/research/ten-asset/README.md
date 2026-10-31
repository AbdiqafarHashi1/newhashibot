# Ten-asset study inputs

Run `python3 scripts/research/ten-asset/acquire.py ../research-data/ten-asset` to verify/reuse or fetch the fixed native archive set. It uses bounded public GET requests, vendor checksums, atomic files and no credentials. A first acquisition attempt incorrectly assumed one stream read returned the complete HTTP body; checksum verification rejected it. The reader now consumes bounded chunks, and all 189 archives must verify. No checksum gate was relaxed.

Run the bundled `study.ts` from repository root. It uses the existing TypeScript registry, qualification, arbitrator, scanner selection and lifecycle. It is not a Python approximation or a production runtime. Fixed universe, dates, cost reserves, eligibility rules and gates are in `protocol.json`.

The first compute attempt was interrupted after a connected mixed-timeframe fixture exposed a daily/intraday cutoff defect. Its checkpoint is preserved in the evidence folder, excluded from final counts. The corrected profile uses each dataset's available next-open boundary; old profiles preserve their previous behavior.

The `fixture.py` command creates eleven real datasets (two Spot daily histories plus BTC reference and eight USD-M alt histories) for injected endpoint/store/runtime tests. Passing those tests is not real Auth/PostgREST/RLS or multi-session PostgreSQL proof.
