#!/bin/bash
# deploy.sh — Deploy ZivaBasa to cPanel VPS
# Usage: ./admin/deploy.sh [commit message]
#
# Prerequisites:
#   - SSH key at admin/.ssh/id_rsa must be authorized on the VPS
#   - Git repo must be pushed to origin/main (cPanel auto-deploys on push)
#
# This script:
#   1. Commits any pending changes
#   2. Pushes to origin (triggers cPanel deployment)
#   3. Verifies deployment via SSH

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS_HOST="172.93.106.10"
VPS_USER="uat"
VPS_DIR="/home/uat/repositories/ZivaBasa-MVP"
SSH_KEY="$REPO_ROOT/admin/.ssh/id_rsa"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

ssh_cmd() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
}

# --- Pre-flight ---
[ -f "$SSH_KEY" ] || err "SSH key not found at $SSH_KEY"
cd "$REPO_ROOT"

# --- Step 1: Commit changes (if any) ---
if [[ -n "$(git status --porcelain)" ]]; then
  MSG="${1:-deploy: $(date +%Y-%m-%d\ %H:%M)}"
  log "Committing changes: $MSG"
  git add -A
  git commit -m "$MSG"
else
  log "No uncommitted changes."
fi

# --- Step 2: Push to origin (triggers cPanel auto-deploy) ---
log "Pushing to origin/main..."
git push origin main

# --- Step 3: Wait and verify ---
log "Waiting 10s for deployment to start..."
sleep 10

log "Checking PM2 status on VPS..."
ssh_cmd "pm2 list" || warn "Could not SSH to VPS for status check"

log "Checking backend health..."
HEALTH=$(curl -sk --max-time 15 "https://diplomatic-onyx-antelope.172-93-106-10.cpanel.site:8443/health" 2>/dev/null || echo "unreachable")
if echo "$HEALTH" | grep -q "ok\|healthy"; then
  log "Backend is healthy: $HEALTH"
else
  warn "Backend health check returned: $HEALTH"
  warn "This may be normal if the backend is still loading TensorFlow (2-10 min)."
fi

log "Deployment complete."
