import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { createOnlineServer } from "../server/index.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const connect = (url) => new Promise((resolve, reject) => {
  const socket = io(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (timeoutError, response) => timeoutError ? reject(timeoutError) : resolve(response)));

const server = await createOnlineServer({
  port: 0,
  host: "127.0.0.1",
  dataFile: null,
  rateProfiles: {
    admission: { limit: 50, windowMs: 1_000 },
    lobby: { limit: 100, windowMs: 1_000 },
    command: { limit: 1_000, windowMs: 1_000 },
  },
});
const sockets = [];
const latest = new Map();
try {
  for (let index = 0; index < 4; index += 1) {
    const socket = await connect(server.url);
    socket.on("online:state", (state) => latest.set(socket.id, state.sequence));
    sockets.push(socket);
  }
  const created = await emit(sockets[0], "room:create", { name: "Soak1", settings: { maxPlayers: 4 } });
  const code = created.session.roomCode;
  for (let index = 1; index < 4; index += 1) await emit(sockets[index], "room:join", { code, name: `Soak${index + 1}` });
  for (const socket of sockets) await emit(socket, "room:ready", { ready: true });
  await emit(sockets[0], "room:start");

  const room = server.manager.requireRoom(code);
  room.onlineDraft = null;
  room.game.augmentDraft = { active: false, online: true, candidates: [] };
  room.game.interaction = null;
  const socketByPlayerId = new Map(room.players.map((player, index) => [player.gamePlayerId, sockets[index]]));
  const command = async (socket, type, payload = {}) => {
    const response = await emit(socket, "game:command", { commandId: randomUUID(), expectedSequence: room.sequence, type, payload });
    if (response.ok) latest.set(socket.id, response.state?.sequence ?? response.sequence);
    return response;
  };

  const firstActor = socketByPlayerId.get(room.game.currentPlayer.id);
  const simultaneousSequence = room.sequence;
  const simultaneous = await Promise.all([
    emit(firstActor, "game:command", { commandId: randomUUID(), expectedSequence: simultaneousSequence, type: "throw", payload: {} }),
    emit(firstActor, "game:command", { commandId: randomUUID(), expectedSequence: simultaneousSequence, type: "throw", payload: {} }),
  ]);
  assert(simultaneous.filter((response) => response.ok).length === 1, "동시 명령 중 하나만 처리되지 않음");
  assert(simultaneous.some((response) => response.error?.code === "STALE_SEQUENCE"), "동시 오래된 명령이 거부되지 않음");
  latest.set(firstActor.id, simultaneous.find((response) => response.ok).state.sequence);

  let actions = 2;
  while (actions < 250 && room.phase === "playing") {
    // 부하 테스트는 증강 효과가 아닌 장시간 명령/순서 동기화를 겨냥한다. 6·12라운드
    // 온라인 드래프트가 열리면 선택 부작용 없이 같은 서버 상태에서 다음 턴을 계속한다.
    if (room.onlineDraft?.active) {
      room.onlineDraft = null;
      room.game.augmentDraft = { active: false, online: true, candidates: [] };
    }
    const actorSocket = socketByPlayerId.get(room.game.currentPlayer.id);
    const stored = room.game.turn.results[0];
    if (stored) {
      const movable = room.game.getMovablePieces(stored.id);
      if (!movable.length) await command(actorSocket, "discardResult", { resultId: stored.id });
      else {
        const piece = movable[0];
        const owner = room.game.players.find((player) => player.pieces.some((candidate) => candidate.id === piece.id));
        const options = room.game.getMoveOptionsForPiece(piece, stored, owner);
        await command(actorSocket, "move", { pieceId: piece.id, resultId: stored.id, optionIndex: Math.max(0, options.length - 1) });
      }
    } else if (room.game.turn.throwsRemaining > 0) await command(actorSocket, "throw");
    else if (room.game.canEndTurn()) await command(actorSocket, "endTurn");
    else throw new Error("진행 가능한 서버 행동이 없어 장시간 테스트가 정지했습니다.");
    actions += 1;
  }

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert(server.manager.auditRooms().ok, "장시간 명령 처리 뒤 방 상태가 손상됨");
  assert([...latest.values()].every((sequence) => sequence === room.sequence), "네 클라이언트의 최종 순서 번호가 일치하지 않음");
  assert(server.metrics.maxStateBytes < 500_000, "개인화 상태 메시지가 500KB를 초과함");
  console.log(`online soak: ${actions} authoritative actions, sequence ${room.sequence}, max state ${server.metrics.maxStateBytes} bytes`);
} finally {
  for (const socket of sockets) socket.disconnect();
  await server.close();
}
