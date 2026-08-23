import assert from "node:assert/strict";
import test from "node:test";
import { createDeal, resolveRound } from "../supabase/functions/hermes-room/engine.js";

const members = [0, 1, 2, 3].map((seat) => ({ room_id: "room", user_id: `u${seat}`, seat, name: `P${seat}`, eliminated: false }));

test("deals one role and three safe locations to all four remote players", () => {
  let value = 0;
  const { targetLocationId, assignments } = createDeal(members, () => (value = (value + 0.173) % 1));
  assert.equal(assignments.length, 4);
  assert.deepEqual(new Set(assignments.map((entry) => entry.role_id)).size, 4);
  assert.ok(assignments.every((entry) => entry.hand.length === 3));
  const dealt = assignments.flatMap((entry) => entry.hand.map((card) => card.id));
  assert.equal(new Set(dealt).size, 12);
  assert.ok(!dealt.includes(targetLocationId));
});

function state(overrides = {}) {
  return {
    room: {
      current_round: 1,
      public_state: {
        players: members.map((member) => ({ seat: member.seat, name: member.name, eliminated: false, submitted: true })),
        destroyed: 0,
        lastIsolation: null,
        spyExposed: false,
        ...overrides,
      },
    },
    members,
    secrets: [
      { user_id: "u0", role_id: "pilot", totals: { eye: 2, key: 1, power: 2 } },
      { user_id: "u1", role_id: "scientist", totals: { eye: 4, key: 2, power: 1 } },
      { user_id: "u2", role_id: "security", totals: { eye: 2, key: 3, power: 2 } },
      { user_id: "u3", role_id: "spy", totals: { eye: 3, key: 2, power: 4 } },
    ],
    targetLocationId: 1,
  };
}

test("lockdown blocks sabotage while scientist still detects the attempt", () => {
  const base = state();
  const result = resolveRound({ ...base, actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 1 } },
    { user_id: "u1", action: { type: "inspect", locationId: 1 } },
    { user_id: "u2", action: { type: "query", symbol: "eye", threshold: 3 } },
    { user_id: "u3", action: { type: "attack" } },
  ] });
  assert.equal(result.publicState.destroyed, 0);
  assert.equal(result.publicState.report.detected, true);
  assert.equal(result.publicState.report.spyTotal, 9);
  assert.match(result.secretUpdates.find((entry) => entry.user_id === "u3").private_log, /완전 차단/);
  assert.equal(result.secretUpdates.find((entry) => entry.user_id === "u2").private_result.answer, true);
});

test("a perfect counter-snipe eliminates its target", () => {
  const base = state();
  const result = resolveRound({ ...base, actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 2 } },
    { user_id: "u1", action: { type: "inspect", locationId: 3 } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", totalGuess: 5, locationGuess: 2 } },
  ] });
  assert.equal(result.eliminatedUserId, "u0");
  assert.equal(result.publicState.report.assassination.success, true);
  assert.equal(result.publicState.players[0].eliminated, true);
});

test("a failed counter-snipe publicly exposes the spy", () => {
  const base = state();
  const result = resolveRound({ ...base, actions: [
    { user_id: "u0", action: { type: "isolate", locationId: 2 } },
    { user_id: "u1", action: { type: "inspect", locationId: 3 } },
    { user_id: "u2", action: { type: "query", symbol: "key", threshold: 2 } },
    { user_id: "u3", action: { type: "assassinate", targetUserId: "u0", totalGuess: 11, locationGuess: 2 } },
  ] });
  assert.equal(result.eliminatedUserId, null);
  assert.equal(result.publicState.spyExposed, true);
  assert.equal(result.publicState.report.assassination.spySeat, 3);
});
