import "./styles/main.css";
import { Game, HOME, WAIT } from "./core/Game.js";
import { NODES, getPreviousNodes } from "./core/board.js";
import { BoardRenderer, COLORS } from "./board/BoardRenderer.js";
import { AUGMENTS_BY_ID, IMPLEMENTED_AUGMENTS, PLANNED_AUGMENTS } from "./augments/definitions.js";
import { OnlineClient, defaultOnlineServerUrl } from "./online/OnlineClient.js";

const SAVE_KEY = "augmented-yutnori-save-v1";
const COLOR_LABELS = { red: "빨강", blue: "파랑", green: "초록", yellow: "노랑" };

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GameApp {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.board = null;
    this.selectedResultId = null;
    this.selectedPieceId = null;
    this.locked = false;
    this.lastThrow = null;
    this.modal = null;
    this.abilityMode = null;
    this.detailAugmentId = null;
    this.detailOwnerId = null;
    this.expandedPlayerIds = new Set();
    this.throwFx = null;
    this.eventFx = null;
    this.eventFxTimer = null;
    this.pendingMove = null;
    this.onlineClient = null;
    this.onlineState = null;
    this.onlineConnection = "offline";
    this.onlinePending = null;
    this.onlineBusy = false;
    this.lastOnlineActionSequence = 0;
    this.renderMenu();
  }

  hasSave() {
    try { return Boolean(localStorage.getItem(SAVE_KEY)); } catch { return false; }
  }

  save() {
    if (this.isOnlineGame()) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.toJSON())); } catch { /* private mode */ }
  }

  isOnlineGame() {
    return Boolean(this.onlineState?.game);
  }

  onlineViewer() {
    if (!this.isOnlineGame()) return null;
    return this.game.players.find((player) => player.id === this.onlineState.you.gamePlayerId) || null;
  }

  canControlTurn() {
    return !this.isOnlineGame() || this.onlineConnection === "connected" && this.game.currentPlayer.id === this.onlineState.you.gamePlayerId;
  }

  ensureOnlineClient(url = defaultOnlineServerUrl()) {
    if (this.onlineClient?.url === url) return this.onlineClient;
    this.onlineClient?.disconnect();
    this.onlineClient = new OnlineClient({
      url,
      onState: (state) => this.applyOnlineState(state),
      onConnection: (status) => {
        this.onlineConnection = status;
        if (this.onlineState?.room.phase === "lobby") this.renderOnlineLobby();
        else if (this.isOnlineGame()) this.renderGame();
      },
      onError: (error) => this.toast(error.message),
      onPending: (request) => {
        this.onlinePending = request;
        if (request) this.renderOnlineApprovalWait();
        else if (!this.onlineState) this.renderOnlineHome();
      },
      onExit: (message) => {
        this.onlinePending = null;
        this.onlineState = null;
        this.game = null;
        this.renderOnlineHome(message);
      },
    });
    return this.onlineClient;
  }

  applyOnlineState(state) {
    this.onlineState = state;
    this.onlinePending = null;
    this.onlineConnection = "connected";
    if (!state.game) {
      this.game = null;
      this.renderOnlineLobby();
      return;
    }
    this.game = Game.restore(state.game);
    this.game.onlineViewerPlayerId = state.you.gamePlayerId;
    if (state.lastAction?.sequence > this.lastOnlineActionSequence) {
      this.lastOnlineActionSequence = state.lastAction.sequence;
      const action = state.lastAction.action || {};
      if (state.lastAction.type === "throw" && action.result) {
        this.lastThrow = action.result;
        this.throwFx = { label: action.result.label || "?", extra: Boolean(action.result.extra), count: action.result.sticks?.length || 0 };
        setTimeout(() => {
          if (this.lastOnlineActionSequence === state.lastAction.sequence) {
            this.throwFx = null;
            if (this.isOnlineGame()) this.renderGame();
          }
        }, 820 / (this.game.settings.animationSpeed || 1));
      } else if (state.lastAction.type === "move" && action.event) {
        if (action.event.capturedIds?.length) this.announceEvent("잡았다!", `상대 말 ${action.event.capturedIds.length}개를 잡았습니다.`, "capture");
        else if (action.event.target === HOME) this.announceEvent("완주!", "말이 결승점에 도착했습니다.", "finish");
      } else if (["useAugment", "useSpecial"].includes(state.lastAction.type)) {
        this.announceEvent("능력 발동!", this.game.logs[0]?.message || "특수 효과가 적용되었습니다.", "augment");
      }
    }
    this.selectedResultId = this.game.getResult(this.selectedResultId)?.id || null;
    if (!this.selectedResultId) this.selectedPieceId = null;
    this.renderGame();
    this.animateOnlineAction(state.lastAction);
  }

  async animateOnlineAction(lastAction) {
    if (!lastAction || lastAction.sequence !== this.lastOnlineActionSequence || !this.board) return;
    const payload = lastAction.action || {};
    const event = payload.event || payload.outcome?.event;
    if (!event) return;
    try {
      this.locked = true;
      await this.board.animateMove(event, this.game.settings.animationSpeed);
    } catch { /* 새 상태가 오면 애니메이션을 중단하고 최신 상태를 그린다. */ }
    this.locked = false;
    // 이동 응답의 finally 렌더는 애니메이션이 끝나기 전에 실행될 수 있다. 잠금을
    // 해제한 뒤 다시 그려야 현재 플레이어의 다음 입력 버튼이 실제로 활성화된다.
    if (this.isOnlineGame()) this.renderGame();
  }

  async sendOnlineCommand(type, payload = {}) {
    if (!this.onlineClient || this.onlineBusy) return null;
    if (this.onlineConnection !== "connected") { this.toast("서버 재접속이 끝날 때까지 기다려 주세요."); return null; }
    this.onlineBusy = true;
    if (this.isOnlineGame()) this.renderGame();
    try {
      return await this.onlineClient.command(type, payload);
    } catch (error) {
      this.toast(error.message);
      return null;
    } finally {
      this.onlineBusy = false;
      if (this.isOnlineGame()) this.renderGame();
    }
  }

  exitOnlineView() {
    this.onlineClient?.disconnect();
    this.onlineState = null;
    this.onlinePending = null;
    this.game = null;
    this.lastThrow = null;
    this.throwFx = null;
    this.renderMenu();
  }

  load() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.game = Game.restore(data);
      this.renderGame();
    } catch {
      localStorage.removeItem(SAVE_KEY);
      this.renderMenu();
    }
  }

  renderMenu() {
    this.board?.destroy();
    this.board = null;
    const saved = this.hasSave();
    this.root.innerHTML = `
      <main class="menu-screen">
        <section class="hero-panel" aria-labelledby="game-title">
          <div class="brand-mark" aria-hidden="true">
            <span class="brand-node red"></span><span class="brand-node blue"></span>
            <span class="brand-node green"></span><span class="brand-node yellow"></span>
            <span class="brand-cross">✦</span>
          </div>
          <p class="eyebrow">전통 위에 전략을 더하다</p>
          <h1 id="game-title"><span>증강</span> 윷놀이</h1>
          <p class="hero-copy">한 기기에서도, 서로 다른 기기에서도<br>2~4명이 함께 즐기는 전략 보드게임</p>
          <div class="menu-actions">
            <button class="btn btn-primary btn-xl" data-action="setup">오프라인 플레이</button>
            <button class="btn btn-online btn-xl" data-action="online">온라인 플레이</button>
            ${saved ? '<button class="btn btn-secondary btn-xl" data-action="resume">이어하기</button>' : ""}
          </div>
          <div class="sub-actions">
            <button class="text-btn" data-action="rules">게임 방법</button>
            <span aria-hidden="true">·</span>
            <button class="text-btn" data-action="codex">증강 도감</button>
          </div>
        </section>
        <aside class="menu-board" aria-hidden="true">
          <div class="mini-board">
            <span class="mini-line line-a"></span><span class="mini-line line-b"></span>
            <span class="mini-line line-c"></span><span class="mini-line line-d"></span>
            ${Array.from({ length: 16 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}
            <b class="mini-piece p-red"></b><b class="mini-piece p-blue"></b>
            <b class="mini-piece p-green"></b><b class="mini-piece p-yellow"></b>
            <strong>✦</strong>
          </div>
          <p>범용 57개 + 전용 30개 · 전체 87개 구현</p>
        </aside>
      </main>
      ${this.modalMarkup()}`;
    this.bindMenu();
  }

  bindMenu() {
    this.root.querySelector('[data-action="setup"]')?.addEventListener("click", () => this.renderSetup());
    this.root.querySelector('[data-action="online"]')?.addEventListener("click", () => this.renderOnlineHome());
    this.root.querySelector('[data-action="resume"]')?.addEventListener("click", () => this.load());
    this.root.querySelector('[data-action="rules"]')?.addEventListener("click", () => { this.modal = "rules"; this.renderMenu(); });
    this.root.querySelector('[data-action="codex"]')?.addEventListener("click", () => { this.modal = "codex"; this.renderMenu(); });
    this.bindModal();
  }

  renderOnlineHome(message = "") {
    this.board?.destroy();
    this.board = null;
    const client = this.ensureOnlineClient();
    const hasSession = Boolean(client.session);
    this.root.innerHTML = `
      <main class="setup-screen online-home-screen">
        <header class="setup-header"><button class="icon-btn" data-action="back" aria-label="메인 메뉴로 돌아가기">←</button><div><p class="eyebrow">ONLINE PLAY</p><h1>친구와 같은 판에 접속하세요</h1></div></header>
        <section class="online-entry-grid">
          <form class="setup-card online-entry-card" id="online-create-form">
            <div><p class="eyebrow">HOST</p><h2>새 방 만들기</h2><p>방장이 설정을 정하고 6자리 코드를 친구에게 공유합니다.</p></div>
            <label><span>방장 이름</span><input name="name" maxlength="12" value="방장" required></label>
            <div class="settings-grid compact">
              <label><span>최대 인원</span><select name="maxPlayers"><option value="2">2명</option><option value="3">3명</option><option value="4" selected>4명</option></select></label>
              <label><span>게임 모드</span><select name="mode"><option value="normal">일반 모드</option><option value="chaos">혼돈 모드</option></select></label>
            </div>
            <div class="online-toggles"><label class="toggle"><input type="checkbox" name="useBackDo" checked><span></span><b>백도 사용</b></label><label class="toggle"><input type="checkbox" name="useNak"><span></span><b>낙 사용</b></label></div>
            <fieldset class="room-security-options"><legend>방 보호</legend><label class="toggle"><input type="checkbox" name="passwordRequired"><span></span><b>비밀번호 사용</b></label><label><span>방 비밀번호</span><input type="password" name="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="사용할 때만 4~64자 입력"></label><label class="toggle"><input type="checkbox" name="approvalRequired"><span></span><b>방장 참가 승인</b></label></fieldset>
            <button class="btn btn-primary btn-xl full" type="submit">방 만들기</button>
          </form>
          <form class="setup-card online-entry-card" id="online-join-form">
            <div><p class="eyebrow">JOIN</p><h2>방 참가하기</h2><p>친구가 알려준 6자리 방 코드를 입력하세요.</p></div>
            <label><span>플레이어 이름</span><input name="name" maxlength="12" value="플레이어" required></label>
            <label><span>6자리 방 코드</span><input class="room-code-input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="483921" required></label>
            <label><span>방 비밀번호 <small>(설정된 방만)</small></span><input type="password" name="password" maxlength="64" autocomplete="current-password" placeholder="비밀번호가 없으면 비워 두세요"></label>
            <button class="btn btn-online btn-xl full" type="submit">코드로 참가</button>
            ${hasSession ? '<button class="btn btn-secondary full" type="button" data-action="reconnect">이전 온라인 게임 재접속</button>' : ""}
          </form>
        </section>
        <aside class="beta-hosting-notice" role="note"><b>ONLINE BETA · Render Free</b><span>15분 동안 사용하지 않으면 서버가 절전됩니다. 첫 연결은 약 1분 걸릴 수 있으며, 서버가 재시작되면 진행 중인 방은 복원되지 않을 수 있습니다.</span></aside>
        <details class="server-settings"><summary>연결 서버 설정</summary><label><span>온라인 서버 주소</span><input data-online-server value="${escapeHtml(client.url)}" inputmode="url"></label><small>정적 프런트와 서버를 따로 배포할 때만 변경하세요.</small></details>
        ${message ? `<p class="online-form-message">${escapeHtml(message)}</p>` : ""}
        <div id="toast" aria-live="polite"></div>
      </main>`;
    const serverInput = this.root.querySelector("[data-online-server]");
    const useServer = () => this.ensureOnlineClient(serverInput.value.trim() || defaultOnlineServerUrl());
    this.root.querySelector("#online-create-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      try {
        await useServer().createRoom({ name: values.get("name"), settings: { maxPlayers: Number(values.get("maxPlayers")), mode: values.get("mode"), useBackDo: values.get("useBackDo") === "on", useNak: values.get("useNak") === "on", access: { passwordRequired: values.get("passwordRequired") === "on", approvalRequired: values.get("approvalRequired") === "on", password: values.get("password") } } });
      } catch (error) { this.renderOnlineHome(error.message); }
    });
    this.root.querySelector("#online-join-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      try { await useServer().joinRoom({ code: values.get("code"), name: values.get("name"), password: values.get("password") }); }
      catch (error) { this.renderOnlineHome(error.message); }
    });
    this.root.querySelector('[data-action="reconnect"]')?.addEventListener("click", async () => {
      try { await useServer().resume(); } catch (error) { this.renderOnlineHome(error.message); }
    });
    this.root.querySelector('[data-action="back"]').addEventListener("click", () => this.renderMenu());
  }

  renderOnlineApprovalWait() {
    if (!this.onlinePending) return this.renderOnlineHome();
    this.root.innerHTML = `<main class="setup-screen online-home-screen"><section class="setup-card approval-wait-card"><div class="waiting-orbit"><i></i><i></i><i></i></div><p class="eyebrow">JOIN APPROVAL</p><h1>방장의 승인을 기다리고 있습니다</h1><p>방 코드 <b>${escapeHtml(this.onlinePending.roomCode)}</b> · ${escapeHtml(this.onlinePending.name)}</p><small>승인 전에는 참가자 목록이나 게임 상태가 전송되지 않습니다.</small><button class="btn btn-secondary full" data-cancel-approval>요청 취소</button></section><div id="toast" aria-live="polite"></div></main>`;
    this.root.querySelector("[data-cancel-approval]").addEventListener("click", () => {
      this.onlineClient?.disconnect();
      this.onlinePending = null;
      this.renderOnlineHome();
    });
  }

  renderOnlineLobby() {
    if (!this.onlineState?.room) return this.renderOnlineHome();
    const { room, you } = this.onlineState;
    if (room.phase !== "lobby" && this.onlineState.game) return this.renderGame();
    const me = room.players.find((player) => player.id === you.playerId);
    const canStart = you.isHost && room.players.length >= 2 && room.players.every((player) => player.ready && player.connected);
    this.root.innerHTML = `
      <main class="setup-screen online-lobby-screen">
        <header class="setup-header"><button class="icon-btn" data-action="leave-online" aria-label="방 나가기">←</button><div><p class="eyebrow">ONLINE LOBBY</p><h1>친구를 기다리는 중</h1></div><span class="connection-pill ${this.onlineConnection}">${this.onlineConnection === "connected" ? "● 연결됨" : this.onlineConnection === "connecting" ? "○ 서버 시작 중" : "○ 재연결 중"}</span></header>
        ${this.onlineConnection === "connected" ? "" : '<div class="network-warning" role="alert"><b>연결이 끊겼습니다.</b><span>자동으로 재접속하고 있습니다. 창을 닫지 마세요.</span></div>'}
        <aside class="beta-hosting-notice compact" role="note"><b>무료 베타 서버</b><span>절전·재시작 시 이 방이 사라질 수 있습니다. 장시간 자리를 비우기 전에는 게임을 마쳐 주세요.</span></aside>
        <div class="lobby-layout">
          <section class="setup-card lobby-main">
            <div class="room-code-panel"><div><small>ROOM CODE</small><strong>${room.code}</strong></div><button class="btn btn-secondary" data-copy-code>초대 코드 복사</button></div>
            <div class="lobby-player-list">${room.players.map((player, index) => `<article class="lobby-player ${player.ready ? "ready" : ""} ${!player.connected ? "disconnected" : ""}" style="--player:${COLORS[player.color]}"><span class="player-token">${index + 1}</span><i class="color-dot ${player.color}"></i><div><b>${escapeHtml(player.name)}${player.id === you.playerId ? " (나)" : ""}</b><small>${player.id === room.hostPlayerId ? "방장" : player.connected ? "참가자" : "연결 끊김"}</small></div><em>${player.ready ? "준비 완료" : "준비 중"}</em>${you.isHost && player.id !== you.playerId ? `<button class="kick-player-btn" data-kick-player="${player.id}" title="${escapeHtml(player.name)} 내보내기">내보내기</button>` : ""}</article>`).join("")}</div>
            ${you.isHost && room.joinRequests?.length ? `<section class="join-request-list"><h3>참가 승인 요청</h3>${room.joinRequests.map((request) => `<article><div><b>${escapeHtml(request.name)}</b><small>승인 전에는 방 정보를 볼 수 없습니다.</small></div><button class="btn btn-online" data-approve-request="${request.id}">승인</button><button class="btn btn-secondary" data-deny-request="${request.id}">거절</button></article>`).join("")}</section>` : ""}
            <button class="btn ${me?.ready ? "btn-secondary" : "btn-online"} btn-xl full" data-ready>${me?.ready ? "준비 취소" : "준비 완료"}</button>
          </section>
          <aside class="setup-card lobby-settings">
            <p class="eyebrow">GAME SETTINGS</p><h2>방 설정</h2>
            <label><span>최대 인원</span><select data-setting="maxPlayers" ${you.isHost ? "" : "disabled"}>${[2,3,4].map((count) => `<option value="${count}" ${room.settings.maxPlayers === count ? "selected" : ""}>${count}명</option>`).join("")}</select></label>
            <label><span>모드</span><select data-setting="mode" ${you.isHost ? "" : "disabled"}><option value="normal" ${room.settings.mode === "normal" ? "selected" : ""}>일반</option><option value="chaos" ${room.settings.mode === "chaos" ? "selected" : ""}>혼돈</option></select></label>
            <label class="toggle"><input type="checkbox" data-setting="useBackDo" ${room.settings.useBackDo ? "checked" : ""} ${you.isHost ? "" : "disabled"}><span></span><b>백도 사용</b></label>
            <label class="toggle"><input type="checkbox" data-setting="useNak" ${room.settings.useNak ? "checked" : ""} ${you.isHost ? "" : "disabled"}><span></span><b>낙 사용</b></label>
            <div class="lobby-security-settings"><h3>방 보호</h3><label class="toggle"><input type="checkbox" data-access-setting="passwordRequired" ${room.settings.access.passwordRequired ? "checked" : ""} ${you.isHost ? "" : "disabled"}><span></span><b>비밀번호</b></label><label><span>새 비밀번호</span><input type="password" data-room-password minlength="4" maxlength="64" autocomplete="new-password" placeholder="변경할 때만 입력" ${you.isHost ? "" : "disabled"}></label><label class="toggle"><input type="checkbox" data-access-setting="approvalRequired" ${room.settings.access.approvalRequired ? "checked" : ""} ${you.isHost ? "" : "disabled"}><span></span><b>방장 참가 승인</b></label><small>${room.settings.access.passwordRequired ? "비밀번호 보호 중" : "비밀번호 없음"} · ${room.settings.access.approvalRequired ? "승인 필요" : "즉시 참가"}</small></div>
            ${you.isHost ? `<button class="btn btn-primary btn-xl full" data-start-online ${canStart ? "" : "disabled"}>온라인 게임 시작</button><small>${canStart ? "모든 준비가 끝났습니다." : "2명 이상 접속하고 모두 준비해야 합니다."}</small>` : '<div class="waiting-host"><span></span><p>방장이 게임을 시작하기를 기다리고 있습니다.</p></div>'}
          </aside>
        </div><div id="toast" aria-live="polite"></div>
      </main>`;
    this.root.querySelector("[data-copy-code]").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(room.code); this.toast("방 코드를 복사했습니다."); }
      catch { this.toast(`방 코드: ${room.code}`); }
    });
    this.root.querySelector("[data-ready]").addEventListener("click", async () => {
      try { await this.onlineClient.setReady(!me.ready); } catch (error) { this.toast(error.message); }
    });
    this.root.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", async () => {
      const settings = { ...room.settings, [input.dataset.setting]: input.type === "checkbox" ? input.checked : input.dataset.setting === "maxPlayers" ? Number(input.value) : input.value };
      try { await this.onlineClient.updateSettings(settings); } catch (error) { this.toast(error.message); }
    }));
    this.root.querySelectorAll("[data-access-setting]").forEach((input) => input.addEventListener("change", async () => {
      const passwordRequired = this.root.querySelector('[data-access-setting="passwordRequired"]').checked;
      const approvalRequired = this.root.querySelector('[data-access-setting="approvalRequired"]').checked;
      const password = this.root.querySelector("[data-room-password]").value;
      try { await this.onlineClient.updateSettings({ ...room.settings, access: { passwordRequired, approvalRequired, ...(password ? { password } : {}) } }); }
      catch (error) { this.toast(error.message); this.renderOnlineLobby(); }
    }));
    this.root.querySelector("[data-room-password]")?.addEventListener("change", async (event) => {
      if (!event.target.value) return;
      try { await this.onlineClient.updateSettings({ ...room.settings, access: { ...room.settings.access, password: event.target.value } }); }
      catch (error) { this.toast(error.message); }
    });
    this.root.querySelectorAll("[data-approve-request]").forEach((button) => button.addEventListener("click", async () => {
      try { await this.onlineClient.approveJoin(button.dataset.approveRequest, true); } catch (error) { this.toast(error.message); }
    }));
    this.root.querySelectorAll("[data-deny-request]").forEach((button) => button.addEventListener("click", async () => {
      try { await this.onlineClient.approveJoin(button.dataset.denyRequest, false); } catch (error) { this.toast(error.message); }
    }));
    this.root.querySelectorAll("[data-kick-player]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("이 플레이어를 대기실에서 내보낼까요?")) return;
      try { await this.onlineClient.kickPlayer(button.dataset.kickPlayer); } catch (error) { this.toast(error.message); }
    }));
    this.root.querySelector("[data-start-online]")?.addEventListener("click", async () => {
      try { await this.onlineClient.startGame(); } catch (error) { this.toast(error.message); }
    });
    this.root.querySelector("[data-action='leave-online']").addEventListener("click", async () => {
      try { await this.onlineClient.leaveLobby(); } catch { this.onlineClient.clearSession(); }
      this.onlineState = null; this.game = null; this.renderMenu();
    });
  }

  renderSetup() {
    this.root.innerHTML = `
      <main class="setup-screen">
        <header class="setup-header">
          <button class="icon-btn" data-action="back" aria-label="메인 메뉴로 돌아가기">←</button>
          <div><p class="eyebrow">게임 준비</p><h1>오늘의 판을 꾸려볼까요?</h1></div>
        </header>
        <form id="setup-form" class="setup-card">
          <fieldset>
            <legend>플레이어 수</legend>
            <div class="segmented" role="radiogroup">
              ${[2,3,4].map((count) => `<label><input type="radio" name="playerCount" value="${count}" ${count === 2 ? "checked" : ""}><span>${count}명</span></label>`).join("")}
            </div>
          </fieldset>
          <fieldset>
            <legend>플레이어</legend>
            <div id="player-inputs" class="player-inputs"></div>
          </fieldset>
          <div class="settings-grid">
            <fieldset>
              <legend>게임 모드</legend>
              <div class="segmented wide">
                <label><input type="radio" name="mode" value="normal" checked><span>일반 모드</span></label>
                <label><input type="radio" name="mode" value="chaos"><span>혼돈 모드</span></label>
              </div>
              <p class="field-note">1·6·12라운드에 증강을 선택합니다.</p>
            </fieldset>
            <fieldset>
              <legend>세부 규칙</legend>
              <label class="toggle"><input type="checkbox" name="useBackDo" checked><span></span><b>백도 사용</b></label>
              <label class="toggle"><input type="checkbox" name="useNak"><span></span><b>낙 사용</b></label>
            </fieldset>
          </div>
          <fieldset>
            <legend>애니메이션 속도 <output id="speed-output">보통</output></legend>
            <input class="range" type="range" name="animationSpeed" min="0.7" max="1.8" step="0.1" value="1">
          </fieldset>
          <button class="btn btn-primary btn-xl full" type="submit">순서를 섞고 게임 시작</button>
        </form>
      </main>`;

    const form = this.root.querySelector("#setup-form");
    const renderPlayerInputs = () => {
      const count = Number(new FormData(form).get("playerCount"));
      this.root.querySelector("#player-inputs").innerHTML = Array.from({ length: count }, (_, index) => `
        <label class="player-name-field">
          <span class="color-dot ${["red","blue","green","yellow"][index]}"></span>
          <small>${COLOR_LABELS[["red","blue","green","yellow"][index]]}</small>
          <input name="playerName${index}" maxlength="12" value="플레이어 ${index + 1}" aria-label="플레이어 ${index + 1} 이름">
        </label>`).join("");
    };
    renderPlayerInputs();
    form.querySelectorAll('[name="playerCount"]').forEach((input) => input.addEventListener("change", renderPlayerInputs));
    form.animationSpeed.addEventListener("input", () => {
      const speed = Number(form.animationSpeed.value);
      this.root.querySelector("#speed-output").textContent = speed < 0.9 ? "느리게" : speed > 1.3 ? "빠르게" : "보통";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const count = Number(values.get("playerCount"));
      this.game = new Game({
        playerCount: count,
        playerNames: Array.from({ length: count }, (_, index) => values.get(`playerName${index}`)),
        mode: values.get("mode"),
        useBackDo: values.get("useBackDo") === "on",
        useNak: values.get("useNak") === "on",
        animationSpeed: Number(values.get("animationSpeed")),
      });
      this.save();
      this.renderGame();
    });
    this.root.querySelector('[data-action="back"]').addEventListener("click", () => this.renderMenu());
  }

  renderGame() {
    this.board?.destroy();
    if (!this.game) return this.renderMenu();
    const current = this.game.currentPlayer;
    const controlPlayer = this.onlineViewer() || current;
    const canControl = this.canControlTurn();
    const result = this.game.getResult(this.selectedResultId);
    const selectedOwner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === this.selectedPieceId));
    const selectedPiece = selectedOwner?.pieces.find((piece) => piece.id === this.selectedPieceId);
    const pathOptions = result && selectedPiece ? this.game.getMoveOptionsForPiece(selectedPiece, result, selectedOwner) : [];

    this.root.innerHTML = `
      <main class="game-screen">
        <header class="game-topbar">
          <div class="round-badge"><span>ROUND</span><strong>${this.game.round}</strong></div>
          <div class="turn-title"><span class="color-dot ${current.color}"></span><b>${escapeHtml(current.name)}</b> 차례</div>
          <div class="top-actions">
            ${this.isOnlineGame() ? `<span class="online-game-badge ${this.onlineConnection}"><i></i>${this.onlineState.room.code} · ${this.onlineConnection === "connected" ? "온라인" : this.onlineConnection === "connecting" ? "서버 시작 중" : "재연결 중"}</span>` : ""}
            <button class="icon-btn" data-action="rules" title="게임 방법">?</button>
            <button class="icon-btn" data-action="${this.isOnlineGame() ? "online-home" : "menu"}" title="메인 메뉴">☰</button>
          </div>
        </header>
        ${this.isOnlineGame() && this.onlineConnection !== "connected" ? '<div class="network-warning game-network-warning" role="alert"><b>온라인 연결이 끊겼습니다.</b><span>재접속과 상태 복원을 시도하고 있습니다. 입력은 잠시 비활성화됩니다.</span></div>' : ""}

        <div class="game-layout">
          <section class="board-zone" aria-label="윷놀이판과 플레이어 현황">
            ${this.game.players.map((player, index) => this.playerCard(player, index)).join("")}
            <div class="board-wrap">
              <div class="board-caption"><span>START</span><i></i><span>HOME</span></div>
              <div class="board-stage">
                <canvas id="yut-board" aria-label="윷놀이판" tabindex="0"></canvas>
                <div class="board-tooltip" role="status" aria-live="polite"></div>
                <div class="board-legend"><span><i class="legend-target"></i>이동 가능</span><span><i class="legend-path"></i>예상 경로</span></div>
              </div>
            </div>
          </section>
        </div>

        ${this.eventFx ? `<div class="event-announcement tone-${this.eventFx.tone}" role="status" aria-live="assertive"><strong>${escapeHtml(this.eventFx.title)}</strong><span>${escapeHtml(this.eventFx.message)}</span></div>` : ""}

        <section class="action-dock" aria-label="행동 패널" style="--player:${COLORS[current.color]}">
          <div class="yut-tray ${this.throwFx ? "is-throwing" : ""} ${this.throwFx?.extra ? "is-bonus" : ""}">
            ${this.yutMarkup()}
            ${this.throwFx ? `<div class="yut-result-burst"><strong>${escapeHtml(this.throwFx.label)}</strong>${this.throwFx.extra ? "<span>한 번 더!</span>" : ""}</div>` : ""}
          </div>
          <div class="action-content">
            <div class="action-instruction">
              <div><span>${this.actionStep(result)}</span><strong>${this.actionInstruction(result, pathOptions)}</strong></div>
              ${result || this.selectedPieceId ? '<button class="selection-cancel" data-action="cancel-selection">선택 취소</button>' : ""}
            </div>
            <div class="result-list">
              ${this.game.turn.results.length ? this.game.turn.results.map((item) => `<button class="result-chip ${item.id === this.selectedResultId ? "selected" : ""}" data-result="${item.id}" ${item.hidden || this.locked || this.onlineBusy || !canControl ? "disabled" : ""}><b>${item.hidden ? "?" : item.label}</b><span>${item.hidden ? "판정 중" : item.steps > 0 ? `${item.steps}칸` : "뒤로 1칸"}</span></button>`).join("") : '<span class="empty-results">저장된 이동 결과 없음</span>'}
            </div>
            ${result ? this.pieceChoices(result, pathOptions) : ""}
            ${this.augmentBar(controlPlayer, canControl)}
          </div>
          <div class="primary-controls">
            ${this.throwControls(current, canControl)}
            <button class="btn btn-end" data-action="end-turn" title="${canControl && this.game.canEndTurn() ? "현재 차례를 마칩니다." : !canControl ? "상대 플레이어의 차례입니다." : "남은 투척과 이동 결과를 먼저 처리하세요."}" ${!canControl || !this.game.canEndTurn() || this.locked || this.onlineBusy ? "disabled" : ""}>턴 종료 <span>→</span></button>
          </div>
        </section>
        <div id="toast" aria-live="polite"></div>
      </main>
      ${this.game.status === "finished" ? this.victoryMarkup() : ""}
      ${this.modalMarkup()}
      ${this.detailAugmentId ? this.augmentDetailMarkup() : ""}
      ${this.game.augmentDraft?.active ? this.augmentDraftMarkup() : ""}
      ${this.abilityMode ? this.abilityModalMarkup() : ""}
      ${this.pendingMove ? this.stackChoiceMarkup() : ""}
      ${this.game.interaction?.active ? this.interactionMarkup() : ""}`;

    const canvas = this.root.querySelector("#yut-board");
    this.board = new BoardRenderer(canvas, this.game);
    const previewPaths = pathOptions.map((option) => [selectedPiece?.node, ...option.pathNodes].filter(Boolean));
    this.board.draw({
      targetNodes: [...pathOptions.map((option) => option.target), ...this.abilityTargetNodes()].filter((node) => node !== HOME),
      previewNodes: previewPaths.flat(),
      previewPaths,
      selectedPieceId: this.selectedPieceId,
    });
    this.bindBoard(canvas, pathOptions);
    this.bindGame();
  }

  playerCard(player, index) {
    const summary = this.game.getPlayerSummary(player);
    const isCurrent = player.id === this.game.currentPlayer.id;
    const onlinePlayer = this.onlineState?.room.players.find((candidate) => candidate.gamePlayerId === player.id);
    const disconnected = onlinePlayer && !onlinePlayer.connected;
    const expanded = isCurrent || this.expandedPlayerIds.has(player.id);
    const stacks = new Map();
    player.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node)).forEach((piece) => {
      const key = `${piece.node}:${piece.stackId || "legacy"}`;
      stacks.set(key, (stacks.get(key) || 0) + 1);
    });
    const waitingPieces = player.pieces.filter((piece) => piece.node === WAIT);
    const canUseReserve = isCurrent && this.canControlTurn() && this.game.turn.results.length && !player.eliminated && !this.locked && !this.onlineBusy;
    return `
      <article class="player-card ${isCurrent ? "current" : ""} ${expanded ? "expanded" : ""} ${player.eliminated ? "eliminated" : ""} ${disconnected ? "disconnected" : ""}" style="--player:${COLORS[player.color]}" data-slot="${index}" data-player-card="${player.id}">
        <header><span class="player-token">${index + 1}</span><div><small>${COLOR_LABELS[player.color]} 팀</small><h2>${escapeHtml(player.name)}</h2></div>${player.eliminated ? '<b class="eliminated-pill">탈락</b>' : disconnected ? '<b class="disconnect-pill">연결 끊김</b>' : isCurrent ? '<b class="turn-pill">TURN</b>' : ""}<button class="player-toggle" data-player-toggle="${player.id}" aria-label="${escapeHtml(player.name)} 정보 ${expanded ? "접기" : "펼치기"}" aria-expanded="${expanded}">⌄</button></header>
        <div class="player-details">
        <div class="piece-stats">
          <span><b>${summary.waiting}</b><small>대기</small></span>
          <span><b>${summary.onBoard}</b><small>판 위</small></span>
          <span><b>${summary.finished}</b><small>완주</small></span>
        </div>
        <div class="reserve-row"><span>내 말</span><small>판에 나가면 하나씩 줄어듭니다</small></div>
        <div class="reserve-pieces" aria-label="대기 중인 말 ${waitingPieces.length}개">
          ${waitingPieces.length ? waitingPieces.map((piece) => `<button type="button" data-direct-piece="${piece.id}" class="reserve-piece type-${piece.type} ${piece.id === this.selectedPieceId ? "selected" : ""}" title="말 ${piece.number}을 바로 이동" aria-label="대기 말 ${piece.number} 선택" ${canUseReserve ? "" : "disabled"}><span>${piece.type === "normal" ? "" : "✦"}</span></button>`).join("") : '<em>대기 중인 말 없음</em>'}
        </div>
        <div class="augment-owned" aria-label="보유 증강">
          ${player.augments.length ? player.augments.map((augment) => {
            const definition = AUGMENTS_BY_ID[augment.id];
            const uses = augment.usesRemaining == null ? "∞" : augment.usesRemaining;
            return `<button type="button" data-owned-detail="${augment.id}" data-owned-player="${player.id}" title="${escapeHtml(definition.description)}"><b>${definition.icon}</b><span>${escapeHtml(definition.name)}</span><small>${uses}</small></button>`;
          }).join("") : '<em>보유 증강 없음</em>'}
        </div>
        ${this.playerStatusMarkup(player)}
        ${stacks.size ? `<p class="stack-note">업힌 묶음 ${[...stacks.values()].filter((count) => count > 1).length}개</p>` : ""}
        </div>
        ${player.eliminated ? '<span class="elimination-cross" aria-hidden="true">×</span>' : ""}
      </article>`;
  }

  playerStatusMarkup(player) {
    const statuses = [];
    if ((player.yutCount || 4) !== 4) statuses.push(`윷 ${player.yutCount}개`);
    if (player.health != null) statuses.push(`❤ 체력 ${player.health}`);
    if (player.resources.ritualCoins) statuses.push(`🔮 의식 ${player.resources.ritualCoins}/12`);
    if (player.resources.garlic) statuses.push(`🧄 마늘 ${player.resources.garlic}/4`);
    const monster = player.pieces.find((piece) => piece.type === "monster");
    if (monster) statuses.push(`👹 포획 ${monster.special?.captures || 0}/${monster.special?.target || 12}`);
    const queen = player.pieces.find((piece) => piece.type === "queen");
    if (queen) statuses.push(`♛ 목숨 ${queen.special?.lives || 1} · 투척 ${queen.special?.survivedThrows || 0}/12`);
    const kim = player.pieces.find((piece) => piece.type === "kim" && piece.node !== HOME);
    if (kim) statuses.push(`☂ 김첨지 ${kim.special?.remainingTurns || 0}차례`);
    const bomb = player.pieces.flatMap((piece) => piece.effects || []).find((effect) => effect.type === "bomb");
    if (bomb) statuses.push(`💣 폭발까지 ${Math.max(0, bomb.explodeRound - this.game.round)}R`);
    if (player.partyDisbandRound) statuses.push(`🧭 해산 R${player.partyDisbandRound}`);
    if (player.rankLocked) statuses.push(`🏅 ${player.rankLocked}위 확정`);
    const shields = player.pieces.filter((piece) => piece.effects?.some((effect) => effect.type === "shield")).length;
    if (shields) statuses.push(`🛡 보호막 ${shields}`);
    const frozen = player.pieces.filter((piece) => piece.effects?.some((effect) => effect.type === "freeze" && effect.untilRound >= this.game.round)).length;
    if (frozen) statuses.push(`❄ 이동 봉인 ${frozen}`);
    if (player.skipTurns) statuses.push(`⏭ 휴식 ${player.skipTurns}회`);
    if (player.eliminated) statuses.push("⛔ 탈락");
    return statuses.length ? `<div class="special-status">${statuses.map((status) => `<span>${escapeHtml(status)}</span>`).join("")}</div>` : "";
  }

  yutMarkup() {
    const sticks = this.lastThrow?.hidden ? [] : this.lastThrow?.sticks || [false, true, false, true].map((back, index) => ({ back, marked: index === 0 }));
    return `<div class="sticks">${this.lastThrow?.hidden ? '<span class="nak-mark">비공개</span>' : sticks.length ? sticks.map((stick, index) => `<i style="--i:${index}" class="${stick.back ? "back" : "front"} ${stick.marked ? "marked" : ""}"><span>${stick.marked && stick.back ? "●" : stick.back ? "뒤" : "앞"}</span></i>`).join("") : '<span class="nak-mark">낙!</span>'}</div><b class="yut-result-label">${this.lastThrow?.hidden ? "?" : this.lastThrow?.label || "준비"}</b>`;
  }

  throwControls(player, canControl = true) {
    const disabled = !canControl || this.game.turn.throwsRemaining < 1 || this.locked || this.onlineBusy || this.game.status !== "playing" || this.game.augmentDraft?.active || this.game.interaction?.active;
    const hasDogPig = this.game.augments.has(player, "dog_pig") && !player.pendingThrowOverride;
    if (hasDogPig) {
      return `<div class="dog-pig-controls"><button class="btn btn-throw" data-throw-label="도" ${disabled ? "disabled" : ""}>도 <small>1칸</small></button><button class="btn btn-throw" data-throw-label="개" ${disabled ? "disabled" : ""}>개 <small>2칸</small></button></div>`;
    }
    const reason = this.locked ? "애니메이션이 끝날 때까지 기다려 주세요." : this.game.turn.throwsRemaining < 1 ? "남은 던지기 기회가 없습니다." : "윷을 던집니다.";
    return `<button class="btn btn-throw" data-action="throw" title="${reason}" ${disabled ? "disabled" : ""}><span>윷 던지기</span><small>남은 기회 ${this.game.turn.throwsRemaining}</small></button>`;
  }

  augmentBar(player, canControl = true) {
    const augmentButtons = player.augments.map((augment) => {
      const definition = AUGMENTS_BY_ID[augment.id];
      const state = this.game.getAugmentState(player, augment.id);
      const manual = definition.activation === "manual";
      const status = augment.usesRemaining == null ? "지속" : `${augment.usesRemaining}회`;
      return `<button class="augment-action ${manual ? "manual" : "passive"}" data-augment="${augment.id}" ${!canControl || !manual || !state.availability.ok || this.locked || this.onlineBusy ? "disabled" : ""} title="${escapeHtml(!canControl ? "자신의 차례에 사용할 수 있습니다." : state.availability.ok ? definition.description : state.availability.reason)}"><span>${definition.icon}</span><b>${escapeHtml(definition.name)}</b><small>${status}</small></button>`;
    }).join("");
    const specialButtons = canControl ? this.game.getSpecialActions().map((action) => `<button class="augment-action special" data-special="${action.id}"><span>${action.type === "goblin" ? "🔥" : action.type === "mutual" ? "🙌" : "砲"}</span><b>${escapeHtml(action.label)}</b><small>턴당 1회</small></button>`).join("") : "";
    if (!augmentButtons && !specialButtons) return "";
    return `<div class="augment-bar"><span class="augment-bar-label">AUGMENTS</span>${augmentButtons}${specialButtons}</div>`;
  }

  augmentCategory(definition) {
    return definition.availability === "start" ? "시작 전용"
      : definition.availability === "middle" ? "중간 전용"
        : definition.availability === "finish" ? "마무리 전용" : "범용";
  }

  augmentDetailMarkup() {
    const definition = AUGMENTS_BY_ID[this.detailAugmentId];
    if (!definition) return "";
    const owner = this.game?.players.find((player) => player.id === this.detailOwnerId);
    const instance = owner?.augments.find((augment) => augment.id === definition.id);
    const uses = instance?.usesRemaining == null ? definition.uses == null ? "지속" : `${definition.uses}회` : `${instance.usesRemaining}회 남음`;
    return `<div class="overlay augment-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="augment-detail-title"><section class="augment-detail-card" style="--detail-color:${owner ? COLORS[owner.color] : "#f2b51d"}">
      <button class="modal-close" data-detail-close aria-label="닫기">×</button>
      <div class="detail-icon">${definition.icon}</div><p class="eyebrow">${this.augmentCategory(definition)} · ${escapeHtml(definition.activationLabel)}</p>
      <h2 id="augment-detail-title">${escapeHtml(definition.name)}</h2><p>${escapeHtml(definition.description)}</p>
      <dl><div><dt>소유자</dt><dd>${escapeHtml(owner?.name || "도감")}</dd></div><div><dt>사용 상태</dt><dd>${uses}</dd></div><div><dt>발동 방식</dt><dd>${escapeHtml(definition.activationLabel)}</dd></div></dl>
    </section></div>`;
  }

  augmentDraftMarkup() {
    const draft = this.game.augmentDraft;
    const player = draft.online ? this.onlineViewer() : this.game.draftPlayer;
    if (draft.online && draft.done) return `<div class="overlay augment-draft-overlay"><section class="augment-draft online-draft-wait" style="--draft-color:${COLORS[player?.color || "red"]}"><div class="waiting-orbit"><i></i><i></i><i></i></div><p class="eyebrow">ONLINE AUGMENT SELECT</p><h2>선택을 확정했습니다</h2><p>다른 플레이어가 증강을 고르는 중입니다.</p><small>후보와 선택 내용은 완료 전까지 각 플레이어에게만 보입니다.</small></section></div>`;
    if (!player) return "";
    return `<div class="overlay augment-draft-overlay"><section class="augment-draft" style="--draft-color:${COLORS[player.color]}">
      <header><p>ROUND ${draft.round} · AUGMENT SELECT</p><h2><span class="color-dot ${player.color}"></span>${escapeHtml(player.name)}의 증강 선택</h2><small>${draft.pick} / ${draft.picksPerPlayer} 선택 · 중복 없는 무작위 후보</small></header>
      <div class="augment-card-grid">${draft.candidates.map((id) => {
        const definition = AUGMENTS_BY_ID[id];
        const uses = definition.uses == null ? "지속" : `${definition.uses}회`;
        const category = this.augmentCategory(definition);
        return `<button class="augment-card" data-draft-augment="${id}" ${this.locked || this.isOnlineGame() && this.onlineConnection !== "connected" ? "disabled" : ""}><div class="card-shine"></div><i>${definition.icon}</i><span class="card-category">${category}</span><h3>${escapeHtml(definition.name)}</h3><p>${escapeHtml(definition.description)}</p><footer><b>${uses}</b><em>${escapeHtml(definition.activationLabel)}</em></footer></button>`;
      }).join("")}</div>
      <p class="draft-progress">${draft.online ? "개인 후보 · 선택 완료 후 동시 공개" : `${draft.playerIndex + 1} / ${draft.queue.length} 플레이어`}</p>
    </section></div>`;
  }

  abilityTargetNodes() {
    if (!this.abilityMode) return [];
    if (this.abilityMode.augmentId === "time_travel" && this.abilityMode.pieceId) {
      const piece = this.game.currentPlayer.pieces.find((candidate) => candidate.id === this.abilityMode.pieceId);
      return getPreviousNodes(piece).filter((node) => node !== WAIT);
    }
    if (this.abilityMode.type === "cannon") {
      const piece = this.game.currentPlayer.pieces.find((candidate) => candidate.id === this.abilityMode.pieceId);
      return this.game.augments.cannonTargets(piece);
    }
    return [];
  }

  abilityModalMarkup() {
    const mode = this.abilityMode;
    const player = this.game.currentPlayer;
    let title = "대상 선택";
    let body = "";
    if (mode.kind === "special" && mode.type === "goblin") {
      title = "도깨비 걸음";
      body = `<p>이번 차례에 이동할 방향을 고르세요.</p><div class="ability-options"><button data-special-steps="1"><b>도</b><span>한 칸 전진</span></button><button data-special-steps="-1"><b>백도</b><span>한 칸 후진</span></button></div>`;
    } else if (mode.kind === "special" && mode.type === "cannon") {
      title = "포격 이동";
      const piece = player.pieces.find((candidate) => candidate.id === mode.pieceId);
      body = `<p>말이 있는 칸 하나를 넘은 뒤 도착할 직선 칸을 고르세요.</p><div class="node-options">${this.game.augments.cannonTargets(piece).map((node) => `<button data-special-node="${node}">${this.nodeLabel(node)}</button>`).join("")}</div>`;
    } else {
      const definition = AUGMENTS_BY_ID[mode.augmentId];
      title = definition.name;
      if (definition.targetType === "throwChoice") {
        body = `<p>다음 투척에서 만들 결과를 고르세요.</p><div class="ability-options six">${["백도","도","개","걸","윷","모"].map((label) => `<button data-throw-choice="${label}"><b>${label}</b></button>`).join("")}</div>`;
      } else if (definition.targetType === "throwStick") {
        body = `<p>미사용 결과에서 뒤집을 윷가락을 고르세요. 추가 던지기는 소급 변경되지 않습니다.</p><div class="stored-throws">${this.game.turn.results.filter((result) => result.sticks?.length).map((result) => `<section><b>${result.label}</b><div>${result.sticks.map((stick, index) => `<button data-flip-result="${result.id}" data-flip-stick="${index}" class="stick-target ${stick.back ? "back" : "front"}">${stick.back ? "뒤" : "앞"}${stick.marked ? " ●" : ""}</button>`).join("")}</div></section>`).join("")}</div>`;
      } else if (definition.targetType === "pieceThenPreviousNode" && mode.pieceId) {
        const piece = player.pieces.find((candidate) => candidate.id === mode.pieceId);
        body = `<p>말 ${piece.number}을 이동할 뒤쪽 칸을 고르세요.</p><div class="node-options">${getPreviousNodes(piece).filter((node) => node !== WAIT).map((node) => `<button data-time-node="${node}">${this.nodeLabel(node)}</button>`).join("")}</div>`;
      } else if (definition.targetType === "none") {
        body = `<p>${escapeHtml(definition.description)}</p><button class="btn btn-primary full" data-simple-use>능력 사용</button>`;
      } else if (definition.targetType === "boardNode") {
        body = `<p>효과를 설치할 윷판 칸을 고르세요.</p><div class="node-options">${Object.keys(NODES).filter((node) => node !== HOME).map((node) => `<button data-board-node="${node}">${this.nodeLabel(node)}</button>`).join("")}</div>`;
      } else if (definition.targetType === "bluffChoice") {
        body = `<p>다음 투척에서 다른 플레이어에게 선언할 결과를 미리 고르세요.</p><div class="ability-options six">${["백도","도","개","걸","윷","모"].map((label) => `<button data-bluff-label="${label}"><b>${label}</b></button>`).join("")}</div>`;
      } else if (definition.targetType === "opponentAugment") {
        body = `<p>3라운드 동안 고양이로 바꿀 상대의 미사용 증강을 고르세요.</p><div class="target-list">${this.game.players.filter((target) => target.id !== player.id).flatMap((target) => target.augments.filter((augment) => (augment.usesRemaining ?? 1) > 0).map((augment) => `<button data-illusion-player="${target.id}" data-illusion-augment="${augment.id}"><b>${escapeHtml(target.name)}</b><span>${AUGMENTS_BY_ID[augment.id].icon} ${escapeHtml(AUGMENTS_BY_ID[augment.id].name)}</span></button>`)).join("")}</div>`;
      } else if (["flickMiniGame", "playerMiniGame"].includes(definition.targetType)) {
        body = `<p>상대를 고르고 게이지를 움직여 중앙 타이밍에 멈추세요.</p><form class="mini-game-form" data-mini-game><div class="target-list">${this.game.players.filter((target) => target.id !== player.id && !target.eliminated).map((target, index) => `<label><input type="radio" name="playerId" value="${target.id}" ${index === 0 ? "checked" : ""}><span>${escapeHtml(target.name)}</span></label>`).join("")}</div><label class="aim-meter"><span>힘 조절</span><input type="range" name="power" min="0" max="100" value="20"><i></i></label><button class="btn btn-primary full" type="submit">지금!</button></form>`;
      } else if (definition.targetType === "twoPlayers") {
        const selected = new Set(mode.selectedPlayerIds || []);
        body = `<p>죄수의 딜레마에 참여할 다른 플레이어 두 명을 고르세요.</p><div class="target-list">${this.game.players.filter((target) => target.id !== player.id && !target.eliminated).map((target) => `<button data-player-target="${target.id}" class="${selected.has(target.id) ? "selected" : ""}"><b>${escapeHtml(target.name)}</b><span>${selected.has(target.id) ? "선택됨" : "선택"}</span></button>`).join("")}</div>${selected.size === 2 ? '<button class="btn btn-primary full" data-two-player-confirm>딜레마 시작</button>' : ""}`;
      } else if (definition.targetType === "eliminatedPlayer") {
        body = `<p>부활시킬 탈락 플레이어를 고르세요.</p><div class="target-list">${this.game.players.filter((target) => target.eliminated).map((target) => `<button data-eliminated-player="${target.id}"><b>${escapeHtml(target.name)}</b><span>부활</span></button>`).join("")}</div>`;
      } else {
        const pieces = player.pieces.filter((piece) => {
          if (["ownStack", "ownBoardPiece", "twoStacks", "largeStack", "tripleStack"].includes(definition.targetType)) {
            if ([WAIT, HOME].includes(piece.node)) return false;
            if (definition.targetType === "largeStack") return this.game.getStack(player, piece).length >= 2;
            if (definition.targetType === "tripleStack") return this.game.getStack(player, piece).length >= 3;
            return true;
          }
          if (["normalPiece", "waitingNormalPiece", "pieceThenPreviousNode"].includes(definition.targetType)) return piece.type === "normal" && piece.node !== HOME && (definition.targetType !== "waitingNormalPiece" || piece.node === WAIT) && (definition.targetType !== "pieceThenPreviousNode" || getPreviousNodes(piece).some((node) => node !== WAIT));
          return false;
        });
        const seenNodes = new Set();
        const stackTarget = ["ownStack", "twoStacks", "largeStack", "tripleStack"].includes(definition.targetType);
        const selected = new Set(mode.selectedPieceIds || []);
        body = `<p>${["normalPiece", "waitingNormalPiece"].includes(definition.targetType) ? "변환할 일반말" : definition.targetType === "twoStacks" ? "서로 다른 말뭉치 두 개" : definition.targetType === "ownBoardPiece" ? "희생할 말 하나" : "능력을 적용할 말뭉치"}를 고르세요.</p><div class="piece-targets">${pieces.filter((piece) => {
          const stackKey = `${piece.node}:${piece.stackId || "legacy"}`;
          return !stackTarget || !seenNodes.has(stackKey) && seenNodes.add(stackKey);
        }).map((piece) => `<button data-ability-piece="${piece.id}" class="${selected.has(piece.id) ? "selected" : ""}"><i class="type-${piece.type}"></i><b>말 ${piece.number}${stackTarget ? ` · ${this.game.getStack(player, piece).length}개` : ""}</b><span>${this.nodeLabel(piece.node)}</span></button>`).join("")}</div>${definition.targetType === "twoStacks" && selected.size === 2 ? '<button class="btn btn-primary full" data-two-stack-confirm>바둑 실행</button>' : ""}`;
      }
    }
    return `<div class="overlay ability-overlay"><section class="ability-modal" style="--player:${COLORS[player.color]}"><button class="modal-close" data-ability-close aria-label="취소">×</button><p class="eyebrow">TARGET MODE</p><h2>${escapeHtml(title)}</h2>${body}</section></div>`;
  }

  interactionMarkup() {
    const interaction = this.game.interaction;
    if (interaction.type === "waiting") {
      const actor = this.game.players.find((player) => player.id === interaction.data.requiredActorId);
      return `<div class="overlay interaction-overlay"><section class="ability-modal interaction-modal online-interaction-wait"><div class="waiting-orbit"><i></i><i></i><i></i></div><p class="eyebrow">ONLINE INTERACTION</p><h2>${escapeHtml(actor?.name || "다른 플레이어")}의 선택을 기다리는 중</h2><p>비공개 선택은 해당 플레이어의 기기에만 표시됩니다.</p></section></div>`;
    }
    const owner = this.game.players.find((player) => player.id === interaction.ownerId);
    let title = "선택을 이어가세요";
    let body = "";
    if (interaction.type === "startTransform") {
      title = "시작 변환: 김첨지";
      body = `<p>6번의 내 차례 안에 완주를 노릴 일반 말을 고르세요.</p><div class="piece-targets">${owner.pieces.filter((piece) => piece.type === "normal").map((piece) => `<button data-start-transform="${piece.id}"><i></i><b>말 ${piece.number}</b><span>${this.nodeLabel(piece.node)}</span></button>`).join("")}</div>`;
    } else if (interaction.type === "freezeStack") {
      title = "잠깐!";
      body = `<p>다른 플레이어별 가장 앞선 말뭉치 중 하나를 2라운드 동안 묶으세요.</p><div class="target-list">${this.game.players.filter((target) => target.id !== owner.id).flatMap((target) => this.game.augments.leadingStacks(target).map((piece) => `<button data-freeze-player="${target.id}" data-freeze-piece="${piece.id}"><b>${escapeHtml(target.name)} · 말 ${piece.number}</b><span>${this.nodeLabel(piece.node)}</span></button>`)).join("")}</div>`;
    } else if (interaction.type === "rankingPrediction") {
      const rank = interaction.data.selected.length + 1;
      title = `계획대로 · ${rank}위 예측`;
      body = `<p>최종 ${rank}위가 될 플레이어를 고르세요. 모든 순위를 순서대로 지정합니다.</p><div class="target-list">${this.game.players.filter((target) => !interaction.data.selected.includes(target.id)).map((target) => `<button data-ranking-player="${target.id}"><b>${escapeHtml(target.name)}</b><span>${rank}위</span></button>`).join("")}</div>`;
    } else if (interaction.type === "foldDirection") {
      title = "게임 접어라";
      body = '<p>논리 경로는 유지되고, 겹친 물리 칸은 같은 칸으로 판정됩니다.</p><div class="ability-options"><button data-fold="vertical"><b>좌우로 접기</b></button><button data-fold="horizontal"><b>위아래로 접기</b></button></div>';
    } else if (interaction.type === "givePiece") {
      title = "거머리 · 운명 연결";
      body = `<p>말 하나와 받을 플레이어를 한 쌍으로 선택하세요.</p><div class="target-list">${owner.pieces.flatMap((piece) => this.game.players.filter((target) => target.id !== owner.id).map((target) => `<button data-give-piece="${piece.id}" data-give-player="${target.id}"><b>말 ${piece.number} → ${escapeHtml(target.name)}</b><span>${this.nodeLabel(piece.node)}</span></button>`)).join("")}</div>`;
    } else if (interaction.type === "colorGuess") {
      const voter = this.game.players.find((player) => player.id === interaction.data.voters[interaction.data.index]);
      title = `${escapeHtml(voter.name)}의 색 추리`;
      body = `<p>‘나 누구게?’ 소유자의 색을 맞혀 보세요. 틀리면 한 차례를 건너뜁니다.</p><div class="ability-options">${this.game.players.map((player) => `<button data-color-guess="${player.color}"><b>${COLOR_LABELS[player.color]}</b></button>`).join("")}</div>`;
    } else if (interaction.type === "vote") {
      const voter = this.game.players.find((player) => player.id === interaction.data.voters[interaction.data.index]);
      title = `${escapeHtml(voter.name)}의 비밀 투표`;
      body = `<p>${voter.id === owner.id ? "소유자의 표는 2표로 계산됩니다." : "한 명을 선택하세요."}</p><div class="target-list">${this.game.players.filter((player) => !player.eliminated).map((player) => `<button data-vote-player="${player.id}"><b>${escapeHtml(player.name)}</b></button>`).join("")}</div>`;
    } else if (["detective", "delivery"].includes(interaction.type)) {
      title = interaction.type === "detective" ? "명탐정 · 무효화" : "배달 · 다음 증강 예약";
      const excluded = new Set(owner.augments.map((augment) => augment.id));
      body = `<p>${interaction.type === "detective" ? "이번 선택에서 제거할 증강을 고르세요." : "다음 선택에 확정 등장시킬 증강을 고르세요."}</p><div class="catalog-picker">${IMPLEMENTED_AUGMENTS.filter((definition) => !excluded.has(definition.id) && (interaction.type !== "detective" || definition.id !== "detective")).map((definition) => `<button data-catalog-pick="${definition.id}">${definition.icon} ${escapeHtml(definition.name)}</button>`).join("")}</div>`;
    } else if (interaction.type === "freeRide") {
      title = "무임승차";
      body = '<p>상대 말을 잡는 대신 올라타 함께 이동할 수 있습니다.</p><div class="ability-options"><button data-ride-action="ride"><b>올라타기</b><span>던지기 +1</span></button><button data-ride-action="capture"><b>포획하기</b><span>기본 규칙</span></button></div>';
    } else if (interaction.type === "bluff") {
      const judge = this.game.players.find((player) => player.id === interaction.data.judges[interaction.data.index]);
      title = `${escapeHtml(judge.name)}의 블러핑 판정`;
      body = `<p>${escapeHtml(owner.name)}의 선언은 <strong>‘${interaction.data.declaredLabel}’</strong>입니다. 실제 결과라고 믿나요?</p><div class="ability-options"><button data-bluff-judge="false"><b>믿는다</b></button><button data-bluff-judge="true"><b>거짓이다</b></button></div>`;
    } else if (interaction.type === "prisoners") {
      const acting = this.game.players.find((player) => player.id === interaction.data.players[interaction.data.index]);
      title = `${escapeHtml(acting.name)}의 비밀 선택`;
      body = '<p>두 선택은 상대에게 공개되지 않습니다.</p><div class="ability-options"><button data-prisoner="cooperate"><b>협력</b><span>둘 다 협력하면 둘 다 도</span></button><button data-prisoner="betray"><b>배신</b><span>혼자 배신하면 모</span></button></div>';
    }
    return `<div class="overlay interaction-overlay"><section class="ability-modal interaction-modal"><p class="eyebrow">${this.isOnlineGame() ? "ONLINE INTERACTION" : "LOCAL INTERACTION"}</p><h2>${title}</h2>${body}</section></div>`;
  }

  actionStep(result) {
    if (this.game.augmentDraft?.active) return "증강 선택";
    if (this.game.status === "finished") return "게임 종료";
    if (!this.canControlTurn()) return "상대 차례";
    if (this.game.turn.throwsRemaining > 0 && !this.game.turn.results.length) return "STEP 1 · 던지기";
    if (!result && this.selectedPieceId) return "STEP 2 · 이동 결과 선택";
    if (!result && this.game.turn.results.length) return "STEP 2 · 결과 선택";
    if (result && !this.selectedPieceId) return "STEP 3 · 말 선택";
    if (result) return "STEP 4 · 경로 선택";
    return "마무리";
  }

  actionInstruction(result, pathOptions) {
    if (this.game.augmentDraft?.active) return this.game.augmentDraft.online ? this.game.augmentDraft.done ? "다른 플레이어의 선택을 기다리는 중" : "내 기기에 공개된 후보 중 하나를 고르세요" : `${this.game.draftPlayer.name}의 선택을 기다리는 중`;
    if (this.game.status === "finished") return "승자가 결정되었습니다";
    if (!this.canControlTurn()) return `${this.game.currentPlayer.name}의 행동을 기다리고 있습니다`;
    if (!result && this.selectedPieceId) return "선택한 말에 사용할 이동 결과를 고르세요";
    if (!result && this.game.turn.results.length) return "결과를 고르거나, 플레이어 패널의 대기 말을 바로 누르세요";
    if (result && !this.selectedPieceId) return `${result.label}로 움직일 말을 고르세요`;
    if (pathOptions.length > 1) return "갈림길에서 경로를 고르세요";
    if (pathOptions.length === 1) return "예상 경로를 확인하고 이동을 확정하세요";
    if (this.game.turn.throwsRemaining > 0) return "윷을 힘차게 던져보세요";
    if (this.game.canEndTurn()) return "모든 행동을 마쳤습니다";
    return "이동 결과를 처리해 주세요";
  }

  pieceChoices(result, pathOptions) {
    const movable = new Set(this.game.getMovablePieces(result.id).map((piece) => piece.id));
    const visiblePlayers = this.game.augments.has(this.game.currentPlayer, "hypnosis") ? this.game.players : [this.game.currentPlayer];
    return `
      <div class="piece-choices">
        ${visiblePlayers.flatMap((owner) => owner.pieces.map((piece) => `<button data-piece="${piece.id}" class="piece-choice ${piece.id === this.selectedPieceId ? "selected" : ""}" style="--piece-color:${COLORS[owner.color]}" ${!this.canControlTurn() || !movable.has(piece.id) || this.locked || this.onlineBusy ? "disabled" : ""}><i></i><b>${owner.id === this.game.currentPlayer.id ? "" : `${escapeHtml(owner.name)} · `}말 ${piece.number}</b><span>${this.nodeLabel(piece.node)}</span></button>`)).join("")}
        ${pathOptions.length ? `<div class="route-choices">${pathOptions.map((option, index) => `<button data-route="${index}" class="route-choice"><b>${pathOptions.length === 1 ? "이동 확정" : option.label}</b><span>${this.nodeLabel(option.target)} 도착</span></button>`).join("")}</div>` : ""}
      </div>`;
  }

  stackChoiceMarkup() {
    const pending = this.pendingMove;
    const owner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === pending.pieceId));
    const piece = owner?.pieces.find((candidate) => candidate.id === pending.pieceId);
    return `<div class="overlay stack-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="stack-choice-title">
      <section class="stack-choice-card" style="--player:${COLORS[owner?.color] || "#f2b51d"}">
        <p class="eyebrow">같은 칸에 내 말이 있습니다</p>
        <h2 id="stack-choice-title">말을 업을까요?</h2>
        <p>말 ${piece?.number || ""}을 기존 말과 한 묶음으로 움직이거나, 같은 칸에 따로 둘 수 있습니다. 따로 두어도 상대에게 잡히면 그 칸의 말은 모두 잡힙니다.</p>
        <div class="stack-choice-actions">
          <button type="button" data-stack-choice="stack"><span>●●</span><b>업기</b><small>다음부터 함께 이동</small></button>
          <button type="button" data-stack-choice="separate"><span>● · ●</span><b>따로 두기</b><small>각 말뭉치를 따로 이동</small></button>
        </div>
        <button type="button" class="selection-cancel" data-stack-choice-cancel>이동 취소</button>
      </section>
    </div>`;
  }

  nodeLabel(node) {
    if (node === WAIT) return "대기";
    if (node === HOME) return "완주";
    if (node === "C") return "중앙";
    const labels = { TR: "우상단 갈림길", TL: "좌상단 갈림길", BL: "좌하단 큰밭", R1: "도", R2: "개", R3: "걸", R4: "윷" };
    return labels[node] || `판 위 · ${node}`;
  }

  boardNodeDescription(node) {
    const pieces = this.game.players.flatMap((player) => player.pieces.filter((piece) => piece.node === node).map((piece) => ({ player, piece })));
    const markers = (this.game.boardState.markers || []).filter((marker) => marker.node === node);
    const details = [];
    if (pieces.length) details.push(...pieces.map(({ player, piece }) => `${player.name} 말 ${piece.number}${piece.type !== "normal" ? ` · ${piece.type}` : ""}`));
    if (markers.length) details.push(...markers.map((marker) => ({ trap: "함정", reward: "보상", garlic: "마늘", campfire: "화톳불", sharpshooter: "명사수 표적", assassin: "암살자의 영혼", poop: "장애물" }[marker.type] || marker.type)));
    return `<b>${escapeHtml(this.nodeLabel(node))}</b><span>${escapeHtml(details.join(" · ") || "비어 있는 칸")}</span>`;
  }

  bindBoard(canvas, pathOptions) {
    const tooltip = this.root.querySelector(".board-tooltip");
    const stage = this.root.querySelector(".board-stage");
    const updateHover = (event) => {
      const node = this.board.hitTest(event.clientX, event.clientY);
      this.board.setHoveredNode(node);
      if (!tooltip || !stage || !node) {
        tooltip?.classList.remove("visible");
        return;
      }
      const rect = stage.getBoundingClientRect();
      tooltip.innerHTML = this.boardNodeDescription(node);
      tooltip.style.left = `${Math.min(rect.width - 150, Math.max(90, event.clientX - rect.left))}px`;
      tooltip.style.top = `${Math.max(54, event.clientY - rect.top - 18)}px`;
      tooltip.classList.add("visible");
    };
    canvas.addEventListener("pointermove", updateHover);
    canvas.addEventListener("pointerleave", () => { this.board.setHoveredNode(null); tooltip?.classList.remove("visible"); });
    const activateHoveredRoute = () => {
      if (!this.selectedPieceId || !this.board.hoveredNode || this.locked) return;
      const index = pathOptions.findIndex((option) => option.target === this.board.hoveredNode);
      if (index >= 0) this.prepareMove(this.selectedPieceId, index);
    };
    canvas.addEventListener("click", activateHoveredRoute);
    canvas.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); activateHoveredRoute(); } });
  }

  bindGame() {
    this.root.querySelector('[data-action="throw"]')?.addEventListener("click", () => this.handleThrow());
    this.root.querySelectorAll("[data-throw-label]").forEach((button) => button.addEventListener("click", () => this.handleThrow(button.dataset.throwLabel)));
    this.root.querySelector('[data-action="end-turn"]')?.addEventListener("click", () => this.handleEndTurn());
    this.root.querySelector('[data-action="cancel-selection"]')?.addEventListener("click", () => { this.selectedResultId = null; this.selectedPieceId = null; this.pendingMove = null; this.renderGame(); });
    this.root.querySelectorAll("[data-result]").forEach((button) => button.addEventListener("click", () => this.selectResult(button.dataset.result)));
    this.root.querySelectorAll("[data-piece]").forEach((button) => button.addEventListener("click", () => this.selectPiece(button.dataset.piece)));
    this.root.querySelectorAll("[data-direct-piece]").forEach((button) => button.addEventListener("click", () => this.selectDirectPiece(button.dataset.directPiece)));
    this.root.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => this.prepareMove(this.selectedPieceId, Number(button.dataset.route))));
    this.root.querySelectorAll("[data-stack-choice]").forEach((button) => button.addEventListener("click", () => {
      const pending = this.pendingMove;
      if (!pending) return;
      this.pendingMove = null;
      this.performMove(pending.pieceId, pending.optionIndex, button.dataset.stackChoice, pending.resultId);
    }));
    this.root.querySelector("[data-stack-choice-cancel]")?.addEventListener("click", () => { this.pendingMove = null; this.renderGame(); });
    this.root.querySelectorAll("[data-augment]").forEach((button) => button.addEventListener("click", () => this.openAugmentAbility(button.dataset.augment)));
    this.root.querySelectorAll("[data-special]").forEach((button) => button.addEventListener("click", () => this.openSpecialAbility(button.dataset.special)));
    this.root.querySelectorAll("[data-draft-augment]").forEach((button) => button.addEventListener("click", () => this.chooseDraftAugment(button.dataset.draftAugment)));
    this.root.querySelectorAll("[data-player-toggle]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.playerToggle;
      if (this.expandedPlayerIds.has(id)) this.expandedPlayerIds.delete(id); else this.expandedPlayerIds.add(id);
      this.renderGame();
    }));
    this.root.querySelectorAll("[data-owned-detail]").forEach((button) => button.addEventListener("click", () => {
      this.detailAugmentId = button.dataset.ownedDetail;
      this.detailOwnerId = button.dataset.ownedPlayer;
      this.renderGame();
    }));
    this.root.querySelector('[data-detail-close]')?.addEventListener("click", () => { this.detailAugmentId = null; this.detailOwnerId = null; this.renderGame(); });
    this.root.querySelector('[data-ability-close]')?.addEventListener("click", () => { this.abilityMode = null; this.renderGame(); });
    this.root.querySelectorAll("[data-throw-choice]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ label: button.dataset.throwChoice })));
    this.root.querySelectorAll("[data-flip-result]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ resultId: button.dataset.flipResult, stickIndex: Number(button.dataset.flipStick) })));
    this.root.querySelectorAll("[data-ability-piece]").forEach((button) => button.addEventListener("click", () => this.handleAbilityPiece(button.dataset.abilityPiece)));
    this.root.querySelectorAll("[data-time-node]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ pieceId: this.abilityMode.pieceId, targetNode: button.dataset.timeNode })));
    this.root.querySelectorAll("[data-special-steps]").forEach((button) => button.addEventListener("click", () => this.commitSpecial({ steps: Number(button.dataset.specialSteps) })));
    this.root.querySelectorAll("[data-special-node]").forEach((button) => button.addEventListener("click", () => this.commitSpecial({ targetNode: button.dataset.specialNode })));
    this.root.querySelector("[data-simple-use]")?.addEventListener("click", () => this.commitAugment({}));
    this.root.querySelectorAll("[data-board-node]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ node: button.dataset.boardNode })));
    this.root.querySelectorAll("[data-bluff-label]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ declaredLabel: button.dataset.bluffLabel })));
    this.root.querySelectorAll("[data-illusion-player]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ playerId: button.dataset.illusionPlayer, targetAugmentId: button.dataset.illusionAugment })));
    this.root.querySelectorAll("[data-eliminated-player]").forEach((button) => button.addEventListener("click", () => this.commitAugment({ playerId: button.dataset.eliminatedPlayer })));
    this.root.querySelectorAll("[data-player-target]").forEach((button) => button.addEventListener("click", () => this.toggleAbilityPlayer(button.dataset.playerTarget)));
    this.root.querySelector("[data-two-player-confirm]")?.addEventListener("click", () => this.commitAugment({ playerIds: this.abilityMode.selectedPlayerIds }));
    this.root.querySelector("[data-two-stack-confirm]")?.addEventListener("click", () => this.commitAugment({ pieceIdA: this.abilityMode.selectedPieceIds[0], pieceIdB: this.abilityMode.selectedPieceIds[1] }));
    this.root.querySelector("[data-mini-game]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      this.commitAugment({ playerId: values.get("playerId"), power: Number(values.get("power")), target: 65 });
    });
    this.bindInteraction();
    this.root.querySelector('[data-action="menu"]')?.addEventListener("click", () => { this.detailAugmentId = null; this.renderMenu(); });
    this.root.querySelector('[data-action="online-home"]')?.addEventListener("click", () => {
      this.exitOnlineView();
    });
    this.root.querySelector('[data-action="rules"]')?.addEventListener("click", () => { this.modal = "rules"; this.renderGame(); });
    this.root.querySelector('[data-action="rematch"]')?.addEventListener("click", () => this.renderSetup());
    this.root.querySelector('[data-action="online-rematch"]')?.addEventListener("click", async () => {
      try { await this.onlineClient.rematch(); } catch (error) { this.toast(error.message); }
    });
    this.root.querySelector('[data-action="main-menu"]')?.addEventListener("click", () => this.isOnlineGame() ? this.exitOnlineView() : this.renderMenu());
    this.bindModal();
  }

  async handleThrow(requestedLabel = null) {
    if (this.locked) return;
    if (this.isOnlineGame()) {
      await this.sendOnlineCommand("throw", { requestedLabel });
      return;
    }
    this.locked = true;
    try {
      // 결과는 먼저 확정하고, 이후 애니메이션은 확정된 상태만 표현한다.
      this.lastThrow = this.game.throw(requestedLabel);
      this.selectedResultId = null;
      this.selectedPieceId = null;
      this.pendingMove = null;
      this.save();
      this.throwFx = { label: this.lastThrow.label, extra: Boolean(this.lastThrow.extra), count: this.lastThrow.sticks?.length || 0 };
      this.renderGame();
      await sleep(820 / this.game.settings.animationSpeed);
      const autoMoves = this.lastThrow.autoMoves || [];
      if (autoMoves.length) {
        this.renderGame();
        this.locked = true;
        for (const event of autoMoves) await this.board.animateMove(event, this.game.settings.animationSpeed);
      }
    } catch (error) { this.toast(error.message); }
    this.throwFx = null;
    this.locked = false;
    this.renderGame();
  }

  selectResult(resultId) {
    if (this.locked) return;
    if (!this.game.getMovablePieces(resultId).length) {
      if (this.isOnlineGame()) {
        this.sendOnlineCommand("discardResult", { resultId });
        return;
      }
      this.game.discardResult(resultId);
      this.save();
      this.renderGame();
      return;
    }
    const directPieceId = this.selectedResultId ? null : this.selectedPieceId;
    this.selectedResultId = this.selectedResultId === resultId ? null : resultId;
    if (!this.selectedResultId) this.selectedPieceId = null;
    else if (directPieceId) {
      const movable = this.game.getMovablePieces(resultId).some((piece) => piece.id === directPieceId);
      this.selectedPieceId = movable ? directPieceId : null;
      if (movable) {
        const owner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === directPieceId));
        const piece = owner?.pieces.find((candidate) => candidate.id === directPieceId);
        const result = this.game.getResult(resultId);
        const options = this.game.getMoveOptionsForPiece(piece, result, owner);
        if (options.length === 1) return this.prepareMove(directPieceId, 0);
      }
    } else this.selectedPieceId = null;
    this.renderGame();
  }

  selectDirectPiece(pieceId) {
    if (this.locked || this.onlineBusy || !this.canControlTurn()) return;
    const candidates = this.game.turn.results.filter((result) => !result.hidden
      && this.game.getMovablePieces(result.id).some((piece) => piece.id === pieceId));
    if (!candidates.length) return this.toast("이 말을 움직일 수 있는 결과가 없습니다.");
    this.selectedPieceId = pieceId;
    if (candidates.length > 1) {
      this.selectedResultId = null;
      this.announceEvent("말 선택 완료", "이 말에 사용할 이동 결과를 눌러 주세요.", "guide");
      this.renderGame();
      return;
    }
    this.selectedResultId = candidates[0].id;
    const owner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === pieceId));
    const piece = owner?.pieces.find((candidate) => candidate.id === pieceId);
    const options = this.game.getMoveOptionsForPiece(piece, candidates[0], owner);
    if (options.length === 1) this.prepareMove(pieceId, 0);
    else this.renderGame();
  }

  selectPiece(pieceId) {
    const result = this.game.getResult(this.selectedResultId);
    if (!result || this.locked) return;
    const owner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === pieceId));
    const piece = owner?.pieces.find((candidate) => candidate.id === pieceId);
    const options = this.game.getMoveOptionsForPiece(piece, result, owner);
    if (!options.length) return;
    this.selectedPieceId = this.selectedPieceId === pieceId ? null : pieceId;
    this.renderGame();
  }

  prepareMove(pieceId, optionIndex) {
    if (this.locked) return;
    const result = this.game.getResult(this.selectedResultId);
    const owner = this.game.players.find((player) => player.pieces.some((piece) => piece.id === pieceId));
    const piece = owner?.pieces.find((candidate) => candidate.id === pieceId);
    const option = piece && result ? this.game.getMoveOptionsForPiece(piece, result, owner)[optionIndex] : null;
    if (!option) return this.toast("선택한 경로로 이동할 수 없습니다.");
    const moving = this.game.getStack(owner, piece);
    if (this.game.needsStackChoice(owner, moving, option.target)) {
      this.pendingMove = { pieceId, resultId: result.id, optionIndex, target: option.target };
      this.renderGame();
      return;
    }
    this.performMove(pieceId, optionIndex, "stack", result.id);
  }

  async performMove(pieceId, optionIndex, stackMode = "stack", resultIdOverride = null) {
    if (this.locked) return;
    const resultId = resultIdOverride || this.selectedResultId;
    if (this.isOnlineGame()) {
      this.selectedResultId = null;
      this.selectedPieceId = null;
      await this.sendOnlineCommand("move", { pieceId, resultId, optionIndex, stackMode });
      return;
    }
    this.locked = true;
    try {
      const event = this.game.move(pieceId, resultId, optionIndex, stackMode);
      this.selectedResultId = null;
      this.selectedPieceId = null;
      this.save();
      if (event.capturedIds.length) this.announceEvent("잡았다!", `상대 말 ${event.capturedIds.length}개를 잡아 한 번 더 던집니다.`, "capture");
      else if (event.target === HOME) this.announceEvent("완주!", "말이 결승점에 도착했습니다.", "finish");
      else if (stackMode === "separate") this.announceEvent("따로 두기", "같은 칸에서 서로 다른 말뭉치로 이동합니다.", "guide");
      this.renderGame();
      this.locked = true;
      await this.board.animateMove(event, this.game.settings.animationSpeed);
    } catch (error) { this.toast(error.message); }
    this.locked = false;
    this.renderGame();
  }

  openAugmentAbility(augmentId) {
    const state = this.game.getAugmentState(this.game.currentPlayer, augmentId);
    if (!state.availability.ok) return this.toast(state.availability.reason);
    this.abilityMode = { kind: "augment", augmentId, pieceId: null };
    this.renderGame();
  }

  openSpecialAbility(actionId) {
    const action = this.game.getSpecialActions().find((candidate) => candidate.id === actionId);
    if (!action) return this.toast("이번 차례에 사용할 수 없는 특수 행동입니다.");
    if (action.type === "mutual") {
      this.abilityMode = { kind: "special", actionId, type: action.type };
      this.commitSpecial({});
      return;
    }
    this.abilityMode = { kind: "special", actionId, type: action.type, pieceId: action.pieceId };
    this.renderGame();
  }

  async chooseDraftAugment(augmentId) {
    if (this.locked) return;
    this.locked = true;
    const card = this.root.querySelector(`[data-draft-augment="${augmentId}"]`);
    card?.classList.add("chosen");
    await sleep(320);
    try {
      if (this.isOnlineGame()) await this.onlineClient.command("draft:select", { augmentId });
      else { this.game.selectDraftAugment(augmentId); this.save(); }
    } catch (error) { this.toast(error.message); }
    this.locked = false;
    this.renderGame();
  }

  handleAbilityPiece(pieceId) {
    if (this.abilityMode?.augmentId === "time_travel") {
      this.abilityMode.pieceId = pieceId;
      this.renderGame();
      return;
    }
    if (AUGMENTS_BY_ID[this.abilityMode?.augmentId]?.targetType === "twoStacks") {
      const selected = new Set(this.abilityMode.selectedPieceIds || []);
      if (selected.has(pieceId)) selected.delete(pieceId);
      else if (selected.size < 2) selected.add(pieceId);
      this.abilityMode.selectedPieceIds = [...selected];
      this.renderGame();
      return;
    }
    this.commitAugment({ pieceId });
  }

  toggleAbilityPlayer(playerId) {
    const selected = new Set(this.abilityMode.selectedPlayerIds || []);
    if (selected.has(playerId)) selected.delete(playerId);
    else if (selected.size < 2) selected.add(playerId);
    this.abilityMode.selectedPlayerIds = [...selected];
    this.renderGame();
  }

  bindInteraction() {
    this.root.querySelectorAll("[data-start-transform]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ pieceId: button.dataset.startTransform })));
    this.root.querySelectorAll("[data-freeze-player]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ playerId: button.dataset.freezePlayer, pieceId: button.dataset.freezePiece })));
    this.root.querySelectorAll("[data-ranking-player]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ playerId: button.dataset.rankingPlayer })));
    this.root.querySelectorAll("[data-fold]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ direction: button.dataset.fold })));
    this.root.querySelectorAll("[data-give-piece]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ pieceId: button.dataset.givePiece, playerId: button.dataset.givePlayer })));
    this.root.querySelectorAll("[data-color-guess]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ color: button.dataset.colorGuess })));
    this.root.querySelectorAll("[data-vote-player]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ playerId: button.dataset.votePlayer })));
    this.root.querySelectorAll("[data-catalog-pick]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ augmentId: button.dataset.catalogPick })));
    this.root.querySelectorAll("[data-ride-action]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ action: button.dataset.rideAction })));
    this.root.querySelectorAll("[data-bluff-judge]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ accuse: button.dataset.bluffJudge === "true" })));
    this.root.querySelectorAll("[data-prisoner]").forEach((button) => button.addEventListener("click", () => this.commitInteraction({ action: button.dataset.prisoner })));
  }

  commitInteraction(choice) {
    if (this.locked) return;
    if (this.isOnlineGame()) {
      if (this.onlineConnection !== "connected") return this.toast("서버 재접속이 끝날 때까지 기다려 주세요.");
      this.sendOnlineCommand("interaction:resolve", choice);
      return;
    }
    try {
      this.game.resolveInteraction(choice);
      this.save();
      this.renderGame();
    } catch (error) { this.toast(error.message); }
  }

  async commitAugment(payload) {
    if (!this.abilityMode || this.locked) return;
    if (this.isOnlineGame()) {
      const augmentId = this.abilityMode.augmentId;
      this.abilityMode = null;
      await this.sendOnlineCommand("useAugment", { augmentId, payload });
      return;
    }
    this.locked = true;
    try {
      const augmentId = this.abilityMode.augmentId;
      const outcome = this.game.useAugment(augmentId, payload);
      this.abilityMode = null;
      this.save();
      this.announceEvent(AUGMENTS_BY_ID[augmentId]?.name || "능력 발동!", this.game.logs[0]?.message || "증강 효과가 적용되었습니다.", "augment");
      if (outcome.event) {
        this.renderGame();
        this.locked = true;
        await this.board.animateMove(outcome.event, this.game.settings.animationSpeed);
      }
    } catch (error) { this.toast(error.message); }
    this.locked = false;
    this.renderGame();
  }

  async commitSpecial(payload) {
    if (!this.abilityMode || this.locked) return;
    if (this.isOnlineGame()) {
      const actionId = this.abilityMode.actionId;
      this.abilityMode = null;
      await this.sendOnlineCommand("useSpecial", { actionId, payload });
      return;
    }
    this.locked = true;
    try {
      const event = this.game.useSpecialAction(this.abilityMode.actionId, payload);
      this.abilityMode = null;
      this.save();
      if (event) {
        this.renderGame();
        this.locked = true;
        await this.board.animateMove(event, this.game.settings.animationSpeed);
      }
    } catch (error) { this.toast(error.message); }
    this.locked = false;
    this.renderGame();
  }

  handleEndTurn() {
    if (this.isOnlineGame()) {
      this.sendOnlineCommand("endTurn");
      return;
    }
    try {
      this.game.endTurn();
      this.lastThrow = null;
      this.selectedResultId = null;
      this.selectedPieceId = null;
      this.pendingMove = null;
      this.abilityMode = null;
      this.save();
      this.renderGame();
    } catch (error) { this.toast(error.message); }
  }

  toast(message) {
    const toast = this.root.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  announceEvent(title, message, tone = "info") {
    clearTimeout(this.eventFxTimer);
    this.eventFx = { title, message, tone };
    this.eventFxTimer = setTimeout(() => {
      this.eventFx = null;
      if (this.game) this.renderGame();
    }, 1800);
  }

  victoryMarkup() {
    const winner = this.game.players.find((player) => this.game.winnerIds.includes(player.id));
    const winners = this.game.players.filter((player) => this.game.winnerIds.includes(player.id));
    return `<div class="overlay victory-overlay"><section class="victory-card" style="--winner:${COLORS[winner.color]}"><div class="confetti">✦</div><p>GAME COMPLETE</p><h2>${winners.map((player) => escapeHtml(player.name)).join(" · ")} 승리!</h2><strong>${escapeHtml(this.game.victoryReason || "모든 말이 무사히 완주했습니다.")}</strong>${this.game.rankings?.length ? `<ol class="ranking-list">${[...this.game.rankings].sort((a,b) => a.rank-b.rank).map((record) => { const player = this.game.players.find((candidate) => candidate.id === record.playerId); return `<li><b>${record.rank}위</b><span>${escapeHtml(player?.name || "-")}</span><small>${escapeHtml(record.reason || "")}</small></li>`; }).join("")}</ol>` : ""}<div>${this.isOnlineGame() ? this.onlineState.you.isHost ? '<button class="btn btn-primary" data-action="online-rematch">같은 방에서 다시 플레이</button>' : '<span class="rematch-wait-note">방장이 다시 플레이를 선택할 수 있습니다.</span>' : '<button class="btn btn-primary" data-action="rematch">새 게임</button>'}<button class="btn btn-secondary" data-action="main-menu">메인 메뉴</button></div></section></div>`;
  }

  codexMarkup() {
    return `<p class="eyebrow">AUGMENT CODEX</p><h2>증강 도감</h2>
      <div class="codex-summary"><strong>${IMPLEMENTED_AUGMENTS.length}</strong><span>실제 구현</span><strong>${PLANNED_AUGMENTS.length}</strong><span>미구현</span></div>
      <div class="codex-tools"><label><span>증강 검색</span><input type="search" data-codex-search placeholder="이름 또는 설명 검색" autocomplete="off"></label><label><span>분류</span><select data-codex-filter><option value="all">전체 87개</option><option value="universal">범용</option><option value="start">시작 전용</option><option value="middle">중간 전용</option><option value="finish">마무리 전용</option></select></label><p><b data-codex-visible>${IMPLEMENTED_AUGMENTS.length}</b>개 표시</p></div>
      <div class="codex-grid">${IMPLEMENTED_AUGMENTS.map((definition) => `<article data-codex-item data-category="${definition.availability}" data-search="${escapeHtml(`${definition.name} ${definition.description} ${definition.activationLabel}`.toLowerCase())}"><i>${definition.icon}</i><div><small>${this.augmentCategory(definition)} · ${escapeHtml(definition.activationLabel)}</small><h3>${escapeHtml(definition.name)}</h3><p>${escapeHtml(definition.description)}</p></div></article>`).join("")}</div><p class="codex-no-results" hidden>조건에 맞는 증강이 없습니다.</p>
      ${PLANNED_AUGMENTS.length ? `<details class="planned-list"><summary>미구현 범용 증강 ${PLANNED_AUGMENTS.length}개 보기</summary><div>${PLANNED_AUGMENTS.map((definition) => `<span>${escapeHtml(definition.name)}</span>`).join("")}</div></details>` : ""}`;
  }

  modalMarkup() {
    if (!this.modal) return "";
    const isRules = this.modal === "rules";
    return `<div class="overlay modal-overlay" role="dialog" aria-modal="true"><section class="modal-card ${isRules ? "" : "codex-modal"}"><button class="modal-close" data-action="close-modal" aria-label="닫기">×</button>${isRules ? `
      <p class="eyebrow">HOW TO PLAY</p><h2>기본 윷놀이 규칙</h2>
      <div class="rule-grid">
        <article><b>1</b><h3>던지기</h3><p>윷을 던져 도 1, 개 2, 걸 3, 윷 4, 모 5칸 결과를 얻습니다. 윷·모와 상대 말 잡기는 추가 던지기를 줍니다.</p></article>
        <article><b>2</b><h3>움직이기</h3><p>저장된 결과를 원하는 순서로 고르고 말을 이동합니다. 갈림길에 정확히 멈췄을 때만 다음 이동에서 지름길을 고를 수 있습니다.</p></article>
        <article><b>3</b><h3>업기와 잡기</h3><p>내 말과 같은 칸에 닿으면 업을지 따로 둘지 선택합니다. 따로 둔 말도 상대에게 잡히면 그 칸의 말이 모두 대기로 돌아갑니다.</p></article>
        <article><b>4</b><h3>승리</h3><p>내 말 네 개를 먼저 모두 완주시킨 플레이어가 승리합니다. 백도와 낙은 시작 설정에 따라 적용됩니다.</p></article>
      </div>` : this.codexMarkup()}</section></div>`;
  }

  bindModal() {
    this.root.querySelector('[data-action="close-modal"]')?.addEventListener("click", () => {
      this.modal = null;
      this.game ? this.renderGame() : this.renderMenu();
    });
    const search = this.root.querySelector("[data-codex-search]");
    const filter = this.root.querySelector("[data-codex-filter]");
    if (search && filter) {
      const apply = () => {
        const query = search.value.trim().toLowerCase();
        const category = filter.value;
        let visible = 0;
        this.root.querySelectorAll("[data-codex-item]").forEach((card) => {
          const match = (!query || card.dataset.search.includes(query)) && (category === "all" || card.dataset.category === category);
          card.hidden = !match;
          if (match) visible += 1;
        });
        const count = this.root.querySelector("[data-codex-visible]");
        if (count) count.textContent = String(visible);
        const empty = this.root.querySelector(".codex-no-results");
        if (empty) empty.hidden = visible !== 0;
      };
      search.addEventListener("input", apply);
      filter.addEventListener("change", apply);
    }
  }
}

const gameApp = new GameApp(document.querySelector("#app"));
if (import.meta.env.DEV) window.__YUT_APP__ = gameApp;
