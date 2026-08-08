#!/usr/bin/env bash
set -euo pipefail

display_number="${DISPLAY_NUMBER:-99}"
vnc_port="${VNC_PORT:-5900}"
novnc_port="${NOVNC_PORT:-6080}"
app_port="${APP_PORT:-4173}"
display=":${display_number}"

cleanup() {
  kill "${playwright_pid:-}" "${websockify_pid:-}" "${x11vnc_pid:-}" "${xvfb_pid:-}" "${http_server_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if ! curl --silent --fail "http://127.0.0.1:${app_port}/party.html" >/dev/null; then
  python3 -m http.server "$app_port" >/tmp/hitster-http.log 2>&1 &
  http_server_pid=$!
  until curl --silent --fail "http://127.0.0.1:${app_port}/party.html" >/dev/null; do :; done
fi

Xvfb "$display" -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
xvfb_pid=$!

until xdpyinfo -display "$display" >/dev/null 2>&1; do :; done

x11vnc -display "$display" -forever -shared -rfbport "$vnc_port" -nopw -quiet &
x11vnc_pid=$!

websockify --web=/usr/share/novnc "$novnc_port" "localhost:${vnc_port}" &
websockify_pid=$!

echo "Open the forwarded port ${novnc_port} and visit /vnc.html?autoconnect=true&resize=scale"
echo "Then complete Spotify login in the Playwright browser. Do not send credentials or codes in chat."

DISPLAY="$display" node scripts/interactive-party-login.mjs &
playwright_pid=$!
wait "$playwright_pid"