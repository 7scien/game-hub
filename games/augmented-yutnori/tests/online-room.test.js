import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join as joinPath } from "node:path";
import { tmpdir } from "node:os";
import { RoomManager } from "../server/RoomManager.js";
import { IMPLEMENTED_AUGMENTS } from "../src/augments/definitions.js";

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function makeRoom({ maxPlayers = 4, rng = () => 0.37 } = {}) {
  const manager = new RoomManager({ rng });
  const host = manager.createRoom({ name: "방장", settings: { maxPlayers }, socketId: "socket-host" });
  return { manager, room: host.room, host: host.player, hostToken: host.reconnectToken };
}

function joinPlayer(manager, room, number) {
  return manager.joinRoom({ code: room.code, name: `친구 ${number}`, socketId: `socket-${number}` });
}

function startTwoPlayerGame() {
  const context = makeRoom({ maxPlayers: 2 });
  const guest = joinPlayer(context.manager, context.room, 2);
  context.manager.setReady(context.room.code, context.host.id, true);
  context.manager.setReady(context.room.code, guest.player.id, true);
  context.manager.startGame(context.room.code, context.host.id);
  return { ...context, guest: guest.player, guestToken: guest.reconnectToken };
}

function bypassDraft(room) {
  room.onlineDraft = null;
  room.game.augmentDraft = { active: false, online: true, candidates: [] };
  room.game.interaction = null;
}

describe("온라인 방과 서버 권한 게임 상태", () => {
  it("6자리 방을 만들고 최대 2~4명의 참가자를 제한한다", () => {
    for (const maxPlayers of [2, 3, 4]) {
      const { manager, room } = makeRoom({ maxPlayers });
      expect(room.code).toMatch(/^\d{6}$/u);
      for (let index = 2; index <= maxPlayers; index += 1) joinPlayer(manager, room, index);
      expect(room.players).toHaveLength(maxPlayers);
      expect(() => joinPlayer(manager, room, 9)).toThrow(/가득/u);
    }
  });

  it("모두 준비된 뒤에만 시작하고 플레이 순서를 서버에서 만든다", () => {
    const { manager, room, host } = makeRoom();
    const guest = joinPlayer(manager, room, 2).player;
    manager.setReady(room.code, host.id, true);
    expect(() => manager.startGame(room.code, host.id)).toThrow(/준비/u);
    manager.setReady(room.code, guest.id, true);
    manager.startGame(room.code, host.id);
    expect(room.phase).toBe("playing");
    expect(room.game.players).toHaveLength(2);
    expect(room.game.augmentDraft.online).toBe(true);
    expect(room.sequence).toBe(1);
  });

  it("각 플레이어에게 자신의 증강 후보와 선택 완료 상태만 전송한다", () => {
    const { manager, room, host, guest } = startTwoPlayerGame();
    room.onlineDraft.players[host.gamePlayerId].candidates = ["cat", "shield", "zombie"];
    room.onlineDraft.players[guest.gamePlayerId].candidates = ["pawn", "cannon", "goblin"];
    const hostView = manager.view(room.code, host.id);
    const guestView = manager.view(room.code, guest.id);
    expect(hostView.game.augmentDraft.candidates).toEqual(["cat", "shield", "zombie"]);
    expect(guestView.game.augmentDraft.candidates).toEqual(["pawn", "cannon", "goblin"]);
    expect(JSON.stringify(hostView)).not.toContain("cannon");
    expect(hostView.game.augmentDraft.progress).toEqual({ [host.gamePlayerId]: false, [guest.gamePlayerId]: false });
  });

  it("모든 플레이어가 개인 후보를 고르면 공통 증강 엔진에 등록한다", () => {
    const { manager, room, host, guest } = startTwoPlayerGame();
    room.onlineDraft.players[host.gamePlayerId].candidates = ["cat"];
    room.onlineDraft.players[guest.gamePlayerId].candidates = ["dog_pig"];
    manager.executeCommand(room.code, host.id, { commandId: "draft-host", expectedSequence: room.sequence, type: "draft:select", payload: { augmentId: "cat" } });
    const privateGuestView = manager.view(room.code, guest.id);
    expect(privateGuestView.lastAction.action).toEqual({ waiting: true });
    expect(JSON.stringify(privateGuestView)).not.toContain("‘고양이’를 선택");
    manager.executeCommand(room.code, guest.id, { commandId: "draft-guest", expectedSequence: room.sequence, type: "draft:select", payload: { augmentId: "dog_pig" } });
    expect(room.onlineDraft).toBeNull();
    expect(room.game.players.find((player) => player.id === host.gamePlayerId).augments.some((augment) => augment.id === "cat")).toBe(true);
    expect(room.game.players.find((player) => player.id === guest.gamePlayerId).augments.some((augment) => augment.id === "dog_pig")).toBe(true);
  });

  it("현재 차례가 아닌 플레이어와 조작한 윷 결과를 거부한다", () => {
    const { manager, room } = startTwoPlayerGame();
    bypassDraft(room);
    const actor = room.players.find((player) => player.gamePlayerId === room.game.currentPlayer.id);
    const other = room.players.find((player) => player.id !== actor.id);
    expect(() => manager.executeCommand(room.code, other.id, { commandId: "other-throw", expectedSequence: room.sequence, type: "throw", payload: {} })).toThrow(/차례/u);
    expect(() => manager.executeCommand(room.code, actor.id, { commandId: "forged-throw", expectedSequence: room.sequence, type: "throw", payload: { requestedLabel: "모" } })).toThrow(/지정/u);
  });

  it("명령 ID 중복은 한 번만 처리하고 오래된 순서 번호를 거부한다", () => {
    const { manager, room } = startTwoPlayerGame();
    bypassDraft(room);
    const actor = room.players.find((player) => player.gamePlayerId === room.game.currentPlayer.id);
    const initialSequence = room.sequence;
    const command = { commandId: "throw-once", expectedSequence: initialSequence, type: "throw", payload: {} };
    const first = manager.executeCommand(room.code, actor.id, command);
    const throwsAfterFirst = room.game.currentPlayer.stats.throws;
    const duplicate = manager.executeCommand(room.code, actor.id, command);
    expect(first.sequence).toBe(initialSequence + 1);
    expect(duplicate).toEqual({ duplicate: true, sequence: initialSequence + 1 });
    expect(room.game.currentPlayer.stats.throws).toEqual(throwsAfterFirst);
    expect(() => manager.executeCommand(room.code, actor.id, { commandId: "stale-command", expectedSequence: initialSequence, type: "endTurn", payload: {} })).toThrow(/최신 상태/u);
  });

  it("알까기 판정 목표는 클라이언트 입력 대신 서버의 65로 고정한다", () => {
    const { manager, room } = startTwoPlayerGame();
    bypassDraft(room);
    const actor = room.players.find((player) => player.gamePlayerId === room.game.currentPlayer.id);
    let receivedPayload = null;
    room.game.useAugment = (_augmentId, payload) => { receivedPayload = payload; return { ok: true }; };
    manager.executeCommand(room.code, actor.id, { commandId: "fixed-flick-target", expectedSequence: room.sequence, type: "useAugment", payload: { augmentId: "flicking", payload: { playerId: "p2", power: 3, target: 3 } } });
    expect(receivedPayload.target).toBe(65);
    expect(receivedPayload.power).toBe(3);
  });

  it("안개 상태는 내 말의 현재 칸과 바로 인접한 칸 밖의 상대 좌표를 숨긴다", () => {
    const { manager, room, host, guest } = startTwoPlayerGame();
    bypassDraft(room);
    const viewer = room.game.players.find((player) => player.id === host.gamePlayerId);
    const opponent = room.game.players.find((player) => player.id === guest.gamePlayerId);
    viewer.pieces[0].node = "R1";
    opponent.pieces[0].node = "R2";
    opponent.pieces[1].node = "R4";
    room.game.boardState.fog = { ownerId: opponent.id, turnsRemaining: 2 };
    const view = manager.view(room.code, host.id);
    const remote = view.game.players.find((player) => player.id === opponent.id);
    expect(remote.pieces[0].node).toBe("R2");
    expect(remote.pieces[1]).toMatchObject({ node: null, route: null, hiddenOnline: true });
  });

  it("비밀 투표 중 현재 투표자에게 앞선 플레이어의 표를 전송하지 않는다", () => {
    const { manager, room, host, guest } = startTwoPlayerGame();
    bypassDraft(room);
    room.game.interaction = {
      active: true,
      type: "vote",
      ownerId: host.gamePlayerId,
      data: { voters: [guest.gamePlayerId], index: 0, votes: { [host.gamePlayerId]: 2 } },
    };
    const guestView = manager.view(room.code, guest.id);
    const hostView = manager.view(room.code, host.id);
    expect(guestView.game.interaction.type).toBe("vote");
    expect(guestView.game.interaction.data.votes).toBeUndefined();
    expect(hostView.game.interaction).toEqual({ active: true, type: "waiting", ownerId: host.gamePlayerId, data: { requiredActorId: guest.gamePlayerId } });
  });

  it("서버에서 확정한 마지막 이동과 승리 결과를 모든 플레이어 view에 동기화한다", () => {
    const { manager, room } = startTwoPlayerGame();
    bypassDraft(room);
    const actorPlayer = room.game.currentPlayer;
    const actor = room.players.find((player) => player.gamePlayerId === actorPlayer.id);
    actorPlayer.pieces.slice(0, 3).forEach((piece) => { piece.node = "HOME"; });
    const finalPiece = actorPlayer.pieces[3];
    finalPiece.node = "B4";
    finalPiece.route = "outer";
    room.game.turn.throwsRemaining = 0;
    room.game.turn.results = [{ id: "server-final-do", label: "도", steps: 1, sticks: [{ back: true, marked: true }], hidden: false }];
    manager.executeCommand(room.code, actor.id, { commandId: "server-victory", expectedSequence: room.sequence, type: "move", payload: { pieceId: finalPiece.id, resultId: "server-final-do", optionIndex: 0 } });
    expect(room.phase).toBe("finished");
    expect(room.game.winnerIds).toContain(actorPlayer.id);
    for (const lobbyPlayer of room.players) {
      const view = manager.view(room.code, lobbyPlayer.id);
      expect(view.room.phase).toBe("finished");
      expect(view.game.winnerIds).toContain(actorPlayer.id);
    }
  });

  it("연결 해제 시 방장을 이전하고 안전한 토큰으로 같은 플레이어를 복구한다", () => {
    const { manager, room, host, hostToken } = makeRoom();
    const guest = joinPlayer(manager, room, 2).player;
    manager.disconnect("socket-host");
    expect(host.connected).toBe(false);
    expect(room.hostPlayerId).toBe(guest.id);
    expect(() => manager.resumeRoom({ code: room.code, playerId: host.id, reconnectToken: "wrong", socketId: "new-host" })).toThrow(/올바르지/u);
    manager.resumeRoom({ code: room.code, playerId: host.id, reconnectToken: hostToken, socketId: "new-host" });
    expect(host.connected).toBe(true);
    expect(host.socketId).toBe("new-host");
  });

  it("서버 재시작 뒤 방과 게임 상태를 JSON 저장소에서 복원한다", async () => {
    const directory = await mkdtemp(joinPath(tmpdir(), "augmented-yut-online-"));
    temporaryDirectories.push(directory);
    const dataFile = joinPath(directory, "rooms.json");
    const manager = new RoomManager({ dataFile, rng: () => 0.41 });
    await manager.load();
    const created = manager.createRoom({ name: "저장 방장", settings: { maxPlayers: 2 }, socketId: "host" });
    const guest = manager.joinRoom({ code: created.room.code, name: "저장 친구", socketId: "guest" });
    manager.setReady(created.room.code, created.player.id, true);
    manager.setReady(created.room.code, guest.player.id, true);
    manager.startGame(created.room.code, created.player.id);
    await manager.persist();

    const restored = new RoomManager({ dataFile, rng: () => 0.41 });
    await restored.load();
    const room = restored.requireRoom(created.room.code);
    expect(room.phase).toBe("playing");
    expect(room.game.players).toHaveLength(2);
    expect(room.players.every((player) => !player.connected)).toBe(true);
    expect(room.onlineDraft.active).toBe(true);
  });

  it("공통 서버 엔진에 구현된 증강 87개가 그대로 등록되어 있다", () => {
    expect(IMPLEMENTED_AUGMENTS).toHaveLength(87);
    expect(new Set(IMPLEMENTED_AUGMENTS.map((augment) => augment.id)).size).toBe(87);
  });
});
