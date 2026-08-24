import { adjacentVertices, createBoard, seededRandom, shuffle } from './board';
import {
  bagTotal, COSTS, DEV_LABELS, emptyBag, RESOURCES, RESOURCE_LABELS, TERRAIN_RESOURCE,
  type DevCardType, type GameState, type Player, type Resource, type ResourceBag, type TradeOffer,
} from './types';

const DEV_DECK: DevCardType[] = [
  ...Array(14).fill('knight'), ...Array(5).fill('victory'),
  ...Array(2).fill('roadBuilding'), ...Array(2).fill('yearOfPlenty'), ...Array(2).fill('monopoly'),
] as DevCardType[];

export type GameAction =
  | { type: 'UNLOCK' }
  | { type: 'PLACE_SETTLEMENT'; vertexId: string }
  | { type: 'PLACE_ROAD'; edgeId: string }
  | { type: 'ROLL'; dice: [number, number] }
  | { type: 'DISCARD'; playerId: string; resources: ResourceBag }
  | { type: 'MOVE_ROBBER'; tileId: string }
  | { type: 'STEAL'; victimId: string; randomValue: number }
  | { type: 'END_TURN' }
  | { type: 'BUILD_SETTLEMENT'; vertexId: string }
  | { type: 'BUILD_ROAD'; edgeId: string }
  | { type: 'BUILD_CITY'; vertexId: string }
  | { type: 'BUY_DEV' }
  | { type: 'PLAY_DEV'; cardId: string; resources?: Resource[]; resource?: Resource }
  | { type: 'BANK_TRADE'; give: Resource; receive: Resource }
  | { type: 'PROPOSE_TRADE'; offer: TradeOffer }
  | { type: 'RESOLVE_TRADE'; accept: boolean }
  | { type: 'TOGGLE_SOUND' };

const playerColors = ['#c65343', '#287a72', '#d49a32', '#6552a0'];

export function createGame(names: string[], colors = playerColors, seed = Date.now()): GameState {
  if (names.length !== 3 && names.length !== 4) throw new Error('플레이어는 3명 또는 4명이어야 합니다.');
  const random = seededRandom(seed);
  const players: Player[] = names.map((name, index) => ({
    id: `p${index + 1}`,
    name: name.trim() || `플레이어 ${index + 1}`,
    color: colors[index],
    resources: emptyBag(),
    devCards: [],
    roads: [],
    usedKnights: 0,
  }));
  const turnOrder = shuffle(players.map((player) => player.id), random);
  const setupSequence = [...turnOrder, ...[...turnOrder].reverse()];
  const starter = players.find((player) => player.id === turnOrder[0])!;
  return {
    version: 1,
    seed,
    board: createBoard(seed),
    players,
    turnOrder,
    currentPlayerId: turnOrder[0],
    turnNumber: 1,
    round: 1,
    phase: 'setup-settlement',
    setupSequence,
    setupIndex: 0,
    buildings: {},
    bank: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    devDeck: shuffle(DEV_DECK, random),
    hidden: true,
    handoffReason: `${starter.name}님이 첫 배치를 시작합니다`,
    discardQueue: [],
    eligibleVictims: [],
    devPlayedThisTurn: false,
    freeRoads: 0,
    sound: true,
    log: [{ id: 'start', message: `${starter.name}님이 무작위로 시작 플레이어가 되었습니다.` }],
  };
}

function currentPlayer(state: GameState) {
  return state.players.find((player) => player.id === state.currentPlayerId)!;
}

export function hasResources(player: Player, cost: ResourceBag) {
  return RESOURCES.every((resource) => player.resources[resource] >= cost[resource]);
}

function transferBag(from: ResourceBag, to: ResourceBag, bag: ResourceBag) {
  for (const resource of RESOURCES) {
    from[resource] -= bag[resource];
    to[resource] += bag[resource];
  }
}

function addLog(state: GameState, message: string, privateFor?: string[]) {
  state.log = [{ id: `${Date.now()}-${state.log.length}`, message, privateFor }, ...state.log].slice(0, 80);
}

const pieceCount = (state: GameState, playerId: string, type: 'settlement' | 'city') =>
  Object.values(state.buildings).filter((building) => building.playerId === playerId && building.type === type).length;

export function canPlaceSettlement(state: GameState, vertexId: string, setup = false) {
  const vertex = state.board.vertices[vertexId];
  if (!vertex || state.buildings[vertexId]) return false;
  if (pieceCount(state, state.currentPlayerId, 'settlement') >= 5) return false;
  if (adjacentVertices(state.board, vertexId).some((id) => state.buildings[id])) return false;
  return setup || vertex.edgeIds.some((edgeId) => currentPlayer(state).roads.includes(edgeId));
}

export function canPlaceRoad(state: GameState, edgeId: string, setupVertexId?: string) {
  const edge = state.board.edges[edgeId];
  const player = currentPlayer(state);
  if (!edge || state.players.some((candidate) => candidate.roads.includes(edgeId)) || player.roads.length >= 15) return false;
  if (setupVertexId) return edge.a === setupVertexId || edge.b === setupVertexId;
  return [edge.a, edge.b].some((vertexId) => {
    const building = state.buildings[vertexId];
    if (building?.playerId === player.id) return true;
    if (building && building.playerId !== player.id) return false;
    return state.board.vertices[vertexId].edgeIds.some((id) => player.roads.includes(id));
  });
}

export function canUpgradeCity(state: GameState, vertexId: string) {
  const building = state.buildings[vertexId];
  return building?.playerId === state.currentPlayerId && building.type === 'settlement' && pieceCount(state, state.currentPlayerId, 'city') < 4;
}

function payCost(state: GameState, player: Player, cost: ResourceBag) {
  transferBag(player.resources, state.bank, cost);
}

function receiveStartingResources(state: GameState, vertexId: string, player: Player) {
  for (const tileId of state.board.vertices[vertexId].adjacentTileIds) {
    const tile = state.board.tiles.find((candidate) => candidate.id === tileId)!;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (resource && state.bank[resource] > 0) {
      state.bank[resource] -= 1;
      player.resources[resource] += 1;
    }
  }
}

export function produceResources(state: GameState, diceTotal: number) {
  const demands = new Map<Resource, { player: Player; amount: number }[]>();
  for (const tile of state.board.tiles) {
    if (tile.number !== diceTotal || tile.id === state.board.robberTileId) continue;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (!resource) continue;
    for (const vertexId of tile.vertexIds) {
      const building = state.buildings[vertexId];
      if (!building) continue;
      const player = state.players.find((candidate) => candidate.id === building.playerId)!;
      const demand = demands.get(resource) ?? [];
      demand.push({ player, amount: building.type === 'city' ? 2 : 1 });
      demands.set(resource, demand);
    }
  }
  const result: string[] = [];
  for (const [resource, entries] of demands) {
    const needed = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (state.bank[resource] < needed) {
      result.push(`${RESOURCE_LABELS[resource]} 부족으로 아무도 받지 못함`);
      continue;
    }
    for (const { player, amount } of entries) player.resources[resource] += amount;
    state.bank[resource] -= needed;
    result.push(`${RESOURCE_LABELS[resource]} ${needed}개 생산`);
  }
  addLog(state, result.length ? `${diceTotal}: ${result.join(' · ')}` : `${diceTotal}: 생산된 자원이 없습니다.`);
}

export function getTradeRatio(state: GameState, playerId: string, resource: Resource) {
  const playerVertices = Object.entries(state.buildings).filter(([, building]) => building.playerId === playerId).map(([vertexId]) => vertexId);
  let ratio = 4;
  for (const port of state.board.ports) {
    const edge = state.board.edges[port.edgeId];
    if (!playerVertices.includes(edge.a) && !playerVertices.includes(edge.b)) continue;
    if (port.type === resource) ratio = Math.min(ratio, 2);
    if (port.type === 'generic') ratio = Math.min(ratio, 3);
  }
  return ratio;
}

export function requiredDiscardCount(player: Player) {
  const total = bagTotal(player.resources);
  return total >= 8 ? Math.floor(total / 2) : 0;
}

function playableDev(player: Player, cardId: string, turn: number) {
  return player.devCards.find((card) => card.id === cardId && !card.played && card.type !== 'victory' && card.boughtTurn < turn);
}

export function longestRoadLength(state: GameState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  if (!player.roads.length) return 0;
  const roadSet = new Set(player.roads);
  const blocked = new Set(Object.entries(state.buildings).filter(([, building]) => building.playerId !== playerId).map(([vertexId]) => vertexId));
  const walk = (vertexId: string, used: Set<string>): number => {
    if (used.size > 0 && blocked.has(vertexId)) return used.size;
    let best = used.size;
    for (const edgeId of state.board.vertices[vertexId].edgeIds) {
      if (!roadSet.has(edgeId) || used.has(edgeId)) continue;
      const nextUsed = new Set(used).add(edgeId);
      const edge = state.board.edges[edgeId];
      const next = edge.a === vertexId ? edge.b : edge.a;
      best = Math.max(best, walk(next, nextUsed));
    }
    return best;
  };
  const vertices = new Set(player.roads.flatMap((edgeId) => [state.board.edges[edgeId].a, state.board.edges[edgeId].b]));
  return Math.max(...[...vertices].map((vertexId) => walk(vertexId, new Set())));
}

function chooseOwner(values: [string, number][], minimum: number, previous?: string) {
  const maximum = Math.max(0, ...values.map(([, value]) => value));
  if (maximum < minimum) return undefined;
  const leaders = values.filter(([, value]) => value === maximum).map(([id]) => id);
  if (leaders.length === 1) return leaders[0];
  return previous && leaders.includes(previous) ? previous : undefined;
}

export function calculateAwards(state: GameState) {
  state.longestRoadOwner = chooseOwner(state.players.map((player) => [player.id, longestRoadLength(state, player.id)]), 5, state.longestRoadOwner);
  state.largestArmyOwner = chooseOwner(state.players.map((player) => [player.id, player.usedKnights]), 3, state.largestArmyOwner);
}

export function scorePlayer(state: GameState, playerId: string, includeHidden = false) {
  let score = Object.values(state.buildings).reduce((sum, building) => sum + (building.playerId === playerId ? (building.type === 'city' ? 2 : 1) : 0), 0);
  if (state.longestRoadOwner === playerId) score += 2;
  if (state.largestArmyOwner === playerId) score += 2;
  if (includeHidden) score += state.players.find((player) => player.id === playerId)!.devCards.filter((card) => card.type === 'victory').length;
  return score;
}

export function hasWinner(state: GameState) {
  return scorePlayer(state, state.currentPlayerId, true) >= 10;
}

function finishAction(state: GameState) {
  calculateAwards(state);
  if (hasWinner(state) && !state.phase.startsWith('setup')) {
    state.winnerId = state.currentPlayerId;
    state.phase = 'victory';
    state.hidden = false;
    addLog(state, `${currentPlayer(state).name}님이 10점을 달성했습니다!`);
  }
  return state;
}

function nextSetupPlayer(state: GameState) {
  state.setupIndex += 1;
  state.lastPlacedVertexId = undefined;
  if (state.setupIndex >= state.setupSequence.length) {
    state.currentPlayerId = state.turnOrder[0];
    state.phase = 'pre-roll';
    state.hidden = true;
    state.handoffReason = '초기 배치가 끝났습니다. 첫 차례를 시작하세요.';
    addLog(state, '초기 배치가 모두 끝났습니다.');
    return;
  }
  const previous = state.currentPlayerId;
  state.currentPlayerId = state.setupSequence[state.setupIndex];
  state.phase = 'setup-settlement';
  if (previous !== state.currentPlayerId) {
    state.hidden = true;
    state.handoffReason = '다음 플레이어가 마을과 길을 배치할 차례입니다.';
  }
}

function victimIds(state: GameState, tileId: string) {
  const tile = state.board.tiles.find((candidate) => candidate.id === tileId)!;
  return [...new Set(tile.vertexIds.map((vertexId) => state.buildings[vertexId]?.playerId).filter((id): id is string => Boolean(id && id !== state.currentPlayerId)))]
    .filter((id) => bagTotal(state.players.find((player) => player.id === id)!.resources) > 0);
}

function randomResource(player: Player, value: number) {
  const cards = RESOURCES.flatMap((resource) => Array(player.resources[resource]).fill(resource)) as Resource[];
  return cards[Math.min(cards.length - 1, Math.floor(Math.max(0, Math.min(.999999, value)) * cards.length))];
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  if (state.phase === 'victory' && action.type !== 'TOGGLE_SOUND') return state;
  if (action.type === 'TOGGLE_SOUND') return { ...state, sound: !state.sound };
  if (action.type === 'UNLOCK') return { ...state, hidden: false };

  if (action.type === 'PLACE_SETTLEMENT' && state.phase === 'setup-settlement') {
    if (!canPlaceSettlement(state, action.vertexId, true)) return state;
    const next = structuredClone(state);
    next.buildings[action.vertexId] = { playerId: next.currentPlayerId, type: 'settlement' };
    next.lastPlacedVertexId = action.vertexId;
    next.phase = 'setup-road';
    if (next.setupIndex >= next.turnOrder.length) receiveStartingResources(next, action.vertexId, currentPlayer(next));
    addLog(next, `${currentPlayer(next).name}님이 초기 마을을 놓았습니다.`);
    return next;
  }

  if (action.type === 'PLACE_ROAD' && state.phase === 'setup-road') {
    if (!state.lastPlacedVertexId || !canPlaceRoad(state, action.edgeId, state.lastPlacedVertexId)) return state;
    const next = structuredClone(state);
    currentPlayer(next).roads.push(action.edgeId);
    addLog(next, `${currentPlayer(next).name}님이 초기 길을 놓았습니다.`);
    nextSetupPlayer(next);
    return next;
  }

  if (action.type === 'ROLL' && state.phase === 'pre-roll') {
    if (action.dice.some((die) => die < 1 || die > 6 || !Number.isInteger(die))) return state;
    const next = structuredClone(state);
    next.dice = action.dice;
    const total = action.dice[0] + action.dice[1];
    addLog(next, `${currentPlayer(next).name}님이 ${total}을 굴렸습니다.`);
    if (total === 7) {
      next.discardQueue = next.players.filter((player) => requiredDiscardCount(player) > 0).map((player) => player.id);
      if (next.discardQueue.length) {
        next.phase = 'discard';
        next.privacyPlayerId = next.discardQueue[0];
        next.hidden = false;
      } else {
        next.phase = 'robber-move';
      }
    } else {
      produceResources(next, total);
      next.phase = 'main';
    }
    return finishAction(next);
  }

  if (action.type === 'DISCARD' && state.phase === 'discard') {
    const expectedId = state.discardQueue[0];
    const player = state.players.find((candidate) => candidate.id === action.playerId);
    if (!player || action.playerId !== expectedId || bagTotal(action.resources) !== requiredDiscardCount(player) || !hasResources(player, action.resources)) return state;
    const next = structuredClone(state);
    const nextPlayer = next.players.find((candidate) => candidate.id === action.playerId)!;
    transferBag(nextPlayer.resources, next.bank, action.resources);
    next.discardQueue.shift();
    addLog(next, `${nextPlayer.name}님이 자원 ${bagTotal(action.resources)}장을 버렸습니다.`);
    if (next.discardQueue.length) {
      next.privacyPlayerId = next.discardQueue[0];
      next.hidden = false;
    } else {
      next.phase = 'robber-move';
      next.privacyPlayerId = next.currentPlayerId;
      next.hidden = false;
    }
    return next;
  }

  if (action.type === 'MOVE_ROBBER' && state.phase === 'robber-move') {
    if (!state.board.tiles.some((tile) => tile.id === action.tileId) || action.tileId === state.board.robberTileId) return state;
    const next = structuredClone(state);
    next.board.robberTileId = action.tileId;
    next.eligibleVictims = victimIds(next, action.tileId);
    next.phase = next.eligibleVictims.length ? 'robber-steal' : 'main';
    addLog(next, `${currentPlayer(next).name}님이 도둑을 이동했습니다.`);
    return next;
  }

  if (action.type === 'STEAL' && state.phase === 'robber-steal') {
    if (!state.eligibleVictims.includes(action.victimId)) return state;
    const victim = state.players.find((player) => player.id === action.victimId)!;
    if (!bagTotal(victim.resources)) return state;
    const next = structuredClone(state);
    const nextVictim = next.players.find((player) => player.id === action.victimId)!;
    const resource = randomResource(nextVictim, action.randomValue);
    nextVictim.resources[resource] -= 1;
    currentPlayer(next).resources[resource] += 1;
    next.phase = 'main';
    next.eligibleVictims = [];
    addLog(next, `${currentPlayer(next).name}님이 ${nextVictim.name}님에게서 자원 1장을 가져왔습니다.`);
    addLog(next, `${RESOURCE_LABELS[resource]} 1장을 가져왔습니다.`, [next.currentPlayerId, action.victimId]);
    return finishAction(next);
  }

  if (action.type === 'BUILD_SETTLEMENT' && state.phase === 'main') {
    const player = currentPlayer(state);
    if (!canPlaceSettlement(state, action.vertexId) || !hasResources(player, COSTS.settlement)) return state;
    const next = structuredClone(state);
    payCost(next, currentPlayer(next), COSTS.settlement);
    next.buildings[action.vertexId] = { playerId: next.currentPlayerId, type: 'settlement' };
    addLog(next, `${currentPlayer(next).name}님이 마을을 건설했습니다.`);
    return finishAction(next);
  }

  if ((action.type === 'BUILD_ROAD' || action.type === 'PLACE_ROAD') && state.phase === 'main') {
    const player = currentPlayer(state);
    const free = state.freeRoads > 0;
    if (!canPlaceRoad(state, action.edgeId) || (!free && !hasResources(player, COSTS.road))) return state;
    const next = structuredClone(state);
    if (free) next.freeRoads -= 1;
    else payCost(next, currentPlayer(next), COSTS.road);
    currentPlayer(next).roads.push(action.edgeId);
    addLog(next, `${currentPlayer(next).name}님이 길을 건설했습니다${free ? ' (무료)' : ''}.`);
    return finishAction(next);
  }

  if (action.type === 'BUILD_CITY' && state.phase === 'main') {
    const player = currentPlayer(state);
    if (!canUpgradeCity(state, action.vertexId) || !hasResources(player, COSTS.city)) return state;
    const next = structuredClone(state);
    payCost(next, currentPlayer(next), COSTS.city);
    next.buildings[action.vertexId].type = 'city';
    addLog(next, `${currentPlayer(next).name}님이 도시를 건설했습니다.`);
    return finishAction(next);
  }

  if (action.type === 'BUY_DEV' && state.phase === 'main') {
    const player = currentPlayer(state);
    if (!state.devDeck.length || !hasResources(player, COSTS.development)) return state;
    const next = structuredClone(state);
    payCost(next, currentPlayer(next), COSTS.development);
    const cardType = next.devDeck.shift()!;
    currentPlayer(next).devCards.push({ id: `d${next.turnNumber}-${state.devDeck.length}`, type: cardType, boughtTurn: next.turnNumber, played: false });
    addLog(next, `${currentPlayer(next).name}님이 개발 카드 1장을 샀습니다.`);
    return finishAction(next);
  }

  if (action.type === 'PLAY_DEV' && (state.phase === 'main' || state.phase === 'pre-roll')) {
    const card = playableDev(currentPlayer(state), action.cardId, state.turnNumber);
    if (!card || state.devPlayedThisTurn) return state;
    const next = structuredClone(state);
    const nextCard = currentPlayer(next).devCards.find((candidate) => candidate.id === card.id)!;
    if (card.type === 'yearOfPlenty') {
      if (!action.resources || action.resources.length !== 2) return state;
      const needed = action.resources.reduce((bag, resource) => ({ ...bag, [resource]: bag[resource] + 1 }), emptyBag());
      if (!RESOURCES.every((resource) => next.bank[resource] >= needed[resource])) return state;
      transferBag(next.bank, currentPlayer(next).resources, needed);
    }
    if (card.type === 'monopoly') {
      if (!action.resource) return state;
      let taken = 0;
      for (const player of next.players) {
        if (player.id === next.currentPlayerId) continue;
        taken += player.resources[action.resource];
        currentPlayer(next).resources[action.resource] += player.resources[action.resource];
        player.resources[action.resource] = 0;
      }
      addLog(next, `${RESOURCE_LABELS[action.resource]} ${taken}장을 독점했습니다.`, [next.currentPlayerId]);
    }
    if (card.type === 'roadBuilding') next.freeRoads = 2;
    if (card.type === 'knight') {
      currentPlayer(next).usedKnights += 1;
      next.phase = 'robber-move';
    }
    nextCard.played = true;
    next.devPlayedThisTurn = true;
    addLog(next, `${currentPlayer(next).name}님이 ${DEV_LABELS[card.type]} 카드를 사용했습니다.`);
    return finishAction(next);
  }

  if (action.type === 'BANK_TRADE' && state.phase === 'main') {
    if (action.give === action.receive) return state;
    const player = currentPlayer(state);
    const ratio = getTradeRatio(state, player.id, action.give);
    if (player.resources[action.give] < ratio || state.bank[action.receive] < 1) return state;
    const next = structuredClone(state);
    currentPlayer(next).resources[action.give] -= ratio;
    next.bank[action.give] += ratio;
    next.bank[action.receive] -= 1;
    currentPlayer(next).resources[action.receive] += 1;
    addLog(next, `${currentPlayer(next).name}님이 은행과 ${ratio}:1로 거래했습니다.`);
    return finishAction(next);
  }

  if (action.type === 'PROPOSE_TRADE' && state.phase === 'main') {
    const offer = action.offer;
    const overlaps = RESOURCES.some((resource) => offer.give[resource] > 0 && offer.receive[resource] > 0);
    if (offer.from !== state.currentPlayerId || offer.to === offer.from || overlaps || !state.players.some((player) => player.id === offer.to) || bagTotal(offer.give) < 1 || bagTotal(offer.receive) < 1 || !hasResources(currentPlayer(state), offer.give)) return state;
    const next = structuredClone(state);
    next.pendingTrade = offer;
    next.privacyPlayerId = offer.to;
    next.hidden = false;
    return next;
  }

  if (action.type === 'RESOLVE_TRADE' && state.pendingTrade) {
    const offer = state.pendingTrade;
    const from = state.players.find((player) => player.id === offer.from)!;
    const to = state.players.find((player) => player.id === offer.to)!;
    if (action.accept && (!hasResources(from, offer.give) || !hasResources(to, offer.receive))) return state;
    const next = structuredClone(state);
    const nextFrom = next.players.find((player) => player.id === offer.from)!;
    const nextTo = next.players.find((player) => player.id === offer.to)!;
    if (action.accept) {
      transferBag(nextFrom.resources, nextTo.resources, offer.give);
      transferBag(nextTo.resources, nextFrom.resources, offer.receive);
      addLog(next, `${nextFrom.name}님과 ${nextTo.name}님의 직접 거래가 성사됐습니다.`);
    } else addLog(next, `${nextTo.name}님이 직접 거래를 거절했습니다.`);
    next.pendingTrade = undefined;
    next.privacyPlayerId = undefined;
    next.hidden = false;
    return finishAction(next);
  }

  if (action.type === 'END_TURN' && state.phase === 'main' && state.freeRoads === 0 && !state.pendingTrade) {
    const next = structuredClone(state);
    const index = next.turnOrder.indexOf(next.currentPlayerId);
    const nextIndex = (index + 1) % next.turnOrder.length;
    next.currentPlayerId = next.turnOrder[nextIndex];
    next.turnNumber += 1;
    if (nextIndex === 0) next.round += 1;
    next.phase = 'pre-roll';
    next.dice = undefined;
    next.devPlayedThisTurn = false;
    next.hidden = false;
    next.privacyPlayerId = undefined;
    addLog(next, `${currentPlayer(next).name}님의 차례가 시작됩니다.`);
    return next;
  }

  return state;
}
