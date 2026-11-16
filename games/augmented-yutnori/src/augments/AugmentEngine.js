import { AUGMENTS_BY_ID, IMPLEMENTED_AUGMENTS } from "./definitions.js";
import { EDGES, HOME, NODES, WAIT, getPreviousNodes, pathForRoute, physicalPoint } from "../core/board.js";
import { flipResultStick, makeResult } from "../core/yut.js";

const TRANSFORM_TYPES = {
  transform_goblin: "goblin",
  transform_vanguard: "vanguard",
  transform_zombie: "zombie",
  transform_cannon: "cannon",
  transform_pawn: "pawn",
  transform_pelican: "pelican",
};

const FOUR_LINES = [
  [HOME, "R1", "R2", "R3", "R4", "TR"],
  ["TR", "T1", "T2", "T3", "T4", "TL"],
  ["TL", "L1", "L2", "L3", "L4", "BL"],
  ["BL", "B1", "B2", "B3", "B4", HOME],
  ["TR", "DTR2", "DTR1", "C", "DBL1", "DBL2", "BL"],
  ["TL", "DTL2", "DTL1", "C", "DS1", "DS2", HOME],
];
const DIAGONAL_NODES = new Set(["DTR2", "DTR1", "C", "DBL1", "DBL2", "DTL2", "DTL1", "DS1", "DS2"]);
const BOARD_NODES = Object.keys(NODES).filter((node) => node !== HOME);
const THROW_LABELS = ["백도", "도", "개", "걸", "윷", "모"];

const shuffle = (items, rng) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
};

const uniqueStacks = (player, predicate = () => true) => {
  const seen = new Set();
  return player.pieces.filter((piece) => {
    if (!predicate(piece)) return false;
    const key = [WAIT, HOME].includes(piece.node) || piece.type === "pawn" ? piece.id : piece.node;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class AugmentEngine {
  constructor(game) { this.game = game; }

  has(player, augmentId) {
    const augment = player?.augments?.find((candidate) => candidate.id === augmentId);
    return Boolean(augment && augment.active !== false && (!augment.disabledUntilRound || augment.disabledUntilRound < this.game.round));
  }

  instance(player, augmentId) { return player?.augments?.find((augment) => augment.id === augmentId); }

  addResult(player, label, source) {
    const result = { ...makeResult(label), id: `r${++this.game.resultSequence}`, source, extra: false };
    if (player.id === this.game.currentPlayer.id && !this.game.augmentDraft?.active) this.game.turn.results.push(result);
    else player.pendingResults.push(result);
    this.game.addLog(`${player.name}이(가) ${source}(으)로 ‘${label}’ 결과를 얻었습니다.`, "augment");
    return result;
  }

  candidatesFor(player, round) {
    const shared = this.game.augmentDraft?.sharedCandidatesByPick?.[this.game.augmentDraft.pick]
      || this.game.augmentDraft?.sharedCandidates;
    if (shared?.length) return [...shared];
    const owned = new Set(player.augments.map((augment) => augment.id));
    const banned = new Set(this.game.augmentDraft?.bannedIds || []);
    let available = IMPLEMENTED_AUGMENTS.filter((definition) => {
      if (owned.has(definition.id) || banned.has(definition.id)) return false;
      return definition.availability === "universal"
        || definition.availability === "start" && round === 1
        || definition.availability === "middle" && round === 6
        || definition.availability === "finish" && round === 12;
    });
    const chosen = [];
    if (player.deliveryAugmentId && available.some((definition) => definition.id === player.deliveryAugmentId)) {
      chosen.push(player.deliveryAugmentId);
      available = available.filter((definition) => definition.id !== player.deliveryAugmentId);
      player.deliveryAugmentId = null;
    }
    chosen.push(...shuffle(available, this.game.rng).slice(0, 3 - chosen.length).map((definition) => definition.id));
    return chosen;
  }

  startDraft(round) {
    if (![1, 6, 12].includes(round) || this.game.status !== "playing") return false;
    this.game.augmentDraft = {
      active: true,
      round,
      queue: this.game.players.filter((player) => !player.eliminated).map((player) => player.id),
      playerIndex: 0,
      pick: 1,
      picksPerPlayer: this.game.settings.mode === "chaos" ? 2 : 1,
      candidates: [],
      bannedIds: [],
      selections: [],
      pendingAcquisitions: [],
    };
    const mindOwners = this.game.players.filter((player) => player.mindGameRound === round && !player.eliminated);
    if (mindOwners.length) {
      const owned = new Set(this.game.players.flatMap((player) => player.augments.map((augment) => augment.id)));
      const pool = IMPLEMENTED_AUGMENTS.filter((definition) => definition.id !== "objection" && !owned.has(definition.id) && (definition.availability === "universal" || definition.availability === "middle" && round === 6 || definition.availability === "finish" && round === 12));
      const sharedPool = shuffle(pool, this.game.rng).slice(0, this.game.augmentDraft.picksPerPlayer * 3).map((definition) => definition.id);
      this.game.augmentDraft.sharedCandidatesByPick = Object.fromEntries(Array.from(
        { length: this.game.augmentDraft.picksPerPlayer },
        (_, index) => [index + 1, sharedPool.slice(index * 3, index * 3 + 3)],
      ));
      this.game.augmentDraft.sharedCandidates = this.game.augmentDraft.sharedCandidatesByPick[1];
      this.game.augmentDraft.mindOwnerIds = mindOwners.map((player) => player.id);
    }
    this.refreshDraftCandidates();
    this.game.addLog(`${round}라운드 증강 선택이 시작되었습니다.`, "augment");
    return true;
  }

  refreshDraftCandidates() {
    const draft = this.game.augmentDraft;
    if (!draft?.active) return;
    const player = this.game.players.find((candidate) => candidate.id === draft.queue[draft.playerIndex]);
    draft.candidates = this.candidatesFor(player, draft.round);
    const catForced = this.has(player, "pick_the_cat") || this.game.players.some((candidate) => this.has(candidate, "royal_selection"));
    draft.forcedId = catForced && draft.candidates.includes("cat") ? "cat" : null;
    if (draft.candidates.length < 3) throw new Error("선택 가능한 구현 완료 증강이 부족합니다.");
  }

  selectDraftAugment(playerId, augmentId) {
    const draft = this.game.augmentDraft;
    if (!draft?.active || draft.queue[draft.playerIndex] !== playerId) throw new Error("현재 선택 차례가 아닙니다.");
    if (!draft.candidates.includes(augmentId)) throw new Error("현재 후보에 없는 증강입니다.");
    if (draft.forcedId && augmentId !== draft.forcedId) throw new Error("고양이가 간택되었습니다. 고양이를 선택해야 합니다.");
    const player = this.game.players.find((candidate) => candidate.id === playerId);
    const definition = AUGMENTS_BY_ID[augmentId];
    if (!definition?.implemented || this.has(player, augmentId)) throw new Error("선택할 수 없는 증강입니다.");
    if (augmentId === "objection") {
      draft.bannedIds.push("objection");
      this.game.addLog(`${player.name}이(가) ‘이의있음!’으로 후보를 다시 뽑았습니다.`, "augment");
      this.refreshDraftCandidates();
      return definition;
    }
    const pendingMindGame = Boolean(draft.mindOwnerIds?.length);
    player.augments.push({ id: augmentId, usesRemaining: definition.uses, active: true, acquiredRound: this.game.round, pendingDraft: pendingMindGame });
    draft.selections.push({ playerId, augmentId, pick: draft.pick });
    this.game.addLog(`${player.name}이(가) ‘${definition.name}’을 선택했습니다.`, "augment");
    if (!pendingMindGame) this.onAcquire(player, definition);
    if (draft.pick < draft.picksPerPlayer) {
      draft.pick += 1;
      this.refreshDraftCandidates();
    } else if (draft.playerIndex < draft.queue.length - 1) {
      draft.playerIndex += 1;
      draft.pick = 1;
      this.refreshDraftCandidates();
    } else {
      draft.active = false;
      draft.candidates = [];
      if (pendingMindGame) this.finalizeMindGameDraft(draft);
      this.game.addLog("모든 플레이어가 증강 선택을 마쳤습니다.", "augment");
    }
    if (!pendingMindGame) this.checkVictory(player);
    return definition;
  }

  finalizeMindGameDraft(draft) {
    const counts = new Map();
    draft.selections.forEach(({ augmentId }) => counts.set(augmentId, (counts.get(augmentId) || 0) + 1));
    const max = Math.max(...counts.values());
    const invalid = new Set([...counts].filter(([, count]) => count === max).map(([id]) => id));
    for (const selection of draft.selections) {
      const player = this.game.players.find((candidate) => candidate.id === selection.playerId);
      const instance = player.augments.find((augment) => augment.id === selection.augmentId && augment.pendingDraft);
      if (!instance) continue;
      if (invalid.has(selection.augmentId)) {
        player.augments.splice(player.augments.indexOf(instance), 1);
        this.game.addLog(`눈치싸움: ‘${AUGMENTS_BY_ID[selection.augmentId].name}’ 선택이 무효화되었습니다.`, "augment");
      } else {
        delete instance.pendingDraft;
        draft.pendingAcquisitions.push(selection);
      }
    }
    for (const ownerId of draft.mindOwnerIds) {
      const owner = this.game.players.find((player) => player.id === ownerId);
      if (draft.selections.some((selection) => selection.playerId === ownerId && !invalid.has(selection.augmentId))) {
        owner.pieces.filter((piece) => piece.node === WAIT).slice(0, 2).forEach((piece) => { piece.node = HOME; });
        this.game.addLog(`${owner.name}이(가) 눈치싸움에서 살아남아 말 2개를 완주시켰습니다.`, "augment");
      }
      owner.mindGameRound = null;
    }
    this.game.pendingAcquisitions = draft.pendingAcquisitions;
    this.processAcquisitionQueue();
  }

  processAcquisitionQueue() {
    if (this.game.interaction?.active) return;
    while (this.game.pendingAcquisitions?.length && !this.game.interaction?.active) {
      const { playerId, augmentId } = this.game.pendingAcquisitions.shift();
      const player = this.game.players.find((candidate) => candidate.id === playerId);
      this.onAcquire(player, AUGMENTS_BY_ID[augmentId]);
      this.checkVictory(player);
    }
  }

  onAcquire(player, definition) {
    const board = this.game.boardState;
    if (definition.id === "cat") {
      this.game.addLog(`${player.name}의 고양이가 가르랑거립니다.`, "augment");
      for (const lover of this.game.players.filter((candidate) => this.has(candidate, "cat_lover"))) this.game.declareVictory(lover, "누군가 고양이를 선택해 애묘인 조건을 달성했습니다.");
    }
    else if (definition.id === "fold_the_board") this.game.beginInteraction("foldDirection", player.id);
    else if (definition.id === "leech") this.game.beginInteraction("givePiece", player.id);
    else if (definition.id === "who_am_i") this.game.beginInteraction("colorGuess", player.id, { voters: this.otherPlayers(player).map((item) => item.id), index: 0 });
    else if (definition.id === "not_me") {
      const candidates = this.game.players.filter((candidate) => !candidate.eliminated);
      const victim = candidates[Math.floor(this.game.rng() * candidates.length)];
      this.game.killStack(victim, victim.pieces.filter((piece) => piece.node !== HOME), { reason: "나만 아니면 돼~" });
    } else if (definition.id === "step_down") {
      this.game.beginInteraction("vote", player.id, { voters: this.game.players.filter((candidate) => !candidate.eliminated).map((item) => item.id), index: 0, votes: {} });
    } else if (definition.id === "spin_the_board") {
      board.rotation = 1 + Math.floor(this.game.rng() * 3);
      this.game.addLog(`윷판이 ${board.rotation * 90}도 회전했습니다.`, "augment");
    } else if (definition.id === "detective") this.game.beginInteraction("detective", player.id);
    else if (definition.id === "delivery") this.game.beginInteraction("delivery", player.id);
    else if (definition.id === "reaper") board.reaper = { ownerId: player.id, node: "C" };
    else if (definition.id === "big_red_button") {
      for (const owner of this.game.players) {
        const victims = owner.pieces.filter((piece) => DIAGONAL_NODES.has(piece.node));
        if (victims.length) this.game.killStack(owner, victims, { reason: "크고 빨간 버튼", attacker: player });
      }
    } else if (definition.id === "poop") {
      const node = BOARD_NODES[Math.floor(this.game.rng() * BOARD_NODES.length)];
      board.markers.push({ id: `poop-${++this.game.effectSequence}`, type: "poop", ownerId: player.id, node });
      this.game.addLog(`${this.nodeLabel(node)}에 똥이 설치되었습니다.`, "augment");
    } else if (definition.id === "mind_game") {
      player.mindGameRound = this.game.round < 6 ? 6 : 12;
    } else if (definition.id === "equivalent_exchange") {
      if (player.pieces.length > 1) player.pieces.pop();
      player.yutCount = 3;
    } else if (definition.id === "horse_party") {
      const nodes = this.randomNodes(10);
      nodes.slice(0, 6).forEach((node, index) => board.markers.push({ id: `trap-${++this.game.effectSequence}`, type: "trap", effect: index % 2 ? "retreat" : "death", ownerId: player.id, node }));
      nodes.slice(6).forEach((node, index) => board.markers.push({ id: `reward-${++this.game.effectSequence}`, type: "reward", effect: index % 2 ? "shield" : "throw", ownerId: player.id, node }));
    } else if (definition.id === "adventurer_party") {
      const types = ["goblin", "vanguard", "cannon", "pawn", "pelican"];
      player.pieces.forEach((piece, index) => { piece.type = types[index % types.length]; });
      player.partyDisbandRound = this.game.round + 8;
    } else if (definition.id === "quick_game") {
      this.game.players.forEach((candidate) => { candidate.pieces = candidate.pieces.slice(0, 2); });
      if (player.pieces[0]) player.pieces[0].node = "R1";
      if (player.pieces[1]) player.pieces[1].node = "R2";
    } else if (definition.id === "start_kim") {
      this.game.beginInteraction("startTransform", player.id, { type: "kim" });
    } else if (definition.id === "start_queen") {
      const piece = player.pieces.find((candidate) => candidate.type === "normal") || player.pieces[0];
      Object.assign(piece, { type: "queen", node: "TL", route: "outer", special: { lives: 1, survivedThrows: 0 } });
    } else if (definition.id === "start_monster") {
      const piece = player.pieces[0];
      player.pieces = [piece];
      Object.assign(piece, { type: "monster", node: WAIT, route: "outer", special: { captures: 0, target: 12 } });
    } else if (definition.id === "start_one_star") {
      player.pieces = Array.from({ length: 8 }, (_, index) => this.makePiece(player, index, "star", { starLevel: 1 }));
    } else if (definition.id === "bear_woman") {
      this.randomNodes(4).forEach((node) => board.markers.push({ id: `garlic-${++this.game.effectSequence}`, type: "garlic", ownerId: player.id, node }));
    } else if (definition.id === "carry_and_play") {
      player.pieces.forEach((piece) => { piece.node = "R1"; piece.route = "outer"; });
    } else if (definition.id === "burden_blessing") {
      player.pieces.push(this.makePiece(player, player.pieces.length, "normal"));
      player.yutCount = 5;
    } else if (definition.id === "summon_demon") {
      player.pieces.filter((piece) => piece.type === "normal").forEach((piece) => { piece.type = "zealot"; });
      player.resources.ritualCoins = 0;
    } else if (definition.id === "no_friends") {
      player.noFriendsTargets = this.otherPlayers(player).map((candidate) => candidate.id);
    } else if (definition.id === "military_coup") {
      player.stats.capturesSinceCoup = 0;
    } else if (definition.id === "cat_lover") {
      if (this.game.players.some((candidate) => this.has(candidate, "cat"))) this.game.declareVictory(player, "이미 고양이가 선택되어 애묘인 조건을 달성했습니다.");
    } else if (definition.id === "wait_a_minute") {
      this.game.beginInteraction("freezeStack", player.id);
    } else if (definition.id === "as_planned") {
      this.game.beginInteraction("rankingPrediction", player.id, { selected: [] });
    } else if (definition.id === "murder_yut") {
      this.game.players.forEach((candidate) => { candidate.health = 6; });
      player.murderDamage = 2;
    } else if (definition.id === "bronze_medal") {
      const rank = Math.min(3, this.game.players.length);
      this.game.lockRanking(player, rank, "동메달도 잘한 거야");
      this.game.eliminatePlayer(player, `${rank}위 확정`, rank);
    } else if (definition.id === "echo_form") {
      this.game.echoEnabled = true;
    }
  }

  throwSettings(player) { return this.has(player, "no_nak") ? { ...this.game.settings, useNak: false } : this.game.settings; }

  onAnyThrow(player, result) {
    for (const owner of this.game.players) {
      const queen = owner.pieces.find((piece) => piece.type === "queen");
      if (queen && !owner.eliminated) {
        queen.special.survivedThrows = (queen.special.survivedThrows || 0) + 1;
        if (queen.special.survivedThrows >= 12) this.game.declareVictory(owner, "중전마마를 12번의 투척 동안 지켰습니다.");
      }
    }
    if (this.game.turn.poisonedOwnerId === player.id && result.label === "모") this.game.eliminatePlayer(player, "독이 든 성배에서 모가 나옴");
  }

  buildThrow(player, requestedLabel) {
    if (player.pendingThrowOverride) {
      const label = player.pendingThrowOverride;
      player.pendingThrowOverride = null;
      this.game.addLog(`강제 투척 효과가 ${label} 결과를 만들었습니다.`, "augment");
      return makeResult(label);
    }
    const doberman = this.instance(player, "doberman");
    if (this.has(player, "doberman") && doberman?.enabled && player.resources.dogCoins >= 2) {
      player.resources.dogCoins -= 2;
      this.game.addLog("도베르만이 개 코인 2개를 소비해 모를 만들었습니다.", "augment");
      return makeResult("모");
    }
    if (this.has(player, "dog_pig")) {
      if (!["도", "개"].includes(requestedLabel)) throw new Error("개돼지 효과로 도 또는 개를 선택해야 합니다.");
      return makeResult(requestedLabel);
    }
    if (this.has(player, "mo_or_do")) return makeResult(this.game.rng() < 0.5 ? "모" : "도");
    return null;
  }

  onThrowResult(player, result) {
    player.stats.throws[result.label] = (player.stats.throws[result.label] || 0) + 1;
    player.stats.turnThrows[result.label] = (player.stats.turnThrows[result.label] || 0) + 1;
    if (result.label === "개" && this.instance(player, "doberman")?.enabled) player.resources.dogCoins += 1;
    if (result.label === "걸" && this.has(player, "jajinmori")) {
      player.stats.geolCount += 1;
      if (player.stats.geolCount % 2 === 0) this.addResult(player, "개", "자진모리 장단");
    }
    if (this.has(player, "triple_seven") && player.stats.turnThrows[result.label] >= 3) this.game.declareVictory(player, `한 차례에 ${result.label}을 3번 냈습니다.`);
    this.checkVictory(player);
  }

  afterThrowInteraction(player, primary, stored) {
    const bluff = this.instance(player, "bluffing");
    if (!bluff?.pendingDeclaration || !stored.length) return;
    primary.hidden = true;
    this.game.beginInteraction("bluff", player.id, {
      resultId: primary.id,
      actualLabel: primary.label,
      declaredLabel: bluff.pendingDeclaration,
      judges: this.otherPlayers(player).filter((candidate) => !candidate.eliminated).map((candidate) => candidate.id),
      index: 0,
      accusations: [],
    });
    bluff.pendingDeclaration = null;
  }

  modifyMoveSteps(player, steps) {
    const vanguard = player.pieces.some((piece) => piece.type === "vanguard" && ![WAIT, HOME].includes(piece.node));
    let modified = vanguard && steps !== 0 ? (steps > 0 ? steps + 1 : steps - 1) : steps;
    if (this.game.turn.moveMultiplier > 1 && player.id === this.game.currentPlayer.id) modified *= this.game.turn.moveMultiplier;
    return modified;
  }

  modifyPath(player, stack, option) {
    if (option.target === HOME && stack.some((piece) => ["queen", "monster"].includes(piece.type))) {
      const pathNodes = option.pathNodes.filter((node) => node !== HOME);
      const target = pathNodes.at(-1) || stack[0].node;
      return { ...option, target, pathNodes };
    }
    const poop = this.game.boardState.markers.find((marker) => marker.type === "poop" && marker.ownerId !== player.id && option.pathNodes.includes(marker.node));
    if (!poop) return option;
    const index = option.pathNodes.indexOf(poop.node);
    this.game.addLog(`${player.name}의 말이 똥을 밟아 즉시 멈췄습니다.`, "augment");
    return { ...option, target: poop.node, pathNodes: option.pathNodes.slice(0, index + 1) };
  }

  canMovePiece(piece) {
    if (piece?.swallowedBy) return false;
    const freeze = piece?.effects?.find((effect) => effect.type === "freeze");
    return !freeze || freeze.untilRound < this.game.round;
  }

  onRelocation(player, movingPieces, event) {
    const arrived = movingPieces.filter((piece) => piece.node === event.target);
    if (event.target === HOME) {
      for (const piece of arrived) {
        if (piece.type === "kim" && piece.special?.remainingTurns > 0) this.game.declareVictory(player, "김첨지가 6차례 안에 완주했습니다.");
        if (piece.type === "marathoner") this.game.declareVictory(player, "마라토너가 완주했습니다.");
        if (piece.type === "pelican" && piece.special?.swallowed?.length) {
          const swallowedOwners = new Set(piece.special.swallowed.map((entry) => entry.playerId));
          for (const ownerId of swallowedOwners) this.game.eliminatePlayer(this.game.players.find((candidate) => candidate.id === ownerId), "펠리컨에게 삼켜진 채 완주당함");
          this.releaseSwallowed(piece, false);
        }
        if (this.has(player, "adventurer_party")) player.partyDisbandRound += 1;
      }
      const queen = player.pieces.find((piece) => piece.type === "queen");
      if (queen && arrived.some((piece) => piece.id !== queen.id)) queen.special.lives += arrived.filter((piece) => piece.id !== queen.id).length;
    }

    const marker = this.game.boardState.markers.find((candidate) => candidate.node === event.target && ["trap", "reward", "garlic"].includes(candidate.type));
    if (marker?.type === "garlic" && marker.ownerId === player.id) {
      player.resources.garlic += 1;
      this.game.boardState.markers = this.game.boardState.markers.filter((candidate) => candidate.id !== marker.id);
      this.game.addLog(`${player.name}이(가) 마늘을 모았습니다. (${player.resources.garlic}/4)`, "augment");
    } else if (marker?.type === "trap" && marker.ownerId !== player.id) {
      this.game.boardState.markers = this.game.boardState.markers.filter((candidate) => candidate.id !== marker.id);
      if (marker.effect === "death") this.game.killStack(player, arrived, { reason: "말이오? 파티 함정", attacker: this.game.players.find((candidate) => candidate.id === marker.ownerId) });
      else {
        for (const piece of arrived) {
          const target = getPreviousNodes(piece)[1] || WAIT;
          piece.node = target;
          piece.route = "outer";
        }
        this.game.addLog(`${player.name}의 말이 함정으로 2칸 밀려났습니다.`, "augment");
      }
    } else if (marker?.type === "reward") {
      this.game.boardState.markers = this.game.boardState.markers.filter((candidate) => candidate.id !== marker.id);
      if (marker.effect === "throw") this.game.turn.throwsRemaining += 1;
      else {
        const id = `reward-shield-${++this.game.effectSequence}`;
        arrived.forEach((piece) => piece.effects.push({ type: "shield", id }));
      }
      this.game.addLog(`${player.name}이(가) 말이오? 파티 보상을 얻었습니다.`, "augment");
    }
    this.checkVictory(player);
  }

  onCapture(attacker, defender, captured, movingPieces) {
    const monster = movingPieces.find((piece) => piece.type === "monster");
    if (monster) monster.special.captures += captured.length;
    if (this.has(attacker, "treason")) {
      const ownFinished = attacker.pieces.filter((piece) => piece.node === HOME).length;
      const targetFinished = defender.pieces.filter((piece) => piece.node === HOME).length;
      if (targetFinished > ownFinished) this.game.turn.throwsRemaining += 1;
    }
    const bombCarrier = movingPieces.find((piece) => piece.effects.some((effect) => effect.type === "bomb"));
    if (bombCarrier && captured.length) {
      const bomb = bombCarrier.effects.find((effect) => effect.type === "bomb");
      movingPieces.forEach((piece) => { piece.effects = piece.effects.filter((effect) => effect.id !== bomb.id); });
      bomb.ownerId = defender.id;
      captured[0].effects.push(bomb);
      this.game.addLog(`폭탄이 ${defender.name}에게 넘어갔습니다.`, "augment");
    }
    if (this.has(attacker, "murder_yut") && defender.health != null) {
      defender.health = Math.max(0, defender.health - (attacker.murderDamage || 2) * captured.length);
      if (defender.health === 0) this.game.eliminatePlayer(defender, "체력이 0이 됨");
    }
    this.checkVictory(attacker);
  }

  filterDeaths(owner, victims, { reason, attacker }) {
    if ((this.has(owner, "peace_treaty") || attacker && this.has(attacker, "peace_treaty")) && attacker?.id !== owner.id) {
      this.game.addLog("평화 협정이 말의 죽음을 막았습니다.", "augment");
      return [];
    }
    const protectedVictims = new Set();
    for (const piece of victims) {
      if (piece.type === "monster") {
        piece.special.target += 1;
        protectedVictims.add(piece);
        this.game.addLog(`${owner.name}의 괴물은 죽지 않았고 목표가 ${piece.special.target}개로 늘었습니다.`, "augment");
      } else if (piece.type === "queen") {
        if (piece.special.lives > 1) {
          piece.special.lives -= 1;
          protectedVictims.add(piece);
          this.game.addLog(`중전마마가 목숨을 소모해 살아남았습니다. (${piece.special.lives})`, "augment");
        } else {
          this.game.eliminatePlayer(owner, "중전마마 사망");
          protectedVictims.add(piece);
        }
      }
    }
    return victims.filter((piece) => !protectedVictims.has(piece));
  }

  triggerPathHazards(owner, stack, pathNodes) {
    for (const opponent of this.otherPlayers(owner)) {
      const spiritPiece = opponent.pieces.find((piece) => piece.effects.some((effect) => effect.type === "assassin") && pathNodes.includes(piece.node));
      if (!spiritPiece) continue;
      const killed = this.game.killStack(owner, stack, { reason: "암살자의 영혼" });
      const spiritId = spiritPiece.effects.find((effect) => effect.type === "assassin")?.id;
      opponent.pieces.forEach((piece) => { piece.effects = piece.effects.filter((effect) => effect.id !== spiritId); });
      this.game.boardState.markers = this.game.boardState.markers.filter((marker) => marker.spiritPieceId !== spiritPiece.id);
      return { playerId: owner.id, color: owner.color, movingIds: stack.map((piece) => piece.id), from: stack[0]?.node, target: WAIT, pathNodes, capturedIds: [] };
    }
    return null;
  }

  canUse(player, augmentId) {
    const definition = AUGMENTS_BY_ID[augmentId];
    const instance = this.instance(player, augmentId);
    if (!definition?.implemented || !instance) return { ok: false, reason: "보유하지 않은 증강입니다." };
    if (!this.has(player, augmentId)) return { ok: false, reason: `현재 비활성화된 증강입니다${instance.disabledUntilRound ? ` (라운드 ${instance.disabledUntilRound}까지)` : ""}.` };
    if (definition.activation !== "manual") return { ok: false, reason: "자동으로 적용되는 증강입니다." };
    if (typeof instance.usesRemaining === "number" && instance.usesRemaining < 1) return { ok: false, reason: "사용 횟수를 모두 소진했습니다." };
    if (this.game.augmentDraft?.active) return { ok: false, reason: "증강 선택을 먼저 마쳐야 합니다." };
    if (this.game.interaction?.active) return { ok: false, reason: "진행 중인 선택을 먼저 마쳐야 합니다." };
    if (player.id !== this.game.currentPlayer.id) return { ok: false, reason: "자신의 차례에만 사용할 수 있습니다." };
    if (["fast_hands", "sharpshooter"].includes(augmentId) && this.game.turn.throwsRemaining < 1) return { ok: false, reason: "남은 던지기가 없습니다." };
    if (augmentId === "sneak_flip" && !this.game.turn.results.some((result) => result.sticks?.length)) return { ok: false, reason: "뒤집을 미사용 결과가 없습니다." };
    if (augmentId === "time_travel" && !player.pieces.some((piece) => getPreviousNodes(piece).some((node) => node !== WAIT))) return { ok: false, reason: "뒤로 이동할 판 위 말이 없습니다." };
    if (["celestial_shield", "assassin_spirit", "campfire"].includes(augmentId) && !player.pieces.some((piece) => ![WAIT, HOME].includes(piece.node))) return { ok: false, reason: "대상으로 삼을 판 위 말뭉치가 없습니다." };
    if (augmentId === "hot_potato_bomb" && !player.pieces.some((piece) => ![WAIT, HOME].includes(piece.node))) return { ok: false, reason: "폭탄을 설치할 판 위 말이 없습니다." };
    if (augmentId === "sacrifice" && !player.pieces.some((piece) => ![WAIT, HOME].includes(piece.node))) return { ok: false, reason: "희생할 판 위 말이 없습니다." };
    if (augmentId === "eight_ton_truck" && !uniqueStacks(player, (piece) => ![WAIT, HOME].includes(piece.node) && this.game.getStack(player, piece).length >= 2).length) return { ok: false, reason: "판 위에 2개 이상인 말뭉치가 없습니다." };
    if (augmentId === "triple_fusion" && !uniqueStacks(player, (piece) => ![WAIT, HOME].includes(piece.node) && this.game.getStack(player, piece).length >= 3).length) return { ok: false, reason: "판 위에 3개 이상인 말뭉치가 없습니다." };
    if (augmentId === "baduk" && uniqueStacks(player, (piece) => ![WAIT, HOME].includes(piece.node)).length < 2) return { ok: false, reason: "판 위에 말뭉치가 2개 이상 필요합니다." };
    if (augmentId === "illusion" && !this.otherPlayers(player).some((target) => target.augments.some((augment) => (augment.usesRemaining ?? 1) > 0))) return { ok: false, reason: "봉인할 상대 미사용 증강이 없습니다." };
    if (augmentId === "prisoners_dilemma" && this.otherPlayers(player).filter((candidate) => !candidate.eliminated).length < 2) return { ok: false, reason: "선택할 다른 플레이어가 2명 필요합니다." };
    if (augmentId === "necromancer" && !this.game.players.some((candidate) => candidate.eliminated)) return { ok: false, reason: "부활시킬 탈락자가 없습니다." };
    if (augmentId === "transform_marathoner" && !player.pieces.some((piece) => piece.type === "normal" && piece.node === WAIT)) return { ok: false, reason: "대기 중인 일반 말이 없습니다." };
    if (TRANSFORM_TYPES[augmentId] && !player.pieces.some((piece) => piece.type === "normal" && piece.node !== HOME)) return { ok: false, reason: "변환할 일반말이 없습니다." };
    return { ok: true, reason: "" };
  }

  use(playerId, augmentId, payload = {}) {
    const player = this.game.players.find((candidate) => candidate.id === playerId);
    const availability = this.canUse(player, augmentId);
    if (!availability.ok) throw new Error(availability.reason);
    const definition = AUGMENTS_BY_ID[augmentId];
    const instance = this.instance(player, augmentId);
    let event = null;
    if (augmentId === "fast_hands") {
      if (!THROW_LABELS.includes(payload.label)) throw new Error("원하는 윷 결과를 선택해 주세요.");
      player.pendingThrowOverride = payload.label;
    } else if (augmentId === "sneak_flip") {
      const result = this.game.getResult(payload.resultId);
      if (!result) throw new Error("미사용 윷 결과를 선택해 주세요.");
      Object.assign(result, flipResultStick(result, Number(payload.stickIndex), this.game.settings.useBackDo), { id: result.id });
    } else if (augmentId === "celestial_shield") {
      const { stack } = this.requireOwnStack(player, payload.pieceId);
      const shieldId = `shield-${++this.game.effectSequence}`;
      stack.forEach((member) => member.effects.push({ type: "shield", id: shieldId }));
    } else if (augmentId === "time_travel") {
      const piece = player.pieces.find((candidate) => candidate.id === payload.pieceId);
      if (!piece || !getPreviousNodes(piece).filter((node) => node !== WAIT).includes(payload.targetNode)) throw new Error("이동할 말과 뒤쪽 칸을 선택해 주세요.");
      event = this.game.relocateStack(player, piece, payload.targetNode, { reason: "시간 여행", route: piece.route });
    } else if (TRANSFORM_TYPES[augmentId]) {
      const piece = player.pieces.find((candidate) => candidate.id === payload.pieceId);
      if (!piece || piece.type !== "normal" || piece.node === HOME) throw new Error("변환할 일반말을 선택해 주세요.");
      piece.type = TRANSFORM_TYPES[augmentId];
      if (piece.type === "zombie") piece.infectionOwnerId = player.id;
    } else if (augmentId === "eight_ton_truck") {
      const { piece, stack } = this.requireOwnStack(player, payload.pieceId, 2);
      const option = this.truckDestination(piece);
      if (!option) throw new Error("이 말뭉치는 직선으로 더 이동할 수 없습니다.");
      event = this.game.applyRelocation(player, stack, option.target, { from: piece.node, route: option.route, pathNodes: option.pathNodes, reason: "8톤 트럭" });
      this.consumeTurn();
    } else if (augmentId === "triple_fusion") {
      const { stack } = this.requireOwnStack(player, payload.pieceId, 3);
      for (const owner of this.game.players) {
        const victims = owner.pieces.filter((piece) => !stack.includes(piece) && ![WAIT, HOME].includes(piece.node));
        if (victims.length) this.game.killStack(owner, victims, { reason: "3단 합체 필살기!!!", attacker: player });
      }
      this.consumeTurn();
    } else if (augmentId === "release_the_dogs") this.addResult(player, "개", "개들을 풀어라");
    else if (augmentId === "loan") { this.game.turn.throwsRemaining += 1; player.skipTurns += 1; }
    else if (augmentId === "doberman") instance.enabled = true;
    else if (augmentId === "spin_the_board") this.game.boardState.rotation = (this.game.boardState.rotation + 1 + Math.floor(this.game.rng() * 3)) % 4;
    else if (augmentId === "sharpshooter") {
      this.requireNode(payload.node);
      this.game.turn.throwsRemaining -= 1;
      this.game.boardState.markers.push({ id: `shot-${++this.game.effectSequence}`, type: "sharpshooter", ownerId: player.id, node: payload.node, triggerRound: this.game.round + 1 });
    } else if (augmentId === "baduk") this.useBaduk(player, payload);
    else if (augmentId === "bluffing") {
      if (!THROW_LABELS.includes(payload.declaredLabel)) throw new Error("선언할 윷 결과를 선택해 주세요.");
      instance.pendingDeclaration = payload.declaredLabel;
    } else if (augmentId === "fog") this.game.boardState.fog = { ownerId: player.id, turnsRemaining: 2 };
    else if (augmentId === "flicking") { this.useFlicking(player, payload); this.consumeTurn(); }
    else if (augmentId === "assassin_spirit") {
      const { piece, stack } = this.requireOwnStack(player, payload.pieceId);
      const id = `spirit-${++this.game.effectSequence}`;
      stack.forEach((member) => member.effects.push({ type: "assassin", id }));
      this.game.boardState.markers.push({ id, type: "assassin", ownerId: player.id, node: piece.node, spiritPieceId: piece.id });
    } else if (augmentId === "illusion") {
      const target = this.game.players.find((candidate) => candidate.id === payload.playerId && candidate.id !== player.id);
      const targetAugment = target?.augments.find((augment) => augment.id === payload.targetAugmentId && (augment.usesRemaining ?? 1) > 0);
      if (!targetAugment) throw new Error("상대의 미사용 증강을 선택해 주세요.");
      targetAugment.disabledUntilRound = this.game.round + 2;
    } else if (augmentId === "loner") player.pendingThrowOverride = "도";
    else if (augmentId === "throw_well") {
      const target = this.game.players.find((candidate) => candidate.id === payload.playerId && candidate.id !== player.id);
      if (!target) throw new Error("맞힐 상대를 선택해 주세요.");
      const accuracy = Math.max(0, 100 - Math.abs(Number(payload.power ?? 50) - 50) * 2);
      if (accuracy >= 55) target.skipTurns += 2;
      this.game.addLog(accuracy >= 55 ? `${target.name}을 맞혀 두 차례를 건너뛰게 했습니다.` : "윷이 빗나갔습니다.", "augment");
    } else if (augmentId === "prisoners_dilemma") {
      const ids = [...new Set(payload.playerIds || [])];
      if (ids.length !== 2 || ids.includes(player.id) || ids.some((id) => !this.game.players.some((candidate) => candidate.id === id && !candidate.eliminated))) throw new Error("다른 플레이어 두 명을 선택해 주세요.");
      this.game.beginInteraction("prisoners", player.id, { players: ids, index: 0, choices: {} });
    } else if (augmentId === "campfire") {
      const { piece, stack } = this.requireOwnStack(player, payload.pieceId);
      const id = `camp-${++this.game.effectSequence}`;
      stack.forEach((member) => member.effects.push({ type: "campfire", id, node: piece.node, route: piece.route }));
      this.game.boardState.markers.push({ id, type: "campfire", ownerId: player.id, node: piece.node });
    } else if (augmentId === "sacrifice") {
      const piece = player.pieces.find((candidate) => candidate.id === payload.pieceId && ![WAIT, HOME].includes(candidate.node));
      if (!piece) throw new Error("희생할 판 위 말 하나를 선택해 주세요.");
      this.game.killStack(player, [piece], { reason: "희생" });
      const id = `sacrifice-${++this.game.effectSequence}`;
      player.pieces.filter((candidate) => ![WAIT, HOME].includes(candidate.node) && candidate.id !== piece.id).forEach((candidate) => candidate.effects.push({ type: "shield", id }));
    } else if (augmentId === "hot_potato_bomb") {
      const { stack } = this.requireOwnStack(player, payload.pieceId);
      const id = `bomb-${++this.game.effectSequence}`;
      stack.forEach((piece) => piece.effects.push({ type: "bomb", id, ownerId: player.id, explodeRound: this.game.round + 6 }));
    } else if (augmentId === "necromancer") {
      const target = this.game.players.find((candidate) => candidate.id === payload.playerId && candidate.eliminated);
      if (!target) throw new Error("부활시킬 탈락자를 선택해 주세요.");
      target.eliminated = false;
      target.rankLocked = null;
      this.game.rankings = this.game.rankings.filter((record) => record.playerId !== target.id);
      player.links.push({ playerId: target.id, type: "necromancer" });
      this.game.addLog(`${player.name}이(가) ${target.name}을 부활시켰습니다.`, "augment");
    } else if (augmentId === "poisoned_chalice") {
      this.game.turn.throwsRemaining += 3;
      this.game.turn.poisonedOwnerId = player.id;
    } else if (augmentId === "last_dance") {
      this.game.turn.throwsRemaining += 2;
      this.game.turn.moveMultiplier = 2;
      this.game.turn.lastDancePlayerId = player.id;
    } else if (augmentId === "transform_marathoner") {
      const piece = player.pieces.find((candidate) => candidate.id === payload.pieceId && candidate.type === "normal" && candidate.node === WAIT);
      if (!piece) throw new Error("대기 중인 일반 말을 선택해 주세요.");
      piece.type = "marathoner";
    } else throw new Error("아직 사용할 수 없는 증강입니다.");

    if (typeof instance.usesRemaining === "number") instance.usesRemaining -= 1;
    this.game.addLog(`${player.name}이(가) ‘${definition.name}’을 사용했습니다.`, "augment");
    this.checkVictory(player);
    return { definition, event };
  }

  specialActions(player) {
    if (player.id !== this.game.currentPlayer.id || this.game.augmentDraft?.active || this.game.interaction?.active) return [];
    const used = this.game.turn.specialUsed || {};
    const actions = [];
    for (const piece of player.pieces) {
      if (piece.type === "goblin" && piece.node !== HOME && this.canMovePiece(piece) && !used[`goblin:${piece.id}`]) actions.push({ id: `goblin:${piece.id}`, type: "goblin", pieceId: piece.id, label: `도깨비 말 ${piece.number} 걸음` });
      if (piece.type === "cannon" && ![WAIT, HOME].includes(piece.node) && this.canMovePiece(piece) && !used[`cannon:${piece.id}`] && this.cannonTargets(piece).length) actions.push({ id: `cannon:${piece.id}`, type: "cannon", pieceId: piece.id, label: `포 말 ${piece.number} 포격 이동` });
    }
    for (const owner of this.otherPlayers(player).filter((candidate) => this.has(candidate, "mutual_aid"))) {
      if (!used[`mutual:${owner.id}`]) actions.push({ id: `mutual:${owner.id}`, type: "mutual", ownerId: owner.id, label: `${owner.name}의 상부상조로 개 받기` });
    }
    return actions;
  }

  useSpecialAction(playerId, actionId, payload = {}) {
    const player = this.game.players.find((candidate) => candidate.id === playerId);
    const action = this.specialActions(player).find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("이번 차례에 사용할 수 없는 특수 행동입니다.");
    let event = null;
    if (action.type === "mutual") {
      const owner = this.game.players.find((candidate) => candidate.id === action.ownerId);
      this.addResult(player, "개", "상부상조");
      owner.resources.pendingGeol += 1;
    } else {
      const piece = player.pieces.find((candidate) => candidate.id === action.pieceId);
      if (action.type === "goblin") {
        const steps = Number(payload.steps);
        if (![1, -1].includes(steps)) throw new Error("도 또는 백도 방향을 선택해 주세요.");
        event = this.game.relocateBySteps(player, piece, steps, { reason: "도깨비 걸음", singlePiece: true });
      } else {
        if (!this.cannonTargets(piece).includes(payload.targetNode)) throw new Error("포가 이동할 수 있는 칸을 선택해 주세요.");
        event = this.game.relocateSpecificPiece(player, piece, payload.targetNode, { reason: "포격 이동", route: piece.route });
      }
    }
    this.game.turn.specialUsed[actionId] = true;
    this.game.addLog(`${player.name}의 ${action.label}이 발동했습니다.`, "augment");
    this.checkVictory(player);
    return event;
  }

  cannonTargets(piece) {
    if (!piece || !NODES[piece.node]) return [];
    const [x0, y0] = NODES[piece.node];
    const occupied = new Set(this.game.players.flatMap((player) => player.pieces.filter((candidate) => ![WAIT, HOME].includes(candidate.node)).map((candidate) => candidate.node)));
    return Object.entries(NODES).filter(([target, point]) => {
      if (target === piece.node || target === HOME) return false;
      const dx = point[0] - x0;
      const dy = point[1] - y0;
      const total = Math.hypot(dx, dy);
      if (total < 0.01) return false;
      const hurdles = Object.entries(NODES).filter(([middle, middlePoint]) => {
        if (middle === piece.node || middle === target || !occupied.has(middle)) return false;
        const mx = middlePoint[0] - x0;
        const my = middlePoint[1] - y0;
        return Math.abs(dx * my - dy * mx) < 0.002 && dx * mx + dy * my > 0 && Math.hypot(mx, my) < total;
      });
      return hurdles.length === 1;
    }).map(([target]) => target);
  }

  afterThrow(player) {
    const events = [];
    for (const pawn of player.pieces.filter((piece) => piece.type === "pawn" && piece.node !== HOME)) {
      const event = this.game.relocateBySteps(player, pawn, 1, { reason: "폰 자동 전진", singlePiece: true });
      if (event) events.push(event);
    }
    this.checkVictory(player);
    return events;
  }

  onPiecesDied(owner, killed, { attacker = null } = {}) {
    if (!killed.length) return;
    if (attacker && attacker.id !== owner.id && this.has(attacker, "military_coup")) {
      attacker.stats.capturesSinceCoup += killed.length;
      this.checkVictory(attacker);
    }
    for (const piece of killed.filter((candidate) => candidate.type === "pelican")) this.releaseSwallowed(piece, true);
    if (attacker && this.has(owner, "no_friends") && attacker.id !== owner.id) {
      owner.stats.capturedByPlayers = [...new Set([...owner.stats.capturedByPlayers, attacker.id])];
      this.checkVictory(owner);
    }
    for (const fisherman of this.game.players.filter((candidate) => candidate.id !== this.game.currentPlayer.id && candidate.id !== owner.id && this.has(candidate, "fishermans_profit"))) {
      fisherman.resources.deathWatch += killed.length;
      while (fisherman.resources.deathWatch >= 2) {
        fisherman.resources.deathWatch -= 2;
        this.addResult(fisherman, "개", "어부지리");
      }
    }
  }

  onTurnStart(player) {
    player.stats.turnThrows = {};
    for (const result of player.pendingResults.splice(0)) this.game.turn.results.push({ ...result, id: `r${++this.game.resultSequence}` });
    while (player.resources.pendingGeol > 0) {
      player.resources.pendingGeol -= 1;
      this.addResult(player, "걸", "상부상조");
    }
    const zealots = player.pieces.filter((piece) => piece.type === "zealot" && !piece.swallowedBy).length;
    if (zealots && this.has(player, "summon_demon")) {
      player.resources.ritualCoins += zealots;
      this.game.addLog(`${player.name}의 광신도들이 의식 코인 ${zealots}개를 생산했습니다. (${player.resources.ritualCoins}/12)`, "augment");
      this.checkVictory(player);
    }
    const shots = this.game.boardState.markers.filter((marker) => marker.type === "sharpshooter" && marker.ownerId === player.id && marker.triggerRound <= this.game.round);
    for (const shot of shots) {
      for (const owner of this.game.players) {
        const victims = owner.pieces.filter((piece) => piece.node === shot.node);
        if (victims.length) this.game.killStack(owner, victims, { reason: "명사수", attacker: player });
      }
      this.game.addLog(`${this.nodeLabel(shot.node)}에 명사수의 사격이 떨어졌습니다.`, "augment");
    }
    this.game.boardState.markers = this.game.boardState.markers.filter((marker) => !shots.includes(marker));
  }

  onTurnEnd(player) {
    const fog = this.game.boardState.fog;
    if (fog?.ownerId === player.id) {
      fog.turnsRemaining -= 1;
      if (fog.turnsRemaining <= 0) this.game.boardState.fog = null;
    }
    const kim = player.pieces.find((piece) => piece.type === "kim" && piece.node !== HOME);
    if (kim?.special?.remainingTurns > 0) kim.special.remainingTurns -= 1;
    if (this.game.turn.lastDancePlayerId === player.id) this.game.eliminatePlayer(player, "라스트 댄스 종료");
  }

  onRoundStart(round) {
    for (const player of this.game.players.filter((candidate) => !candidate.eliminated)) {
      if (player.partyDisbandRound && round >= player.partyDisbandRound) this.game.eliminatePlayer(player, "모험가 파티 해산");
    }
    const bombs = this.game.players.flatMap((player) => player.pieces.flatMap((piece) => piece.effects.filter((effect) => effect.type === "bomb" && effect.explodeRound <= round).map((effect) => ({ effect, piece }))));
    for (const { effect } of bombs) {
      const owner = this.game.players.find((player) => player.id === effect.ownerId);
      if (owner && !owner.eliminated) this.game.eliminatePlayer(owner, "폭탄돌리기 폭발");
      this.game.players.forEach((player) => player.pieces.forEach((piece) => { piece.effects = piece.effects.filter((candidate) => candidate.id !== effect.id); }));
    }
  }

  onRoundEnd() {
    const reaper = this.game.boardState.reaper;
    if (!reaper) return;
    const targets = this.game.players.flatMap((player) => player.id === reaper.ownerId ? [] : player.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node)).map((piece) => ({ player, piece })));
    if (!targets.length) return;
    const route = this.shortestStep(reaper.node, targets.map(({ piece }) => piece.node));
    if (route) reaper.node = route;
    const struck = targets.filter(({ piece }) => piece.node === reaper.node);
    const seen = new Set();
    for (const { player, piece } of struck) {
      const key = `${player.id}:${piece.node}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const attacker = this.game.players.find((candidate) => candidate.id === reaper.ownerId);
      this.game.killStack(player, this.game.getStack(player, piece), { reason: "사신", attacker });
    }
  }

  resolveInteraction(choice = {}) {
    const interaction = this.game.interaction;
    const owner = this.game.players.find((player) => player.id === interaction.ownerId);
    const finish = () => {
      this.game.interaction = null;
      this.processAcquisitionQueue();
      return { complete: true };
    };
    if (interaction.type === "startTransform") {
      const piece = owner.pieces.find((candidate) => candidate.id === choice.pieceId && candidate.type === "normal");
      if (!piece) throw new Error("변환할 일반 말을 선택해 주세요.");
      piece.type = interaction.data.type;
      if (piece.type === "kim") piece.special = { remainingTurns: 6 };
      return finish();
    }
    if (interaction.type === "freezeStack") {
      const target = this.game.players.find((player) => player.id === choice.playerId && player.id !== owner.id);
      const piece = target?.pieces.find((candidate) => candidate.id === choice.pieceId && candidate.node !== HOME);
      const leading = target ? this.leadingStacks(target) : [];
      if (!piece || !leading.some((candidate) => candidate.node === piece.node)) throw new Error("상대의 가장 앞선 말뭉치를 선택해 주세요.");
      const id = `freeze-${++this.game.effectSequence}`;
      this.game.getStack(target, piece).forEach((member) => member.effects.push({ type: "freeze", id, untilRound: this.game.round + 1 }));
      return finish();
    }
    if (interaction.type === "rankingPrediction") {
      if (!this.game.players.some((player) => player.id === choice.playerId) || interaction.data.selected.includes(choice.playerId)) throw new Error("아직 선택하지 않은 플레이어를 고르세요.");
      interaction.data.selected.push(choice.playerId);
      if (interaction.data.selected.length < this.game.players.length) return { complete: false };
      owner.predictedRanking = [...interaction.data.selected];
      return finish();
    }
    if (interaction.type === "foldDirection") {
      if (!["vertical", "horizontal"].includes(choice.direction)) throw new Error("접을 방향을 선택해 주세요.");
      this.game.boardState.fold = choice.direction;
      return finish();
    }
    if (interaction.type === "givePiece") {
      const target = this.game.players.find((player) => player.id === choice.playerId && player.id !== owner.id);
      const piece = owner.pieces.find((candidate) => candidate.id === choice.pieceId);
      if (!target || !piece) throw new Error("줄 말과 플레이어를 선택해 주세요.");
      owner.pieces.splice(owner.pieces.indexOf(piece), 1);
      piece.riding = null;
      target.pieces.push(piece);
      owner.links.push({ playerId: target.id, type: "leech" });
      this.game.addLog(`${owner.name}이(가) ${target.name}에게 말을 주고 운명을 연결했습니다.`, "augment");
      return finish();
    }
    if (interaction.type === "colorGuess") {
      const voter = this.game.players.find((player) => player.id === interaction.data.voters[interaction.data.index]);
      if (!this.game.players.some((player) => player.color === choice.color)) throw new Error("색을 선택해 주세요.");
      if (choice.color !== owner.color) voter.skipTurns += 1;
      interaction.answers.push({ playerId: voter.id, color: choice.color, correct: choice.color === owner.color });
      interaction.data.index += 1;
      return interaction.data.index >= interaction.data.voters.length ? finish() : { complete: false };
    }
    if (interaction.type === "vote") {
      const voterId = interaction.data.voters[interaction.data.index];
      if (!this.game.players.some((player) => player.id === choice.playerId && !player.eliminated)) throw new Error("투표 대상을 선택해 주세요.");
      interaction.data.votes[choice.playerId] = (interaction.data.votes[choice.playerId] || 0) + (voterId === owner.id ? 2 : 1);
      interaction.data.index += 1;
      if (interaction.data.index < interaction.data.voters.length) return { complete: false };
      const max = Math.max(...Object.values(interaction.data.votes));
      const tied = Object.entries(interaction.data.votes).filter(([, score]) => score === max).map(([id]) => id);
      const loser = this.game.players.find((player) => player.id === tied[Math.floor(this.game.rng() * tied.length)]);
      loser.skipTurns += 1;
      this.game.addLog(`${loser.name}이(가) 투표로 다음 차례를 건너뜁니다.`, "augment");
      return finish();
    }
    if (interaction.type === "detective") {
      if (!AUGMENTS_BY_ID[choice.augmentId] || choice.augmentId === "detective") throw new Error("무효화할 증강을 선택해 주세요.");
      this.game.augmentDraft.bannedIds.push(choice.augmentId);
      owner.pieces.filter((piece) => piece.node === WAIT).slice(0, 2).forEach((piece) => { piece.node = HOME; });
      if (this.game.augmentDraft.active && this.game.augmentDraft.candidates?.includes(choice.augmentId)) this.refreshDraftCandidates();
      return finish();
    }
    if (interaction.type === "delivery") {
      if (!AUGMENTS_BY_ID[choice.augmentId] || this.has(owner, choice.augmentId)) throw new Error("다음에 받을 증강을 선택해 주세요.");
      owner.deliveryAugmentId = choice.augmentId;
      return finish();
    }
    if (interaction.type === "freeRide") {
      const victimOwner = this.game.players.find((player) => player.id === interaction.data.victimPlayerId);
      const moving = owner.pieces.filter((piece) => interaction.data.movingPieceIds.includes(piece.id));
      const victims = victimOwner.pieces.filter((piece) => interaction.data.victimPieceIds.includes(piece.id));
      if (choice.action === "ride") {
        moving.forEach((piece) => { piece.riding = { hostPlayerId: victimOwner.id }; });
        this.game.turn.throwsRemaining += 1;
        this.game.addLog(`${owner.name}이(가) ${victimOwner.name}의 말에 무임승차했습니다.`, "augment");
      } else if (choice.action === "capture") {
        const killed = this.game.killStack(victimOwner, victims, { reason: "포획" });
        if (killed.length) this.game.turn.throwsRemaining += 1;
      }
      else throw new Error("포획 또는 무임승차를 선택해 주세요.");
      return finish();
    }
    if (interaction.type === "bluff") {
      const judgeId = interaction.data.judges[interaction.data.index];
      interaction.data.accusations.push({ playerId: judgeId, accuse: Boolean(choice.accuse) });
      interaction.data.index += 1;
      if (interaction.data.index < interaction.data.judges.length) return { complete: false };
      const truthful = interaction.data.actualLabel === interaction.data.declaredLabel;
      const result = this.game.getResult(interaction.data.resultId);
      if (result) result.hidden = false;
      if (!truthful && interaction.data.accusations.some((answer) => answer.accuse)) this.game.turn.results = this.game.turn.results.filter((candidate) => candidate.id !== interaction.data.resultId);
      if (truthful) for (const answer of interaction.data.accusations.filter((item) => item.accuse)) this.game.players.find((player) => player.id === answer.playerId).skipTurns += 1;
      return finish();
    }
    if (interaction.type === "prisoners") {
      const playerId = interaction.data.players[interaction.data.index];
      if (!["cooperate", "betray"].includes(choice.action)) throw new Error("협력 또는 배신을 선택해 주세요.");
      interaction.data.choices[playerId] = choice.action;
      interaction.data.index += 1;
      if (interaction.data.index < 2) return { complete: false };
      const [aId, bId] = interaction.data.players;
      const a = this.game.players.find((player) => player.id === aId);
      const b = this.game.players.find((player) => player.id === bId);
      const ac = interaction.data.choices[aId];
      const bc = interaction.data.choices[bId];
      if (ac === "cooperate" && bc === "cooperate") { a.pendingResults.push(makeResult("도")); b.pendingResults.push(makeResult("도")); }
      else if (ac === "betray" && bc === "betray") { a.skipTurns += 1; b.skipTurns += 1; }
      else {
        const betrayer = ac === "betray" ? a : b;
        const cooperator = betrayer === a ? b : a;
        betrayer.pendingResults.push(makeResult("모"));
        cooperator.skipTurns += 1;
      }
      return finish();
    }
    throw new Error("알 수 없는 상호작용입니다.");
  }

  checkVictory(player) {
    if (this.game.status !== "playing" || player.eliminated) return false;
    if (player.pieces.length && player.pieces.every((piece) => piece.node === HOME)) return this.game.declareVictory(player, "모든 말이 완주했습니다.");
    if (this.has(player, "four_in_a_row") && this.hasFourInARow(player)) return this.game.declareVictory(player, "사목 조건을 달성했습니다.");
    if (this.has(player, "backward_cow") && player.stats.backdoCaptures >= 2) return this.game.declareVictory(player, "백도로 두 번 포획했습니다.");
    if (this.has(player, "complete_score") && THROW_LABELS.every((label) => player.stats.throws[label])) return this.game.declareVictory(player, "악보의 여섯 결과를 모두 완성했습니다.");
    if (this.has(player, "no_friends")) {
      const required = player.noFriendsTargets || this.otherPlayers(player).map((candidate) => candidate.id);
      if (required.length && required.every((id) => player.stats.capturedByPlayers.includes(id))) return this.game.declareVictory(player, "다른 모든 플레이어에게 한 번 이상 잡혔습니다.");
    }
    if (this.has(player, "summon_demon") && player.resources.ritualCoins >= 12) return this.game.declareVictory(player, "의식 코인 12개로 마신을 소환했습니다.");
    if (this.has(player, "military_coup") && player.stats.capturesSinceCoup >= 4) return this.game.declareVictory(player, "무신정변 이후 적 말 4개를 죽였습니다.");
    const monster = player.pieces.find((piece) => piece.type === "monster");
    if (monster && monster.special.captures >= monster.special.target) return this.game.declareVictory(player, `괴물이 목표 ${monster.special.target}개를 잡았습니다.`);
    if (this.has(player, "start_one_star")) {
      const starStacks = uniqueStacks(player, (piece) => piece.type === "star" && ![WAIT, HOME].includes(piece.node));
      if (starStacks.some((piece) => this.game.getStack(player, piece).reduce((sum, member) => sum + (member.special?.starLevel || 0), 0) >= 8)) return this.game.declareVictory(player, "8성 말뭉치를 만들었습니다.");
    }
    if (this.has(player, "bear_woman") && player.resources.garlic >= 4) return this.game.declareVictory(player, "마늘 4개를 모두 모았습니다.");
    if (this.has(player, "transform_zombie")) {
      const allPieces = this.game.players.flatMap((candidate) => candidate.pieces);
      const infected = allPieces.filter((piece) => piece.infectionOwnerId === player.id).length;
      if (infected >= Math.ceil(allPieces.length / 2)) return this.game.declareVictory(player, "전체 말의 절반 이상을 좀비로 감염시켰습니다.");
    }
    return false;
  }

  hasFourInARow(player) {
    const boardPieces = player.pieces.filter((piece) => ![WAIT, HOME].includes(piece.node));
    const counts = new Map();
    boardPieces.forEach((piece) => counts.set(piece.node, (counts.get(piece.node) || 0) + 1));
    if ([...counts.values()].some((count) => count >= 4)) return true;
    const occupied = new Set(boardPieces.map((piece) => piece.node));
    return FOUR_LINES.some((line) => line.some((_, start) => line.slice(start, start + 4).length === 4 && line.slice(start, start + 4).every((node) => occupied.has(node))));
  }

  requireOwnStack(player, pieceId, minimum = 1) {
    const piece = player.pieces.find((candidate) => candidate.id === pieceId && ![WAIT, HOME].includes(candidate.node));
    if (!piece) throw new Error("판 위의 내 말뭉치를 선택해 주세요.");
    const stack = this.game.getStack(player, piece);
    if (stack.length < minimum) throw new Error(`말 ${minimum}개 이상인 말뭉치를 선택해 주세요.`);
    return { piece, stack };
  }

  requireNode(node) { if (!BOARD_NODES.includes(node)) throw new Error("윷판의 칸을 선택해 주세요."); }

  consumeTurn() { this.game.turn.throwsRemaining = 0; this.game.turn.results = []; }

  truckDestination(piece) {
    const path = pathForRoute(piece.route);
    const index = path.indexOf(piece.node);
    if (index < 0) return null;
    const [x0, y0] = NODES[piece.node];
    let previousDirection = null;
    const pathNodes = [];
    const occupied = new Set(this.game.players.flatMap((player) => player.pieces.filter((candidate) => ![WAIT, HOME].includes(candidate.node) && candidate.node !== piece.node).map((candidate) => candidate.node)));
    for (const node of path.slice(index + 1)) {
      if (node === HOME || occupied.has(node)) break;
      const [x, y] = NODES[node];
      const direction = `${Math.sign(x - x0)},${Math.sign(y - y0)}`;
      if (previousDirection && direction !== previousDirection) break;
      previousDirection = direction;
      pathNodes.push(node);
    }
    return pathNodes.length ? { target: pathNodes.at(-1), pathNodes, route: piece.route } : null;
  }

  useBaduk(player, payload) {
    const a = player.pieces.find((piece) => piece.id === payload.pieceIdA && ![WAIT, HOME].includes(piece.node));
    const b = player.pieces.find((piece) => piece.id === payload.pieceIdB && ![WAIT, HOME].includes(piece.node));
    if (!a || !b || a.node === b.node) throw new Error("서로 다른 내 말뭉치 두 개를 선택해 주세요.");
    const p1 = physicalPoint(a.node, this.game.boardState);
    const p2 = physicalPoint(b.node, this.game.boardState);
    const total = distance(p1, p2);
    const killed = [];
    for (const opponent of this.otherPlayers(player)) {
      const victims = opponent.pieces.filter((piece) => {
        if ([WAIT, HOME].includes(piece.node)) return false;
        const p = physicalPoint(piece.node, this.game.boardState);
        return Math.abs(distance(p1, p) + distance(p, p2) - total) < 0.01;
      });
      killed.push(...this.game.killStack(opponent, victims, { reason: "바둑", attacker: player }));
    }
    this.game.turn.throwsRemaining += killed.length;
  }

  useFlicking(player, payload) {
    const target = this.game.players.find((candidate) => candidate.id === payload.playerId && candidate.id !== player.id);
    if (!target) throw new Error("알까기 대상을 선택해 주세요.");
    const accuracy = 100 - Math.abs(Number(payload.power ?? 0) - Number(payload.target ?? 65));
    if (accuracy >= 85) {
      const victim = target.pieces.find((piece) => ![WAIT, HOME].includes(piece.node)) || target.pieces.find((piece) => piece.node === WAIT);
      this.game.killStack(target, [victim], { reason: "알까기" });
    } else this.game.addLog("알이 빗나갔습니다.", "augment");
  }

  makePiece(player, index, type = "normal", special = null) {
    return {
      id: `${player.id}-m${index + 1}`,
      number: index + 1,
      node: WAIT,
      route: "outer",
      type,
      effects: [],
      ...(special ? { special } : {}),
    };
  }

  randomNodes(count) {
    return shuffle(BOARD_NODES.filter((node) => node !== "C"), this.game.rng).slice(0, count);
  }

  releaseSwallowed(pelican, log = true) {
    const swallowed = this.game.players.flatMap((player) => player.pieces.filter((piece) => piece.swallowedBy === pelican.id));
    swallowed.forEach((piece) => { piece.swallowedBy = null; piece.node = WAIT; piece.route = "outer"; });
    if (pelican.special) pelican.special.swallowed = [];
    if (log && swallowed.length) this.game.addLog(`펠리컨이 죽어 삼킨 말 ${swallowed.length}개가 풀려났습니다.`, "augment");
  }

  pieceProgress(piece) {
    if (piece.node === HOME) return 999;
    if (piece.node === WAIT) return -1;
    if (piece.route === "outer") return Object.keys(NODES).includes(piece.node) ? ["R1", "R2", "R3", "R4", "TR", "T1", "T2", "T3", "T4", "TL", "L1", "L2", "L3", "L4", "BL", "B1", "B2", "B3", "B4"].indexOf(piece.node) : 0;
    const path = pathForRoute(piece.route);
    return 5 + Math.max(0, path.indexOf(piece.node));
  }

  leadingStacks(player) {
    const stacks = uniqueStacks(player, (piece) => piece.node !== HOME);
    if (!stacks.length) return [];
    const max = Math.max(...stacks.map((piece) => this.pieceProgress(piece)));
    return stacks.filter((piece) => this.pieceProgress(piece) === max);
  }

  shortestStep(start, targetNodes) {
    const adjacency = new Map();
    for (const [a, b] of EDGES) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
    const queue = [{ node: start, first: null }];
    const seen = new Set([start]);
    while (queue.length) {
      const current = queue.shift();
      if (current.node !== start && targetNodes.includes(current.node)) return current.first;
      for (const next of adjacency.get(current.node) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push({ node: next, first: current.first || next });
      }
    }
    return null;
  }

  otherPlayers(player) { return this.game.players.filter((candidate) => candidate.id !== player.id); }
  nodeLabel(node) { return node === "C" ? "중앙" : `칸 ${node}`; }
}
