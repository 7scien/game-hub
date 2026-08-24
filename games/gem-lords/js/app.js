import {
  DEFAULT_GAME_TITLE,
  MAX_TITLE_LENGTH,
  STORAGE_KEY,
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
import { PATRONS } from './data/patrons.js';
import {
  closeModal,
  renderGame,
  renderStart,
  showGameOver,
  showHelp,
  showPatronChoice,
  showReturnTokens,
  showTitleEditor,
  showTurnOverlay,
  toast,
} from './ui.js';

let state = null;
let selection = null;
let returns = emptyResources();
let savedGame = loadSavedGame();
let gameTitle = loadGameTitle();
let titleHold = null;

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

function loadSavedGame() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!isValidSavedGame(parsed)) return null;
    const latestPatrons = new Map(PATRONS.map((patron) => [patron.id, patron]));
    const refreshPatron = (patron) => {
      const latest = latestPatrons.get(patron.id);
      return latest ? { ...latest, requirements: { ...latest.requirements } } : patron;
    };
    parsed.patrons = parsed.patrons.map(refreshPatron);
    parsed.players.forEach((player) => {
      player.patrons = player.patrons.map(refreshPatron);
    });
    return parsed;
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
    renderStart(Boolean(savedGame), !savedGame, gameTitle);
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
    renderStart(false, true, gameTitle);
    return;
  }
  if (action === 'back-to-save') return renderStart(true, false, gameTitle);
  if (action === 'open-help') return showHelp();
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
    savedGame = loadSavedGame();
    render();
  }
});

syncDocumentTitle();
render();
