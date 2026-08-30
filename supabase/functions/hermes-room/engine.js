export const SYMBOL_KEYS = ["eye", "key", "power", "bio", "quantum"];
export const ITEM_TOTALS = { eye: 6, key: 6, power: 6, bio: 6, quantum: 6 };
export const SABOTAGE_TARGET = 7;

const emptySymbols = () => Object.fromEntries(SYMBOL_KEYS.map((symbol) => [symbol, 0]));

export const ROLES = [
  { id: "pilot", symbols: { ...emptySymbols(), power: 1 } },
  { id: "scientist", symbols: { ...emptySymbols(), bio: 1 } },
  { id: "security", symbols: { ...emptySymbols(), key: 1 } },
  { id: "spy", symbols: { ...emptySymbols(), quantum: 1 } },
];

export const LOCATIONS = [
  { id: 1, symbols: { ...emptySymbols(), power: 2 } },
  { id: 2, symbols: { ...emptySymbols(), eye: 1, quantum: 1 } },
  { id: 3, symbols: { ...emptySymbols(), power: 1, quantum: 1 } },
  { id: 4, symbols: { ...emptySymbols(), bio: 2 } },
  { id: 5, symbols: { ...emptySymbols(), eye: 1, quantum: 1 } },
  { id: 6, symbols: { ...emptySymbols(), key: 1, quantum: 1 } },
  { id: 7, symbols: { ...emptySymbols(), eye: 1, bio: 1 } },
  { id: 8, symbols: { ...emptySymbols(), power: 1, bio: 1 } },
  { id: 9, symbols: { ...emptySymbols(), key: 2 } },
  { id: 10, symbols: { ...emptySymbols(), eye: 2 } },
  { id: 11, symbols: { ...emptySymbols(), key: 1, power: 1 } },
  { id: 12, symbols: { ...emptySymbols(), key: 1, bio: 1 } },
  { id: 13, symbols: { ...emptySymbols(), eye: 1, quantum: 1 } },
];

function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function addSymbols(...groups) {
  return groups.reduce((sum, group = {}) => {
    for (const symbol of SYMBOL_KEYS) sum[symbol] += Number(group[symbol] ?? 0);
    return sum;
  }, emptySymbols());
}

export function createRandomizedDeck() {
  // Kept under the old export name for compatibility. Mineral layouts are fixed;
  // only target selection, role assignment, and dealing are randomized.
  return {
    roles: ROLES.map((role) => ({ ...role, symbols: { ...role.symbols } })),
    locations: LOCATIONS.map((location) => ({ ...location, symbols: { ...location.symbols } })),
  };
}

export function symbolTotal(symbols = {}) {
  return SYMBOL_KEYS.reduce((total, symbol) => total + Number(symbols[symbol] ?? 0), 0);
}

export function createDeal(members, random = Math.random) {
  if (members.length !== 4) throw new Error("FOUR_PLAYERS_REQUIRED");
  const fixedDeck = createRandomizedDeck();
  const locations = shuffled(fixedDeck.locations, random);
  const roles = shuffled(fixedDeck.roles, random);
  const targetLocationId = locations[0].id;
  const assignments = [...members].sort((a, b) => a.seat - b.seat).map((member, seat) => {
    const hand = locations.slice(1 + seat * 3, 4 + seat * 3);
    const role = roles[seat];
    return {
      user_id: member.user_id,
      seat: member.seat,
      role_id: role.id,
      hand,
      totals: addSymbols(role.symbols, ...hand.map((location) => location.symbols)),
    };
  });
  return { targetLocationId, assignments, locationCatalog: fixedDeck.locations };
}

export function resolveRound({ room, members, secrets, actions, targetLocationId, previousDestroyed = 0 }) {
  const secretByUser = new Map(secrets.map((secret) => [secret.user_id, secret]));
  const actionByUser = new Map(actions.map((entry) => [entry.user_id, entry.action]));
  const activeMembers = members.filter((member) => !member.eliminated);
  const roleEntry = (roleId) => activeMembers
    .map((member) => ({ member, secret: secretByUser.get(member.user_id), action: actionByUser.get(member.user_id) }))
    .find((entry) => entry.secret?.role_id === roleId);

  const pilot = roleEntry("pilot");
  const scientist = roleEntry("scientist");
  const security = roleEntry("security");
  const spy = roleEntry("spy");
  if (!spy) throw new Error("SPY_NOT_FOUND");

  const isolation = pilot?.action?.type === "isolate" ? pilot.action.locationId : null;
  const inspection = scientist?.action?.type === "inspect" ? scientist.action.locationId : null;
  const spyAction = spy.action;
  const attacked = spyAction?.type === "attack";
  const blocked = attacked && isolation === targetLocationId;
  const succeeded = attacked && !blocked;
  const destroyed = Number(previousDestroyed) + (succeeded ? 1 : 0);
  const detected = attacked && inspection === targetLocationId;
  const secretUpdates = [];
  let eliminatedUserId = null;
  let assassination = null;
  let spyExposed = Boolean(room.public_state.spyExposed);

  if (security?.action?.type === "query") {
    const { symbol, threshold } = security.action;
    secretUpdates.push({
      user_id: security.member.user_id,
      private_result: {
        type: "security",
        symbol,
        threshold,
        answer: Number(spy.secret.totals[symbol] ?? 0) >= threshold,
        round: room.current_round,
      },
    });
  }

  let spyLog;
  if (spyAction?.type === "assassinate") {
    const targetMember = members.find((member) => member.user_id === spyAction.targetUserId);
    const targetSecret = targetMember ? secretByUser.get(targetMember.user_id) : null;
    const actualCards = (targetSecret?.hand ?? []).map((card) => Number(card.id)).sort((a, b) => a - b);
    const guessedCards = (spyAction.locationGuesses ?? []).map(Number).sort((a, b) => a - b);
    const cardsCorrect = actualCards.length === 3
      && guessedCards.length === 3
      && actualCards.every((cardId, index) => cardId === guessedCards[index]);
    const success = Boolean(targetMember && !targetMember.eliminated && targetSecret?.role_id !== "spy" && cardsCorrect);
    assassination = { targetSeat: targetMember?.seat ?? null, targetName: targetMember?.name ?? "알 수 없음", success };
    if (success) {
      eliminatedUserId = targetMember.user_id;
      spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 역추적 성공, ${targetMember.name} 탈락`;
    } else {
      spyExposed = true;
      assassination.spySeat = spy.member.seat;
      assassination.spyName = spy.member.name;
      spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 역추적 실패, 정체 강제 공개`;
    }
  } else if (spyAction?.type === "attack") {
    spyLog = blocked
      ? `CYCLE ${String(room.current_round).padStart(2, "0")} · 락다운 감지, 파괴 공작 완전 차단`
      : `CYCLE ${String(room.current_round).padStart(2, "0")} · 파괴 공작 성공, 현재 ${destroyed}/${SABOTAGE_TARGET} 스택`;
  } else {
    spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 조용히 있기, 공격하지 않음`;
  }
  secretUpdates.push({ user_id: spy.member.user_id, private_log: spyLog });

  const players = room.public_state.players.map((player) => ({
    ...player,
    submitted: false,
    eliminated: player.eliminated || members.some((member) => member.seat === player.seat && member.user_id === eliminatedUserId),
  }));
  const livingCrewMembers = members.filter((member) => {
    const secret = secretByUser.get(member.user_id);
    return secret?.role_id !== "spy" && !member.eliminated && member.user_id !== eliminatedUserId;
  }).sort((a, b) => a.seat - b.seat);
  let status = "resolution";
  let result = null;
  if (destroyed >= SABOTAGE_TARGET) {
    status = "gameover";
    result = { winner: "spy", reason: "중앙 타깃에 일곱 번째 파괴 공작이 성공했습니다.", spySeat: spy.member.seat, targetLocationId };
  } else if (livingCrewMembers.length === 0) {
    status = "gameover";
    result = { winner: "spy", reason: "역추적으로 모든 승무원이 탈락했습니다.", spySeat: spy.member.seat, targetLocationId };
  }

  return {
    status,
    destroyed,
    eliminatedUserId,
    secretUpdates,
    publicState: {
      ...room.public_state,
      players,
      lastIsolation: isolation,
      spyExposed,
      report: { isolation, inspection, detected, assassination },
      question: null,
      broadcastAnswers: null,
      investigationQueue: [],
      activeInvestigatorSeat: null,
      activeTurnSeat: null,
      turnDeadline: null,
      arrestSeat: null,
      investigationLog: room.public_state.investigationLog ?? [],
      result,
    },
  };
}
