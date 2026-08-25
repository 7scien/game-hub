import {
  MAX_SAVE_SLOTS,
  SAVE_SLOTS_KEY,
  STORAGE_KEY,
} from './config.js';
import { isValidSavedGame } from './game.js';
import { CARDS } from './data/cards.js';
import { PATRONS } from './data/patrons.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function refreshPatrons(state) {
  const latestPatrons = new Map(PATRONS.map((patron) => [patron.id, patron]));
  const refreshPatron = (patron) => {
    const latest = latestPatrons.get(patron?.id);
    return latest ? { ...latest, requirements: { ...latest.requirements } } : patron;
  };
  state.patrons = Array.isArray(state.patrons) ? state.patrons.map(refreshPatron) : [];
  state.players.forEach((player) => {
    player.patrons = Array.isArray(player.patrons) ? player.patrons.map(refreshPatron) : [];
  });
  return state;
}

function refreshCards(state) {
  const latestCards = new Map(CARDS.map((card) => [card.id, card]));
  const refreshCard = (card) => {
    const latest = latestCards.get(card?.id);
    return latest ? { ...latest, cost: { ...latest.cost } } : card;
  };
  for (const tier of [1, 2, 3]) {
    state.decks[tier] = Array.isArray(state.decks[tier]) ? state.decks[tier].map(refreshCard) : [];
    state.market[tier] = Array.isArray(state.market[tier]) ? state.market[tier].map(refreshCard) : [];
  }
  state.players.forEach((player) => {
    player.purchased = Array.isArray(player.purchased) ? player.purchased.map(refreshCard) : [];
    player.reserved = Array.isArray(player.reserved) ? player.reserved.map(refreshCard) : [];
  });
  return state;
}

function refreshGameData(state) {
  return refreshCards(refreshPatrons(state));
}

export function emptySaveSlots() {
  return Array.from({ length: MAX_SAVE_SLOTS }, () => null);
}

export function normalizeSaveSlots(value) {
  const slots = emptySaveSlots();
  if (!Array.isArray(value)) return slots;
  for (let index = 0; index < MAX_SAVE_SLOTS; index += 1) {
    const candidate = value[index];
    if (isValidSavedGame(candidate)) slots[index] = refreshGameData(clone(candidate));
  }
  return slots;
}

export function loadSaveSlots(storage = globalThis.localStorage) {
  if (!storage) return emptySaveSlots();
  try {
    const saved = storage.getItem(SAVE_SLOTS_KEY);
    if (saved) return normalizeSaveSlots(JSON.parse(saved));

    const legacy = JSON.parse(storage.getItem(STORAGE_KEY));
    const slots = emptySaveSlots();
    if (isValidSavedGame(legacy)) {
      slots[0] = refreshGameData(clone(legacy));
      storage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
      storage.removeItem(STORAGE_KEY);
    }
    return slots;
  } catch {
    return emptySaveSlots();
  }
}

export function writeSaveSlot(storage, slots, slotIndex, state) {
  if (!storage || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_SAVE_SLOTS) {
    throw new Error('올바른 저장 슬롯을 선택하세요.');
  }
  if (!isValidSavedGame(state)) throw new Error('저장할 게임 상태가 올바르지 않습니다.');
  const nextSlots = normalizeSaveSlots(slots);
  const savedState = clone(state);
  savedState.updatedAt = Date.now();
  nextSlots[slotIndex] = savedState;
  storage.setItem(SAVE_SLOTS_KEY, JSON.stringify(nextSlots));
  storage.removeItem(STORAGE_KEY);
  return nextSlots;
}
