import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ensureAnonymousSession, isSupabaseConfigured, supabase } from "./supabase";
import "./multiplayer.css";

type SymbolKey = "eye" | "key" | "power" | "bio" | "quantum";
type RoleId = "pilot" | "scientist" | "security" | "spy";
type RoomStatus = "lobby" | "action" | "resolving" | "resolution" | "investigation" | "broadcast" | "arrest" | "gameover";
type Symbols = Record<SymbolKey, number>;
type PublicPlayer = { seat: number; name: string; eliminated: boolean; submitted: boolean };
type InvestigationEntry = {
  round: number; investigatorSeat: number; investigatorName: string; mode: "targeted" | "broadcast";
  symbol: SymbolKey; threshold: number; targetSeat?: number; targetName?: string;
  answers: Array<{ seat: number; name: string; answer: boolean }>;
};
type Report = {
  isolation: number | null; inspection: number | null; detected: boolean; spyTotal: number | null;
  assassination?: { targetSeat: number | null; targetName: string; success: boolean; spySeat?: number; spyName?: string } | null;
};
type PublicState = {
  players: PublicPlayer[]; destroyed: number; lastIsolation: number | null; spyExposed: boolean; report: Report | null;
  result: { winner: "crew" | "spy"; reason: string; spySeat: number; targetLocationId: number } | null;
  activeInvestigatorSeat: number | null; arrestSeat: number | null; investigationQueue: number[];
  investigationLog: InvestigationEntry[];
  question: { mode: "broadcast"; symbol: SymbolKey; threshold: number; investigatorSeat: number; investigatorName: string } | null;
  broadcastAnswers: Array<{ seat: number; name: string; answer: boolean }> | null;
};
type RoomView = {
  room: { id: string; code: string; status: RoomStatus; round: number; revision: number; publicState: PublicState };
  me: { seat: number; name: string; eliminated: boolean; isHost: boolean };
  secret: null | {
    roleId: RoleId; hand: Array<{ id: number; symbols: Symbols }>; totals: Symbols;
    privateLog: string | null;
    privateResult: { type: string; symbol: SymbolKey; threshold: number; answer: boolean; round: number } | null;
    targetLocationId: number | null;
  };
};

const SYMBOLS: Record<SymbolKey, { icon: string; name: string; code: string }> = {
  eye: { icon: "◉", name: "센서 결정", code: "SENSOR" },
  key: { icon: "◆", name: "보안 결정", code: "SECURITY" },
  power: { icon: "ϟ", name: "전력 결정", code: "POWER" },
  bio: { icon: "✦", name: "생체 결정", code: "BIO" },
  quantum: { icon: "⬡", name: "양자 결정", code: "QUANTUM" },
};
const symbolKeys = Object.keys(SYMBOLS) as SymbolKey[];
const ZERO_SYMBOLS: Symbols = { eye: 0, key: 0, power: 0, bio: 0, quantum: 0 };
const ROLES: Record<RoleId, { name: string; english: string; action: string; alignment: "crew" | "spy" }> = {
  pilot: { name: "수석 조종사", english: "CHIEF PILOT", action: "짝수 턴 락다운", alignment: "crew" },
  scientist: { name: "수석 과학자", english: "CHIEF SCIENTIST", action: "짝수 턴 현장 감식", alignment: "crew" },
  security: { name: "보안 책임자", english: "SECURITY DIRECTOR", action: "기본 조사 또는 기밀 조회", alignment: "crew" },
  spy: { name: "기계 관리사", english: "HUMANOID INFILTRATOR", action: "파괴 공격 / 조용히 있기 / 역추적", alignment: "spy" },
};
const LOCATIONS = [
  [1, "제1 메인 리액터실", "MAIN REACTOR"], [2, "양자 연산 코어실", "QUANTUM CORE"], [3, "중력 제어 장치실", "GRAVITY CONTROL"],
  [4, "생명유지 산소실", "LIFE SUPPORT"], [5, "서브 통신 중계탑", "COMMS RELAY"], [6, "함교 항법 콘솔실", "NAV CONSOLE"],
  [7, "바이오 큐브 연구실", "BIO CUBE LAB"], [8, "비상 동력 배전반", "EMERGENCY GRID"], [9, "격벽 보안 통제실", "BULKHEAD SECURITY"],
  [10, "센서 레이더 돔", "SENSOR DOME"], [11, "보조 플라즈마 추진실", "PLASMA DRIVE"], [12, "선외 탈출 포드실", "ESCAPE PODS"],
  [13, "암흑물질 차폐고", "DARK MATTER VAULT"],
] as const;
const ART_ROOT = "/assets/hermes";

function locationName(id: number | null | undefined) { return LOCATIONS.find((entry) => entry[0] === id)?.[1] ?? "미지정"; }
function roleImage(roleId: RoleId) { return `${ART_ROOT}/role-${roleId}.jpg`; }
function locationImage(locationId: number) { return `${ART_ROOT}/location-${String(locationId).padStart(2, "0")}.jpg`; }
function total(symbols?: Partial<Symbols>) { return symbolKeys.reduce((sum, key) => sum + Number(symbols?.[key] ?? 0), 0); }
function addSymbols(...groups: Array<Partial<Symbols>>): Symbols {
  const sum: Symbols = { ...ZERO_SYMBOLS };
  for (const group of groups) {
    for (const key of symbolKeys) sum[key] = Number(sum[key] ?? 0) + Number(group[key] ?? 0);
  }
  return sum;
}
function subtractSymbols(all: Symbols, used: Symbols) {
  return Object.fromEntries(symbolKeys.map((key) => [key, Number(all[key] ?? 0) - Number(used[key] ?? 0)])) as Symbols;
}

function SymbolStrip({ symbols }: { symbols: Partial<Symbols> }) {
  return <div className="mp-symbols">{symbolKeys.map((key) => <span className={`mineral-${key}`} key={key}>{SYMBOLS[key].icon} {Number(symbols[key] ?? 0)}</span>)}</div>;
}

function SymbolPicker({ value, onChange }: { value: SymbolKey; onChange: (value: SymbolKey) => void }) {
  return <div className="mp-symbol-picker">{symbolKeys.map((key) => (
    <button className={value === key ? "selected" : ""} type="button" onClick={() => onChange(key)} key={key}>
      <b>{SYMBOLS[key].icon}</b><span>{SYMBOLS[key].name}<small>{SYMBOLS[key].code}</small></span>
    </button>
  ))}</div>;
}

function LocationPicker({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: number | null }) {
  return <div className="mp-location-grid">{LOCATIONS.map(([id, name, english]) => (
    <button type="button" disabled={id === disabled} className={value === id ? "selected" : ""} onClick={() => onChange(id)} key={id}>
      <img src={locationImage(id)} alt="" loading="lazy"/><b>{String(id).padStart(2, "0")}</b>
      <span>{name}<small>{id === disabled ? "LOCKDOWN COOLDOWN" : english}</small></span>
    </button>
  ))}</div>;
}

function InvestigationLog({ entries }: { entries: InvestigationEntry[] }) {
  if (!entries?.length) return <div className="mp-intel-empty">아직 공유된 기본 조사 결과가 없습니다.</div>;
  return <div className="mp-intel-log">{entries.slice().reverse().map((entry, index) => (
    <article key={`${entry.round}-${entry.investigatorSeat}-${index}`}>
      <small>CYCLE {String(entry.round).padStart(2, "0")} · {entry.investigatorName}</small>
      <p><b>{entry.mode === "targeted" ? `${entry.targetName} 특정 조사` : "전체 보유 조사"}</b><br/>
        {SYMBOLS[entry.symbol].icon} {SYMBOLS[entry.symbol].name} {entry.threshold}개 이상</p>
      <div>{entry.answers.map((answer) => <span key={answer.seat}>{answer.name} <b>{answer.answer ? "O" : "X"}</b></span>)}</div>
    </article>
  ))}</div>;
}

export default function MultiplayerApp({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [name, setName] = useState(() => localStorage.getItem("hermes-player-name") ?? "");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [realtime, setRealtime] = useState("연결 대기");
  const [selectedLocation, setSelectedLocation] = useState(1);
  const [querySymbol, setQuerySymbol] = useState<SymbolKey>("eye");
  const [queryThreshold, setQueryThreshold] = useState(3);
  const [questionMode, setQuestionMode] = useState<"targeted" | "broadcast">("targeted");
  const [spyChoice, setSpyChoice] = useState<"attack" | "wait" | "assassinate">("attack");
  const [targetSeat, setTargetSeat] = useState(0);
  const [totalGuess, setTotalGuess] = useState(8);
  const [locationGuess, setLocationGuess] = useState(1);
  const [symbolGuess, setSymbolGuess] = useState<SymbolKey>("eye");
  const [questionTarget, setQuestionTarget] = useState(0);
  const [suspectSeat, setSuspectSeat] = useState(0);
  const [accusedLocation, setAccusedLocation] = useState(1);

  const invoke = useCallback(async (operation: string, payload: Record<string, unknown> = {}, silent = false) => {
    if (!supabase) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
    if (!silent) { setBusy(true); setError(""); }
    try {
      await ensureAnonymousSession();
      const { data, error: functionError } = await supabase.functions.invoke("hermes-room", { body: { operation, ...payload } });
      if (functionError) {
        let message = functionError.message;
        const context = (functionError as unknown as { context?: Response }).context;
        if (context) { try { const body = await context.clone().json(); message = body.error ?? message; } catch { /* use SDK message */ } }
        throw new Error(message);
      }
      const next = data?.data as RoomView;
      if (next?.room?.id) {
        setView(next);
        localStorage.setItem("hermes-room-id", next.room.id);
        localStorage.setItem("hermes-player-name", next.me.name);
      }
      return next;
    } finally { if (!silent) setBusy(false); }
  }, []);

  const refresh = useCallback(async (silent = true) => {
    const roomId = view?.room.id ?? localStorage.getItem("hermes-room-id");
    if (!roomId) return;
    try { await invoke("view", { roomId }, silent); }
    catch (reason) { if (!silent) setError(reason instanceof Error ? reason.message : "방 정보를 불러오지 못했습니다."); }
  }, [invoke, view?.room.id]);

  useEffect(() => {
    void (async () => {
      try {
        if (!isSupabaseConfigured) throw new Error("Supabase 환경 변수가 없습니다.");
        await ensureAnonymousSession();
        setReady(true);
        const roomId = localStorage.getItem("hermes-room-id");
        if (roomId) await invoke("view", { roomId }, true);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "인증 연결 실패"); setReady(true); }
    })();
  }, [invoke]);

  useEffect(() => {
    const client = supabase;
    if (!client || !view?.room.id) return;
    const roomId = view.room.id;
    const channel = client.channel(`hermes-room-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hermes_ix_rooms", filter: `id=eq.${roomId}` }, () => { void refresh(true); })
      .subscribe((status) => setRealtime(status === "SUBSCRIBED" ? "실시간 연결됨" : status));
    const poll = window.setInterval(() => { void refresh(true); }, 5000);
    return () => { window.clearInterval(poll); void client.removeChannel(channel); };
  }, [refresh, view?.room.id]);

  const act = async (operation: string, payload: Record<string, unknown> = {}) => {
    try { await invoke(operation, { roomId: view?.room.id, ...payload }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "요청 처리 실패"); }
  };
  const create = async () => { try { await invoke("create", { name }); } catch (reason) { setError(reason instanceof Error ? reason.message : "방 생성 실패"); } };
  const join = async () => { try { await invoke("join", { name, code }); } catch (reason) { setError(reason instanceof Error ? reason.message : "방 참가 실패"); } };
  const leaveLocal = () => { localStorage.removeItem("hermes-room-id"); setView(null); setError(""); };

  if (!ready) return <main className="mp-shell"><div className="mp-center"><div className="mp-loader"/><p>HERMES NETWORK 인증 중…</p></div></main>;
  if (!view) return <main className="mp-shell">
    <header className="mp-top"><button type="button" onClick={onExit}>H<span>IX</span></button><div><small>ONLINE MULTIPLAYER PROTOCOL</small><h1>ZERO HOUR / LINK</h1></div></header>
    <section className="mp-entry"><div className="mp-entry-intro"><img src={`${ART_ROOT}/hero.jpg`} alt="헤르메스-IX 함선"/><p className="mp-kicker">4 DEVICES · ONE MISSION</p><h2>각자의 화면으로<br/><em>동시에 접속.</em></h2><p>방장이 6자리 코드를 만들고 나머지 3명이 참가합니다. 역할과 손패는 각자의 기기에만 표시됩니다.</p></div>
      <div className="mp-entry-panel"><label><span>CALLSIGN · 플레이어 이름</span><input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} placeholder="이름 입력"/></label><button className="mp-primary" type="button" disabled={busy || !name.trim()} onClick={create}>새 작전실 생성</button><div className="mp-divider"><span>OR JOIN EXISTING ROOM</span></div><label><span>ACCESS CODE · 6자리</span><input className="mp-code-input" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123"/></label><button className="mp-secondary" type="button" disabled={busy || !name.trim() || code.length !== 6} onClick={join}>코드로 참가</button>{error ? <p className="mp-error">{error}</p> : null}</div>
    </section>
  </main>;

  const state = view.room.publicState;
  const myPublic = state.players.find((player) => player.seat === view.me.seat);
  const activePlayer = state.players.find((player) => player.seat === state.activeInvestigatorSeat);
  const aliveOthers = state.players.filter((player) => !player.eliminated && player.seat !== view.me.seat);
  const firstOtherSeat = aliveOthers[0]?.seat ?? 0;
  const validTargetSeat = aliveOthers.some((player) => player.seat === targetSeat) ? targetSeat : firstOtherSeat;
  const validQuestionTarget = aliveOthers.some((player) => player.seat === questionTarget) ? questionTarget : firstOtherSeat;
  const validSuspectSeat = aliveOthers.some((player) => player.seat === suspectSeat) ? suspectSeat : firstOtherSeat;
  const header = <header className="mp-top"><button type="button" onClick={leaveLocal}>H<span>IX</span></button><div><small>ROOM {view.room.code} · {realtime}</small><h1>ZERO HOUR / CYCLE {String(view.room.round).padStart(2, "0")}</h1></div><nav><span>SEAT {String(view.me.seat + 1).padStart(2, "0")} · {view.me.name}</span><button type="button" onClick={leaveLocal}>나가기</button></nav></header>;

  if (view.room.status === "lobby") return <main className="mp-shell">{header}<section className="mp-lobby"><div><p className="mp-kicker">ENCRYPTED ASSEMBLY CODE</p><h2>{view.room.code}</h2><button type="button" onClick={() => void navigator.clipboard.writeText(view.room.code)}>코드 복사</button><p>나머지 플레이어에게 이 코드를 전달하십시오.</p></div><div className="mp-roster"><h3>접속 승무원 · {state.players.length}/4</h3>{[0, 1, 2, 3].map((seat) => { const player = state.players.find((entry) => entry.seat === seat); return <article className={player ? "ready" : ""} key={seat}><b>{String(seat + 1).padStart(2, "0")}</b><span>{player?.name ?? "연결 대기"}</span><small>{player ? "LINKED" : "NO SIGNAL"}</small></article>; })}{view.me.isHost ? <button className="mp-primary" type="button" disabled={busy || state.players.length !== 4} onClick={() => void act("start")}>4인 임무 시작</button> : <p className="mp-wait">방장이 임무를 시작할 때까지 기다리십시오.</p>}</div></section>{error ? <div className="mp-toast">{error}</div> : null}</main>;
  if (!view.secret) return <main className="mp-shell">{header}<div className="mp-center"><div className="mp-loader"/><p>기밀 카드 배분 중…</p></div></main>;

  const role = ROLES[view.secret.roleId];
  const handSymbols = addSymbols(...view.secret.hand.map((card) => card.symbols));
  const roleSymbols = subtractSymbols(view.secret.totals, handSymbols);
  const dossier = <aside className={`mp-dossier ${role.alignment}`}>
    <small>{role.english}</small><div className="mp-role-portrait"><img className="mp-role-art" src={roleImage(view.secret.roleId)} alt={`${role.name} 얼굴`}/></div><h2>{role.name}</h2><p>{role.action}</p>
    {view.secret.roleId === "spy" ? <div className="mp-target-brief"><small>OMEGA DESTROY TARGET</small><strong>{String(view.secret.targetLocationId ?? 0).padStart(2, "0")}</strong><b>{locationName(view.secret.targetLocationId)}</b><p>이 정보는 스파이 화면에만 보입니다.</p></div> : null}
    <div className="mp-role-card"><small>역할 카드 광물</small><SymbolStrip symbols={roleSymbols}/></div><b>내 카드 4장 · 광물 총합 {total(view.secret.totals)}개</b><SymbolStrip symbols={view.secret.totals}/>
    {view.me.eliminated ? <div className="mp-out">OUT · 관전 모드</div> : null}
    {view.secret.roleId === "spy" ? <div className="mp-spy-log"><small>PRIVATE OMEGA LOG</small><p>{view.secret.privateLog ?? "아직 행동 기록이 없습니다."}</p><strong>{state.destroyed}/5</strong></div> : null}
    {view.secret.privateResult?.type === "security" ? <div className="mp-private-result"><small>LOCKED CONFIDENTIAL RESULT</small><p>{SYMBOLS[view.secret.privateResult.symbol].name} {view.secret.privateResult.threshold}개 이상</p><b>{view.secret.privateResult.answer ? "O" : "X"}</b></div> : null}
    <div className="mp-hand"><small>내 정상 구역 카드</small>{view.secret.hand.map((card) => <article key={card.id}><img src={locationImage(card.id)} alt="" loading="lazy"/><span>{String(card.id).padStart(2, "0")} · {locationName(card.id)}</span><SymbolStrip symbols={card.symbols}/></article>)}</div>
    <div className="mp-shared-intel"><small>전 승무원 공유 조사 기록</small><InvestigationLog entries={state.investigationLog ?? []}/></div>
  </aside>;
  const frame = (content: ReactNode) => <main className="mp-shell">{header}<section className="mp-game">{dossier}<div className="mp-stage">{content}</div></section>{error ? <div className="mp-toast">{error}</div> : null}</main>;

  if (view.room.status === "action") {
    if (view.me.eliminated) return frame(<div className="mp-center"><h2>게임에서 탈락했습니다.</h2><p>공유 조사 기록과 남은 플레이어의 임무를 관전할 수 있습니다.</p></div>);
    if (myPublic?.submitted) return frame(<div className="mp-center"><div className="mp-loader"/><h2>행동 확정 완료</h2><p>선택은 변경할 수 없습니다. 다른 플레이어를 기다리고 있습니다.</p><div className="mp-submit-track">{state.players.filter((player) => !player.eliminated).map((player) => <span className={player.submitted ? "done" : ""} key={player.seat}>{player.name} · {player.submitted ? "LOCKED" : "WAIT"}</span>)}</div></div>);

    let actionPanel: ReactNode;
    if (view.secret.roleId === "pilot" || view.secret.roleId === "scientist") {
      const special = view.secret.roleId === "pilot" ? "락다운" : "현장 감식";
      const specialType = view.secret.roleId === "pilot" ? "isolate" : "inspect";
      const specialAvailable = view.room.round % 2 === 0;
      const cooldown = view.secret.roleId === "pilot" ? state.lastIsolation : null;
      const validLocation = selectedLocation === cooldown ? (selectedLocation === 1 ? 2 : 1) : selectedLocation;
      actionPanel = <><p className="mp-kicker">CREW ACTION SELECT</p><h2>이번 턴 행동을 선택하세요</h2><div className="mp-basic-card"><b>기본 조사</b><p>플레이어 한 명의 특정 광물 계수를 조사하거나, 전원에게 그 광물 보유 여부를 묻습니다. 결과는 모두에게 공유됩니다.</p><button className="mp-primary" type="button" disabled={busy} onClick={() => void act("action", { action: { type: "basic" } })}>기본 조사 선택</button></div>{specialAvailable ? <div className="mp-special-panel"><h3>짝수 턴 전용 · {special}</h3>{cooldown ? <p className="mp-warning">직전 {String(cooldown).padStart(2, "0")}번 구역은 연속 락다운할 수 없습니다.</p> : null}<LocationPicker value={validLocation} onChange={setSelectedLocation} disabled={cooldown}/><button className="mp-secondary" type="button" disabled={busy} onClick={() => void act("action", { action: { type: specialType, locationId: validLocation } })}>{special} 확정</button></div> : <p className="mp-locked-turn">직업 능력은 자신의 2·4·6…번째 턴에 열립니다. 이번 턴은 기본 조사를 수행하십시오.</p>}</>;
    } else if (view.secret.roleId === "security") {
      actionPanel = <><p className="mp-kicker">THREE-WAY SECURITY DECISION</p><h2>보안 행동 3개 중 선택</h2><div className="mp-security-choices"><button type="button" onClick={() => { setQuestionMode("targeted"); void act("action", { action: { type: "basic" } }); }}><b>01</b><span>특정 광물 계수 조사<small>한 명을 지목해 O/X 확인</small></span></button><button type="button" onClick={() => { setQuestionMode("broadcast"); void act("action", { action: { type: "basic" } }); }}><b>02</b><span>전체 광물 보유 조사<small>모든 플레이어 응답 공개</small></span></button></div><div className="mp-confidential"><h3>03 · 스파이 기밀 조회</h3><p>광물과 “몇 개 이상”을 정한 뒤 확정하십시오. 확정 전에는 결과가 보이지 않으며, 제출 후에는 변경할 수 없습니다.</p><SymbolPicker value={querySymbol} onChange={setQuerySymbol}/><label className="mp-range"><span>기준 개수</span><input type="number" min="1" max="20" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))}/><b>{queryThreshold}개 이상</b></label><button className="mp-primary" type="button" disabled={busy} onClick={() => void act("action", { action: { type: "query", symbol: querySymbol, threshold: queryThreshold } })}>선택 잠금 후 결과 조회</button></div></>;
    } else {
      actionPanel = <><p className="mp-kicker">OMEGA PRIVATE ACTION</p><h2>파괴 타깃 · {String(view.secret.targetLocationId ?? 0).padStart(2, "0")} {locationName(view.secret.targetLocationId)}</h2><div className="mp-spy-choices"><button type="button" className={spyChoice === "attack" ? "selected" : ""} onClick={() => setSpyChoice("attack")}><b>ϟ</b><span>파괴 공격</span></button><button type="button" className={spyChoice === "wait" ? "selected" : ""} onClick={() => setSpyChoice("wait")}><b>◌</b><span>조용히 있기</span></button><button type="button" className={spyChoice === "assassinate" ? "selected" : ""} onClick={() => setSpyChoice("assassinate")}><b>⌖</b><span>역추적</span></button></div>{spyChoice === "assassinate" ? <div className="mp-assassinate"><p>총 광물 수와 상대가 이번 턴 사용한 직업 정보를 모두 맞혀야 합니다. 하나라도 틀리면 스파이 정체가 공개됩니다.</p><label><span>대상 승무원</span><select value={validTargetSeat} onChange={(event) => setTargetSeat(Number(event.target.value))}>{aliveOthers.map((player) => <option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label><label><span>카드 4장 광물 총합</span><input type="number" min="2" max="20" value={totalGuess} onChange={(event) => setTotalGuess(Number(event.target.value))}/></label><label><span>조종사/과학자의 직업 행동 구역</span><select value={locationGuess} onChange={(event) => setLocationGuess(Number(event.target.value))}>{LOCATIONS.map(([id, location]) => <option value={id} key={id}>{String(id).padStart(2, "0")} · {location}</option>)}</select></label><label><span>보안 책임자의 기밀 조회 광물</span><select value={symbolGuess} onChange={(event) => setSymbolGuess(event.target.value as SymbolKey)}>{symbolKeys.map((key) => <option value={key} key={key}>{SYMBOLS[key].icon} {SYMBOLS[key].name}</option>)}</select></label></div> : null}<button className="mp-primary danger" type="button" disabled={busy} onClick={() => void act("action", { action: spyChoice === "assassinate" ? { type: spyChoice, targetSeat: validTargetSeat, totalGuess, locationGuess, symbolGuess } : { type: spyChoice } })}>OMEGA 행동 확정</button></>;
    }
    return frame(<div className="mp-console">{actionPanel}</div>);
  }

  if (view.room.status === "resolving") return frame(<div className="mp-center"><div className="mp-loader"/><h2>4명의 행동 판정 중</h2><p>비밀 타깃과 행동 조건을 서버에서 대조하고 있습니다.</p></div>);
  if (view.room.status === "resolution") return frame(<div className="mp-resolution"><p className="mp-kicker">PUBLIC SYSTEM RESOLUTION</p><h2>CYCLE {String(view.room.round).padStart(2, "0")} 분석 완료</h2>{state.spyExposed ? <div className="mp-alert">역추적 실패 · 스파이의 정체가 공개되었습니다.</div> : null}{state.report?.assassination ? <div className={`mp-shot ${state.report.assassination.success ? "success" : "failed"}`}><b>⌖ COUNTER-TRACE</b><h3>{state.report.assassination.success ? `${state.report.assassination.targetName} 탈락` : `실패 · 스파이는 ${state.report.assassination.spyName}`}</h3></div> : null}<div className="mp-resolution-grid"><article><small>LOCKDOWN</small><h3>{state.report?.isolation ? `${String(state.report.isolation).padStart(2, "0")} · ${locationName(state.report.isolation)}` : "기본 조사 선택"}</h3></article><article><small>FORENSICS</small><h3>{state.report?.inspection ? `${String(state.report.inspection).padStart(2, "0")} · ${locationName(state.report.inspection)}` : "기본 조사 선택"}</h3>{state.report?.inspection ? <><b>{state.report.detected ? "O" : "X"}</b><p>{state.report.detected ? `스파이 광물 총합 ${state.report.spyTotal}개` : "파괴 흔적 없음"}</p></> : null}</article><article><small>SABOTAGE</small><h3>CLASSIFIED</h3><strong>{state.destroyed}/5</strong></article></div>{view.me.isHost ? <button className="mp-primary" type="button" disabled={busy} onClick={() => void act("investigate")}>기본 조사 단계 개시</button> : <p className="mp-wait">방장이 기본 조사 단계를 열 때까지 기다리십시오.</p>}</div>);

  if (view.room.status === "investigation") {
    const myTurn = state.activeInvestigatorSeat === view.me.seat;
    return frame(<div className="mp-investigation"><p className="mp-kicker">SHARED MINERAL INVESTIGATION</p><h2>{activePlayer?.name}의 기본 조사</h2>{myTurn ? <div className="mp-question"><div className="mp-mode"><button type="button" className={questionMode === "targeted" ? "selected" : ""} onClick={() => setQuestionMode("targeted")}>한 명 특정 조사</button><button type="button" className={questionMode === "broadcast" ? "selected" : ""} onClick={() => setQuestionMode("broadcast")}>전체 보유 조사</button></div><SymbolPicker value={querySymbol} onChange={setQuerySymbol}/><label className="mp-range"><span>기준 개수</span><input type="number" min="1" max="20" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))}/><b>{queryThreshold}개 이상</b></label>{questionMode === "targeted" ? <label><span>조사 대상</span><select value={validQuestionTarget} onChange={(event) => setQuestionTarget(Number(event.target.value))}>{aliveOthers.map((player) => <option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label> : <p className="mp-warning">승무원은 진실만 답합니다. 스파이는 전체 조사에서만 O/X를 속일 수 있습니다.</p>}<button className="mp-primary" type="button" disabled={busy} onClick={() => void act(questionMode === "targeted" ? "private_question" : "broadcast_question", { symbol: querySymbol, threshold: queryThreshold, targetSeat: validQuestionTarget })}>조사 확정 · 모두에게 공유</button></div> : <div className="mp-center"><div className="mp-loader"/><p>{activePlayer?.name}의 조사 선택을 기다리고 있습니다.</p></div>}</div>);
  }

  if (view.room.status === "broadcast") return frame(<div className="mp-investigation"><p className="mp-kicker">OPEN CHANNEL QUESTION</p><h2>{SYMBOLS[state.question!.symbol].icon} {SYMBOLS[state.question!.symbol].name}을 {state.question!.threshold}개 이상 가지고 있는가?</h2>{view.secret.roleId === "spy" ? <><p>전체 조사에서는 스파이만 거짓 응답을 선택할 수 있습니다.</p><div className="mp-ox"><button type="button" onClick={() => void act("broadcast_answer", { answer: true })}>O</button><button type="button" onClick={() => void act("broadcast_answer", { answer: false })}>X</button></div></> : <div className="mp-center"><p>승무원의 진실 응답은 서버가 자동 판정했습니다. 스파이의 응답을 기다립니다.</p></div>}</div>);

  if (view.room.status === "arrest") {
    const myTurn = state.activeInvestigatorSeat === view.me.seat;
    return frame(<div className="mp-arrest"><p className="mp-kicker">FINAL ARREST WINDOW</p><h2>{activePlayer?.name}의 체포 판단</h2><InvestigationLog entries={state.investigationLog ?? []}/>{myTurn && view.secret.roleId !== "spy" ? <div className="mp-arrest-form"><label><span>스파이 용의자</span><select value={validSuspectSeat} onChange={(event) => setSuspectSeat(Number(event.target.value))}>{state.players.filter((player) => !player.eliminated && player.seat !== view.me.seat).map((player) => <option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label><label><span>중앙 파괴 타깃</span><select value={accusedLocation} onChange={(event) => setAccusedLocation(Number(event.target.value))}>{LOCATIONS.map(([id, location]) => <option value={id} key={id}>{String(id).padStart(2, "0")} · {location}</option>)}</select></label><button className="mp-primary danger" type="button" disabled={busy} onClick={() => void act("arrest", { suspectSeat: validSuspectSeat, locationId: accusedLocation })}>최종 체포 선언</button></div> : <p className="mp-wait">{myTurn ? "스파이는 체포를 선언할 수 없습니다." : "수사 대표가 판단 중입니다."}</p>}{view.me.isHost ? <button className="mp-secondary" type="button" disabled={busy} onClick={() => void act("next_round")}>체포 보류 · 다음 라운드</button> : null}</div>);
  }

  return <main className="mp-shell">{header}<section className={`mp-gameover ${state.result?.winner}`}><p className="mp-kicker">MISSION TERMINATED</p><h2>{state.result?.winner === "crew" ? "스파이 체포." : "HERMES-IX LOST."}</h2><p>{state.result?.reason}</p><div><article><small>OMEGA OPERATIVE</small><b>SEAT {String((state.result?.spySeat ?? 0) + 1).padStart(2, "0")}</b><h3>{state.players.find((player) => player.seat === state.result?.spySeat)?.name}</h3></article><article><small>CENTRAL TARGET</small><b>{String(state.result?.targetLocationId).padStart(2, "0")}</b><h3>{locationName(state.result?.targetLocationId)}</h3></article><article><small>SABOTAGE</small><b>{state.destroyed}/5</b></article></div><button className="mp-primary" type="button" onClick={leaveLocal}>새 임무 준비</button></section></main>;
}
