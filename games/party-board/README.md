# 별빛 대소동 / Party Board

Game Hub 안에서 독립 실행되는 온라인 4인용 파티 보드게임입니다. 프론트엔드는 기존 Vite·GitHub Pages 구조에 포함되고, 방·플레이어·게임 상태의 authoritative source는 Supabase입니다.

## 현재 구현 범위

- 6자리 방 생성·참여 RPC
- 4인 로비, Presence, 같은 브라우저 재접속
- 중복 없는 4캐릭터 선택과 방장 시작/저장
- 60칸 보드, 같은 종류 간 거리, 상점 20칸 간격, 4개 갈래길 생성 및 검증
- 글로벌 60턴 milestone과 누적 월급 규칙
- Three.js 로우폴리 3D 보드, 4개 입체 갈래길, 4종 지오메트리 캐릭터
- `idle → anticipation → move → slow down → stop → reaction → idle` 이동 연출과 12칸 초과 빠른 이동
- 갈림길 정지·경로 선택, 도착 칸 강조, 코인/별/아이템/보호권 연출 구조
- 6턴 미니게임 placeholder가 들어갈 게임 화면

현재 3D 화면의 이동 버튼은 렌더링 검증용 로컬 미리보기이며 Supabase 상태를 바꾸지 않습니다. 주사위·이동·갈림길 명령의 authoritative 서버 판정은 다음 PHASE 1 슬라이스입니다. 클라이언트는 확정된 state의 표현만 담당하며, 게임 결과를 직접 저장하지 않습니다.

개발 중 전체 3D 게임 HUD와 이동 연출만 바로 확인하려면 `http://localhost:5173/games/party-board/?board3d=1`을 사용합니다. 이 미리보기 분기는 개발 빌드에서만 활성화됩니다.

## Supabase 연결 시점

1. Supabase 프로젝트를 만든 뒤 Anonymous Sign-ins를 활성화합니다.
2. `supabase/migrations/202608260001_phase1_rooms.sql`을 적용합니다.
3. 프로젝트 루트의 로컬 `.env.local`에 아래 두 값을 넣습니다. 실제 secret/service-role key는 프론트엔드에 절대 넣지 않습니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

4. Realtime의 database changes가 활성화됐는지 확인합니다. migration이 두 Phase 1 테이블을 `supabase_realtime` publication에 추가합니다.

처음 연결하는 사람을 위한 화면별 절차와 4인 테스트 순서는 `docs/supabase-setup.ko.md`에 정리되어 있습니다. 실제 값은 루트 `.env.example`이 아니라 새로 만드는 `.env.local`에만 입력합니다.

## PHASE 게이트

현재 작업 범위는 PHASE 1입니다. 실제 Supabase 프로젝트에서 방 생성·참여·Presence·같은 기기 재접속 검증이 모두 통과하기 전에는 PHASE 2 미니게임 구현을 시작하지 않습니다.

## 검증

```bash
pnpm test:party-board
pnpm check
pnpm build
```
