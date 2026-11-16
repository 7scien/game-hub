export const THROW_TABLE = {
  0: { label: "모", steps: 5, extra: true },
  1: { label: "도", steps: 1, extra: false },
  2: { label: "개", steps: 2, extra: false },
  3: { label: "걸", steps: 3, extra: false },
  4: { label: "윷", steps: 4, extra: true },
};

export const RESULT_BY_LABEL = {
  백도: { label: "백도", steps: -1, extra: false },
  도: THROW_TABLE[1],
  개: THROW_TABLE[2],
  걸: THROW_TABLE[3],
  윷: THROW_TABLE[4],
  모: THROW_TABLE[0],
};

const SYNTHETIC_BACK_COUNTS = { 도: 1, 개: 2, 걸: 3, 윷: 4, 모: 0 };

export function makeResult(label) {
  const base = RESULT_BY_LABEL[label];
  if (!base) throw new Error(`알 수 없는 윷 결과: ${label}`);
  const count = label === "백도" ? 1 : SYNTHETIC_BACK_COUNTS[label];
  const sticks = Array.from({ length: 4 }, (_, index) => ({
    index,
    back: index < count,
    marked: index === 0,
  }));
  return { ...base, sticks, isNak: false };
}

export function resultFromSticks(sticks, useBackDo = true) {
  const normalized = sticks.map((stick, index) => ({ ...stick, index, marked: index === 0 }));
  const backCount = normalized.filter((stick) => stick.back).length;
  if (useBackDo && backCount === 1 && normalized[0].back) {
    return { ...RESULT_BY_LABEL.백도, sticks: normalized, isNak: false };
  }
  return { ...THROW_TABLE[backCount], sticks: normalized, isNak: false };
}

export function flipResultStick(result, stickIndex, useBackDo = true) {
  if (!result?.sticks?.[stickIndex]) throw new Error("뒤집을 윷가락을 선택해 주세요.");
  const sticks = result.sticks.map((stick, index) => index === stickIndex ? { ...stick, back: !stick.back } : { ...stick });
  return resultFromSticks(sticks, useBackDo);
}

export function throwYut(rng = Math.random, settings = {}) {
  if (settings.useNak && rng() < 0.06) {
    return { label: "낙", steps: 0, extra: false, sticks: [], isNak: true };
  }

  const sticks = Array.from({ length: 4 }, (_, index) => ({ index, back: rng() < 0.5, marked: index === 0 }));
  const backCount = sticks.filter((stick) => stick.back).length;
  if (settings.useBackDo && backCount === 1 && sticks[0].back) {
    return { label: "백도", steps: -1, extra: false, sticks, isNak: false };
  }
  return { ...THROW_TABLE[backCount], sticks, isNak: false };
}

export function throwVariableYut(count, rng = Math.random, settings = {}) {
  if (count === 4) return throwYut(rng, settings);
  if (settings.useNak && rng() < 0.06) return { label: "낙", steps: 0, extra: false, sticks: [], isNak: true };
  const sticks = Array.from({ length: count }, (_, index) => ({ index, back: rng() < 0.5, marked: index === 0 }));
  const backCount = sticks.filter((stick) => stick.back).length;
  if (settings.useBackDo && backCount === 1 && sticks[0].back) return { ...RESULT_BY_LABEL.백도, sticks, isNak: false };
  const label = backCount === 0 ? "모" : backCount === 1 ? "도" : backCount === 2 ? "개" : backCount === 3 ? "걸" : "윷";
  return { ...RESULT_BY_LABEL[label], sticks, isNak: false };
}

export function throwSixYut(rng = Math.random) {
  const sticks = Array.from({ length: 6 }, (_, index) => ({ index, back: rng() < 0.5, marked: index === 0 }));
  const frontCount = sticks.filter((stick) => !stick.back).length;
  if (frontCount === 6) return { label: "탈락", steps: 0, extra: false, sticks, isNak: false, eliminates: true };
  const label = frontCount === 0 ? "모" : frontCount === 1 ? "도" : frontCount === 2 ? "개" : frontCount === 3 ? "걸" : "윷";
  return { ...RESULT_BY_LABEL[label], sticks, isNak: false };
}

export function throwTwoStickPair(rng = Math.random) {
  const sticks = Array.from({ length: 2 }, (_, index) => ({ index, back: rng() < 0.5, marked: false }));
  const backCount = sticks.filter((stick) => stick.back).length;
  const label = backCount === 2 ? "개" : "도";
  return { ...RESULT_BY_LABEL[label], sticks, isNak: false, extra: false };
}
