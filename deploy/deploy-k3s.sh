#!/usr/bin/env bash
# k3s version of deploy/deploy.sh. Same contract: the pipeline fetches the new code, sets
# PREV_COMMIT, and runs this script on the server; it must exit non-zero on failure.
# Steps: build images -> import into k3s -> apply manifests -> wait for rollout ->
# check /api/status through HTTPS -> roll back automatically if anything fails.
set -euo pipefail
APP_DIR="${APP_DIR:-$HOME/ballotique}"
PREV_COMMIT="${PREV_COMMIT:-}"
HEALTH_TRIES="${HEALTH_TRIES:-36}"; HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"
BUILD_LOG="${BUILD_LOG:-/tmp/ballotique-build.log}"
NS=ballotique
KC=(k3s kubectl -n "$NS")
DEPLOYMENTS=(auth-service voting-service tally-service api-gateway frontend)
cd "$APP_DIR"

exec 9>"${LOCK_FILE:-/tmp/ballotique-deploy.lock}"
flock -n 9 || { echo "Another deploy is already running - aborting."; exit 1; }

TAG=$(git rev-parse --short HEAD)
echo "Deploying ${TAG} to k3s (previous: ${PREV_COMMIT:0:7})"
set -a; . ./.env; set +a

RENDER=$(mktemp -d); trap 'rm -rf "$RENDER"' EXIT
for f in k8s/[0-9]*.yaml; do
  sed -e "s/IMAGE_TAG/${TAG}/g" -e "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$f" > "$RENDER/$(basename "$f")"
done

echo "1/5 Validating manifests..."
if ! k3s kubectl apply --dry-run=client -f "$RENDER" >/dev/null; then
  echo "Manifests are invalid - nothing was changed."
  [ -n "$PREV_COMMIT" ] && git reset --hard --quiet "$PREV_COMMIT"
  exit 1
fi

build_images() {
  local svc ctx
  : > "$BUILD_LOG"
  for svc in "${DEPLOYMENTS[@]}"; do
    case $svc in
      api-gateway) ctx=api-gateway ;;
      frontend)    ctx=frontend ;;
      *)           ctx=services/$svc ;;
    esac
    docker build -q -t "ballotique/$svc:${TAG}" "$ctx" >>"$BUILD_LOG" 2>&1 || { tail -n 40 "$BUILD_LOG"; return 1; }
  done
  # k3s uses containerd, not Docker: hand the freshly built images over.
  docker save $(for s in "${DEPLOYMENTS[@]}"; do echo "ballotique/$s:${TAG}"; done) | sudo k3s ctr images import - >>"$BUILD_LOG" 2>&1
}

apply_and_wait() {
  k3s kubectl apply -f "$RENDER" >/dev/null
  local d
  for d in "${DEPLOYMENTS[@]}"; do
    "${KC[@]}" rollout status "deployment/$d" --timeout=300s || return 1
  done
}

wait_healthy() {
  local i
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS --max-time 8 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/status" 2>/dev/null \
       | grep -q '"overall":"operational"'; then return 0; fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

echo "2/5 Building images..."
if build_images; then
  echo "3/5 Applying manifests and waiting for rollout..."
  if apply_and_wait; then
    echo "4/5 Waiting for /api/status to report operational..."
    if wait_healthy; then
      echo "5/5 Cleaning up old images..."
      docker image prune -f >/dev/null || true
      sudo k3s crictl rmi --prune >/dev/null 2>&1 || true
      echo "Deploy OK - ${TAG} is live."
      exit 0
    fi
  fi
fi

echo "!! The new version did not come up healthy. Rolling back..."
for d in "${DEPLOYMENTS[@]}"; do "${KC[@]}" rollout undo "deployment/$d" >/dev/null 2>&1 || true; done
[ -n "$PREV_COMMIT" ] && git reset --hard --quiet "$PREV_COMMIT"
if wait_healthy; then echo "Rollback OK - the previous version is live again."
else echo "!! Rollback ALSO failed - manual attention needed (k3s kubectl -n $NS get pods)."; fi
exit 1
