import { createOnlineServer } from "./index.js";

// 브라우저 전체 경기 테스트는 항상 모가 나오게 해 짧고 재현 가능하게 완주한다.
const server = await createOnlineServer({ port: 3001, host: "127.0.0.1", dataFile: null, rng: () => 0.99 });

// 프로덕션 서버에는 존재하지 않는 E2E 전용 라운드 가속기다. 실제 온라인 드래프트
// 생성/개인화/선택 명령은 그대로 통과시키고 긴 턴 반복만 줄인다.
server.io.on("connection", (socket) => {
  socket.on("test:set-draft-round", ({ round }, acknowledge = () => {}) => {
    try {
      const room = server.manager.requireRoom(socket.data.roomCode);
      server.manager.requireHost(room, socket.data.playerId);
      const targetRound = Number(round);
      if (![6, 12].includes(targetRound)) throw new Error("unsupported test round");
      room.game.round = targetRound;
      room.game.augmentDraft = { active: false, online: false, candidates: [] };
      server.manager.startOnlineDraft(room, targetRound);
      room.sequence += 1;
      for (const player of room.players.filter((candidate) => candidate.connected && candidate.socketId)) {
        server.io.to(player.socketId).emit("online:state", server.manager.view(room.code, player.id));
      }
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, message: error.message });
    }
  });
});
console.log(`Online test server listening on ${server.url}`);
const shutdown = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
