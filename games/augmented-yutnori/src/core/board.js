export const HOME = "HOME";
export const WAIT = "WAIT";

export const NODES = {
  R1: [0.91, 0.75], R2: [0.91, 0.59], R3: [0.91, 0.43], R4: [0.91, 0.27], TR: [0.91, 0.09],
  T1: [0.75, 0.09], T2: [0.59, 0.09], T3: [0.43, 0.09], T4: [0.27, 0.09], TL: [0.09, 0.09],
  L1: [0.09, 0.27], L2: [0.09, 0.43], L3: [0.09, 0.59], L4: [0.09, 0.75], BL: [0.09, 0.91],
  B1: [0.27, 0.91], B2: [0.43, 0.91], B3: [0.59, 0.91], B4: [0.75, 0.91],
  DTR2: [0.77, 0.23], DTR1: [0.635, 0.365], C: [0.5, 0.5], DBL1: [0.365, 0.635], DBL2: [0.23, 0.77],
  DTL2: [0.23, 0.23], DTL1: [0.365, 0.365], DS1: [0.635, 0.635], DS2: [0.77, 0.77],
  HOME: [0.91, 0.91],
};

export const OUTER_PATH = [
  "R1", "R2", "R3", "R4", "TR",
  "T1", "T2", "T3", "T4", "TL",
  "L1", "L2", "L3", "L4", "BL",
  "B1", "B2", "B3", "B4", HOME,
];

export const TR_SHORTCUT = ["TR", "DTR2", "DTR1", "C", "DBL1", "DBL2", "BL", "B1", "B2", "B3", "B4", HOME];
export const TL_SHORTCUT = ["TL", "DTL2", "DTL1", "C", "DS1", "DS2", HOME];
export const REVERSE_OUTER = ["B4", "B3", "B2", "B1", "BL", "L4", "L3", "L2", "L1", "TL", "T4", "T3", "T2", "T1", "TR", "R4", "R3", "R2", "R1", HOME];

export const EDGES = [
  [HOME, "R1"], ...OUTER_PATH.slice(0, -1).map((node, i) => [node, OUTER_PATH[i + 1]]),
  ["TR", "DTR2"], ["DTR2", "DTR1"], ["DTR1", "C"], ["C", "DBL1"], ["DBL1", "DBL2"], ["DBL2", "BL"],
  ["TL", "DTL2"], ["DTL2", "DTL1"], ["DTL1", "C"], ["C", "DS1"], ["DS1", "DS2"], ["DS2", HOME],
];

export const pathForRoute = (route) => route === "diagTR" ? TR_SHORTCUT : route === "diagTL" ? TL_SHORTCUT : OUTER_PATH;

function advance(path, startIndex, steps) {
  const destinationIndex = Math.min(startIndex + steps, path.length - 1);
  return {
    target: path[destinationIndex],
    pathNodes: path.slice(startIndex + 1, destinationIndex + 1),
  };
}

export function getPreviousNodes(piece) {
  if (!piece || [WAIT, HOME].includes(piece.node)) return [];
  if (piece.route === "outer") {
    const index = OUTER_PATH.indexOf(piece.node);
    return index < 0 ? [] : [...OUTER_PATH.slice(0, index).reverse(), WAIT];
  }
  const routePath = pathForRoute(piece.route);
  const routeIndex = routePath.indexOf(piece.node);
  if (routeIndex < 0) return [];
  const entrance = routePath[0];
  const entranceIndex = OUTER_PATH.indexOf(entrance);
  return [
    ...routePath.slice(0, routeIndex).reverse(),
    ...OUTER_PATH.slice(0, entranceIndex).reverse(),
    WAIT,
  ];
}

function retreat(piece, amount) {
  const previous = getPreviousNodes(piece);
  if (!previous.length) return null;
  const pathNodes = previous.slice(0, amount);
  const target = pathNodes.at(-1);
  if (!target) return null;
  return {
    target,
    pathNodes,
    route: target === WAIT || OUTER_PATH.includes(target) && !pathForRoute(piece.route).includes(target) ? "outer" : piece.route,
  };
}

/**
 * Calculates legal destinations without mutating the piece. A shortcut is only
 * offered when a piece is already resting on its entrance node.
 */
export function getMoveOptions(piece, steps) {
  if (!piece || piece.node === HOME) return [];
  if (steps === 0) return [];
  if (steps < 0) {
    if (piece.node === WAIT) return [];
    const result = retreat(piece, Math.abs(steps));
    return result ? [{ ...result, label: `${Math.abs(steps)}칸 뒤로` }] : [];
  }

  if (piece.node === WAIT) {
    const moved = advance(OUTER_PATH, -1, steps);
    return [{ ...moved, route: "outer", label: "바깥길" }];
  }

  if (piece.route === "outer" && piece.node === "TR") {
    const outer = advance(OUTER_PATH, OUTER_PATH.indexOf("TR"), steps);
    const diagonal = advance(TR_SHORTCUT, 0, steps);
    return [
      { ...diagonal, route: "diagTR", label: "가운데 지름길" },
      { ...outer, route: "outer", label: "바깥길 유지" },
    ];
  }

  if (piece.route === "outer" && piece.node === "TL") {
    const outer = advance(OUTER_PATH, OUTER_PATH.indexOf("TL"), steps);
    const diagonal = advance(TL_SHORTCUT, 0, steps);
    return [
      { ...diagonal, route: "diagTL", label: "도착 지름길" },
      { ...outer, route: "outer", label: "바깥길 유지" },
    ];
  }

  const path = pathForRoute(piece.route);
  const index = path.indexOf(piece.node);
  if (index < 0) return [];
  const moved = advance(path, index, steps);
  return [{ ...moved, route: piece.route, label: piece.route === "outer" ? "바깥길" : "지름길" }];
}

export function getReverseMoveOptions(piece, steps) {
  if (!piece || piece.node === HOME || steps === 0) return [];
  if (steps < 0) return getMoveOptions(piece, Math.abs(steps));
  if (piece.node === WAIT) {
    const moved = advance(REVERSE_OUTER, -1, steps);
    return [{ ...moved, route: "reverse", label: "달걸음" }];
  }
  if (piece.route === "reverse") {
    const index = REVERSE_OUTER.indexOf(piece.node);
    if (index >= 0) return [{ ...advance(REVERSE_OUTER, index, steps), route: "reverse", label: "달걸음" }];
  }
  const previous = getPreviousNodes(piece);
  if (!previous.length) return [];
  const pathNodes = previous.slice(0, steps).map((node) => node === WAIT ? HOME : node);
  const target = pathNodes.at(-1) || HOME;
  return [{ target, pathNodes, route: target === HOME ? "reverse" : piece.route, label: "달걸음" }];
}

export function physicalPoint(node, boardState = {}) {
  let [x, y] = nodePoint(node);
  const turns = ((boardState.rotation || 0) % 4 + 4) % 4;
  for (let index = 0; index < turns; index += 1) [x, y] = [1 - y, x];
  if (boardState.fold === "vertical") x = x < 0.5 ? 1 - x : x;
  if (boardState.fold === "horizontal") y = y < 0.5 ? 1 - y : y;
  return [x, y];
}

export function physicalNodeKey(node, boardState = {}) {
  const [x, y] = physicalPoint(node, boardState);
  return `${x.toFixed(3)}:${y.toFixed(3)}`;
}

export function nodePoint(node) {
  if (node === WAIT) return [1.03, 1.05];
  return NODES[node] ?? NODES[HOME];
}
