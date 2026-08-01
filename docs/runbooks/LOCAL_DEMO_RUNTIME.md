# Local Demo Runtime

Run `npm run test:runtime-services` and `npm run test:local-demo-runtime`. These use fixture prices, an in-memory append-first adapter and explicitly constructed deterministic providers. They require no credentials and make no network/provider/Supabase call. Outcomes and receipts are asserted for all four demo routes. Never substitute live credentials or treat local state as truth.
