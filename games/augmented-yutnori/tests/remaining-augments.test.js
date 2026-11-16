import { describe, expect, it } from "vitest";
import { Game, HOME, WAIT } from "../src/core/Game.js";
import { AUGMENTS_BY_ID } from "../src/augments/definitions.js";
import { makeResult } from "../src/core/yut.js";

const fixed = (value) => () => value;
function gameOf(count = 2, rng = fixed(0.99)) {
  const game = new Game({ playerCount: count, playerNames: ["가", "나", "다", "라"], useBackDo: true }, rng);
  game.augmentDraft.active = false;
  return game;
}
function grant(game, player, id, acquire = false) {
  const definition = AUGMENTS_BY_ID[id];
  const instance = { id, usesRemaining: definition.uses, active: true, acquiredRound: game.round };
  player.augments.push(instance);
  if (acquire) game.augments.onAcquire(player, definition);
  return instance;
}
function result(game, label = "도") {
  const value = { id: `r${++game.resultSequence}`, ...makeResult(label) };
  game.turn.results.push(value);
  game.turn.throwsRemaining = 0;
  return value;
}

describe("remaining 42 universal augments", () => {
  it("8톤 트럭은 2개 이상 말뭉치를 직선 끝까지 이동하고 차례를 소모한다", () => {
    const game = gameOf(); const player = game.currentPlayer;
    player.pieces[0].node = player.pieces[1].node = "R1"; grant(game, player, "eight_ton_truck");
    game.useAugment("eight_ton_truck", { pieceId: player.pieces[0].id });
    expect(player.pieces.slice(0, 2).map((piece) => piece.node)).toEqual(["TR", "TR"]); expect(game.turn.throwsRemaining).toBe(0);
  });

  it("3단 합체 필살기!!!는 선택한 3개 말뭉치 외 판 위 말을 죽인다", () => {
    const game = gameOf(); const player = game.currentPlayer; const opponent = game.players[1];
    player.pieces.slice(0, 3).forEach((piece) => { piece.node = "R1"; }); player.pieces[3].node = "R3"; opponent.pieces[0].node = "R2";
    grant(game, player, "triple_fusion"); game.useAugment("triple_fusion", { pieceId: player.pieces[0].id });
    expect(player.pieces.slice(0, 3).every((piece) => piece.node === "R1")).toBe(true); expect(player.pieces[3].node).toBe(WAIT); expect(opponent.pieces[0].node).toBe(WAIT);
  });

  it("개들을 풀어라는 개 결과를 3회 제공한다", () => {
    const game = gameOf(); const instance = grant(game, game.currentPlayer, "release_the_dogs");
    game.useAugment("release_the_dogs"); expect(game.turn.results.at(-1).label).toBe("개"); expect(instance.usesRemaining).toBe(2);
  });

  it("게임 접어라는 방향 상호작용으로 물리 판을 접는다", () => {
    const game = gameOf(); grant(game, game.currentPlayer, "fold_the_board", true);
    expect(game.interaction.type).toBe("foldDirection"); game.resolveInteraction({ direction: "vertical" }); expect(game.boardState.fold).toBe("vertical");
  });

  it("간택은 고양이가 후보에 있으면 모든 플레이어에게 강제한다", () => {
    const game = gameOf(); const royal = game.players[1]; grant(game, royal, "royal_selection");
    game.augmentDraft = { active: true, round: 6, queue: [game.currentPlayer.id], playerIndex: 0, pick: 1, picksPerPlayer: 1, candidates: [], bannedIds: [] };
    game.currentPlayer.deliveryAugmentId = "cat"; game.augments.refreshDraftCandidates(); expect(game.augmentDraft.forcedId).toBe("cat");
  });

  it("고양이 골라는 자신의 고양이 후보를 강제한다", () => {
    const game = gameOf(); grant(game, game.currentPlayer, "pick_the_cat");
    game.augmentDraft = { active: true, round: 6, queue: [game.currentPlayer.id], playerIndex: 0, pick: 1, picksPerPlayer: 1, candidates: [], bannedIds: [] };
    game.currentPlayer.deliveryAugmentId = "cat"; game.augments.refreshDraftCandidates(); expect(game.augmentDraft.forcedId).toBe("cat");
  });

  it("과유불급은 윷 6개 앞면 6개에서 소유자를 탈락시킨다", () => {
    const game = gameOf(3, fixed(0.99)); const player = game.currentPlayer; grant(game, player, "too_much_is_bad");
    const thrown = game.throw(); expect(thrown.sticks).toHaveLength(6); expect(player.eliminated).toBe(true);
  });

  it("거머리는 말 하나를 주고 대상과 승패를 연결한다", () => {
    const game = gameOf(); const owner = game.currentPlayer; const target = game.players[1]; grant(game, owner, "leech", true);
    const piece = owner.pieces[0]; game.resolveInteraction({ pieceId: piece.id, playerId: target.id });
    expect(target.pieces).toContain(piece); expect(owner.links[0].playerId).toBe(target.id);
  });

  it("나 누구게?에서 틀린 색을 고른 플레이어는 한 차례를 쉰다", () => {
    const game = gameOf(); const owner = game.currentPlayer; const voter = game.players[1]; grant(game, owner, "who_am_i", true);
    game.resolveInteraction({ color: voter.color }); expect(voter.skipTurns).toBe(1); expect(game.interaction).toBeNull();
  });

  it("나만 아니면 돼~는 무작위 플레이어의 판 위 말을 죽인다", () => {
    const game = gameOf(2, fixed(0)); const victim = game.players[0]; victim.pieces[0].node = "R2";
    grant(game, game.currentPlayer, "not_me", true); expect(victim.pieces[0].node).toBe(WAIT);
  });

  it("내려는 소유자 2표를 포함해 최다 득표자의 차례를 건너뛴다", () => {
    const game = gameOf(); const owner = game.currentPlayer; const target = game.players[1]; grant(game, owner, "step_down", true);
    game.resolveInteraction({ playerId: target.id }); game.resolveInteraction({ playerId: target.id }); expect(target.skipTurns).toBe(1);
  });

  it("대출은 던지기를 얻고 다음 차례를 담보로 잡는다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "loan");
    game.useAugment("loan"); expect(game.turn.throwsRemaining).toBe(2); expect(player.skipTurns).toBe(1);
  });

  it("도베르만은 개 코인 2개를 소비해 모를 만든다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "doberman"); game.useAugment("doberman"); player.resources.dogCoins = 2;
    expect(game.throw().label).toBe("모"); expect(player.resources.dogCoins).toBe(0);
  });

  it("돌려돌려 돌림판은 획득 시 회전하고 소유자가 한 번 재회전한다", () => {
    const game = gameOf(2, fixed(0)); const player = game.currentPlayer; const instance = grant(game, player, "spin_the_board", true); const first = game.boardState.rotation;
    game.useAugment("spin_the_board"); expect(game.boardState.rotation).not.toBe(first); expect(instance.usesRemaining).toBe(0);
  });

  it("명사수는 다음 라운드 소유자 차례에 지정 칸을 사격한다", () => {
    const game = gameOf(); const player = game.currentPlayer; const victim = game.players[1]; victim.pieces[0].node = "R2"; grant(game, player, "sharpshooter");
    game.useAugment("sharpshooter", { node: "R2" }); game.round += 1; game.augments.onTurnStart(player); expect(victim.pieces[0].node).toBe(WAIT);
  });

  it("명탐정은 증강을 후보에서 무효화하고 대기 말 둘을 완주시킨다", () => {
    const game = gameOf(); const player = game.currentPlayer;
    game.augmentDraft = { active: true, round: 1, bannedIds: [] }; grant(game, player, "detective", true); game.resolveInteraction({ augmentId: "cat" });
    expect(game.augmentDraft.bannedIds).toContain("cat"); expect(player.pieces.filter((piece) => piece.node === HOME)).toHaveLength(2);
  });

  it("무임승차는 포획 대신 올라타고 던지기 기회를 얻는다", () => {
    const game = gameOf(); const player = game.currentPlayer; const opponent = game.players[1]; grant(game, player, "free_ride");
    player.pieces[0].node = opponent.pieces[0].node = "R2"; game.captureAt(player, [player.pieces[0]], "R2", "테스트"); game.resolveInteraction({ action: "ride" });
    expect(player.pieces[0].riding.hostPlayerId).toBe(opponent.id); expect(game.turn.throwsRemaining).toBe(2);
  });

  it("바둑은 두 말 사이 직선의 적을 죽이고 수만큼 던지기를 준다", () => {
    const game = gameOf(); const player = game.currentPlayer; const opponent = game.players[1]; player.pieces[0].node = "R1"; player.pieces[1].node = "R4"; opponent.pieces[0].node = "R2"; opponent.pieces[1].node = "R3"; grant(game, player, "baduk");
    game.useAugment("baduk", { pieceIdA: player.pieces[0].id, pieceIdB: player.pieces[1].id }); expect(opponent.pieces.slice(0, 2).every((piece) => piece.node === WAIT)).toBe(true); expect(game.turn.throwsRemaining).toBe(3);
  });

  it("배달은 선택한 증강을 다음 선택 후보에 확정 배치한다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "delivery", true); game.resolveInteraction({ augmentId: "cat" });
    game.augmentDraft = { active: true, round: 6, queue: [player.id], playerIndex: 0, pick: 1, picksPerPlayer: 1, candidates: [], bannedIds: [] }; game.augments.refreshDraftCandidates(); expect(game.augmentDraft.candidates).toContain("cat");
  });

  it("블러핑은 거짓을 들키면 숨긴 결과를 제거한다", () => {
    const game = gameOf(2, fixed(0.99)); const player = game.currentPlayer; grant(game, player, "bluffing"); game.useAugment("bluffing", { declaredLabel: "도" }); const thrown = game.throw();
    expect(thrown.hidden).toBe(true); game.resolveInteraction({ accuse: true }); expect(game.turn.results).toHaveLength(0);
  });

  it("사신은 라운드 종료마다 가장 가까운 상대 쪽으로 이동해 죽인다", () => {
    const game = gameOf(); const owner = game.currentPlayer; const victim = game.players[1]; victim.pieces[0].node = "DTR1"; grant(game, owner, "reaper", true);
    game.augments.onRoundEnd(); expect(game.boardState.reaper.node).toBe("DTR1"); expect(victim.pieces[0].node).toBe(WAIT);
  });

  it("상부상조는 상대에게 개를 주고 소유자에게 다음 차례 걸을 예약한다", () => {
    const game = gameOf(); const owner = game.players[1]; grant(game, owner, "mutual_aid"); const action = game.getSpecialActions().find((item) => item.type === "mutual");
    game.useSpecialAction(action.id); expect(game.turn.results.at(-1).label).toBe("개"); expect(owner.resources.pendingGeol).toBe(1);
  });

  it("소 뒷걸음질은 백도 포획 누적 2회에서 중앙 승리 판정을 낸다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "backward_cow"); player.stats.backdoCaptures = 2; game.augments.checkVictory(player); expect(game.winnerIds).toContain(player.id);
  });

  it("악보가 완성되었다!는 여섯 결과를 모두 기록하면 승리한다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "complete_score"); ["백도", "도", "개", "걸", "윷", "모"].forEach((label) => { player.stats.throws[label] = 1; }); game.augments.checkVictory(player); expect(game.winnerIds).toContain(player.id);
  });

  it("안개는 소유자의 두 차례가 끝난 뒤 사라진다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "fog"); game.useAugment("fog"); expect(game.boardState.fog.turnsRemaining).toBe(2); game.augments.onTurnEnd(player); game.augments.onTurnEnd(player); expect(game.boardState.fog).toBeNull();
  });

  it("알까기는 조작 게이지가 표적에 맞으면 상대 말 하나를 튕긴다", () => {
    const game = gameOf(); const player = game.currentPlayer; const target = game.players[1]; target.pieces[0].node = "R2"; grant(game, player, "flicking"); game.useAugment("flicking", { playerId: target.id, power: 65, target: 65 }); expect(target.pieces[0].node).toBe(WAIT);
  });

  it("암살자의 영혼은 지나가는 말뭉치를 죽이고 사라진다", () => {
    const game = gameOf(); const trapOwner = game.players[1]; trapOwner.pieces[0].node = "R2"; grant(game, trapOwner, "assassin_spirit");
    game.currentPlayerIndex = 1; game.useAugment("assassin_spirit", { pieceId: trapOwner.pieces[0].id }); game.currentPlayerIndex = 0; const mover = game.currentPlayer; mover.pieces[0].node = "R1"; result(game, "도"); game.move(mover.pieces[0].id, game.turn.results[0].id); expect(mover.pieces[0].node).toBe(WAIT); expect(trapOwner.pieces[0].effects).toHaveLength(0);
  });

  it("어부지리는 내 차례가 아닐 때 다른 말 둘이 죽으면 개를 예약한다", () => {
    const game = gameOf(3); const fisherman = game.players[2]; const victim = game.players[1]; grant(game, fisherman, "fishermans_profit"); game.augments.onPiecesDied(victim, victim.pieces.slice(0, 2)); expect(fisherman.pendingResults.at(-1).label).toBe("개");
  });

  it("언제부터 착각한 거지?는 상대 미사용 증강을 3라운드 비활성화한다", () => {
    const game = gameOf(); const player = game.currentPlayer; const target = game.players[1]; grant(game, player, "illusion"); grant(game, target, "loan"); game.useAugment("illusion", { playerId: target.id, targetAugmentId: "loan" }); expect(game.augments.has(target, "loan")).toBe(false); game.round += 3; expect(game.augments.has(target, "loan")).toBe(true);
  });

  it("외톨이는 다음 투척을 정확히 뒷면 하나인 도로 만든다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "loner"); game.useAugment("loner"); expect(game.throw().label).toBe("도");
  });

  it("윷을 잘 던져봐는 조준 성공 시 대상을 두 차례 쉬게 한다", () => {
    const game = gameOf(); const player = game.currentPlayer; const target = game.players[1]; grant(game, player, "throw_well"); game.useAugment("throw_well", { playerId: target.id, power: 50 }); expect(target.skipTurns).toBe(2);
  });

  it("이도류는 윷 두 쌍을 동시에 던져 두 결과를 만든다", () => {
    const game = gameOf(); grant(game, game.currentPlayer, "dual_wield"); const thrown = game.throw(); expect(thrown.sticks).toHaveLength(2); expect(thrown.bonusResults).toHaveLength(1); expect(game.turn.results).toHaveLength(2);
  });

  it("이의있음!은 증강을 보유하지 않고 현재 후보를 다시 뽑는다", () => {
    const game = gameOf(); const player = game.currentPlayer; game.augmentDraft = { active: true, round: 1, queue: [player.id], playerIndex: 0, pick: 1, picksPerPlayer: 1, candidates: ["objection", "cat", "loan"], bannedIds: [] };
    game.selectDraftAugment("objection"); expect(player.augments.some((augment) => augment.id === "objection")).toBe(false); expect(game.augmentDraft.bannedIds).toContain("objection");
  });

  it("자진모리 장단은 걸 두 번마다 개 결과를 만든다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "jajinmori"); game.augments.onThrowResult(player, makeResult("걸")); game.augments.onThrowResult(player, makeResult("걸")); expect(game.turn.results.at(-1).label).toBe("개");
  });

  it("죄수의 딜레마는 두 플레이어의 비밀 선택과 보상을 처리한다", () => {
    const game = gameOf(3); const owner = game.currentPlayer; const targets = game.players.slice(1); grant(game, owner, "prisoners_dilemma"); game.useAugment("prisoners_dilemma", { playerIds: targets.map((player) => player.id) }); game.resolveInteraction({ action: "cooperate" }); game.resolveInteraction({ action: "cooperate" }); expect(targets.every((player) => player.pendingResults[0].label === "도")).toBe(true);
  });

  it("천마군림보 - 달걸음은 대기 말을 반대 방향에서 출발시킨다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "moonwalk"); const moveResult = result(game, "도"); game.move(player.pieces[0].id, moveResult.id); expect(player.pieces[0].node).toBe("B4");
  });

  it("최면술은 상대 말도 현재 이동 결과로 움직일 수 있게 한다", () => {
    const game = gameOf(); const player = game.currentPlayer; const opponent = game.players[1]; grant(game, player, "hypnosis"); const moveResult = result(game, "도"); expect(game.getMovablePieces(moveResult.id)).toContain(opponent.pieces[0]); game.move(opponent.pieces[0].id, moveResult.id); expect(opponent.pieces[0].node).toBe("R1");
  });

  it("취~소는 기본 및 특수 승리 선언을 중앙에서 무효화한다", () => {
    const game = gameOf(); const blocker = game.players[1]; grant(game, blocker, "cancel_all_wins"); expect(game.declareVictory(game.currentPlayer, "테스트")).toBe(false); expect(game.status).toBe("playing");
  });

  it("크고 빨간 버튼은 두 대각선 위 모든 말을 죽인다", () => {
    const game = gameOf(); game.currentPlayer.pieces[0].node = "DTR1"; game.players[1].pieces[0].node = "DS1"; grant(game, game.currentPlayer, "big_red_button", true); expect(game.players.every((player) => player.pieces[0].node === WAIT)).toBe(true);
  });

  it("화톳불은 지정 말이 죽을 때 설치 칸에서 한 번 부활시킨다", () => {
    const game = gameOf(); const player = game.currentPlayer; player.pieces[0].node = "R3"; grant(game, player, "campfire"); game.useAugment("campfire", { pieceId: player.pieces[0].id }); game.killStack(player, [player.pieces[0]], { reason: "테스트" }); expect(player.pieces[0].node).toBe("R3"); expect(game.boardState.markers.some((marker) => marker.type === "campfire")).toBe(false);
  });

  it("희생은 말 하나를 죽이고 다른 판 위 말에 보호막을 건다", () => {
    const game = gameOf(); const player = game.currentPlayer; player.pieces[0].node = "R1"; player.pieces[1].node = "R2"; grant(game, player, "sacrifice"); game.useAugment("sacrifice", { pieceId: player.pieces[0].id }); expect(player.pieces[0].node).toBe(WAIT); expect(player.pieces[1].effects.some((effect) => effect.type === "shield")).toBe(true);
  });

  it("히히 똥!은 상대 말이 지나가면 해당 칸에서 이동을 멈춘다", () => {
    const game = gameOf(); const player = game.currentPlayer; const owner = game.players[1]; grant(game, owner, "poop"); game.boardState.markers.push({ id: "poop-test", type: "poop", ownerId: owner.id, node: "R2" }); player.pieces[0].node = "R1"; const moveResult = result(game, "개"); game.move(player.pieces[0].id, moveResult.id); expect(player.pieces[0].node).toBe("R2");
  });

  it("42개 신규 증강 상태와 판 변형은 저장 후 복원된다", () => {
    const game = gameOf(); const player = game.currentPlayer; grant(game, player, "fog"); game.useAugment("fog"); grant(game, player, "loan"); game.useAugment("loan"); const restored = Game.restore(JSON.parse(JSON.stringify(game.toJSON())), fixed(0.5)); restored.augmentDraft.active = false;
    expect(restored.boardState.fog.turnsRemaining).toBe(2); expect(restored.augments.instance(restored.currentPlayer, "loan").usesRemaining).toBe(1); expect(restored.currentPlayer.skipTurns).toBe(1);
  });
});
