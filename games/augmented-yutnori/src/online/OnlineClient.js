import { io } from "socket.io-client";

const SESSION_KEY = "augmented-yutnori-online-session-v1";

export function defaultOnlineServerUrl() {
  if (globalThis.__YUT_SERVER_URL__) return globalThis.__YUT_SERVER_URL__;
  if (import.meta.env.VITE_ONLINE_SERVER_URL) return import.meta.env.VITE_ONLINE_SERVER_URL;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return "http://localhost:3001";
  return location.origin;
}

export class OnlineClient {
  constructor({ url = defaultOnlineServerUrl(), onState, onConnection, onError, onPending, onExit } = {}) {
    this.url = url;
    this.onState = onState;
    this.onConnection = onConnection;
    this.onError = onError;
    this.onPending = onPending;
    this.onExit = onExit;
    this.state = null;
    this.session = this.loadSession();
    this.socket = null;
    this.needsResume = false;
    this.handleOffline = () => {
      if (this.session) this.needsResume = true;
      // 브라우저가 오프라인이면 기존 WebSocket은 ping timeout까지 겉보기상 열린
      // 상태로 남을 수 있다. 즉시 닫아 online 이벤트에서 새 연결을 만들게 한다.
      this.socket?.disconnect();
      this.onConnection?.("disconnected");
    };
    this.handleOnline = () => {
      if (this.socket && !this.socket.connected) {
        this.onConnection?.("reconnecting");
        this.socket.io.open();
        this.socket.connect();
      }
    };
    globalThis.addEventListener?.("offline", this.handleOffline);
    globalThis.addEventListener?.("online", this.handleOnline);
  }

  connect() {
    if (this.socket?.connected) return Promise.resolve();
    if (this.socket) this.socket.disconnect();
    this.onConnection?.("connecting");
    this.socket = io(this.url, { transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 300, reconnectionDelayMax: 2_000, timeout: 7000 });
    this.socket.on("online:state", (state) => this.applyState(state));
    this.socket.on("connect", async () => {
      this.onConnection?.("connected");
      if (this.needsResume && this.session) {
        this.needsResume = false;
        try { await this.resume(); } catch (error) { this.onError?.(error); }
      }
    });
    this.socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect" && this.session) this.needsResume = true;
      this.onConnection?.("disconnected");
    });
    this.socket.io.on("reconnect_attempt", () => this.onConnection?.("reconnecting"));
    // Render Free는 절전 해제에 약 1분이 걸릴 수 있다. 첫 연결 오류에서 즉시
    // 포기하지 않고 바깥 제한 시간까지 Socket.IO 재시도를 유지한다.
    this.socket.on("connect_error", () => this.onConnection?.("reconnecting"));
    this.socket.on("online:session-replaced", ({ message }) => {
      // 같은 브라우저 프로필의 새 탭도 localStorage를 공유하므로, 새 세션이 쓸 토큰까지 지우지 않는다.
      this.session = null;
      this.state = null;
      this.onExit?.(message);
    });
    this.socket.on("room:approved", ({ session, state }) => {
      this.saveSession(session);
      this.onPending?.(null);
      this.applyState(state);
    });
    this.socket.on("room:approval-denied", ({ message }) => {
      this.onPending?.(null);
      this.onError?.(new Error(message));
    });
    this.socket.on("room:kicked", ({ message }) => {
      this.clearSession();
      this.onPending?.(null);
      this.onExit?.(message);
      this.disconnect();
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.disconnect();
        reject(new Error("온라인 서버에 연결하지 못했습니다. 무료 서버가 시작 중일 수 있으니 30~60초 후 다시 시도하거나 오프라인 플레이를 이용해 주세요."));
      }, 65_000);
      this.socket.once("connect", () => { clearTimeout(timeout); resolve(); });
    });
  }

  async request(event, payload = {}) {
    await this.connect();
    return new Promise((resolve, reject) => {
      this.socket.timeout(10_000).emit(event, payload, (timeoutError, response) => {
        if (timeoutError) { reject(new Error("온라인 서버 응답 시간이 초과되었습니다.")); return; }
        if (!response?.ok) { const error = new Error(response?.error?.message || "온라인 요청이 실패했습니다."); error.code = response?.error?.code; reject(error); return; }
        if (response.state) this.applyState(response.state);
        resolve(response);
      });
    });
  }

  async createRoom({ name, settings }) {
    const response = await this.request("room:create", { name, settings });
    this.saveSession(response.session);
    return response;
  }

  async joinRoom({ code, name, password = "" }) {
    const response = await this.request("room:join", { code, name, password });
    if (response.pending) this.onPending?.(response.request);
    else this.saveSession(response.session);
    return response;
  }

  async resume() {
    if (!this.session) throw new Error("저장된 온라인 재접속 정보가 없습니다.");
    const response = await this.request("room:resume", this.session);
    this.saveSession(response.session);
    return response;
  }

  updateSettings(settings) { return this.request("room:settings", { settings }); }
  setReady(ready) { return this.request("room:ready", { ready }); }
  startGame() { return this.request("room:start"); }
  rematch() { return this.request("room:rematch"); }
  approveJoin(requestId, approved) { return this.request("room:approve", { requestId, approved }); }
  kickPlayer(playerId) { return this.request("room:kick", { playerId }); }
  async leaveLobby() {
    const response = await this.request("room:leave");
    this.clearSession();
    return response;
  }

  command(type, payload = {}) {
    if (!this.state) return Promise.reject(new Error("온라인 게임 상태가 없습니다."));
    return this.request("game:command", {
      commandId: crypto.randomUUID(),
      expectedSequence: this.state.sequence,
      type,
      payload,
    });
  }

  applyState(state) {
    if (!state || this.state && state.sequence < this.state.sequence) return;
    this.state = state;
    this.onState?.(state);
  }

  saveSession(session) {
    if (!session) return;
    this.session = session;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  clearSession() {
    this.session = null;
    this.state = null;
    localStorage.removeItem(SESSION_KEY);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export { SESSION_KEY };
