# Bearish mirror result

The separately declared bearish extension reached 0.9671 selected entries/day but failed its quality screen:585 closed trades, net PF0.9437, stress0.8757. It remains disabled/research-only. The observed-settlement-rate audit also failed:net PF0.9865, stress0.9344. Full periods, assets, samples, assumptions, caveats and operator instructions are in `../ten-asset/README.md`.

This profile adds the bearish variant to the original two families without pretending mirrors are independent strategies. It uses current-close ranked admission, shared symbol/concentration locks, exact frozen source lineage and the existing canonical replay/store path. Long and short gates are mutually exclusive on the same BTC prefix. No direction flip, quota relaxation, publication or execution is authorized.
