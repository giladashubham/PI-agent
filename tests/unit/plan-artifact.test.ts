import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, datePrefix, writePlanArtifact, readPlanArtifact, updatePlanStatus, ensurePlansGitignored } from "../../extensions/modes/plan-artifact.js";

const TEST_DIR = join(process.cwd(), "plans-test-tmp");

describe("plan-artifact", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("slugify", () => {
    it("converts title to URL-safe slug", () => {
      expect(slugify("Add user authentication")).toBe("add-user-authentication");
    });

    it("removes special characters", () => {
      expect(slugify("Fix bug #123!")).toBe("fix-bug-123");
    });

    it("collapses multiple spaces and hyphens", () => {
      expect(slugify("  hello   world  ")).toBe("hello-world");
    });

    it("truncates to 60 characters", () => {
      const long = "a".repeat(100);
      expect(slugify(long).length).toBe(60);
    });

    it("returns untitled for empty strings", () => {
      expect(slugify("")).toBe("untitled");
      expect(slugify("!!!")).toBe("untitled");
    });
  });

  describe("datePrefix", () => {
    it("returns YYYY-MM-DD format", () => {
      const prefix = datePrefix();
      expect(prefix).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("writePlanArtifact", () => {
    it("creates plan file with frontmatter", () => {
      const path = writePlanArtifact(TEST_DIR, "My Plan", "## Plan\n\n1. Step one\n2. Step two\n");

      expect(existsSync(path)).toBe(true);
      const content = readPlanArtifact(path);
      expect(content).toContain('title: "My Plan"');
      expect(content).toContain("status: draft");
      expect(content).toContain("## Plan");
      expect(content).toContain("1. Step one");
    });

    it("creates nested directory structure", () => {
      const path = writePlanArtifact(TEST_DIR, "Nested Plan", "content");
      expect(path).toContain("plans");
      expect(path).toContain("plan.md");
    });

    it("escapes quotes in title", () => {
      const path = writePlanArtifact(TEST_DIR, 'Plan "with quotes"', "content");
      const content = readPlanArtifact(path);
      expect(content).toContain('title: "Plan \\"with quotes\\"');
    });

    it("updates gitignore", () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      writePlanArtifact(TEST_DIR, "Gitignore Test", "content");

      expect(existsSync(gitignorePath)).toBe(true);
      const gitignoreContent = readFileSync(gitignorePath, "utf8");
      expect(gitignoreContent).toContain("plans/");
    });
  });

  describe("readPlanArtifact", () => {
    it("returns null for nonexistent file", () => {
      expect(readPlanArtifact(join(TEST_DIR, "nonexistent.md"))).toBeNull();
    });

    it("reads existing plan file", () => {
      const path = writePlanArtifact(TEST_DIR, "Read Test", "content here");
      const content = readPlanArtifact(path);
      expect(content).toContain("content here");
    });
  });

  describe("updatePlanStatus", () => {
    it("updates status frontmatter", () => {
      const path = writePlanArtifact(TEST_DIR, "Status Test", "content");
      updatePlanStatus(path, "approved");

      const content = readPlanArtifact(path);
      expect(content).toContain("status: approved");
      expect(content).not.toContain("status: draft");
    });

    it("does nothing for nonexistent file", () => {
      expect(() => updatePlanStatus(join(TEST_DIR, "nope.md"), "approved")).not.toThrow();
    });
  });

  describe("ensurePlansGitignored", () => {
    it("creates .gitignore if it doesn't exist", () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      expect(existsSync(gitignorePath)).toBe(false);

      ensurePlansGitignored(TEST_DIR);

      expect(existsSync(gitignorePath)).toBe(true);
      const content = readFileSync(gitignorePath, "utf8");
      expect(content).toContain("plans/");
    });

    it("appends to existing .gitignore", () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      writeFileSync(gitignorePath, "node_modules\n", "utf8");

      ensurePlansGitignored(TEST_DIR);

      const content = readFileSync(gitignorePath, "utf8");
      expect(content).toContain("node_modules");
      expect(content).toContain("plans/");
    });

    it("does not duplicate plans/ entry", () => {
      const gitignorePath = join(TEST_DIR, ".gitignore");
      writeFileSync(gitignorePath, "node_modules\nplans/\n", "utf8");

      ensurePlansGitignored(TEST_DIR);

      const content = readFileSync(gitignorePath, "utf8");
      const matches = content.match(/plans\//g);
      expect(matches?.length).toBe(1);
    });
  });
});
