#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$HOME/python/Academic/GDGchatbot專案/GDG-ChatBot}"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

log() {
  printf '[deploy] %s\n' "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { log "missing command: $1"; exit 1; }
}

log "repo: $REPO_ROOT"
need_cmd systemctl
need_cmd python3
need_cmd curl

if [ ! -d "$REPO_ROOT/.git" ]; then
  log "repo not found: $REPO_ROOT"
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  log "warning: backend .env is missing ($BACKEND_DIR/.env)"
fi

# ---- backend bootstrap ----
log "backend: bootstrap venv + deps"
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  python3 -m venv "$BACKEND_DIR/.venv"
fi
# shellcheck disable=SC1091
source "$BACKEND_DIR/.venv/bin/activate"
pip install --upgrade pip >/tmp/gdg_backend_pip_upgrade.log 2>&1
pip install -r "$BACKEND_DIR/requirements.txt" >/tmp/gdg_backend_pip_install.log 2>&1
deactivate

# ---- frontend bootstrap ----
log "frontend: bootstrap node deps"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
fi
need_cmd node
need_cmd npm
npm --prefix "$FRONTEND_DIR" install >/tmp/gdg_frontend_npm_install.log 2>&1

# ---- rewrite user services (idempotent) ----
mkdir -p "$HOME/.config/systemd/user"

cat > "$HOME/.config/systemd/user/gdgchatbot-backend.service" <<UNIT
[Unit]
Description=GDG ChatBot Backend (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$BACKEND_DIR
ExecStart=$BACKEND_DIR/.venv/bin/uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT
Environment=PYTHONUNBUFFERED=1
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT

cat > "$HOME/.config/systemd/user/gdgchatbot-frontend.service" <<UNIT
[Unit]
Description=GDG ChatBot Frontend (Next.js)
After=network-online.target gdgchatbot-backend.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$FRONTEND_DIR
ExecStart=/bin/bash -lc 'source ~/.nvm/nvm.sh && npm run dev -- --hostname 0.0.0.0 --port $FRONTEND_PORT'
Environment=NODE_ENV=development
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT

if [ -x "$HOME/.local/bin/cloudflared" ]; then
  cat > "$HOME/.config/systemd/user/gdgchatbot-tunnel.service" <<UNIT
[Unit]
Description=GDG ChatBot Tunnel (Cloudflared)
After=network-online.target gdgchatbot-frontend.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=$HOME/.local/bin/cloudflared tunnel --url http://127.0.0.1:$FRONTEND_PORT --no-autoupdate --protocol http2 --metrics 127.0.0.1:43101
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT
else
  log "cloudflared not found at ~/.local/bin/cloudflared, tunnel service will not be updated"
fi

# ---- restart services ----
log "restart services"
systemctl --user daemon-reload
systemctl --user restart gdgchatbot-backend.service gdgchatbot-frontend.service
if [ -x "$HOME/.local/bin/cloudflared" ]; then
  systemctl --user restart gdgchatbot-tunnel.service
fi
sleep 5

# ---- checks ----
log "health checks"
backend_code="$(curl -sS -o /tmp/gdg_backend_health.json -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/health" || true)"
front_code="$(curl -sS -o /tmp/gdg_front_root.html -w '%{http_code}' "http://127.0.0.1:$FRONTEND_PORT/" || true)"

printf 'backend /health: %s\n' "$backend_code"
printf 'frontend /: %s\n' "$front_code"

if [ "$backend_code" != "200" ]; then
  log "backend health failed"
  tail -n 80 /tmp/gdg_backend_health.json || true
  systemctl --user status gdgchatbot-backend.service --no-pager || true
  exit 1
fi

if [ "$front_code" != "200" ]; then
  log "frontend health failed"
  systemctl --user status gdgchatbot-frontend.service --no-pager || true
  exit 1
fi

log "systemd status"
systemctl --user is-active gdgchatbot-backend.service gdgchatbot-frontend.service
if systemctl --user is-active gdgchatbot-tunnel.service >/dev/null 2>&1; then
  systemctl --user is-active gdgchatbot-tunnel.service || true
  TUNNEL_URL="$(journalctl --user -u gdgchatbot-tunnel.service -n 200 --no-pager | grep -Eo 'https://[^ ]+trycloudflare.com' | tail -n 1 || true)"
  if [ -n "$TUNNEL_URL" ]; then
    printf 'tunnel: %s\n' "$TUNNEL_URL"
  fi
fi

log "done"
