# 보석의 군주 (Gem Lords)

2–4명이 한 기기에서 즐기는 로컬 패스앤플레이 보석 수집·엔진 빌딩 게임입니다. HTML, CSS, vanilla JavaScript만 사용하며 서버, 로그인, 서비스 워커가 필요하지 않습니다.

## 기준 소스

이 폴더가 Game Hub용 보석의 군주의 기준 작업 위치입니다. 이후 게임 기능·데이터·UI 수정은 이 폴더에 직접 반영합니다.

## Game Hub에 넣기

이 `gem-lords` 폴더를 Game Hub의 `/games/gem-lords/` 위치에 그대로 복사하세요. 모든 실행 경로는 상대 경로입니다.

- 시작 파일: `index.html`
- 공통 Home 버튼: `../../shared/game-shell.js`
- 목표 점수·토큰 한도·예약 한도: `js/rules.js`의 `CONFIG`
- 카드 밸런스: `js/data/cards.js`
- Patron 밸런스: `js/data/patrons.js`

GitHub Pages처럼 정적 파일을 제공하는 환경에서 바로 실행됩니다. ES 모듈을 사용하므로 로컬 파일을 더블클릭하기보다는 정적 웹 서버 또는 GitHub Pages에서 여세요.

## 저장

게임 상태는 브라우저 `localStorage`에 자동 저장됩니다. 시작 화면에서 `Continue Game` 또는 `New Game`을 선택할 수 있습니다.

## 테스트

규칙 테스트는 Node.js에서 다음 파일을 실행하도록 구성되어 있습니다.

```text
node --test tests/game.test.mjs
```
