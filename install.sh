#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
SETTINGS_PATH="$TARGET_AGENT_DIR/settings.json"

DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=1
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./install.sh [--dry-run]

Installs this folder as a local Pi package.
- Does NOT copy extensions/skills/themes into ~/.pi/agent
- Only registers this package path in ~/.pi/agent/settings.json

Environment:
- PI_SKIP_NPM_INSTALL=1   Skip npm install step
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

log() {
  printf '[install] %s\n' "$1"
}

if [ ! -f "$SCRIPT_DIR/package.json" ]; then
  echo "package.json not found in $SCRIPT_DIR" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] package directory: $SCRIPT_DIR"
  log "[dry-run] target settings: $SETTINGS_PATH"
  log "[dry-run] would run: npm install --omit=dev"
  log "[dry-run] would register package in settings.json"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to update $SETTINGS_PATH" >&2
  exit 1
fi

if [ "${PI_SKIP_NPM_INSTALL:-0}" = "1" ]; then
  log "Skipping npm install (PI_SKIP_NPM_INSTALL=1)"
elif command -v npm >/dev/null 2>&1; then
  log "Installing npm dependencies"
  (cd "$SCRIPT_DIR" && npm install --omit=dev)
else
  log "npm not found; skipping dependency install"
fi

mkdir -p "$TARGET_AGENT_DIR"
if [ ! -f "$SETTINGS_PATH" ]; then
  echo '{}' > "$SETTINGS_PATH"
fi

PACKAGE_PATH="$SCRIPT_DIR" SETTINGS_PATH="$SETTINGS_PATH" node <<'NODE'
const fs = require('node:fs');

const packagePath = process.env.PACKAGE_PATH;
const settingsPath = process.env.SETTINGS_PATH;

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (error) {
  console.error(`[install] Failed to parse ${settingsPath}: ${error.message}`);
  process.exit(1);
}

if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
  console.error(`[install] Expected ${settingsPath} to contain a JSON object.`);
  process.exit(1);
}

if (!Array.isArray(settings.packages)) settings.packages = [];
if (!settings.packages.includes(packagePath)) {
  settings.packages.push(packagePath);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  console.log(`[install] Registered package: ${packagePath}`);
} else {
  console.log(`[install] Package already registered: ${packagePath}`);
}
NODE

log "Done. Restart pi (or run /reload)."
