export interface BatchPageInput {
  url: string;
  prompt?: string;
}

/**
 * Format batch results into a single text content block with per-page headers.
 */
export function formatBatchResults(pages: BatchPageInput[], results: PromiseSettledResult<any>[]): any {
  const total = pages.length;

  // Single page: return the result directly without batch header wrapper
  if (total === 1) {
    const settled = results[0];
    if (settled.status === "rejected") {
      return {
        content: [{ type: "text", text: `Error: ${settled.reason?.message || String(settled.reason)}` }],
        isError: true,
      };
    }
    return settled.value;
  }

  const sections: string[] = [];

  for (let i = 0; i < total; i++) {
    const header = `--- [${i + 1}/${total}] ${pages[i].url} ---`;
    const settled = results[i];

    let body: string;
    if (settled.status === "rejected") {
      body = `Error: ${settled.reason?.message || String(settled.reason)}`;
    } else {
      const result = settled.value;
      if (result.isError) {
        const textContent = result.content?.[0];
        body = `Error: ${textContent?.type === "text" ? textContent.text : "Unknown error"}`;
      } else {
        const textContent = result.content?.[0];
        body = textContent?.type === "text" ? (textContent.text ?? "") : "(no content)";
      }
    }

    sections.push(`${header}\n${body}`);
  }

  return {
    content: [{ type: "text", text: sections.join("\n\n") }],
  };
}
