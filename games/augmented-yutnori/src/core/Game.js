import { HOME, OUTER_PATH, WAIT, getMoveOptions, getReverseMoveOptions, physicalNodeKey } from "./board.js";
import { throwSixYut, throwTwoStickPair, throwVariableYut, throwYut } from "./yut.js";
import { AugmentEngine } from "../augments/AugmentEngine.js";
import { AUGMENTS_BY_ID } from "../augments/definitions.js";
import { EventBus } from "./EventBus.js";

const COLOR_NAMES = { red: "빨강", blue: "파랑", green: "초록", yellow: "노랑" };
const DEFAULT_COLORS = ["red", "blue", "green", "yellow"];

function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const freshTurn = (overrides = {}) => ({ throwsRemaining: 1, results: [], specialUsed: {}, moveMultiplier: 1, isEchoSecond: false, ...overrides });

export class Game {
  constructor(settings, rng = Math.random) {
    this.rng = rng;
    this.settings = {
      playerCount: 2,
      playerNames: ["플레이어 1", "플레이어 2"],
      mode: "normal",
      useBackDo: true,
      useNak: false,
      animationSpeed: 1,
      ...settings,
    };
    const players = Array.from({ length: this.settings.playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: this.settings.playerNames[index]?.trim() || `플레이어 ${index + 1}`,
      color: DEFAULT_COLORS[index],
      eliminated: false,
      augments: [],
      pendingThrowOverride: null,
      pendingResults: [],
      skipTurns: 0,
      links: [],
      yutCount: 4,
      health: null,
      rankLocked: null,
      resources: { dogCoins: 0, pendingGeol: 0, pendingGae: 0, deathWatch: 0, ritualCoins: 0, garlic: 0 },
      stats: { throws: {}, backdoCaptures: 0, geolCount: 0, turnThrows: {}, capturesSinceCoup: 0, capturedByPlayers: [] },
      pieces: Array.from({ length: 4 }, (_, pieceIndex) => ({
        id: `p${index + 1}-m${pieceIndex + 1}`,
        number: pieceIndex + 1,
        node: WAIT,
        route: "outer",
        type: "normal",
        effects: [],
      })),
    }));
    this.players = shuffle(players, rng);
    this.currentPlayerIndex = 0;
    this.round = 1;
    this.status = "playing";
    this.winnerIds = [];
    this.victoryReason = null;
    this.rankings = [];
    this.echoEnabled = false;
    this.resultSequence = 0;
    this.effectSequence = 0;
    this.turn = freshTurn();
    this.logs = [];
    this.augmentDraft = null;
    this.interaction = null;
    this.pendingAcquisitions = [];
    this.boardState = { rotation: 0, fold: null, fog: null, markers: [], reaper: null };
    this.events = new EventBus();
    this.augments = new AugmentEngine(this);
    this.addLog(`${this.currentPlayer.name}부터 시작합니다.`, "turn");
    this.addLog(`플레이 순서: ${this.players.map((player) => player.name).join(" → ")}`, "system");
    this.augments.startDraft(1);
  }

  static restore(data, rng = Math.random) {
    const game = Object.create(Game.prototype);
    Object.assign(game, data);
    game.rng = rng;
    game.effectSequence ??= 0;
    game.augmentDraft ??= null;
    if (game.augmentDraft) game.augmentDraft = { bannedIds: [], ...game.augmentDraft };
    game.interaction ??= null;
    game.pendingAcquisitions ??= [];
    game.boardState = { rotation: 0, fold: null, fog: null, markers: [], reaper: null, ...(game.boardState || {}) };
    game.events = new EventBus();
    game.turn = { ...freshTurn(), ...(game.turn || {}), specialUsed: game.turn?.specialUsed || {} };
    game.players = game.players.map((player) => ({
      augments: [],
      pendingThrowOverride: null,
      pendingResults: [],
      skipTurns: 0,
      links: [],
      yutCount: 4,
      health: null,
      rankLocked: null,
      resources: { dogCoins: 0, pendingGeol: 0, pendingGae: 0, deathWatch: 0, ritualCoins: 0, garlic: 0 },
      stats: { throws: {}, backdoCaptures: 0, geolCount: 0, turnThrows: {}, capturesSinceCoup: 0, capturedByPlayers: [] },
      ...player,
      resources: { dogCoins: 0, pendingGeol: 0, pendingGae: 0, deathWatch: 0, ritualCoins: 0, garlic: 0, ...(player.resources || {}) },
      stats: { throws: {}, backdoCaptures: 0, geolCount: 0, turnThrows: {}, capturesSinceCoup: 0, capturedByPlayers: [], ...(player.stats || {}) },
      pieces: player.pieces.map((piece) => ({ type: "normal", effects: [], ...piece })),
    }));
    game.rankings ??= [];
    game.echoEnabled ??= false;
    game.augments = new AugmentEngine(game);
    if (!game.augmentDraft?.active && [1, 6, 12].includes(game.round) && game.players.every((player) => !player.augments.length)) {
      game.augments.startDraft(game.round);
    }
    return game;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get draftPlayer() {
    if (!this.augmentDraft?.active) return null;
    return this.players.find((player) => player.id === this.augmentDraft.queue[this.augmentDraft.playerIndex]);
  }

  addLog(message, type = "info") {
    this.logs.unshift({ id: `${Date.now()}-${this.logs.length}`, message, type, round: this.round });
    this.logs = this.logs.slice(0, 80);
  }

  assertPlayable() {
    if (this.status !== "playing") throw new Error("게임이 끝났습니다.");
    if (this.augmentDraft?.active) throw new Error("모든 플레이어의 증강 선택을 먼저 마쳐 주세요.");
    if (this.interaction?.active) throw new Error("진행 중인 선택을 먼저 마쳐 주세요.");
  }

  selectDraftAugment(augmentId) {
    return this.augments.selectDraftAugment(this.draftPlayer.id, augmentId);
  }

  throw(requestedLabel = null) {
    this.assertPlayable();
    if (this.turn.throwsRemaining < 1) throw new Error("지금은 윷을 던질 수 없습니다.");
    const player = this.currentPlayer;
    this.events.emit("beforeThrow", { game: this, player, requestedLabel });
    const override = this.augments.buildThrow(player, requestedLabel);
    this.turn.throwsRemaining -= 1;
    let generated;
    if (override) generated = [override];
    else if (this.augments.has(player, "too_much_is_bad")) generated = [throwSixYut(this.rng)];
    else if (this.augments.has(player, "dual_wield")) generated = [throwTwoStickPair(this.rng), throwTwoStickPair(this.rng)];
    else if ((player.yutCount || 4) !== 4) generated = [throwVariableYut(player.yutCount, this.rng, this.augments.throwSettings(player))];
    else generated = [throwYut(this.rng, this.augments.throwSettings(player))];

    const stored = [];
    for (const result of generated) {
      result.id = `r${++this.resultSequence}`;
      this.augments.onAnyThrow(player, result);
      if (result.eliminates) {
        this.addLog(`${player.name}이(가) 과유불급으로 앞면 6개를 내 탈락했습니다.`, "victory");
        this.eliminatePlayer(player, "과유불급");
      } else if (result.isNak) {
        this.addLog(`${player.name}의 윷이 판 밖으로 나갔습니다.`, "throw");
      } else {
        this.turn.results.push(result);
        stored.push(result);
        this.addLog(`${player.name}이(가) ‘${result.label}’${result.steps > 0 ? `(${result.steps}칸)` : ""}을 던졌습니다.`, "throw");
        if (result.extra) {
          this.turn.throwsRemaining += 1;
          this.addLog(`${result.label}! 한 번 더 던질 수 있습니다.`, "bonus");
        }
        this.augments.onThrowResult(player, result);
      }
    }
    const primary = generated[0];
    primary.bonusResults = stored.slice(1);
    primary.autoMoves = this.augments.afterThrow(player);
    this.augments.afterThrowInteraction(player, primary, stored);
    this.events.emit("afterThrow", { game: this, player, result: primary, results: stored });
    return primary;
  }

  getResult(resultId) {
    return this.turn.results.find((result) => result.id === resultId);
  }

  getStack(player, piece) {
    if (piece.node === WAIT || piece.node === HOME || piece.type === "pawn") return [piece];
    return player.pieces.filter((candidate) => candidate.node === piece.node
      && candidate.type !== "pawn"
      && (piece.stackId ? candidate.stackId === piece.stackId : !candidate.stackId));
  }

  getFriendlyPiecesAt(player, target, movingPieces = []) {
    if ([WAIT, HOME].includes(target)) return [];
    const movingIds = new Set(movingPieces.map((piece) => piece.id));
    const targetKey = physicalNodeKey(target, this.boardState);
    return player.pieces.filter((piece) => !movingIds.has(piece.id)
      && ![WAIT, HOME].includes(piece.node)
      && physicalNodeKey(piece.node, this.boardState) === targetKey);
  }

  needsStackChoice(player, movingPieces, target) {
    return this.getFriendlyPiecesAt(player, target, movingPieces).length > 0;
  }

  resolveFriendlyLanding(player, movingPieces, target, stackMode = "stack", friendlyPieces = null) {
    const friendly = friendlyPieces || this.getFriendlyPiecesAt(player, target, movingPieces);
    if (!friendly.length) return;
    if (!['stack', 'separate'].includes(stackMode)) throw new Error("말 배치 방식을 다시 선택해 주세요.");
    if (stackMode === "stack") {
      [...friendly, ...movingPieces].forEach((piece) => { piece.stackId = null; });
      return;
    }
    const legacyFriendly = friendly.filter((piece) => !piece.stackId);
    if (legacyFriendly.length) {
      const friendlyStackId = `stack-${player.id}-${++this.effectSequence}`;
      legacyFriendly.forEach((piece) => { piece.stackId = friendlyStackId; });
    }
    if (movingPieces.some((piece) => !piece.stackId)) {
      const movingStackId = `stack-${player.id}-${++this.effectSequence}`;
      movingPieces.forEach((piece) => { piece.stackId = movingStackId; });
    }
  }

  effectiveSteps(player, result) {
    return this.augments.modifyMoveSteps(player, result.steps);
  }

  getMoveOptionsForPiece(piece, result, player = this.currentPlayer) {
    const steps = this.effectiveSteps(player, result);
    return this.augments.has(player, "moonwalk") ? getReverseMoveOptions(piece, steps) : getMoveOptions(piece, steps);
  }

  getMovablePieces(resultId) {
    const result = this.getResult(resultId);
    if (!result) return [];
    const owners = this.augments.has(this.currentPlayer, "hypnosis") ? this.players : [this.currentPlayer];
    return owners.flatMap((owner) => owner.pieces.filter((piece) => piece.type !== "pawn" && this.augments.canMovePiece(piece) && this.getMoveOptionsForPiece(piece, result, owner).length > 0));
  }

  move(pieceId, resultId, optionIndex = 0, stackMode = "stack") {
    this.assertPlayable();
    const result = this.getResult(resultId);
    if (!result) throw new Error("사용할 수 없는 이동 결과입니다.");
    const owner = this.players.find((player) => player.pieces.some((candidate) => candidate.id === pieceId));
    const piece = owner?.pieces.find((candidate) => candidate.id === pieceId);
    const canHypnotize = owner && owner.id !== this.currentPlayer.id && this.augments.has(this.currentPlayer, "hypnosis");
    if (!piece || piece.type === "pawn" || !this.augments.canMovePiece(piece) || owner.id !== this.currentPlayer.id && !canHypnotize) throw new Error("현재 플레이어가 조작할 수 있는 말이 아닙니다.");
    const options = this.getMoveOptionsForPiece(piece, result, owner);
    const option = options[optionIndex];
    if (!option) throw new Error("선택한 경로로 이동할 수 없습니다.");

    const stack = this.getStack(owner, piece);
    this.events.emit("beforeMove", { game: this, player: owner, controller: this.currentPlayer, piece, stack, result, option });
    const modifiedOption = this.augments.modifyPath(owner, stack, option);
    const hazardEvent = this.augments.triggerPathHazards(owner, stack, modifiedOption.pathNodes);
    const event = hazardEvent || this.applyRelocation(owner, stack, modifiedOption.target, {
      from: piece.node,
      route: modifiedOption.route,
      pathNodes: modifiedOption.pathNodes,
      reason: result.label,
      stackMode,
    });
    this.turn.results = this.turn.results.filter((candidate) => candidate.id !== resultId);
    this.logMove(owner, piece, stack, event.target, result.label);
    if (event.capturedIds.length) {
      this.turn.throwsRemaining += 1;
      this.addLog(`상대 말 ${event.capturedIds.length}개를 잡아 추가 던지기를 얻었습니다.`, "capture");
      if (result.label === "백도") {
        this.currentPlayer.stats.backdoCaptures += event.capturedIds.length;
        this.augments.checkVictory(this.currentPlayer);
      }
    }
    this.augments.checkVictory(owner);
    this.events.emit("afterMove", { game: this, player: owner, controller: this.currentPlayer, piece, stack, result, option: modifiedOption, event });
    return event;
  }

  logMove(player, piece, stack, target, label) {
    const pieceLabel = stack.length > 1 ? `말 ${stack.length}개 묶음` : `말 ${piece.number}`;
    if (target === HOME) this.addLog(`${player.name}의 ${pieceLabel}이(가) 완주했습니다!`, "finish");
    else this.addLog(`${player.name}의 ${pieceLabel}이(가) ${label}만큼 이동했습니다.`, "move");
  }

  applyRelocation(player, movingPieces, target, { from, route = "outer", pathNodes = [target], reason = "이동", stackMode = "stack" } = {}) {
    const riders = this.players.flatMap((owner) => owner.pieces.filter((piece) => piece.riding?.hostPlayerId === player.id && piece.node === from));
    const friendlyAtTarget = this.getFriendlyPiecesAt(player, target, movingPieces);
    for (const member of movingPieces) {
      member.node = target;
      member.route = route;
      member.riding = null;
    }
    for (const rider of riders) {
      rider.node = target;
      rider.route = route;
    }
    this.resolveFriendlyLanding(player, movingPieces, target, stackMode, friendlyAtTarget);
    const captured = [WAIT, HOME].includes(target) ? [] : this.captureAt(player, movingPieces, target, reason);
    const event = {
      playerId: player.id,
      color: player.color,
      movingIds: [...movingPieces, ...riders].map((piece) => piece.id),
      from,
      target,
      pathNodes,
      capturedIds: captured.map((piece) => piece.id),
    };
    this.augments.onRelocation(player, movingPieces, event);
    return event;
  }

  relocateStack(player, piece, target, options = {}) {
    const stack = this.getStack(player, piece);
    const route = target === WAIT || OUTER_PATH.includes(target) && !["TR", "TL", "BL"].includes(target) ? "outer" : (options.route || piece.route);
    const event = this.applyRelocation(player, stack, target, { from: piece.node, pathNodes: [target], route, reason: options.reason });
    if (event.capturedIds.length) this.turn.throwsRemaining += 1;
    return event;
  }

  relocateSpecificPiece(player, piece, target, options = {}) {
    const route = target === WAIT ? "outer" : (options.route || piece.route);
    const event = this.applyRelocation(player, [piece], target, { from: piece.node, pathNodes: [target], route, reason: options.reason });
    if (event.capturedIds.length) this.turn.throwsRemaining += 1;
    return event;
  }

  relocateBySteps(player, piece, steps, options = {}) {
    const moveOption = getMoveOptions(piece, steps)[0];
    if (!moveOption) return null;
    const moving = options.singlePiece ? [piece] : this.getStack(player, piece);
    const event = this.applyRelocation(player, moving, moveOption.target, {
      from: piece.node,
      pathNodes: moveOption.pathNodes,
      route: moveOption.route,
      reason: options.reason,
    });
    if (event.capturedIds.length) this.turn.throwsRemaining += 1;
    this.addLog(`${player.name}의 ${options.reason || "특수 이동"}이 발동했습니다.`, "augment");
    return event;
  }

  captureAt(attacker, movingPieces, target, reason) {
    const captured = [];
    const attackingZombie = movingPieces.find((piece) => piece.type === "zombie");
    const attackingPelican = movingPieces.find((piece) => piece.type === "pelican");
    const targetKey = physicalNodeKey(target, this.boardState);
    for (const opponent of this.players.filter((player) => player.id !== attacker.id)) {
      const victims = opponent.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node) && physicalNodeKey(piece.node, this.boardState) === targetKey);
      if (!victims.length) continue;
      if (attackingPelican) {
        attackingPelican.special ??= {};
        attackingPelican.special.swallowed ??= [];
        for (const victim of victims) {
          victim.node = WAIT;
          victim.route = "outer";
          victim.stackId = null;
          victim.swallowedBy = attackingPelican.id;
          attackingPelican.special.swallowed.push({ pieceId: victim.id, playerId: opponent.id });
        }
        captured.push(...victims);
        this.addLog(`${attacker.name}의 펠리컨이 ${opponent.name}의 말 ${victims.length}개를 삼켰습니다.`, "augment");
        this.augments.onCapture(attacker, opponent, victims, movingPieces, { swallowed: true });
        continue;
      }
      if (!attackingZombie && this.augments.has(attacker, "free_ride") && !this.interaction?.active) {
        this.beginInteraction("freeRide", attacker.id, {
          movingPieceIds: movingPieces.map((piece) => piece.id),
          victimPieceIds: victims.map((piece) => piece.id),
          victimPlayerId: opponent.id,
          node: target,
        });
        continue;
      }
      if (attackingZombie) {
        for (const victim of victims) {
          victim.type = "zombie";
          victim.infectionOwnerId = attackingZombie.infectionOwnerId || attacker.id;
          this.resetAfterDeath(victim);
        }
        captured.push(...victims);
        this.addLog(`${attacker.name}의 좀비가 ${victims.length}개 말을 감염시켰습니다.`, "augment");
      } else {
        const killed = this.killStack(opponent, victims, { reason, attacker });
        captured.push(...killed);
        if (killed.length) this.augments.onCapture(attacker, opponent, killed, movingPieces, { reason });
      }
    }
    this.players.forEach((player) => this.augments.checkVictory(player));
    return captured;
  }

  beginInteraction(type, ownerId, data = {}) {
    this.interaction = { active: true, type, ownerId, data, stage: 0, answers: [] };
    return this.interaction;
  }

  resolveInteraction(choice) {
    if (!this.interaction?.active) throw new Error("진행 중인 상호작용이 없습니다.");
    return this.augments.resolveInteraction(choice);
  }

  killStack(owner, victims, { reason = "죽음", attacker = null } = {}) {
    victims = this.augments.filterDeaths(owner, victims, { reason, attacker });
    if (!victims.length) return [];
    const deathEvent = this.events.emit("beforePieceDeath", { game: this, owner, victims, reason });
    if (deathEvent.cancelled) return [];
    const shielded = victims.some((piece) => piece.effects.some((effect) => effect.type === "shield"));
    if (shielded) {
      victims.forEach((piece) => { piece.effects = piece.effects.filter((effect) => effect.type !== "shield"); });
      this.addLog(`${owner.name}의 천상 보호막이 말뭉치를 지켰습니다.`, "augment");
      return [];
    }
    const killed = this.augments.has(owner, "friend_shield") && victims.length > 1 ? [victims.at(-1)] : victims;
    if (killed.length < victims.length) this.addLog(`${owner.name}의 프랜드 실드로 말 1개만 죽었습니다.`, "augment");
    const campfire = victims.flatMap((piece) => piece.effects).find((effect) => effect.type === "campfire");
    const killedNodes = new Set(killed.map((piece) => piece.node));
    this.players.flatMap((player) => player.pieces).filter((piece) => piece.riding?.hostPlayerId === owner.id && killedNodes.has(piece.node)).forEach((piece) => { piece.riding = null; });
    killed.forEach((piece) => this.resetAfterDeath(piece));
    if (campfire && killed.length) {
      killed.forEach((piece) => { piece.node = campfire.node; piece.route = campfire.route || "outer"; });
      victims.forEach((piece) => { piece.effects = piece.effects.filter((effect) => effect.type !== "campfire"); });
      this.boardState.markers = this.boardState.markers.filter((marker) => marker.id !== campfire.id);
      this.addLog(`${owner.name}의 말이 화톳불에서 부활했습니다.`, "augment");
    }
    if (killed.length) this.addLog(`${reason}: ${owner.name}의 말 ${killed.length}개가 대기로 돌아갔습니다.`, "capture");
    this.augments.onPiecesDied(owner, killed, { reason, attacker });
    this.events.emit("afterPieceDeath", { game: this, owner, killed, survivors: victims.filter((piece) => !killed.includes(piece)), reason });
    return killed;
  }

  resetAfterDeath(piece) {
    piece.node = WAIT;
    piece.route = "outer";
    piece.stackId = null;
    piece.effects = [];
    piece.riding = null;
  }

  useAugment(augmentId, payload) {
    this.assertPlayable();
    return this.augments.use(this.currentPlayer.id, augmentId, payload);
  }

  useSpecialAction(actionId, payload) {
    this.assertPlayable();
    return this.augments.useSpecialAction(this.currentPlayer.id, actionId, payload);
  }

  getSpecialActions() {
    return this.augments.specialActions(this.currentPlayer);
  }

  discardResult(resultId) {
    const result = this.getResult(resultId);
    if (!result) throw new Error("존재하지 않는 이동 결과입니다.");
    if (this.getMovablePieces(resultId).length) throw new Error("이동 가능한 말이 있어 결과를 넘길 수 없습니다.");
    this.turn.results = this.turn.results.filter((candidate) => candidate.id !== resultId);
    this.addLog(`${result.label}로 움직일 말이 없어 결과를 넘겼습니다.`, "system");
  }

  canEndTurn() {
    return this.status === "playing" && !this.augmentDraft?.active && !this.interaction?.active && this.turn.throwsRemaining === 0 && this.turn.results.length === 0;
  }

  endTurn() {
    if (!this.canEndTurn()) throw new Error("남은 던지기와 이동 결과를 먼저 처리해 주세요.");
    const previous = this.currentPlayer;
    this.events.emit("onTurnEnd", { game: this, player: previous, round: this.round });
    this.augments.onTurnEnd(previous);
    if (this.status !== "playing") return;
    if (this.echoEnabled && !this.turn.isEchoSecond && !previous.eliminated) {
      this.turn = freshTurn({ isEchoSecond: true });
      this.addLog(`${previous.name}의 메아리 차례가 한 번 더 시작됩니다.`, "augment");
      this.events.emit("onTurnStart", { game: this, player: previous, round: this.round });
      this.augments.onTurnStart(previous);
      return;
    }
    let nextIndex = this.currentPlayerIndex;
    let newRound = false;
    do {
      nextIndex = (nextIndex + 1) % this.players.length;
      if (nextIndex === 0) {
        this.events.emit("onRoundEnd", { game: this, round: this.round });
        this.augments.onRoundEnd(this.round);
        this.round += 1;
        newRound = true;
      }
      const candidate = this.players[nextIndex];
      if (!candidate.eliminated && candidate.skipTurns > 0) {
        candidate.skipTurns -= 1;
        this.addLog(`${candidate.name}이(가) 차례를 건너뜁니다.`, "augment");
        continue;
      }
      if (!candidate.eliminated) break;
    } while (nextIndex !== this.currentPlayerIndex);
    this.currentPlayerIndex = nextIndex;
    this.turn = freshTurn();
    this.addLog(`${previous.name}의 차례가 끝났습니다. ${this.currentPlayer.name} 차례입니다.`, "turn");
    if (newRound) {
      this.events.emit("onRoundStart", { game: this, round: this.round });
      this.augments.onRoundStart(this.round);
    }
    this.events.emit("onTurnStart", { game: this, player: this.currentPlayer, round: this.round });
    this.augments.onTurnStart(this.currentPlayer);
    if (newRound && [6, 12].includes(this.round)) this.augments.startDraft(this.round);
  }

  declareVictory(player, reason) {
    if (this.status !== "playing") return false;
    if (this.players.some((candidate) => this.augments.has(candidate, "cancel_all_wins"))) {
      this.addLog(`${player.name}의 승리가 ‘취~소’로 무효화되었습니다.`, "augment");
      player.stats.cancelledVictories = (player.stats.cancelledVictories || 0) + 1;
      return false;
    }
    const naturalOrder = this.buildFinalRanking(player);
    const planner = this.players.find((candidate) => candidate.predictedRanking?.length === this.players.length && candidate.predictedRanking.every((id, index) => id === naturalOrder[index]?.id));
    const actualWinner = planner || player;
    const actualReason = planner ? "‘계획대로’ 최종 순위를 정확히 예측했습니다." : reason;
    const finalOrder = planner ? [planner, ...naturalOrder.filter((candidate) => candidate.id !== planner.id)] : naturalOrder;
    this.rankings = finalOrder.map((candidate, index) => ({ playerId: candidate.id, rank: index + 1, reason: index === 0 ? actualReason : "최종 순위" }));
    this.status = "finished";
    const linked = planner ? [] : this.players.filter((candidate) => candidate.links?.some((link) => link.playerId === actualWinner.id)).map((candidate) => candidate.id);
    this.winnerIds = [actualWinner.id, ...linked];
    this.victoryReason = actualReason;
    this.addLog(`${actualWinner.name} 승리! ${actualReason}`, "victory");
    this.events.emit("checkVictory", { game: this, player: actualWinner, reason: actualReason, won: true });
    return true;
  }

  buildFinalRanking(winner) {
    const slots = Array(this.players.length).fill(null);
    for (const record of this.rankings) {
      const ranked = this.players.find((candidate) => candidate.id === record.playerId);
      if (ranked && record.rank >= 1 && record.rank <= slots.length) slots[record.rank - 1] = ranked;
    }
    const winnerSlot = slots[0]?.id === winner.id ? 0 : slots[0] ? slots.findIndex((entry) => !entry) : 0;
    slots[winnerSlot < 0 ? 0 : winnerSlot] = winner;
    const remaining = this.players.filter((candidate) => !slots.some((entry) => entry?.id === candidate.id)).sort((a, b) => {
      const finished = b.pieces.filter((piece) => piece.node === HOME).length - a.pieces.filter((piece) => piece.node === HOME).length;
      if (finished) return finished;
      return b.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node)).length - a.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node)).length;
    });
    for (let index = 0; index < slots.length; index += 1) if (!slots[index]) slots[index] = remaining.shift();
    return slots.filter(Boolean);
  }

  lockRanking(player, rank, reason) {
    this.rankings = this.rankings.filter((record) => record.playerId !== player.id && record.rank !== rank);
    this.rankings.push({ playerId: player.id, rank, reason });
    player.rankLocked = rank;
  }

  eliminatePlayer(player, reason = "탈락", fixedRank = null) {
    if (!player || player.eliminated) return false;
    const activeCount = this.players.filter((candidate) => !candidate.eliminated).length;
    player.eliminated = true;
    if (!this.rankings.some((record) => record.playerId === player.id)) {
      const used = new Set(this.rankings.map((record) => record.rank));
      let rank = fixedRank || activeCount;
      while (rank > 1 && used.has(rank)) rank -= 1;
      this.lockRanking(player, Math.max(2, rank), reason);
    }
    this.addLog(`${player.name}이(가) ${reason}(으)로 탈락했습니다.`, "victory");
    for (const linked of this.players.filter((candidate) => candidate.links?.some((link) => link.playerId === player.id))) {
      linked.eliminated = true;
      if (!this.rankings.some((record) => record.playerId === linked.id)) this.lockRanking(linked, Math.max(2, activeCount - 1), "공동 탈락");
      this.addLog(`${linked.name}도 거머리 연결로 함께 탈락했습니다.`, "augment");
    }
    const survivors = this.players.filter((candidate) => !candidate.eliminated);
    if (survivors.length === 1) {
      const necromancer = this.augments.instance(survivors[0], "necromancer");
      if (necromancer && (necromancer.usesRemaining ?? 1) > 0) this.addLog(`${survivors[0].name}의 네크로맨서 부활 기회로 최종 승리 판정을 보류합니다.`, "augment");
      else this.declareVictory(survivors[0], "마지막 생존자가 되었습니다.");
    }
    return true;
  }

  getPlayerSummary(player) {
    return {
      waiting: player.pieces.filter((piece) => piece.node === WAIT).length,
      onBoard: player.pieces.filter((piece) => piece.node !== WAIT && piece.node !== HOME).length,
      finished: player.pieces.filter((piece) => piece.node === HOME).length,
    };
  }

  getAugmentState(player, augmentId) {
    const instance = this.augments.instance(player, augmentId);
    const definition = AUGMENTS_BY_ID[augmentId];
    return { definition, instance, availability: this.augments.canUse(player, augmentId) };
  }

  toJSON() {
    return {
      settings: this.settings,
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      round: this.round,
      status: this.status,
      winnerIds: this.winnerIds,
      victoryReason: this.victoryReason,
      rankings: this.rankings,
      echoEnabled: this.echoEnabled,
      resultSequence: this.resultSequence,
      effectSequence: this.effectSequence,
      turn: this.turn,
      logs: this.logs,
      augmentDraft: this.augmentDraft,
      interaction: this.interaction,
      pendingAcquisitions: this.pendingAcquisitions,
      boardState: this.boardState,
    };
  }
}

export { COLOR_NAMES, HOME, WAIT, getMoveOptions };
