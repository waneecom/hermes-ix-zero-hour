export const SYMBOL_KEYS = ["eye", "key", "power"];
export const ITEM_TOTALS = { eye: 10, key: 10, power: 12 };

export const ROLES = [
  { id: "pilot", symbols: { eye: 1, key: 0, power: 1 } },
  { id: "scientist", symbols: { eye: 1, key: 1, power: 0 } },
  { id: "security", symbols: { eye: 0, key: 1, power: 1 } },
  { id: "spy", symbols: { eye: 1, key: 1, power: 1 } },
];

export const LOCATIONS = [
  { id: 1, symbols: { eye: 0, key: 0, power: 3 } },
  { id: 2, symbols: { eye: 2, key: 1, power: 0 } },
  { id: 3, symbols: { eye: 0, key: 1, power: 2 } },
  { id: 4, symbols: { eye: 1, key: 0, power: 1 } },
  { id: 5, symbols: { eye: 1, key: 1, power: 0 } },
  { id: 6, symbols: { eye: 0, key: 2, power: 0 } },
  { id: 7, symbols: { eye: 2, key: 0, power: 0 } },
  { id: 8, symbols: { eye: 0, key: 0, power: 2 } },
  { id: 9, symbols: { eye: 0, key: 1, power: 0 } },
  { id: 10, symbols: { eye: 1, key: 0, power: 0 } },
  { id: 11, symbols: { eye: 0, key: 0, power: 1 } },
  { id: 12, symbols: { eye: 0, key: 1, power: 0 } },
  { id: 13, symbols: { eye: 1, key: 0, power: 0 } },
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
  return groups.reduce((sum, group) => ({
    eye: sum.eye + group.eye,
    key: sum.key + group.key,
    power: sum.power + group.power,
  }), { eye: 0, key: 0, power: 0 });
}

function symbolsFrom(items) {
  return items.reduce((symbols, item) => ({
    ...symbols,
    [item]: symbols[item] + 1,
  }), { eye: 0, key: 0, power: 0 });
}

export function createRandomizedDeck(random = Math.random) {
  const cardSizes = shuffled([
    ...Array.from({ length: 15 }, () => 2),
    1,
    1,
  ], random);
  const itemPool = shuffled(SYMBOL_KEYS.flatMap((symbol) => (
    Array.from({ length: ITEM_TOTALS[symbol] }, () => symbol)
  )), random);
  let cursor = 0;
  let cardIndex = 0;
  const nextSymbols = () => {
    const size = cardSizes[cardIndex];
    cardIndex += 1;
    const symbols = symbolsFrom(itemPool.slice(cursor, cursor + size));
    cursor += size;
    return symbols;
  };
  const roles = ROLES.map((role) => ({ ...role, symbols: nextSymbols() }));
  const locations = LOCATIONS.map((location) => ({ ...location, symbols: nextSymbols() }));
  return { roles, locations };
}

export function symbolTotal(symbols) {
  return symbols.eye + symbols.key + symbols.power;
}

export function createDeal(members, random = Math.random) {
  if (members.length !== 4) throw new Error("FOUR_PLAYERS_REQUIRED");
  const randomizedDeck = createRandomizedDeck(random);
  const locations = shuffled(randomizedDeck.locations, random);
  const roles = shuffled(randomizedDeck.roles, random);
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
  return { targetLocationId, assignments };
}

export function resolveRound({ room, members, secrets, actions, targetLocationId }) {
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
  const destroyed = Number(room.public_state.destroyed ?? 0) + (succeeded ? 1 : 0);
  const detected = attacked && inspection === targetLocationId;
  const spyTotal = detected ? symbolTotal(spy.secret.totals) : null;
  const secretUpdates = [];
  let eliminatedUserId = null;
  let assassination = null;
  let spyExposed = Boolean(room.public_state.spyExposed);

  if (security?.action?.type === "query") {
    const { symbol, threshold } = security.action;
    secretUpdates.push({
      user_id: security.member.user_id,
      private_result: { type: "security", symbol, threshold, answer: spy.secret.totals[symbol] >= threshold, round: room.current_round },
    });
  }

  let spyLog;
  if (spyAction?.type === "assassinate") {
    const targetMember = members.find((member) => member.user_id === spyAction.targetUserId);
    const targetSecret = targetMember ? secretByUser.get(targetMember.user_id) : null;
    const targetAction = targetMember ? actionByUser.get(targetMember.user_id) : null;
    const totalCorrect = Boolean(targetSecret) && symbolTotal(targetSecret.totals) === spyAction.totalGuess;
    let secondCorrect = false;
    if (targetSecret?.role_id === "pilot") secondCorrect = targetAction?.type === "isolate" && targetAction.locationId === spyAction.locationGuess;
    if (targetSecret?.role_id === "scientist") secondCorrect = targetAction?.type === "inspect" && targetAction.locationId === spyAction.locationGuess;
    if (targetSecret?.role_id === "security") secondCorrect = targetAction?.type === "query" && targetAction.symbol === spyAction.symbolGuess;
    const success = Boolean(targetMember && !targetMember.eliminated && targetSecret?.role_id !== "spy" && totalCorrect && secondCorrect);
    assassination = { targetSeat: targetMember?.seat ?? null, targetName: targetMember?.name ?? "알 수 없음", success };
    if (success) {
      eliminatedUserId = targetMember.user_id;
      spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 역저격 성공, ${targetMember.name} 탈락`;
    } else {
      spyExposed = true;
      assassination.spySeat = spy.member.seat;
      assassination.spyName = spy.member.name;
      spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 역저격 실패, 정체 강제 공개`;
    }
  } else if (spyAction?.type === "attack") {
    spyLog = blocked
      ? `CYCLE ${String(room.current_round).padStart(2, "0")} · 락다운 감지, 공작 완전 차단`
      : `CYCLE ${String(room.current_round).padStart(2, "0")} · 공작 성공, 현재 ${destroyed}/5 스택`;
  } else {
    spyLog = `CYCLE ${String(room.current_round).padStart(2, "0")} · 위장 유지, 공격하지 않음`;
  }
  secretUpdates.push({ user_id: spy.member.user_id, private_log: spyLog });

  const players = room.public_state.players.map((player) => ({
    ...player,
    submitted: false,
    eliminated: player.eliminated || members.some((member) => member.seat === player.seat && member.user_id === eliminatedUserId),
  }));
  const livingCrew = members.filter((member) => {
    const secret = secretByUser.get(member.user_id);
    return secret?.role_id !== "spy" && !member.eliminated && member.user_id !== eliminatedUserId;
  }).length;

  let status = "resolution";
  let result = null;
  if (destroyed >= 5) {
    status = "gameover";
    result = { winner: "spy", reason: "중앙 타깃에 다섯 번째 파괴 공작이 성공했습니다.", spySeat: spy.member.seat, targetLocationId };
  } else if (livingCrew === 0) {
    status = "gameover";
    result = { winner: "spy", reason: "역저격으로 모든 승무원이 탈락했습니다.", spySeat: spy.member.seat, targetLocationId };
  }

  return {
    status,
    eliminatedUserId,
    secretUpdates,
    publicState: {
      ...room.public_state,
      players,
      destroyed,
      lastIsolation: isolation,
      spyExposed,
      report: { isolation, inspection, detected, spyTotal, assassination },
      question: null,
      broadcastAnswers: null,
      result,
    },
  };
}
