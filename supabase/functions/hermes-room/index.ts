import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createDeal, resolveRound, SYMBOL_KEYS } from "./engine.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type JsonRecord = Record<string, unknown>;

class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function cleanName(value: unknown) {
  const name = String(value ?? "").trim().slice(0, 16);
  if (!name) throw new ApiError("이름을 입력하십시오.");
  return name;
}

function cleanCode(value: unknown) {
  const code = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (code.length !== 6) throw new ApiError("6자리 방 코드를 입력하십시오.");
  return code;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => alphabet[byte % alphabet.length]).join("");
}

function validLocation(value: unknown) {
  const location = Number(value);
  if (!Number.isInteger(location) || location < 1 || location > 13) throw new ApiError("올바른 구역을 선택하십시오.");
  return location;
}

function validSymbol(value: unknown) {
  const symbol = String(value);
  if (!SYMBOL_KEYS.includes(symbol)) throw new ApiError("올바른 아이템을 선택하십시오.");
  return symbol;
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ApiError("인증이 필요합니다.", 401);
  const token = authorization.slice(7);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError("세션이 만료되었습니다.", 401);
  return data.user;
}

async function loadContext(roomId: string, userId: string) {
  const [roomResult, memberResult, secretResult] = await Promise.all([
    admin.from("hermes_ix_rooms").select("*").eq("id", roomId).single(),
    admin.from("hermes_ix_room_members").select("*").eq("room_id", roomId).eq("user_id", userId).single(),
    admin.from("hermes_ix_player_secrets").select("*").eq("room_id", roomId).eq("user_id", userId).maybeSingle(),
  ]);
  if (roomResult.error) throw new ApiError("방을 찾을 수 없습니다.", 404);
  if (memberResult.error) throw new ApiError("이 방의 참가자가 아닙니다.", 403);
  return { room: roomResult.data, member: memberResult.data, secret: secretResult.data };
}

async function view(roomId: string, userId: string) {
  const { room, member, secret } = await loadContext(roomId, userId);
  let targetLocationId: number | null = null;
  if (secret?.role_id === "spy") {
    const { data } = await admin.from("hermes_ix_room_internal")
      .select("target_location_id")
      .eq("room_id", roomId)
      .maybeSingle();
    targetLocationId = data?.target_location_id ?? null;
  }
  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      round: room.current_round,
      revision: room.revision,
      publicState: room.public_state,
    },
    me: {
      seat: member.seat,
      name: member.name,
      eliminated: member.eliminated,
      isHost: room.host_user_id === userId,
    },
    secret: secret ? {
      roleId: secret.role_id,
      hand: secret.hand,
      totals: secret.totals,
      privateLog: secret.private_log,
      privateResult: secret.private_result,
      targetLocationId,
    } : null,
  };
}

async function updateRoom(room: JsonRecord, values: JsonRecord) {
  const { data, error } = await admin.from("hermes_ix_rooms")
    .update({ ...values, revision: Number(room.revision) + 1, updated_at: new Date().toISOString() })
    .eq("id", room.id)
    .eq("revision", room.revision)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("다른 플레이어의 처리가 먼저 완료되었습니다. 다시 시도하십시오.", 409);
  return data;
}

async function roomMembers(roomId: string) {
  const { data, error } = await admin.from("hermes_ix_room_members").select("*").eq("room_id", roomId).order("seat");
  if (error) throw error;
  return data;
}

async function createRoom(userId: string, name: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomId = crypto.randomUUID();
    const code = randomCode();
    const { error } = await admin.rpc("hermes_ix_create_room", { p_room_id: roomId, p_code: code, p_user_id: userId, p_name: name });
    if (!error) return view(roomId, userId);
    if (error.code !== "23505") throw error;
  }
  throw new ApiError("방 코드를 생성하지 못했습니다. 다시 시도하십시오.", 503);
}

async function joinRoom(userId: string, name: string, code: string) {
  const { data, error } = await admin.rpc("hermes_ix_join_room", { p_code: code, p_user_id: userId, p_name: name });
  if (error) throw new ApiError(error.message.replace(/^.*?(ROOM_|FOUR_)/, "$1"));
  return view(String(data.room_id), userId);
}

async function startRoom(roomId: string, userId: string) {
  const { room, member } = await loadContext(roomId, userId);
  if (room.host_user_id !== userId) throw new ApiError("방장만 게임을 시작할 수 있습니다.", 403);
  if (room.status !== "lobby") throw new ApiError("이미 시작된 방입니다.");
  const members = await roomMembers(roomId);
  if (members.length !== 4) throw new ApiError("4명이 모두 입장해야 시작할 수 있습니다.");
  const deal = createDeal(members);
  const publicState = {
    players: members.map((entry) => ({ seat: entry.seat, name: entry.name, eliminated: false, submitted: false })),
    destroyed: 0,
    lastIsolation: null,
    spyExposed: false,
    report: null,
    result: null,
    activeInvestigatorSeat: null,
    question: null,
    broadcastAnswers: null,
    investigationQueue: [],
    investigationLog: [],
    arrestSeat: null,
  };
  const { error } = await admin.rpc("hermes_ix_start_room", {
    p_room_id: roomId,
    p_host_user_id: member.user_id,
    p_assignments: deal.assignments,
    p_target_location_id: deal.targetLocationId,
    p_public_state: publicState,
  });
  if (error) throw error;
  return view(roomId, userId);
}

async function normalizeAction(roomId: string, room: JsonRecord, secret: JsonRecord, action: JsonRecord) {
  const roleId = String(secret.role_id);
  if (roleId === "pilot") {
    if (action.type === "basic") return { type: "basic" };
    if (Number(room.current_round) % 2 !== 0) throw new ApiError("락다운은 자신의 2·4·6…번째 턴에만 사용할 수 있습니다.");
    if (action.type !== "isolate") throw new ApiError("조종사는 락다운을 제출해야 합니다.");
    const locationId = validLocation(action.locationId);
    if (locationId === Number((room.public_state as JsonRecord).lastIsolation)) throw new ApiError("직전 구역은 연속 락다운할 수 없습니다.");
    return { type: "isolate", locationId };
  }
  if (roleId === "scientist") {
    if (action.type === "basic") return { type: "basic" };
    if (Number(room.current_round) % 2 !== 0) throw new ApiError("현장 감식은 자신의 2·4·6…번째 턴에만 사용할 수 있습니다.");
    if (action.type !== "inspect") throw new ApiError("과학자는 감식 구역을 제출해야 합니다.");
    return { type: "inspect", locationId: validLocation(action.locationId) };
  }
  if (roleId === "security") {
    if (action.type === "basic") return { type: "basic" };
    if (action.type !== "query") throw new ApiError("보안 책임자는 기밀 조회를 제출해야 합니다.");
    const threshold = Number(action.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) throw new ApiError("조회 기준은 1~20개여야 합니다.");
    return { type: "query", symbol: validSymbol(action.symbol), threshold };
  }
  if (roleId !== "spy") throw new ApiError("역할 정보를 확인할 수 없습니다.");
  if (action.type === "attack" || action.type === "wait") return { type: action.type };
  if (action.type !== "assassinate") throw new ApiError("올바른 스파이 행동을 선택하십시오.");
  const members = await roomMembers(roomId);
  const target = members.find((entry) => entry.seat === Number(action.targetSeat));
  if (!target || target.eliminated) throw new ApiError("유효한 생존 승무원을 선택하십시오.");
  const { data: targetSecret, error } = await admin.from("hermes_ix_player_secrets").select("role_id").eq("room_id", roomId).eq("user_id", target.user_id).single();
  if (error || targetSecret.role_id === "spy") throw new ApiError("자신은 저격할 수 없습니다.");
  const totalGuess = Number(action.totalGuess);
  if (!Number.isInteger(totalGuess) || totalGuess < 2 || totalGuess > 20) throw new ApiError("광물 총합 추측값은 2~20개여야 합니다.");
  return {
    type: "assassinate",
    targetUserId: target.user_id,
    totalGuess,
    locationGuess: targetSecret.role_id === "pilot" || targetSecret.role_id === "scientist" ? validLocation(action.locationGuess) : null,
    symbolGuess: targetSecret.role_id === "security" ? validSymbol(action.symbolGuess) : null,
  };
}

async function submitAction(roomId: string, userId: string, rawAction: JsonRecord) {
  const { room, secret } = await loadContext(roomId, userId);
  if (room.status !== "action") throw new ApiError("현재는 행동 제출 단계가 아닙니다.");
  if (!secret) throw new ApiError("비밀 역할이 아직 배분되지 않았습니다.");
  const action = await normalizeAction(roomId, room, secret, rawAction);
  const { data, error } = await admin.rpc("hermes_ix_store_action", {
    p_room_id: roomId,
    p_round: room.current_round,
    p_user_id: userId,
    p_action: action,
  });
  if (error) {
    if (error.code === "23505") throw new ApiError("이미 이번 라운드 행동을 제출했습니다.", 409);
    throw error;
  }

  if (data.should_resolve) {
    const [freshRoom, members, secretsResult, actionsResult, internalResult] = await Promise.all([
      admin.from("hermes_ix_rooms").select("*").eq("id", roomId).single(),
      roomMembers(roomId),
      admin.from("hermes_ix_player_secrets").select("*").eq("room_id", roomId),
      admin.from("hermes_ix_round_actions").select("*").eq("room_id", roomId).eq("round", room.current_round),
      admin.from("hermes_ix_room_internal").select("target_location_id").eq("room_id", roomId).single(),
    ]);
    if (freshRoom.error || secretsResult.error || actionsResult.error || internalResult.error) throw new ApiError("라운드 판정 데이터를 불러오지 못했습니다.", 500);
    const resolution = resolveRound({
      room: freshRoom.data,
      members,
      secrets: secretsResult.data,
      actions: actionsResult.data,
      targetLocationId: internalResult.data.target_location_id,
    });
    const { error: finalError } = await admin.rpc("hermes_ix_finalize_resolution", {
      p_room_id: roomId,
      p_public_state: resolution.publicState,
      p_status: resolution.status,
      p_eliminated_user_id: resolution.eliminatedUserId,
      p_secret_updates: resolution.secretUpdates,
    });
    if (finalError) throw finalError;
  }
  return view(roomId, userId);
}

async function openInvestigation(roomId: string, userId: string) {
  const { room } = await loadContext(roomId, userId);
  if (room.host_user_id !== userId) throw new ApiError("방장만 수사 단계를 열 수 있습니다.", 403);
  if (room.status !== "resolution") throw new ApiError("현재 수사 단계를 열 수 없습니다.");
  const queue = Array.isArray(room.public_state.investigationQueue)
    ? room.public_state.investigationQueue.map(Number)
    : [];
  const seat = queue[0] ?? null;
  await updateRoom(room, {
    status: seat === null ? "arrest" : "investigation",
    public_state: {
      ...room.public_state,
      activeInvestigatorSeat: seat ?? room.public_state.arrestSeat,
      question: null,
      broadcastAnswers: null,
    },
  });
  return view(roomId, userId);
}

function validateQuestion(body: JsonRecord) {
  const threshold = Number(body.threshold);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) throw new ApiError("질문 기준은 1~20개여야 합니다.");
  return { symbol: validSymbol(body.symbol), threshold };
}

function advanceInvestigation(publicState: JsonRecord, currentSeat: number) {
  const queue = Array.isArray(publicState.investigationQueue)
    ? publicState.investigationQueue.map(Number)
    : [];
  const nextSeat = queue[queue.indexOf(currentSeat) + 1] ?? null;
  return {
    status: nextSeat === null ? "arrest" : "investigation",
    activeInvestigatorSeat: nextSeat ?? Number(publicState.arrestSeat),
  };
}

async function privateQuestion(roomId: string, userId: string, body: JsonRecord) {
  const { room, member } = await loadContext(roomId, userId);
  if (room.status !== "investigation" || Number(room.public_state.activeInvestigatorSeat) !== member.seat) throw new ApiError("현재 수사 담당자만 질문할 수 있습니다.", 403);
  const question = validateQuestion(body);
  const members = await roomMembers(roomId);
  const target = members.find((entry) => entry.seat === Number(body.targetSeat) && !entry.eliminated && entry.user_id !== userId);
  if (!target) throw new ApiError("유효한 심문 대상을 선택하십시오.");
  const { data: targetSecret, error } = await admin.from("hermes_ix_player_secrets").select("totals").eq("room_id", roomId).eq("user_id", target.user_id).single();
  if (error) throw error;
  const answer = Number(targetSecret.totals[question.symbol]) >= question.threshold;
  const log = {
    round: room.current_round,
    investigatorSeat: member.seat,
    investigatorName: member.name,
    mode: "targeted",
    targetSeat: target.seat,
    targetName: target.name,
    ...question,
    answers: [{ seat: target.seat, name: target.name, answer }],
  };
  const next = advanceInvestigation(room.public_state, member.seat);
  await updateRoom(room, {
    status: next.status,
    public_state: {
      ...room.public_state,
      activeInvestigatorSeat: next.activeInvestigatorSeat,
      question: null,
      broadcastAnswers: null,
      investigationLog: [...(Array.isArray(room.public_state.investigationLog) ? room.public_state.investigationLog : []), log],
    },
  });
  return view(roomId, userId);
}

async function broadcastQuestion(roomId: string, userId: string, body: JsonRecord) {
  const { room, member } = await loadContext(roomId, userId);
  if (room.status !== "investigation" || Number(room.public_state.activeInvestigatorSeat) !== member.seat) throw new ApiError("현재 수사 담당자만 질문할 수 있습니다.", 403);
  const question = validateQuestion(body);
  await updateRoom(room, {
    status: "broadcast",
    public_state: {
      ...room.public_state,
      question: { mode: "broadcast", ...question, investigatorSeat: member.seat, investigatorName: member.name },
      broadcastAnswers: null,
    },
  });
  return view(roomId, userId);
}

async function broadcastAnswer(roomId: string, userId: string, answer: unknown) {
  const { room, secret } = await loadContext(roomId, userId);
  if (room.status !== "broadcast" || secret?.role_id !== "spy") throw new ApiError("스파이만 방송 응답을 선택할 수 있습니다.", 403);
  if (typeof answer !== "boolean") throw new ApiError("O 또는 X를 선택하십시오.");
  const question = room.public_state.question;
  const [members, secretsResult] = await Promise.all([
    roomMembers(roomId),
    admin.from("hermes_ix_player_secrets").select("*").eq("room_id", roomId),
  ]);
  if (secretsResult.error) throw secretsResult.error;
  const secrets = new Map(secretsResult.data.map((entry) => [entry.user_id, entry]));
  const answers = members.filter((entry) => !entry.eliminated).map((entry) => {
    const playerSecret = secrets.get(entry.user_id);
    const value = playerSecret.role_id === "spy" ? answer : Number(playerSecret.totals[question.symbol]) >= Number(question.threshold);
    return { seat: entry.seat, name: entry.name, answer: value };
  });
  const investigatorSeat = Number(question.investigatorSeat);
  const log = {
    round: room.current_round,
    investigatorSeat,
    investigatorName: question.investigatorName,
    mode: "broadcast",
    symbol: question.symbol,
    threshold: question.threshold,
    answers,
  };
  const next = advanceInvestigation(room.public_state, investigatorSeat);
  await updateRoom(room, {
    status: next.status,
    public_state: {
      ...room.public_state,
      activeInvestigatorSeat: next.activeInvestigatorSeat,
      question: null,
      broadcastAnswers: null,
      investigationLog: [...(Array.isArray(room.public_state.investigationLog) ? room.public_state.investigationLog : []), log],
    },
  });
  return view(roomId, userId);
}

async function arrest(roomId: string, userId: string, body: JsonRecord) {
  const { room, member, secret } = await loadContext(roomId, userId);
  if (room.status !== "arrest" || Number(room.public_state.activeInvestigatorSeat) !== member.seat) throw new ApiError("현재 수사 담당자만 체포를 선언할 수 있습니다.", 403);
  if (secret?.role_id === "spy") throw new ApiError("스파이는 체포를 선언할 수 없습니다.", 403);
  const suspectSeat = Number(body.suspectSeat);
  const locationId = validLocation(body.locationId);
  const [members, secretsResult, internalResult] = await Promise.all([
    roomMembers(roomId),
    admin.from("hermes_ix_player_secrets").select("user_id,role_id").eq("room_id", roomId),
    admin.from("hermes_ix_room_internal").select("target_location_id").eq("room_id", roomId).single(),
  ]);
  if (secretsResult.error || internalResult.error) throw new ApiError("체포 판정 데이터를 불러오지 못했습니다.", 500);
  const spySecret = secretsResult.data.find((entry) => entry.role_id === "spy");
  const spyMember = members.find((entry) => entry.user_id === spySecret?.user_id);
  const correctSpy = spyMember?.seat === suspectSeat;
  const correctTarget = internalResult.data.target_location_id === locationId;
  const winner = correctSpy && correctTarget ? "crew" : "spy";
  const reason = correctSpy && correctTarget
    ? `${member.name}의 체포 선언이 두 항목 모두 일치했습니다.`
    : `체포 선언 오류 — ${!correctSpy ? "스파이 식별" : "타깃 구역"}이 틀렸습니다.`;
  await updateRoom(room, {
    status: "gameover",
    public_state: { ...room.public_state, result: { winner, reason, spySeat: spyMember?.seat, targetLocationId: internalResult.data.target_location_id } },
  });
  return view(roomId, userId);
}

async function nextRound(roomId: string, userId: string) {
  const { room } = await loadContext(roomId, userId);
  if (room.host_user_id !== userId) throw new ApiError("방장만 다음 라운드를 시작할 수 있습니다.", 403);
  if (room.status !== "arrest") throw new ApiError("체포 판단이 끝난 뒤 다음 라운드로 이동할 수 있습니다.");
  const players = room.public_state.players.map((player: JsonRecord) => ({ ...player, submitted: false }));
  const { error } = await admin.from("hermes_ix_player_secrets").update({ private_result: null }).eq("room_id", roomId);
  if (error) throw error;
  await updateRoom(room, {
    status: "action",
    current_round: Number(room.current_round) + 1,
    public_state: {
      ...room.public_state,
      players,
      report: null,
      activeInvestigatorSeat: null,
      investigationQueue: [],
      arrestSeat: null,
      question: null,
      broadcastAnswers: null,
    },
  });
  return view(roomId, userId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticatedUser(req);
    const body = await req.json() as JsonRecord;
    const operation = String(body.operation ?? "view");
    const roomId = String(body.roomId ?? "");
    let data;
    if (operation === "create") data = await createRoom(user.id, cleanName(body.name));
    else if (operation === "join") data = await joinRoom(user.id, cleanName(body.name), cleanCode(body.code));
    else if (operation === "view") data = await view(roomId, user.id);
    else if (operation === "start") data = await startRoom(roomId, user.id);
    else if (operation === "action") data = await submitAction(roomId, user.id, (body.action ?? {}) as JsonRecord);
    else if (operation === "investigate") data = await openInvestigation(roomId, user.id);
    else if (operation === "private_question") data = await privateQuestion(roomId, user.id, body);
    else if (operation === "broadcast_question") data = await broadcastQuestion(roomId, user.id, body);
    else if (operation === "broadcast_answer") data = await broadcastAnswer(roomId, user.id, body.answer);
    else if (operation === "arrest") data = await arrest(roomId, user.id, body);
    else if (operation === "next_round") data = await nextRound(roomId, user.id);
    else throw new ApiError("지원하지 않는 요청입니다.");
    return response({ data });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "알 수 없는 서버 오류";
    console.error(message);
    return response({ error: message }, status);
  }
});
