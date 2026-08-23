"use client";

import { useState } from "react";

type SymbolKey = "eye" | "key" | "power";
type Symbols = Record<SymbolKey, number>;
type Alignment = "crew" | "spy";
type Screen = "landing" | "setup" | "briefing" | "action" | "resolution" | "investigation" | "privateResult" | "broadcastAnswer" | "broadcastResult" | "arrest" | "gameover";

type Role = { id: "pilot" | "scientist" | "security" | "spy"; name: string; english: string; alignment: Alignment; symbols: Symbols; action: string; description: string; };
type Location = { id: number; code: string; name: string; english: string; description: string; symbols: Symbols; };
type Player = { name: string; role: Role; hand: Location[]; totals: Symbols; };
type RoundActions = { isolation?: number; inspection?: number; securityQuery?: { symbol: SymbolKey; threshold: number; answer: boolean }; spyIntent?: "attack" | "wait"; };
type RoundReport = { isolation: number; inspection: number; detected: boolean; spyTotal: number | null; };

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
const symbolKeys = Object.keys(SYMBOLS) as SymbolKey[];
function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function addSymbols(...groups: Symbols[]) { return groups.reduce((sum, group) => ({ eye: sum.eye + group.eye, key: sum.key + group.key, power: sum.power + group.power }), { ...ZERO }); }
function symbolTotal(group: Symbols) { return group.eye + group.key + group.power; }
function getLocation(id?: number) { return LOCATIONS.find((location) => location.id === id)!; }

function SymbolRow({ symbols, compact = false }: { symbols: Symbols; compact?: boolean }) {
  return <div className={`symbol-row ${compact ? "compact" : ""}`}>{symbolKeys.flatMap((key) => Array.from({ length: symbols[key] }, (_, index) => <span className={`symbol ${SYMBOLS[key].color}`} title={SYMBOLS[key].name} key={`${key}-${index}`}>{SYMBOLS[key].icon}</span>))}</div>;
}

function PrivacyGate({ name, label, onReveal }: { name: string; label: string; onReveal: () => void }) {
  return <section className="privacy-gate"><div className="scan-orbit"><div className="iris">H<span>IX</span></div></div><p className="kicker">EYES ONLY · 개인 열람</p><h2>{name} 님에게<br />기기를 전달하세요.</h2><p>{label}<br />다른 플레이어는 화면을 보지 마십시오.</p><button className="primary-cta" type="button" onClick={onReveal}>본인 확인 · 열람 <span>↗</span></button></section>;
}

function LocationGrid({ selected, onSelect }: { selected?: number; onSelect: (id: number) => void }) {
  return <div className="location-grid">{LOCATIONS.map((location) => <button type="button" className={`location-tile ${selected === location.id ? "selected" : ""}`} aria-pressed={selected === location.id} onClick={() => onSelect(location.id)} key={location.id}><span className="location-number">{String(location.id).padStart(2, "0")}</span><span><b>{location.name}</b><small>{location.english}</small></span><SymbolRow symbols={location.symbols} compact /></button>)}</div>;
}

function Topbar({ round, active, onManual, onReset }: { round?: number; active: boolean; onManual: () => void; onReset: () => void }) {
  return <header className="topbar"><button className="brand-mark" type="button" onClick={onReset} aria-label="처음으로">H<span>IX</span></button><div className="brand-copy"><p className="eyebrow">DEEP SPACE VESSEL · HERMES-IX</p><h1>ZERO HOUR</h1></div>{round ? <div className="round-readout"><small>CURRENT CYCLE</small><b>{String(round).padStart(2, "0")}</b></div> : null}<nav><button type="button" className="text-button" onClick={onManual}>전술 매뉴얼</button>{active ? <button type="button" className="text-button danger-text" onClick={onReset}>임무 중단</button> : null}</nav></header>;
}

function Manual({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"protocol" | "archive">("protocol");
  return <div className="manual-backdrop" role="dialog" aria-modal="true" aria-label="전술 매뉴얼"><section className="manual-panel"><header><div><p className="eyebrow">HERMES-IX / TACTICAL DATABASE</p><h2>전술 매뉴얼</h2></div><button type="button" onClick={onClose} aria-label="닫기">×</button></header><div className="manual-tabs"><button type="button" className={tab === "protocol" ? "active" : ""} onClick={() => setTab("protocol")}>게임 프로토콜</button><button type="button" className={tab === "archive" ? "active" : ""} onClick={() => setTab("archive")}>17장 카드 아카이브</button></div>{tab === "protocol" ? <div className="manual-content protocol-list">
    <article><b>01</b><div><h3>비밀 배분</h3><p>위치 카드 13장 중 한 장은 중앙 타깃으로 봉인됩니다. 네 플레이어는 역할 1장과 안전이 확인된 위치 3장을 받습니다.</p></div></article>
    <article><b>02</b><div><h3>익명 직무 액션</h3><p>기기를 차례로 넘겨 각자 역할 액션을 비공개 제출합니다. 시스템은 조종사의 격리와 과학자의 감식 결과만 익명으로 공개합니다.</p></div></article>
    <article><b>03</b><div><h3>제한된 진실 프로토콜</h3><p>1:1 심문은 “특정 심볼을 N개 이상 보유했는가?” 형식만 허용되며 누구나 진실로 답합니다. 전체 방송에서만 스파이가 거짓말할 수 있습니다.</p></div></article>
    <article><b>04</b><div><h3>최종 체포</h3><p>수사 담당 승무원은 스파이 플레이어와 중앙 타깃을 함께 지목합니다. 둘 다 맞으면 승무원 승리, 하나라도 틀리면 스파이가 즉시 승리합니다.</p></div></article>
    <article className="warning-article"><b>05</b><div><h3>제로 아워</h3><p>격리되지 않은 중앙 타깃에 파괴 공작이 5회 누적되면 헤르메스-IX는 폭발하고 스파이가 승리합니다.</p></div></article>
    <aside><strong>룰 정정</strong><p>제공된 카드 데이터를 직접 합산하면 전체 심볼은 ◉ 11개 · ◆ 10개 · ϟ 12개입니다. 본 버전은 실제 카드 수치인 33개를 기준으로 판정합니다.</p></aside>
  </div> : <div className="manual-content archive-grid"><div className="archive-section"><p className="section-label">ROLE CLEARANCE · 04</p>{ROLES.map((role) => <article className={`archive-card ${role.alignment}`} key={role.id}><span>{role.english}</span><h3>{role.name}</h3><p>{role.action} · {role.description}</p><SymbolRow symbols={role.symbols} /></article>)}</div><div className="archive-section"><p className="section-label">SHIP SECTORS · 13</p>{LOCATIONS.map((location) => <article className="archive-card" key={location.id}><span>{location.code} · {location.english}</span><h3>{location.name}</h3><p>{location.description}</p><SymbolRow symbols={location.symbols} /></article>)}</div></div>}</section></div>;
}

export default function Home() {
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
  const [spyIntent, setSpyIntent] = useState<"attack" | "wait">();
  const [spyFeedback, setSpyFeedback] = useState("아직 실행된 공작이 없습니다.");
  const [questionTarget, setQuestionTarget] = useState(1);
  const [privateAnswer, setPrivateAnswer] = useState<boolean | null>(null);
  const [broadcastIndex, setBroadcastIndex] = useState(0);
  const [broadcastAnswers, setBroadcastAnswers] = useState<boolean[]>([]);
  const [spyBroadcastChoice, setSpyBroadcastChoice] = useState<boolean>();
  const [suspect, setSuspect] = useState(0);
  const [accusedLocation, setAccusedLocation] = useState(1);
  const [result, setResult] = useState<{ winner: Alignment; reason: string } | null>(null);

  const activeInvestigator = players.length ? (round - 1) % 4 : 0;
  const currentPlayer = players[privateIndex];
  const spyPlayer = players.find((player) => player.role.alignment === "spy");

  function resetGame(force = false) {
    if (!force && screen !== "landing" && screen !== "setup" && !window.confirm("진행 중인 임무를 중단하고 초기 화면으로 돌아갈까요?")) return;
    setScreen("landing"); setPlayers([]); setTarget(null); setRound(1); setDestroyed(0); setActions({}); setReport(null); setResult(null); setCovered(true);
  }

  function startGame() {
    const locationDeck = shuffle(LOCATIONS); const centralTarget = locationDeck[0]; const roleDeck = shuffle(ROLES);
    const dealtPlayers = names.map((rawName, index) => { const hand = locationDeck.slice(1 + index * 3, 4 + index * 3); const role = roleDeck[index]; return { name: rawName.trim() || `플레이어 ${index + 1}`, role, hand, totals: addSymbols(role.symbols, ...hand.map((card) => card.symbols)) }; });
    setPlayers(dealtPlayers); setTarget(centralTarget); setPrivateIndex(0); setRound(1); setDestroyed(0); setSpyFeedback("아직 실행된 공작이 없습니다."); setCovered(true); setScreen("briefing");
  }

  function finishBriefing() { if (privateIndex < 3) { setPrivateIndex(privateIndex + 1); setCovered(true); } else { setPrivateIndex(0); setCovered(true); setScreen("action"); } }
  function resetPrivateInputs() { setSelectedLocation(undefined); setQuerySymbol("eye"); setQueryThreshold(3); setSpyIntent(undefined); setSpyBroadcastChoice(undefined); }

  function resolveRound(nextActions: RoundActions) {
    const attacked = nextActions.spyIntent === "attack"; const blocked = attacked && nextActions.isolation === target!.id; const succeeded = attacked && !blocked; const nextDestroyed = destroyed + (succeeded ? 1 : 0); const detected = attacked && nextActions.inspection === target!.id; const spyTotal = detected ? symbolTotal(spyPlayer!.totals) : null;
    setDestroyed(nextDestroyed); setReport({ isolation: nextActions.isolation!, inspection: nextActions.inspection!, detected, spyTotal });
    setSpyFeedback(!attacked ? `CYCLE ${String(round).padStart(2, "0")} · 위장 유지, 공격하지 않음` : blocked ? `CYCLE ${String(round).padStart(2, "0")} · 공작 차단됨, 스택 증가 없음` : `CYCLE ${String(round).padStart(2, "0")} · 공작 성공, 현재 ${nextDestroyed}/5 스택`);
    if (nextDestroyed >= 5) { setResult({ winner: "spy", reason: "중앙 타깃에 다섯 번째 파괴 공작이 성공했습니다." }); setScreen("gameover"); } else setScreen("resolution");
  }

  function submitRoleAction() {
    const role = currentPlayer.role; const nextActions = { ...actions };
    if (role.id === "pilot") nextActions.isolation = selectedLocation;
    if (role.id === "scientist") nextActions.inspection = selectedLocation;
    if (role.id === "security") nextActions.securityQuery = { symbol: querySymbol, threshold: queryThreshold, answer: spyPlayer!.totals[querySymbol] >= queryThreshold };
    if (role.id === "spy") nextActions.spyIntent = spyIntent;
    setActions(nextActions); resetPrivateInputs();
    if (privateIndex < 3) { setPrivateIndex(privateIndex + 1); setCovered(true); } else resolveRound(nextActions);
  }

  function beginInvestigation() { setQuerySymbol("eye"); setQueryThreshold(3); setQuestionTarget((activeInvestigator + 1) % 4); setScreen("investigation"); }
  function submitPrivateQuestion() { setPrivateAnswer(players[questionTarget].totals[querySymbol] >= queryThreshold); setCovered(true); setScreen("privateResult"); }
  function beginBroadcast() { setBroadcastIndex(0); setBroadcastAnswers([]); setCovered(true); setScreen("broadcastAnswer"); }
  function submitBroadcastAnswer() { const respondent = players[broadcastIndex]; const truthful = respondent.totals[querySymbol] >= queryThreshold; const answer = respondent.role.alignment === "spy" ? spyBroadcastChoice! : truthful; const nextAnswers = [...broadcastAnswers, answer]; setBroadcastAnswers(nextAnswers); setSpyBroadcastChoice(undefined); if (broadcastIndex < 3) { setBroadcastIndex(broadcastIndex + 1); setCovered(true); } else setScreen("broadcastResult"); }
  function enterArrest() { setSuspect((activeInvestigator + 1) % 4); setAccusedLocation(1); setCovered(true); setScreen("arrest"); }
  function nextRound() { setRound(round + 1); setActions({}); setReport(null); setPrivateIndex(0); resetPrivateInputs(); setCovered(true); setScreen("action"); }
  function confirmArrest() { const investigator = players[activeInvestigator]; if (investigator.role.alignment === "spy") { nextRound(); return; } const correctSpy = players[suspect].role.alignment === "spy"; const correctTarget = target!.id === accusedLocation; if (correctSpy && correctTarget) setResult({ winner: "crew", reason: `${investigator.name}의 체포 선언이 두 항목 모두 일치했습니다.` }); else setResult({ winner: "spy", reason: `체포 선언 오류 — ${!correctSpy ? "스파이 식별" : "타깃 구역"}이 틀렸습니다.` }); setScreen("gameover"); }

  const actionReady = currentPlayer?.role.id === "pilot" || currentPlayer?.role.id === "scientist" ? Boolean(selectedLocation) : currentPlayer?.role.id === "spy" ? Boolean(spyIntent) : true;

  return <main className={`mission-shell screen-${screen}`}>
    <Topbar round={screen !== "landing" && screen !== "setup" && players.length ? round : undefined} active={screen !== "landing" && screen !== "setup"} onManual={() => setManualOpen(true)} onReset={() => resetGame()} />

    {screen === "landing" ? <><section className="hero-grid"><div className="hero-copy"><p className="kicker">4인용 비밀 추리 · 함선 생존 프로토콜</p><h2>파괴자는 이미<br /><em>승선했다.</em></h2><p className="lede">13개 구역, 17장의 기밀 카드, 단 하나의 파괴 타깃. 다섯 번째 공작이 끝나기 전에 스파이와 목표 구역을 찾아내십시오.</p><div className="hero-actions"><button className="primary-cta" type="button" onClick={() => setScreen("setup")}>새 임무 시작 <span>↗</span></button><button className="secondary-cta" type="button" onClick={() => setManualOpen(true)}>룰 먼저 보기</button></div></div><div className="command-panel" aria-label="게임 구성"><div className="panel-head"><span>MISSION CONTROL</span><b>ZERO HOUR</b></div><div className="threat-ring"><div><strong>5</strong><span>/ 5</span><small>폭발 임계치</small></div></div><div className="telemetry"><div><span>승무원</span><strong>03</strong></div><div><span>잠입자</span><strong className="danger">01</strong></div><div><span>기밀 카드</span><strong>17</strong></div></div><div className="classified">CENTRAL TARGET · CLASSIFIED</div></div></section><footer className="signal-line"><span>● SYSTEM READY</span><div /><p>HERMES NETWORK / ENCRYPTED CHANNEL 9</p></footer></> : null}

    {screen === "setup" ? <section className="setup-view content-view"><div className="section-heading"><p className="kicker">MISSION REGISTRATION · 01</p><h2>승무원 명부를<br />등록하십시오.</h2><p>한 대의 기기를 차례로 넘기는 4인 핫시트 방식입니다. 이름은 공개 정보입니다.</p></div><form className="crew-form" onSubmit={(event) => { event.preventDefault(); startGame(); }}>{names.map((name, index) => <label key={index}><span>SEAT {String(index + 1).padStart(2, "0")}</span><input value={name} maxLength={16} onChange={(event) => setNames(names.map((entry, i) => i === index ? event.target.value : entry))} aria-label={`플레이어 ${index + 1} 이름`} /></label>)}<button className="primary-cta wide" type="submit">17장 셔플 및 기밀 배분 <span>↗</span></button></form></section> : null}

    {screen === "briefing" && currentPlayer ? covered ? <PrivacyGate name={currentPlayer.name} label={`기밀 브리핑 ${privateIndex + 1} / 4`} onReveal={() => setCovered(false)} /> : <section className="briefing-view content-view"><div className={`role-dossier ${currentPlayer.role.alignment}`}><div className="dossier-top"><span>ROLE CLEARANCE · {currentPlayer.role.alignment === "spy" ? "OMEGA" : "ALPHA"}</span><b>{currentPlayer.role.alignment === "spy" ? "잠입자" : "승무원"}</b></div><p>{currentPlayer.role.english}</p><h2>{currentPlayer.role.name}</h2><SymbolRow symbols={currentPlayer.role.symbols} /><div className="role-action"><small>SPECIAL ACTION</small><h3>{currentPlayer.role.action}</h3><p>{currentPlayer.role.description}</p></div>{currentPlayer.role.alignment === "spy" ? <div className="spy-order">극비 명령 · 중앙에 봉인된 구역을 다섯 번 파괴하십시오.</div> : <div className="crew-order">최우선 명령 · 스파이와 중앙 타깃을 함께 식별하십시오.</div>}</div><div className="hand-area"><div className="hand-head"><div><p className="kicker">VERIFIED SAFE SECTORS · 03</p><h3>내 위치 카드</h3></div><div className="total-box"><small>내 손패 총합</small>{symbolKeys.map((key) => <span className={SYMBOLS[key].color} key={key}>{SYMBOLS[key].icon} {currentPlayer.totals[key]}</span>)}<b>{symbolTotal(currentPlayer.totals)} SYMBOLS</b></div></div><div className="hand-cards">{currentPlayer.hand.map((location) => <article className="hand-card" key={location.id}><span className="card-code">{location.code}</span><b className="card-number">{String(location.id).padStart(2, "0")}</b><div><small>{location.english}</small><h4>{location.name}</h4><p>{location.description}</p></div><SymbolRow symbols={location.symbols} /></article>)}</div><button className="primary-cta" type="button" onClick={finishBriefing}>확인 완료 · 정보 숨기기 <span>↗</span></button></div></section> : null}

    {screen === "action" && currentPlayer ? covered ? <PrivacyGate name={currentPlayer.name} label={`CYCLE ${String(round).padStart(2, "0")} · 직무 액션 ${privateIndex + 1} / 4`} onReveal={() => setCovered(false)} /> : <section className="action-view content-view"><div className="action-sidebar"><p className="kicker">CLASSIFIED DUTY ACTION</p><span>{currentPlayer.role.english}</span><h2>{currentPlayer.role.action}</h2><p>{currentPlayer.role.description}</p><div className={`alignment-chip ${currentPlayer.role.alignment}`}>{currentPlayer.role.alignment === "spy" ? "OMEGA / 잠입자" : "ALPHA / 승무원"}</div>{currentPlayer.role.id === "spy" ? <div className="spy-telemetry"><small>PRIVATE SABOTAGE LOG</small><strong>{destroyed}<i>/5</i></strong><p>{spyFeedback}</p></div> : null}</div><div className="action-console">
      {(currentPlayer.role.id === "pilot" || currentPlayer.role.id === "scientist") ? <><div className="console-head"><span>01</span><div><small>SELECT SECTOR</small><h3>{currentPlayer.role.id === "pilot" ? "격리할 구역을 선택" : "감식할 구역을 선택"}</h3></div></div><LocationGrid selected={selectedLocation} onSelect={setSelectedLocation} /></> : null}
      {currentPlayer.role.id === "security" ? <><div className="console-head"><span>01</span><div><small>BLACKBOX QUERY</small><h3>스파이 보유 심볼 임계값 조회</h3></div></div><div className="query-builder"><div className="symbol-picker">{symbolKeys.map((key) => <button type="button" className={`${querySymbol === key ? "selected" : ""} ${SYMBOLS[key].color}`} onClick={() => setQuerySymbol(key)} key={key}><b>{SYMBOLS[key].icon}</b><span>{SYMBOLS[key].name}</span></button>)}</div><label><span>기준 개수</span><input type="range" min="1" max="8" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))} /><b>{queryThreshold}개 이상</b></label><div className="query-preview">“스파이는 <strong>{SYMBOLS[querySymbol].name}</strong>을 <strong>{queryThreshold}개 이상</strong> 보유하고 있는가?”</div><div className="private-warning">결과는 제출 후 공개되지 않습니다. O/X를 기억하거나 개인 메모에 남기십시오.</div><div className="security-answer">기밀 판정 · <b>{spyPlayer!.totals[querySymbol] >= queryThreshold ? "O" : "X"}</b></div></div></> : null}
      {currentPlayer.role.id === "spy" ? <><div className="console-head"><span>01</span><div><small>OMEGA DIRECTIVE</small><h3>이번 라운드 행동 결정</h3></div></div><div className="spy-choices"><button type="button" className={spyIntent === "attack" ? "selected attack" : "attack"} onClick={() => setSpyIntent("attack")}><span>ϟ</span><div><small>SABOTAGE</small><h3>파괴 공작 실행</h3><p>중앙 타깃을 공격합니다. 격리되면 스택은 오르지 않습니다.</p></div></button><button type="button" className={spyIntent === "wait" ? "selected" : ""} onClick={() => setSpyIntent("wait")}><span>○</span><div><small>GHOST PROTOCOL</small><h3>위장 · 공격 중지</h3><p>과학자의 감식을 피하기 위해 이번 라운드 공격을 쉽니다.</p></div></button></div></> : null}
      <button className="primary-cta submit-action" type="button" disabled={!actionReady} onClick={submitRoleAction}>액션 암호화 제출 <span>↗</span></button>
    </div></section> : null}

    {screen === "resolution" && report ? <section className="resolution-view content-view"><div className="section-heading"><p className="kicker">ANONYMOUS SYSTEM RESOLUTION</p><h2>CYCLE {String(round).padStart(2, "0")}<br />분석 완료.</h2><p>직무 수행자의 신원은 익명으로 유지됩니다. 공개 정보만 기록하십시오.</p></div><div className="resolution-grid"><article><span className="result-icon lime">▰</span><small>PILOT PROTOCOL</small><h3>구역 격리</h3><b>{String(report.isolation).padStart(2, "0")} · {getLocation(report.isolation).name}</b><p>이 구역을 향한 이번 라운드의 공격은 무효화됩니다.</p></article><article className={report.detected ? "detected" : ""}><span className="result-icon cyan">◎</span><small>SCIENCE PROTOCOL</small><h3>현장 감식</h3><b>{String(report.inspection).padStart(2, "0")} · {getLocation(report.inspection).name}</b><div className="ox-result">{report.detected ? "O" : "X"}</div><p>{report.detected ? `파괴 흔적 감지 · 스파이 손패 총 심볼 ${report.spyTotal}개` : "확인 가능한 파괴 흔적이 없습니다."}</p></article><article className="classified-result"><span className="result-icon orange">ϟ</span><small>OMEGA ACTIVITY</small><h3>파괴 공작</h3><b>CLASSIFIED</b><p>공격 여부와 누적 스택은 스파이만 확인할 수 있습니다.</p></article></div><button className="primary-cta" type="button" onClick={beginInvestigation}>수사 단계로 이동 <span>↗</span></button></section> : null}

    {screen === "investigation" ? <section className="investigation-view content-view"><div className="section-heading"><p className="kicker">INVESTIGATION LEAD · {players[activeInvestigator].name}</p><h2>통신 채널을<br />선택하십시오.</h2><p>이번 라운드의 수사 담당자는 <strong>{players[activeInvestigator].name}</strong>입니다.</p></div><div className="investigation-console"><div className="query-builder compact-builder"><div className="symbol-picker">{symbolKeys.map((key) => <button type="button" className={`${querySymbol === key ? "selected" : ""} ${SYMBOLS[key].color}`} onClick={() => setQuerySymbol(key)} key={key}><b>{SYMBOLS[key].icon}</b><span>{SYMBOLS[key].name}</span></button>)}</div><label><span>기준 개수</span><input type="range" min="1" max="8" value={queryThreshold} onChange={(event) => setQueryThreshold(Number(event.target.value))} /><b>{queryThreshold}개 이상</b></label><div className="query-preview">“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</div></div><div className="channel-grid"><article><small>PRIVATE CHANNEL</small><h3>1:1 정밀 심문</h3><p>한 명에게 비공개로 질문합니다. 스파이를 포함한 누구나 진실만 답합니다.</p><select value={questionTarget} onChange={(event) => setQuestionTarget(Number(event.target.value))}>{players.map((player, index) => index !== activeInvestigator ? <option value={index} key={index}>{player.name}</option> : null)}</select><button type="button" onClick={submitPrivateQuestion}>비공개 통신 개시</button></article><article className="broadcast-card"><small>OPEN CHANNEL</small><h3>전체 방송 스캔</h3><p>모두가 같은 질문에 공개 답변합니다. 승무원은 진실, 스파이는 O/X를 자유롭게 선택합니다.</p><div className="four-dots"><i/><i/><i/><i/></div><button type="button" onClick={beginBroadcast}>전체 방송 개시</button></article></div></div></section> : null}

    {screen === "privateResult" ? covered ? <PrivacyGate name={players[activeInvestigator].name} label="1:1 정밀 심문 응답 수신" onReveal={() => setCovered(false)} /> : <section className="answer-view"><p className="kicker">PRIVATE CHANNEL · TRUTH LOCKED</p><h2>{players[questionTarget].name}의 응답</h2><div className={`giant-answer ${privateAnswer ? "yes" : "no"}`}>{privateAnswer ? "O" : "X"}</div><p>“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</p><div className="truth-stamp">100% TRUTH PROTOCOL</div><button className="primary-cta" type="button" onClick={enterArrest}>응답 폐기 · 체포 판단 <span>↗</span></button></section> : null}

    {screen === "broadcastAnswer" ? covered ? <PrivacyGate name={players[broadcastIndex].name} label={`전체 방송 응답 ${broadcastIndex + 1} / 4`} onReveal={() => setCovered(false)} /> : <section className="answer-view broadcast-answer"><p className="kicker">OPEN CHANNEL · RESPONSE REQUIRED</p><h2>{players[broadcastIndex].name},<br />응답하십시오.</h2><p>“{SYMBOLS[querySymbol].name}을 {queryThreshold}개 이상 보유했는가?”</p>{players[broadcastIndex].role.alignment === "crew" ? <div className="locked-answer"><small>진실 프로토콜이 답변을 잠금</small><div className={`giant-answer ${players[broadcastIndex].totals[querySymbol] >= queryThreshold ? "yes" : "no"}`}>{players[broadcastIndex].totals[querySymbol] >= queryThreshold ? "O" : "X"}</div></div> : <div className="bluff-picker"><small>OMEGA 권한 · 진실 또는 거짓 선택</small><div><button type="button" className={spyBroadcastChoice === true ? "selected yes" : "yes"} onClick={() => setSpyBroadcastChoice(true)}>O</button><button type="button" className={spyBroadcastChoice === false ? "selected no" : "no"} onClick={() => setSpyBroadcastChoice(false)}>X</button></div></div>}<button className="primary-cta" disabled={players[broadcastIndex].role.alignment === "spy" && spyBroadcastChoice === undefined} type="button" onClick={submitBroadcastAnswer}>응답 암호화 제출 <span>↗</span></button></section> : null}

    {screen === "broadcastResult" ? <section className="resolution-view content-view"><div className="section-heading"><p className="kicker">OPEN CHANNEL · PUBLIC RECORD</p><h2>전체 방송<br />응답 기록.</h2><p>승무원은 진실을 답했습니다. 단 한 명의 응답만 조작되었을 수 있습니다.</p></div><div className="broadcast-results">{players.map((player, index) => <article key={index}><span>SEAT {String(index + 1).padStart(2, "0")}</span><h3>{player.name}</h3><b className={broadcastAnswers[index] ? "yes" : "no"}>{broadcastAnswers[index] ? "O" : "X"}</b></article>)}</div><div className="query-caption">QUERY · {SYMBOLS[querySymbol].name} {queryThreshold}개 이상</div><button className="primary-cta" type="button" onClick={enterArrest}>체포 판단으로 이동 <span>↗</span></button></section> : null}

    {screen === "arrest" ? covered ? <PrivacyGate name={players[activeInvestigator].name} label="최종 체포 권한 · 선택 단계" onReveal={() => setCovered(false)} /> : <section className="arrest-view content-view"><div className="arrest-warning"><span>!</span><div><p className="kicker">FINAL ARREST · ONE STRIKE</p><h2>틀리면 즉시<br />함선이 무너집니다.</h2><p>스파이와 중앙 타깃을 모두 정확히 지목해야 합니다. 아직 확신이 없다면 이번 라운드는 보류하십시오.</p></div></div><div className="arrest-form"><label><span>용의자 식별</span><select value={suspect} onChange={(event) => setSuspect(Number(event.target.value))}>{players.map((player, index) => <option value={index} key={index}>{String(index + 1).padStart(2, "0")} · {player.name}</option>)}</select></label><label><span>중앙 타깃 구역</span><select value={accusedLocation} onChange={(event) => setAccusedLocation(Number(event.target.value))}>{LOCATIONS.map((location) => <option value={location.id} key={location.id}>{String(location.id).padStart(2, "0")} · {location.name}</option>)}</select></label><div className="arrest-actions"><button type="button" className="secondary-cta" onClick={nextRound}>이번 라운드 보류</button><button type="button" className="danger-cta" onClick={confirmArrest}>최종 체포 선언</button></div></div></section> : null}

    {screen === "gameover" && result && target ? <section className={`gameover-view ${result.winner}`}><p className="kicker">MISSION TERMINATED · FINAL DISCLOSURE</p><h2>{result.winner === "crew" ? "스파이 체포." : "HERMES-IX LOST."}</h2><p className="gameover-reason">{result.reason}</p><div className="final-reveal"><article><small>OMEGA OPERATIVE</small><span>{String(players.indexOf(spyPlayer!)+1).padStart(2,"0")}</span><h3>{spyPlayer!.name}</h3><p>{spyPlayer!.role.name}</p></article><article><small>CENTRAL TARGET</small><span>{String(target.id).padStart(2,"0")}</span><h3>{target.name}</h3><p>{target.english}</p><SymbolRow symbols={target.symbols} /></article><article><small>SABOTAGE STACK</small><span>{destroyed}</span><h3>/ 5</h3><p>최종 누적 공작</p></article></div><div className="all-hands">{players.map((player, index) => <div key={index}><b>{player.name}</b><span className={player.role.alignment}>{player.role.name}</span><p>{player.hand.map((card) => `${String(card.id).padStart(2,"0")} ${card.name}`).join(" · ")}</p></div>)}</div><button className="primary-cta" type="button" onClick={() => resetGame(true)}>새로운 임무 시작 <span>↗</span></button></section> : null}

    {manualOpen ? <Manual onClose={() => setManualOpen(false)} /> : null}
  </main>;
}
