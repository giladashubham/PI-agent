import { describe, it, expect } from "vitest";
import { isSafePlanCommand } from "../../extensions/modes/plan/bash-safety.js";

describe("isSafePlanCommand", () => {
  describe("allows safe read-only commands", () => {
    const safeCmds = [
      "cat README.md",
      "head -n 20 src/index.ts",
      "tail -f logs/app.log",
      "grep -r 'TODO' src/",
      "find . -name '*.ts'",
      "ls -la",
      "pwd",
      "echo hello",
      "wc -l src/index.ts",
      "sort output.txt",
      "diff file1.ts file2.ts",
      "tree src/",
      "git status",
      "git log --oneline -10",
      "git diff HEAD~1",
      "git branch -a",
      "npm list",
      "npm outdated",
      "node --version",
      "jq '.name' package.json",
      "rg 'function' src/",
    ];

    for (const cmd of safeCmds) {
      it("allows: " + cmd, () => {
        expect(isSafePlanCommand(cmd)).toBe(true);
      });
    }
  });

  describe("blocks dangerous commands", () => {
    const dangerousCmds = [
      "rm -rf /",
      "rm file.ts",
      "mv old.ts new.ts",
      "cp src/ dest/",
      "mkdir new-dir",
      "touch newfile.ts",
      "chmod 777 script.sh",
      "npm install express",
      "yarn add lodash",
      "pip install flask",
      "git commit -m 'test'",
      "git push origin main",
      "sudo apt update",
      "vim file.ts",
      "echo 'data' > file.txt",
      "echo 'data' >> file.txt",
      "kill 1234",
    ];

    for (const cmd of dangerousCmds) {
      it("blocks: " + cmd, () => {
        expect(isSafePlanCommand(cmd)).toBe(false);
      });
    }
  });

  it("returns false for empty command", () => {
    expect(isSafePlanCommand("")).toBe(false);
    expect(isSafePlanCommand("   ")).toBe(false);
  });
});
