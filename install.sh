#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_JSON_PATH="$SCRIPT_DIR/package.json"
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

Installs this package into ~/.pi/agent/packages/<package-name>
and registers that installed path in ~/.pi/agent/settings.json.

Environment:
- PI_AGENT_DIR=/path/to/.pi/agent   Override target agent directory
- PI_SKIP_NPM_INSTALL=1             Skip npm install step
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

if [ ! -f "$PACKAGE_JSON_PATH" ]; then
  echo "package.json not found in $SCRIPT_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to install this package" >&2
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
  console.error(`[install] Failed to parse ${packageJsonPath}: ${error.message}`);
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
  log "[dry-run] would sync files (excluding .git and node_modules)"
  log "[dry-run] would run: npm install --omit=dev (in install directory)"
  log "[dry-run] would register installed path in settings.json"
  exit 0
fi

mkdir -p "$TARGET_AGENT_DIR"
if [ ! -f "$SETTINGS_PATH" ]; then
  echo '{}' > "$SETTINGS_PATH"
fi

SETTINGS_PATH="$SETTINGS_PATH" node <<'NODE'
const fs = require('node:fs');

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
NODE

SOURCE_DIR="$SCRIPT_DIR" INSTALL_DIR="$INSTALL_DIR" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const sourceDir = process.env.SOURCE_DIR;
const installDir = process.env.INSTALL_DIR;

function normalize(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

const sourceNorm = normalize(sourceDir);
const installNorm = normalize(installDir);

if (sourceNorm === installNorm) {
  console.log(`[install] Source directory already equals install directory: ${installDir}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(installDir), { recursive: true });
fs.rmSync(installDir, { recursive: true, force: true });

fs.cpSync(sourceDir, installDir, {
  recursive: true,
  dereference: true,
  filter: (src) => {
    const rel = path.relative(sourceDir, src);
    if (!rel) return true;

    const parts = rel.split(path.sep);
    if (parts.includes('.git')) return false;
    if (parts.includes('node_modules')) return false;

    return true;
  },
});

console.log(`[install] Synced package files to: ${installDir}`);
NODE

if [ "${PI_SKIP_NPM_INSTALL:-0}" = "1" ]; then
  log "Skipping npm install (PI_SKIP_NPM_INSTALL=1)"
elif command -v npm >/dev/null 2>&1; then
  log "Installing npm dependencies in $INSTALL_DIR"
  (cd "$INSTALL_DIR" && npm install --omit=dev)
else
  log "npm not found; skipping dependency install"
fi

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
  console.error(`[install] Failed to parse ${settingsPath}: ${error.message}`);
  process.exit(1);
}

if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
  console.error(`[install] Expected ${settingsPath} to contain a JSON object.`);
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

kept.push(installDir);
settings.packages = kept;

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

if (removed > 0) {
  console.log(`[install] Replaced ${removed} existing package registration(s).`);
}
console.log(`[install] Registered package: ${installDir}`);
NODE

log "Done. Restart pi (or run /reload)."