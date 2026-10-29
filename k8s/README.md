# Kubernetes manifests (not used in the current deployment)

The live deployment runs on a single AWS EC2 instance with Docker Compose
(`docker-compose.prod.yml`). Kubernetes was deliberately not used for the
demo: Amazon EKS charges a per-cluster fee (about $0.10/hour) before any
worker nodes are added.

If Kubernetes is required later, every service already reads its database
URL, secrets and peer-service addresses from environment variables, so
manifests only need to supply the same variables. Options: k3s on the EC2
instance, or EKS created for a short window and torn down afterwards.