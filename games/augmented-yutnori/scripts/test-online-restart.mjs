import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { io } from "socket.io-client";
import { createOnlineServer } from "../server/index.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const connect = (url) => new Promise((resolve, reject) => {
  const socket = io(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (timeoutError, response) => timeoutError ? reject(timeoutError) : resolve(response)));

const directory = await mkdtemp(join(tmpdir(), "yut-server-restart-"));
const dataFile = join(directory, "rooms.json");
let firstServer;
let secondServer;
let firstSocket;
let resumedSocket;
try {
  firstServer = await createOnlineServer({ port: 0, host: "127.0.0.1", dataFile, rng: () => 0.4 });
  firstSocket = await connect(firstServer.url);
  const created = await emit(firstSocket, "room:create", { name: "RestartHost", settings: { maxPlayers: 2 } });
  assert(created.ok, "재시작 테스트 방 생성 실패");
  const session = created.session;
  firstSocket.disconnect();
  await firstServer.close();
  firstServer = null;

  secondServer = await createOnlineServer({ port: 0, host: "127.0.0.1", dataFile, rng: () => 0.4 });
  resumedSocket = await connect(secondServer.url);
  const resumed = await emit(resumedSocket, "room:resume", session);
  assert(resumed.ok && resumed.state.room.code === session.roomCode, "서버 재시작 뒤 토큰 재접속 실패");
  assert(resumed.state.room.players[0].name === "RestartHost", "서버 재시작 뒤 방 상태 복원 실패");
  console.log("online restart: persisted room and reconnect token restored");
} finally {
  firstSocket?.disconnect();
  resumedSocket?.disconnect();
  if (firstServer) await firstServer.close();
  if (secondServer) await secondServer.close();
  await rm(directory, { recursive: true, force: true });
}
