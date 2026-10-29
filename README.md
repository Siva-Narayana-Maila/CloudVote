# CloudVote — Secure Cloud-Based Voting System

Cloud-native e-voting platform built with a microservices architecture,
matching the Review-1 proposal (see `docs/`).

## Architecture

```
Client (React) → API Gateway → ┬─ Auth Service    (JWT + MFA, user DB)
                                ├─ Voting Service  (duplicate-vote prevention, ballot processing)
                                └─ Tally Service   (aggregation, live results)
                                        │
                                PostgreSQL (users table + hash-chained, append-only vote_ledger table)
```

## Repo layout

```
cloudvote/
├── api-gateway/          Express reverse-proxy: routing, rate limiting, JWT verification
├── services/
│   ├── auth-service/     Registration, login, JWT issuance, MFA
│   ├── voting-service/   Ballot casting, duplicate prevention, writes to vote_ledger
│   └── tally-service/    Vote aggregation, live results, ledger integrity check
├── frontend/             React app (matches the CloudVote UI in the design PDF)
├── k8s/                  Kubernetes manifests (Deployments, Services, Ingress) for GKE
├── docs/                 Design decisions (incl. Postgres-ledger-vs-DynamoDB note)
└── docker-compose.yml    Local dev: spins up Postgres + all 3 services + gateway together
```

## Build order

1. `services/auth-service` — nothing else works without auth
2. `services/voting-service` — depends on auth's JWT
3. `services/tally-service` — reads what voting-service writes
4. `api-gateway` — wires the three together behind one port
5. `frontend` — talks only to the gateway
6. `docker-compose.yml` — run everything together locally
7. `k8s/` — deploy to GKE

## Local development

```bash
docker compose up --build
```

Frontend: http://localhost:3000 · Gateway: http://localhost:8080

## Cloud

Deployed on **AWS**: an EC2 instance running the Docker Compose stack behind
Caddy (automatic HTTPS). See `docs/design-decisions.md` for why AWS, why
PostgreSQL instead of QLDB, and how each component maps to AWS managed
services.