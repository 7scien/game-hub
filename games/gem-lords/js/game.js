import { CARDS } from './data/cards.js';
import { PATRONS } from './data/patrons.js';
import {
  ALL_RESOURCES,
  COLORS,
  CONFIG,
  calculatePayment,
  canTakeDifferent,
  canTakeDouble,
  eligiblePatrons,
  emptyBonuses,
  emptyResources,
  rankPlayers,
  totalTokens,
} from './rules.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createPlayer(index) {
  return {
    id: `player-${index + 1}`,
    name: `PLAYER ${index + 1}`,
    score: 0,
    tokens: emptyResources(),
    bonuses: emptyBonuses(),
    purchased: [],
    reserved: [],
    patrons: [],
  };
}

function supplyFor() {
  return {
    ...Object.fromEntries(COLORS.map((color) => [color, CONFIG.COLORED_TOKEN_COUNT])),
    Gold: CONFIG.GOLD_TOKEN_COUNT,
  };
}

export function createGame(playerCount, random = Math.random) {
  if (![2, 3, 4].includes(playerCount)) throw new Error('플레이어 수는 2–4명이어야 합니다.');

  const decks = {};
  const market = {};
  for (const tier of [1, 2, 3]) {
    decks[tier] = shuffle(CARDS.filter((card) => card.tier === tier).map(clone), random);
    market[tier] = decks[tier].splice(0, CONFIG.MARKET_SIZE);
  }

  return {
    version: CONFIG.SAVE_VERSION,
    status: 'playing',
    phase: 'action',
    playerCount,
    currentPlayerIndex: 0,
    round: 1,
    turnNumber: 1,
    players: Array.from({ length: playerCount }, (_, index) => createPlayer(index)),
    supply: supplyFor(),
    decks,
    market,
    patrons: shuffle(PATRONS.map(clone), random).slice(0, playerCount + 1),
    patronChoices: [],
    endGame: { triggered: false, triggeredBy: null },
    result: null,
    updatedAt: Date.now(),
  };
}

const currentPlayer = (state) => state.players[state.currentPlayerIndex];

function refillMarket(state, tier) {
  if (state.decks[tier].length > 0) state.market[tier].push(state.decks[tier].shift());
}

function beginResolution(state) {
  if (totalTokens(currentPlayer(state).tokens) > CONFIG.TOKEN_LIMIT) {
    state.phase = 'returnTokens';
    return;
  }
  resolvePatrons(state);
}

function resolvePatrons(state) {
  const eligible = eligiblePatrons(currentPlayer(state), state.patrons);
  if (eligible.length > 1) {
    state.phase = 'choosePatron';
    state.patronChoices = eligible.map((patron) => patron.id);
    return;
  }
  if (eligible.length === 1) claimPatron(state, eligible[0].id, false);
  finishTurn(state);
}

function claimPatron(state, patronId, finish = true) {
  const index = state.patrons.findIndex((patron) => patron.id === patronId);
  if (index < 0 || !eligiblePatrons(currentPlayer(state), state.patrons).some((patron) => patron.id === patronId)) {
    throw new Error('이 후원자의 조건을 아직 충족하지 못했습니다.');
  }
  const [patron] = state.patrons.splice(index, 1);
  const player = currentPlayer(state);
  player.patrons.push(patron);
  player.score += patron.victoryPoints;
  state.patronChoices = [];
  if (finish) finishTurn(state);
}

function finishTurn(state) {
  const player = currentPlayer(state);
  if (player.score >= CONFIG.TARGET_SCORE && !state.endGame.triggered) {
    state.endGame = { triggered: true, triggeredBy: player.id };
  }

  const roundFinished = state.currentPlayerIndex === state.players.length - 1;
  if (state.endGame.triggered && roundFinished) {
    state.status = 'finished';
    state.phase = 'finished';
    const { ranked, winners } = rankPlayers(state.players);
    state.result = { rankedIds: ranked.map((entry) => entry.id), winnerIds: winners.map((entry) => entry.id) };
    state.updatedAt = Date.now();
    return;
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) state.round += 1;
  state.turnNumber += 1;
  state.phase = 'action';
  state.updatedAt = Date.now();
}

export function takeDifferent(state, colors) {
  if (state.phase !== 'action' || !canTakeDifferent(state.supply, colors)) {
    throw new Error('공급처에 있는 서로 다른 보석을 1–3개 선택하세요.');
  }
  for (const color of colors) {
    state.supply[color] -= 1;
    currentPlayer(state).tokens[color] += 1;
  }
  beginResolution(state);
}

export function takeDouble(state, color) {
  if (state.phase !== 'action' || !canTakeDouble(state.supply, color)) {
    throw new Error(`같은 보석 2개는 공급처에 ${CONFIG.MIN_SUPPLY_FOR_DOUBLE}개 이상 있을 때만 받을 수 있습니다.`);
  }
  state.supply[color] -= 2;
  currentPlayer(state).tokens[color] += 2;
  beginResolution(state);
}

export function purchaseCard(state, source) {
  if (state.phase !== 'action') throw new Error('지금은 카드를 구매할 수 없습니다.');
  const player = currentPlayer(state);
  let card;

  if (source.kind === 'market') card = state.market[source.tier]?.[source.index];
  if (source.kind === 'reserved') card = player.reserved[source.index];
  if (!card) throw new Error('선택한 카드를 찾을 수 없습니다.');

  const payment = calculatePayment(player, card);
  if (!payment.canAfford) throw new Error('이 카드를 구매할 보석이 부족합니다.');

  for (const resource of ALL_RESOURCES) {
    player.tokens[resource] -= payment.spend[resource];
    state.supply[resource] += payment.spend[resource];
  }

  if (source.kind === 'market') {
    state.market[source.tier].splice(source.index, 1);
    refillMarket(state, source.tier);
  } else {
    player.reserved.splice(source.index, 1);
  }

  player.purchased.push(card);
  player.bonuses[card.permanentBonusColor] += 1;
  player.score += card.victoryPoints;
  beginResolution(state);
}

export function reserveCard(state, source) {
  if (state.phase !== 'action') throw new Error('지금은 카드를 예약할 수 없습니다.');
  const player = currentPlayer(state);
  if (player.reserved.length >= CONFIG.MAX_RESERVED) throw new Error('예약 카드는 최대 3장까지 보유할 수 있습니다.');

  let card;
  if (source.kind === 'market') {
    card = state.market[source.tier]?.[source.index];
    if (card) {
      state.market[source.tier].splice(source.index, 1);
      refillMarket(state, source.tier);
    }
  } else if (source.kind === 'deck') {
    card = state.decks[source.tier]?.shift();
  }
  if (!card) throw new Error('이 덱에는 예약할 카드가 없습니다.');

  player.reserved.push(card);
  if (state.supply.Gold > 0) {
    state.supply.Gold -= 1;
    player.tokens.Gold += 1;
  }
  beginResolution(state);
}

export function returnTokens(state, returns) {
  if (state.phase !== 'returnTokens') throw new Error('지금은 토큰을 반환할 때가 아닙니다.');
  const player = currentPlayer(state);
  const excess = totalTokens(player.tokens) - CONFIG.TOKEN_LIMIT;
  const returnCount = ALL_RESOURCES.reduce((sum, color) => sum + (returns[color] || 0), 0);
  if (returnCount !== excess) throw new Error(`정확히 ${excess}개의 토큰을 반환하세요.`);

  for (const color of ALL_RESOURCES) {
    const amount = returns[color] || 0;
    if (amount < 0 || amount > player.tokens[color]) throw new Error('보유한 수보다 많은 토큰을 반환할 수 없습니다.');
    player.tokens[color] -= amount;
    state.supply[color] += amount;
  }
  resolvePatrons(state);
}

export function choosePatron(state, patronId) {
  if (state.phase !== 'choosePatron' || !state.patronChoices.includes(patronId)) {
    throw new Error('획득할 수 있는 후원자를 선택하세요.');
  }
  claimPatron(state, patronId);
}

export function isValidSavedGame(state) {
  return Boolean(state
    && state.version === CONFIG.SAVE_VERSION
    && [2, 3, 4].includes(state.playerCount)
    && Array.isArray(state.players)
    && state.players.length === state.playerCount
    && ['playing', 'finished'].includes(state.status));
}
