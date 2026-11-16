# 오프라인·온라인 분리 배포 준비

외부 공개 배포는 아직 수행하지 않았다. 프런트엔드는 GitHub Pages용 정적 파일이며, 온라인 모드만 별도 Node.js/Socket.IO 서버가 필요하다. 서버가 없거나 연결되지 않아도 오프라인 2~4인 플레이와 `localStorage` 이어하기는 동작한다.

## 1. 권장 구성

- 프런트엔드: GitHub Pages + 수동 GitHub Actions 워크플로
- 현재 온라인 베타 백엔드: Render Free + 메모리 상태. 15분 절전과 재시작 시 방 소실을 허용하는 시험 운영 구성
- 이후 안정 운영: Railway Hobby + Volume 또는 Render 유료 인스턴스 + Persistent Disk
- 초기 운영은 반드시 단일 서버 인스턴스로 둔다. 현재 JSON 상태 파일은 다중 인스턴스 동시 쓰기를 지원하지 않는다.

2026-11-16 공식 문서 기준 비교:

| 선택지 | 비용·절전 | 저장소 | 이 프로젝트 적합성 |
|---|---|---|---|
| GitHub Pages | 공개 저장소의 GitHub Free에서 사용 가능, 월 100GB soft bandwidth | 정적 파일만 | 프런트엔드 권장 |
| Render Free | 15분 무트래픽 시 절전, 750시간/월 | 무료 서비스는 영구 디스크 불가 | 짧은 무료 체험만 |
| Railway Free | 월 $1 크레딧, 0.5GB Volume 한도 | Volume 가능 | 아주 적은 사용량 시험 |
| Railway Hobby | 최소 월 $5, $5 사용량 포함, Volume $0.15/GB·월 | Volume 가능 | 소규모 친구 플레이 권장 |
| Koyeb Free | 1시간 무트래픽 시 scale-to-zero, 512MB RAM/0.1 vCPU | Free Instance에 Volume 불가 | 무료 체험 대안 |
| Render Starter | 유료 인스턴스 + 디스크 비용 | Persistent Disk 가능 | 단일 인스턴스 안정 운영 대안 |

공식 근거: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Render Free](https://render.com/docs/free), [Render Persistent Disks](https://render.com/docs/disks), [Railway pricing](https://docs.railway.com/pricing/plans), [Koyeb instances](https://www.koyeb.com/docs/reference/instances). 가격과 정책은 가입 전에 다시 확인한다.

## 2. 프런트엔드 정적 빌드

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build:pages
```

배포 대상은 `dist/` 전체다. GitHub Pages 하위 경로에서도 자산을 찾도록 상대 경로로 빌드하며 `.nojekyll`을 포함한다. 백엔드가 `https://game-server.example`이면 빌드 시 설정한다.

```text
VITE_ONLINE_SERVER_URL=https://game-server.example
```

`.github/workflows/deploy-pages.yml`은 `workflow_dispatch` 수동 실행만 허용한다. 승인 후 `online_server_url`에 실제 HTTPS 서버 주소를 입력한다. 비우면 오프라인 게임은 정상 작동하고 온라인 연결만 사용할 수 없다.

## 3. Node.js 서버

```bash
pnpm install --frozen-lockfile
pnpm server
```

필수 운영 변수:

- `PORT`: 호스팅 플랫폼이 제공하는 포트
- `HOST=0.0.0.0`
- `ONLINE_ALLOWED_ORIGINS=https://사용자명.github.io`: 정확한 프런트엔드 origin. 경로나 끝 `/`는 넣지 않는다.
- `ONLINE_TRUST_PROXY=1`: 신뢰하는 플랫폼 TLS 프록시 뒤에서 실제 IP 기반 입장 속도 제한에 사용
- Render Free 베타: `ONLINE_DATA_FILE=:memory:`
- 유료 영속 운영: `ONLINE_DATA_FILE=/var/data/rooms.json`처럼 영구 볼륨 내부 경로

수명 주기는 `ONLINE_EMPTY_ROOM_TTL_MS`, `ONLINE_FINISHED_ROOM_TTL_MS`, `ONLINE_IDLE_ROOM_TTL_MS`, 정리 주기는 `ONLINE_CLEANUP_INTERVAL_MS`로 바꿀 수 있다.

HTTPS Pages에서는 혼합 콘텐츠 제한 때문에 서버도 HTTPS여야 한다. Render/Railway가 TLS를 종료하면 Socket.IO 클라이언트가 같은 HTTPS 주소를 WSS로 사용한다.

### Render

`render.yaml`은 이번 베타 목표에 맞춰 **Free Web Service + Singapore region + 메모리 상태**로 설정했다. 자동 배포는 꺼 두었고, `ONLINE_ALLOWED_ORIGINS`는 Blueprint 생성 화면에서 실제 GitHub Pages origin을 입력해야 한다. 무료 서비스는 15분 무트래픽 시 절전되며 깨어나는 데 약 1분이 걸릴 수 있다. 절전·재배포·재시작 시 진행 방과 재접속 상태는 사라질 수 있다.

### Railway

`railway.toml`과 `Dockerfile.server`를 사용한다. Dashboard에서 `/var/data` Volume을 연결하고 위 환경 변수를 넣는다. Hobby는 기본 월 $5이며 사용량 초과분이 추가될 수 있으므로 usage limit/알림을 설정한다.

## 4. 상태 검사와 복구

- `GET /health`: 프로세스 생존, uptime, 방/연결 수
- `GET /ready`: 모든 방의 구조 검증과 저장 방식. HTTP 503이면 트래픽을 보내지 않는다.
- `GET /metrics`: 처리 명령, 거부 수, 최대 개인화 상태 크기, 정리된 방 수

서버 재시작 시 WebSocket은 끊기지만 영구 JSON이 남아 있으면 브라우저의 재접속 토큰으로 같은 플레이어에 복귀한다. 무료 임시 파일 시스템에서는 이 복구가 불가능하다. 중요한 운영에서는 볼륨의 백업을 별도로 마련한다.

## 5. 배포 전 검증

```bash
pnpm test
pnpm test:online
pnpm test:soak
pnpm test:e2e
pnpm test:e2e:online
pnpm build:pages
pnpm test:pages
```

상세 승인 순서는 [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)를 따른다.

## 6. 승인 후 실제 배포 순서

1. 저장소를 GitHub에 올리고 비밀값이 커밋되지 않았는지 확인한다.
2. 백엔드 하나를 먼저 만들고 영구 Volume, 환경 변수, `/ready`를 확인한다.
3. 서버의 실제 HTTPS origin을 Pages 수동 워크플로 입력값으로 전달한다.
4. Pages origin을 서버 `ONLINE_ALLOWED_ORIGINS`에 정확히 등록하고 서버를 다시 시작한다.
5. 서로 다른 네트워크의 두 기기로 방 생성·참가·재접속을 확인한다.

이 문서와 설정 파일까지만 준비했으며 외부 공개 URL은 만들지 않았다.
