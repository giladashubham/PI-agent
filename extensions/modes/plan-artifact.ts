import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generate a URL-safe slug from a title.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

/**
 * Generate a date prefix string (YYYY-MM-DD).
 */
export function datePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Write a plan markdown artifact to `plans/<date>-<slug>/plan.md`.
 * Creates the plans/ directory if needed and ensures it's in .gitignore.
 * Returns the absolute path of the written file.
 */
export function writePlanArtifact(cwd: string, title: string, content: string): string {
  const slug = slugify(title);
  const dirName = `${datePrefix()}-${slug}`;
  const plansDir = join(cwd, "plans");
  const planDir = join(plansDir, dirName);
  const filePath = join(planDir, "plan.md");

  mkdirSync(planDir, { recursive: true });

  const frontmatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${datePrefix()}`,
    "status: draft",
    "---",
    "",
  ].join("\n");

  writeFileSync(filePath, frontmatter + content, "utf8");

  // Ensure plans/ is in .gitignore
  ensurePlansGitignored(cwd);

  return filePath;
}

/**
 * Read a plan file. Returns null if it doesn't exist.
 */
export function readPlanArtifact(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

/**
 * Update a plan file's status frontmatter.
 */
export function updatePlanStatus(filePath: string, status: string): void {
  const content = readPlanArtifact(filePath);
  if (content === null) return;

  const updated = content.replace(/^status:\s*\S+/m, `status: ${status}`);
  writeFileSync(filePath, updated, "utf8");
}

/**
 * Ensure plans/ is listed in the project's .gitignore.
 */
export function ensurePlansGitignored(cwd: string): void {
  const gitignorePath = join(cwd, ".gitignore");

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "plans/\n", "utf8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf8");
  const lines = content.split(/\r?\n/);

  // Check if plans/ is already gitignored (with or without trailing slash)
  const alreadyIgnored = lines.some((line) => {
    const trimmed = line.trim();
    return trimmed === "plans/" || trimmed === "plans";
  });

  if (!alreadyIgnored) {
    const updated = content.endsWith("\n") ? content + "plans/\n" : content + "\nplans/\n";
    writeFileSync(gitignorePath, updated, "utf8");
  }
}
