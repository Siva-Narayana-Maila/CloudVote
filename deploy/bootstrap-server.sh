#!/usr/bin/env bash
# ONE-TIME setup, run by hand on the server. Connects the existing
# ~/ballotique folder to your private GitHub repository using a read-only
# deploy key, so the pipeline can fetch new code.
#
# Usage:  bash bootstrap-server.sh YOUR-GITHUB-USERNAME/ballotique
set -euo pipefail

REPO="${1:?Usage: bash bootstrap-server.sh GITHUB-USERNAME/REPO-NAME}"
REPO_URL="git@github.com:${REPO}.git"
APP_DIR="${APP_DIR:-$HOME/ballotique}"
KEY="$HOME/.ssh/ballotique_deploy"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# 1. A key that can only READ this one repository.
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "ballotique-deploy@$(hostname)" -f "$KEY" >/dev/null
  echo "Created a new deploy key."
fi

echo
echo "=== Add this PUBLIC key to GitHub as a DEPLOY KEY ==="
echo "Repository -> Settings -> Deploy keys -> Add deploy key."
echo "Give it any title and LEAVE 'Allow write access' UNTICKED."
echo
cat "$KEY.pub"
echo
if [ -z "${NONINTERACTIVE:-}" ]; then
  read -r -p "Press Enter once you have added the key on GitHub... " _
fi

# 2. Tell ssh to use that key for github.com, and to trust GitHub's host key.
if ! grep -q "ballotique_deploy" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<SSHCFG
Host github.com
  IdentityFile $KEY
  IdentitiesOnly yes
SSHCFG
fi
chmod 600 "$HOME/.ssh/config"
if ! ssh-keygen -F github.com -f "$HOME/.ssh/known_hosts" >/dev/null 2>&1; then
  ssh-keyscan -t ed25519,rsa github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
fi

# 3. Check GitHub accepts the key. (ssh exits with status 1 even on success,
#    so look at its message instead of its exit code.)
SSH_OUT=$(ssh -T -o BatchMode=yes git@github.com 2>&1 || true)
if ! echo "$SSH_OUT" | grep -q "successfully authenticated"; then
  echo "GitHub did not accept the key. Check that you pasted the whole public key above"
  echo "as a deploy key on the right repository, then run this script again."
  echo "GitHub said: $SSH_OUT"
  exit 1
fi
echo "GitHub accepted the deploy key."

# 4. Turn the existing folder into a checkout of the repository. Untracked and
#    ignored files (your .env and the Docker data volumes) are left untouched.
mkdir -p "$APP_DIR"
cd "$APP_DIR"
[ -d .git ] || git init -q -b main
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git fetch --quiet origin main
git reset --hard --quiet origin/main

for f in docker-compose.prod.yml deploy/deploy.sh; do
  if [ ! -f "$f" ]; then
    echo "Expected file $f is missing from the repository - did the first push finish?"
    exit 1
  fi
done
[ -f .env ] || echo "WARNING: .env was not found in $APP_DIR - the site needs it to start."

echo
echo "Done. This server now tracks ${REPO} (branch main) at commit $(git rev-parse --short HEAD)."