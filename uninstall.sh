#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_JSON_PATH="$SCRIPT_DIR/package.json"
TARGET_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
SETTINGS_PATH="$TARGET_AGENT_DIR/settings.json"

DRY_RUN=0
KEEP_FILES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=1
      ;;
    --keep-files)
      KEEP_FILES=1
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./uninstall.sh [--dry-run] [--keep-files]

Unregisters this package from ~/.pi/agent/settings.json.
By default it also removes the installed package directory at:
~/.pi/agent/packages/<package-name>

Options:
- --keep-files   Only unregister from settings, do not remove installed files

Environment:
- PI_AGENT_DIR=/path/to/.pi/agent   Override target agent directory
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

if [ ! -f "$PACKAGE_JSON_PATH" ]; then
  echo "package.json not found in $SCRIPT_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to uninstall this package" >&2
  exit 1
fi

PACKAGE_DIR_NAME="$(PACKAGE_JSON_PATH="$PACKAGE_JSON_PATH" node <<'NODE'
const fs = require('node:fs');

const packageJsonPath = process.env.PACKAGE_JSON_PATH;

let packageName = 'pi-package';
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (typeof pkg.name === 'string' && pkg.name.trim()) {
    packageName = pkg.name.trim();
  }
} catch (error) {
  console.error(`[uninstall] Failed to parse ${packageJsonPath}: ${error.message}`);
  process.exit(1);
}

const safeName = packageName
  .replace(/^@/, '')
  .replace(/[\/\\]/g, '-')
  .replace(/[^A-Za-z0-9._-]/g, '-');

process.stdout.write(safeName || 'pi-package');
NODE
)"

INSTALL_DIR="$TARGET_AGENT_DIR/packages/$PACKAGE_DIR_NAME"

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] source directory: $SCRIPT_DIR"
  log "[dry-run] install directory: $INSTALL_DIR"
  log "[dry-run] target settings: $SETTINGS_PATH"
  log "[dry-run] would unregister source/install paths from settings.json"
  if [ "$KEEP_FILES" -eq 1 ]; then
    log "[dry-run] would keep installed files"
  else
    log "[dry-run] would remove installed package directory"
  fi
  exit 0
fi

if [ -f "$SETTINGS_PATH" ]; then
  SOURCE_DIR="$SCRIPT_DIR" INSTALL_DIR="$INSTALL_DIR" SETTINGS_PATH="$SETTINGS_PATH" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const sourceDir = process.env.SOURCE_DIR;
const installDir = process.env.INSTALL_DIR;
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
const sourceNorm = normalize(sourceDir);
const installNorm = normalize(installDir);

const kept = [];
let removed = 0;

for (const entry of packages) {
  if (typeof entry !== 'string') {
    kept.push(entry);
    continue;
  }

  const entryNorm = normalize(entry);
  if (entry === sourceDir || entryNorm === sourceNorm || entry === installDir || entryNorm === installNorm) {
    removed += 1;
    continue;
  }

  kept.push(entry);
}

if (removed > 0) {
  settings.packages = kept;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  console.log(`[uninstall] Removed ${removed} package registration(s).`);
} else {
  console.log(`[uninstall] Package not registered in ${settingsPath}.`);
}
NODE
else
  log "No settings file found at $SETTINGS_PATH (skipping registry cleanup)."
fi

if [ "$KEEP_FILES" -eq 1 ]; then
  log "Keeping installed files at $INSTALL_DIR"
  log "Done. Restart pi (or run /reload)."
  exit 0
fi

TARGET_AGENT_DIR="$TARGET_AGENT_DIR" INSTALL_DIR="$INSTALL_DIR" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const targetAgentDir = process.env.TARGET_AGENT_DIR;
const installDir = process.env.INSTALL_DIR;

function normalize(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

const targetNorm = normalize(targetAgentDir);
const installNorm = normalize(installDir);

if (installNorm !== targetNorm && !installNorm.startsWith(targetNorm + path.sep)) {
  console.error(`[uninstall] Refusing to remove path outside ${targetAgentDir}: ${installDir}`);
  process.exit(1);
}

if (!fs.existsSync(installDir)) {
  console.log(`[uninstall] No installed package directory at ${installDir} (nothing to remove).`);
  process.exit(0);
}

fs.rmSync(installDir, { recursive: true, force: true });
console.log(`[uninstall] Removed installed package directory: ${installDir}`);
NODE

log "Done. Restart pi (or run /reload)."