#!/usr/bin/env bash
# ============================================================
#  CampusBiz Autopilot - one-click launcher (wrapper route)
#  Run from Git Bash:   ./start-campusbiz.sh
#
#  Starts the wrapper (:8787) and the bridge (:3333) in the
#  background, waits for both to be healthy, then opens the
#  dashboard. Press Ctrl+C to stop both.
# ============================================================
set -u

WRAPPER_DIR="/c/Users/HP/workbuddy2api"
BRIDGE_DIR="/c/Users/HP/campusbiz-output"
PY="C:/Users/HP/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe"
ELECTRON="C:/Users/HP/AppData/Local/Programs/WorkBuddyAI/WorkBuddyAI.exe"

ok()   { printf '  \033[32m%s\033[0m\n' "$1"; }
bad()  { printf '  \033[31m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

echo
echo "  CampusBiz Autopilot - starting..."
echo

# --- sanity checks ---
[ -f "$WRAPPER_DIR/core/converter.py" ] || { bad "[X] wrapper not found at $WRAPPER_DIR"; exit 1; }
[ -f "$BRIDGE_DIR/bridge-server.js" ]  || { bad "[X] bridge-server.js not found at $BRIDGE_DIR"; exit 1; }
[ -x "$PY" ] || [ -f "$PY" ]           || { bad "[X] python not found at $PY"; exit 1; }

cleanup() {
  echo
  info "Shutting down..."
  [ -n "${W_PID:-}" ] && kill "$W_PID" 2>/dev/null && ok "wrapper stopped"
  [ -n "${B_PID:-}" ] && kill "$B_PID" 2>/dev/null && ok "bridge stopped"
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# --- 1. wrapper ---
info "[1/3] starting wrapper on :8787 ..."
(
  cd "$WRAPPER_DIR" || exit 1
  export WORKBUDDY_BACKEND="https://www.workbuddy.ai"
  export WORKBUDDY_ELECTRON_PATH="$ELECTRON"
  exec "$PY" -c "import sys; sys.argv=['converter','--port','8787','--skip-check']; sys.path.insert(0,'.'); from core.converter import main; main()"
) > /tmp/campusbiz-wrapper.log 2>&1 &
W_PID=$!

# --- 2. bridge ---
info "[2/3] starting bridge on :3333 ..."
(
  cd "$BRIDGE_DIR" || exit 1
  exec node bridge-server.js
) > /tmp/campusbiz-bridge.log 2>&1 &
B_PID=$!

# --- 3. wait for health ---
info "[3/3] waiting for both services ..."
probe() {
  node -e "const h=require('http');const r=h.get('$1',s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(900,()=>{r.destroy();process.exit(1)});" >/dev/null 2>&1
}
UP=0
for i in $(seq 1 20); do
  sleep 2
  if probe "http://127.0.0.1:8787/v1/models" && probe "http://127.0.0.1:3333/api/health"; then
    UP=1; break
  fi
done

if [ "$UP" -ne 1 ]; then
  echo
  bad "[!] services did not come up within ~40s"
  info "wrapper log: /tmp/campusbiz-wrapper.log"
  info "bridge  log: /tmp/campusbiz-bridge.log"
  echo
  tail -12 /tmp/campusbiz-wrapper.log 2>/dev/null
  tail -12 /tmp/campusbiz-bridge.log 2>/dev/null
  cleanup
fi

echo
ok "BOTH SERVICES ARE UP"
info "wrapper : http://127.0.0.1:8787/v1"
info "bridge  : http://127.0.0.1:3333"
info "dashboard badge should read CONNECTED, mode = openai"
echo

# open the dashboard (best effort)
if command -v start >/dev/null 2>&1; then
  start "" "$BRIDGE_DIR/campusbiz-live.html" 2>/dev/null
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$BRIDGE_DIR/campusbiz-live.html" 2>/dev/null
else
  info "open this file manually: $BRIDGE_DIR/campusbiz-live.html"
fi

info "Press Ctrl+C to stop both services."
wait
