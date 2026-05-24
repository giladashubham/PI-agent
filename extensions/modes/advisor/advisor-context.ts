import type { AdvisorModeConfig } from "./advisor-config.js";

export interface AdvisorRelevantFileHint {
  path: string;
  reason?: string;
  content?: string;
}

export interface AdvisorSnippetHint {
  label?: string;
  content: string;
}

export interface ConsultAdvisorInput {
  objective: string;
  draft?: string;
  concerns?: string;
  outputFormat?: string;
  relevantFiles?: AdvisorRelevantFileHint[];
  snippets?: AdvisorSnippetHint[];
}

export interface AdvisorContextBuildResult {
  prompt: string;
  truncated: boolean;
}

function truncateToBytes(value: string | undefined, maxBytes: number): { text: string; truncated: boolean } {
  if (!value) return { text: "", truncated: false };
  if (maxBytes <= 0) return { text: "", truncated: value.length > 0 };

  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return { text: value, truncated: false };
  }

  let text = value;
  while (text.length > 0 && Buffer.byteLength(text, "utf8") > maxBytes) {
    text = text.slice(0, -1);
  }
  return { text, truncated: true };
}

function sanitizeLine(value: string | undefined): string {
  return (value || "").trim();
}

export function buildAdvisorContext(input: ConsultAdvisorInput, config: AdvisorModeConfig): AdvisorContextBuildResult {
  const objective = sanitizeLine(input.objective) || "No objective provided.";
  const draft = truncateToBytes(input.draft, config.maxDraftBytes);
  const concerns = truncateToBytes(input.concerns, config.maxSnippetBytes);
  const outputFormat = truncateToBytes(input.outputFormat, config.maxSnippetBytes);

  const relevantFiles = (input.relevantFiles ?? []).slice(0, config.maxFiles).map((file) => {
    const path = sanitizeLine(file.path);
    const reason = truncateToBytes(file.reason, config.maxSnippetBytes);
    const content = truncateToBytes(file.content, config.maxFileBytes);
    return { path, reason, content };
  });

  const snippets = (input.snippets ?? []).slice(0, config.maxFiles).map((snippet, index) => {
    const label = sanitizeLine(snippet.label) || `snippet-${index + 1}`;
    const content = truncateToBytes(snippet.content, config.maxSnippetBytes);
    return { label, content };
  });

  let truncated = draft.truncated || concerns.truncated || outputFormat.truncated;

  const lines: string[] = [];
  lines.push("## Objective");
  lines.push(objective);

  if (draft.text) {
    lines.push("", "## Current Draft", draft.text);
  }

  if (concerns.text) {
    lines.push("", "## Concerns", concerns.text);
  }

  if (outputFormat.text) {
    lines.push("", "## Preferred Output Format", outputFormat.text);
  }

  if (relevantFiles.length > 0) {
    lines.push(
      "",
      config.toolProfile === "research"
        ? "## Initial File Hints (advisor can inspect additional files via tools)"
        : "## Provided File Context",
    );

    for (const file of relevantFiles) {
      if (!file.path) continue;
      lines.push(`- ${file.path}`);
      if (file.reason.text) {
        lines.push(`  reason: ${file.reason.text}`);
      }
      if (file.content.text) {
        lines.push("  content:", "  ```text", ...file.content.text.split("\n").map((line) => "  " + line), "  ```");
      }
      truncated = truncated || file.reason.truncated || file.content.truncated;
    }
  }

  if (snippets.length > 0) {
    lines.push("", "## Snippets");
    for (const snippet of snippets) {
      lines.push(`- ${snippet.label}`, "  ```text", ...snippet.content.text.split("\n").map((line) => "  " + line), "  ```");
      truncated = truncated || snippet.content.truncated;
    }
  }

  if (truncated) {
    lines.push("", "[Note] Some fields were truncated to stay within advisor context limits.");
  }

  return { prompt: lines.join("\n"), truncated };
}
