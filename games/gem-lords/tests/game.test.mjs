import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePatron,
  createGame,
  isValidSavedGame,
  purchaseCard,
  reserveCard,
  returnTokens,
  takeDifferent,
  takeDouble,
} from '../js/game.js';
import {
  COLORS,
  CONFIG,
  calculatePayment,
  canTakeDouble,
  emptyBonuses,
  emptyResources,
  rankPlayers,
} from '../js/rules.js';

const fixedRandom = () => 0.42;
const zeroCost = () => Object.fromEntries(COLORS.map((color) => [color, 0]));

test('2–4인 게임은 인원별 공급량, Patron, Tier별 공개 카드 4장을 만든다', () => {
  for (const [playerCount, supplyCount] of [[2, 4], [3, 5], [4, 7]]) {
    const state = createGame(playerCount, fixedRandom);
    assert.equal(state.players.length, playerCount);
    assert.equal(state.patrons.length, playerCount + 1);
    assert.equal(state.supply.Ruby, supplyCount);
    assert.equal(state.supply.Gold, 5);
    assert.deepEqual([1, 2, 3].map((tier) => state.market[tier].length), [4, 4, 4]);
  }
});

test('서로 다른 보석 3개를 가져오면 공급과 플레이어 보유량이 갱신된다', () => {
  const state = createGame(2, fixedRandom);
  takeDifferent(state, ['Ruby', 'Sapphire', 'Emerald']);
  assert.deepEqual(
    [state.players[0].tokens.Ruby, state.players[0].tokens.Sapphire, state.players[0].tokens.Emerald],
    [1, 1, 1],
  );
  assert.equal(state.supply.Ruby, 3);
  assert.equal(state.currentPlayerIndex, 1);
});

test('같은 보석 2개는 최소 잔여량 상수 경계에서만 허용된다', () => {
  assert.equal(CONFIG.MIN_SUPPLY_FOR_DOUBLE, 4);
  assert.equal(canTakeDouble({ Ruby: 4 }, 'Ruby'), true);
  assert.equal(canTakeDouble({ Ruby: 3 }, 'Ruby'), false);
  const state = createGame(2, fixedRandom);
  takeDouble(state, 'Diamond');
  assert.equal(state.players[0].tokens.Diamond, 2);
  assert.equal(state.supply.Diamond, 2);
});

test('영구 할인 후 부족분은 Gold로 대체 지불하고 시장 카드를 보충한다', () => {
  const state = createGame(2, fixedRandom);
  const player = state.players[0];
  player.bonuses.Ruby = 3;
  player.tokens.Ruby = 2;
  player.tokens.Gold = 1;
  state.market[1][0] = {
    id: 'test-payment', tier: 1, permanentBonusColor: 'Emerald', victoryPoints: 1,
    cost: { ...zeroCost(), Ruby: 5, Sapphire: 1 },
  };
  const deckBefore = state.decks[1].length;
  const payment = calculatePayment(player, state.market[1][0]);
  assert.equal(payment.spend.Ruby, 2);
  assert.equal(payment.goldNeeded, 1);
  assert.equal(payment.canAfford, true);
  purchaseCard(state, { kind: 'market', tier: 1, index: 0 });
  assert.equal(player.tokens.Ruby, 0);
  assert.equal(player.tokens.Gold, 0);
  assert.equal(player.bonuses.Emerald, 1);
  assert.equal(player.score, 1);
  assert.equal(player.purchased.at(-1).id, 'test-payment');
  assert.equal(state.market[1].length, 4);
  assert.equal(state.decks[1].length, deckBefore - 1);
});

test('공개 카드와 덱 맨 위 예약은 Gold를 지급하고 예약 한도를 지킨다', () => {
  const state = createGame(2, fixedRandom);
  const player = state.players[0];
  const deckBefore = state.decks[1].length;
  reserveCard(state, { kind: 'market', tier: 1, index: 0 });
  assert.equal(player.reserved.length, 1);
  assert.equal(player.tokens.Gold, 1);
  assert.equal(state.decks[1].length, deckBefore - 1);

  state.currentPlayerIndex = 0;
  state.phase = 'action';
  reserveCard(state, { kind: 'deck', tier: 2 });
  assert.equal(player.reserved.length, 2);
  assert.equal(player.tokens.Gold, 2);

  state.currentPlayerIndex = 0;
  state.phase = 'action';
  reserveCard(state, { kind: 'deck', tier: 3 });
  assert.equal(player.reserved.length, CONFIG.MAX_RESERVED);

  state.currentPlayerIndex = 0;
  state.phase = 'action';
  assert.throws(() => reserveCard(state, { kind: 'deck', tier: 1 }), /최대 3장/);
});

test('토큰 한도 초과 시 직접 반환하기 전까지 턴이 넘어가지 않는다', () => {
  const state = createGame(2, fixedRandom);
  const player = state.players[0];
  player.tokens = { ...emptyResources(), Ruby: 3, Sapphire: 3, Emerald: 3 };
  takeDifferent(state, ['Ruby', 'Sapphire', 'Diamond']);
  assert.equal(state.phase, 'returnTokens');
  assert.equal(state.currentPlayerIndex, 0);
  assert.throws(() => returnTokens(state, { ...emptyResources(), Ruby: 1 }), /정확히 2개/);
  returnTokens(state, { ...emptyResources(), Ruby: 1, Sapphire: 1 });
  assert.equal(state.phase, 'action');
  assert.equal(state.currentPlayerIndex, 1);
});

test('한 Patron 조건을 만족하면 자동 획득하고 여러 조건이면 하나를 선택한다', () => {
  const state = createGame(2, fixedRandom);
  state.patrons = [
    { id: 'p1', name: 'One', victoryPoints: 3, requirements: { Ruby: 1 } },
    { id: 'p2', name: 'Two', victoryPoints: 3, requirements: { Ruby: 1 } },
  ];
  state.market[1][0] = {
    id: 'free-ruby', tier: 1, permanentBonusColor: 'Ruby', victoryPoints: 0, cost: zeroCost(),
  };
  purchaseCard(state, { kind: 'market', tier: 1, index: 0 });
  assert.equal(state.phase, 'choosePatron');
  assert.deepEqual(new Set(state.patronChoices), new Set(['p1', 'p2']));
  choosePatron(state, 'p2');
  assert.equal(state.players[0].patrons[0].id, 'p2');
  assert.equal(state.players[0].score, 3);
  assert.equal(state.currentPlayerIndex, 1);

  const automatic = createGame(2, fixedRandom);
  automatic.patrons = [{ id: 'solo', name: 'Solo', victoryPoints: 3, requirements: { Emerald: 1 } }];
  automatic.market[1][0] = {
    id: 'free-emerald', tier: 1, permanentBonusColor: 'Emerald', victoryPoints: 0, cost: zeroCost(),
  };
  purchaseCard(automatic, { kind: 'market', tier: 1, index: 0 });
  assert.equal(automatic.players[0].patrons[0].id, 'solo');
});

test('목표 점수 도달 후 현재 라운드 마지막 플레이어까지 진행한다', () => {
  const state = createGame(3, fixedRandom);
  state.currentPlayerIndex = 1;
  state.players[1].score = CONFIG.TARGET_SCORE - 1;
  state.market[1][0] = {
    id: 'winning-card', tier: 1, permanentBonusColor: 'Onyx', victoryPoints: 1, cost: zeroCost(),
  };
  purchaseCard(state, { kind: 'market', tier: 1, index: 0 });
  assert.equal(state.endGame.triggered, true);
  assert.equal(state.status, 'playing');
  assert.equal(state.currentPlayerIndex, 2);
  takeDifferent(state, ['Ruby']);
  assert.equal(state.status, 'finished');
  assert.equal(state.result.winnerIds[0], 'player-2');
});

test('동점이면 구매 카드가 적은 플레이어가 우선하고 완전 동률은 공동 승리다', () => {
  const base = {
    score: 15, tokens: emptyResources(), bonuses: emptyBonuses(), reserved: [], patrons: [],
  };
  const fewer = { ...base, id: 'fewer', purchased: [{}, {}] };
  const more = { ...base, id: 'more', purchased: [{}, {}, {}] };
  assert.deepEqual(rankPlayers([more, fewer]).winners.map((player) => player.id), ['fewer']);

  const tied = { ...base, id: 'tied', purchased: [{}, {}] };
  assert.deepEqual(new Set(rankPlayers([fewer, tied]).winners.map((player) => player.id)), new Set(['fewer', 'tied']));
});

test('저장 데이터 검증은 지원 버전과 2–4인 상태만 허용한다', () => {
  const state = createGame(4, fixedRandom);
  assert.equal(isValidSavedGame(JSON.parse(JSON.stringify(state))), true);
  assert.equal(isValidSavedGame({ ...state, version: 999 }), false);
  assert.equal(isValidSavedGame({ ...state, playerCount: 5 }), false);
});
