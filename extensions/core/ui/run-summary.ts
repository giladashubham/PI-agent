import { formatDuration, formatMoney, formatCompactNumber } from "../../../src/shared/formatting.js";

export interface RunSummary {
  durationMs: number;
  totalTokens: number;
  totalCost: number;
  modelCount: number;
  changedFileCount: number;
}

export function summarizeAssistantUsage(messages: unknown): Omit<RunSummary, "durationMs" | "changedFileCount"> {
  const items = Array.isArray(messages) ? messages : [];
  let totalTokens = 0;
  let totalCost = 0;
  const models = new Set<string>();

  for (const item of items) {
    const message = item as {
      role?: string;
      model?: string;
      usage?: { totalTokens?: number; cost?: { total?: number } };
    };
    if (message.role !== "assistant") continue;
    totalTokens += message.usage?.totalTokens || 0;
    totalCost += message.usage?.cost?.total || 0;
    if (message.model) models.add(message.model);
  }

  return {
    totalTokens,
    totalCost,
    modelCount: models.size,
  };
}

export function formatRunSummary(summary: RunSummary): string {
  const parts = [
    `Done ${formatDuration(summary.durationMs)}`,
    `${summary.changedFileCount} file${summary.changedFileCount === 1 ? "" : "s"}`,
  ];
  if (summary.modelCount > 0) parts.push(`${summary.modelCount} model${summary.modelCount === 1 ? "" : "s"}`);
  if (summary.totalTokens > 0) parts.push(`${formatCompactNumber(summary.totalTokens)} tok`);
  parts.push(formatMoney(summary.totalCost));
  return parts.join(" · ");
}
