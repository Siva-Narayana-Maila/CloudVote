# Kubernetes manifests (deferred — not needed yet)

This folder is intentionally empty for now. You're running everything via
`docker-compose.yml` locally, which is enough to build and demo the entire
project without touching the cloud or GCP billing at all.

When you're ready to deploy to GKE, this is what will go here — and thanks
to how the services are built (every service reads its DB URL, JWT secret,
and peer-service URLs from environment variables — never hardcoded), moving
here should mostly be config, not code changes:

```
k8s/
├── namespace.yaml
├── postgres-statefulset.yaml   # or swap for managed Cloud SQL (recommended)
├── auth-service-deployment.yaml
├── auth-service-service.yaml
├── voting-service-deployment.yaml
├── voting-service-service.yaml
├── tally-service-deployment.yaml
├── tally-service-service.yaml
├── api-gateway-deployment.yaml
├── api-gateway-service.yaml
├── frontend-deployment.yaml
├── ingress.yaml                # public entry point + TLS
└── secrets.yaml                # JWT_SECRET, DB credentials (use Secret Manager in practice)
```

Each service's Deployment will set the same environment variable names
already used in `docker-compose.yml` — e.g. `DATABASE_URL`,
`AUTH_SERVICE_URL` — just pointed at Kubernetes Service DNS names
(`http://auth-service.cloudvote.svc.cluster.local:4001`) or a managed Cloud
SQL connection string instead of the local `postgres` container.

Come back to this folder when you're ready — say the word and we'll go
through it step by step, the same way we did the rest of the project.
