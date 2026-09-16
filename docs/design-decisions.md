# Design Decisions

This document records two deviations from the Review-1 slide deck's literal
technology list, and the reasoning behind each — useful to cite directly in
your Review-2 report or viva.

## 1. Vote Ledger: Hash-Chained PostgreSQL instead of DynamoDB / AWS QLDB

**Slide 7 lists:** `Vote Storage: DynamoDB / AWS QLDB`

**Implemented as:** an append-only `vote_ledger` table inside the same
PostgreSQL instance already used for user data, where every row stores
`current_hash = SHA256(previous_hash + vote_payload + timestamp)`, forming a
hash chain identical in principle to a blockchain or AWS QLDB's ledger.
Database-level privileges revoke `UPDATE` and `DELETE` on the table for the
application role, so tampering is only possible by breaking the hash chain
— which the Tally Service detects and reports (see the "Ledger integrity
100%" indicator in the UI design).

**Why:**
- **Functionally equivalent.** The core requirement — tamper-evident,
  append-only vote storage with independent verifiability — is satisfied by
  hash-chaining exactly as it is by QLDB's cryptographic digest.
- **Cost.** QLDB/DynamoDB add a second managed database and separate
  billing (~$15–40/month minimum at small scale even within free-tier
  limits); a single Postgres instance is $0 marginal cost.
- **Portability.** QLDB is AWS-only, which would force the whole project
  onto AWS and forfeit the GKE cost advantage described below.
- **Simplicity.** One database, one connection pool, one backup strategy —
  appropriate for a project of this scope.

## 2. Cloud Provider: Google Cloud Platform (GKE) instead of AWS

**Slide 7 lists:** `Cloud: AWS / GCP` (either was acceptable)

**Chosen: GCP**, specifically Google Kubernetes Engine (GKE), because:

| Factor | AWS (EKS) | GCP (GKE) |
|---|---|---|
| K8s control plane | $0.073/hr flat (~$53/mo) per cluster, always billed | One zonal cluster's control plane free |
| New account credit | Varies by promo | $300 credit, 90 days |
| Free compute tier | Limited | Always-free e2-micro instance |
| Ledger dependency | QLDB is AWS-exclusive | N/A — Postgres runs anywhere |

Since Kubernetes orchestration is a stated requirement (Slide 3, 7), the
control-plane cost difference is the single largest recurring line item in
the budget — making GCP the clear cost-minimal choice without compromising
any stated requirement.
