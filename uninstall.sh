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
Usage: ./uninstall.sh [--dry-run]

Unregisters this folder from Pi packages in ~/.pi/agent/settings.json.
Does not delete this folder.
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
  printf '[uninstall] %s\n' "$1"
}

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] package directory: $SCRIPT_DIR"
  log "[dry-run] target settings: $SETTINGS_PATH"
  log "[dry-run] would remove package entry from settings.json"
  exit 0
fi

if [ ! -f "$SETTINGS_PATH" ]; then
  log "No settings file found at $SETTINGS_PATH (nothing to remove)."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to update $SETTINGS_PATH" >&2
  exit 1
fi

PACKAGE_PATH="$SCRIPT_DIR" SETTINGS_PATH="$SETTINGS_PATH" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const packagePath = process.env.PACKAGE_PATH;
const settingsPath = process.env.SETTINGS_PATH;

function normalize(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (error) {
  console.error(`[uninstall] Failed to parse ${settingsPath}: ${error.message}`);
  process.exit(1);
}

if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
  console.error(`[uninstall] Expected ${settingsPath} to contain a JSON object.`);
  process.exit(1);
}

const packages = Array.isArray(settings.packages) ? settings.packages : [];
const targetNorm = normalize(packagePath);

const kept = [];
let removed = 0;
for (const entry of packages) {
  if (typeof entry !== 'string') {
    kept.push(entry);
    continue;
  }

  const entryNorm = normalize(entry);
  if (entry === packagePath || entryNorm === targetNorm) {
    removed += 1;
    continue;
  }
  kept.push(entry);
}

if (removed === 0) {
  console.log(`[uninstall] Package not registered: ${packagePath}`);
  process.exit(0);
}

settings.packages = kept;
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log(`[uninstall] Removed package entry: ${packagePath}`);
NODE

log "Done. Restart pi (or run /reload)."
