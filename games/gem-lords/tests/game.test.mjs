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
  RESOURCE_META,
  calculatePayment,
  canTakeDouble,
  emptyBonuses,
  emptyResources,
  rankPlayers,
} from '../js/rules.js';
import { CARDS } from '../js/data/cards.js';
import { PATRONS } from '../js/data/patrons.js';
import {
  DEFAULT_GAME_TITLE,
  MAX_PLAYER_NAME_LENGTH,
  MAX_SAVE_SLOTS,
  SAVE_SLOTS_KEY,
  STORAGE_KEY,
  MAX_TITLE_LENGTH,
  normalizeGameTitle,
  normalizePlayerName,
} from '../js/config.js';
import { emptySaveSlots, loadSaveSlots, writeSaveSlot } from '../js/storage.js';

const fixedRandom = () => 0.42;
const zeroCost = () => Object.fromEntries(COLORS.map((color) => [color, 0]));

test('사용자 제목은 공백과 길이를 정리하고 빈 제목은 기본값으로 되돌린다', () => {
  assert.equal(normalizeGameTitle('  나만의   보석 게임  '), '나만의 보석 게임');
  assert.equal(normalizeGameTitle(''), DEFAULT_GAME_TITLE);
  assert.equal(normalizeGameTitle('가'.repeat(MAX_TITLE_LENGTH + 5)).length, MAX_TITLE_LENGTH);
});

test('플레이어 이름은 시작 시 지정하며 공백·길이·빈 이름을 안전하게 정리한다', () => {
  assert.equal(normalizePlayerName('  보석   장인  ', 0), '보석 장인');
  assert.equal(normalizePlayerName('', 1), '플레이어 2');
  assert.equal(normalizePlayerName('가'.repeat(MAX_PLAYER_NAME_LENGTH + 5), 0).length, MAX_PLAYER_NAME_LENGTH);
  const state = createGame(3, fixedRandom, ['민지', '  준호  ', '']);
  assert.deepEqual(state.players.map((player) => player.name), ['민지', '준호', '플레이어 3']);
});

test('저장 슬롯은 세 개를 유지하고 기존 단일 저장을 1번 슬롯으로 옮긴다', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const legacy = createGame(2, fixedRandom, ['기존 1', '기존 2']);
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

  const migrated = loadSaveSlots(storage);
  assert.equal(migrated.length, MAX_SAVE_SLOTS);
  assert.equal(migrated[0].players[0].name, '기존 1');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.ok(storage.getItem(SAVE_SLOTS_KEY));

  const next = createGame(3, fixedRandom, ['하나', '둘', '셋']);
  const saved = writeSaveSlot(storage, migrated, 2, next);
  assert.equal(saved[2].players.length, 3);
  assert.equal(loadSaveSlots(storage)[2].players[2].name, '셋');
  assert.throws(() => writeSaveSlot(storage, emptySaveSlots(), 3, next), /올바른 저장 슬롯/);
});

test('2–4인 게임은 색상별 7개와 황금 5개, 인원수+1개의 귀족, 단계별 공개 카드 4장을 만든다', () => {
  for (const playerCount of [2, 3, 4]) {
    const state = createGame(playerCount, fixedRandom);
    assert.equal(state.players.length, playerCount);
    assert.equal(state.patrons.length, playerCount + 1);
    assert.deepEqual(COLORS.map((color) => state.supply[color]), [7, 7, 7, 7, 7]);
    assert.equal(state.supply.Gold, CONFIG.GOLD_TOKEN_COUNT);
    assert.deepEqual([1, 2, 3].map((tier) => state.market[tier].length), [4, 4, 4]);
  }
});

test('개발 카드 90장과 귀족 타일 10장이 지정된 단계·점수 분포를 정확히 따른다', () => {
  const expected = {
    1: { total: 40, points: { 0: 35, 1: 5 } },
    2: { total: 30, points: { 0: 10, 1: 5, 2: 10, 3: 5 } },
    3: { total: 20, points: { 3: 10, 4: 6, 5: 4 } },
  };

  assert.equal(CARDS.length, 90);
  assert.equal(new Set(CARDS.map((card) => card.id)).size, 90);
  assert.equal(PATRONS.length, 10);
  assert.equal(PATRONS.filter((patron) => {
    const requirements = Object.values(patron.requirements);
    return requirements.length === 3 && requirements.every((amount) => amount === 3);
  }).length, 5);
  assert.equal(PATRONS.filter((patron) => {
    const requirements = Object.values(patron.requirements);
    return requirements.length === 2 && requirements.every((amount) => amount === 4);
  }).length, 5);
  assert.deepEqual(
    [...COLORS, 'Gold'].map((color) => [RESOURCE_META[color].label, RESOURCE_META[color].tone]),
    [
      ['루비', '적색'],
      ['사파이어', '청색'],
      ['에메랄드', '녹색'],
      ['다이아몬드', '백색'],
      ['줄마노', '흑색'],
      ['황금', '조커'],
    ],
  );

  for (const [tier, distribution] of Object.entries(expected)) {
    const cards = CARDS.filter((card) => card.tier === Number(tier));
    assert.equal(cards.length, distribution.total);
    for (const [points, count] of Object.entries(distribution.points)) {
      assert.equal(cards.filter((card) => card.victoryPoints === Number(points)).length, count);
    }
  }
});

test('서로 다른 보석 3개를 가져오면 공급과 플레이어 보유량이 갱신된다', () => {
  const state = createGame(2, fixedRandom);
  takeDifferent(state, ['Ruby', 'Sapphire', 'Emerald']);
  assert.deepEqual(
    [state.players[0].tokens.Ruby, state.players[0].tokens.Sapphire, state.players[0].tokens.Emerald],
    [1, 1, 1],
  );
  assert.equal(state.supply.Ruby, 6);
  assert.equal(state.currentPlayerIndex, 1);
});

test('같은 보석 2개는 최소 잔여량 상수 경계에서만 허용된다', () => {
  assert.equal(CONFIG.MIN_SUPPLY_FOR_DOUBLE, 4);
  assert.equal(canTakeDouble({ Ruby: 4 }, 'Ruby'), true);
  assert.equal(canTakeDouble({ Ruby: 3 }, 'Ruby'), false);
  const state = createGame(2, fixedRandom);
  takeDouble(state, 'Diamond');
  assert.equal(state.players[0].tokens.Diamond, 2);
  assert.equal(state.supply.Diamond, 5);
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
