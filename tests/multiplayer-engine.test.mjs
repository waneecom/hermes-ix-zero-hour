import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createDeal, createRandomizedDeck, ITEM_TOTALS, resolveRound, SABOTAGE_TARGET, symbolTotal } from "../supabase/functions/hermes-room/engine.js";

const members = [0, 1, 2, 3].map((seat) => ({ room_id: "room", user_id: `u${seat}`, seat, name: `P${seat}`, eliminated: false }));

test("landing rule preview opens the current online 4.5 manual", () => {
  const landing = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const manual = fs.readFileSync(new URL("../src/GameManual.tsx", import.meta.url), "utf8");
  assert.match(landing, /import GameManual from "\.\.\/src\/GameManual"/);
  assert.match(landing, /manualOpen \? <GameManual/);
  assert.match(manual, /ONLINE RULES 4\.5/);
  assert.match(manual, /막히지 않은 파괴 공격을 <b>7번<\/b>/);
  assert.match(manual, /“◉ 3\/6”/);
  assert.match(manual, /기관별 광물은 영구 고정입니다/);
  assert.match(manual, /안전 장소 카드 3장/);
  assert.match(manual, /3라운드 긴급 신뢰 스캔/);
});

test("online rules immediately calculate truthful answers for every player", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/hermes-room/index.ts", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../src/MultiplayerApp.tsx", import.meta.url), "utf8");
  assert.match(source, /rulesVersion: "4\.5"/);
  assert.match(source, /locationCatalog: deal\.locationCatalog/);
  assert.match(source, /locationGuesses\.length !== 3/);
  assert.doesNotMatch(source, /totalGuess/);
  assert.match(source, /target_location_id,destroyed/);
  assert.match(source, /p_destroyed: resolution\.destroyed/);
  assert.match(source, /async function broadcastQuestionLog/);
  assert.match(source, /return finishAction\(roomId, room, userId, action, log\)/);
  assert.doesNotMatch(source, /operation === "broadcast_answer"/);
  assert.match(ui, /const SABOTAGE_TARGET = 7/);
  assert.match(ui, /showPool/);
  assert.match(ui, /mp-role-footer/);
  assert.match(ui, /TrustScanPanel/);
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

test("keeps the same balanced 30-mineral layout across every game", () => {
  const deck = createRandomizedDeck(seededRandom(20260830));
  const cards = [...deck.roles, ...deck.locations];
  const totals = cards.reduce((sum, card) => {
    for (const key of Object.keys(ITEM_TOTALS)) sum[key] += card.symbols[key];
    return sum;
  }, { eye: 0, key: 0, power: 0, bio: 0, quantum: 0 });
  assert.equal(cards.length, 17);
  assert.deepEqual(totals, ITEM_TOTALS);
  assert.equal(deck.locations.filter((card) => symbolTotal(card.symbols) === 3).length, 4);
  assert.equal(deck.locations.filter((card) => symbolTotal(card.symbols) === 2).length, 9);
  assert.ok(deck.roles.every((card) => symbolTotal(card.symbols) === 0));
  assert.deepEqual(createRandomizedDeck(seededRandom(1)), createRandomizedDeck(seededRandom(2)));
});

test("a new mission keeps card minerals fixed but produces a different deal", () => {
  const first = createDeal(members, seededRandom(1));
  const second = createDeal(members, seededRandom(2));
  assert.deepEqual(first.locationCatalog, second.locationCatalog);
  assert.notDeepEqual({ target: first.targetLocationId, assignments: first.assignments }, { target: second.targetLocationId, assignments: second.assignments });
});

test("deals one role and three safe locations to all four remote players", () => {
  let value = 0;
  const { targetLocationId, assignments } = createDeal(members, () => (value = (value + 0.173) % 1));
  assert.equal(assignments.length, 4);
  assert.equal(new Set(assignments.map((entry) => entry.role_id)).size, 4);
  assert.ok(assignments.every((entry) => entry.hand.length === 3));
  const assignedQuestionTotals = assignments.reduce((sum, entry) => {
    for (const key of Object.keys(ITEM_TOTALS)) sum[key] += entry.totals[key];
    return sum;
  }, { eye: 0, key: 0, power: 0, bio: 0, quantum: 0 });
  assert.deepEqual(assignedQuestionTotals, ITEM_TOTALS);
  const spy = assignments.find((entry) => entry.role_id === "spy");
  const spySafeTotal = symbolTotal(spy.hand.reduce((sum, card) => {
    for (const key of Object.keys(ITEM_TOTALS)) sum[key] += card.symbols[key];
    return sum;
  }, { eye: 0, key: 0, power: 0, bio: 0, quantum: 0 }));
  assert.ok(symbolTotal(spy.totals) > spySafeTotal);
  const dealt = assignments.flatMap((entry) => entry.hand.map((card) => card.id));
  assert.equal(new Set(dealt).size, 12);
  assert.ok(!dealt.includes(targetLocationId));
});

function gameState(overrides = {}) {
  return {
    room: {
      current_round: 2,
      public_state: {
        players: members.map((member) => ({ seat: member.seat, name: member.name, eliminated: false, submitted: true })),
        lastIsolation: null,
        spyExposed: false,
        investigationLog: [],
        ...overrides,
      },
    },
    members,
    secrets: [
      { user_id: "u0", role_id: "pilot", hand: [{ id: 2 }, { id: 3 }, { id: 4 }], totals: { eye: 1, key: 0, power: 1, bio: 2, quantum: 3 } },
      { user_id: "u1", role_id: "scientist", hand: [{ id: 5 }, { id: 6 }, { id: 7 }], totals: { eye: 2, key: 2, power: 0, bio: 2, quantum: 2 } },
      { user_id: "u2", role_id: "security", hand: [{ id: 8 }, { id: 9 }, { id: 10 }], totals: { eye: 2, key: 2, power: 1, bio: 1, quantum: 0 } },
      { user_id: "u3", role_id: "spy", hand: [{ id: 11 }, { id: 12 }, { id: 13 }], totals: { eye: 1, key: 2, power: 4, bio: 1, quantum: 1 } },
    ],
    targetLocationId: 1,
    previousDestroyed: 0,
  };
}

test("lockdown blocks sabotage while scientist detects the attempt", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 1 } },
    { user_id: "u1", action: { type: "inspect", locationId: 1 } },
    { user_id: "u2", action: { type: "query", symbol: "power", threshold: 4 } },
    { user_id: "u3", action: { type: "attack" } },
  ] });
  assert.equal(result.destroyed, 0);
  assert.equal("destroyed" in result.publicState, false);
  assert.equal(result.publicState.report.detected, true);
  assert.equal(result.publicState.report.spyTotal, 9);
  assert.match(result.secretUpdates.find((entry) => entry.user_id === "u3").private_log, /완전 차단/);
  assert.equal(result.secretUpdates.find((entry) => entry.user_id === "u2").private_result.answer, true);
});

test("successful sabotage advances only the private progress value", () => {
  const result = resolveRound({ ...gameState(), previousDestroyed: SABOTAGE_TARGET - 1, actions: [
    { user_id: "u0", action: { type: "basic" } },
    { user_id: "u1", action: { type: "basic" } },
    { user_id: "u2", action: { type: "basic" } },
    { user_id: "u3", action: { type: "attack" } },
  ] });
  assert.equal(result.destroyed, SABOTAGE_TARGET);
  assert.equal(result.status, "gameover");
  assert.equal("destroyed" in result.publicState, false);
});

test("round three reveals one server-verified safe location per player", () => {
  const state = gameState();
  state.room.current_round = 3;
  const result = resolveRound({ ...state, random: () => 0, actions: [
    { user_id: "u0", action: { type: "basic" } },
    { user_id: "u1", action: { type: "basic" } },
    { user_id: "u2", action: { type: "basic" } },
    { user_id: "u3", action: { type: "wait" } },
  ] });
  assert.deepEqual(result.publicState.trustScan.map((entry) => entry.locationId), [2, 5, 8, 11]);
  assert.ok(result.publicState.trustScan.every((entry, seat) => state.secrets[seat].hand.some((card) => card.id === entry.locationId)));
  assert.ok(!result.publicState.trustScan.some((entry) => entry.locationId === state.targetLocationId));
});

test("basic investigation finishes during the player's turn without a later queue", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "basic" } },
    { user_id: "u1", action: { type: "basic" } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "wait" } },
  ] });
  assert.deepEqual(result.publicState.investigationQueue, []);
  assert.equal(result.publicState.arrestSeat, null);
  assert.equal(result.publicState.activeTurnSeat, null);
  assert.equal(result.publicState.turnDeadline, null);
  assert.equal(result.secretUpdates.find((entry) => entry.user_id === "u2").private_result.answer, true);
});

test("a perfect counter-trace eliminates its target", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 2 } },
    { user_id: "u1", action: { type: "inspect", locationId: 3 } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", locationGuesses: [4, 2, 3] } },
  ] });
  assert.equal(result.eliminatedUserId, "u0");
  assert.equal(result.publicState.report.assassination.success, true);
});

test("a failed counter-trace publicly exposes the spy", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 2 } },
    { user_id: "u1", action: { type: "inspect", locationId: 3 } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", locationGuesses: [2, 3, 5] } },
  ] });
  assert.equal(result.eliminatedUserId, null);
  assert.equal(result.publicState.spyExposed, true);
  assert.equal(result.publicState.report.assassination.spySeat, 3);
});
