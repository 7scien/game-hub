# PHASE 1 구현 계획

PHASE 1은 한 번에 넓게 구현하지 않고 아래 종료 조건을 순서대로 통과한다. 각 슬라이스는 이전 단계의 상태 형식과 테스트를 깨뜨리지 않아야 한다.

## 0. 독립 모듈과 계약 기반 — 완료

- 기존 Game Hub와 분리된 HTML/React 진입점
- Supabase publishable 설정과 익명 세션 연결 계층
- 방·플레이어·action log 스키마, RLS, 방 RPC migration
- 60칸 및 네 갈래길 생성/검증, 글로벌 턴 milestone
- 캐릭터 DOM과 공통 motion state 구조
- 전체 요구사항 원문과 결정 기록 보존

종료 조건: 기존 게임 전체 테스트, 750개 보드 seed, Pages 하위 경로, Sites build 통과.

## 1. 실제 Supabase 통합 검증

- 사용자가 만든 Supabase 프로젝트에 migration 적용
- Anonymous Sign-ins와 Realtime publication 확인
- 브라우저 네 개로 create/join, 4 Presence, 캐릭터 동기화 확인
- 새로고침·일시 단절·같은 브라우저 재접속 검증
- 방장 저장/종료 후 네 명이 같은 state version으로 복귀하는지 검증

종료 조건: DB/RPC/RLS를 실제 프로젝트에서 통합 테스트하고 비회원이 방 row를 읽거나 변경할 수 없음을 확인.

## 2. Authoritative command engine

- 클라이언트는 `action_id`, 예상 `state_version`, 명령 payload만 제출
- 서버는 현재 플레이어·phase·version을 잠근 상태에서 검증
- 주사위 두 개와 이후 모든 RNG를 서버에서 생성
- 하나의 transaction에서 action log와 다음 game state를 함께 확정
- 중복 action id는 기존 결과를 반환해 재시도에도 두 번 적용되지 않게 함

종료 조건: 동시에 같은 명령을 보내도 한 번만 반영되고 네 화면이 같은 주사위·턴·상태 버전을 수신.

## 3. 경로 이동과 갈림길

- 서버가 확정한 주사위 합을 movement plan으로 변환
- split 도착까지 한 칸씩 재생한 뒤 `awaiting_branch_choice`로 정지
- 현재 플레이어의 선택만 서버가 수락하고 남은 이동을 새 plan으로 확정
- 정규길 복귀, 시작선 통과, 개인 완주 횟수와 10/20/30… 코인 월급 반영
- 12칸 초과 plan은 걷기 → 빠른 이동 → 감속 → 정지 구간으로 표현

종료 조건: 갈림길 전후 path와 잔여 이동 수가 서버·네 클라이언트에서 일치하며 새로고침 중에도 현재 animation queue를 재구성.

## 4. PHASE 1 게임 루프

- 20코인·별 0·6칸 빈 인벤토리 초기 상태
- 1–60 글로벌 턴과 고정 turn order
- 6턴마다 보상 없는 미니게임 placeholder 후 다음 턴 복귀
- 9턴 뒤 일반칸 star overlay 생성 구조
- 코인·별·인벤토리 field와 state migration/version 검증
- 60번째 칸 효과 완료 뒤 결과 placeholder로 종료

종료 조건: 60턴을 자동 시뮬레이션해 6턴/9턴/60턴 경계가 정확하고 저장/복귀 후 같은 결과가 이어짐.

## 5. 캐릭터 이동 표현

- `idle → anticipation → action → reaction → idle` 공통 state machine
- 유령 float, 두더지 run/dig, 병아리 quick-step, 슬라임 squash/stretch locomotion
- 코인·별·아이템 obtain/use 오브젝트 슬롯
- 서버 state 적용과 animation 재생을 분리해 늦게 접속한 클라이언트가 연출 때문에 상태 확정을 막지 않게 함
- reduced-motion 접근성 모드

종료 조건: 네 캐릭터가 path를 순간이동 없이 재생하고 animation 완료 실패가 다음 authoritative turn을 막지 않음.

## 6. PHASE 1 안정화 게이트

- 4개 실제 브라우저의 60턴 장시간 테스트
- 현재 플레이어 이탈·복귀, 비현재 플레이어 이탈·복귀, 방장 이탈 시나리오
- 느린 네트워크·중복 전송·순서가 뒤바뀐 응답·탭 백그라운드 복귀
- RLS/명령 권한 테스트와 state schema 호환성 테스트
- 기존 Game Hub 전체 회귀 테스트와 배포 빌드

이 게이트를 모두 통과하고 사용자 확인을 받은 뒤에만 PHASE 2 미니게임 구현을 시작한다.
