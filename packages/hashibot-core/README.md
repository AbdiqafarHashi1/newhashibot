# `@hashibot/core`

Platform-independent HashiBot demo business contracts and canonical engine facade. Modules accept values and explicit ports; they do not know Edge Functions, Cloud Run, Pub/Sub, HTTP, or schedulers. Existing production handlers are unchanged and remain sole owners.

`strategy/canonical.ts` exposes the existing pure professional engines without copying or rewriting them. Other modules define immutable domain values and I/O ports needed to compose those engines in Phase 12. Service ownership boundaries are logical and do not imply identical deployments.
