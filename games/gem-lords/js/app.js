import { STORAGE_KEY } from './config.js';
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
import {
  closeModal,
  renderGame,
  renderStart,
  showGameOver,
  showHelp,
  showPatronChoice,
  showReturnTokens,
  showTurnOverlay,
  toast,
} from './ui.js';

let state = null;
let selection = null;
let returns = emptyResources();
let savedGame = loadSavedGame();

function loadSavedGame() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isValidSavedGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveGame() {
  if (!state) return;
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  savedGame = state;
}

function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
  savedGame = null;
}

function render() {
  if (!state) {
    renderStart(Boolean(savedGame));
    return;
  }
  renderGame(state, selection);
  if (state.phase === 'returnTokens') showReturnTokens(state, returns);
  if (state.phase === 'choosePatron') showPatronChoice(state);
  if (state.status === 'finished') showGameOver(state);
}

function beginNewGame(playerCount) {
  clearSave();
  state = createGame(playerCount);
  selection = null;
  returns = emptyResources();
  saveGame();
  render();
  const overlay = showTurnOverlay(state.players[0].name);
  window.setTimeout(() => overlay.remove(), CONFIG.TURN_TRANSITION_MS);
}

function executeAction(action) {
  const previousPlayer = state.currentPlayerIndex;
  try {
    action();
    selection = null;
    returns = emptyResources();
    saveGame();
    render();
    if (state.status === 'playing' && state.phase === 'action' && previousPlayer !== state.currentPlayerIndex) {
      const overlay = showTurnOverlay(state.players[state.currentPlayerIndex].name);
      window.setTimeout(() => overlay.remove(), CONFIG.TURN_TRANSITION_MS);
    }
  } catch (error) {
    toast(error.message || '행동을 완료하지 못했습니다.');
  }
}

function sourceFromSelection() {
  if (!selection || !['market', 'reserved', 'deck'].includes(selection.kind)) throw new Error('카드나 덱을 먼저 선택하세요.');
  return selection;
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'start-game') return beginNewGame(Number(target.dataset.players));
  if (action === 'continue-game') {
    state = savedGame;
    selection = null;
    returns = emptyResources();
    render();
    return;
  }
  if (action === 'new-game-menu') {
    state = null;
    clearSave();
    renderStart(false, true);
    return;
  }
  if (action === 'back-to-save') return renderStart(true, false);
  if (action === 'open-help') return showHelp();
  if (action === 'close-modal') {
    if (event.target.closest('[data-modal-panel]') && !target.classList.contains('modal-close') && !target.classList.contains('modal-primary')) return;
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

  if (action === 'take-different') return executeAction(() => takeDifferent(state, selection?.colors || []));
  if (action === 'take-double') return executeAction(() => takeDouble(state, selection?.colors?.[0]));
  if (action === 'buy-selected') return executeAction(() => purchaseCard(state, sourceFromSelection()));
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
  if (event.key === 'Escape' && state?.phase === 'action') closeModal();
});

window.addEventListener('storage', () => {
  if (!state) {
    savedGame = loadSavedGame();
    render();
  }
});

render();
