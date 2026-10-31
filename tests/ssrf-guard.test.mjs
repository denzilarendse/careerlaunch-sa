import test from "node:test";
import assert from "node:assert/strict";
import { blockedHostname, validateVacancyUrl, readLimitedText } from "../supabase/functions/generate-cv/ssrf-guard.mjs";

test("blocks loopback/private/link-local/reserved IPv4 and encoded numeric loopback", () => {
  for (const url of [
    "http://127.0.0.1/", "http://127.1/", "http://2130706433/",
    "http://10.0.0.1/", "http://172.16.0.1/", "http://192.168.1.1/",
    "http://169.254.169.254/", "http://100.64.0.1/", "http://224.0.0.1/",
  ]) assert.throws(() => validateVacancyUrl(url), /UNSAFE_VACANCY_URL/, url);
});

test("blocks IPv6 literals, including IPv4-mapped IPv6 and loopback", () => {
  for (const url of ["http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fe80::1]/"]) {
    assert.throws(() => validateVacancyUrl(url), /UNSAFE_VACANCY_URL/, url);
  }
});

test("blocks local-use hostnames and URL credentials; allows normal public HTTP(S) domains", () => {
  for (const url of ["http://localhost/", "http://x.local/", "http://x.internal/",
    "http://user:pass@example.com/", "file:///etc/passwd", "ftp://example.com/"]) {
    assert.throws(() => validateVacancyUrl(url), /UNSAFE_VACANCY_URL/, url);
  }
  assert.equal(validateVacancyUrl("https://careers.example.org/jobs").hostname, "careers.example.org");
  assert.equal(blockedHostname("localhost"), true);
});

test("enforces response body limit while streaming, not after full allocation", async () => {
  const response = new Response(new Uint8Array(32));
  await assert.rejects(readLimitedText(response, 16), /VACANCY_PAGE_TOO_LARGE/);
});

test("reads a response under the byte limit", async () => {
  const response = new Response("synthetic vacancy", { headers: { "content-type": "text/plain" } });
  assert.equal(await readLimitedText(response, 128), "synthetic vacancy");
});
