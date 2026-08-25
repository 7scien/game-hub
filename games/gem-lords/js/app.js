import {
  DEFAULT_GAME_TITLE,
  MAX_TITLE_LENGTH,
  TITLE_STORAGE_KEY,
  normalizeGameTitle,
} from './config.js';
import {
  choosePatron,
  createGame,
  isValidSavedGame,
  purchaseCard,
  reserveCard,
  returnTokens,
  takeDifferent,
  takeDouble,
} from './game.js';
import { CONFIG, emptyResources } from './rules.js';
import { loadSaveSlots, writeSaveSlot } from './storage.js';
import {
  animatePurchasedCard,
  animateTakenTokens,
  closeModal,
  renderGame,
  renderStart,
  showExitPrompt,
  showGameOver,
  showHelp,
  showPatronChoice,
  showReturnTokens,
  showSaveSlotPicker,
  showTitleEditor,
  showTurnOverlay,
  toast,
} from './ui.js';

let state = null;
let selection = null;
let returns = emptyResources();
let saveSlots = loadSaveSlots();
let activeSlotIndex = null;
let startView = saveSlots.some(Boolean) ? 'saves' : 'players';
let pendingPlayerCount = null;
let gameTitle = loadGameTitle();
let titleHold = null;
let actionInProgress = false;

const TITLE_HOLD_MS = 680;
const TITLE_MOVE_TOLERANCE = 12;

function loadGameTitle() {
  try {
    return normalizeGameTitle(localStorage.getItem(TITLE_STORAGE_KEY) || DEFAULT_GAME_TITLE);
  } catch {
    return DEFAULT_GAME_TITLE;
  }
}

function syncDocumentTitle() {
  document.title = `${gameTitle} — 로컬 전략 보드게임`;
}

function saveCustomTitle(value) {
  gameTitle = normalizeGameTitle(value);
  localStorage.setItem(TITLE_STORAGE_KEY, gameTitle);
  syncDocumentTitle();
}

function resetCustomTitle() {
  gameTitle = DEFAULT_GAME_TITLE;
  localStorage.removeItem(TITLE_STORAGE_KEY);
  syncDocumentTitle();
}

function render() {
  if (!state) {
    renderStart(saveSlots, { view: startView, playerCount: pendingPlayerCount }, gameTitle);
    return;
  }
  renderGame(state, selection);
  if (state.phase === 'returnTokens') showReturnTokens(state, returns);
  if (state.phase === 'choosePatron') showPatronChoice(state);
  if (state.status === 'finished') showGameOver(state);
}

function beginNewGame(playerCount, playerNames) {
  state = createGame(playerCount, Math.random, playerNames);
  activeSlotIndex = null;
  pendingPlayerCount = null;
  selection = null;
  returns = emptyResources();
  render();
  const overlay = showTurnOverlay(state.players[0].name);
  window.setTimeout(() => overlay.remove(), CONFIG.TURN_TRANSITION_MS);
}

function selectedBonusColor() {
  if (selection?.kind === 'market') return state.market[selection.tier]?.[selection.index]?.permanentBonusColor;
  if (selection?.kind === 'reserved') return state.players[state.currentPlayerIndex].reserved[selection.index]?.permanentBonusColor;
  return null;
}

async function executeAction(action, { animatePurchase = false, tokenColors = [] } = {}) {
  if (actionInProgress) return;
  const previousPlayer = state.currentPlayerIndex;
  const bonusColor = animatePurchase ? selectedBonusColor() : null;
  actionInProgress = true;
  try {
    action();
    if (bonusColor) await animatePurchasedCard(bonusColor);
    else if (tokenColors.length) await animateTakenTokens(tokenColors);
    selection = null;
    returns = emptyResources();
    render();
    if (state.status === 'playing' && state.phase === 'action' && previousPlayer !== state.currentPlayerIndex) {
      const overlay = showTurnOverlay(state.players[state.currentPlayerIndex].name);
      window.setTimeout(() => overlay.remove(), CONFIG.TURN_TRANSITION_MS);
    }
  } catch (error) {
    toast(error.message || '행동을 완료하지 못했습니다.');
  } finally {
    actionInProgress = false;
  }
}

function leaveGame() {
  state = null;
  activeSlotIndex = null;
  selection = null;
  returns = emptyResources();
  pendingPlayerCount = null;
  startView = saveSlots.some(Boolean) ? 'saves' : 'players';
  render();
}

function sourceFromSelection() {
  if (!selection || !['market', 'reserved', 'deck'].includes(selection.kind)) throw new Error('카드나 덱을 먼저 선택하세요.');
  return selection;
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (actionInProgress) return;

  if (action === 'choose-player-count') {
    pendingPlayerCount = Number(target.dataset.players);
    startView = 'names';
    return render();
  }
  if (action === 'start-game') {
    const playerCount = Number(target.dataset.players);
    const playerNames = Array.from(document.querySelectorAll('[data-player-name]'))
      .slice(0, playerCount)
      .map((input) => input.value);
    return beginNewGame(playerCount, playerNames);
  }
  if (action === 'continue-slot') {
    const slotIndex = Number(target.dataset.slot);
    if (!isValidSavedGame(saveSlots[slotIndex])) return toast('이 저장 슬롯은 비어 있습니다.');
    state = JSON.parse(JSON.stringify(saveSlots[slotIndex]));
    activeSlotIndex = slotIndex;
    selection = null;
    returns = emptyResources();
    render();
    return;
  }
  if (action === 'new-game-menu') {
    state = null;
    activeSlotIndex = null;
    pendingPlayerCount = null;
    startView = 'players';
    return render();
  }
  if (action === 'back-to-saves') {
    pendingPlayerCount = null;
    startView = 'saves';
    return render();
  }
  if (action === 'back-to-player-count') {
    pendingPlayerCount = null;
    startView = 'players';
    return render();
  }
  if (action === 'open-help') return showHelp();
  if (action === 'open-exit') return showExitPrompt();
  if (action === 'open-save-slots') return showSaveSlotPicker(saveSlots, activeSlotIndex);
  if (action === 'save-to-slot') {
    const slotIndex = Number(target.dataset.slot);
    try {
      saveSlots = writeSaveSlot(localStorage, saveSlots, slotIndex, state);
      leaveGame();
      return toast(`${slotIndex + 1}번 슬롯에 저장했습니다.`);
    } catch (error) {
      return toast(error.message || '게임을 저장하지 못했습니다.');
    }
  }
  if (action === 'exit-without-save') {
    leaveGame();
    return toast('이번 진행 내용은 저장하지 않았습니다.');
  }
  if (action === 'save-title') {
    const input = document.querySelector('[data-title-input]');
    saveCustomTitle(input?.value);
    closeModal();
    render();
    return toast('게임 제목을 저장했습니다.');
  }
  if (action === 'reset-title') {
    resetCustomTitle();
    closeModal();
    render();
    return toast('기본 제목으로 되돌렸습니다.');
  }
  if (action === 'close-modal') {
    if (target.classList.contains('modal-backdrop') && event.target.closest('[data-modal-panel]')) return;
    return closeModal();
  }
  if (!state || state.status !== 'playing') return;

  if (action === 'select-token') {
    if (state.phase !== 'action') return;
    const color = target.dataset.color;
    const colors = selection?.kind === 'tokens' ? [...selection.colors] : [];
    const index = colors.indexOf(color);
    if (index >= 0) colors.splice(index, 1);
    else if (colors.length < 3) colors.push(color);
    selection = colors.length ? { kind: 'tokens', colors } : null;
    render();
    return;
  }

  if (action === 'select-card') {
    const next = target.dataset.kind === 'market'
      ? { kind: 'market', tier: Number(target.dataset.tier), index: Number(target.dataset.index) }
      : { kind: 'reserved', index: Number(target.dataset.index) };
    selection = JSON.stringify(selection) === JSON.stringify(next) ? null : next;
    render();
    return;
  }

  if (action === 'select-deck') {
    const next = { kind: 'deck', tier: Number(target.dataset.tier) };
    selection = selection?.kind === 'deck' && selection.tier === next.tier ? null : next;
    render();
    return;
  }

  if (action === 'take-different') {
    const tokenColors = [...(selection?.colors || [])];
    return executeAction(() => takeDifferent(state, tokenColors), { tokenColors });
  }
  if (action === 'take-double') {
    const color = selection?.colors?.[0];
    return executeAction(() => takeDouble(state, color), { tokenColors: color ? [color, color] : [] });
  }
  if (action === 'buy-selected') return executeAction(
    () => purchaseCard(state, sourceFromSelection()),
    { animatePurchase: true },
  );
  if (action === 'reserve-selected') return executeAction(() => reserveCard(state, sourceFromSelection()));

  if (action === 'return-add' || action === 'return-remove') {
    const color = target.dataset.color;
    returns[color] = Math.max(0, returns[color] + (action === 'return-add' ? 1 : -1));
    showReturnTokens(state, returns);
    return;
  }
  if (action === 'confirm-return') return executeAction(() => returnTokens(state, returns));
  if (action === 'choose-patron') return executeAction(() => choosePatron(state, target.dataset.patronId));
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('[data-title-editor]')) {
    event.preventDefault();
    showTitleEditor(gameTitle, MAX_TITLE_LENGTH);
    return;
  }
  if (event.key === 'Enter' && event.target.matches?.('[data-title-input]')) {
    event.preventDefault();
    saveCustomTitle(event.target.value);
    closeModal();
    render();
    toast('게임 제목을 저장했습니다.');
    return;
  }
  if (event.key === 'Enter' && event.target.matches?.('[data-player-name]')) {
    event.preventDefault();
    document.querySelector('[data-action="start-game"]')?.click();
    return;
  }
  if (event.key === 'Escape' && document.querySelector('.modal-backdrop:not(.locked)')) closeModal();
});

function cancelTitleHold() {
  if (!titleHold) return;
  window.clearTimeout(titleHold.timer);
  titleHold.element.classList.remove('holding');
  titleHold = null;
}

document.addEventListener('pointerdown', (event) => {
  const title = event.target.closest?.('[data-title-editor]');
  if (!title || event.button > 0) return;
  cancelTitleHold();
  title.classList.add('holding');
  titleHold = {
    element: title,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    timer: window.setTimeout(() => {
      title.classList.remove('holding');
      titleHold = null;
      navigator.vibrate?.(25);
      showTitleEditor(gameTitle, MAX_TITLE_LENGTH);
    }, TITLE_HOLD_MS),
  };
});

document.addEventListener('pointermove', (event) => {
  if (!titleHold || event.pointerId !== titleHold.pointerId) return;
  if (Math.hypot(event.clientX - titleHold.startX, event.clientY - titleHold.startY) > TITLE_MOVE_TOLERANCE) cancelTitleHold();
});

document.addEventListener('pointerup', cancelTitleHold);
document.addEventListener('pointercancel', cancelTitleHold);
document.addEventListener('contextmenu', (event) => {
  if (event.target.closest?.('[data-title-editor]')) event.preventDefault();
});

window.addEventListener('storage', () => {
  gameTitle = loadGameTitle();
  syncDocumentTitle();
  if (!state) {
    saveSlots = loadSaveSlots();
    if (startView === 'saves' && !saveSlots.some(Boolean)) startView = 'players';
    render();
  }
});

syncDocumentTitle();
render();
