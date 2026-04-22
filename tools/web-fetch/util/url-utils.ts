export function validateAndNormalizeUrl(
  raw: string,
): { url: string; error?: undefined } | { url?: undefined; error: string } {
  const cleaned = raw.startsWith("@") ? raw.slice(1) : raw;

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return {
      error: `Invalid URL: "${cleaned}". Please provide a fully-formed URL (e.g., https://example.com/page).`,
    };
  }

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  if (parsed.protocol !== "https:") {
    return { error: `Unsupported URL scheme: "${parsed.protocol}". Only HTTP and HTTPS URLs are supported.` };
  }

  return { url: parsed.toString() };
}
