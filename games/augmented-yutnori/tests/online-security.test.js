import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RoomManager } from "../server/RoomManager.js";
import { FixedWindowRateLimiter, hashPassword, verifyPassword } from "../server/security.js";

const temporaryDirectories = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

const create = (manager, settings = {}) => manager.createRoom({ name: "방장", settings: { maxPlayers: 4, ...settings }, socketId: "host-socket" });

function startTwo(manager, created) {
  const guest = manager.joinRoom({ code: created.room.code, name: "친구", socketId: "guest-socket" });
  manager.setReady(created.room.code, created.player.id, true);
  manager.setReady(created.room.code, guest.player.id, true);
  manager.startGame(created.room.code, created.player.id);
  return guest;
}

describe("온라인 방 보안과 수명 주기", () => {
  it("방 비밀번호를 scrypt 솔트 해시로 저장하고 일정 시간 비교한다", () => {
    const record = hashPassword("secret-room");
    expect(record.algorithm).toBe("scrypt");
    expect(JSON.stringify(record)).not.toContain("secret-room");
    expect(verifyPassword("secret-room", record)).toBe(true);
    expect(verifyPassword("wrong-room", record)).toBe(false);
  });

  it("비밀번호 방은 틀린 비밀번호를 거부하고 공개 view에 해시를 노출하지 않는다", () => {
    const manager = new RoomManager();
    const created = create(manager, { access: { passwordRequired: true, approvalRequired: false, password: "four-cats" } });
    expect(() => manager.joinRoom({ code: created.room.code, name: "침입자", password: "wrong", socketId: "bad" })).toThrow(/방 코드 또는 비밀번호/u);
    const joined = manager.joinRoom({ code: created.room.code, name: "친구", password: "four-cats", socketId: "good" });
    expect(joined.player.name).toBe("친구");
    const serializedView = JSON.stringify(manager.view(created.room.code, created.player.id));
    expect(serializedView).not.toContain("accessSecret");
    expect(serializedView).not.toContain(created.room.accessSecret.password.hash);
  });

  it("JSON 저장에는 평문 비밀번호가 없고 해시만 남는다", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yut-security-"));
    temporaryDirectories.push(directory);
    const dataFile = join(directory, "rooms.json");
    const manager = new RoomManager({ dataFile });
    create(manager, { access: { passwordRequired: true, password: "never-log-this" } });
    await manager.persist();
    const stored = await readFile(dataFile, "utf8");
    expect(stored).not.toContain("never-log-this");
    expect(stored).toContain("scrypt");
  });

  it("방장 승인 전에는 플레이어를 만들지 않고 승인 후에만 세션을 발급할 수 있다", () => {
    const manager = new RoomManager();
    const created = create(manager, { access: { approvalRequired: true } });
    const pending = manager.joinRoom({ code: created.room.code, name: "대기자", socketId: "pending-socket" });
    expect(pending.pending).toBe(true);
    expect(created.room.players).toHaveLength(1);
    const hostView = manager.view(created.room.code, created.player.id);
    expect(hostView.room.joinRequests).toMatchObject([{ id: pending.request.id, name: "대기자" }]);
    const approved = manager.resolveJoinRequest(created.room.code, created.player.id, pending.request.id, true);
    expect(approved.player.name).toBe("대기자");
    expect(created.room.players).toHaveLength(2);
    expect(created.room.joinRequests).toHaveLength(0);
  });

  it("비밀번호와 방장 승인을 함께 요구할 수 있다", () => {
    const manager = new RoomManager();
    const created = create(manager, { access: { passwordRequired: true, approvalRequired: true, password: "both-locks" } });
    expect(() => manager.joinRoom({ code: created.room.code, name: "대기자", password: "bad", socketId: "bad" })).toThrow();
    const pending = manager.joinRoom({ code: created.room.code, name: "대기자", password: "both-locks", socketId: "pending" });
    expect(pending.pending).toBe(true);
    expect(created.room.settings.access.mode).toBe("protected");
  });

  it("방장만 대기실 플레이어를 내보낼 수 있고 게임 시작 뒤 참가와 강퇴를 막는다", () => {
    const manager = new RoomManager({ rng: () => 0.4 });
    const created = create(manager, { maxPlayers: 2 });
    const guest = manager.joinRoom({ code: created.room.code, name: "친구", socketId: "guest" });
    expect(() => manager.kickPlayer(created.room.code, guest.player.id, created.player.id)).toThrow(/방장/u);
    manager.setReady(created.room.code, created.player.id, true);
    manager.setReady(created.room.code, guest.player.id, true);
    manager.startGame(created.room.code, created.player.id);
    expect(() => manager.joinRoom({ code: created.room.code, name: "늦은 친구", socketId: "late" })).toThrow(/이미 게임/u);
    expect(() => manager.kickPlayer(created.room.code, created.player.id, guest.player.id)).toThrow(/게임 시작/u);
  });

  it("종료된 방을 같은 참가자와 설정으로 대기실에 되돌린다", () => {
    const manager = new RoomManager({ rng: () => 0.42 });
    const created = create(manager, { maxPlayers: 2, mode: "chaos" });
    startTwo(manager, created);
    created.room.phase = "finished";
    created.room.game.status = "finished";
    manager.rematch(created.room.code, created.player.id);
    expect(created.room.phase).toBe("lobby");
    expect(created.room.game).toBeNull();
    expect(created.room.players.every((player) => !player.ready && player.gamePlayerId === null)).toBe(true);
    expect(created.room.settings.mode).toBe("chaos");
  });

  it("연결 없는 만료 방만 정리하고 다른 방은 유지한다", () => {
    let clock = 1_000;
    const manager = new RoomManager({ now: () => clock, idleRoomTtlMs: 1_000, finishedRoomTtlMs: 500, emptyRoomTtlMs: 100 });
    const expired = create(manager);
    const active = manager.createRoom({ name: "활성 방장", settings: {}, socketId: "active" });
    manager.disconnect("host-socket");
    clock += 1_100;
    expect(manager.cleanupExpiredRooms()).toEqual([expired.room.code]);
    expect(manager.rooms.has(active.room.code)).toBe(true);
  });

  it("명령이 비정상 상태를 만들면 해당 방만 이전 상태로 롤백한다", () => {
    const manager = new RoomManager({ rng: () => 0.4 });
    const created = create(manager, { maxPlayers: 2 });
    startTwo(manager, created);
    created.room.onlineDraft = null;
    created.room.game.augmentDraft = { active: false, online: true };
    const actor = created.room.players.find((player) => player.gamePlayerId === created.room.game.currentPlayer.id);
    const originalNode = created.room.game.currentPlayer.pieces[0].node;
    created.room.game.throw = () => {
      created.room.game.currentPlayer.pieces[0].node = "INVALID_NODE";
      return { label: "도", steps: 1, sticks: [] };
    };
    expect(() => manager.executeCommand(created.room.code, actor.id, { commandId: "corrupt", expectedSequence: created.room.sequence, type: "throw", payload: {} })).toThrow(/상태 검증/u);
    expect(created.room.game.currentPlayer.pieces[0].node).toBe(originalNode);
    expect(manager.auditRooms().ok).toBe(true);
  });
});

describe("요청 속도 제한", () => {
  it("고정 시간 창의 한도를 넘는 요청을 거부하고 다음 창에서 복구한다", () => {
    let clock = 0;
    const limiter = new FixedWindowRateLimiter({ now: () => clock });
    const profile = { limit: 2, windowMs: 1_000 };
    expect(limiter.consume("socket", profile).ok).toBe(true);
    expect(limiter.consume("socket", profile).ok).toBe(true);
    const blocked = limiter.consume("socket", profile);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(1_000);
    clock = 1_001;
    expect(limiter.consume("socket", profile).ok).toBe(true);
  });
});
