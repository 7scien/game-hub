import { describe, expect, it } from "vitest";
import { Game, HOME, WAIT } from "../src/core/Game.js";
import { TR_SHORTCUT, TL_SHORTCUT } from "../src/core/board.js";
import { AUGMENT_DEFINITIONS, AUGMENTS_BY_ID } from "../src/augments/definitions.js";
import { makeResult } from "../src/core/yut.js";

const fixed = (value) => () => value;
function makeGame(count = 2, rng = fixed(0.73)) {
  const game = new Game({ playerCount: count, playerNames: ["가", "나", "다", "라"], useBackDo: true }, rng);
  game.augmentDraft.active = false;
  return game;
}
function grant(game, player, id, acquire = true) {
  const definition = AUGMENTS_BY_ID[id];
  const instance = { id, usesRemaining: definition.uses, active: true, acquiredRound: game.round };
  player.augments.push(instance);
  if (acquire) game.augments.onAcquire(player, definition);
  return instance;
}
function addResult(game, label = "도") {
  const result = { id: `r${++game.resultSequence}`, ...makeResult(label) };
  game.turn.results.push(result);
  game.turn.throwsRemaining = 0;
  return result;
}

describe("exclusive catalog and corrected board", () => {
  it("registers 57 universal, 13 start, 9 middle, and 8 finish augments", () => {
    expect(AUGMENT_DEFINITIONS).toHaveLength(87);
    expect(AUGMENT_DEFINITIONS.filter((item) => item.availability === "universal")).toHaveLength(57);
    expect(AUGMENT_DEFINITIONS.filter((item) => item.availability === "start")).toHaveLength(13);
    expect(AUGMENT_DEFINITIONS.filter((item) => item.availability === "middle")).toHaveLength(9);
    expect(AUGMENT_DEFINITIONS.filter((item) => item.availability === "finish")).toHaveLength(8);
  });

  it("offers exclusive augments only at their designated draft round", () => {
    const game = makeGame(); const player = game.currentPlayer;
    expect(game.augments.candidatesFor(player, 1).every((id) => AUGMENTS_BY_ID[id].availability !== "middle" && AUGMENTS_BY_ID[id].availability !== "finish")).toBe(true);
    expect(game.augments.candidatesFor(player, 6).every((id) => AUGMENTS_BY_ID[id].availability !== "start" && AUGMENTS_BY_ID[id].availability !== "finish")).toBe(true);
    expect(game.augments.candidatesFor(player, 12).every((id) => AUGMENTS_BY_ID[id].availability !== "start" && AUGMENTS_BY_ID[id].availability !== "middle")).toBe(true);
  });

  it("keeps mind-game candidates shared while giving chaos mode a fresh second set", () => {
    const game = new Game({ playerCount: 3, playerNames: ["가", "나", "다"], mode: "chaos" }, fixed(0.31)); const owner = game.currentPlayer;
    game.augmentDraft.active = false; grant(game, owner, "mind_game"); game.round = 6; game.augments.startDraft(6);
    const first = [...game.augmentDraft.sharedCandidatesByPick[1]]; const second = [...game.augmentDraft.sharedCandidatesByPick[2]];
    expect(first).toHaveLength(3); expect(second).toHaveLength(3); expect(second).not.toEqual(first); expect(new Set([...first, ...second])).toHaveLength(6);
  });

  it("uses seven points on each complete diagonal", () => {
    expect(TR_SHORTCUT.slice(0, 7)).toEqual(["TR", "DTR2", "DTR1", "C", "DBL1", "DBL2", "BL"]);
    expect(TL_SHORTCUT).toEqual(["TL", "DTL2", "DTL1", "C", "DS1", "DS2", HOME]);
  });
});

describe("13 start-exclusive augments", () => {
  it("눈치싸움 shares candidates, invalidates the majority, and rewards a surviving owner pick", () => {
    const game = makeGame(3, fixed(0.31)); const owner = game.currentPlayer; grant(game, owner, "mind_game");
    game.round = 6; game.augments.startDraft(6); const [majority, survivor] = game.augmentDraft.candidates;
    while (game.augmentDraft.active) {
      const drafting = game.draftPlayer;
      game.selectDraftAugment(drafting.id === owner.id ? survivor : majority);
      if (game.interaction?.active) game.interaction = null;
    }
    expect(game.players.filter((player) => player.augments.some((augment) => augment.id === majority))).toHaveLength(0);
    expect(owner.pieces.filter((piece) => piece.node === HOME)).toHaveLength(2);
  });

  it("등가교환 keeps three pieces and throws three yut sticks", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "equivalent_exchange");
    expect(player.pieces).toHaveLength(3); expect(player.yutCount).toBe(3); expect(game.throw().sticks).toHaveLength(3);
  });

  it("말이오? 파티 installs six traps and four rewards", () => {
    const game = makeGame(); grant(game, game.currentPlayer, "horse_party");
    expect(game.boardState.markers.filter((marker) => marker.type === "trap")).toHaveLength(6);
    expect(game.boardState.markers.filter((marker) => marker.type === "reward")).toHaveLength(4);
  });

  it("모험가 파티 transforms every piece and disbands after its deadline", () => {
    const game = makeGame(3); const player = game.currentPlayer; grant(game, player, "adventurer_party");
    expect(player.pieces.every((piece) => piece.type !== "normal")).toBe(true); const deadline = player.partyDisbandRound;
    game.round = deadline; game.augments.onRoundStart(deadline); expect(player.eliminated).toBe(true);
  });

  it("스겜 leaves two pieces per player and starts the owner at do and gae", () => {
    const game = makeGame(4); const player = game.currentPlayer; grant(game, player, "quick_game");
    expect(game.players.every((candidate) => candidate.pieces.length === 2)).toBe(true); expect(player.pieces.map((piece) => piece.node)).toEqual(["R1", "R2"]);
  });

  it("시작 변환: 김첨지는 chosen normal piece and wins within six turns", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "start_kim"); const piece = player.pieces[0];
    game.resolveInteraction({ pieceId: piece.id }); expect(piece.type).toBe("kim"); piece.node = HOME; game.augments.onRelocation(player, [piece], { target: HOME, from: "B4" }); expect(game.winnerIds).toContain(player.id);
  });

  it("시작 변환: 중전마마 starts at top-left and wins after twelve throws", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "start_queen"); const queen = player.pieces.find((piece) => piece.type === "queen");
    expect(queen.node).toBe("TL"); for (let i = 0; i < 12; i += 1) game.augments.onAnyThrow(game.players[i % game.players.length], makeResult("도")); expect(game.winnerIds).toContain(player.id);
  });

  it("시작 변환: 괴물 is immortal and raises its capture target when attacked", () => {
    const game = makeGame(); const owner = game.currentPlayer; grant(game, owner, "start_monster"); const monster = owner.pieces[0]; const target = monster.special.target;
    expect(game.killStack(owner, [monster], { reason: "공격", attacker: game.players[1] })).toHaveLength(0); expect(monster.special.target).toBe(target + 1); expect(monster.node).toBe(WAIT);
  });

  it("시작 변환: 1성 creates eight pieces and an eight-star stack wins", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "start_one_star");
    expect(player.pieces).toHaveLength(8); player.pieces.forEach((piece) => { piece.node = "R1"; }); game.augments.checkVictory(player); expect(game.winnerIds).toContain(player.id);
  });

  it("애묘인은 any cat selection as an immediate victory", () => {
    const game = makeGame(); const lover = game.currentPlayer; grant(game, lover, "cat_lover"); grant(game, game.players[1], "cat"); expect(game.winnerIds).toContain(lover.id);
  });

  it("취~소 blocks an 애묘인 special victory through the central victory system", () => {
    const game = makeGame(3); const lover = game.currentPlayer; grant(game, lover, "cat_lover"); grant(game, game.players[2], "cancel_all_wins"); grant(game, game.players[1], "cat");
    expect(game.status).toBe("playing"); expect(game.winnerIds).toEqual([]); expect(lover.stats.cancelledVictories).toBe(1);
  });

  it("웅녀 collects four garlic markers for victory", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "bear_woman"); const piece = player.pieces[0];
    for (const marker of [...game.boardState.markers.filter((item) => item.type === "garlic")]) { piece.node = marker.node; game.augments.onRelocation(player, [piece], { target: marker.node, from: WAIT }); }
    expect(player.resources.garlic).toBe(4); expect(game.winnerIds).toContain(player.id);
  });

  it("이리 오너라 업고 놀자 starts all pieces stacked at do", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "carry_and_play"); expect(player.pieces.every((piece) => piece.node === "R1")).toBe(true); expect(game.getStack(player, player.pieces[0])).toHaveLength(4);
  });

  it("짐덩이와 복덩이 adds a fifth piece and fifth yut stick", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "burden_blessing"); expect(player.pieces).toHaveLength(5); expect(player.yutCount).toBe(5); expect(game.throw().sticks).toHaveLength(5);
  });
});

describe("9 middle-exclusive augments", () => {
  it("777 wins after the same result appears three times in one turn", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "triple_seven"); for (let i = 0; i < 3; i += 1) game.augments.onThrowResult(player, makeResult("걸")); expect(game.winnerIds).toContain(player.id);
  });

  it("나만 친구 없어 wins after every other player captures the owner", () => {
    const game = makeGame(3); const owner = game.currentPlayer; grant(game, owner, "no_friends");
    for (const attacker of game.players.filter((player) => player.id !== owner.id)) game.augments.onPiecesDied(owner, [owner.pieces[0]], { attacker });
    expect(game.winnerIds).toContain(owner.id);
  });

  it("마신 소환 turns normals into zealots and wins at twelve ritual coins", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "summon_demon"); expect(player.pieces.every((piece) => piece.type === "zealot")).toBe(true);
    game.augments.onTurnStart(player); game.augments.onTurnStart(player); game.augments.onTurnStart(player); expect(player.resources.ritualCoins).toBe(12); expect(game.winnerIds).toContain(player.id);
  });

  it("무신정변 counts four enemy deaths after acquisition", () => {
    const game = makeGame(); const attacker = game.currentPlayer; const victim = game.players[1]; grant(game, attacker, "military_coup"); game.augments.onPiecesDied(victim, victim.pieces, { attacker }); expect(game.winnerIds).toContain(attacker.id);
  });

  it("변환: 펠리컨 swallows instead of killing and eliminates the owner on finish", () => {
    const game = makeGame(3); const player = game.currentPlayer; const opponent = game.players[1]; grant(game, player, "transform_pelican", false); game.useAugment("transform_pelican", { pieceId: player.pieces[0].id });
    player.pieces[0].node = "R1"; opponent.pieces[0].node = "R2"; const move = addResult(game, "도"); game.move(player.pieces[0].id, move.id); expect(opponent.pieces[0].swallowedBy).toBe(player.pieces[0].id);
    game.relocateSpecificPiece(player, player.pieces[0], HOME, { reason: "테스트" }); expect(opponent.eliminated).toBe(true);
  });

  it("역모 grants one additional throw against a player with more finishes", () => {
    const game = makeGame(); const player = game.currentPlayer; const opponent = game.players[1]; grant(game, player, "treason"); opponent.pieces[1].node = HOME; player.pieces[0].node = "R1"; opponent.pieces[0].node = "R2";
    const move = addResult(game, "도"); game.move(player.pieces[0].id, move.id); expect(game.turn.throwsRemaining).toBe(2);
  });

  it("잠깐! freezes a leading stack for two rounds", () => {
    const game = makeGame(); const owner = game.currentPlayer; const target = game.players[1]; target.pieces[0].node = "R3"; grant(game, owner, "wait_a_minute"); game.resolveInteraction({ playerId: target.id, pieceId: target.pieces[0].id });
    expect(game.augments.canMovePiece(target.pieces[0])).toBe(false); game.round += 2; expect(game.augments.canMovePiece(target.pieces[0])).toBe(true);
  });

  it("평화 협정 blocks both normal and augment-caused enemy deaths", () => {
    const game = makeGame(); const defender = game.players[1]; defender.pieces[0].node = "R2"; grant(game, defender, "peace_treaty"); expect(game.killStack(defender, [defender.pieces[0]], { reason: "포획", attacker: game.currentPlayer })).toHaveLength(0); expect(defender.pieces[0].node).toBe("R2");
  });

  it("폭탄돌리기 transfers on capture and eliminates its current owner after six rounds", () => {
    const game = makeGame(3); const player = game.currentPlayer; const opponent = game.players[1]; player.pieces[0].node = "R1"; opponent.pieces[0].node = "R2"; grant(game, player, "hot_potato_bomb", false); game.useAugment("hot_potato_bomb", { pieceId: player.pieces[0].id });
    const explodeRound = game.round + 6; const move = addResult(game, "도"); game.move(player.pieces[0].id, move.id); expect(opponent.pieces[0].effects.some((effect) => effect.type === "bomb")).toBe(true); game.round = explodeRound; game.augments.onRoundStart(explodeRound); expect(opponent.eliminated).toBe(true);
  });
});

describe("8 finish-exclusive augments", () => {
  it("계획대로 overrides the natural winner when the full ranking prediction is exact", () => {
    const game = makeGame(3); const planner = game.currentPlayer; const naturalWinner = game.players[1]; grant(game, planner, "as_planned"); const prediction = [naturalWinner.id, planner.id, game.players[2].id]; prediction.forEach((playerId) => game.resolveInteraction({ playerId })); game.declareVictory(naturalWinner, "기본 승리"); expect(game.winnerIds).toEqual([planner.id]);
  });

  it("나에게 윷놀이는 살인이다 gives health and capture damage can eliminate", () => {
    const game = makeGame(3); const killer = game.currentPlayer; const target = game.players[1]; grant(game, killer, "murder_yut"); expect(game.players.every((player) => player.health === 6)).toBe(true);
    for (let i = 0; i < 3; i += 1) game.augments.onCapture(killer, target, [target.pieces[0]], [killer.pieces[0]]); expect(target.eliminated).toBe(true);
  });

  it("네크로맨서 revives an eliminated player and shares that player's victory", () => {
    const game = makeGame(3); const owner = game.currentPlayer; const revived = game.players[2]; game.eliminatePlayer(revived, "테스트"); grant(game, owner, "necromancer", false); game.useAugment("necromancer", { playerId: revived.id }); expect(revived.eliminated).toBe(false); game.declareVictory(revived, "부활 승리"); expect(game.winnerIds).toEqual(expect.arrayContaining([revived.id, owner.id]));
  });

  it("독이 든 성배 grants three throws and eliminates its owner on mo", () => {
    const game = makeGame(3); const player = game.currentPlayer; grant(game, player, "poisoned_chalice", false); game.useAugment("poisoned_chalice"); expect(game.turn.throwsRemaining).toBe(4); player.pendingThrowOverride = "모"; game.throw(); expect(player.eliminated).toBe(true);
  });

  it("동메달도 잘한 거야 immediately locks third place without ending a four-player game", () => {
    const game = makeGame(4); const player = game.currentPlayer; grant(game, player, "bronze_medal"); expect(player.eliminated).toBe(true); expect(game.rankings).toContainEqual(expect.objectContaining({ playerId: player.id, rank: 3 })); expect(game.status).toBe("playing");
  });

  it("라스트 댄스 doubles movement, grants throws, and eliminates at turn end", () => {
    const game = makeGame(3); const player = game.currentPlayer; grant(game, player, "last_dance", false); game.useAugment("last_dance"); expect(game.turn.throwsRemaining).toBe(3); const move = { id: "r", ...makeResult("도") }; expect(game.getMoveOptionsForPiece(player.pieces[0], move)[0].target).toBe("R2"); game.turn.throwsRemaining = 0; game.turn.results = []; game.endTurn(); expect(player.eliminated).toBe(true);
  });

  it("메아리의 형상 gives each player a second consecutive turn", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "echo_form"); game.turn.throwsRemaining = 0; game.endTurn(); expect(game.currentPlayer.id).toBe(player.id); expect(game.turn.isEchoSecond).toBe(true); game.turn.throwsRemaining = 0; game.endTurn(); expect(game.currentPlayer.id).not.toBe(player.id);
  });

  it("변환: 마라토너 wins immediately upon finishing", () => {
    const game = makeGame(); const player = game.currentPlayer; grant(game, player, "transform_marathoner", false); const piece = player.pieces[0]; game.useAugment("transform_marathoner", { pieceId: piece.id }); expect(piece.type).toBe("marathoner"); game.relocateSpecificPiece(player, piece, HOME, { reason: "완주" }); expect(game.winnerIds).toContain(player.id);
  });
});

describe("exclusive state persistence", () => {
  it("restores special pieces, resources, rankings, bomb timers, and echo turns", () => {
    const game = makeGame(4); const player = game.currentPlayer; grant(game, player, "start_one_star"); grant(game, player, "echo_form"); player.resources.ritualCoins = 7; player.pieces[0].effects.push({ type: "bomb", id: "b", ownerId: player.id, explodeRound: 9 }); game.lockRanking(game.players[3], 3, "테스트");
    const restored = Game.restore(JSON.parse(JSON.stringify(game.toJSON())), fixed(0.5)); expect(restored.echoEnabled).toBe(true); expect(restored.currentPlayer.pieces).toHaveLength(8); expect(restored.currentPlayer.resources.ritualCoins).toBe(7); expect(restored.currentPlayer.pieces[0].effects[0].explodeRound).toBe(9); expect(restored.rankings[0].rank).toBe(3);
  });
});
