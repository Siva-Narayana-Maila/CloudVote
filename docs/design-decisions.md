# Design Decisions

This document records the decisions that differ from the literal technology
list in the Review-1 slides, and the reasoning behind each.

## 1. Vote ledger: hash-chained PostgreSQL instead of DynamoDB / AWS QLDB

**Slide lists:** Vote storage: DynamoDB / AWS QLDB.

**Implemented as:** an append-only `vote_ledger` table in the same PostgreSQL
database used for everything else. Every row stores
`current_hash = SHA256(previous_hash | candidate | timestamp)`, so altering
any past row breaks every hash after it. The Tally Service independently
re-derives the whole chain to produce the "ledger integrity" figure, and
anyone can verify a single receipt on the public verification page.

**Why:**
- **QLDB is retired.** AWS ended support for Amazon QLDB on 31 July 2025 and
  recommends Aurora PostgreSQL for existing ledger workloads. Building on it
  would mean building on a discontinued service.
- **Functionally equivalent.** The requirement is tamper-evident, append-only,
  independently verifiable storage. A hash chain provides exactly that.
- **Simpler and cheaper.** One database, one backup strategy, no second
  managed service to pay for.
- **A natural fit on AWS.** The managed home for this database is Amazon RDS
  for PostgreSQL (or Aurora PostgreSQL) — the same direction AWS itself
  recommends for QLDB users.

## 2. Cloud provider: Amazon Web Services

**Slide lists:** AWS / GCP (either acceptable). **Chosen:** AWS.

**Why:**
- The managed-service catalogue maps directly onto this architecture
  (see the table below).
- The Mumbai region (ap-south-1) keeps latency low for users in India.
- New accounts receive promotional credits sufficient for a project this size.
- (Add any further reason of your own here, e.g. course alignment.)

**Cost-aware choices on AWS**
- The demo environment runs on a single EC2 instance with Docker Compose,
  not a managed Kubernetes cluster. Amazon EKS bills a per-cluster
  management fee (about $0.10/hour, roughly $73/month) before any worker
  nodes are added, which is disproportionate for a project this size.
- AWS charges $0.005/hour for every public IPv4 address, so exactly one is
  exposed (an Elastic IP) and everything else stays private.
- Only ports 80 and 443 are open to the internet. SSH is restricted to the
  administrator's IP, and the database and services have no public exposure.

**Note on the earlier GCP evaluation:** an earlier draft preferred GCP because
GKE's free-tier credit covers one cluster's management fee while EKS does not.
That argument applies to managed Kubernetes specifically; with the demo on
EC2 + Compose it no longer decides the choice.

## 3. How the running system maps to AWS managed services

| Component | Demo (today) | Production target |
|---|---|---|
| Compute | EC2 + Docker Compose | ECS on Fargate (or EKS) |
| Database | PostgreSQL container | Amazon RDS for PostgreSQL (Multi-AZ, automated backups) |
| Secrets | `.env` on the instance | AWS Secrets Manager |
| Container images | Built on the instance | Amazon ECR |
| TLS and edge | Caddy + Let's Encrypt | Application Load Balancer + AWS Certificate Manager |
| Health checks | `/health` endpoints | ALB / ECS health checks |
| Logs and alerts | `docker logs`, AWS Budgets | CloudWatch Logs and alarms |