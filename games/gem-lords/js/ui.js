import {
  ALL_RESOURCES,
  COLORS,
  CONFIG,
  RESOURCE_META,
  calculatePayment,
  canAffordCard,
  canTakeDouble,
  totalTokens,
} from './rules.js';

const app = document.querySelector('#app');
const modalRoot = () => document.querySelector('#modal-root');

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character]);

const titleMarkup = (title) => {
  const words = String(title).trim().split(/\s+/);
  const lastWord = words.pop() || '';
  const leadingWords = words.join(' ');
  return `${leadingWords ? `<span>${escapeHtml(leadingWords)}</span> ` : ''}<em>${escapeHtml(lastWord)}</em>`;
};

const WORKSHOP_NAMES = {
  Ruby: '홍염 대장간',
  Sapphire: '청람 세공소',
  Emerald: '녹음 공방',
  Diamond: '백야 보석원',
  Onyx: '흑요 상회',
};

const gem = (color, count, extra = '') => {
  const meta = RESOURCE_META[color];
  return `<span class="gem-chip ${meta.className} ${extra}" title="${meta.label} (${meta.tone})"><i aria-hidden="true">${meta.symbol}</i><b>${count}</b></span>`;
};

const requirementChips = (requirements) => Object.entries(requirements)
  .filter(([, amount]) => amount > 0)
  .map(([color, amount]) => gem(color, amount, 'tiny'))
  .join('');

export function renderStart(hasSave, choosingPlayers = !hasSave, gameTitle = '보석의 군주') {
  const safeTitle = escapeHtml(gameTitle);
  app.innerHTML = `
    <main class="start-screen" aria-labelledby="game-title">
      <div class="start-glow start-glow-one" aria-hidden="true"></div>
      <div class="start-glow start-glow-two" aria-hidden="true"></div>
      <section class="start-table">
        <div class="box-cover" aria-hidden="true">
          <div class="box-shine"></div>
          <div class="box-title"><span>찬란한 보석으로 왕국을 세워라</span><strong>${safeTitle}</strong><em>2–4인 전략 보드게임</em></div>
        </div>
        <div class="start-card">
          <p class="eyebrow">한 기기에서 즐기는 2–4인 보드게임</p>
          <div class="brand-mark" aria-hidden="true"><span>✦</span></div>
          <h1 id="game-title" class="editable-title" data-title-editor tabindex="0" role="button" aria-label="현재 제목 ${safeTitle}. 길게 눌러 제목 수정">${titleMarkup(gameTitle)}</h1>
          <p class="title-edit-hint">제목을 길게 눌러 이름 바꾸기</p>
          <p class="start-copy">묵직한 보석을 모으고 상단을 키워<br />왕국에서 가장 높은 명성을 차지하세요.</p>
          ${hasSave && !choosingPlayers ? `
            <div class="continue-actions">
              <button class="primary-start" type="button" data-action="continue-game">게임 계속하기</button>
              <button class="secondary-start" type="button" data-action="new-game-menu">새 게임</button>
            </div>
          ` : `
            <p class="picker-label">플레이어 수</p>
            <div class="player-picker" aria-label="플레이어 수 선택">
              ${[2, 3, 4].map((count) => `<button class="player-option ${count === 3 ? 'featured' : ''}" type="button" data-action="start-game" data-players="${count}"><strong>${count}</strong><span>명</span></button>`).join('')}
            </div>
            ${hasSave ? '<button class="text-button" type="button" data-action="back-to-save">저장된 게임으로 돌아가기</button>' : ''}
          `}
          <button class="how-button" type="button" data-action="open-help">?&nbsp;&nbsp;게임 방법</button>
        </div>
      </section>
      <p class="start-footnote">ORIGINAL LOCAL TABLETOP GAME</p>
    </main>
    <div id="modal-root"></div>
    <div id="toast-root" role="status" aria-live="polite"></div>`;
}

function scoreboard(state) {
  return state.players.map((player, index) => `
    <div class="score-card ${index === state.currentPlayerIndex ? 'active' : ''}">
      <div class="score-card-head"><span>${player.name}</span><strong>${player.score}<small> VP</small></strong></div>
      <div class="score-resources" aria-label="${player.name} 보유 보석">
        ${ALL_RESOURCES.map((color) => {
          const meta = RESOURCE_META[color];
          return `<span class="score-resource ${meta.className}" title="${meta.label} ${player.tokens[color]}개"><i aria-hidden="true">${meta.symbol}</i><b>${player.tokens[color]}</b></span>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function patronCard(patron, eligible = false) {
  return `
    <article class="patron-card ${eligible ? 'eligible' : ''}" data-patron-id="${patron.id}">
      <div class="patron-seal portrait-${patron.id}" aria-hidden="true"></div>
      <div><strong>${patron.name}</strong><div class="patron-cost">${requirementChips(patron.requirements)}</div></div>
      <span class="patron-points">+${patron.victoryPoints}<small>VP</small></span>
    </article>`;
}

function developmentCard(card, source, selected, player) {
  const affordable = canAffordCard(player, card);
  const bonusMeta = RESOURCE_META[card.permanentBonusColor];
  const sourceData = source.kind === 'market'
    ? `data-kind="market" data-tier="${source.tier}" data-index="${source.index}"`
    : `data-kind="reserved" data-index="${source.index}"`;
  const costs = COLORS.filter((color) => card.cost[color] > 0)
    .map((color) => gem(color, card.cost[color], 'cost-chip'))
    .join('');
  return `
    <button type="button" class="dev-card bonus-${bonusMeta.className} tier-card-${card.tier} ${selected ? 'selected' : ''} ${affordable ? 'affordable' : ''}"
      data-action="select-card" ${sourceData} aria-label="${card.tier}단계, ${card.victoryPoints}점, ${bonusMeta.label} 보너스 카드">
      <span class="card-top"><span class="card-vp">${card.victoryPoints || '·'}<small>명성</small></span>${gem(card.permanentBonusColor, '+1', 'bonus-gem')}</span>
      <span class="card-art" aria-hidden="true"><i></i><b>${WORKSHOP_NAMES[card.permanentBonusColor]}</b></span>
      <span class="card-meta"><em>${card.tier}단계</em><span class="card-costs">${costs}</span></span>
    </button>`;
}

function deckCard(tier, count, selected, canReserve) {
  return `
    <button type="button" class="deck-card tier-${tier} ${selected ? 'selected' : ''}" data-action="select-deck" data-tier="${tier}" ${count === 0 || !canReserve ? 'disabled' : ''}>
      <span>개발 카드</span><strong>${tier}</strong><small>${count}장</small><em>맨 위 카드 예약</em>
    </button>`;
}

function selectedActionPanel(state, selection) {
  const player = state.players[state.currentPlayerIndex];
  if (!selection) return '<div class="action-hint"><span>✦</span><p>보석이나 카드를 선택해<br />이번 턴의 행동을 정하세요.</p></div>';

  if (selection.kind === 'tokens') {
    const names = selection.colors.map((color) => RESOURCE_META[color].label).join(' · ') || '보석을 선택하세요';
    const validDifferent = selection.colors.length >= 1 && selection.colors.length <= 3
      && selection.colors.every((color) => state.supply[color] > 0);
    const doubleColor = selection.colors.length === 1 ? selection.colors[0] : null;
    return `
      <div class="action-panel">
        <div><span class="action-kicker">SELECTED GEMS</span><strong>${names}</strong></div>
        <div class="action-buttons">
          <button type="button" class="action-button" data-action="take-different" ${validDifferent ? '' : 'disabled'}>서로 다른 보석 받기 <small>${selection.colors.length}/3</small></button>
          <button type="button" class="action-button gold-action" data-action="take-double" ${doubleColor && canTakeDouble(state.supply, doubleColor) ? '' : 'disabled'}>같은 보석 2개 받기</button>
        </div>
      </div>`;
  }

  let card;
  if (selection.kind === 'market') card = state.market[selection.tier]?.[selection.index];
  if (selection.kind === 'reserved') card = player.reserved[selection.index];
  if (selection.kind === 'deck') {
    return `<div class="action-panel"><div><span class="action-kicker">${selection.tier}단계 카드 더미</span><strong>맨 위 카드를 비공개로 예약</strong></div><button type="button" class="action-button gold-action" data-action="reserve-selected" ${player.reserved.length >= CONFIG.MAX_RESERVED || state.decks[selection.tier].length === 0 ? 'disabled' : ''}>예약하기${state.supply.Gold ? ' · 황금 +1' : ''}</button></div>`;
  }
  if (!card) return '';
  const payment = calculatePayment(player, card);
  const paySummary = payment.goldNeeded ? `황금 ${payment.goldNeeded}개 대체` : '황금 없이 구매 가능';
  const bonusName = RESOURCE_META[card.permanentBonusColor].label;
  return `
    <div class="action-panel">
      <div><span class="action-kicker">${selection.kind === 'reserved' ? '예약 카드' : `${card.tier}단계 카드`}</span><strong>${bonusName} 보너스 · 명성 ${card.victoryPoints}점</strong><small>${payment.canAfford ? paySummary : '보석이 부족합니다'}</small></div>
      <div class="action-buttons">
        <button type="button" class="action-button" data-action="buy-selected" ${payment.canAfford ? '' : 'disabled'}>구매하기</button>
        ${selection.kind === 'market' ? `<button type="button" class="action-button gold-action" data-action="reserve-selected" ${player.reserved.length >= CONFIG.MAX_RESERVED ? 'disabled' : ''}>예약${state.supply.Gold ? ' · 황금 +1' : ''}</button>` : ''}
      </div>
    </div>`;
}

function tokenButton(color, count, selected, disabled) {
  const meta = RESOURCE_META[color];
  return `
    <button type="button" class="token-stack ${meta.className} ${selected ? 'selected' : ''}" data-action="select-token" data-color="${color}" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">
      <span class="token-face"><i aria-hidden="true">${meta.symbol}</i></span>
      <strong>${count}</strong><span class="resource-name"><b>${meta.label}</b><em>${meta.tone}</em></span>
    </button>`;
}

function bonusStrip(player) {
  return COLORS.map((color) => gem(color, player.bonuses[color], 'bonus-count')).join('');
}

export function renderGame(state, selection) {
  const player = state.players[state.currentPlayerIndex];
  const eligibleIds = new Set(state.patronChoices);
  app.innerHTML = `
    <div class="game-shell">
      <header class="game-header">
        <span class="hub-home-spacer" aria-hidden="true"></span>
        <div class="turn-heading"><span>${state.round}라운드 · ${state.turnNumber}번째 턴</span><strong>${player.name} <em>차례</em></strong></div>
        <div class="scoreboard">${scoreboard(state)}</div>
        <button class="icon-button" type="button" data-action="open-help" aria-label="게임 방법">?</button>
      </header>

      ${state.endGame.triggered && state.status === 'playing' ? '<div class="final-round-banner">FINAL ROUND · 이번 라운드가 끝나면 승자를 결정합니다</div>' : ''}

      <main class="board">
        <section class="patron-zone" aria-labelledby="patron-title">
          <div class="section-label"><span>왕실의 초대</span><h2 id="patron-title">귀족</h2></div>
          <div class="patron-list">${state.patrons.map((patron) => patronCard(patron, eligibleIds.has(patron.id))).join('') || '<p class="empty-message">모든 후원자가 주인을 찾았습니다.</p>'}</div>
        </section>

        <section class="market-zone" aria-label="개발 카드 시장">
          ${[3, 2, 1].map((tier) => `
            <div class="tier-row">
              <div class="tier-heading"><span>단계</span><strong>${tier}</strong></div>
              <div class="tier-cards">
                ${deckCard(tier, state.decks[tier].length, selection?.kind === 'deck' && selection.tier === tier, player.reserved.length < CONFIG.MAX_RESERVED)}
                ${state.market[tier].map((card, index) => developmentCard(card, { kind: 'market', tier, index }, selection?.kind === 'market' && selection.tier === tier && selection.index === index, player)).join('')}
                ${Array.from({ length: Math.max(0, CONFIG.MARKET_SIZE - state.market[tier].length) }, () => '<div class="empty-card"><span>EMPTY</span></div>').join('')}
              </div>
            </div>`).join('')}
        </section>

        <section class="player-dock">
          <div class="supply-panel">
            <div class="dock-title"><span>보석 공급처</span><small>황금은 예약으로만 획득</small></div>
            <div class="token-row">
              ${COLORS.map((color) => tokenButton(color, state.supply[color], selection?.kind === 'tokens' && selection.colors.includes(color), state.phase !== 'action' || state.supply[color] === 0)).join('')}
              ${tokenButton('Gold', state.supply.Gold, false, true)}
            </div>
          </div>

          <div class="player-panel">
            <div class="dock-title"><span>${player.name}의 금고</span><small>토큰 ${totalTokens(player.tokens)}/${CONFIG.TOKEN_LIMIT} · 카드 ${player.purchased.length}장</small></div>
            <div class="vault-grid">
              <div><label>보유 토큰</label><div class="mini-gems">${ALL_RESOURCES.map((color) => gem(color, player.tokens[color], 'vault-gem')).join('')}</div></div>
              <div><label>영구 보너스</label><div class="mini-gems">${bonusStrip(player)}</div></div>
            </div>
            <div class="reserved-zone">
              <label>예약 카드 <span>${player.reserved.length}/${CONFIG.MAX_RESERVED}</span></label>
              <div class="reserved-cards">${player.reserved.map((card, index) => developmentCard(card, { kind: 'reserved', index }, selection?.kind === 'reserved' && selection.index === index, player)).join('') || '<p>예약 카드가 없습니다.</p>'}</div>
            </div>
          </div>

          <div class="turn-action-area">${selectedActionPanel(state, selection)}</div>
        </section>
      </main>
      <div id="modal-root"></div>
      <div id="toast-root" role="status" aria-live="polite"></div>
    </div>`;
}

export function showHelp() {
  modalRoot().innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" data-modal-panel>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button>
        <p class="modal-kicker">QUICK GUIDE</p><h2 id="help-title">How to Play</h2>
        <div class="rule-grid">
          <article><b>01</b><div><h3>보석 가져오기</h3><p>서로 다른 색 1–3개 또는 공급처에 4개 이상 남은 한 색 2개를 받습니다.</p></div></article>
          <article><b>02</b><div><h3>카드 구매</h3><p>표시된 비용을 지불하면 카드의 점수와 영구 보너스를 얻습니다.</p></div></article>
          <article><b>03</b><div><h3>영구 할인</h3><p>보너스 1개마다 같은 색 카드 비용이 매번 1씩 줄어듭니다.</p></div></article>
          <article><b>04</b><div><h3>예약과 황금</h3><p>공개 카드나 덱 맨 위를 최대 3장 예약합니다. 남아 있다면 황금 1개도 받습니다.</p></div></article>
          <article><b>05</b><div><h3>귀족 타일</h3><p>개발 카드 보너스 조건을 충족하면 귀족을 얻습니다. 토큰은 계산하지 않습니다.</p></div></article>
          <article><b>06</b><div><h3>승리</h3><p>${CONFIG.TARGET_SCORE}점 도달 후 라운드를 마칩니다. 동점이면 구매 카드가 적은 플레이어가 앞섭니다.</p></div></article>
        </div>
        <button class="modal-primary" type="button" data-action="close-modal">시장으로 돌아가기</button>
      </section>
    </div>`;
}

export function showTitleEditor(currentTitle, maxLength) {
  modalRoot().innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal title-editor-modal" role="dialog" aria-modal="true" aria-labelledby="title-editor-heading" data-modal-panel>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button>
        <p class="modal-kicker">나만의 게임 이름</p>
        <h2 id="title-editor-heading">제목 수정</h2>
        <p class="modal-copy">이 기기에서 표시할 제목을 입력하세요. 언제든 기본 제목으로 되돌릴 수 있습니다.</p>
        <label class="title-input-label" for="custom-game-title">게임 제목</label>
        <input id="custom-game-title" class="title-input" data-title-input type="text" value="${escapeHtml(currentTitle)}" maxlength="${maxLength}" autocomplete="off" spellcheck="false" />
        <small class="title-limit">최대 ${maxLength}자</small>
        <div class="title-editor-actions">
          <button class="secondary-start" type="button" data-action="reset-title">기본 제목</button>
          <button class="modal-primary" type="button" data-action="save-title">저장</button>
        </div>
      </section>
    </div>`;
  window.requestAnimationFrame(() => {
    const input = document.querySelector('[data-title-input]');
    input?.focus();
    input?.select();
  });
}

export function closeModal() {
  const root = modalRoot();
  if (root) root.innerHTML = '';
}

export function showReturnTokens(state, returns) {
  const player = state.players[state.currentPlayerIndex];
  const excess = totalTokens(player.tokens) - CONFIG.TOKEN_LIMIT;
  const selectedCount = ALL_RESOURCES.reduce((sum, color) => sum + (returns[color] || 0), 0);
  modalRoot().innerHTML = `
    <div class="modal-backdrop locked">
      <section class="modal token-return-modal" role="dialog" aria-modal="true" aria-labelledby="return-title" data-modal-panel>
        <p class="modal-kicker">VAULT LIMIT</p><h2 id="return-title">토큰 ${excess}개를 반환하세요</h2>
        <p class="modal-copy">보유 한도는 ${CONFIG.TOKEN_LIMIT}개입니다. 반환할 토큰을 직접 선택하세요.</p>
        <div class="return-list">
          ${ALL_RESOURCES.filter((color) => player.tokens[color] > 0).map((color) => {
            const meta = RESOURCE_META[color];
            return `<div class="return-item ${meta.className}"><span class="return-gem">${meta.symbol}</span><div><strong>${meta.label}</strong><small>보유 ${player.tokens[color]}</small></div><div class="stepper"><button type="button" data-action="return-remove" data-color="${color}" ${returns[color] ? '' : 'disabled'}>−</button><b>${returns[color] || 0}</b><button type="button" data-action="return-add" data-color="${color}" ${(returns[color] || 0) < player.tokens[color] && selectedCount < excess ? '' : 'disabled'}>+</button></div></div>`;
          }).join('')}
        </div>
        <button class="modal-primary" type="button" data-action="confirm-return" ${selectedCount === excess ? '' : 'disabled'}>선택한 ${selectedCount}/${excess}개 반환</button>
      </section>
    </div>`;
}

export function showPatronChoice(state) {
  const choices = state.patrons.filter((patron) => state.patronChoices.includes(patron.id));
  modalRoot().innerHTML = `
    <div class="modal-backdrop locked">
      <section class="modal patron-modal" role="dialog" aria-modal="true" aria-labelledby="patron-choice-title" data-modal-panel>
        <p class="modal-kicker">왕실의 총애</p><h2 id="patron-choice-title">귀족 한 명을 선택하세요</h2>
        <p class="modal-copy">여러 조건을 동시에 달성했습니다. 이번 턴에는 한 명만 합류합니다.</p>
        <div class="patron-choice-list">${choices.map((patron) => `<button type="button" data-action="choose-patron" data-patron-id="${patron.id}">${patronCard(patron, true)}</button>`).join('')}</div>
      </section>
    </div>`;
}

export function showTurnOverlay(playerName) {
  const overlay = document.createElement('div');
  overlay.className = 'turn-overlay';
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `<div><span>PASS THE DEVICE</span><strong>${playerName}</strong><em>TURN</em><small>화면을 터치하면 바로 시작합니다</small></div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.append(overlay);
  return overlay;
}

export function showGameOver(state) {
  const ranked = state.result.rankedIds.map((id) => state.players.find((player) => player.id === id));
  const winners = state.result.winnerIds.map((id) => state.players.find((player) => player.id === id));
  modalRoot().innerHTML = `
    <div class="modal-backdrop locked victory-backdrop">
      <section class="modal victory-modal" role="dialog" aria-modal="true" aria-labelledby="victory-title" data-modal-panel>
        <div class="victory-gem" aria-hidden="true">✦</div><p class="modal-kicker">MARKET LEGACY SEALED</p>
        <h2 id="victory-title">${winners.length > 1 ? '공동 승리!' : `${winners[0].name} 승리!`}</h2>
        <p class="victory-score">${winners[0].score}<small> VICTORY POINTS</small></p>
        <ol class="ranking">${ranked.map((player, index) => `<li class="${state.result.winnerIds.includes(player.id) ? 'winner' : ''}"><b>${index + 1}</b><span>${player.name}</span><strong>${player.score} VP</strong><small>${player.purchased.length} cards</small></li>`).join('')}</ol>
        <p class="tie-note">동점은 구매한 개발 카드가 더 적은 플레이어가 우선합니다.</p>
        <button class="modal-primary" type="button" data-action="new-game-menu">새 게임</button>
      </section>
    </div>`;
}

export function toast(message) {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  root.innerHTML = `<div class="toast">${message}</div>`;
  window.setTimeout(() => { if (root) root.innerHTML = ''; }, 2600);
}
