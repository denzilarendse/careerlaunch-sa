const MAX_VACANCY_BYTES = 1_500_000;

export function blockedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host.includes(":")) return true; // Reject IPv6 literals until a resolver-pinned fetch is available.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".home.arpa") ||
      host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) return true;

  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const octets = parts.map(Number);
    if (octets.some((n) => n < 0 || n > 255)) return true;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) ||
        (b === 88 && c === 99) || (b === 168) || (b === 0 && c === 2))) return true;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    return false;
  }
  // Reject numeric-looking non-canonical host forms if they ever bypass URL normalization.
  if (/^[0-9.]+$/.test(host)) return true;
  return false;
}

export function validateVacancyUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("UNSAFE_VACANCY_URL");
  }
  if (!["https:", "http:"].includes(url.protocol) ||
      url.username || url.password || blockedHostname(url.hostname)) {
    throw new Error("UNSAFE_VACANCY_URL");
  }
  return url;
}

export async function readLimitedText(response, maxBytes = MAX_VACANCY_BYTES) {
  const declared = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error("VACANCY_PAGE_TOO_LARGE");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("VACANCY_PAGE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
