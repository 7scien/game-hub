import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Game, HOME, WAIT } from "../src/core/Game.js";
import { NODES } from "../src/core/board.js";
import { AUGMENTS_BY_ID } from "../src/augments/definitions.js";
import { hashPassword, verifyPassword } from "./security.js";

const COLORS = ["red", "blue", "green", "yellow"];
const ROOM_CODE = /^\d{6}$/u;

export class OnlineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const cleanName = (value) => String(value || "").replace(/[\u0000-\u001f\u007f]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 12);
const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
const token = () => randomBytes(32).toString("base64url");
const ACCESS_MODES = new Set(["open", "password", "approval", "protected"]);
const VALID_NODES = new Set([...Object.keys(NODES), WAIT, HOME]);

export class RoomManager {
  constructor({
    dataFile = null,
    rng = Math.random,
    now = () => Date.now(),
    idleRoomTtlMs = 12 * 60 * 60_000,
    finishedRoomTtlMs = 2 * 60 * 60_000,
    emptyRoomTtlMs = 5 * 60_000,
  } = {}) {
    this.rooms = new Map();
    this.dataFile = dataFile ? resolve(dataFile) : null;
    this.rng = rng;
    this.now = now;
    this.idleRoomTtlMs = idleRoomTtlMs;
    this.finishedRoomTtlMs = finishedRoomTtlMs;
    this.emptyRoomTtlMs = emptyRoomTtlMs;
    this.persistQueue = Promise.resolve();
  }

  async load() {
    if (!this.dataFile) return;
    try {
      const stored = JSON.parse(await readFile(this.dataFile, "utf8"));
      for (const data of stored.rooms || []) {
        const room = {
          ...data,
          settings: this.normalizeSettings(data.settings),
          players: data.players.map((player) => ({ ...player, connected: false, socketId: null })),
          joinRequests: [],
          game: data.game ? Game.restore(data.game, this.rng) : null,
          processedCommands: Object.fromEntries(Object.entries(data.processedCommands || {}).map(([id, ids]) => [id, new Set(ids)])),
        };
        if (room.onlineDraft?.active && room.game) room.game.augmentDraft = room.onlineDraft;
        this.rooms.set(room.code, room);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async persist() {
    if (!this.dataFile) return;
    const writeSnapshot = async () => {
      await mkdir(dirname(this.dataFile), { recursive: true });
      const temporary = `${this.dataFile}.tmp`;
      const rooms = [...this.rooms.values()].map((room) => ({
        ...room,
        players: room.players.map((player) => ({ ...player, connected: false, socketId: null })),
        game: room.game?.toJSON() || null,
        onlineDraft: room.onlineDraft,
        joinRequests: [],
        processedCommands: Object.fromEntries(Object.entries(room.processedCommands).map(([id, ids]) => [id, [...ids].slice(-200)])),
      }));
      await writeFile(temporary, JSON.stringify({ version: 1, rooms }, null, 2), "utf8");
      await rename(temporary, this.dataFile);
    };
    this.persistQueue = this.persistQueue.then(writeSnapshot, writeSnapshot);
    return this.persistQueue;
  }

  generateCode() {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      if (!this.rooms.has(code)) return code;
    }
    throw new OnlineError("ROOM_CODE_EXHAUSTED", "방 코드를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  normalizeSettings(settings = {}) {
    const maxPlayers = Math.max(2, Math.min(4, Number(settings.maxPlayers) || 4));
    const requestedMode = ACCESS_MODES.has(settings.access?.mode) ? settings.access.mode : "open";
    const passwordRequired = Boolean(settings.access?.passwordRequired ?? ["password", "protected"].includes(requestedMode));
    const approvalRequired = Boolean(settings.access?.approvalRequired ?? ["approval", "protected"].includes(requestedMode));
    const accessMode = passwordRequired && approvalRequired ? "protected" : passwordRequired ? "password" : approvalRequired ? "approval" : "open";
    return {
      maxPlayers,
      mode: settings.mode === "chaos" ? "chaos" : "normal",
      useBackDo: settings.useBackDo !== false,
      useNak: Boolean(settings.useNak),
      access: { mode: accessMode, passwordRequired, approvalRequired },
    };
  }

  configureAccess(room, rawSettings = {}) {
    const passwordRequired = room.settings.access.passwordRequired;
    const supplied = rawSettings.access?.password ?? rawSettings.password;
    if (!passwordRequired) {
      room.accessSecret = null;
      return;
    }
    if (supplied != null && String(supplied).length) {
      try { room.accessSecret = { password: hashPassword(supplied) }; }
      catch (error) { throw new OnlineError(error.code || "INVALID_ROOM_PASSWORD", error.message); }
    }
    if (!room.accessSecret?.password) throw new OnlineError("ROOM_PASSWORD_REQUIRED", "비밀번호 방에는 4~64자의 비밀번호가 필요합니다.");
  }

  createRoom({ name, settings, socketId }) {
    const playerName = cleanName(name);
    if (!playerName) throw new OnlineError("INVALID_NAME", "방장 이름을 입력해 주세요.");
    const code = this.generateCode();
    const player = this.makeLobbyPlayer(playerName, 0, socketId);
    const room = {
      code,
      phase: "lobby",
      settings: this.normalizeSettings(settings),
      accessSecret: null,
      hostPlayerId: player.id,
      players: [player],
      game: null,
      onlineDraft: null,
      lastAction: null,
      sequence: 0,
      processedCommands: { [player.id]: new Set() },
      joinRequests: [],
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.configureAccess(room, settings);
    this.rooms.set(code, room);
    return { room, player, reconnectToken: player.reconnectToken };
  }

  makeLobbyPlayer(name, index, socketId) {
    return {
      id: randomUUID(),
      gamePlayerId: null,
      name,
      color: COLORS[index],
      ready: false,
      connected: true,
      socketId,
      reconnectToken: token(),
      joinedAt: this.now(),
    };
  }

  joinRoom({ code, name, password, socketId }) {
    const room = this.requireRoom(code);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "이미 게임이 시작된 방입니다. 재접속 토큰으로 복귀해 주세요.");
    if (room.players.length >= room.settings.maxPlayers) throw new OnlineError("ROOM_FULL", "방이 가득 찼습니다.");
    const playerName = cleanName(name);
    if (!playerName) throw new OnlineError("INVALID_NAME", "플레이어 이름을 입력해 주세요.");
    if (room.players.some((candidate) => candidate.name === playerName) || room.joinRequests.some((candidate) => candidate.name === playerName)) throw new OnlineError("DUPLICATE_NAME", "이미 사용 중인 플레이어 이름입니다.");
    if (room.settings.access.passwordRequired && !verifyPassword(password, room.accessSecret?.password)) throw new OnlineError("INVALID_ROOM_PASSWORD", "방 코드 또는 비밀번호가 올바르지 않습니다.");
    if (room.settings.access.approvalRequired) {
      if (room.joinRequests.length >= Math.max(4, room.settings.maxPlayers * 2)) throw new OnlineError("TOO_MANY_JOIN_REQUESTS", "참가 승인 대기열이 가득 찼습니다.");
      const existing = room.joinRequests.find((request) => request.socketId === socketId);
      if (existing) return { room, pending: true, request: existing };
      const request = { id: randomUUID(), name: playerName, socketId, createdAt: this.now() };
      room.joinRequests.push(request);
      this.touch(room);
      return { room, pending: true, request };
    }
    const player = this.makeLobbyPlayer(playerName, room.players.length, socketId);
    room.players.push(player);
    room.processedCommands[player.id] = new Set();
    this.touch(room);
    return { room, player, reconnectToken: player.reconnectToken };
  }

  resolveJoinRequest(roomCode, hostPlayerId, requestId, approved) {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, hostPlayerId);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "게임 시작 후에는 참가 요청을 처리할 수 없습니다.");
    const index = room.joinRequests.findIndex((request) => request.id === requestId);
    if (index < 0) throw new OnlineError("JOIN_REQUEST_NOT_FOUND", "참가 요청을 찾을 수 없습니다.");
    if (approved && room.players.length >= room.settings.maxPlayers) throw new OnlineError("ROOM_FULL", "방이 가득 찼습니다.");
    const [request] = room.joinRequests.splice(index, 1);
    if (!approved) { this.touch(room); return { room, request, approved: false, player: null }; }
    const player = this.makeLobbyPlayer(request.name, room.players.length, request.socketId);
    room.players.push(player);
    room.processedCommands[player.id] = new Set();
    this.touch(room);
    return { room, request, approved: true, player, reconnectToken: player.reconnectToken };
  }

  resumeRoom({ code, playerId, reconnectToken, socketId }) {
    const room = this.requireRoom(code);
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || player.reconnectToken !== reconnectToken) throw new OnlineError("INVALID_RECONNECT_TOKEN", "재접속 정보가 올바르지 않습니다.");
    const replacedSocketId = player.connected ? player.socketId : null;
    player.connected = true;
    player.socketId = socketId;
    this.touch(room);
    return { room, player, reconnectToken: player.reconnectToken, replacedSocketId };
  }

  disconnect(socketId) {
    for (const room of this.rooms.values()) {
      const requestIndex = room.joinRequests.findIndex((request) => request.socketId === socketId);
      if (requestIndex >= 0) {
        room.joinRequests.splice(requestIndex, 1);
        this.touch(room);
        return room;
      }
      const player = room.players.find((candidate) => candidate.socketId === socketId);
      if (!player) continue;
      player.connected = false;
      player.socketId = null;
      if (room.hostPlayerId === player.id) {
        const successor = room.players.find((candidate) => candidate.connected && candidate.id !== player.id);
        if (successor) room.hostPlayerId = successor.id;
      }
      this.touch(room);
      return room;
    }
    return null;
  }

  updateSettings(roomCode, playerId, settings) {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, playerId);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "게임 시작 후에는 방 설정을 바꿀 수 없습니다.");
    const next = this.normalizeSettings({ ...room.settings, ...settings, access: { ...room.settings.access, ...(settings?.access || {}) } });
    if (next.maxPlayers < room.players.length) throw new OnlineError("MAX_PLAYERS_TOO_SMALL", "현재 참가자 수보다 최대 인원을 줄일 수 없습니다.");
    const previousSettings = room.settings;
    const previousSecret = room.accessSecret;
    room.settings = next;
    try { this.configureAccess(room, settings); }
    catch (error) { room.settings = previousSettings; room.accessSecret = previousSecret; throw error; }
    room.players.forEach((player) => { player.ready = false; });
    this.touch(room);
    return room;
  }

  setReady(roomCode, playerId, ready) {
    const room = this.requireRoom(roomCode);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "이미 게임이 시작되었습니다.");
    const player = this.requireLobbyPlayer(room, playerId);
    player.ready = Boolean(ready);
    this.touch(room);
    return room;
  }

  startGame(roomCode, playerId) {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, playerId);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "이미 게임이 시작되었습니다.");
    if (room.players.length < 2) throw new OnlineError("NOT_ENOUGH_PLAYERS", "두 명 이상 참가해야 합니다.");
    if (room.players.some((player) => !player.ready || !player.connected)) throw new OnlineError("PLAYERS_NOT_READY", "모든 참가자가 접속하고 준비해야 합니다.");
    room.players.forEach((player, index) => { player.gamePlayerId = `p${index + 1}`; });
    room.game = new Game({
      playerCount: room.players.length,
      playerNames: room.players.map((player) => player.name),
      mode: room.settings.mode,
      useBackDo: room.settings.useBackDo,
      useNak: room.settings.useNak,
      animationSpeed: 1,
    }, this.rng);
    room.phase = "playing";
    room.joinRequests = [];
    room.sequence += 1;
    this.startOnlineDraft(room, 1);
    this.touch(room);
    return room;
  }

  rematch(roomCode, playerId) {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, playerId);
    if (room.phase !== "finished") throw new OnlineError("GAME_NOT_FINISHED", "게임이 끝난 뒤 다시 플레이할 수 있습니다.");
    room.phase = "lobby";
    room.game = null;
    room.onlineDraft = null;
    room.lastAction = null;
    room.sequence += 1;
    room.joinRequests = [];
    room.players.forEach((player, index) => {
      player.gamePlayerId = null;
      player.color = COLORS[index];
      player.ready = false;
      room.processedCommands[player.id] = new Set();
    });
    this.touch(room);
    return room;
  }

  startOnlineDraft(room, round) {
    const game = room.game;
    let localDraft = game.augmentDraft;
    if (!localDraft?.active || localDraft.round !== round || localDraft.online) {
      game.augments.startDraft(round);
      localDraft = game.augmentDraft;
    }
    const activePlayers = game.players.filter((player) => !player.eliminated);
    const draft = {
      active: true,
      online: true,
      round,
      pick: 1,
      picksPerPlayer: game.settings.mode === "chaos" ? 2 : 1,
      bannedIds: [...(localDraft?.bannedIds || [])],
      selections: [],
      pendingAcquisitions: [],
      mindOwnerIds: [...(localDraft?.mindOwnerIds || [])],
      sharedCandidatesByPick: clone(localDraft?.sharedCandidatesByPick || {}),
      sharedCandidates: clone(localDraft?.sharedCandidates || []),
      players: {},
    };
    game.augmentDraft = draft;
    for (const player of activePlayers) {
      draft.pick = 1;
      const seeded = localDraft?.queue?.[localDraft.playerIndex] === player.id ? localDraft.candidates : null;
      const candidates = seeded?.length === 3 ? [...seeded] : this.draftCandidates(game, draft, player, 1);
      draft.players[player.id] = { pick: 1, done: false, candidates, forcedId: this.forcedDraftId(game, player, candidates) };
    }
    draft.pick = 1;
    room.onlineDraft = draft;
    return draft;
  }

  draftCandidates(game, draft, player, pick) {
    draft.pick = pick;
    const shared = draft.sharedCandidatesByPick?.[pick];
    if (shared?.length) return [...shared];
    return game.augments.candidatesFor(player, draft.round);
  }

  forcedDraftId(game, player, candidates) {
    const forced = game.augments.has(player, "pick_the_cat") || game.players.some((candidate) => game.augments.has(candidate, "royal_selection"));
    return forced && candidates.includes("cat") ? "cat" : null;
  }

  selectOnlineDraft(room, lobbyPlayer, augmentId) {
    const draft = room.onlineDraft;
    const game = room.game;
    const player = game.players.find((candidate) => candidate.id === lobbyPlayer.gamePlayerId);
    const record = draft?.players?.[player?.id];
    if (!draft?.active || !record || record.done) throw new OnlineError("DRAFT_NOT_AVAILABLE", "현재 선택할 증강이 없습니다.");
    if (!record.candidates.includes(augmentId)) throw new OnlineError("INVALID_DRAFT_CHOICE", "제시되지 않은 증강입니다.");
    if (record.forcedId && record.forcedId !== augmentId) throw new OnlineError("CAT_FORCED", "고양이를 선택해야 합니다.");
    const definition = AUGMENTS_BY_ID[augmentId];
    if (!definition?.implemented || player.augments.some((augment) => augment.id === augmentId)) throw new OnlineError("INVALID_DRAFT_CHOICE", "선택할 수 없는 증강입니다.");
    if (augmentId === "objection") {
      draft.bannedIds.push("objection");
      record.candidates = this.draftCandidates(game, draft, player, record.pick);
      record.forcedId = this.forcedDraftId(game, player, record.candidates);
      return { draftRerolled: true };
    }
    const pendingMindGame = draft.mindOwnerIds.length > 0;
    player.augments.push({
      id: augmentId,
      usesRemaining: definition.uses,
      active: true,
      acquiredRound: game.round,
      ...(pendingMindGame ? { pendingDraft: true } : { pendingOnline: true }),
    });
    draft.selections.push({ playerId: player.id, augmentId, pick: record.pick });
    if (record.pick < draft.picksPerPlayer) {
      record.pick += 1;
      record.candidates = this.draftCandidates(game, draft, player, record.pick);
      record.forcedId = this.forcedDraftId(game, player, record.candidates);
    } else {
      record.done = true;
      record.candidates = [];
    }
    if (Object.values(draft.players).every((candidate) => candidate.done)) this.finishOnlineDraft(room);
    return { selected: augmentId };
  }

  finishOnlineDraft(room) {
    const game = room.game;
    const draft = room.onlineDraft;
    draft.active = false;
    game.augmentDraft = draft;
    if (draft.mindOwnerIds.length) game.augments.finalizeMindGameDraft(draft);
    else {
      for (const selection of draft.selections) {
        const player = game.players.find((candidate) => candidate.id === selection.playerId);
        const instance = player.augments.find((augment) => augment.id === selection.augmentId && augment.pendingOnline);
        if (instance) delete instance.pendingOnline;
        game.addLog(`${player.name}이(가) ‘${AUGMENTS_BY_ID[selection.augmentId].name}’을 선택했습니다.`, "augment");
      }
      game.pendingAcquisitions = draft.selections.map(({ playerId, augmentId }) => ({ playerId, augmentId }));
      game.augments.processAcquisitionQueue();
    }
    room.onlineDraft = null;
    game.augmentDraft = { active: false, online: true, round: draft.round, bannedIds: draft.bannedIds };
    game.addLog("모든 플레이어가 온라인 증강 선택을 마쳤습니다.", "augment");
  }

  executeCommand(roomCode, lobbyPlayerId, command) {
    const room = this.requireRoom(roomCode);
    const lobbyPlayer = this.requireLobbyPlayer(room, lobbyPlayerId);
    if (room.phase !== "playing") throw new OnlineError("GAME_NOT_ACTIVE", "게임이 진행 중이 아닙니다.");
    if (!lobbyPlayer.connected) throw new OnlineError("PLAYER_DISCONNECTED", "재접속 후 행동해 주세요.");
    const commandId = String(command?.commandId || "");
    if (!commandId || commandId.length > 80) throw new OnlineError("INVALID_COMMAND_ID", "명령 ID가 올바르지 않습니다.");
    const processed = room.processedCommands[lobbyPlayer.id] ||= new Set();
    if (processed.has(commandId)) return { duplicate: true, sequence: room.sequence };
    if (Number(command.expectedSequence) !== room.sequence) throw new OnlineError("STALE_SEQUENCE", "게임 상태가 갱신되었습니다. 최신 상태에서 다시 시도해 주세요.");
    const beforeValidation = this.validateRoomState(room);
    if (!beforeValidation.ok) throw new OnlineError("INVALID_GAME_STATE", "게임 상태가 올바르지 않아 명령을 처리할 수 없습니다.");
    const snapshot = { game: clone(room.game.toJSON()), onlineDraft: clone(room.onlineDraft), phase: room.phase, lastAction: clone(room.lastAction) };
    const type = String(command.type || "").slice(0, 40);
    let action;
    try {
      if (type === "draft:select") action = this.selectOnlineDraft(room, lobbyPlayer, String(command.payload?.augmentId || ""));
      else if (type === "interaction:resolve") {
        this.requireInteractionActor(room, lobbyPlayer.gamePlayerId);
        action = room.game.resolveInteraction(this.safePayload(command.payload));
      } else {
        this.requireCurrentActor(room, lobbyPlayer.gamePlayerId);
        action = this.executeTurnCommand(room, type, this.safePayload(command.payload));
      }
      const afterValidation = this.validateRoomState(room);
      if (!afterValidation.ok) throw new OnlineError("INVALID_GAME_STATE", "명령 처리 후 게임 상태 검증에 실패했습니다.");
    } catch (error) {
      room.game = Game.restore(snapshot.game, this.rng);
      // Game.restore는 오래된 오프라인 저장본을 보정하기 위해 1라운드 드래프트를
      // 자동 생성할 수 있다. 서버 명령 롤백에서는 스냅샷이 절대 기준이므로 원래
      // 드래프트 상태를 다시 덮어써야 거부된 명령이 새 선택창을 만들지 않는다.
      room.game.augmentDraft = clone(snapshot.game.augmentDraft);
      room.onlineDraft = snapshot.onlineDraft;
      if (room.onlineDraft?.active) room.game.augmentDraft = room.onlineDraft;
      room.phase = snapshot.phase;
      room.lastAction = snapshot.lastAction;
      if (error instanceof OnlineError) throw error;
      throw new OnlineError("ACTION_REJECTED", error.message || "허용되지 않은 행동입니다.");
    }
    processed.add(commandId);
    while (processed.size > 200) processed.delete(processed.values().next().value);
    room.sequence += 1;
    room.lastAction = { sequence: room.sequence, playerId: lobbyPlayer.gamePlayerId, type, action: clone(action) };
    if (room.game.status === "finished") room.phase = "finished";
    this.touch(room);
    return { action, sequence: room.sequence };
  }

  safePayload(payload) {
    const value = clone(payload || {});
    if (JSON.stringify(value).length > 20_000) throw new OnlineError("PAYLOAD_TOO_LARGE", "요청 데이터가 너무 큽니다.");
    if (value.power != null && (!Number.isFinite(Number(value.power)) || Number(value.power) < 0 || Number(value.power) > 100)) throw new OnlineError("INVALID_MINIGAME_INPUT", "미니게임 입력 범위가 올바르지 않습니다.");
    return value;
  }

  executeTurnCommand(room, type, payload) {
    const game = room.game;
    if (type === "throw") {
      const requestedLabel = payload.requestedLabel ?? null;
      if (requestedLabel != null && !["도", "개"].includes(requestedLabel)) throw new OnlineError("FORGED_THROW_RESULT", "클라이언트는 윷 결과를 지정할 수 없습니다.");
      return { type, result: game.throw(requestedLabel) };
    }
    if (type === "move") {
      const stackMode = payload.stackMode == null ? "stack" : String(payload.stackMode);
      if (!["stack", "separate"].includes(stackMode)) throw new OnlineError("INVALID_STACK_MODE", "말 배치 방식이 올바르지 않습니다.");
      return { type, event: game.move(String(payload.pieceId || ""), String(payload.resultId || ""), Number(payload.optionIndex) || 0, stackMode) };
    }
    if (type === "discardResult") { game.discardResult(String(payload.resultId || "")); return { type }; }
    if (type === "endTurn") {
      game.endTurn();
      if (game.augmentDraft?.active && !game.augmentDraft.online && [6, 12].includes(game.round)) this.startOnlineDraft(room, game.round);
      return { type };
    }
    if (type === "useAugment") {
      const augmentId = String(payload.augmentId || "");
      const augmentPayload = payload.payload || {};
      // 알까기의 목표 지점은 서버 규칙으로 고정해 클라이언트가 명중 판정을 조작하지 못하게 한다.
      if (augmentId === "flicking") augmentPayload.target = 65;
      return { type, outcome: game.useAugment(augmentId, augmentPayload) };
    }
    if (type === "useSpecial") return { type, event: game.useSpecialAction(String(payload.actionId || ""), payload.payload || {}) };
    throw new OnlineError("UNKNOWN_COMMAND", "지원하지 않는 게임 명령입니다.");
  }

  requiredInteractionActor(game) {
    const interaction = game.interaction;
    if (!interaction?.active) return null;
    if (interaction.type === "colorGuess") return interaction.data.voters[interaction.data.index];
    if (interaction.type === "vote") return interaction.data.voters[interaction.data.index];
    if (interaction.type === "bluff") return interaction.data.judges[interaction.data.index];
    if (interaction.type === "prisoners") return interaction.data.players[interaction.data.index];
    return interaction.ownerId;
  }

  requireInteractionActor(room, gamePlayerId) {
    const required = this.requiredInteractionActor(room.game);
    if (!required || required !== gamePlayerId) throw new OnlineError("NOT_INTERACTION_ACTOR", "현재 선택을 진행할 플레이어가 아닙니다.");
  }

  requireCurrentActor(room, gamePlayerId) {
    if (room.onlineDraft?.active) throw new OnlineError("DRAFT_ACTIVE", "모든 플레이어가 증강을 선택해야 합니다.");
    if (room.game.interaction?.active) throw new OnlineError("INTERACTION_ACTIVE", "진행 중인 선택을 먼저 마쳐야 합니다.");
    if (room.game.currentPlayer.id !== gamePlayerId) throw new OnlineError("NOT_YOUR_TURN", "현재 자신의 차례가 아닙니다.");
  }

  view(roomCode, lobbyPlayerId) {
    const room = this.requireRoom(roomCode);
    const viewer = this.requireLobbyPlayer(room, lobbyPlayerId);
    return {
      sequence: room.sequence,
      room: {
        code: room.code,
        phase: room.phase,
        settings: room.settings,
        hostPlayerId: room.hostPlayerId,
        players: room.players.map(({ reconnectToken: _token, socketId: _socket, ...player }) => player),
        joinRequests: viewer.id === room.hostPlayerId ? room.joinRequests.map(({ socketId: _socket, ...request }) => request) : [],
      },
      you: { playerId: viewer.id, gamePlayerId: viewer.gamePlayerId, isHost: viewer.id === room.hostPlayerId },
      game: room.game ? this.gameView(room, viewer.gamePlayerId) : null,
      lastAction: this.actionView(room.lastAction, viewer.gamePlayerId, room),
    };
  }

  actionView(lastAction, viewerGamePlayerId, room) {
    if (!lastAction) return null;
    const action = clone(lastAction);
    if (action.type === "draft:select" && action.playerId !== viewerGamePlayerId && room.onlineDraft?.active) {
      action.action = { waiting: true };
      return action;
    }
    const result = action.action?.result;
    if (result?.hidden) Object.assign(result, { label: null, steps: null, sticks: [] });
    const fog = room.game?.boardState?.fog;
    if (fog?.turnsRemaining && fog.ownerId !== viewerGamePlayerId && action.playerId !== viewerGamePlayerId) {
      const event = action.action?.event || action.action?.outcome?.event;
      if (event) Object.assign(event, { from: null, target: null, pathNodes: [] });
    }
    return action;
  }

  gameView(room, viewerGamePlayerId) {
    const state = clone(room.game.toJSON());
    state.pendingAcquisitions = [];
    for (const player of state.players) {
      if (player.id !== viewerGamePlayerId) player.augments = player.augments.filter((augment) => !augment.pendingDraft && !augment.pendingOnline);
    }
    for (const result of state.turn.results || []) {
      if (result.hidden) Object.assign(result, { label: null, steps: null, sticks: [] });
    }
    const draft = room.onlineDraft;
    if (draft?.active) {
      const record = draft.players[viewerGamePlayerId];
      state.augmentDraft = {
        active: true,
        online: true,
        round: draft.round,
        pick: record?.pick || draft.picksPerPlayer,
        picksPerPlayer: draft.picksPerPlayer,
        candidates: record?.candidates || [],
        done: Boolean(record?.done),
        progress: Object.fromEntries(Object.entries(draft.players).map(([id, value]) => [id, value.done])),
      };
    } else state.augmentDraft = { active: false, online: true, round: state.round, candidates: [] };

    const requiredActorId = this.requiredInteractionActor(room.game);
    if (state.interaction?.active) {
      if (requiredActorId !== viewerGamePlayerId) state.interaction = { active: true, type: "waiting", ownerId: state.interaction.ownerId, data: { requiredActorId } };
      else {
        delete state.interaction.data.actualLabel;
        delete state.interaction.data.choices;
        delete state.interaction.data.votes;
        delete state.interaction.data.accusations;
        delete state.interaction.answers;
      }
    }
    this.applyFogPrivacy(state, viewerGamePlayerId);
    return state;
  }

  applyFogPrivacy(state, viewerGamePlayerId) {
    const fog = state.boardState?.fog;
    if (!fog?.turnsRemaining || fog.ownerId === viewerGamePlayerId) return;
    const viewer = state.players.find((player) => player.id === viewerGamePlayerId);
    if (!viewer) return;
    const visibleNodes = new Set(viewer.pieces.filter((piece) => ![WAIT, HOME, null].includes(piece.node)).map((piece) => piece.node));
    const occupiedViewerNodes = new Set(visibleNodes);
    const edges = [
      ["HOME", "R1"], ["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "TR"],
      ["TR", "T1"], ["T1", "T2"], ["T2", "T3"], ["T3", "T4"], ["T4", "TL"],
      ["TL", "L1"], ["L1", "L2"], ["L2", "L3"], ["L3", "L4"], ["L4", "BL"],
      ["BL", "B1"], ["B1", "B2"], ["B2", "B3"], ["B3", "B4"], ["B4", "HOME"],
      ["TR", "DTR2"], ["DTR2", "DTR1"], ["DTR1", "C"], ["C", "DBL1"], ["DBL1", "DBL2"], ["DBL2", "BL"],
      ["TL", "DTL2"], ["DTL2", "DTL1"], ["DTL1", "C"], ["C", "DS1"], ["DS1", "DS2"], ["DS2", "HOME"],
    ];
    for (const [from, to] of edges) {
      if (occupiedViewerNodes.has(from)) visibleNodes.add(to);
      if (occupiedViewerNodes.has(to)) visibleNodes.add(from);
    }
    for (const player of state.players) {
      if (player.id === viewerGamePlayerId) continue;
      for (const piece of player.pieces) {
        if (![WAIT, HOME, null].includes(piece.node) && !visibleNodes.has(piece.node)) Object.assign(piece, { node: null, route: null, hiddenOnline: true });
      }
    }
  }

  kickPlayer(roomCode, hostPlayerId, targetPlayerId) {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, hostPlayerId);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "게임 시작 후에는 플레이어를 내보낼 수 없습니다.");
    if (targetPlayerId === hostPlayerId) throw new OnlineError("CANNOT_KICK_HOST", "방장은 자신을 내보낼 수 없습니다.");
    const target = this.requireLobbyPlayer(room, targetPlayerId);
    this.removeLobbyPlayer(roomCode, targetPlayerId);
    return { room: this.rooms.get(roomCode) || null, target };
  }

  cleanupExpiredRooms() {
    const now = this.now();
    const removed = [];
    for (const room of this.rooms.values()) {
      const connected = room.players.some((player) => player.connected) || room.joinRequests.some((request) => request.socketId);
      const age = now - room.updatedAt;
      const empty = room.players.length === 0;
      const expired = !connected && (
        empty && age >= this.emptyRoomTtlMs
        || room.phase === "finished" && age >= this.finishedRoomTtlMs
        || age >= this.idleRoomTtlMs
      );
      if (expired) {
        this.rooms.delete(room.code);
        removed.push(room.code);
      }
    }
    return removed;
  }

  validateRoomState(room) {
    const issues = [];
    if (!room || !ROOM_CODE.test(String(room.code || ""))) issues.push("invalid room code");
    if (!Array.isArray(room?.players) || room.players.length > 4) issues.push("invalid player count");
    if (room?.players && new Set(room.players.map((player) => player.id)).size !== room.players.length) issues.push("duplicate lobby player id");
    if (["playing", "finished"].includes(room?.phase)) {
      const game = room.game;
      if (!game || !Array.isArray(game.players) || game.players.length < 2 || game.players.length > 4) issues.push("missing game players");
      else {
        if (!Number.isInteger(game.currentPlayerIndex) || game.currentPlayerIndex < 0 || game.currentPlayerIndex >= game.players.length) issues.push("invalid current player index");
        const pieceIds = new Set();
        for (const player of game.players) {
          for (const piece of player.pieces || []) {
            if (pieceIds.has(piece.id)) issues.push("duplicate piece id");
            pieceIds.add(piece.id);
            if (!VALID_NODES.has(piece.node)) issues.push("invalid piece node");
          }
        }
        if (!Number.isInteger(game.turn?.throwsRemaining) || game.turn.throwsRemaining < 0 || game.turn.throwsRemaining > 100) issues.push("invalid throw count");
        if (!Array.isArray(game.turn?.results) || game.turn.results.length > 100) issues.push("invalid stored results");
        if (room.onlineDraft?.active && !room.onlineDraft.players) issues.push("invalid online draft");
      }
    }
    return { ok: issues.length === 0, issues };
  }

  auditRooms() {
    const invalid = [];
    for (const room of this.rooms.values()) {
      const result = this.validateRoomState(room);
      if (!result.ok) invalid.push({ code: room.code, issues: result.issues });
    }
    return { ok: invalid.length === 0, roomCount: this.rooms.size, invalid };
  }

  removeLobbyPlayer(roomCode, playerId) {
    const room = this.requireRoom(roomCode);
    if (room.phase !== "lobby") throw new OnlineError("GAME_ALREADY_STARTED", "게임 중에는 방에서 제거할 수 없습니다.");
    const target = this.requireLobbyPlayer(room, playerId);
    room.players = room.players.filter((player) => player.id !== playerId);
    room.players.forEach((player, index) => { player.color = COLORS[index]; });
    delete room.processedCommands[playerId];
    if (!room.players.length) this.rooms.delete(room.code);
    else if (room.hostPlayerId === playerId) room.hostPlayerId = room.players[0].id;
    this.touch(room);
    return target;
  }

  requireRoom(code) {
    if (!ROOM_CODE.test(String(code || ""))) throw new OnlineError("INVALID_ROOM_CODE", "6자리 방 코드를 입력해 주세요.");
    const room = this.rooms.get(String(code));
    if (!room) throw new OnlineError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
    return room;
  }

  requireLobbyPlayer(room, playerId) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new OnlineError("PLAYER_NOT_FOUND", "방 참가자를 찾을 수 없습니다.");
    return player;
  }

  requireHost(room, playerId) {
    if (room.hostPlayerId !== playerId) throw new OnlineError("HOST_ONLY", "방장만 실행할 수 있습니다.");
  }

  touch(room) { room.updatedAt = this.now(); }
}
