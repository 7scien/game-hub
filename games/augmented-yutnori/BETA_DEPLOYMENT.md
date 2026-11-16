# GitHub Pages + Render Free 베타 배포 순서

외부 저장소 생성, 코드 업로드, Render 서비스 생성, Pages 공개는 소유자의 승인을 받은 뒤 진행한다.

## 현재 준비 상태

- Vite `base: "./"`로 Pages 저장소 하위 경로 지원
- `.github/workflows/deploy-pages.yml`은 수동 실행만 허용
- `render.yaml`은 Free Web Service, Singapore region, `/ready` 상태 검사, 수동 배포 구성
- Render Free 상태는 `ONLINE_DATA_FILE=:memory:`이며 영속성을 표시하지 않음
- UI에 절전, cold start, 재시작 시 방 소실 안내 포함
- 오프라인 단일 HTML은 `dist/augmented-yutnori.html`로 별도 제공

## 1. GitHub 저장소

권장 저장소 이름: `augmented-yutnori`

1. 새 **public** GitHub 저장소를 만든다. Pages를 private 저장소에서 사용하려면 유료 GitHub 플랜이 필요할 수 있다.
2. 현재 로컬 `main` 브랜치를 원격 저장소에 push한다.
3. 저장소 `Settings → Pages → Source`를 `GitHub Actions`로 설정한다.
4. 아직 Pages 워크플로는 실행하지 않는다. 먼저 Render URL을 만든다.

예상 Pages URL 형식:

```text
https://GITHUB_ID.github.io/augmented-yutnori/
```

서버 CORS에 넣는 origin에는 저장소 경로를 넣지 않는다.

```text
https://GITHUB_ID.github.io
```

## 2. Render Blueprint

1. Render에서 `New → Blueprint`를 선택한다.
2. 위 GitHub 저장소를 연결하고 루트의 `render.yaml`을 선택한다.
3. `ONLINE_ALLOWED_ORIGINS` 입력 요청에 정확한 Pages origin을 넣는다.
4. Free 플랜과 Persistent Disk 없음, `ONLINE_DATA_FILE=:memory:`를 다시 확인한다.
5. Blueprint를 적용해 첫 배포를 시작한다.
6. 배포가 끝나면 다음을 확인한다.

```text
https://RENDER_SERVICE.onrender.com/health
https://RENDER_SERVICE.onrender.com/ready
```

`/ready` 응답의 `ok`는 `true`, `persistence`는 `memory`여야 한다.

## 3. GitHub Pages

1. GitHub `Actions → Deploy static game to GitHub Pages → Run workflow`를 연다.
2. `online_server_url`에 Render의 실제 HTTPS URL을 넣는다. 끝의 `/`는 생략한다.
3. 워크플로 성공 후 Pages URL을 연다.
4. 개발자 도구의 mixed-content/CORS 오류와 CSS·이미지 404가 없는지 확인한다.

## 4. 실제 베타 점검

- PC와 스마트폰에서 Pages URL 접속
- 오프라인 게임 시작
- 첫 온라인 접속 시 cold start 안내 확인
- 비밀번호·승인 방 생성, 코드 참가
- 2인/4인 준비와 게임 시작
- 증강 선택, 윷 던지기, 말 이동 동기화
- 새로고침 재접속
- 게임 종료 후 다시 플레이
- Render를 수동 재시작한 뒤 이전 방이 사라질 수 있음을 확인

## 무료 플랜 주의사항

- 15분간 HTTP 요청과 WebSocket 메시지가 없으면 절전
- 다음 연결에서 깨어나는 데 약 1분 가능
- 로컬 파일 시스템은 임시이며 절전·재배포·재시작 때 소실
- 진행 중 게임 복원을 보장하지 않음
- 무료 사용량/대역폭을 초과하면 서비스가 일시 중단될 수 있음

공식 문서:

- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
