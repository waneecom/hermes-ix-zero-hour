import { useState, type ReactNode } from "react";

const minerals = [
  ["👁️", "센서 광물", "기록·탐지 계통"],
  ["🔑", "보안 광물", "출입·잠금 계통"],
  ["⚡", "전력 광물", "동력·회로 계통"],
  ["🧬", "생체 광물", "생명·치료 계통"],
  ["◈", "양자 광물", "연산·통신 계통"],
];

const institutions = [
  [1, "제1 메인 리액터실", "⚡ ⚡"], [2, "양자 연산 코어실", "👁️ ◈"], [3, "중력 제어 장치실", "⚡ ◈"],
  [4, "생명유지 산소실", "🧬 🧬"], [5, "서브 통신 중계탑", "👁️ ◈"], [6, "함교 항법 콘솔실", "🔑 ◈"],
  [7, "바이오 큐브 연구실", "👁️ 🧬"], [8, "비상 동력 배전반", "⚡ 🧬"], [9, "격벽 보안 통제실", "🔑 🔑"],
  [10, "센서 레이더 돔", "👁️ 👁️"], [11, "보조 플라즈마 추진실", "🔑 ⚡"], [12, "선외 탈출 포드실", "🔑 🧬"],
  [13, "암흑물질 차폐고", "👁️ ◈"],
] as const;

function RuleBlock({ title, children, tone = "normal" }: { title: string; children: ReactNode; tone?: "normal" | "warning" | "secret" }) {
  return <section className={`rule-block ${tone}`}><h3>{title}</h3>{children}</section>;
}

export default function GameManual({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const pages: Array<{ short: string; title: string; subtitle: string; body: ReactNode }> = [
    {
      short: "한눈에 보기", title: "임무와 승리 목표", subtitle: "처음이라면 이 페이지부터 읽으세요.",
      body: <>
        <p className="manual-lead">2497년, 우주선 헤르메스-IX에 인간인 척 숨어 지내던 휴머노이드가 파괴 공작을 시작했습니다. 네 명 중 세 명은 승무원이고 한 명은 스파이입니다. 서로의 화면은 보여 주지 마세요.</p>
        <div className="rule-two-columns">
          <RuleBlock title="승무원 3명의 목표"><p>조사 결과를 모아 <b>스파이가 누구인지</b>와 <b>파괴 목표 구역이 어디인지</b>를 모두 알아내세요. 자기 차례에 체포를 선언해 두 답을 모두 맞히면 즉시 승리합니다.</p></RuleBlock>
          <RuleBlock title="스파이 1명의 목표" tone="secret"><p>자기 화면에만 보이는 목표 구역을 공격하세요. 막히지 않은 파괴 공격을 <b>5번</b> 성공시키거나, 승무원이 잘못된 체포를 선언하면 즉시 승리합니다.</p></RuleBlock>
        </div>
        <RuleBlock title="가장 중요한 비밀 4가지" tone="warning"><ul><li>역할, 손에 든 위치 카드, 광물 수는 각자 자기 화면에만 보입니다.</li><li>파괴 목표 구역과 파괴 성공 횟수는 스파이 화면에만 보입니다.</li><li>보안 비밀 조회의 O/X는 보안 책임자 화면에만 보입니다.</li><li>기본 조사 결과는 네 명 모두에게 즉시 공개되며, 스파이도 거짓말할 수 없습니다.</li></ul></RuleBlock>
        <p className="manual-tip"><b>한 줄 요약:</b> 승무원은 공개 조사로 두 개의 정답을 찾고, 스파이는 들키기 전에 비밀 공격 5번을 성공시키는 게임입니다.</p>
      </>,
    },
    {
      short: "준비", title: "카드·광물·게임 준비", subtitle: "웹사이트가 섞기와 배분을 자동으로 처리합니다.",
      body: <>
        <RuleBlock title="카드는 정확히 17장입니다"><p><b>역할 카드 4장</b>은 수석 조종사, 수석 과학자, 보안 책임자, 기계 관리사(스파이)입니다. <b>위치 카드 13장</b> 중 1장은 중앙 파괴 목표가 되고, 나머지 12장은 네 명에게 3장씩 나뉩니다. 따라서 한 사람은 역할 1장과 위치 3장, 모두 4장을 갖습니다.</p></RuleBlock>
        <RuleBlock title="광물은 5종, 전체 30개입니다"><p>다섯 종류가 각각 정확히 6개씩 있습니다. 기관 카드 13장은 각 2개, 역할 카드 4장은 각 1개를 가집니다.</p><div className="manual-minerals">{minerals.map(([icon, name, text]) => <span key={name}><b>{icon}</b><strong>{name}</strong><small>{text}</small></span>)}</div><p className="rule-note">중앙 목표 카드에는 광물 2개가 있지만 누구도 그 카드를 손에 들지 않습니다. 따라서 네 사람의 카드 4장씩을 합치면 항상 28개가 보입니다.</p></RuleBlock>
        <RuleBlock title="기관별 광물은 영구 고정입니다" tone="secret"><p>아래 표는 모든 플레이어에게 공개됩니다. 파괴 목표도 이 13장 안에 있지만 어느 카드인지는 스파이만 압니다. 수십 번 게임해도 기관과 광물의 짝은 바뀌지 않습니다.</p><div className="manual-institution-grid">{institutions.map(([id, name, items]) => <span key={id}><b>{String(id).padStart(2, "0")}</b><strong>{name}</strong><small>{items}</small></span>)}</div></RuleBlock>
        <RuleBlock title="바뀌는 것과 바뀌지 않는 것"><p><b>매 게임 무작위:</b> 역할을 받는 사람, 중앙 파괴 목표 1장, 각자 받는 안전 기관 카드 3장, 카드가 화면에 나오는 순서.</p><p><b>항상 고정:</b> 기관별 광물, 역할별 광물, 전체 광물 30개.</p><p className="rule-note"><b>고정 역할 광물:</b> 조종사 ⚡ 1개 · 과학자 🧬 1개 · 보안 책임자 🔑 1개 · 스파이 ◈ 1개</p></RuleBlock>
        <RuleBlock title="온라인 방 시작 방법"><ol><li>한 명이 이름을 입력하고 방을 만듭니다.</li><li>화면에 나온 6자리 방 코드를 다른 세 명에게 알려 줍니다.</li><li>세 명은 각자 다른 기기에서 이름과 코드를 입력해 참가합니다.</li><li>정확히 4명이 모이면 방장이 게임 시작을 누릅니다.</li><li>각자 자기 역할·카드·광물을 확인하고 다른 사람에게 화면을 보여 주지 않습니다.</li></ol></RuleBlock>
      </>,
    },
    {
      short: "차례", title: "차례 진행과 2분 제한", subtitle: "한 사람씩 차례대로 행동하고, 네 명이 끝나면 판정합니다.",
      body: <>
        <RuleBlock title="라운드와 차례"><p>한 라운드에는 살아 있는 플레이어가 좌석 순서대로 한 번씩 행동합니다. 화면 위쪽에 지금 누구 차례인지 표시됩니다. 다른 사람 차례에는 기다리면서 공개 조사 기록을 살펴볼 수 있습니다.</p></RuleBlock>
        <RuleBlock title="내 차례에는 행동 하나만 선택합니다"><p>승무원은 <b>기본 조사</b>, 사용할 수 있는 <b>직업 능력</b>, 또는 <b>스파이 체포</b> 중 하나를 고릅니다. 보안 책임자는 직업 능력 대신 매 차례 <b>보안 비밀 조회</b>도 고를 수 있습니다. 스파이는 <b>파괴 공격</b>, <b>조용히 있기</b>, <b>역추적</b> 중 하나를 고릅니다.</p></RuleBlock>
        <RuleBlock title="한 사람에게 2분이 주어집니다" tone="warning"><p>남은 시간이 0이 되기 전에 행동과 필요한 질문을 모두 확정하세요. 시간이 끝나면 그 차례는 행동 없이 넘어갑니다. 기본 조사는 버튼만 누르는 것이 아니라, 광물·기준 개수·대상까지 정하고 제출해야 끝납니다.</p></RuleBlock>
        <RuleBlock title="결과가 나오는 때"><ul><li>기본 조사 O/X는 질문을 제출한 직후 바로 모두에게 보입니다.</li><li>보안 비밀 조회 O/X는 제출 직후 보안 책임자에게만 보입니다.</li><li>구역 잠그기, 현장 확인, 파괴 공격, 역추적은 네 명의 행동이 모두 끝난 뒤 함께 판정합니다.</li></ul></RuleBlock>
        <RuleBlock title="화면 왼쪽의 내 정보"><p>내 차례와 대기 화면에서 역할, 위치 카드 3장, 광물별 수, 광물 전체 합계를 다시 볼 수 있습니다. 스파이는 목표 구역과 파괴 성공 횟수도 같은 비밀 영역에서 확인합니다.</p></RuleBlock>
      </>,
    },
    {
      short: "기본 조사", title: "모두가 쓰는 기본 조사", subtitle: "스파이를 포함해 서버가 실제 카드 수로 답합니다.",
      body: <>
        <RuleBlock title="질문 만드는 공식"><p><b>광물 한 종류 + 기준 개수 + 조사 범위</b>를 고릅니다. 질문의 뜻은 항상 “이 광물을 기준 개수 이상 가지고 있는가?”입니다. O는 기준 이상, X는 기준보다 적다는 뜻입니다.</p><p className="rule-example">예: “민수는 센서 광물을 3개 이상 가지고 있는가?” → 실제로 3개나 4개면 O, 0~2개면 X입니다.</p></RuleBlock>
        <div className="rule-two-columns">
          <RuleBlock title="한 명 조사"><p>자신을 제외한 살아 있는 한 명을 고릅니다. 그 사람의 카드 4장에 있는 선택 광물 합계를 서버가 확인하고 O/X 하나를 즉시 공개합니다.</p></RuleBlock>
          <RuleBlock title="모두 조사"><p>살아 있는 모든 사람을 한꺼번에 확인합니다. 질문한 사람 자신과 스파이도 포함하며, 사람별 O/X가 즉시 공개됩니다.</p></RuleBlock>
        </div>
        <RuleBlock title="거짓말은 없습니다" tone="warning"><p>기본 조사에는 말로 대답하는 단계가 없습니다. 서버가 실제 카드 수를 계산하므로 승무원도 스파이도 답을 바꿀 수 없습니다. 예전 규칙의 “스파이는 전체 질문에서 거짓말 가능”은 사용하지 않습니다.</p></RuleBlock>
        <RuleBlock title="결과는 공유 기록에 남습니다"><p>누가, 몇 라운드에, 어떤 광물을, 몇 개 이상인지 물었는지와 모든 O/X가 네 사람 화면에 남습니다. 다른 사람의 조사를 기억하려고 따로 적지 않아도 됩니다.</p></RuleBlock>
        <RuleBlock title="좋은 질문 예시"><ul><li>처음에는 모두 조사로 2개 이상을 물어 전체 분포를 넓게 확인합니다.</li><li>다음에는 의심되는 사람에게 같은 광물을 3개 이상, 4개 이상으로 좁혀 실제 수의 범위를 찾습니다.</li><li>내 카드와 안전한 위치 카드 3장을 함께 보며 중앙 목표에 남을 수 있는 광물을 추리합니다.</li></ul></RuleBlock>
      </>,
    },
    {
      short: "승무원", title: "승무원 세 직업의 능력", subtitle: "조종사·과학자는 짝수 라운드, 보안은 매 차례 선택합니다.",
      body: <>
        <RuleBlock title="수석 조종사 — 구역 잠그기"><p>자신의 2·4·6번째 차례처럼 <b>짝수 라운드</b>에 13개 구역 중 하나를 잠급니다. 스파이의 목표와 같은 구역을 잠갔고 스파이가 그 라운드에 공격했다면 공격은 완전히 막혀 파괴 횟수가 늘지 않습니다.</p><ul><li>직전에 잠갔던 구역은 다음 능력 사용 때 연속으로 고를 수 없습니다.</li><li>능력을 쓸 수 있는 차례에도 원하지 않으면 기본 조사나 체포를 고를 수 있습니다.</li><li>스파이는 공격이 막혔다는 사실을 자기 비밀 기록에서 알게 됩니다.</li></ul></RuleBlock>
        <RuleBlock title="수석 과학자 — 현장 확인"><p>짝수 라운드에 구역 하나를 고릅니다. 스파이가 그 라운드에 파괴 공격을 했고, 고른 곳이 진짜 목표라면 <b>O</b>입니다. 그 외에는 <b>X</b>입니다.</p><ul><li>O가 나오면 스파이 카드 4장의 <b>광물 전체 합계</b>가 모두에게 공개됩니다.</li><li>목표 구역이 맞아도 스파이가 조용히 있었다면 X입니다.</li><li>조종사가 공격을 막았더라도 스파이가 목표를 공격했다면 현장 확인은 O가 됩니다.</li></ul></RuleBlock>
        <RuleBlock title="보안 책임자 — 보안 비밀 조회" tone="secret"><p>보안 책임자는 매 차례 <b>기본 조사, 보안 비밀 조회, 체포</b> 중 하나를 선택합니다. 조회에서는 광물 한 종류와 “몇 개 이상”을 정합니다. 서버가 스파이의 카드 4장을 확인해 O/X를 <b>보안 책임자 화면에만</b> 즉시 보여 줍니다.</p><ul><li>질문을 확정한 뒤에는 광물과 기준 개수를 바꿀 수 없습니다.</li><li>다른 플레이어에게 결과가 자동으로 공개되지 않습니다. 말로 나눌지는 보안 책임자가 판단합니다.</li><li>이 행동을 쓴 차례에는 기본 조사를 함께 할 수 없습니다.</li><li>화면의 비밀 결과 영역에서 마지막 조회 결과를 다시 확인할 수 있습니다.</li></ul></RuleBlock>
      </>,
    },
    {
      short: "스파이", title: "스파이의 목표와 세 행동", subtitle: "목표 구역과 파괴 횟수는 오직 스파이 화면에만 보입니다.",
      body: <>
        <RuleBlock title="비밀 정보" tone="secret"><p>기계 관리사는 사실 처음부터 승무원으로 잠복한 휴머노이드 스파이입니다. 게임이 시작되면 왼쪽 비밀 카드에 <b>파괴 목표 구역</b>과 <b>성공한 파괴 횟수 / 5</b>가 표시됩니다. 이 두 정보는 공개 방 데이터에서도 제외되어 승무원은 볼 수 없습니다.</p></RuleBlock>
        <RuleBlock title="1. 파괴 공격"><p>비밀 목표를 공격합니다. 같은 라운드 조종사의 잠금이 목표에 걸려 있으면 실패하고, 아니면 성공 횟수가 1 늘어납니다. 누적 5번 성공하면 즉시 스파이가 승리합니다. 성공 횟수는 게임이 끝나도 스파이 화면에만 숫자로 표시됩니다.</p></RuleBlock>
        <RuleBlock title="2. 조용히 있기"><p>이번 라운드에는 공격하지 않습니다. 파괴 횟수는 늘지 않지만 과학자의 현장 확인을 X로 만들 수 있습니다. 승무원이 목표를 알아낸 것 같을 때 공격 시점을 숨기는 데 사용합니다.</p></RuleBlock>
        <RuleBlock title="3. 역추적"><p>일반 행동 대신 <b>살아 있는 승무원 한 명</b>을 고르고, 그 사람이 손에 든 <b>안전 기관 카드 3장</b>을 모두 추측합니다.</p><ul><li>대상 플레이어와 기관 카드 세 장이 전부 맞으면 그 승무원은 즉시 탈락합니다.</li><li>카드를 고른 순서는 상관없지만 세 장 중 하나라도 틀리면 실패합니다.</li><li>실패하면 스파이의 이름과 좌석이 모두에게 공개됩니다.</li><li>광물 총합, 역할, 이번 라운드 직업 행동은 더 이상 맞히지 않습니다.</li></ul></RuleBlock>
        <p className="manual-tip">역추적에 성공해 모든 살아 있는 승무원이 사라지면 스파이가 승리합니다. 실패해 정체가 공개되어도 게임은 계속되므로 승무원은 목표 구역까지 맞혀 체포해야 합니다.</p>
      </>,
    },
    {
      short: "체포·승패", title: "체포 선언과 게임 종료", subtitle: "체포는 강력하지만 한 번의 실수가 바로 패배로 이어집니다.",
      body: <>
        <RuleBlock title="언제 체포할 수 있나요?"><p>살아 있는 승무원은 <b>자기 차례</b>라면 어느 라운드든 체포를 행동으로 선택할 수 있습니다. 정해진 별도 체포 단계는 없습니다. 스파이와 탈락한 승무원은 체포를 선언할 수 없습니다.</p></RuleBlock>
        <RuleBlock title="두 가지 답을 함께 고릅니다" tone="warning"><ol><li>스파이라고 생각하는 플레이어 한 명</li><li>스파이의 중앙 파괴 목표라고 생각하는 구역 한 곳</li></ol><p>확정 버튼을 누르면 취소하거나 답을 바꿀 수 없습니다.</p></RuleBlock>
        <div className="rule-two-columns"><RuleBlock title="둘 다 맞음"><p>스파이의 정체와 목표 구역이 모두 정확하면 승무원 3명이 즉시 승리합니다.</p></RuleBlock><RuleBlock title="하나라도 틀림" tone="warning"><p>사람 또는 구역 중 단 하나만 틀려도 내부 분열로 스파이가 즉시 승리합니다.</p></RuleBlock></div>
        <RuleBlock title="모든 승리 조건 정리"><ul><li><b>승무원 승리:</b> 정확한 스파이와 목표 구역을 함께 맞혀 체포.</li><li><b>스파이 승리:</b> 막히지 않은 파괴 공격 5번 성공.</li><li><b>스파이 승리:</b> 승무원이 잘못된 체포 선언.</li><li><b>스파이 승리:</b> 역추적으로 살아 있는 승무원을 모두 탈락시킴.</li></ul></RuleBlock>
        <RuleBlock title="게임 종료 화면"><p>스파이의 정체와 중앙 목표는 공개됩니다. 다만 파괴 성공 횟수 숫자는 비밀 규칙에 따라 스파이 화면에만 남고, 승무원 화면에는 “비공개”라고 표시됩니다.</p></RuleBlock>
      </>,
    },
    {
      short: "예시", title: "한 라운드를 실제로 따라가기", subtitle: "네 명이 어떤 순서로 보고 행동하는지 예로 확인하세요.",
      body: <>
        <RuleBlock title="상황"><p>2라운드입니다. 좌석 순서는 조종사 지우, 보안 책임자 민수, 과학자 소라, 스파이 유나입니다. 스파이의 목표는 04 산소실이지만 유나만 알고 있습니다. 파괴 성공 횟수도 유나만 봅니다.</p></RuleBlock>
        <div className="manual-timeline">
          <article><b>01</b><div><h3>지우 — 구역 잠그기</h3><p>짝수 라운드라 직업 능력을 사용할 수 있습니다. 지우는 04 산소실을 잠급니다. 아직 그곳이 목표인지는 모릅니다.</p></div></article>
          <article><b>02</b><div><h3>민수 — 보안 비밀 조회</h3><p>“스파이는 센서 광물을 3개 이상 가지고 있는가?”를 확정합니다. 민수 화면에만 O가 즉시 표시됩니다. 다른 세 명은 결과를 자동으로 볼 수 없습니다.</p></div></article>
          <article><b>03</b><div><h3>소라 — 현장 확인</h3><p>04 산소실을 고릅니다. 결과는 네 명의 행동이 끝날 때 판정됩니다.</p></div></article>
          <article><b>04</b><div><h3>유나 — 파괴 공격</h3><p>04 산소실을 공격하지만 지우가 같은 곳을 잠갔으므로 파괴 횟수는 늘지 않습니다. 유나는 “공격 차단”과 자신의 현재 횟수를 자기 화면에서만 확인합니다.</p></div></article>
          <article><b>05</b><div><h3>라운드 판정</h3><p>소라는 스파이가 진짜 목표를 공격했으므로 O를 얻고, 유나의 광물 전체 합계가 모두에게 공개됩니다. 파괴 횟수는 승무원에게 공개되지 않습니다.</p></div></article>
        </div>
        <RuleBlock title="다음 라운드에는"><p>방장이 다음 라운드를 시작합니다. 3라운드는 조종사와 과학자의 짝수 라운드 능력을 쓸 수 없으므로 두 사람은 기본 조사 또는 체포를 고릅니다. 보안 책임자는 다시 기본 조사·보안 비밀 조회·체포 중 하나를 고를 수 있습니다.</p></RuleBlock>
      </>,
    },
    {
      short: "체크·FAQ", title: "첫 게임 체크리스트와 자주 묻는 질문", subtitle: "시작 직전에 이 페이지만 함께 확인해도 됩니다.",
      body: <>
        <RuleBlock title="시작 전 9가지"><ol><li>정확히 4명이 각자 다른 기기로 같은 방에 들어왔나요?</li><li>공개 기관 도감 13장과 고정 광물을 확인했나요?</li><li>다른 사람에게 역할과 자기 카드 3장을 보여 주지 않았나요?</li><li>광물은 5종이고 전체 카드에 30개라는 것을 알았나요?</li><li>자기 차례는 2분이며 행동 하나만 고른다는 것을 알았나요?</li><li>기본 조사 결과는 즉시 공개되고 누구도 거짓말할 수 없다는 것을 알았나요?</li><li>보안 비밀 조회 결과는 보안 책임자에게만 보인다는 것을 알았나요?</li><li>목표와 파괴 횟수는 스파이에게만 보인다는 것을 알았나요?</li><li>체포는 사람과 구역을 둘 다 맞혀야 한다는 것을 알았나요?</li></ol></RuleBlock>
        <RuleBlock title="O와 X는 무슨 뜻인가요?"><p>광물 질문에서 O는 선택한 광물을 기준 개수 이상 갖고 있다는 뜻이고 X는 그보다 적다는 뜻입니다. 과학자 화면의 O는 스파이가 이번 라운드에 과학자가 고른 진짜 목표를 공격했다는 뜻입니다.</p></RuleBlock>
        <RuleBlock title="스파이가 기본 조사에서 거짓말할 수 있나요?"><p>아니요. 한 명 조사와 모두 조사 모두 서버가 실제 카드로 계산합니다. 스파이도 항상 진짜 O/X가 나옵니다.</p></RuleBlock>
        <RuleBlock title="파괴 횟수가 왜 안 보이나요?"><p>정상입니다. 숫자는 스파이의 비밀 정보입니다. 승무원은 공격이 몇 번 성공했는지 모르는 긴장 속에서 조사와 체포 시점을 판단해야 합니다.</p></RuleBlock>
        <RuleBlock title="접속이 잠깐 끊기면 어떻게 하나요?"><p>같은 브라우저로 다시 접속하면 저장된 방 정보를 이용해 돌아올 수 있습니다. 화면이 멈춘 것 같으면 새로고침하세요. 2분 제한은 서버 시간 기준이라 접속이 끊긴 동안에도 계속 흐릅니다.</p></RuleBlock>
        <RuleBlock title="현재 밸런스는 어떤가요?"><p>고정 기관 도감 덕분에 승무원은 목표를 논리적으로 좁히기 쉬워졌지만, 스파이도 공개 조사 결과로 상대의 카드 조합을 추리해 역추적할 수 있습니다. 역추적은 세 장을 모두 맞혀야 해 초반에는 어렵고 후반에 강해지는 보조 수단입니다. 현재 예상은 <b>승무원 약간 우세</b>이며, 먼저 10경기 정도 기록한 뒤 스파이 승률이 35% 아래면 파괴 승리 기준을 5회에서 4회로 낮추는 조정이 좋습니다.</p></RuleBlock>
        <RuleBlock title="이전 규칙 방이라는 안내가 나와요"><p>규칙 4.3 이전에 만든 방입니다. 카드 구성과 역추적 판정이 다르므로 그 방에서 나간 뒤 새 방을 만들어야 합니다.</p></RuleBlock>
      </>,
    },
  ];

  const current = pages[page];
  const go = (next: number) => setPage(Math.max(0, Math.min(pages.length - 1, next)));

  return <div className="manual-backdrop" role="dialog" aria-modal="true" aria-label="온라인 게임 규칙 설명">
    <section className="manual-panel updated-manual paged-manual">
      <header><div><p className="eyebrow">ONLINE RULES 4.3 · PAGE {String(page + 1).padStart(2, "0")}/{String(pages.length).padStart(2, "0")}</p><h2>{current.title}</h2><p>{current.subtitle}</p></div><button type="button" onClick={onClose} aria-label="닫기">×</button></header>
      <nav className="manual-page-tabs" aria-label="룰북 페이지">{pages.map((item, index) => <button type="button" className={index === page ? "active" : ""} onClick={() => go(index)} aria-current={index === page ? "page" : undefined} key={item.short}><b>{String(index + 1).padStart(2, "0")}</b><span>{item.short}</span></button>)}</nav>
      <div className="manual-content manual-book-page">{current.body}</div>
      <footer className="manual-page-footer"><button type="button" disabled={page === 0} onClick={() => go(page - 1)}>← 이전</button><span><b>{page + 1}</b> / {pages.length}</span>{page === pages.length - 1 ? <button type="button" className="complete" onClick={onClose}>읽기 완료</button> : <button type="button" onClick={() => go(page + 1)}>다음 →</button>}</footer>
    </section>
  </div>;
}
