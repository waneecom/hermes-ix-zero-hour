import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("https://hermes-ix.test/", { headers: { accept: "text/html", host: "hermes-ix.test", "x-forwarded-proto": "https" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished Hermes-IX mission console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>헤르메스-IX: 제로 아워<\/title>/);
  assert.match(html, /파괴자는 이미/);
  assert.match(html, /17장의 기밀 카드/);
  assert.match(html, /https:\/\/hermes-ix\.test\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Building your site/);
});

test("keeps the complete 17-card archive and corrected symbol total in source", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const locationIds = [...page.matchAll(/\{ id: (\d+), code:/g)].map((match) => Number(match[1]));
  const roleSource = page.slice(page.indexOf("const ROLES"), page.indexOf("const LOCATIONS"));
  const roleIds = [...roleSource.matchAll(/\{ id: "(pilot|scientist|security|spy)"/g)].map((match) => match[1]);
  assert.deepEqual(locationIds, Array.from({ length: 13 }, (_, index) => index + 1));
  assert.deepEqual(roleIds, ["pilot", "scientist", "security", "spy"]);
  assert.match(page, /◉ 11개 · ◆ 10개 · ϟ 12개/);
  assert.match(page, /nextDestroyed >= 5/);
  assert.match(page, /correctSpy && correctTarget/);
});
