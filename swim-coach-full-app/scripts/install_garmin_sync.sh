#!/bin/bash
# Instala la sincronización Garmin → SwimCoach en el Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/ysd99v8fny-sketch/Swimcoach/main/swim-coach-full-app/scripts/install_garmin_sync.sh | bash
#
# - Copia garmin_sync.py a ~/.swimcoach/
# - Pide tu código de acceso de SwimCoach (APP_SECRET) y lo guarda en
#   ~/.swimcoach/config.json con permisos 600 (solo tu usuario)
# - Hace un primer backfill de 30 días
# - Programa launchd para sincronizar cada 3 horas (y al encender/despertar)
set -euo pipefail

BRANCH="${SWIMCOACH_BRANCH:-main}"
RAW="https://raw.githubusercontent.com/ysd99v8fny-sketch/Swimcoach/${BRANCH}/swim-coach-full-app/scripts"
APP_URL="${SWIMCOACH_URL:-https://swimcoach-two.vercel.app}"
DIR="$HOME/.swimcoach"
LABEL="com.swimcoach.garminsync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

UV="$(command -v uv || true)"
for c in "$HOME/.local/bin/uv" "$HOME/.cargo/bin/uv" /opt/homebrew/bin/uv /usr/local/bin/uv; do
  [ -z "$UV" ] && [ -x "$c" ] && UV="$c"
done
if [ -z "$UV" ]; then
  echo "No encuentro 'uv'. Instálalo con: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi
if [ ! -d "$HOME/.garminconnect" ]; then
  echo "No hay sesión de Garmin en ~/.garminconnect. Ejecuta antes garmin-mcp-auth." >&2
  exit 1
fi

mkdir -p "$DIR"
curl -fsSL "$RAW/garmin_sync.py" -o "$DIR/garmin_sync.py"

if [ ! -f "$DIR/config.json" ]; then
  printf "Código de acceso de SwimCoach (el mismo que pide la app): "
  read -rs SECRET < /dev/tty
  echo
  umask 077
  SECRET="$SECRET" APP_URL="$APP_URL" "$UV" run --quiet --no-project python -c \
    'import json,os; print(json.dumps({"url": os.environ["APP_URL"], "secret": os.environ["SECRET"]}))' > "$DIR/config.json"
  chmod 600 "$DIR/config.json"
fi

echo "Primer backfill (30 días)…"
"$UV" run --quiet "$DIR/garmin_sync.py" --days 30

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$UV</string><string>run</string><string>--quiet</string>
    <string>$DIR/garmin_sync.py</string>
  </array>
  <key>StartInterval</key><integer>10800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/sync.log</string>
  <key>StandardErrorPath</key><string>$DIR/sync.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Listo. Se sincroniza cada 3 h. Registro: $DIR/sync.log"
echo "Para desinstalar: launchctl bootout gui/\$(id -u)/$LABEL && rm $PLIST"
