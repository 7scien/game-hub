import { io } from "socket.io-client";
import { createOnlineServer } from "../server/index.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(5000).emit(event, payload, (timeoutError, response) => {
    if (timeoutError) reject(timeoutError);
    else resolve(response);
  });
});
const connect = (url) => new Promise((resolve, reject) => {
  const socket = io(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});

const server = await createOnlineServer({ port: 0, host: "127.0.0.1", dataFile: null, rng: () => 0.38 });
const sockets = [];
try {
  const host = await connect(server.url);
  const guest = await connect(server.url);
  sockets.push(host, guest);

  const created = await emit(host, "room:create", { name: "Host", settings: { maxPlayers: 2, mode: "normal", useBackDo: true, useNak: false } });
  assert(created.ok && /^\d{6}$/.test(created.session.roomCode), "방 생성 또는 6자리 코드 발급 실패");
  const joined = await emit(guest, "room:join", { code: created.session.roomCode, name: "Guest" });
  assert(joined.ok && joined.state.room.players.length === 2, "두 번째 플레이어 참가 실패");

  assert((await emit(host, "room:ready", { ready: true })).ok, "방장 준비 실패");
  assert((await emit(guest, "room:ready", { ready: true })).ok, "참가자 준비 실패");
  const started = await emit(host, "room:start");
  assert(started.ok && started.state.room.phase === "playing", "온라인 게임 시작 실패");
  assert(started.state.game.augmentDraft.online, "온라인 개인 증강 선택이 시작되지 않음");

  const room = server.manager.requireRoom(created.session.roomCode);
  room.onlineDraft = null;
  room.game.augmentDraft = { active: false, online: true, candidates: [] };
  room.game.interaction = null;
  const actor = room.players.find((player) => player.gamePlayerId === room.game.currentPlayer.id);
  const actorSocket = actor.id === created.session.playerId ? host : guest;
  const otherSocket = actorSocket === host ? guest : host;

  const unauthorized = await emit(otherSocket, "game:command", { commandId: "unauthorized-runtime", expectedSequence: room.sequence, type: "throw", payload: {} });
  assert(!unauthorized.ok && unauthorized.error.code === "NOT_YOUR_TURN", "상대 차례 행동이 차단되지 않음");
  const forged = await emit(actorSocket, "game:command", { commandId: "forged-runtime", expectedSequence: room.sequence, type: "throw", payload: { requestedLabel: "모" } });
  assert(!forged.ok && forged.error.code === "FORGED_THROW_RESULT", "조작한 윷 결과가 차단되지 않음");
  const thrown = await emit(actorSocket, "game:command", { commandId: "valid-runtime", expectedSequence: room.sequence, type: "throw", payload: {} });
  assert(thrown.ok && thrown.action.result && thrown.sequence === room.sequence, `서버 권한 윷 던지기 실패: ${JSON.stringify(thrown)}`);

  guest.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const resumedSocket = await connect(server.url);
  sockets.push(resumedSocket);
  const resumed = await emit(resumedSocket, "room:resume", joined.session);
  assert(resumed.ok && resumed.state.you.playerId === joined.session.playerId, "재접속 토큰 복구 실패");
  assert(resumed.state.game.turn.results.length >= 1, "재접속 시 최신 게임 상태가 복원되지 않음");

  const sessionReplaced = new Promise((resolve) => resumedSocket.once("online:session-replaced", resolve));
  const replacementSocket = await connect(server.url);
  sockets.push(replacementSocket);
  const replaced = await emit(replacementSocket, "room:resume", joined.session);
  assert(replaced.ok, "중복 접속의 새 세션 복구 실패");
  assert(Boolean(await sessionReplaced), "기존 중복 세션에 교체 알림이 전달되지 않음");

  const secureHost = await connect(server.url);
  const secureGuest = await connect(server.url);
  sockets.push(secureHost, secureGuest);
  const secured = await emit(secureHost, "room:create", { name: "SecureHost", settings: { maxPlayers: 2, access: { passwordRequired: true, approvalRequired: true, password: "secure-pass" } } });
  assert(secured.ok, "보호 방 생성 실패");
  const wrongPassword = await emit(secureGuest, "room:join", { code: secured.session.roomCode, name: "SecureGuest", password: "wrong" });
  assert(!wrongPassword.ok && wrongPassword.error.code === "INVALID_ROOM_PASSWORD", "틀린 방 비밀번호가 거부되지 않음");
  const pending = await emit(secureGuest, "room:join", { code: secured.session.roomCode, name: "SecureGuest", password: "secure-pass" });
  assert(pending.ok && pending.pending, "방장 승인 대기 상태가 생성되지 않음");
  const approvalEvent = new Promise((resolve) => secureGuest.once("room:approved", resolve));
  const approved = await emit(secureHost, "room:approve", { requestId: pending.request.requestId, approved: true });
  const approvedSession = await approvalEvent;
  assert(approved.ok && approvedSession.session.reconnectToken, "방장 승인 후 세션 발급 실패");

  const health = await fetch(`${server.url}/health`).then((response) => response.json());
  const ready = await fetch(`${server.url}/ready`).then((response) => response.json());
  assert(health.ok && ready.ok, "health/ready 상태 검사 실패");

  console.log("online runtime: room security/authority/sync/reconnect/health passed");
} finally {
  for (const socket of sockets) socket.disconnect();
  await server.close();
}
