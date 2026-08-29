"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureAnonymousSession, isSupabaseConfigured, supabase } from "../src/supabase";

type SymbolKey = "eye" | "key" | "power";
type Symbols = Record<SymbolKey, number>;
type Alignment = "crew" | "spy";
type Screen = "landing" | "setup" | "briefing" | "action" | "resolution" | "investigation" | "privateResult" | "broadcastAnswer" | "broadcastResult" | "arrest" | "gameover";

type Role = { id: "pilot" | "scientist" | "security" | "spy"; name: string; english: string; alignment: Alignment; symbols: Symbols; action: string; description: string; };
type Location = { id: number; code: string; name: string; english: string; description: string; symbols: Symbols; };
type Player = { name: string; role: Role; hand: Location[]; totals: Symbols; eliminated: boolean; };
type Assassination = { targetIndex: number; totalGuess: number; locationGuess?: number; symbolGuess?: SymbolKey; };
type RoundActions = { isolation?: number; inspection?: number; securityQuery?: { symbol: SymbolKey; threshold: number; answer: boolean }; spyIntent?: "attack" | "wait" | "assassinate"; assassination?: Assassination; };
type RoundReport = { isolation: number | null; inspection: number | null; detected: boolean; spyTotal: number | null; assassination?: { targetName: string; success: boolean; spyName?: string; }; };
type GameResult = { winner: Alignment; reason: string };
type SaveRow = { id: string; name: string; status: string; current_round: number; state: GameSnapshot; updated_at: string };
type GameSnapshot = {
  version: 2; screen: Screen; names: string[]; players: Player[]; target: Location | null; privateIndex: number;
  round: number; destroyed: number; actions: RoundActions; report: RoundReport | null; spyFeedback: string;
  lastIsolation: number | null; spyExposed: boolean; result: GameResult | null;
};

const SYMBOLS: Record<SymbolKey, { icon: string; name: string; color: string }> = {
  eye: { icon: "◉", name: "센서 로그", color: "cyan" }, key: { icon: "◆", name: "보안 키코드", color: "lime" }, power: { icon: "ϟ", name: "전력 회로", color: "orange" },
};

const ROLES: Role[] = [
  { id: "pilot", name: "수석 조종사", english: "CHIEF PILOT", alignment: "crew", symbols: { eye: 1, key: 0, power: 1 }, action: "구역 격리", description: "매 라운드 한 구역을 봉쇄해 그곳을 향한 파괴 공작을 무효화합니다." },
  { id: "scientist", name: "수석 과학자", english: "CHIEF SCIENTIST", alignment: "crew", symbols: { eye: 1, key: 1, power: 0 }, action: "현장 감식", description: "한 구역을 감식합니다. 공격 흔적을 잡으면 스파이 손패의 총 심볼 수가 공개됩니다." },
  { id: "security", name: "보안 책임자", english: "SECURITY DIRECTOR", alignment: "crew", symbols: { eye: 0, key: 1, power: 1 }, action: "기밀 조회", description: "스파이가 특정 심볼을 N개 이상 보유했는지 혼자만 확인합니다." },
  { id: "spy", name: "기계 관리사", english: "MECHANICAL CUSTODIAN", alignment: "spy", symbols: { eye: 1, key: 1, power: 1 }, action: "비밀 파괴 공작", description: "중앙 타깃에 다섯 번의 파괴 공작을 성공시키면 함선을 폭파합니다." },
];

const LOCATIONS: Location[] = [
  { id: 1, code: "R-01", name: "제1 메인 리액터실", english: "MAIN REACTOR", description: "함선 주 동력 에너지 발생 구역", symbols: { eye: 0, key: 0, power: 3 } },
  { id: 2, code: "Q-02", name: "양자 연산 코어실", english: "QUANTUM CORE", description: "메인 AI 및 중앙 연산 중추", symbols: { eye: 2, key: 1, power: 0 } },
  { id: 3, code: "G-03", name: "중력 제어 장치실", english: "GRAVITY CONTROL", description: "선내 인공중력 유지 및 분배실", symbols: { eye: 0, key: 1, power: 2 } },
  { id: 4, code: "L-04", name: "생명유지 산소실", english: "LIFE SUPPORT", description: "산소 발생 및 기압 유지 장비실", symbols: { eye: 1, key: 0, power: 1 } },
  { id: 5, code: "C-05", name: "서브 통신 중계탑", english: "COMMS RELAY", description: "심우주 외부 장거리 안테나실", symbols: { eye: 1, key: 1, power: 0 } },
  { id: 6, code: "N-06", name: "함교 항법 콘솔실", english: "NAV CONSOLE", description: "도약 궤도 연산 및 항로 제어실", symbols: { eye: 0, key: 2, power: 0 } },
  { id: 7, code: "B-07", name: "바이오 큐브 연구실", english: "BIO CUBE LAB", description: "미지의 외계 표본 격리 보관실", symbols: { eye: 2, key: 0, power: 0 } },
  { id: 8, code: "E-08", name: "비상 동력 배전반", english: "EMERGENCY GRID", description: "비상용 예비 전력 분배 라인", symbols: { eye: 0, key: 0, power: 2 } },
  { id: 9, code: "S-09", name: "격벽 보안 통제실", english: "BULKHEAD SECURITY", description: "내부 차단벽 및 해치 개폐실", symbols: { eye: 0, key: 1, power: 0 } },
  { id: 10, code: "D-10", name: "센서 레이더 돔", english: "SENSOR DOME", description: "우주 장애물 감지용 레이더실", symbols: { eye: 1, key: 0, power: 0 } },
  { id: 11, code: "P-11", name: "보조 플라즈마 추진실", english: "PLASMA DRIVE", description: "기동 및 자세 제어용 분사 장치실", symbols: { eye: 0, key: 0, power: 1 } },
  { id: 12, code: "X-12", name: "선외 탈출 포드실", english: "ESCAPE PODS", description: "비상 탈출용 셔틀 격납 구역", symbols: { eye: 0, key: 1, power: 0 } },
  { id: 13, code: "M-13", name: "암흑물질 차폐고", english: "DARK MATTER VAULT", description: "고밀도 특수 광물 격리 보관소", symbols: { eye: 1, key: 0, power: 0 } },
];

const ZERO: Symbols = { eye: 0, key: 0, power: 0 };
const ITEM_TOTALS: Symbols = { eye: 10, key: 10, power: 12 };
const symbolKeys = Object.keys(SYMBOLS) as SymbolKey[];
function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function addSymbols(...groups: Symbols[]) { return groups.reduce((sum, group) => ({ eye: sum.eye + group.eye, key: sum.key + group.key, power: sum.power + group.power }), { ...ZERO }); }
function symbolTotal(group: Symbols) { return group.eye + group.key + group.power; }
function getLocation(id?: number) { return LOCATIONS.find((location) => location.id === id)!; }
const ART_ROOT = "/assets/hermes";
function roleImage(roleId: Role["id"]) { return `${ART_ROOT}/role-${roleId}.jpg`; }
function locationImage(locationId: number) { return `${ART_ROOT}/location-${String(locationId).padStart(2, "0")}.jpg`; }

function createRandomizedDeck() {
  const cardSizes = shuffle([
    ...Array.from({ length: 3 }, () => 3),
    ...Array.from({ length: 9 }, () => 2),
    ...Array.from({ length: 5 }, () => 1),
  ]);
  const itemPool = shuffle(symbolKeys.flatMap((symbol) => Array.from({ length: ITEM_TOTALS[symbol] }, () => symbol)));
  let cursor = 0;
  let cardIndex = 0;
  const nextSymbols = (): Symbols => {
    const size = cardSizes[cardIndex];
    cardIndex += 1;
    const symbols = itemPool.slice(cursor, cursor + size).reduce((totals, symbol) => ({ ...totals, [symbol]: totals[symbol] + 1 }), { ...ZERO });
    cursor += size;
    return symbols;
  };
  return {
    roles: ROLES.map((role) => ({ ...role, symbols: nextSymbols() })),
    locations: LOCATIONS.map((location) => ({ ...location, symbols: nextSymbols() })),
  };
}

function SymbolRow({ symbols, compact = false }: { symbols: Symbols; compact?: boolean }) {
  return <div className={`symbol-row ${compact ? "compact" : ""}`}>{symbolKeys.flatMap((key) => Array.from({ length: symbols[key] }, (_, index) => <span className={`symbol ${SYMBOLS[key].color}`} title={SYMBOLS[key].name} key={`${key}-${index}`}>{SYMBOLS[key].icon}</span>))}</div>;
}

function PrivacyGate({ name, label, onReveal }: { name: string; label: string; onReveal: () => void }) {
  return <section className="privacy-gate"><div className="scan-orbit"><div className="iris">H<span>IX</span></div></div><p className="kicker">EYES ONLY · 개인 열람</p><h2>{name} 님에게<br />기기를 전달하세요.</h2><p>{label}<br />다른 플레이어는 화면을 보지 마십시오.</p><button className="primary-cta" type="button" onClick={onReveal}>본인 확인 · 열람 <span>↗</span></button></section>;
}

function LocationGrid({ selected, onSelect, disabledIds = [] }: { selected?: number; onSelect: (id: number) => void; disabledIds?: number[] }) {
  return <div className="location-grid">{LOCATIONS.map((location) => { const disabled = disabledIds.includes(location.id); return <button type="button" disabled={disabled} className={`location-tile ${selected === location.id ? "selected" : ""} ${disabled ? "cooldown" : ""}`} aria-pressed={selected === location.id} onClick={() => onSelect(location.id)} key={location.id}><img src={locationImage(location.id)} alt="" loading="lazy" /><span className="location-number">{String(location.id).padStart(2, "0")}</span><span><b>{location.name}</b><small>{disabled ? "LOCKDOWN COOLDOWN" : location.english}</small></span></button>; })}</div>;
}

function Topbar({ round, active, onManual, onReset }: { round?: number; active: boolean; onManual: () => void; onReset: () => void }) {
  return <header className="topbar"><button className="brand-mark" type="button" onClick={onReset} aria-label="처음으로">H<span>IX</span></button><div className="brand-copy"><p className="eyebrow">DEEP SPACE VESSEL · HERMES-IX</p><h1>ZERO HOUR</h1></div>{round ? <div className="round-readout"><small>CURRENT CYCLE</small><b>{String(round).padStart(2, "0")}</b></div> : null}<nav><button type="button" className="text-button" onClick={onManual}>전술 매뉴얼</button>{active ? <button type="button" className="text-button danger-text" onClick={onReset}>임무 중단</button> : null}</nav></header>;
}

function Manual({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"protocol" | "archive">("protocol");
  return <div className="manual-backdrop" role="dialog" aria-modal="true" aria-label="전술 매뉴얼"><section className="manual-panel"><header><div><p className="eyebrow">HERMES-IX / TACTICAL DATABASE</p><h2>전술 매뉴얼</h2></div><button type="button" onClick={onClose} aria-label="닫기">×</button></header><div className="manual-tabs"><button type="button" className={tab === "protocol" ? "active" : ""} onClick={() => setTab("protocol")}>게임 프로토콜</button><button type="button" className={tab === "archive" ? "active" : ""} onClick={() => setTab("archive")}>17장 카드 아카이브</button></div>{tab === "protocol" ? <div className="manual-content protocol-list">
    <article><b>01</b><div><h3>비밀 배분</h3><p>위치 카드 13장 중 한 장은 중앙 타깃으로 봉인됩니다. 네 플레이어는 역할 1장과 안전이 확인된 위치 3장을 받습니다.</p></div></article>
    <article><b>02</b><div><h3>락다운 · 연속 격리 금지</h3><p>조종사의 락다운은 다음 조종사 턴 전까지 공격을 완전히 차단합니다. 직전 라운드와 같은 구역은 연속 지정할 수 없으며, 한 라운드를 건너뛴 뒤 다시 잠글 수 있습니다.</p></div></article>
    <article><b>03</b><div><h3>제한된 진실 프로토콜</h3><p>1:1 심문은 “특정 심볼을 N개 이상 보유했는가?” 형식만 허용되며 누구나 진실로 답합니다. 전체 방송에서만 스파이가 거짓말할 수 있습니다.</p></div></article>
    <article><b>04</b><div><h3>스파이 역저격</h3><p>스파이는 일반 행동 대신 승무원을 저격할 수 있습니다. 조종사·과학자는 손패 총 심볼 수와 이번 행동 구역을, 보안 책임자는 총 심볼 수와 직전 기밀 조회 심볼을 모두 맞혀야 합니다. 실패하면 스파이 정체가 공개됩니다.</p></div></article>
    <article><b>05</b><div><h3>최종 체포</h3><p>생존 승무원은 스파이 플레이어와 중앙 타깃을 함께 지목합니다. 둘 다 맞으면 승무원 승리, 하나라도 틀리면 스파이가 즉시 승리합니다.</p></div></article>
    <article className="warning-article"><b>06</b><div><h3>제로 아워</h3><p>격리되지 않은 중앙 타깃에 파괴 공작이 5회 누적되거나 승무원 전원이 탈락하면 스파이가 승리합니다.</p></div></article>
    <aside><strong>랜덤 카드 프로토콜</strong><p>새 임무마다 역할 배정·카드 순서·중앙 타깃과 카드별 아이템이 다시 생성됩니다. 전체 합계는 항상 ◉ 10개 · ◆ 10개 · ϟ 12개이며, 시작된 임무의 단서는 종료까지 고정됩니다.</p></aside>
  </div> : <div className="manual-content archive-grid"><div className="archive-section"><p className="section-label">ROLE CLEARANCE · 04</p>{ROLES.map((role) => <article className={`archive-card ${role.alignment}`} key={role.id}><img src={roleImage(role.id)} alt={`${role.name} 인물 일러스트`} loading="lazy" /><span>{role.english}</span><h3>{role.name}</h3><p>{role.action} · {role.description}</p><small>아이템 구성 · 임무 시작 시 무작위 생성</small></article>)}</div><div className="archive-section"><p className="section-label">SHIP SECTORS · 13</p>{LOCATIONS.map((location) => <article className="archive-card" key={location.id}><img src={locationImage(location.id)} alt={`${location.name} 구역 일러스트`} loading="lazy" /><span>{location.code} · {location.english}</span><h3>{location.name}</h3><p>{location.description}</p><small>아이템 구성 · 임무 시작 시 무작위 생성</small></article>)}</div></div>}</section></div>;
}

export default function Home({ onOnline }: { onOnline?: () => void }) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [manualOpen, setManualOpen] = useState(false);
  const [names, setNames] = useState(["플레이어 1", "플레이어 2", "플레이어 3", "플레이어 4"]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [target, setTarget] = useState<Location | null>(null);
  const [covered, setCovered] = useState(true);
  const [privateIndex, setPrivateIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [destroyed, setDestroyed] = useState(0);
  const [actions, setActions] = useState<RoundActions>({});
  const [report, setReport] = useState<RoundReport | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<number>();
  const [querySymbol, setQuerySymbol] = useState<SymbolKey>("eye");
  const [queryThreshold, setQueryThreshold] = useState(3);
  const [spyIntent, setSpyIntent] = useState<"attack" | "wait" | "assassinate">();
  const [assassinationTarget, setAssassinationTarget] = useState(0);
  const [assassinationTotal, setAssassinationTotal] = useState(4);
  const [assassinationLocation, setAssassinationLocation] = useState(1);
  const [assassinationSymbol, setAssassinationSymbol] = useState<SymbolKey>("eye");
  const [spyFeedback, setSpyFeedback] = useState("아직 실행된 공작이 없습니다.");
  const [questionTarget, setQuestionTarget] = useState(1);
  const [privateAnswer, setPrivateAnswer] = useState<boolean | null>(null);
  const [broadcastIndex, setBroadcastIndex] = useState(0);
  const [broadcastAnswers, setBroadcastAnswers] = useState<boolean[]>([]);
  const [spyBroadcastChoice, setSpyBroadcastChoice] = useState<boolean>();
  const [suspect, setSuspect] = useState(0);
  const [accusedLocation, setAccusedLocation] = useState(1);
  const [result, setResult] = useState<GameResult | null>(null);
  const [lastIsolation, setLastIsolation] = useState<number | null>(null);
  const [spyExposed, setSpyExposed] = useState(false);
  const [saveId, setSaveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState(isSupabaseConfigured ? "클라우드 연결 중" : "로컬 모드");
  const [savedGames, setSavedGames] = useState<SaveRow[]>([]);
  const [cloudReady, setCloudReady] = useState(false);
  const hydrated = useRef(false);

  const aliveIndices = useMemo(() => players.map((player, index) => !player.eliminated ? index : -1).filter((index) => index >= 0), [players]);
  const investigatorOrder = aliveIndices.length ? aliveIndices : [0];
  const activeInvestigator = players.length ? investigatorOrder[(round - 1) % investigatorOrder.length] : 0;
  const currentPlayer = players[privateIndex];
  const spyPlayer = players.find((player) => player.role.alignment === "spy");
  const broadcastRespondents = aliveIndices;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { hydrated.current = true; return; }
    let cancelled = false;
    void (async () => {
      try {
        await ensureAnonymousSession();
        const { data, error } = await supabase.from("hermes_ix_games").select("id,name,status,current_round,state,updated_at").order("updated_at", { ascending: false }).limit(8);
        if (error) throw error;
        if (!cancelled) { setSavedGames((data ?? []) as SaveRow[]); setCloudReady(true); setSaveStatus("클라우드 연결됨"); hydrated.current = true; }
      } catch (error) {
        if (!cancelled) { setSaveStatus(error instanceof Error ? `연결 실패 · ${error.message}` : "클라우드 연결 실패"); hydrated.current = true; }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!hydrated.current || !cloudReady || !client || !players.length || screen === "briefing") return;
    const timer = window.setTimeout(() => { void (async () => {
      try {
        const user = await ensureAnonymousSession();
        const snapshot: GameSnapshot = { version: 2, screen, names, players, target, privateIndex, round, destroyed, actions, report, spyFeedback, lastIsolation, spyExposed, result };
        const status = result ? (result.winner === "crew" ? "crew_won" : "spy_won") : "active";
        if (saveId) {
          const { error } = await client.from("hermes_ix_games").update({ current_round: round, status, state: snapshot, updated_at: new Date().toISOString() }).eq("id", saveId);
          if (error) throw error;
        } else {
          const { data, error } = await client.from("hermes_ix_games").insert({ owner_id: user.id, name: `${names[0]} 외 3명 · HERMES-IX`, current_round: round, status, state: snapshot }).select("id").single();
          if (error) throw error;
          setSaveId(data.id);
        }
        setSaveStatus("자동 저장 완료");
      } catch (error) { setSaveStatus(error instanceof Error ? `저장 실패 · ${error.message}` : "자동 저장 실패"); }
    })(); }, 800);
    return () => window.clearTimeout(timer);
  }, [screen, names, players, target, privateIndex, round, destroyed, actions, report, spyFeedback, lastIsolation, spyExposed, result, cloudReady, saveId]);

  function loadGame(row: SaveRow) {
    const saved = row.state;
    setNames(saved.names); setPlayers(saved.players.map((player) => ({ ...player, eliminated: Boolean(player.eliminated) }))); setTarget(saved.target);
    setPrivateIndex(saved.privateIndex); setRound(saved.round); setDestroyed(saved.destroyed); setActions(saved.actions); setReport(saved.report);
    setSpyFeedback(saved.spyFeedback); setLastIsolation(saved.lastIsolation); setSpyExposed(saved.spyExposed); setResult(saved.result); setSaveId(row.id);
    setCovered(true); setScreen(saved.screen === "briefing" ? "action" : saved.screen); setSaveStatus("저장 임무 불러옴");
  }

  function nextAliveIndex(after: number) { return aliveIndices.find((index) => index > after); }

  function resetGame(force = false) {
    if (!force && screen !== "landing" && screen !== "setup" && !window.confirm("진행 중인 임무를 중단하고 초기 화면으로 돌아갈까요?")) return;
    setScreen("landing"); setPlayers([]); setTarget(null); setRound(1); setDestroyed(0); setActions({}); setReport(null); setResult(null); setCovered(true); setLastIsolation(null); setSpyExposed(false); setSaveId(null);
  }

  function startGame() {
    const randomizedDeck = createRandomizedDeck(); const locationDeck = shuffle(randomizedDeck.locations); const centralTarget = locationDeck[0]; const roleDeck = shuffle(randomizedDeck.roles);
    const dealtPlayers = names.map((rawName, index) => { const hand = locationDeck.slice(1 + index * 3, 4 + index * 3); const role = roleDeck[index]; return { name: rawName.trim() || `플레이어 ${index + 1}`, role, hand, totals: addSymbols(role.symbols, ...hand.map((card) => card.symbols)), eliminated: false }; });
    setPlayers(dealtPlayers); setTarget(centralTarget); setPrivateIndex(0); setRound(1); setDestroyed(0); setSpyFeedback("아직 실행된 공작이 없습니다."); setCovered(true); setLastIsolation(null); setSpyExposed(false); setSaveId(null); setScreen("briefing");
  }

  function finishBriefing() { if (privateIndex < 3) { setPrivateIndex(privateIndex + 1); setCovered(true); } else { setPrivateIndex(0); setCovered(true); setScreen("action"); } }
  function resetPrivateInputs() { setSelectedLocation(undefined); setQuerySymbol("eye"); setQueryThreshold(3); setSpyIntent(undefined); setSpyBroadcastChoice(undefined); setAssassinationTotal(4); setAssassinationLocation(1); setAssassinationSymbol("eye"); }

  function resolveRound(nextActions: RoundActions) {
    const attacked = nextActions.spyIntent === "attack"; const blocked = attacked && nextActions.isolation === target!.id; const succeeded = attacked && !blocked; const nextDestroyed = destroyed + (succeeded ? 1 : 0); const detected = attacked && nextActions.inspection === target!.id; const spyTotal = detected ? symbolTotal(spyPlayer!.totals) : null;
    let nextPlayers = players; let assassinationReport: RoundReport["assassination"];
    if (nextActions.spyIntent === "assassinate" && nextActions.assassination) {
      const shot = nextActions.assassination; const victim = players[shot.targetIndex];
      const totalCorrect = Boolean(victim) && symbolTotal(victim.totals) === shot.totalGuess;
      const secondCorrect = victim?.role.id === "pilot" ? nextActions.isolation === shot.locationGuess : victim?.role.id === "scientist" ? nextActions.inspection === shot.locationGuess : victim?.role.id === "security" ? Boolean(nextActions.securityQuery) && nextActions.securityQuery!.symbol === shot.symbolGuess : false;
      const success = Boolean(victim && !victim.eliminated && victim.role.alignment === "crew" && totalCorrect && secondCorrect);
      assassinationReport = { targetName: victim?.name ?? "알 수 없음", success, spyName: success ? undefined : spyPlayer!.name };
      if (success) nextPlayers = players.map((player, index) => index === shot.targetIndex ? { ...player, eliminated: true } : player);
      else setSpyExposed(true);
      setPlayers(nextPlayers);
      setSpyFeedback(success ? `CYCLE ${String(round).padStart(2, "0")} · 역저격 성공, ${victim.name} 탈락` : `CYCLE ${String(round).padStart(2, "0")} · 역저격 실패, 정체 강제 공개`);
    } else {
      setSpyFeedback(!attacked ? `CYCLE ${String(round).padStart(2, "0")} · 위장 유지, 공격하지 않음` : blocked ? `CYCLE ${String(round).padStart(2, "0")} · 락다운 감지, 공작 완전 차단` : `CYCLE ${String(round).padStart(2, "0")} · 공작 성공, 현재 ${nextDestroyed}/5 스택`);
    }
    setDestroyed(nextDestroyed); setLastIsolation(nextActions.isolation ?? null); setReport({ isolation: nextActions.isolation ?? null, inspection: nextActions.inspection ?? null, detected, spyTotal, assassination: assassinationReport });
    const livingCrew = nextPlayers.filter((player) => player.role.alignment === "crew" && !player.eliminated).length;
    if (nextDestroyed >= 5) { setResult({ winner: "spy", reason: "중앙 타깃에 다섯 번째 파괴 공작이 성공했습니다." }); setScreen("gameover"); }
    else if (livingCrew === 0) { setResult({ winner: "spy", reason: "역저격으로 모든 승무원이 탈락했습니다." }); setScreen("gameover"); }
    else setScreen("resolution");
  }

  function submitRoleAction() {
    const role = currentPlayer.role; const nextActions = { ...actions };
    if (role.id === "pilot") nextActions.isolation = selectedLocation;
    if (role.id === "scientist") nextActions.inspection = selectedLocation;
    if (role.id === "security") nextActions.securityQuery = { symbol: querySymbol, threshold: queryThreshold, answer: spyPlayer!.totals[querySymbol] >= queryThreshold };
    if (role.id === "spy") { nextActions.spyIntent = spyIntent; if (spyIntent === "assassinate") { const victim = players[assassinationTarget]; nextActions.assassination = { targetIndex: assassinationTarget, totalGuess: assassinationTotal, locationGuess: victim?.role.id === "pilot" || victim?.role.id === "scientist" ? assassinationLocation : undefined, symbolGuess: victim?.role.id === "security" ? assassinationSymbol : undefined }; } }
    setActions(nextActions); resetPrivateInputs();
    const nextIndex = nextAliveIndex(privateIndex); if (nextIndex !== undefined) { setPrivateIndex(nextIndex); setCovered(true); } else resolveRound(nextActions);
  }

  function beginInvestigation() { setQuerySymbol("eye"); setQueryThreshold(3); setQuestionTarget(aliveIndices.find((index) => index !== activeInvestigator) ?? activeInvestigator); setScreen("investigation"); }
  function submitPrivateQuestion() { setPrivateAnswer(players[questionTarget].totals[querySymbol] >= queryThreshold); setCovered(true); setScreen("privateResult"); }
  function beginBroadcast() { setBroadcastIndex(broadcastRespondents[0]); setBroadcastAnswers([]); setCovered(true); setScreen("broadcastAnswer"); }
  function submitBroadcastAnswer() { const respondent = players[broadcastIndex]; const truthful = respondent.totals[querySymbol] >= queryThreshold; const answer = respondent.role.alignment === "spy" ? spyBroadcastChoice! : truthful; const nextAnswers = [...broadcastAnswers]; nextAnswers[broadcastIndex] = answer; setBroadcastAnswers(nextAnswers); setSpyBroadcastChoice(undefined); const position = broadcastRespondents.indexOf(broadcastIndex); if (position < broadcastRespondents.length - 1) { setBroadcastIndex(broadcastRespondents[position + 1]); setCovered(true); } else setScreen("broadcastResult"); }
  function enterArrest() { setSuspect(aliveIndices.find((index) => index !== activeInvestigator) ?? activeInvestigator); setAccusedLocation(1); setCovered(true); setScreen("arrest"); }
  function nextRound() { setRound(round + 1); setActions({}); setReport(null); setPrivateIndex(aliveIndices[0]); resetPrivateInputs(); setCovered(true); setScreen("action"); }
  function confirmArrest() { const investigator = players[activeInvestigator]; if (investigator.role.alignment === "spy") { nextRound(); return; } const correctSpy = players[suspect].role.alignment === "spy"; const correctTarget = target!.id === accusedLocation; if (correctSpy && correctTarget) setResult({ winner: "crew", reason: `${investigator.name}의 체포 선언이 두 항목 모두 일치했습니다.` }); else setResult({ winner: "spy", reason: `체포 선언 오류 — ${!correctSpy ? "스파이 식별" : "타깃 구역"}이 틀렸습니다.` }); setScreen("gameover"); }

  const assassinationVictim = players[assassinationTarget];
  const actionReady = currentPlayer?.role.id === "pilot" ? Boolean(selectedLocation && selectedLocation !== lastIsolation) : currentPlayer?.role.id === "scientist" ? Boolean(selectedLocation) : currentPlayer?.role.id === "spy" ? Boolean(spyIntent && (spyIntent !== "assassinate" || (assassinationVictim && !assassinationVictim.eliminated && assassinationVictim.role.alignment === "crew"))) : true;

  return <main className={`mission-shell screen-${screen}`}>
    <Topbar round={screen !== "landing" && screen !== "setup" && players.length ? round : undefined} active={screen !== "landing" && screen !== "setup"} onManual={() => setManualOpen(true)} onReset={() => resetGame()} />
    <div className={`cloud-status ${cloudReady ? "online" : ""}`}><span>●</span> SUPABASE · {saveStatus}</div>

    {screen === "landing" ? <><section className="hero-grid"><div className="hero-copy"><p className="kicker">4인용 비밀 추리 · 함선 생존 프로토콜</p><h2>파괴자는 이미<br /><em>승선했다.</em></h2><p className="lede">13개 구역, 17장의 기밀 카드, 단 하나의 파괴 타깃. 다섯 번째 공작이 끝나기 전에 스파이와 목표 구역을 찾아내십시오.</p><div className="hero-actions"><button className="primary-cta" type="button" onClick={onOnline}>온라인 4인 방 <span>↗</span></button><button className="secondary-cta" type="button" onClick={() => setScreen("setup")}>한 기기 핫시트</button><button className="secondary-cta" type="button" onClick={() => setManualOpen(true)}>룰 먼저 보기</button></div>{savedGames.length ? <div className="saved-missions"><small>SUPABASE · SAVED MISSIONS</small>{savedGames.map((game) => <button type="button" key={game.id} onClick={() => loadGame(game)}><span>{game.name}</span><b>CYCLE {String(game.current_round).padStart(2, "0")} · {new Date(game.updated_at).toLocaleDateString("ko-KR")}</b></button>)}</div> : null}</div><div className="command-panel" aria-label="게임 구성"><div className="panel-head"><span>MISSION CONTROL</span><b>ZERO HOUR</b></div><div className="threat-ring"><div><strong>5</strong><span>/ 5</span><small>폭발 임계치</small></div></div><div className="telemetry"><div><span>승무원</span><strong>03</strong></div><div><span>잠입자</span><strong className="danger">01</strong></div><div><span>기밀 카드</span><strong>17</strong></div></div><div className="classified">CENTRAL TARGET · CLASSIFIED</div></div></section><footer className="signal-line"><span>● SYSTEM READY</span><div /><p>HERMES NETWORK / ENCRYPTED CHANNEL 9</p></footer></> : null}

    {screen === "setup" ? <section className="setup-view content-view"><div className="section-heading"><p className="kicker">MISSION REGISTRATION · 01</p><h2>승무원 명부를<br />등록하십시오.</h2><p>한 대의 기기를 차례로 넘기는 4인 핫시트 방식입니다. 이름은 공개 정보입니다.</p></div><form className="crew-form" onSubmit={(event) => { event.preventDefault(); startGame(); }}>{names.map((name, index) => <label key={index}><span>SEAT {String(index + 1).padStart(2, "0")}</span><input value={name} maxLength={16} onChange={(event) => setNames(names.map((entry, i) => i === index ? event.target.value : entry))} aria-label={`플레이어 ${index + 1} 이름`} /></label>)}<button className="primary-cta wide" type="submit">17장 셔플 및 기밀 배분 <span>↗</span></button></form></section> : null}

    {screen === "briefing" && currentPlayer ? covered ? <PrivacyGate name={currentPlayer.name} label={`기밀 브리핑 ${privateIndex + 1} / 4`} onReveal={() => setCovered(false)} /> : <section className="briefing-view content-view"><div className={`role-dossier ${currentPlayer.role.alignment}`}><div className="dossier-top"><span>ROLE CLEARANCE · {currentPlayer.role.alignment === "spy" ? "OMEGA" : "ALPHA"}</span><b>{currentPlayer.role.alignment === "spy" ? "잠입자" : "승무원"}</b></div><img className="role-portrait" src={roleImage(currentPlayer.role.id)} alt={`${currentPlayer.role.name} 인물 일러스트`} /><p>{currentPlayer.role.english}</p><h2>{currentPlayer.role.name}</h2><SymbolRow symbols={currentPlayer.role.symbols} /><div className="role-action"><small>SPECIAL ACTION</small><h3>{currentPlayer.role.action}</h3><p>{currentPlayer.role.description}</p></div>{currentPlayer.role.alignment === "spy" ? <div className="spy-order">극비 명령 · 중앙에 봉인된 구역을 다섯 번 파괴하십시오.</div> : <div className="crew-order">최우선 명령 · 스파이와 중앙 타깃을 함께 식별하십시오.</div>}</div><div className="hand-area"><div className="hand-head"><div><p className="kicker">VERIFIED SAFE SECTORS · 03</p><h3>내 위치 카드</h3></div><div className="total-box"><small>내 손패 총합</small>{symbolKeys.map((key) => <span className={SYMBOLS[key].color} key={key}>{SYMBOLS[key].icon} {currentPlayer.totals[key]}</span>)}<b>{symbolTotal(currentPlayer.totals)} SYMBOLS</b></div></div><div className="hand-cards">{currentPlayer.hand.map((location) => <article className="hand-card" key={location.id}><img className="card-art" src={locationImage(location.id)} alt={`${location.name} 구역 일러스트`} /><span className="card-code">{location.code}</span><b className="card-number">{String(location.id).padStart(2, "0")}</b><div><small>{location.english}</small><h4>{location.name}</h4><p>{location.description}</p></div><SymbolRow symbols={location.symbols} /></article>)}</div><button className="primary-cta" type="button" onClick={finishBriefing}>확인 완료 · 정보 숨기기 <span>↗</span></button></div></section> : null}

    {screen === "action" && currentPlayer ? covered ? <PrivacyGate name={currentPlayer.name} label={`CYCLE ${String(round).padStart(2, "0")} · 직무 액션 ${privateIndex + 1} / 4`} onReveal={() => setCovered(false)} /> : <section className="action-view content-view"><div className="action-sidebar"><p className="kicker">CLASSIFIED DUTY ACTION</p><span>{currentPlayer.role.english}</span><h2>{currentPlayer.role.action}</h2><p>{currentPlayer.role.description}</p><div className={`alignment-chip ${currentPlayer.role.alignment}`}>{currentPlayer.role.alignment === "spy" ? "OMEGA / 잠입자" : "ALPHA / 승무원"}</div>{currentPlayer.role.id === "spy" ? <div className="spy-telemetry"><small>PRIVATE SABOTAGE LOG</small><strong>{destroyed}<i>/5</i></strong><p>{spyFeedback}</p></div> : null}</div><div className="action-console">
      {(currentPlayer.role.id === "pilot" || currentPlayer.role.id === "scientist") ? <><div className="console-head"><span>01</span><div><small>SELECT SECTOR</small><h3>{currentPlayer.role.id === "pilot" ? "격리할 구역을 선택" : "감식할 구역을 선택"}</h3>{currentPlayer.role.id === "pilot" && lastIsolation ? <p className="cooldown-note">직전 락다운 {String(lastIsolation).padStart(2, "0")}번은 이번 라운드 지정 불가</p> : null}</div></div><LocationGrid selected={selectedLocation} onSelect={setSelectedLocation} disabledIds={currentPlayer.role.id === "pilot" && lastIsolation ? [lastIsolation] : []} /></> : null}
      {currentPlayer.role.id === "security" ? <><div className="console-head"><span>01</span><div><small>BLACKBOX QUERY</small><h3>스파이 보유 심볼 임계값 조회</h3></div></div><div className="query-builder"><div className="symbol-picker">{symbolKeys.map((key) => <button type="button" className={`${querySymbol === key ? "selected" : ""} ${SYMBOLS[key].color}`} onClick={() => setQuerySymbol(key)} key={key}><b>{SYMBOLS[key].icon}</b><span>{SYMBOLS[key].name}</span></button>)}</div><label><span>기준 개수</span><input type="range" min="1" max="8" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))} /><b>{queryThreshold}개 이상</b></label><div className="query-preview">“스파이는 <strong>{SYMBOLS[querySymbol].name}</strong>을 <strong>{queryThreshold}개 이상</strong> 보유하고 있는가?”</div><div className="private-warning">결과는 제출 후 공개되지 않습니다. O/X를 기억하거나 개인 메모에 남기십시오.</div><div className="security-answer">기밀 판정 · <b>{spyPlayer!.totals[querySymbol] >= queryThreshold ? "O" : "X"}</b></div></div></> : null}
      {currentPlayer.role.id === "spy" ? <><div className="console-head"><span>01</span><div><small>OMEGA DIRECTIVE</small><h3>이번 라운드 행동 결정</h3></div></div><div className="spy-choices"><button type="button" className={spyIntent === "attack" ? "selected attack" : "attack"} onClick={() => setSpyIntent("attack")}><span>ϟ</span><div><small>SABOTAGE</small><h3>파괴 공작 실행</h3><p>중앙 타깃을 공격합니다. 락다운 시 즉시 차단 알림을 받습니다.</p></div></button><button type="button" className={spyIntent === "wait" ? "selected" : ""} onClick={() => setSpyIntent("wait")}><span>○</span><div><small>GHOST PROTOCOL</small><h3>위장 · 공격 중지</h3><p>과학자의 감식을 피하기 위해 이번 라운드 공격을 쉽니다.</p></div></button><button type="button" className={spyIntent === "assassinate" ? "selected assassinate" : "assassinate"} onClick={() => { setSpyIntent("assassinate"); const firstCrew = players.findIndex((player) => player.role.alignment === "crew" && !player.eliminated); if (firstCrew >= 0) setAssassinationTarget(firstCrew); }}><span>⌖</span><div><small>COUNTER-SNIPE</small><h3>역저격 선언</h3><p>일반 행동을 포기하고 승무원의 정보와 직무 행동을 동시에 맞힙니다.</p></div></button></div>{spyIntent === "assassinate" ? <div className="assassination-builder"><p className="kicker">HIGH RISK · 틀리면 스파이 정체 공개</p><label><span>저격 대상</span><select value={assassinationTarget} onChange={(event) => setAssassinationTarget(Number(event.target.value))}>{players.map((player, index) => player.role.alignment === "crew" && !player.eliminated ? <option value={index} key={index}>{player.name}</option> : null)}</select></label><label><span>손패 총 심볼 개수</span><input type="number" min="4" max="12" value={assassinationTotal} onChange={(event) => setAssassinationTotal(Number(event.target.value))} /></label>{assassinationVictim?.role.id === "security" ? <label><span>직전 기밀 조회 아이템</span><select value={assassinationSymbol} onChange={(event) => setAssassinationSymbol(event.target.value as SymbolKey)}>{symbolKeys.map((key) => <option value={key} key={key}>{SYMBOLS[key].icon} {SYMBOLS[key].name}</option>)}</select></label> : <label><span>이번 직무 수행 구역</span><select value={assassinationLocation} onChange={(event) => setAssassinationLocation(Number(event.target.value))}>{LOCATIONS.map((location) => <option value={location.id} key={location.id}>{String(location.id).padStart(2, "0")} · {location.name}</option>)}</select></label>}</div> : null}</> : null}
      <button className="primary-cta submit-action" type="button" disabled={!actionReady} onClick={submitRoleAction}>액션 암호화 제출 <span>↗</span></button>
    </div></section> : null}

    {screen === "resolution" && report ? <section className="resolution-view content-view"><div className="section-heading"><p className="kicker">ANONYMOUS SYSTEM RESOLUTION</p><h2>CYCLE {String(round).padStart(2, "0")}<br />분석 완료.</h2><p>{spyExposed ? `긴급 경보 · 스파이는 ${spyPlayer!.name}입니다.` : "직무 수행자의 신원은 익명으로 유지됩니다. 공개 정보만 기록하십시오."}</p></div>{report.assassination ? <div className={`assassination-report ${report.assassination.success ? "success" : "failed"}`}><span>⌖ COUNTER-SNIPE</span><h3>{report.assassination.success ? `${report.assassination.targetName} 즉시 탈락` : "역저격 실패 · OMEGA 신원 노출"}</h3><p>{report.assassination.success ? "대상은 가림막을 덮고 게임에서 퇴장합니다." : `스파이: ${report.assassination.spyName}`}</p></div> : null}<div className="resolution-grid"><article><span className="result-icon lime">▰</span><small>PILOT PROTOCOL</small><h3>구역 격리</h3><b>{report.isolation ? `${String(report.isolation).padStart(2, "0")} · ${getLocation(report.isolation).name}` : "직무자 탈락 · 미실행"}</b><p>락다운은 다음 조종사 턴 시작 전까지 유지됩니다.</p></article><article className={report.detected ? "detected" : ""}><span className="result-icon cyan">◎</span><small>SCIENCE PROTOCOL</small><h3>현장 감식</h3><b>{report.inspection ? `${String(report.inspection).padStart(2, "0")} · ${getLocation(report.inspection).name}` : "직무자 탈락 · 미실행"}</b><div className="ox-result">{report.detected ? "O" : "X"}</div><p>{report.detected ? `파괴 흔적 감지 · 스파이 손패 총 심볼 ${report.spyTotal}개` : "확인 가능한 파괴 흔적이 없습니다."}</p></article><article className="classified-result"><span className="result-icon orange">ϟ</span><small>OMEGA ACTIVITY</small><h3>파괴 공작</h3><b>{spyExposed ? `${spyPlayer!.name} · EXPOSED` : "CLASSIFIED"}</b><p>공격 여부와 누적 스택은 스파이만 확인할 수 있습니다.</p></article></div><button className="primary-cta" type="button" onClick={beginInvestigation}>수사 단계로 이동 <span>↗</span></button></section> : null}

    {screen === "investigation" ? <section className="investigation-view content-view"><div className="section-heading"><p className="kicker">INVESTIGATION LEAD · {players[activeInvestigator].name}</p><h2>통신 채널을<br />선택하십시오.</h2><p>이번 라운드의 수사 담당자는 <strong>{players[activeInvestigator].name}</strong>입니다.</p></div><div className="investigation-console"><div className="query-builder compact-builder"><div className="symbol-picker">{symbolKeys.map((key) => <button type="button" className={`${querySymbol === key ? "selected" : ""} ${SYMBOLS[key].color}`} onClick={() => setQuerySymbol(key)} key={key}><b>{SYMBOLS[key].icon}</b><span>{SYMBOLS[key].name}</span></button>)}</div><label><span>기준 개수</span><input type="range" min="1" max="8" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))} /><b>{queryThreshold}개 이상</b></label><div className="query-preview">“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</div></div><div className="channel-grid"><article><small>PRIVATE CHANNEL</small><h3>1:1 정밀 심문</h3><p>한 명에게 비공개로 질문합니다. 스파이를 포함한 누구나 진실만 답합니다.</p><select value={questionTarget} onChange={(event) => setQuestionTarget(Number(event.target.value))}>{players.map((player, index) => index !== activeInvestigator && !player.eliminated ? <option value={index} key={index}>{player.name}</option> : null)}</select><button type="button" onClick={submitPrivateQuestion}>비공개 통신 개시</button></article><article className="broadcast-card"><small>OPEN CHANNEL</small><h3>전체 방송 스캔</h3><p>생존자 전원이 같은 질문에 공개 답변합니다. 승무원은 진실, 스파이는 O/X를 자유롭게 선택합니다.</p><div className="four-dots">{broadcastRespondents.map((index) => <i key={index}/>)}</div><button type="button" onClick={beginBroadcast}>전체 방송 개시</button></article></div></div></section> : null}

    {screen === "privateResult" ? covered ? <PrivacyGate name={players[activeInvestigator].name} label="1:1 정밀 심문 응답 수신" onReveal={() => setCovered(false)} /> : <section className="answer-view"><p className="kicker">PRIVATE CHANNEL · TRUTH LOCKED</p><h2>{players[questionTarget].name}의 응답</h2><div className={`giant-answer ${privateAnswer ? "yes" : "no"}`}>{privateAnswer ? "O" : "X"}</div><p>“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</p><div className="truth-stamp">100% TRUTH PROTOCOL</div><button className="primary-cta" type="button" onClick={enterArrest}>응답 폐기 · 체포 판단 <span>↗</span></button></section> : null}

    {screen === "broadcastAnswer" ? covered ? <PrivacyGate name={players[broadcastIndex].name} label={`전체 방송 응답 ${broadcastRespondents.indexOf(broadcastIndex) + 1} / ${broadcastRespondents.length}`} onReveal={() => setCovered(false)} /> : <section className="answer-view broadcast-answer"><p className="kicker">OPEN CHANNEL · RESPONSE REQUIRED</p><h2>{players[broadcastIndex].name},<br />응답하십시오.</h2><p>“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</p>{players[broadcastIndex].role.alignment === "crew" ? <div className="locked-answer"><small>진실 프로토콜이 답변을 잠금</small><div className={`giant-answer ${players[broadcastIndex].totals[querySymbol] >= queryThreshold ? "yes" : "no"}`}>{players[broadcastIndex].totals[querySymbol] >= queryThreshold ? "O" : "X"}</div></div> : <div className="bluff-picker"><small>OMEGA 권한 · 진실 또는 거짓 선택</small><div><button type="button" className={spyBroadcastChoice === true ? "selected yes" : "yes"} onClick={() => setSpyBroadcastChoice(true)}>O</button><button type="button" className={spyBroadcastChoice === false ? "selected no" : "no"} onClick={() => setSpyBroadcastChoice(false)}>X</button></div></div>}<button className="primary-cta" disabled={players[broadcastIndex].role.alignment === "spy" && spyBroadcastChoice === undefined} type="button" onClick={submitBroadcastAnswer}>응답 암호화 제출 <span>↗</span></button></section> : null}

    {screen === "broadcastResult" ? <section className="resolution-view content-view"><div className="section-heading"><p className="kicker">OPEN CHANNEL · PUBLIC RECORD</p><h2>전체 방송<br />응답 기록.</h2><p>승무원은 진실을 답했습니다. 단 한 명의 응답만 조작되었을 수 있습니다.</p></div><div className="broadcast-results">{players.map((player, index) => !player.eliminated ? <article key={index}><span>SEAT {String(index + 1).padStart(2, "0")}</span><h3>{player.name}</h3><b className={broadcastAnswers[index] ? "yes" : "no"}>{broadcastAnswers[index] ? "O" : "X"}</b></article> : null)}</div><div className="query-caption">QUERY · {SYMBOLS[querySymbol].name} {queryThreshold}개 이상</div><button className="primary-cta" type="button" onClick={enterArrest}>체포 판단으로 이동 <span>↗</span></button></section> : null}

    {screen === "arrest" ? covered ? <PrivacyGate name={players[activeInvestigator].name} label="최종 체포 권한 · 선택 단계" onReveal={() => setCovered(false)} /> : <section className="arrest-view content-view"><div className="arrest-warning"><span>!</span><div><p className="kicker">FINAL ARREST · ONE STRIKE</p><h2>틀리면 즉시<br />함선이 무너집니다.</h2><p>{spyExposed ? `역저격 실패로 ${spyPlayer!.name}의 정체가 공개되었습니다. 이제 타깃 구역만 확정하십시오.` : "스파이와 중앙 타깃을 모두 정확히 지목해야 합니다. 아직 확신이 없다면 이번 라운드는 보류하십시오."}</p></div></div><div className="arrest-form"><label><span>용의자 식별</span><select value={suspect} onChange={(event) => setSuspect(Number(event.target.value))}>{players.map((player, index) => !player.eliminated ? <option value={index} key={index}>{String(index + 1).padStart(2, "0")} · {player.name}</option> : null)}</select></label><label><span>중앙 타깃 구역</span><select value={accusedLocation} onChange={(event) => setAccusedLocation(Number(event.target.value))}>{LOCATIONS.map((location) => <option value={location.id} key={location.id}>{String(location.id).padStart(2, "0")} · {location.name}</option>)}</select></label><div className="arrest-actions"><button type="button" className="secondary-cta" onClick={nextRound}>이번 라운드 보류</button><button type="button" className="danger-cta" onClick={confirmArrest}>최종 체포 선언</button></div></div></section> : null}

    {screen === "gameover" && result && target ? <section className={`gameover-view ${result.winner}`}><p className="kicker">MISSION TERMINATED · FINAL DISCLOSURE</p><h2>{result.winner === "crew" ? "스파이 체포." : "HERMES-IX LOST."}</h2><p className="gameover-reason">{result.reason}</p><div className="final-reveal"><article><small>OMEGA OPERATIVE</small><span>{String(players.indexOf(spyPlayer!)+1).padStart(2,"0")}</span><h3>{spyPlayer!.name}</h3><p>{spyPlayer!.role.name}</p></article><article><small>CENTRAL TARGET</small><span>{String(target.id).padStart(2,"0")}</span><h3>{target.name}</h3><p>{target.english}</p><SymbolRow symbols={target.symbols} /></article><article><small>SABOTAGE STACK</small><span>{destroyed}</span><h3>/ 5</h3><p>최종 누적 공작</p></article></div><div className="all-hands">{players.map((player, index) => <div className={player.eliminated ? "eliminated" : ""} key={index}><b>{player.name}{player.eliminated ? " · OUT" : ""}</b><span className={player.role.alignment}>{player.role.name}</span><p>{player.hand.map((card) => `${String(card.id).padStart(2,"0")} ${card.name}`).join(" · ")}</p></div>)}</div><button className="primary-cta" type="button" onClick={() => resetGame(true)}>새로운 임무 시작 <span>↗</span></button></section> : null}

    {manualOpen ? <Manual onClose={() => setManualOpen(false)} /> : null}
  </main>;
}
