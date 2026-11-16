# 공개 배포 승인 체크리스트

## 승인 전

- [ ] 실제 공개 배포와 유료 플랜 사용을 소유자가 승인했다.
- [ ] 선택한 플랫폼의 현재 가격, 카드 요구 여부, 지출 한도를 다시 확인했다.
- [ ] `.env`, 방 상태 JSON, 재접속 토큰이 Git에 포함되지 않았다.
- [ ] `pnpm test`, `pnpm test:online`, `pnpm test:soak`, 두 Playwright 묶음, `pnpm build:pages`, `pnpm test:pages`가 통과했다.

## 서버

- [ ] 단일 인스턴스로 설정했다.
- [ ] `HOST=0.0.0.0`, 플랫폼 `PORT`, `ONLINE_TRUST_PROXY=1`을 설정했다.
- [ ] `ONLINE_ALLOWED_ORIGINS`에 정확한 Pages origin만 넣었다.
- [ ] Render Free 베타이면 `ONLINE_DATA_FILE=:memory:`이며 재시작 시 방 소실 안내를 확인했다.
- [ ] 유료 영속 운영으로 전환할 때만 Volume과 `ONLINE_DATA_FILE=/var/data/rooms.json`을 설정했다.
- [ ] `/health`가 200이고 `/ready`의 `ok`가 `true`다.
- [ ] 비밀번호가 로그나 상태 응답에 나타나지 않는다.

## 프런트엔드

- [ ] `VITE_ONLINE_SERVER_URL`이 실제 HTTPS 서버 주소다.
- [ ] GitHub Pages Source를 GitHub Actions로 설정했다.
- [ ] 수동 `Deploy static game to GitHub Pages` 워크플로를 승인 후 실행했다.
- [ ] 오프라인 모드는 서버 차단 상태에서도 시작된다.

## 실제 기기 검증

- [ ] PC와 스마트폰에서 같은 방에 참가했다.
- [ ] 비밀번호, 방장 승인, 강퇴, 방장 이전이 동작한다.
- [ ] 새로고침·일시 단절 뒤 같은 플레이어로 복귀한다.
- [ ] 게임 중 새 참가를 거부한다.
- [ ] 1라운드 증강 선택, 윷 던지기, 이동이 두 화면에 동일하게 보인다.
- [ ] Render Free에서는 재시작 후 진행 방 복원이 보장되지 않음을 실제 사용자에게 안내했다.

## 운영

- [ ] 비용 알림 또는 지출 한도를 설정했다.
- [ ] 상태 JSON/Volume 백업 방법을 정했다.
- [ ] 장애 시 프런트엔드의 온라인 기능만 중단되고 오프라인은 유지되는지 확인했다.
- [ ] 다중 인스턴스는 Redis/DB + Socket.IO adapter를 구현하기 전까지 활성화하지 않는다.
