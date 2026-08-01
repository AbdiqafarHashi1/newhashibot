# Google Cloud demo infrastructure

**Implemented/deploy-ready:** a pinned-provider Terraform demo root creates required APIs, seven dedicated service accounts, one private immutable Artifact Registry repository, secret containers, nine topics and DLQs, filtered subscriptions, five internal-only Cloud Run services, paused schedulers, a mutation log metric/alert, and a trial-sized budget. Runtime accounts are distinct from the existing build/deployment identity. No JSON keys, public invokers, Owner, or Editor grants exist.

**Not provisioned by this repository run:** every external Google resource. VPC, NAT, static egress, load balancing, Cloud Armor, and the MT5 Windows VM remain blocked for later controlled phases. Secret values are always manual.
