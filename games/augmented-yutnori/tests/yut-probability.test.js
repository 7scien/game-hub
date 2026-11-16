import { describe, expect, it } from "vitest";
import { throwYut } from "../src/core/yut.js";

function resultForMask(mask, useBackDo) {
  let index = 0;
  const rng = () => (mask & (1 << index++)) ? 0.25 : 0.75;
  return throwYut(rng, { useBackDo, useNak: false }).label;
}

function enumerate(useBackDo) {
  const counts = { 도: 0, 개: 0, 걸: 0, 윷: 0, 모: 0, 백도: 0 };
  for (let mask = 0; mask < 16; mask += 1) counts[resultForMask(mask, useBackDo)] += 1;
  return counts;
}

function percentages(counts) {
  return Object.fromEntries(Object.entries(counts).map(([label, count]) => [label, count * 100 / 16]));
}

describe("basic four-stick yut probability distribution", () => {
  it("exhaustively matches the intended distribution when back-do is enabled", () => {
    const counts = enumerate(true);
    expect(counts).toEqual({ 도: 3, 개: 6, 걸: 4, 윷: 1, 모: 1, 백도: 1 });
    expect(percentages(counts)).toEqual({ 도: 18.75, 개: 37.5, 걸: 25, 윷: 6.25, 모: 6.25, 백도: 6.25 });
  });

  it("returns the marked single-back combination to do when back-do is disabled", () => {
    const counts = enumerate(false);
    expect(counts).toEqual({ 도: 4, 개: 6, 걸: 4, 윷: 1, 모: 1, 백도: 0 });
    expect(percentages(counts)).toEqual({ 도: 25, 개: 37.5, 걸: 25, 윷: 6.25, 모: 6.25, 백도: 0 });
  });

  it("maps all sixteen equally likely stick states to exactly one result", () => {
    expect(Object.values(enumerate(true)).reduce((sum, count) => sum + count, 0)).toBe(16);
  });
});
