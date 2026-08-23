import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);

test("keeps the complete 17-card deck", async () => {
  const page = await readFile(pageUrl, "utf8");
  const locationIds = [...page.matchAll(/\{ id: (\d+), code:/g)].map((match) => Number(match[1]));
  const roleSource = page.slice(page.indexOf("const ROLES"), page.indexOf("const LOCATIONS"));
  const roleIds = [...roleSource.matchAll(/\{ id: "(pilot|scientist|security|spy)"/g)].map((match) => match[1]);
  assert.deepEqual(locationIds, Array.from({ length: 13 }, (_, index) => index + 1));
  assert.deepEqual(roleIds, ["pilot", "scientist", "security", "spy"]);
  assert.match(page, /◉ 11개 · ◆ 10개 · ϟ 12개/);
});

test("implements lockdown cooldown and five-stack defeat", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.match(page, /selectedLocation !== lastIsolation/);
  assert.match(page, /setLastIsolation\(nextActions\.isolation \?\? null\)/);
  assert.match(page, /nextActions\.isolation === target!\.id/);
  assert.match(page, /nextDestroyed >= 5/);
});

test("implements high-risk assassination and elimination", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.match(page, /spyIntent === "assassinate"/);
  assert.match(page, /symbolTotal\(victim\.totals\) === shot\.totalGuess/);
  assert.match(page, /nextActions\.securityQuery!\.symbol === shot\.symbolGuess/);
  assert.match(page, /setSpyExposed\(true\)/);
  assert.match(page, /eliminated: true/);
});

test("ships owner-only Supabase policies", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260823051828_create_hermes_ix_games.sql", import.meta.url), "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all .* from anon/i);
  assert.equal((migration.match(/\(select auth\.uid\(\)\) = owner_id/g) ?? []).length, 5);
});
