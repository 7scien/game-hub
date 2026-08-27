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
- 업적 3종 공개와 보너스 별 재계산, 공동 우승을 지원하는 최종 우승 화면 프로토타입

현재 3D 화면의 이동·미니게임·최종 우승 버튼은 렌더링 검증용 로컬 미리보기이며 Supabase 상태를 바꾸지 않습니다. 주사위·이동·경로 선택 명령과 미니게임 READY·점수·보상·업적의 authoritative 서버 판정은 후속 온라인 슬라이스입니다. 클라이언트는 최종적으로 서버에서 확정된 state의 표현만 담당합니다.

개발 중 3D 게임 HUD와 추적 이동을 바로 확인하려면 `http://localhost:5173/games/party-board/?board3d=1`을 사용합니다. 기본 시점은 항상 플레이어 추적이며, 이 개발 화면에서만 전체 보드 디버그 시점으로 전환할 수 있습니다. 미리보기 분기는 개발 빌드에서만 활성화됩니다.

- 미니게임 전환 바로 보기: `?board3d=1&show=minigame`
- 최종 우승 연출 바로 보기: `?board3d=1&show=finale`

## Supabase 연결 시점

1. Supabase 프로젝트를 만든 뒤 Anonymous Sign-ins를 활성화합니다.
2. `supabase/migrations/202608260001_phase1_rooms.sql`을 적용합니다.
   기존 프로젝트에 첫 migration을 이미 적용했다면 `supabase/migrations/202608270001_harbor_village_board.sql`과 `supabase/migrations/202608270002_curved_harbor_board.sql`도 순서대로 적용합니다. 마지막 migration은 새로 만드는 방의 저장 보드를 곡선형 항구 마을 v2로 맞추며, 기존 방 데이터는 덮어쓰지 않습니다.
3. 프로젝트 루트의 로컬 `.env.local`에 아래 두 값을 넣습니다. 실제 secret/service-role key는 프론트엔드에 절대 넣지 않습니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

4. Realtime의 database changes가 활성화됐는지 확인합니다. migration이 두 Phase 1 테이블을 `supabase_realtime` publication에 추가합니다.

처음 연결하는 사람을 위한 화면별 절차와 4인 테스트 순서는 `docs/supabase-setup.ko.md`에 정리되어 있습니다. 실제 값은 루트 `.env.example`이 아니라 새로 만드는 `.env.local`에만 입력합니다.

## PHASE 게이트

현재 작업 범위는 PHASE 1의 3D 플레이 인터페이스와 전환 연출 프로토타입입니다. 실제 Supabase 프로젝트에서 방 생성·참여·Presence·같은 기기 재접속 검증이 모두 통과하기 전에는 나머지 미니게임 8종이나 아이템 규칙 확장을 시작하지 않습니다.

## 검증

```bash
pnpm test:party-board
pnpm check
pnpm build
```
