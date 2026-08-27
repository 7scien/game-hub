# 별빛 대소동 / Party Board

Game Hub 안에서 독립 실행되는 온라인 4인용 파티 보드게임입니다. 프론트엔드는 기존 Vite·GitHub Pages 구조에 포함되고, 방·플레이어·게임 상태의 authoritative source는 Supabase입니다.

## 현재 구현 범위

- 6자리 방 생성·참여 RPC
- 4인 로비, Presence, 같은 브라우저 재접속
- 중복 없는 4캐릭터 선택과 방장 시작/저장
- 사용자가 그린 경로의 흐름을 항구 마을로 재해석한 곡선형 보드(큰 외곽 순환, 중앙 마을길, 상단 부두 반원길, 정원 S지름길, 해변 마을고리)
- 글로벌 60턴 milestone과 누적 월급 규칙
- 밝은 회백색 석재 판석, 매립형 원형 칸, 낮은 옹벽·잔디·관목·수로로 구성한 Three.js 로우폴리 3D 보드
- 기존보다 약 22% 넓어진 항구 마을 스케일과 1.4 이상의 칸 중심 간격 검증으로 경로·칸 겹침 방지
- 큰길과 실제 geometry로 연결되는 중앙 마을길·부두 반원길·정원 S지름길·해변 마을고리
- 현재 캐릭터 뒤·위에서 길을 바라보며 부드럽게 회전하는 3인칭 추적 카메라
- arc-length로 균일 배치한 Catmull-Rom spline을 따르는 `idle → anticipation → move → slow down → stop → reaction → idle` 이동과 12칸 초과 walk → run 전환
- 갈림길 정지 시 두 경로를 함께 보여주는 카메라, 도착 줌인, 코인/별/아이템/보호권 연출 구조
- 색상과 매립형 로고를 함께 쓰는 일반·특수·이벤트·함정·상점·별·동료 칸 아이콘 시스템
- 별→코인 순위의 4인 HUD와 현재 플레이어 전용 6칸 인벤토리 바
- `board → reveal → briefing → countdown → playing → results → returning` 미니게임 전환 프레임워크
- 터치·마우스로 별빛을 포착하는 독립 Three.js 테스트 경기장 1종과 40코인 분배 규칙
- 6턴 간격의 서버 미니게임 생성, 4인 READY, 서버 `startAt` 기반 카운트다운과 재접속 복구
- Realtime Broadcast의 저지연 점수 표시와 서버가 검증·집계하는 개별 포착 이벤트
- `MINIGAME_RESULT → REWARD_APPLIED → RETURNING_TO_BOARD → BOARD` 권위 상태 전환
- action ID와 `rewardApplied`를 함께 사용하는 40코인 1회 지급, 우승자의 `minigameWins` 누적
- 업적 3종 공개와 보너스 별 재계산, 공동 우승을 지원하는 최종 우승 화면 프로토타입

실제 온라인 방에서는 현재 플레이어가 `온라인 턴 완료`를 눌러 서버 턴 경계를 확정합니다. 글로벌 턴 6·12·18·24·30·36·42·48·54의 종료 경계에서는 테스트 미니게임이 자동 생성되며, 네 클라이언트는 서버에서 확정한 같은 미니게임 상태만 표현합니다. 개발용 `미니게임 연출`과 `최종 우승 연출` 버튼은 기존 독립 미리보기로 유지됩니다.

개발 중 3D 게임 HUD와 추적 이동을 바로 확인하려면 `http://localhost:5173/games/party-board/?board3d=1`을 사용합니다. 기본 시점은 항상 플레이어 추적이며, 이 개발 화면에서만 전체 보드 디버그 시점으로 전환할 수 있습니다. 미리보기 분기는 개발 빌드에서만 활성화됩니다.

- 미니게임 전환 바로 보기: `?board3d=1&show=minigame`
- 최종 우승 연출 바로 보기: `?board3d=1&show=finale`

## Supabase 연결 시점

1. Supabase 프로젝트를 만든 뒤 Anonymous Sign-ins를 활성화합니다.
2. `supabase/migrations/202608260001_phase1_rooms.sql`을 적용합니다.
   기존 프로젝트에 첫 migration을 이미 적용했다면 `supabase/migrations/202608270001_harbor_village_board.sql`, `supabase/migrations/202608270002_curved_harbor_board.sql`, `supabase/migrations/202608270003_online_minigame.sql`을 순서대로 적용합니다. 마지막 migration은 미니게임 입력 이벤트 테이블과 턴·READY·결과·보상·복귀 RPC를 추가하며 기존 방 상태를 덮어쓰지 않습니다.
3. 프로젝트 루트의 로컬 `.env.local`에 아래 두 값을 넣습니다. 실제 secret/service-role key는 프론트엔드에 절대 넣지 않습니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

4. Realtime의 database changes가 활성화됐는지 확인합니다. migration이 두 Phase 1 테이블을 `supabase_realtime` publication에 추가합니다.

처음 연결하는 사람을 위한 화면별 절차와 4인 테스트 순서는 `docs/supabase-setup.ko.md`에 정리되어 있습니다. 실제 값은 루트 `.env.example`이 아니라 새로 만드는 `.env.local`에만 입력합니다.

로컬 한 브라우저에서 서로 다른 익명 세션 네 개를 검증할 때는 개발 전용 `profile` 값을 사용합니다.

- `?profile=p1`
- `?profile=p2`
- `?profile=p3`
- `?profile=p4`

이 값은 개발 빌드에서만 Supabase Auth 저장 키를 분리하며 운영 빌드의 로그인 구조에는 영향을 주지 않습니다.

## PHASE 게이트

현재 작업 범위는 테스트 미니게임 1종의 온라인 권위 파이프라인까지입니다. 실제 Supabase 프로젝트에서 4인 READY·플레이·결과·1회 보상·보드 복귀·재접속 검증이 모두 통과하기 전에는 나머지 미니게임 8종이나 아이템 규칙 확장을 시작하지 않습니다.

## 검증

```bash
pnpm test:party-board
pnpm check
pnpm build
```
