import { describe, expect, it } from "vitest";
import { Game, HOME, WAIT } from "../src/core/Game.js";
import { AUGMENT_DEFINITIONS, AUGMENTS_BY_ID, IMPLEMENTED_AUGMENTS, PLANNED_AUGMENTS } from "../src/augments/definitions.js";
import { makeResult } from "../src/core/yut.js";

const fixed = (value) => () => value;

function makeGame(settings = {}, rng = fixed(0.99)) {
  const game = new Game({ playerCount: 2, playerNames: ["가", "나"], useBackDo: true, ...settings }, rng);
  game.augmentDraft.active = false;
  return game;
}

function grant(game, player, id) {
  const definition = AUGMENTS_BY_ID[id];
  const instance = { id, usesRemaining: definition.uses, active: true, acquiredRound: game.round };
  player.augments.push(instance);
  return instance;
}

describe("augment catalog and draft", () => {
  it("keeps all 57 universal augments implemented", () => {
    expect(AUGMENT_DEFINITIONS.filter((definition) => definition.availability === "universal")).toHaveLength(57);
    expect(IMPLEMENTED_AUGMENTS.filter((definition) => definition.availability === "universal")).toHaveLength(57);
    expect(PLANNED_AUGMENTS).toHaveLength(0);
  });

  it("gives each player one unique owned augment in normal mode", () => {
    const game = new Game({ playerCount: 2, playerNames: ["가", "나"], mode: "normal" }, fixed(0.73));
    while (game.augmentDraft.active) game.selectDraftAugment(game.augmentDraft.candidates[0]);
    expect(game.players.map((player) => player.augments.length)).toEqual([1, 1]);
    expect(game.players.every((player) => new Set(player.augments.map((augment) => augment.id)).size === 1)).toBe(true);
  });

  it("gives two fresh selections per player in chaos mode", () => {
    const game = new Game({ playerCount: 2, playerNames: ["가", "나"], mode: "chaos" }, fixed(0.61));
    while (game.augmentDraft.active) game.selectDraftAugment(game.augmentDraft.candidates[0]);
    expect(game.players.map((player) => player.augments.length)).toEqual([2, 2]);
    expect(game.players.every((player) => new Set(player.augments.map((augment) => augment.id)).size === 2)).toBe(true);
  });

  it("can schedule the same universal pool at rounds 6 and 12", () => {
    const game = makeGame();
    expect(game.augments.startDraft(6)).toBe(true);
    expect(game.augmentDraft.round).toBe(6);
    game.augmentDraft.active = false;
    expect(game.augments.startDraft(12)).toBe(true);
    expect(game.augmentDraft.candidates).toHaveLength(3);
  });
});

describe("priority universal augments", () => {
  it("고양이는 보유되지만 게임 상태를 바꾸지 않는다", () => {
    const game = makeGame();
    grant(game, game.currentPlayer, "cat");
    expect(game.augments.has(game.currentPlayer, "cat")).toBe(true);
    expect(game.currentPlayer.pieces.every((piece) => piece.type === "normal")).toBe(true);
  });

  it("낙 방지는 낙 판정을 제거한다", () => {
    const values = [0, 0.9, 0.9, 0.9, 0.9];
    const game = makeGame({ useNak: true }, () => values.shift() ?? 0.9);
    grant(game, game.currentPlayer, "no_nak");
    expect(game.throw().isNak).toBe(false);
  });

  it("개돼지는 도와 개 중 선택한 결과를 만든다", () => {
    const game = makeGame();
    grant(game, game.currentPlayer, "dog_pig");
    expect(game.throw("개")).toMatchObject({ label: "개", steps: 2 });
  });

  it("모 아니면 도는 두 결과 외의 값을 만들지 않는다", () => {
    const game = makeGame({}, fixed(0.2));
    grant(game, game.currentPlayer, "mo_or_do");
    expect(["모", "도"]).toContain(game.throw().label);
  });

  it("손은 눈보다 빠르다는 다음 결과를 정확히 지정한다", () => {
    const game = makeGame();
    const instance = grant(game, game.currentPlayer, "fast_hands");
    game.useAugment("fast_hands", { label: "걸" });
    expect(game.throw()).toMatchObject({ label: "걸", steps: 3 });
    expect(instance.usesRemaining).toBe(0);
  });

  it("슬쩍은 미사용 결과의 선택한 윷가락 하나만 뒤집는다", () => {
    const game = makeGame();
    grant(game, game.currentPlayer, "sneak_flip");
    const result = { ...makeResult("도"), id: "r1" };
    game.turn.results = [result];
    game.useAugment("sneak_flip", { resultId: "r1", stickIndex: 1 });
    expect(game.turn.results[0]).toMatchObject({ label: "개", steps: 2 });
  });

  it("천상의 보호막은 말뭉치의 첫 죽음을 막고 소모된다", () => {
    const game = makeGame();
    const defender = game.currentPlayer;
    defender.pieces[0].node = "R3";
    grant(game, defender, "celestial_shield");
    game.useAugment("celestial_shield", { pieceId: defender.pieces[0].id });
    game.currentPlayerIndex = 1;
    const attacker = game.currentPlayer;
    attacker.pieces[0].node = "R2";
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", ...makeResult("도") }], specialUsed: {} };
    const event = game.move(attacker.pieces[0].id, "r1");
    expect(event.capturedIds).toHaveLength(0);
    expect(defender.pieces[0].node).toBe("R3");
    expect(defender.pieces[0].effects).toHaveLength(0);
  });

  it("프랜드 실드는 말뭉치에서 말 하나만 죽게 한다", () => {
    const game = makeGame();
    const attacker = game.currentPlayer;
    const defender = game.players[1];
    grant(game, defender, "friend_shield");
    attacker.pieces[0].node = "R2";
    defender.pieces[0].node = "R3";
    defender.pieces[1].node = "R3";
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", ...makeResult("도") }], specialUsed: {} };
    game.move(attacker.pieces[0].id, "r1");
    expect(defender.pieces.filter((piece) => piece.node === WAIT)).toHaveLength(3);
    expect(defender.pieces.filter((piece) => piece.node === "R3")).toHaveLength(1);
  });

  it("시간 여행은 선택한 말을 유효한 뒤쪽 칸으로 옮긴다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    player.pieces[0].node = "R4";
    grant(game, player, "time_travel");
    game.useAugment("time_travel", { pieceId: player.pieces[0].id, targetNode: "R2" });
    expect(player.pieces[0].node).toBe("R2");
  });

  it("선봉장이 판 위에 있으면 이동 거리가 1칸 증가한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "transform_vanguard");
    game.useAugment("transform_vanguard", { pieceId: player.pieces[0].id });
    player.pieces[0].node = "R1";
    game.turn.results = [{ id: "r1", ...makeResult("도") }];
    expect(game.getMoveOptionsForPiece(player.pieces[1], game.turn.results[0])[0].target).toBe("R2");
    expect(game.getMoveOptionsForPiece(player.pieces[0], game.turn.results[0])[0].target).toBe("R3");
  });

  it("도깨비는 매 턴 도 또는 백도 특수 이동을 한 번 사용한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "transform_goblin");
    game.useAugment("transform_goblin", { pieceId: player.pieces[0].id });
    const action = game.getSpecialActions().find((candidate) => candidate.type === "goblin");
    game.useSpecialAction(action.id, { steps: 1 });
    expect(player.pieces[0].node).toBe("R1");
    expect(game.getSpecialActions().some((candidate) => candidate.id === action.id)).toBe(false);
  });

  it("좀비 포획은 상대 말을 감염시키고 감염 승리를 검사한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    const opponent = game.players[1];
    grant(game, player, "transform_zombie");
    game.useAugment("transform_zombie", { pieceId: player.pieces[0].id });
    player.pieces[0].node = "R2";
    opponent.pieces[0].node = "R3";
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", ...makeResult("도") }], specialUsed: {} };
    game.move(player.pieces[0].id, "r1");
    expect(opponent.pieces[0]).toMatchObject({ node: WAIT, type: "zombie", infectionOwnerId: player.id });
    [player.pieces[1], player.pieces[2]].forEach((piece) => { piece.infectionOwnerId = player.id; piece.type = "zombie"; });
    game.augments.checkVictory(player);
    expect(game.winnerIds).toEqual([player.id]);
  });

  it("포는 말 하나를 넘은 직선 칸으로 턴당 한 번 이동한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "transform_cannon");
    game.useAugment("transform_cannon", { pieceId: player.pieces[0].id });
    player.pieces[0].node = "R1";
    game.players[1].pieces[0].node = "R3";
    const action = game.getSpecialActions().find((candidate) => candidate.type === "cannon");
    expect(game.augments.cannonTargets(player.pieces[0])).toContain("R4");
    game.useSpecialAction(action.id, { targetNode: "R4" });
    expect(player.pieces[0].node).toBe("R4");
  });

  it("폰은 조작 대상에서 제외되고 투척마다 자동으로 도만큼 전진한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "transform_pawn");
    game.useAugment("transform_pawn", { pieceId: player.pieces[0].id });
    const result = game.throw();
    expect(player.pieces[0].node).toBe("R1");
    expect(result.autoMoves).toHaveLength(1);
    expect(game.getMovablePieces(result.id)).not.toContain(player.pieces[0]);
  });

  it("사목은 네 말의 연속 네 칸 또는 한 말뭉치를 승리로 판정한다", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "four_in_a_row");
    ["R1", "R2", "R3", "R4"].forEach((node, index) => { player.pieces[index].node = node; });
    game.augments.checkVictory(player);
    expect(game.status).toBe("finished");
    expect(game.victoryReason).toContain("사목");
  });
});

describe("stacked effects", () => {
  it("forced throw takes priority over 개돼지 and 모 아니면 도", () => {
    const game = makeGame();
    grant(game, game.currentPlayer, "dog_pig");
    grant(game, game.currentPlayer, "mo_or_do");
    grant(game, game.currentPlayer, "fast_hands");
    game.useAugment("fast_hands", { label: "걸" });
    expect(game.throw()).toMatchObject({ label: "걸", steps: 3 });
  });

  it("shield resolves before friend shield when both protect a stack", () => {
    const game = makeGame();
    const player = game.currentPlayer;
    grant(game, player, "friend_shield");
    grant(game, player, "celestial_shield");
    player.pieces[0].node = "R2";
    player.pieces[1].node = "R2";
    game.useAugment("celestial_shield", { pieceId: player.pieces[0].id });
    expect(game.killStack(player, player.pieces.slice(0, 2), { reason: "테스트" })).toHaveLength(0);
    expect(game.killStack(player, player.pieces.slice(0, 2), { reason: "테스트" })).toHaveLength(1);
  });
});
