# Supabase 실제 연결 안내

이 문서는 처음 Supabase를 사용하는 사람을 위한 PHASE 1 연결 순서다. 아래 작업이 끝나기 전에는 PHASE 2를 시작하지 않는다.

## 준비물

- Supabase에 로그인할 GitHub 또는 이메일 계정
- Game Hub 프로젝트가 있는 컴퓨터
- 데이터 저장공간이 서로 분리된 브라우저 프로필 네 개

## 1. 새 Supabase 프로젝트 만들기

1. 브라우저에서 `https://database.new` 또는 `https://supabase.com/dashboard`를 연다.
2. 로그인한 뒤 프로젝트를 담을 Organization을 선택한다. Organization이 없다면 개인용 Organization을 먼저 만든다.
3. `New project`를 누른다.
4. 프로젝트 이름을 입력한다. 예: `party-board-online`.
5. Database password를 강한 값으로 만들고 비밀번호 관리자에 보관한다. 이 비밀번호는 브라우저 게임 코드나 `.env.local`에 넣지 않는다.
6. 플레이어와 가까운 Region을 선택한다. 한국 중심 테스트라면 사용 가능한 아시아 리전 중 가까운 곳을 고른다.
7. 요금제를 확인하고 `Create new project`를 누른다.
8. Dashboard가 열리고 프로젝트 준비가 끝날 때까지 기다린다.

## 2. Project URL 확인하기

1. 새 프로젝트 Dashboard를 연다.
2. 화면 위쪽의 `Connect` 버튼을 누른다.
3. 앱 연결 정보에서 `Project URL`을 찾는다.
4. `https://프로젝트참조값.supabase.co` 형태의 값을 복사해 별도로 메모한다.

`Connect`에서 찾기 어렵다면 왼쪽 아래 `Settings`의 Data API/API 관련 화면에서 `Project URL`을 확인할 수 있다. Database connection string과 Project URL은 다른 값이다. 이 게임에는 `postgresql://...` 연결 문자열을 넣지 않는다.

## 3. Publishable key 확인하기

1. 가장 쉬운 방법은 같은 `Connect` 화면에서 `Publishable key`를 복사하는 것이다.
2. 또는 `Settings → API Keys`로 이동한다.
3. `Publishable key` 영역에서 `sb_publishable_...`로 시작하는 값을 복사한다.
4. Publishable key가 아직 없다면 `Create new API Keys`를 눌러 Publishable 유형의 키를 만든다.

`anon`이라고 표시된 긴 JWT 키는 예전 방식이다. 현재 프로젝트에서는 새 `sb_publishable_...` 키를 사용한다.

## 4. Anonymous Sign-ins 활성화하기

1. 왼쪽 메뉴에서 `Authentication`을 연다.
2. `Sign In / Providers` 또는 `Providers` 메뉴를 연다.
3. `Anonymous` 항목을 찾는다.
4. `Allow anonymous sign-ins` 또는 `Enable Anonymous Sign-Ins` 스위치를 켠다.
5. `Save`를 눌러 저장한다.

PHASE 1의 각 브라우저 프로필은 여기서 만들어지는 서로 다른 익명 사용자 ID로 플레이어를 구분한다. 브라우저 저장정보를 지우거나 다른 기기로 옮기면 같은 익명 계정을 복구할 수 없는 것이 현재의 확정된 동작이다.

## 5. Migration SQL 실행하기

실행할 파일:

`games/party-board/supabase/migrations/202608260001_phase1_rooms.sql`

1. Supabase 프로젝트 왼쪽 메뉴에서 `SQL Editor`를 연다.
2. `New query`를 누른다.
3. 위 migration 파일을 로컬 편집기에서 열고 전체 내용을 복사한다.
4. SQL Editor에 전체 내용을 붙여넣는다.
5. 현재 선택된 프로젝트가 방금 만든 Party Board 프로젝트인지 다시 확인한다.
6. `Run`을 한 번만 누른다.
7. 성공하면 `Table Editor`에서 다음 세 테이블이 생겼는지 확인한다.
   - `party_board_rooms`
   - `party_board_room_players`
   - `party_board_action_log`

이 migration은 RLS 정책, 방 RPC 함수, Realtime publication까지 함께 만든다. 성공한 SQL을 반복 실행하지 않는다. 오류가 나오면 임의로 일부 SQL을 지우거나 다시 실행하지 말고 오류 전문을 복사해 Codex에 전달한다.

## 6. 프로젝트에 URL과 Publishable key 입력하기

실제 값을 입력할 파일은 Game Hub 루트의 새 파일이다.

`C:\Users\LG\OneDrive\Documents\GitHub\game-hub\.env.local`

루트의 `.env.example`을 복사해 `.env.local`이라는 이름으로 만들고 다음처럼 입력한다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

- 첫 줄 오른쪽에는 2단계의 실제 Project URL을 넣는다.
- 둘째 줄 오른쪽에는 3단계의 실제 Publishable key를 넣는다.
- 따옴표와 끝 세미콜론은 넣지 않는다.
- `.env.example`에는 실제 값을 넣지 않는다.
- `.env.local`은 Git 제외 규칙에 포함되어 있으므로 커밋되지 않는다.
- 값을 저장한 뒤 이미 실행 중인 개발 서버가 있다면 완전히 종료하고 다시 시작한다. Vite는 시작할 때 환경값을 읽는다.

## 7. 절대 브라우저에 넣으면 안 되는 값

다음 값은 브라우저 코드, `VITE_` 환경변수, Git, 채팅, 스크린샷에 절대 넣지 않는다.

- `sb_secret_...`로 시작하는 Secret key
- Legacy `service_role` key
- Database password
- `postgresql://...` Database connection string
- Access token 또는 개인용 관리 토큰

Secret key와 service-role key는 RLS를 우회할 수 있는 높은 권한을 가진다. 반대로 Project URL과 `sb_publishable_...` 키는 브라우저 앱용 식별자이며, 실제 데이터 권한은 로그인 사용자의 JWT와 migration에 포함된 RLS가 제한한다.

## 8. 로컬 게임 시작하기

Game Hub 프로젝트 루트에서 다음 명령을 실행한다.

```powershell
pnpm dev
```

터미널에 표시된 Local 주소 뒤에 `/games/party-board/`를 붙여 연다. 기본 예시는 다음과 같다.

`http://localhost:5173/games/party-board/`

첫 화면 오른쪽 위가 `ONLINE READY`로 바뀌고 방 만들기 버튼이 활성화되면 URL/key 로딩이 완료된 것이다.

## 9. 4개 브라우저로 온라인 동기화 테스트하기

단순히 같은 브라우저의 탭을 네 개 열면 안 된다. 같은 프로필의 탭은 Supabase 세션과 localStorage를 공유하므로 한 플레이어로 인식될 수 있다. Chrome 프로필 네 개 또는 Chrome·Edge·Firefox의 서로 다른 일반 프로필처럼 저장공간이 분리된 창 네 개를 준비한다.

### A. 방 만들기와 참여

1. 브라우저 A에서 닉네임을 입력하고 `새 방 열기`를 누른다.
2. 표시된 6자리 방 코드를 복사한다. A가 방장이다.
3. 브라우저 B, C, D에서 서로 다른 닉네임과 같은 방 코드를 입력하고 `입장`을 누른다.
4. 네 화면 모두 `4/4 입장`, `4/4 온라인`이 되는지 확인한다.

### B. Presence와 캐릭터 선택

1. A, B, C, D에서 유령·두더지·병아리·슬라임을 하나씩 선택한다.
2. 먼저 선택된 캐릭터가 다른 세 화면에서 비활성화되는지 확인한다.
3. 네 화면에서 플레이어 이름, 방장 표시, 온라인 표시, 캐릭터 소유자가 동일한지 확인한다.
4. 방장 A의 시작 버튼만 활성화되는지 확인한다.

### C. 같은 브라우저 재접속

1. 일반 프로필을 사용하는 브라우저 B의 Party Board 탭만 닫는다. 브라우저 데이터는 삭제하지 않는다.
2. 다른 화면에서 B가 `재접속 대기`로 바뀌는지 확인한다.
3. 같은 B 프로필에서 같은 Party Board URL을 다시 연다.
4. `이어하기`로 같은 방에 복귀한다.
5. B의 좌석·닉네임·캐릭터가 그대로이고 네 화면이 다시 `4/4 온라인`인지 확인한다.
6. 브라우저 C에서는 새로고침한 뒤 시작 화면의 `이어하기`를 눌러 같은 사용자·좌석으로 복귀하는지도 확인한다.

시크릿/Incognito 창은 마지막 창을 닫으면 저장정보가 삭제될 수 있으므로 재접속 검증용으로 사용하지 않는다.

### D. 방장 일시 이탈

1. 방장 A의 탭을 닫고 다른 화면에서 A가 오프라인으로 표시되는지 확인한다.
2. 방장이 B, C, D로 자동 변경되지 않는지 확인한다.
3. 같은 A 프로필로 다시 열어 방장 권한이 유지되는지 확인한다.

### E. 게임 시작 상태

1. A에서 게임 시작을 누른다.
2. 네 화면이 모두 같은 게임 화면으로 넘어가는지 확인한다.
3. Supabase `Table Editor → party_board_rooms`에서 해당 방의 `status`가 `active`, `global_turn`이 `1`, `state_version`이 `1`인지 확인한다.
4. `game_state`에 플레이어 네 명이 모두 20코인·별 0·빈 인벤토리로 들어갔는지 확인한다.
5. 무작위 turn order가 네 플레이어를 정확히 한 번씩 포함하는지 확인한다. 캐릭터 선택 순서와 같아도 우연일 수 있으므로 “반드시 달라야 한다”는 검사는 하지 않는다.

### F. 저장 후 같은 브라우저로 복귀

1. 방장 A에서 `저장하고 종료`를 누른다.
2. A 화면이 저장 상태로 바뀌었는지 확인한 뒤 `시작 화면`으로 이동한다.
3. B, C, D도 `시작 화면`으로 이동한다.
4. 각 플레이어가 원래 사용하던 같은 브라우저 프로필에서 `이어하기`를 눌러 같은 방과 좌석으로 복귀하는지 확인한다.
5. 네 화면이 모두 같은 저장 방 상태를 보여주고, 좌석·닉네임·캐릭터와 `game_state`가 저장 전과 같은지 확인한다.
6. 네 명이 다시 온라인이 되면 A에서만 `게임 시작` 버튼이 활성화되는지 확인하고 누른다. 저장된 보드와 turn order가 바뀌지 않은 채 네 화면이 다시 게임 화면으로 돌아가는지 확인한다.

## 10. 통과 기준

다음 항목이 모두 확인되어야 PHASE 1 온라인 연결 테스트 통과다.

- 하나의 방 코드에 서로 다른 익명 사용자 네 명이 좌석 0–3으로 저장된다.
- 네 화면의 입장자·캐릭터·Presence가 동일하다.
- 중복 캐릭터를 선택할 수 없다.
- 게임 시작 시 turn order가 서버에서 한 번만 생성되고 네 명에게 동일하다.
- 새로고침과 같은 프로필 재접속 후 좌석·캐릭터·게임 상태가 유지된다.
- 방장 일시 이탈로 자동 위임이 일어나지 않는다.
- 비회원이나 다른 익명 사용자가 해당 방 데이터를 직접 읽거나 변경할 수 없다.
- 브라우저 콘솔과 Supabase Logs에 권한/RPC/Realtime 오류가 없다.

이 테스트 결과를 기록해 Codex와 함께 검토한 후에 다음 PHASE 1 슬라이스를 진행한다. PHASE 2는 별도의 사용자 확인이 있기 전까지 잠금 상태로 유지한다.
