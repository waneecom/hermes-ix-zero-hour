# HERMES-IX: ZERO HOUR

4명이 각자의 휴대폰이나 PC에서 같은 방에 접속해 플레이하는 SF 비밀 추리 보드게임입니다. 한 기기를 돌려 쓰는 핫시트 모드도 함께 제공합니다.

온라인 모드는 방장이 6자리 방 코드를 만들고 나머지 3명이 참가합니다. 역할·손패·비공개 판정은 본인 화면에만 나타나며, 공개 진행 상황은 Supabase Realtime으로 동기화됩니다.

## 기술 구성

- React 19 + TypeScript + Vite
- Supabase Auth 익명 세션
- Supabase Postgres + Realtime 온라인 방 상태
- 인증된 Edge Function의 서버 판정
- 멤버 전용 RLS와 브라우저 접근이 차단된 비밀정보 테이블

## 로컬 실행

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`에 Supabase 프로젝트 URL과 publishable key를 넣습니다. 이 파일은 Git에 커밋되지 않습니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Supabase Dashboard의 **Authentication → Sign In / Providers → Anonymous Sign-Ins**를 활성화해야 방 생성과 참가가 작동합니다. 익명 사용자도 `authenticated` 역할을 사용합니다.

## 온라인 4인 플레이

1. 네 사람이 동일한 배포 주소를 각자 엽니다.
2. 방장이 **온라인 4인 방 → 새 작전실 생성**을 누릅니다.
3. 화면의 6자리 코드를 나머지 3명이 입력합니다.
4. `4/4`가 표시되면 방장이 **4인 임무 시작**을 누릅니다.
5. 각자 자기 화면에서만 역할·안전 구역 카드·직무 행동을 확인합니다.

실시간 이벤트가 잠시 끊겨도 5초 간격 자동 동기화가 보조합니다. 브라우저 탭을 새로 열어도 같은 익명 세션이면 진행 중인 방을 복원합니다.

## 데이터베이스

재현 가능한 SQL은 `supabase/migrations`에 있습니다.

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy hermes-room
```

`SUPABASE_SERVICE_ROLE_KEY`는 Supabase Edge Function의 서버 환경에서만 사용됩니다. 브라우저나 Vercel 환경 변수에는 service-role key를 절대 넣지 마십시오.

## 검증

```powershell
npm run build
npm test
npm run lint
```

## 핵심 추가 룰

- 조종사는 직전 라운드와 같은 구역을 연속 락다운할 수 없습니다.
- 락다운은 다음 조종사 턴 전까지 유지되고, 막힌 스파이는 즉시 차단 사실을 확인합니다.
- 스파이는 일반 행동 대신 역저격을 선언할 수 있습니다.
- 조종사·과학자 저격은 대상의 총 심볼 수와 이번 직무 구역을 모두 맞혀야 합니다.
- 보안 책임자 저격은 총 심볼 수와 직전 기밀 조회 아이템을 모두 맞혀야 하며, 실제 조회가 없으면 적중할 수 없습니다.
- 역저격 실패 시 스파이 정체가 전원에게 공개됩니다.
- 탈락자는 이후 행동·심문·방송·체포 순서에서 제외됩니다.

## GitHub 업로드

```powershell
git remote add origin https://github.com/YOUR_ACCOUNT/hermes-ix-zero-hour.git
git push -u origin main
```

Vercel 같은 배포 서비스에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 두 환경 변수만 등록하면 됩니다. GitHub에 push하면 연결된 Vercel 프로젝트가 자동으로 다시 배포되도록 설정할 수 있습니다.
