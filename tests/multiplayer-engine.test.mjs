import assert from "node:assert/strict";
import test from "node:test";
import { createDeal, createRandomizedDeck, ITEM_TOTALS, resolveRound, symbolTotal } from "../supabase/functions/hermes-room/engine.js";

const members = [0, 1, 2, 3].map((seat) => ({ room_id: "room", user_id: `u${seat}`, seat, name: `P${seat}`, eliminated: false }));

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

test("randomizes 30 minerals across the complete 17-card deck", () => {
  const deck = createRandomizedDeck(seededRandom(20260830));
  const cards = [...deck.roles, ...deck.locations];
  const totals = cards.reduce((sum, card) => {
    for (const key of Object.keys(ITEM_TOTALS)) sum[key] += card.symbols[key];
    return sum;
  }, { eye: 0, key: 0, power: 0, bio: 0, quantum: 0 });
  assert.equal(cards.length, 17);
  assert.deepEqual(totals, ITEM_TOTALS);
  assert.equal(cards.filter((card) => symbolTotal(card.symbols) === 2).length, 13);
  assert.equal(cards.filter((card) => symbolTotal(card.symbols) === 1).length, 4);
});

test("a new mission produces a different mineral layout and deal", () => {
  assert.notDeepEqual(createDeal(members, seededRandom(1)), createDeal(members, seededRandom(2)));
});

test("deals one role and three safe locations to all four remote players", () => {
  let value = 0;
  const { targetLocationId, assignments } = createDeal(members, () => (value = (value + 0.173) % 1));
  assert.equal(assignments.length, 4);
  assert.equal(new Set(assignments.map((entry) => entry.role_id)).size, 4);
  assert.ok(assignments.every((entry) => entry.hand.length === 3));
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
        destroyed: 0,
        lastIsolation: null,
        spyExposed: false,
        investigationLog: [],
        ...overrides,
      },
    },
    members,
    secrets: [
      { user_id: "u0", role_id: "pilot", totals: { eye: 2, key: 1, power: 2, bio: 1, quantum: 1 } },
      { user_id: "u1", role_id: "scientist", totals: { eye: 4, key: 2, power: 1, bio: 2, quantum: 1 } },
      { user_id: "u2", role_id: "security", totals: { eye: 2, key: 3, power: 2, bio: 2, quantum: 2 } },
      { user_id: "u3", role_id: "spy", totals: { eye: 3, key: 2, power: 4, bio: 1, quantum: 2 } },
    ],
    targetLocationId: 1,
  };
}

test("lockdown blocks sabotage while scientist detects the attempt", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 1 } },
    { user_id: "u1", action: { type: "inspect", locationId: 1 } },
    { user_id: "u2", action: { type: "query", symbol: "eye", threshold: 3 } },
    { user_id: "u3", action: { type: "attack" } },
  ] });
  assert.equal(result.publicState.destroyed, 0);
  assert.equal(result.publicState.report.detected, true);
  assert.equal(result.publicState.report.spyTotal, 12);
  assert.match(result.secretUpdates.find((entry) => entry.user_id === "u3").private_log, /완전 차단/);
  assert.equal(result.secretUpdates.find((entry) => entry.user_id === "u2").private_result.answer, true);
});

test("basic investigation finishes during the player's turn without a later queue", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "basic" } },
    { user_id: "u1", action: { type: "basic" } },
    { user_id: "u2", action: { type: "query", symbol: "quantum", threshold: 2 } },
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
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", totalGuess: 7, locationGuess: 2 } },
  ] });
  assert.equal(result.eliminatedUserId, "u0");
  assert.equal(result.publicState.report.assassination.success, true);
});

test("a failed counter-trace publicly exposes the spy", () => {
  const result = resolveRound({ ...gameState(), actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 2 } },
    { user_id: "u1", action: { type: "inspect", locationId: 3 } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", totalGuess: 20, locationGuess: 2 } },
  ] });
  assert.equal(result.eliminatedUserId, null);
  assert.equal(result.publicState.spyExposed, true);
  assert.equal(result.publicState.report.assassination.spySeat, 3);
});
