#!/usr/bin/env bash
# Run on the server once (and again whenever .env changes). Turns ~/ballotique/.env into
# the Kubernetes Secret used by the pods. Nothing secret is stored in git.
set -euo pipefail
cd "${APP_DIR:-$HOME/ballotique}"
k3s kubectl apply -f k8s/00-namespace.yaml
k3s kubectl -n ballotique create secret generic ballotique-env \
  --from-env-file=.env --dry-run=client -o yaml | k3s kubectl apply -f -
echo "Secret ballotique-env updated."
