# Game Hub

한 번 PWA로 설치한 뒤 여러 로컬 웹게임을 실행하는 정적 Game Hub입니다. 모든 주소는 저장소 하위 경로에서도 동작하도록 상대경로를 사용하며, GitHub Pages 배포 워크플로를 포함합니다.

## 현재 게임

- `games/duo-party/` — DUO PARTY / Push Arena (vanilla JavaScript)
- `games/catan/` — Catan (독립 React 진입점, 기존 게임 규칙과 UI 재사용)
- `games/hexo/` — HeXO 원본 소스 연결을 기다리는 독립 슬롯

각 게임은 별도의 HTML 진입점을 가지므로 한 게임의 런타임 오류가 허브나 다른 게임에 전파되지 않습니다. `shared/game-shell.js`가 각 게임에 공통 홈 버튼을 제공합니다.

## 로컬 실행

Node.js 22.13 이상과 pnpm 11이 필요합니다.

```bash
pnpm install
pnpm dev
```

화면에 표시되는 Local 또는 Network 주소를 엽니다. PWA 설치와 서비스 워커는 HTTPS 또는 localhost에서 확인할 수 있습니다.

```bash
pnpm check
pnpm test
```

`pnpm test`는 게임 상태 테스트 뒤 배포 빌드와 GitHub Pages 하위 경로 테스트까지 실행합니다. GitHub Pages에 올라가는 완성 정적 사이트는 `dist/`에 생성됩니다.

## GitHub Pages 배포

1. 이 폴더 전체를 GitHub 저장소의 `main` 브랜치에 올립니다.
2. GitHub 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 선택합니다.
3. 포함된 `.github/workflows/deploy-pages.yml`이 빌드와 배포를 수행합니다.
4. 완료 후 `https://사용자명.github.io/저장소명/`에서 Game Hub가 열립니다.

Vite의 `base: './'`, 상대경로 매니페스트, 서비스 워커의 동적 scope 계산 덕분에 저장소명이 무엇이든 별도 수정이 필요 없습니다.

## 새 게임 추가

1. `games/새게임/` 안에 독립 `index.html`과 게임 파일을 넣습니다.
2. 게임 HTML에 아래 모듈을 추가하면 공통 홈 버튼이 생깁니다.

```html
<script type="module" src="../../shared/game-shell.js"></script>
```

3. `js/games.js`에 카드 정보를 한 항목 추가합니다.
4. `pnpm build`를 실행합니다. Vite가 `games/*/index.html`을 자동으로 발견하고, `work/generate-offline-manifest.mjs`가 완성된 모든 게임 파일을 오프라인 캐시에 자동 포함합니다.

## 캐시 버전 관리

빌드할 때 전체 배포 파일의 내용 해시가 서비스 워커 캐시 버전에 자동 반영됩니다. 파일이 하나라도 바뀌거나 새 게임이 추가되면 새 캐시가 만들어지고, 활성화 단계에서 `game-hub-` 접두사의 이전 캐시와 예전 DUO PARTY 캐시를 정리합니다. 수동 버전 증가는 필요 없습니다.

허브만 `manifest.webmanifest`와 서비스 워커를 등록합니다. 각 게임은 자체 설치 버튼이나 자체 서비스 워커를 갖지 않습니다.
