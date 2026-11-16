import { describe, expect, it } from "vitest";
import { RoomManager } from "../server/RoomManager.js";
import { AUGMENT_DEFINITIONS } from "../src/augments/definitions.js";

function startedRoom() {
  const manager = new RoomManager({ rng: () => 0.73 });
  const created = manager.createRoom({ name: "방장", settings: { maxPlayers: 2 }, socketId: "host" });
  const guest = manager.joinRoom({ code: created.room.code, name: "친구", socketId: "guest" });
  manager.setReady(created.room.code, created.player.id, true);
  manager.setReady(created.room.code, guest.player.id, true);
  manager.startGame(created.room.code, created.player.id);
  const room = created.room;
  room.onlineDraft = null;
  room.game.augmentDraft = { active: false, online: true, candidates: [] };
  return { manager, room, host: created.player, guest: guest.player };
}

describe("87개 증강의 서버 상태 전송과 비공개 정보", () => {
  it("87개 증강 인스턴스를 빠짐없이 서버 개인화 상태로 직렬화한다", () => {
    const { manager, room, host } = startedRoom();
    const owner = room.game.players.find((player) => player.id === host.gamePlayerId);
    const received = [];
    for (const definition of AUGMENT_DEFINITIONS) {
      owner.augments = [{
        id: definition.id,
        usesRemaining: definition.uses,
        active: true,
        acquiredRound: room.game.round,
      }];
      const view = manager.view(room.code, host.id);
      received.push(view.game.players.find((player) => player.id === owner.id).augments[0]?.id);
    }
    expect(AUGMENT_DEFINITIONS).toHaveLength(87);
    expect(new Set(received)).toEqual(new Set(AUGMENT_DEFINITIONS.map((definition) => definition.id)));
    expect(AUGMENT_DEFINITIONS.every((definition) => definition.implemented)).toBe(true);
  });

  it("블러핑·투표·죄수의 딜레마 진행 중에는 지정 플레이어에게만 선택 UI를 보내고 답은 숨긴다", () => {
    const { manager, room, host, guest } = startedRoom();
    const hostGameId = host.gamePlayerId;
    const guestGameId = guest.gamePlayerId;
    for (const interaction of [
      { type: "bluff", data: { judges: [guestGameId], index: 0, actualLabel: "모", choices: { [hostGameId]: "모" } } },
      { type: "vote", data: { voters: [guestGameId], index: 0, votes: { [hostGameId]: true } } },
      { type: "prisoners", data: { players: [guestGameId], index: 0, choices: { [hostGameId]: "cooperate" } } },
    ]) {
      room.game.interaction = { active: true, ownerId: hostGameId, ...interaction };
      const ownerView = manager.view(room.code, host.id).game.interaction;
      const actorView = manager.view(room.code, guest.id).game.interaction;
      expect(ownerView.type).toBe("waiting");
      expect(actorView.type).toBe(interaction.type);
      expect(actorView.data.actualLabel).toBeUndefined();
      expect(actorView.data.choices).toBeUndefined();
      expect(actorView.data.votes).toBeUndefined();
    }
  });

  it("안개 소유자가 아닌 플레이어에게 시야 밖 상대 말 위치를 숨긴다", () => {
    const { manager, room, host, guest } = startedRoom();
    const hostGame = room.game.players.find((player) => player.id === host.gamePlayerId);
    const guestGame = room.game.players.find((player) => player.id === guest.gamePlayerId);
    hostGame.pieces[0].node = "R1";
    guestGame.pieces[0].node = "TL";
    room.game.boardState.fog = { ownerId: hostGame.id, turnsRemaining: 2 };
    const hostView = manager.view(room.code, host.id).game;
    const guestView = manager.view(room.code, guest.id).game;
    expect(hostView.players.find((player) => player.id === guestGame.id).pieces[0].node).toBe("TL");
    expect(guestView.players.find((player) => player.id === hostGame.id).pieces[0]).toMatchObject({ node: null, hiddenOnline: true });
  });
});
