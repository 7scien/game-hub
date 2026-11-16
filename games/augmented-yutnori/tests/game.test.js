import { describe, expect, it } from "vitest";
import { Game, HOME, WAIT, getMoveOptions } from "../src/core/Game.js";
import { throwYut } from "../src/core/yut.js";

const fixed = (value) => () => value;

describe("board routes", () => {
  it("does not take a shortcut when merely passing its entrance", () => {
    expect(getMoveOptions({ node: WAIT, route: "outer" }, 6)).toEqual([
      expect.objectContaining({ target: "T1", route: "outer" }),
    ]);
  });

  it("offers both routes after stopping exactly on an entrance", () => {
    const options = getMoveOptions({ node: "TR", route: "outer" }, 2);
    expect(options.map((option) => option.target)).toEqual(["DTR1", "T2"]);
    expect(options.map((option) => option.route)).toEqual(["diagTR", "outer"]);
  });

  it("sends a first-node piece back to waiting on back-do", () => {
    expect(getMoveOptions({ node: "R1", route: "outer" }, -1)[0].target).toBe(WAIT);
  });
});

describe("yut throw", () => {
  it("awards an extra throw for yut", () => {
    expect(throwYut(fixed(0.1), { useBackDo: false, useNak: false }))
      .toMatchObject({ label: "윷", steps: 4, extra: true });
  });

  it("recognizes the marked stick as back-do", () => {
    const values = [0.1, 0.9, 0.9, 0.9];
    expect(throwYut(() => values.shift(), { useBackDo: true, useNak: false }))
      .toMatchObject({ label: "백도", steps: -1 });
  });
});

describe("game rules", () => {
  const makeGame = () => {
    const game = new Game({ playerCount: 2, playerNames: ["가", "나"], useBackDo: true }, fixed(0.99));
    game.augmentDraft.active = false;
    return game;
  };

  it("moves a friendly stack and captures an opponent stack", () => {
    const game = makeGame();
    game.currentPlayer.pieces[0].node = "R2";
    game.currentPlayer.pieces[1].node = "R2";
    game.players[1].pieces[0].node = "R3";
    game.players[1].pieces[1].node = "R3";
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", label: "도", steps: 1 }] };
    const event = game.move(game.currentPlayer.pieces[0].id, "r1");
    expect(event.movingIds).toHaveLength(2);
    expect(event.capturedIds).toHaveLength(2);
    expect(game.currentPlayer.pieces.slice(0, 2).every((piece) => piece.node === "R3")).toBe(true);
    expect(game.players[1].pieces.slice(0, 2).every((piece) => piece.node === WAIT)).toBe(true);
    expect(game.turn.throwsRemaining).toBe(1);
  });

  it("keeps results until the player chooses their order", () => {
    const game = makeGame();
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", label: "도", steps: 1 }, { id: "r2", label: "걸", steps: 3 }] };
    game.move(game.currentPlayer.pieces[0].id, "r2");
    expect(game.turn.results.map((result) => result.id)).toEqual(["r1"]);
    expect(game.currentPlayer.pieces[0].node).toBe("R3");
  });

  it("wins as soon as the fourth piece reaches home", () => {
    const game = makeGame();
    game.currentPlayer.pieces.slice(0, 3).forEach((piece) => { piece.node = HOME; });
    game.currentPlayer.pieces[3].node = "B4";
    game.turn = { throwsRemaining: 0, results: [{ id: "r1", label: "도", steps: 1 }] };
    game.move(game.currentPlayer.pieces[3].id, "r1");
    expect(game.status).toBe("finished");
    expect(game.winnerIds).toEqual([game.currentPlayer.id]);
  });

  it("advances the round after every active player finishes", () => {
    const game = makeGame();
    game.turn = { throwsRemaining: 0, results: [] };
    game.endTurn();
    expect(game.round).toBe(1);
    game.turn = { throwsRemaining: 0, results: [] };
    game.endTurn();
    expect(game.round).toBe(2);
  });
});
