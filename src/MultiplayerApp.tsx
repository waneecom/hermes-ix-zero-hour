import { useCallback, useEffect, useState } from "react";
import { ensureAnonymousSession, isSupabaseConfigured, supabase } from "./supabase";
import "./multiplayer.css";

type SymbolKey = "eye" | "key" | "power";
type RoleId = "pilot" | "scientist" | "security" | "spy";
type RoomStatus = "lobby" | "action" | "resolving" | "resolution" | "investigation" | "broadcast" | "arrest" | "gameover";
type Symbols = Record<SymbolKey, number>;
type PublicPlayer = { seat: number; name: string; eliminated: boolean; submitted: boolean };
type Report = { isolation: number | null; inspection: number | null; detected: boolean; spyTotal: number | null; assassination?: { targetSeat: number | null; targetName: string; success: boolean; spySeat?: number; spyName?: string } | null };
type PublicState = {
  players: PublicPlayer[]; destroyed: number; lastIsolation: number | null; spyExposed: boolean; report: Report | null;
  result: { winner: "crew" | "spy"; reason: string; spySeat: number; targetLocationId: number } | null;
  activeInvestigatorSeat: number | null; question: { mode: "private" | "broadcast"; symbol: SymbolKey; threshold: number; completed?: boolean } | null;
  broadcastAnswers: Array<{ seat: number; name: string; answer: boolean }> | null;
};
type RoomView = {
  room: { id: string; code: string; status: RoomStatus; round: number; revision: number; publicState: PublicState };
  me: { seat: number; name: string; eliminated: boolean; isHost: boolean };
  secret: null | { roleId: RoleId; hand: Array<{ id: number; symbols: Symbols }>; totals: Symbols; privateLog: string | null; privateResult: { type: string; symbol: SymbolKey; threshold: number; answer: boolean; round: number } | null };
};

const SYMBOLS: Record<SymbolKey, { icon: string; name: string }> = {
  eye: { icon: "◉", name: "센서 로그" }, key: { icon: "◆", name: "보안 키코드" }, power: { icon: "ϟ", name: "전력 회로" },
};
const symbolKeys = Object.keys(SYMBOLS) as SymbolKey[];
const ZERO_SYMBOLS: Symbols = { eye: 0, key: 0, power: 0 };
const ROLES: Record<RoleId, { name: string; english: string; action: string; alignment: string }> = {
  pilot: { name: "수석 조종사", english: "CHIEF PILOT", action: "구역 격리", alignment: "crew" },
  scientist: { name: "수석 과학자", english: "CHIEF SCIENTIST", action: "현장 감식", alignment: "crew" },
  security: { name: "보안 책임자", english: "SECURITY DIRECTOR", action: "블랙박스 기밀 조회", alignment: "crew" },
  spy: { name: "기계 관리사", english: "MECHANICAL CUSTODIAN", action: "파괴 공작 / 역저격", alignment: "spy" },
};
const LOCATIONS = [
  [1, "제1 메인 리액터실", "MAIN REACTOR"], [2, "양자 연산 코어실", "QUANTUM CORE"], [3, "중력 제어 장치실", "GRAVITY CONTROL"],
  [4, "생명유지 산소실", "LIFE SUPPORT"], [5, "서브 통신 중계탑", "COMMS RELAY"], [6, "함교 항법 콘솔실", "NAV CONSOLE"],
  [7, "바이오 큐브 연구실", "BIO CUBE LAB"], [8, "비상 동력 배전반", "EMERGENCY GRID"], [9, "격벽 보안 통제실", "BULKHEAD SECURITY"],
  [10, "센서 레이더 돔", "SENSOR DOME"], [11, "보조 플라즈마 추진실", "PLASMA DRIVE"], [12, "선외 탈출 포드실", "ESCAPE PODS"],
  [13, "암흑물질 차폐고", "DARK MATTER VAULT"],
] as const;

function locationName(id: number | null | undefined) { return LOCATIONS.find((entry) => entry[0] === id)?.[1] ?? "미실행"; }
function total(symbols?: Symbols) { return symbols ? symbols.eye + symbols.key + symbols.power : 0; }
function addSymbols(...groups: Symbols[]) { return groups.reduce((sum, group) => ({ eye: sum.eye + group.eye, key: sum.key + group.key, power: sum.power + group.power }), { ...ZERO_SYMBOLS }); }
function subtractSymbols(totalSymbols: Symbols, usedSymbols: Symbols) { return { eye: totalSymbols.eye - usedSymbols.eye, key: totalSymbols.key - usedSymbols.key, power: totalSymbols.power - usedSymbols.power }; }

function SymbolStrip({ symbols }: { symbols: Symbols }) {
  return <div className="mp-symbols">{symbolKeys.map((key) => <span key={key}>{SYMBOLS[key].icon} {symbols[key]}</span>)}</div>;
}

function LocationPicker({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: number | null }) {
  return <div className="mp-location-grid">{LOCATIONS.map(([id, name, english]) => <button type="button" disabled={id === disabled} className={value === id ? "selected" : ""} onClick={() => onChange(id)} key={id}><b>{String(id).padStart(2, "0")}</b><span>{name}<small>{id === disabled ? "LOCKDOWN COOLDOWN" : english}</small></span></button>)}</div>;
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
  const [spyChoice, setSpyChoice] = useState<"attack" | "wait" | "assassinate">("attack");
  const [targetSeat, setTargetSeat] = useState(0);
  const [totalGuess, setTotalGuess] = useState(5);
  const [locationGuess, setLocationGuess] = useState(1);
  const [symbolGuess, setSymbolGuess] = useState<SymbolKey>("eye");
  const [questionMode, setQuestionMode] = useState<"private" | "broadcast">("private");
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

  const state = view?.room.publicState;
  const myPublic = state?.players.find((player) => player.seat === view?.me.seat);
  const role = view?.secret ? ROLES[view.secret.roleId] : null;
  const activePlayer = state?.players.find((player) => player.seat === state.activeInvestigatorSeat);
  const aliveOthers = state?.players.filter((player) => !player.eliminated && player.seat !== view?.me.seat) ?? [];
  const firstOtherSeat = aliveOthers[0]?.seat ?? 0;
  const validTargetSeat = aliveOthers.some((player) => player.seat === targetSeat) ? targetSeat : firstOtherSeat;
  const validQuestionTarget = aliveOthers.some((player) => player.seat === questionTarget) ? questionTarget : firstOtherSeat;
  const validSuspectSeat = aliveOthers.some((player) => player.seat === suspectSeat) ? suspectSeat : firstOtherSeat;
  const validSelectedLocation = role?.alignment === "crew" && view?.secret?.roleId === "pilot" && selectedLocation === state?.lastIsolation
    ? (selectedLocation === 1 ? 2 : 1)
    : selectedLocation;

  if (!ready) return <main className="mp-shell"><div className="mp-center"><div className="mp-loader"/><p>HERMES NETWORK 인증 중...</p></div></main>;

  if (!view) return <main className="mp-shell"><header className="mp-top"><button type="button" onClick={onExit}>H<span>IX</span></button><div><small>ONLINE MULTIPLAYER PROTOCOL</small><h1>ZERO HOUR / LINK</h1></div></header><section className="mp-entry"><div><p className="mp-kicker">4 DEVICES · ONE MISSION</p><h2>각자의 화면으로<br /><em>동시에 접속.</em></h2><p>방장이 6자리 코드를 만들고 나머지 세 명이 참가합니다. 역할과 손패는 각자의 기기에만 표시됩니다.</p></div><div className="mp-entry-panel"><label><span>CALLSIGN · 플레이어 이름</span><input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} placeholder="이름 입력" /></label><button className="mp-primary" type="button" disabled={busy || !name.trim()} onClick={create}>새 작전실 생성</button><div className="mp-divider"><span>OR JOIN EXISTING ROOM</span></div><label><span>ACCESS CODE · 6자리</span><input className="mp-code-input" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label><button className="mp-secondary" type="button" disabled={busy || !name.trim() || code.length !== 6} onClick={join}>코드로 참가</button>{error ? <p className="mp-error">{error}{error.includes("Anonymous") ? " · Supabase Dashboard에서 Anonymous Sign-Ins를 켜야 합니다." : ""}</p> : null}</div></section></main>;

  const header = <header className="mp-top"><button type="button" onClick={leaveLocal}>H<span>IX</span></button><div><small>ROOM {view.room.code} · {realtime}</small><h1>ZERO HOUR / CYCLE {String(view.room.round).padStart(2, "0")}</h1></div><nav><span>SEAT {String(view.me.seat + 1).padStart(2, "0")} · {view.me.name}</span><button type="button" onClick={leaveLocal}>나가기</button></nav></header>;

  if (view.room.status === "lobby") return <main className="mp-shell">{header}<section className="mp-lobby"><div><p className="mp-kicker">ENCRYPTED ASSEMBLY CODE</p><h2>{view.room.code}</h2><button type="button" onClick={() => void navigator.clipboard.writeText(view.room.code)}>코드 복사</button><p>나머지 플레이어에게 이 코드를 전달하십시오.</p></div><div className="mp-roster"><h3>접속 승무원 · {state!.players.length}/4</h3>{[0,1,2,3].map((seat) => { const player = state!.players.find((entry) => entry.seat === seat); return <article className={player ? "ready" : ""} key={seat}><b>{String(seat + 1).padStart(2, "0")}</b><span>{player?.name ?? "연결 대기"}</span><small>{player ? "LINKED" : "NO SIGNAL"}</small></article>; })}{view.me.isHost ? <button className="mp-primary" type="button" disabled={busy || state!.players.length !== 4} onClick={() => void act("start")}>4인 임무 시작</button> : <p className="mp-wait">방장이 임무를 시작할 때까지 대기하십시오.</p>}</div></section>{error ? <div className="mp-toast">{error}</div> : null}</main>;

  if (!view.secret || !role) return <main className="mp-shell">{header}<div className="mp-center"><div className="mp-loader"/><p>기밀 카드 배분 중...</p></div></main>;

  const handSymbols = addSymbols(...view.secret.hand.map((card) => card.symbols));
  const roleSymbols = subtractSymbols(view.secret.totals, handSymbols);
  const dossier = <aside className={`mp-dossier ${role.alignment}`}><small>{role.english}</small><h2>{role.name}</h2><p>{role.action}</p><div className="mp-role-card"><small>역할 카드 아이템</small><SymbolStrip symbols={roleSymbols}/></div><b>내 카드 4장 총 심볼 {total(view.secret.totals)}개</b>{view.me.eliminated ? <div className="mp-out">OUT · 관전 모드</div> : null}{view.secret.roleId === "spy" ? <div className="mp-spy-log"><small>PRIVATE OMEGA LOG</small><p>{view.secret.privateLog}</p><strong>{state!.destroyed}/5</strong></div> : null}<div className="mp-hand"><small>내 안전 구역 카드</small>{view.secret.hand.map((card) => <article key={card.id}><span>{String(card.id).padStart(2,"0")} · {locationName(card.id)}</span><SymbolStrip symbols={card.symbols}/></article>)}</div></aside>;

  if (view.room.status === "action") {
    if (view.me.eliminated) return <main className="mp-shell">{header}<section className="mp-game">{dossier}<div className="mp-center"><h2>게임에서 탈락했습니다.</h2><p>남은 플레이어들의 임무를 관전할 수 있습니다.</p></div></section></main>;
    if (myPublic?.submitted) return <main className="mp-shell">{header}<section className="mp-game">{dossier}<div className="mp-center"><div className="mp-loader"/><h2>행동 제출 완료</h2><p>다른 플레이어를 기다리는 중입니다.</p><div className="mp-submit-track">{state!.players.filter((player)=>!player.eliminated).map((player)=><span className={player.submitted?"done":""} key={player.seat}>{player.name} · {player.submitted?"LOCKED":"WAIT"}</span>)}</div></div></section></main>;
    let actionPanel;
    if (view.secret.roleId === "pilot" || view.secret.roleId === "scientist") actionPanel = <><h2>{view.secret.roleId === "pilot" ? "락다운 구역 선택" : "현장 감식 구역 선택"}</h2>{view.secret.roleId === "pilot" && state!.lastIsolation ? <p className="mp-warning">직전 {String(state!.lastIsolation).padStart(2,"0")}번 구역은 연속 락다운할 수 없습니다.</p> : null}<LocationPicker value={validSelectedLocation} onChange={setSelectedLocation} disabled={view.secret.roleId === "pilot" ? state!.lastIsolation : null}/><button className="mp-primary" type="button" disabled={busy} onClick={() => void act("action", { action: { type: view.secret!.roleId === "pilot" ? "isolate" : "inspect", locationId: validSelectedLocation } })}>직무 행동 제출</button></>;
    if (view.secret.roleId === "security") actionPanel = <><h2>블랙박스 기밀 조회</h2><div className="mp-symbol-picker">{symbolKeys.map((key)=><button className={querySymbol===key?"selected":""} type="button" onClick={()=>setQuerySymbol(key)} key={key}>{SYMBOLS[key].icon}<span>{SYMBOLS[key].name}</span></button>)}</div><label className="mp-range"><span>기준 개수</span><input type="range" min="1" max="12" value={queryThreshold} onChange={(event)=>setQueryThreshold(Number(event.target.value))}/><b>{queryThreshold}개 이상</b></label><button className="mp-primary" type="button" disabled={busy} onClick={()=>void act("action",{action:{type:"query",symbol:querySymbol,threshold:queryThreshold}})}>기밀 조회 제출</button></>;
    if (view.secret.roleId === "spy") actionPanel = <><h2>OMEGA 행동 선택</h2><div className="mp-spy-choices"><button type="button" className={spyChoice==="attack"?"selected":""} onClick={()=>setSpyChoice("attack")}><b>ϟ</b><span>파괴 공작</span></button><button type="button" className={spyChoice==="wait"?"selected":""} onClick={()=>setSpyChoice("wait")}><b>○</b><span>위장 유지</span></button><button type="button" className={spyChoice==="assassinate"?"selected":""} onClick={()=>setSpyChoice("assassinate")}><b>⌖</b><span>역저격</span></button></div>{spyChoice==="assassinate"?<div className="mp-assassinate"><p>대상 역할은 공개되지 않습니다. 해당 역할에 적용되는 두 번째 조건만 서버가 판정합니다.</p><label><span>저격 대상</span><select value={validTargetSeat} onChange={(event)=>setTargetSeat(Number(event.target.value))}>{aliveOthers.map((player)=><option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label><label><span>손패 총 심볼</span><input type="number" min="3" max="12" value={totalGuess} onChange={(event)=>setTotalGuess(Number(event.target.value))}/></label><label><span>조종사·과학자라면 행동 구역</span><select value={locationGuess} onChange={(event)=>setLocationGuess(Number(event.target.value))}>{LOCATIONS.map(([id,name])=><option value={id} key={id}>{String(id).padStart(2,"0")} · {name}</option>)}</select></label><label><span>보안 책임자라면 조회 아이템</span><select value={symbolGuess} onChange={(event)=>setSymbolGuess(event.target.value as SymbolKey)}>{symbolKeys.map((key)=><option value={key} key={key}>{SYMBOLS[key].icon} {SYMBOLS[key].name}</option>)}</select></label></div>:null}<button className="mp-primary danger" type="button" disabled={busy} onClick={()=>void act("action",{action:spyChoice==="assassinate"?{type:spyChoice,targetSeat:validTargetSeat,totalGuess,locationGuess,symbolGuess}:{type:spyChoice}})}>OMEGA 행동 제출</button></>;
    return <main className="mp-shell">{header}<section className="mp-game">{dossier}<div className="mp-console"><p className="mp-kicker">PRIVATE DUTY ACTION</p>{actionPanel}</div></section>{error?<div className="mp-toast">{error}</div>:null}</main>;
  }

  if (view.room.status === "resolving") return <main className="mp-shell">{header}<section className="mp-game">{dossier}<div className="mp-center"><div className="mp-loader"/><h2>4인의 행동 판정 중</h2><p>비밀 타깃과 행동 조건을 서버에서 대조하고 있습니다.</p></div></section></main>;

  if (view.room.status === "resolution") return <main className="mp-shell">{header}<section className="mp-resolution"><p className="mp-kicker">PUBLIC SYSTEM RESOLUTION</p><h2>CYCLE {String(view.room.round).padStart(2,"0")} 분석 완료</h2>{state!.spyExposed?<div className="mp-alert">역저격 실패 · 스파이 정체가 공개되었습니다.</div>:null}{state!.report?.assassination?<div className={`mp-shot ${state!.report.assassination.success?"success":"failed"}`}><b>⌖ COUNTER-SNIPE</b><h3>{state!.report.assassination.success?`${state!.report.assassination.targetName} 탈락`:`실패 · 스파이는 ${state!.report.assassination.spyName}`}</h3></div>:null}<div className="mp-resolution-grid"><article><small>LOCKDOWN</small><h3>{state!.report?.isolation?`${String(state!.report.isolation).padStart(2,"0")} · ${locationName(state!.report.isolation)}`:"미실행"}</h3></article><article><small>FORENSICS</small><h3>{state!.report?.inspection?`${String(state!.report.inspection).padStart(2,"0")} · ${locationName(state!.report.inspection)}`:"미실행"}</h3><b>{state!.report?.detected?"O":"X"}</b><p>{state!.report?.detected?`스파이 총 심볼 ${state!.report.spyTotal}개`:"파괴 흔적 없음"}</p></article><article><small>SABOTAGE</small><h3>CLASSIFIED</h3><strong>{state!.destroyed}/5</strong></article></div>{view.secret.privateResult?.type==="security"?<div className="mp-private-result">기밀 조회 결과 · <b>{view.secret.privateResult.answer?"O":"X"}</b></div>:null}{view.me.isHost?<button className="mp-primary" type="button" disabled={busy} onClick={()=>void act("investigate")}>수사 단계 개시</button>:<p className="mp-wait">방장이 수사 단계를 열 때까지 대기하십시오.</p>}</section>{error?<div className="mp-toast">{error}</div>:null}</main>;

  if (view.room.status === "investigation") {
    const myTurn = state!.activeInvestigatorSeat === view.me.seat;
    return <main className="mp-shell">{header}<section className="mp-investigation"><p className="mp-kicker">INVESTIGATION LEAD</p><h2>{activePlayer?.name}의 수사 차례</h2>{myTurn?<div className="mp-question"><div className="mp-symbol-picker">{symbolKeys.map((key)=><button className={querySymbol===key?"selected":""} type="button" onClick={()=>setQuerySymbol(key)} key={key}>{SYMBOLS[key].icon}<span>{SYMBOLS[key].name}</span></button>)}</div><label className="mp-range"><span>기준 개수</span><input type="range" min="1" max="12" value={queryThreshold} onChange={(event)=>setQueryThreshold(Number(event.target.value))}/><b>{queryThreshold}개 이상</b></label><div className="mp-mode"><button type="button" className={questionMode==="private"?"selected":""} onClick={()=>setQuestionMode("private")}>1:1 정밀 심문</button><button type="button" className={questionMode==="broadcast"?"selected":""} onClick={()=>setQuestionMode("broadcast")}>전체 방송</button></div>{questionMode==="private"?<select value={validQuestionTarget} onChange={(event)=>setQuestionTarget(Number(event.target.value))}>{aliveOthers.map((player)=><option value={player.seat} key={player.seat}>{player.name}</option>)}</select>:null}<button className="mp-primary" type="button" disabled={busy} onClick={()=>void act(questionMode==="private"?"private_question":"broadcast_question",{symbol:querySymbol,threshold:queryThreshold,targetSeat:validQuestionTarget})}>질문 전송</button></div>:<div className="mp-center"><div className="mp-loader"/><p>수사 담당자의 질문을 기다리고 있습니다.</p></div>}</section>{error?<div className="mp-toast">{error}</div>:null}</main>;
  }

  if (view.room.status === "broadcast") return <main className="mp-shell">{header}<section className="mp-investigation"><p className="mp-kicker">OPEN CHANNEL QUESTION</p><h2>{SYMBOLS[state!.question!.symbol].name}을 {state!.question!.threshold}개 이상 보유했는가?</h2>{view.secret.roleId==="spy"?<div className="mp-ox"><button type="button" onClick={()=>void act("broadcast_answer",{answer:true})}>O</button><button type="button" onClick={()=>void act("broadcast_answer",{answer:false})}>X</button></div>:<div className="mp-center"><p>진실 응답이 서버에 잠겼습니다. 스파이의 방송 응답을 기다립니다.</p></div>}</section>{error?<div className="mp-toast">{error}</div>:null}</main>;

  if (view.room.status === "arrest") {
    const myTurn = state!.activeInvestigatorSeat === view.me.seat;
    return <main className="mp-shell">{header}<section className="mp-arrest"><p className="mp-kicker">FINAL ARREST WINDOW</p><h2>{activePlayer?.name}의 체포 판단</h2>{state!.broadcastAnswers?<div className="mp-answers">{state!.broadcastAnswers.map((entry)=><article key={entry.seat}><span>{entry.name}</span><b>{entry.answer?"O":"X"}</b></article>)}</div>:null}{myTurn&&view.secret.privateResult?.type==="private_question"?<div className="mp-private-result">1:1 진실 응답 · <b>{view.secret.privateResult.answer?"O":"X"}</b></div>:null}{myTurn&&view.secret.roleId!=="spy"?<div className="mp-arrest-form"><label><span>스파이 용의자</span><select value={validSuspectSeat} onChange={(event)=>setSuspectSeat(Number(event.target.value))}>{state!.players.filter((player)=>!player.eliminated&&player.seat!==view.me.seat).map((player)=><option value={player.seat} key={player.seat}>{player.name}</option>)}</select></label><label><span>중앙 타깃</span><select value={accusedLocation} onChange={(event)=>setAccusedLocation(Number(event.target.value))}>{LOCATIONS.map(([id,name])=><option value={id} key={id}>{String(id).padStart(2,"0")} · {name}</option>)}</select></label><button className="mp-primary danger" type="button" disabled={busy} onClick={()=>void act("arrest",{suspectSeat:validSuspectSeat,locationId:accusedLocation})}>최종 체포 선언</button></div>:<p className="mp-wait">{myTurn?"위장 수사 차례입니다. 체포 없이 다음 라운드로 넘어가십시오.":"수사 담당자가 판단 중입니다."}</p>}{view.me.isHost?<button className="mp-secondary" type="button" disabled={busy} onClick={()=>void act("next_round")}>체포 보류 · 다음 라운드</button>:null}</section>{error?<div className="mp-toast">{error}</div>:null}</main>;
  }

  return <main className="mp-shell">{header}<section className={`mp-gameover ${state!.result?.winner}`}><p className="mp-kicker">MISSION TERMINATED</p><h2>{state!.result?.winner==="crew"?"스파이 체포.":"HERMES-IX LOST."}</h2><p>{state!.result?.reason}</p><div><article><small>OMEGA OPERATIVE</small><b>SEAT {String((state!.result?.spySeat??0)+1).padStart(2,"0")}</b><h3>{state!.players.find((player)=>player.seat===state!.result?.spySeat)?.name}</h3></article><article><small>CENTRAL TARGET</small><b>{String(state!.result?.targetLocationId).padStart(2,"0")}</b><h3>{locationName(state!.result?.targetLocationId)}</h3></article><article><small>SABOTAGE</small><b>{state!.destroyed}/5</b></article></div><button className="mp-primary" type="button" onClick={leaveLocal}>새 온라인 임무</button></section></main>;
}
