# HashiBot V2

Standalone future application workspace. V2 is independent from V1 and currently contains contracts, interfaces, placeholders, and contract tests only. No production trading behavior, live execution, Supabase migrations, or production wiring exists here.

## Boundaries
- `apps/`: customer/admin/Telegram platform placeholders.
- `services/`: future runtime services; no trading behavior yet.
- `packages/`: shared contracts and pure definitions.
- `execution/`: adapter and command queue contracts plus mock adapter only.
- `hashibridge/`: protocol contracts and desktop/EA placeholders.
- `strategies/`: strategy interface and empty strategy modules.
