#!/usr/bin/env bash
# Runs ON THE SERVER. The GitHub Actions pipeline starts it (through AWS
# Systems Manager) right after the new code has been fetched. It validates the
# configuration, rebuilds, waits for every service to report healthy, and
# automatically rolls back to the previous version if the new one doesn't come
# up healthy.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/ballotique}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
HEALTH_TRIES="${HEALTH_TRIES:-36}"        # 36 tries x 5 s = 3 minutes
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"
PREV_COMMIT="${PREV_COMMIT:-}"            # set by the pipeline: what was live before
BUILD_LOG="${BUILD_LOG:-/tmp/ballotique-build.log}"

cd "$APP_DIR"

# Only one deploy at a time.
exec 9>"${LOCK_FILE:-/tmp/ballotique-deploy.lock}"
if ! flock -n 9; then
  echo "Another deploy is already running - aborting."
  exit 1
fi

NEW_COMMIT=$(git rev-parse --short HEAD)
echo "Deploying ${NEW_COMMIT} (previous: ${PREV_COMMIT:0:7})"

set -a
# shellcheck disable=SC1091
. ./.env          # provides DOMAIN for the health check
set +a

echo "1/4 Validating configuration..."
if ! "${COMPOSE[@]}" config --quiet; then
  echo "Configuration is invalid - nothing was changed."
  if [ -n "$PREV_COMMIT" ]; then git reset --hard --quiet "$PREV_COMMIT"; fi
  exit 1
fi

build_and_start() {
  if ! "${COMPOSE[@]}" up -d --build >"$BUILD_LOG" 2>&1; then
    echo "Build or start failed. Last lines of the build log:"
    tail -n 40 "$BUILD_LOG"
    return 1
  fi
}

# Healthy = the gateway's own status endpoint says every service is up,
# checked through Caddy exactly the way a visitor would reach it.
wait_healthy() {
  local i
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS --max-time 8 --resolve "${DOMAIN}:443:127.0.0.1" \
         "https://${DOMAIN}/api/status" 2>/dev/null | grep -q '"overall":"operational"'; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

echo "2/4 Building and starting (this takes a few minutes)..."
if build_and_start; then
  echo "3/4 Waiting for every service to report healthy..."
  if wait_healthy; then
    echo "4/4 Cleaning up old images..."
    docker image prune -f >/dev/null || true
    echo "Deploy OK - ${NEW_COMMIT} is live."
    exit 0
  fi
fi

echo "!! The new version did not come up healthy."
if [ -n "$PREV_COMMIT" ] && [ "$PREV_COMMIT" != "$(git rev-parse HEAD)" ]; then
  echo "Rolling back to ${PREV_COMMIT:0:7}..."
  git reset --hard --quiet "$PREV_COMMIT"
  if build_and_start && wait_healthy; then
    echo "Rollback OK - the previous version is live again."
  else
    echo "!! Rollback ALSO failed - manual attention needed."
  fi
else
  echo "There is no previous version to roll back to."
fi
exit 1