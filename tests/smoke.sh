#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[smoke] validating package manifest paths"
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = pkg.pi || {};

for (const key of ['extensions']) {
  const entries = Array.isArray(manifest[key]) ? manifest[key] : [];
  if (entries.length === 0) {
    throw new Error(`pi.${key} must contain at least one path`);
  }
  for (const entry of entries) {
    const absolute = path.resolve(entry);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing manifest path: pi.${key} -> ${entry}`);
    }
  }
}

for (const key of ['skills', 'themes']) {
  const entries = Array.isArray(manifest[key]) ? manifest[key] : [];
  for (const entry of entries) {
    const absolute = path.resolve(entry);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing manifest path: pi.${key} -> ${entry}`);
    }
  }
}
NODE

echo "[smoke] validating optional skill frontmatter"
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

function findSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findSkillFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      out.push(fullPath);
    }
  }
  return out;
}

const skillsDir = path.resolve('skills');
if (fs.existsSync(skillsDir)) {
  const files = findSkillFiles(skillsDir);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatter) throw new Error(`Missing frontmatter in ${file}`);

    const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
    const dirName = path.basename(path.dirname(file));

    if (!name) throw new Error(`Missing name in ${file}`);
    if (!description) throw new Error(`Missing description in ${file}`);
    if (name !== dirName) throw new Error(`Skill name (${name}) must match directory name (${dirName}) in ${file}`);
  }
}
NODE

echo "[smoke] validating docs consistency"
if grep -q "networkidle2, 30s timeout" tools/web-fetch/README.md; then
  echo "Stale timeout docs found in tools/web-fetch/README.md" >&2
  exit 1
fi

echo "[smoke] validating install/uninstall parse guards"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/agent"
printf '{invalid json' > "$TMP_DIR/agent/settings.json"

if PI_AGENT_DIR="$TMP_DIR/agent" PI_SKIP_NPM_INSTALL=1 ./install.sh >"$TMP_DIR/install.out" 2>&1; then
  echo "install.sh should fail on malformed settings.json" >&2
  exit 1
fi
grep -q "Failed to parse" "$TMP_DIR/install.out"

if PI_AGENT_DIR="$TMP_DIR/agent" ./uninstall.sh >"$TMP_DIR/uninstall.out" 2>&1; then
  echo "uninstall.sh should fail on malformed settings.json" >&2
  exit 1
fi
grep -q "Failed to parse" "$TMP_DIR/uninstall.out"

echo "[smoke] all checks passed"