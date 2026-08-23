# HERMES-IX: ZERO HOUR

4명이 한 기기를 차례로 넘겨 플레이하는 SF 비밀 추리 보드게임입니다. 17장 카드 배분, 13개 타깃 후보, 비공개 직무 행동, 락다운 쿨다운과 스파이 역저격을 웹 앱으로 구현했습니다.

## 기술 구성

- React 19 + TypeScript + Vite
- Supabase Auth 익명 세션
- Supabase Postgres `hermes_ix_games` 저장 테이블
- 소유자 전용 Row Level Security(RLS)

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

Supabase Dashboard의 **Authentication → Providers → Anonymous Sign-Ins**를 활성화해야 클라우드 저장이 작동합니다. 익명 사용자도 `authenticated` 역할을 사용하며, 각 저장 데이터는 `owner_id = auth.uid()` RLS 정책으로 격리됩니다.

## 데이터베이스

재현 가능한 SQL은 `supabase/migrations`에 있습니다.

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

브라우저에는 service-role key를 절대 넣지 마십시오.

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

배포 서비스에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 두 환경 변수만 등록하면 됩니다.
