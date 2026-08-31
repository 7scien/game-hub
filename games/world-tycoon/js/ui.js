import {boardPosition,createBoard} from './board.js';
import {SPECIAL_CARD_INFO,getCurrentPlayer,getNetWorth,getTradeableAssets} from './game.js';
import {PHASES,RULES,formatMoney,regionMeta} from './rules.js';

const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const phaseLabel={
  [PHASES.WAITING_FOR_ROLL]:'주사위를 굴릴 차례',[PHASES.ROLLING]:'주사위 굴리는 중',[PHASES.MOVING]:'이동 중',[PHASES.RESOLVING_TILE]:'도착지 확인 중',
  [PHASES.BUY_DECISION]:'인수 결정',[PHASES.BUILD_DECISION]:'도시 개발',[PHASES.TRAVEL_DECISION]:'게임판에서 목적지 선택',[PHASES.WORLD_CUP_DECISION]:'월드컵 개최 도시 선택',[PHASES.PAYMENT_DECISION]:'통행료 지불 방법 선택',[PHASES.TRADE]:'플레이어 거래',[PHASES.ASSET_MANAGEMENT]:'자산 정리',[PHASES.END_TURN]:'턴 마무리',[PHASES.GAME_OVER]:'게임 종료',
};

function tilePrice(tile){return tile.purchasePrice?formatMoney(tile.purchasePrice):tile.type==='event'?'KEY CARD':tile.type==='tax'?`−${formatMoney(tile.amount)}`:tile.type.toUpperCase()}
function buildingLabel(tile,level=tile?.buildingLevel??0){const landmark=tile?.landmarkName||'대표 랜드마크';return ['땅',`${landmark} 기초`,`${landmark} 건설 중`,`${landmark} 1동`,`${landmark} 2동`][level]??'땅'}
function buildingMarkup(tile){
  if(tile.type!=='city'||!tile.ownerId)return '';
  const label=buildingLabel(tile);
  if(tile.buildingLevel===0)return '<span class="tile-building-label land-label">땅</span>';
  const landmarkCount=tile.buildingLevel===RULES.MAX_BUILDING_LEVEL?2:1;const glyph=escapeHtml(tile.landmarkGlyph||'▥');
  const stage=tile.buildingLevel===1?'기초':tile.buildingLevel===2?'건설 중':tile.buildingLevel===3?'1동':'2동';return `<span class="city-landmark landmark-stage-${tile.buildingLevel}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${`<b>${glyph}</b>`.repeat(landmarkCount)}</span><span class="tile-building-label">${escapeHtml(tile.landmarkShort||tile.landmarkName)} ${stage}</span>`;
}
function tokenMarkup(players,index){
  return `<span class="tile-tokens">${players.filter(player=>!player.bankrupt&&player.position===index).map((player,tokenIndex)=>`<i class="player-token token-${tokenIndex}" data-player-token="${player.id}" style="--token:${player.color}" title="${escapeHtml(player.name)}"><b>${player.token}</b></i>`).join('')}</span>`;
}
function tileArtwork(tile){
  return tile.imageKey?`<span class="tile-art tile-art-${tile.imageKey}" role="img" aria-label="${escapeHtml(tile.name)} 그림"></span>`:`<b class="tile-icon" aria-hidden="true">${tile.icon}</b>`;
}
function tileSide(index){
  if([0,10,20,30].includes(index))return 'corner';
  if(index<10)return 'bottom';if(index<20)return 'left';if(index<30)return 'top';return 'right';
}
function boardMarkup(state){
  const board=state?.board??createBoard();const players=state?.players??[];
  return `<div class="board-grid">${board.map((tile,index)=>{
    const position=boardPosition(index);const region=regionMeta(tile.region);const owner=state?.players.find(player=>player.id===tile.ownerId);
    const side=tileSide(index);const travelTarget=state?.phase===PHASES.TRAVEL_DECISION&&tile.type==='city';
    return `<article class="board-tile tile-${tile.type} side-${side}${side==='corner'?' corner':''}${tile.buildingLevel===RULES.MAX_BUILDING_LEVEL?' landmark':''}${tile.worldCupTurns>0?' world-cup-host':''}${travelTarget?' travel-target':''}" data-tile-index="${index}"${travelTarget?` data-action="choose-space-destination" data-destination-index="${index}" role="button" tabindex="0"`:''} style="--row:${position.row};--column:${position.column};--region:${region.color};--band:${tile.bandColor||'transparent'};--owner:${owner?.color||'transparent'}" aria-label="${escapeHtml(tile.name)}${owner?`, ${owner.name} 소유`:''}${tile.worldCupTurns>0?`, 월드컵 통행료 2배 ${tile.worldCupTurns}차례`:''}${travelTarget?', 우주여행 목적지로 선택':''}">
      ${tile.bandColor?'<span class="tile-band"></span>':''}<span class="owner-strip"></span>${buildingMarkup(tile)}${tile.worldCupTurns>0?`<span class="world-cup-badge" title="월드컵 통행료 2배 · ${tile.worldCupTurns}차례 남음">⚽ ×2</span>`:''}<span class="tile-face">${tileArtwork(tile)}<strong>${escapeHtml(tile.name)}</strong><span class="tile-en">${escapeHtml(tile.englishName)}</span><small>${tilePrice(tile)}</small></span>${tokenMarkup(players,index)}
    </article>`;
  }).join('')}
    <div class="board-center">
      <span class="center-card-deck" role="img" aria-label="가운데에 쌓아 둔 황금열쇠 카드 ${state?Math.max(0,state.eventDeck.length-state.eventCursor):30}장">
        <i class="deck-card deck-card-back"></i><i class="deck-card deck-card-middle"></i><span class="deck-card deck-card-top"><b>◆</b><strong>황금열쇠</strong><small>GOLDEN KEY</small></span><em>${state?Math.max(0,state.eventDeck.length-state.eventCursor):30}장</em>
      </span>
      <span class="center-station" aria-hidden="true"><i></i><b>✦</b></span>
      <h1>WORLD<br><em>TYCOON</em></h1>
      <div class="route-orbit" aria-hidden="true"><i></i><i></i><i></i><span>✈</span></div>
      ${state?centerStatus(state):'<p class="board-tagline">세계를 돌며 도시의 가치를 키우세요</p>'}
    </div>
  </div>`;
}

function centerStatus(state){
  const player=getCurrentPlayer(state);
  return `<div class="center-status"><span style="--token:${player.color}"><i>${player.token}</i>${escapeHtml(player.name)}</span><b>${phaseLabel[state.phase]}</b><small>TURN ${state.turnNumber}</small></div>`;
}

function modeLabel(mode){return mode==='full'?'완전 게임':`${mode}분 모드`}
function timerLabel(state){
  if(state.timer.remainingSeconds===null)return '∞';const seconds=Math.max(0,state.timer.remainingSeconds);const minutes=Math.floor(seconds/60);return `${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

function previewLayout(sidebar){return `<main class="game-layout preview-mode"><section class="board-panel" aria-label="World Tycoon 게임 보드">${boardMarkup(null)}</section>${sidebar}</main><div id="modal-root"></div>`}

export function renderStart(root,{savedGame=null,setup=false,playerCount=2}={}){
  if(savedGame&&!setup){
    root.innerHTML=previewLayout(`<aside class="control-panel setup-card continue-card"><p class="eyebrow">SAVED JOURNEY</p><h2>여행을<br>계속할까요?</h2><div class="save-summary"><span>TURN ${savedGame.turnNumber}</span><b>${escapeHtml(savedGame.players[savedGame.currentPlayerIndex].name)} 차례</b><small>${savedGame.players.length}명 · ${modeLabel(savedGame.mode)} · ${timerLabel(savedGame)}</small></div><button class="primary-button" type="button" data-action="continue-game">Continue Game <span>→</span></button><button class="secondary-button wide" type="button" data-action="new-game">New Game</button><button class="text-button" type="button" data-action="open-help">? 게임 방법</button></aside>`);return;
  }
  root.innerHTML=previewLayout(`<aside class="control-panel setup-card"><p class="eyebrow">PASS &amp; PLAY · 2–4 PLAYERS</p><h2>새로운 여행을<br>시작할까요?</h2><p class="setup-copy">한 기기에서 번갈아 주사위를 굴리고, 세계 도시와 교통 시설에 투자하세요.</p>
    <form data-setup-form><fieldset><legend>플레이 인원</legend><div class="choice-row">${[2,3,4].map(count=>`<button class="choice ${count===playerCount?'active':''}" type="button" data-action="choose-player-count" data-players="${count}"><b>${count}</b><span>명</span></button>`).join('')}</div></fieldset>
    <fieldset class="name-fields"><legend>플레이어 이름</legend>${[0,1,2,3].map(index=>`<label class="name-field ${index>=playerCount?'hidden':''}" data-name-field="${index}"><i style="--player-color:${['#ff5d7d','#4ed6ff','#ffd65a','#8c7bff'][index]}"></i><input name="player-${index}" maxlength="12" value="플레이어 ${index+1}" aria-label="플레이어 ${index+1} 이름"></label>`).join('')}</fieldset>
    <fieldset><legend>게임 모드</legend><div class="mode-grid">${[['full','완전 게임','마지막 1명까지'],['30','30분','빠른 여행'],['45','45분','균형 잡힌 게임'],['60','60분','여유로운 투자']].map(([value,label,copy],index)=>`<label class="mode-option"><input type="radio" name="mode" value="${value}" ${index===1?'checked':''}><span><b>${label}</b><small>${copy}</small></span></label>`).join('')}</div></fieldset>
    <button class="primary-button" type="submit">게임 시작 <span>→</span></button></form><button class="text-button" type="button" data-action="open-help">? 게임 방법</button></aside>`);
}

function die(value){
  const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]}[value];
  return `<span class="die" aria-label="주사위 ${value}">${Array.from({length:9},(_,index)=>`<i class="${dots.includes(index+1)?'on':''}"></i>`).join('')}</span>`;
}

function playerStrip(state){
  return `<section class="player-strip" aria-label="플레이어 현황">${state.players.map((player,index)=>`<article class="player-mini ${index===state.currentPlayerIndex?'current':''} ${player.bankrupt?'bankrupt':''}" style="--player-color:${player.color}"><i>${player.token}</i><span><b>${escapeHtml(player.name)}</b><small>${player.bankrupt?'파산':`${formatMoney(player.money)} · 자산 ${formatMoney(getNetWorth(state,player.id))}`}</small></span></article>`).join('')}</section>`;
}

function decisionPanel(state){
  const player=getCurrentPlayer(state);const tile=state.pendingAction?state.board[state.pendingAction.tileIndex]:state.board[player.position];
  if(state.phase===PHASES.WAITING_FOR_ROLL){
    if(player.skipTurns>0&&state.board[player.position]?.id==='deserted-island'){const hasEscape=player.specialCards.includes('island-escape');return `<div class="action-copy island-turn"><span class="action-kicker warning">DESERTED ISLAND</span><h3>더블이면 즉시 탈출!</h3><p>더블이나 무인도 탈출권을 사용할 때까지 이곳에 머뭅니다.</p></div><div class="dice-row">${die(state.dice[0])}${die(state.dice[1])}<b>${state.rollTotal||'?'}</b></div><button class="roll-button" type="button" data-action="roll-dice">탈출 주사위 굴리기 <span>🎲</span></button>${hasEscape?'<button class="secondary-button wide card-use-button" type="button" data-action="use-special-card" data-card="island-escape">무인도 탈출권 사용</button>':''}`}
    return `<div class="action-copy"><span class="action-kicker">READY TO GO</span><h3>주사위를 굴리세요</h3><p>두 주사위의 합만큼 세계를 여행합니다.</p></div><div class="dice-row">${die(state.dice[0])}${die(state.dice[1])}<b>${state.rollTotal||'?'}</b></div><button class="roll-button" type="button" data-action="roll-dice">주사위 굴리기 <span>🎲</span></button><button class="secondary-button wide" type="button" data-action="open-trade">거래하기</button>`;
  }
  if(state.phase===PHASES.ROLLING||state.phase===PHASES.MOVING||state.phase===PHASES.RESOLVING_TILE)return `<div class="rolling-state"><div class="dice-row rolling">${die(state.dice[0])}${die(state.dice[1])}</div><h3>${state.phase===PHASES.ROLLING?'주사위가 구르는 중…':'여행 중…'}</h3><p>도착지의 새로운 기회를 확인하고 있어요.</p></div>`;
  if(state.phase===PHASES.BUY_DECISION)return `<div class="asset-decision" style="--region:${regionMeta(tile.region).color}"><span class="decision-icon">${tile.icon}</span><p>${tile.type==='city'?regionMeta(tile.region).name:'특별 시설'}</p><h3>${escapeHtml(tile.name)}</h3><dl><div><dt>인수 가격</dt><dd>${formatMoney(tile.purchasePrice)}</dd></div><div><dt>기본 통행료</dt><dd>${formatMoney(tile.baseRent)}</dd></div></dl><button class="primary-button" type="button" data-action="buy-tile" ${player.money<tile.purchasePrice?'disabled':''}>인수하기 <span>−${formatMoney(tile.purchasePrice)}</span></button><button class="secondary-button wide" type="button" data-action="decline-decision">이번에는 지나가기</button></div>`;
  if(state.phase===PHASES.BUILD_DECISION){
    const maxed=tile.buildingLevel>=RULES.MAX_BUILDING_LEVEL;const cost=maxed?0:tile.buildingCosts[tile.buildingLevel];
    return `<div class="asset-decision build" style="--region:${regionMeta(tile.region).color}"><span class="decision-icon">${maxed?'★':escapeHtml(tile.landmarkGlyph||'▥')}</span><p>${regionMeta(tile.region).name} · ${escapeHtml(buildingLabel(tile))}</p><h3>${escapeHtml(tile.name)} 개발</h3>${maxed?`<div class="landmark-complete">${escapeHtml(tile.landmarkName)} 2동 완성</div>`:`<dl><div><dt>건설 비용</dt><dd>${formatMoney(cost)}</dd></div><div><dt>다음 통행료</dt><dd>${formatMoney(tile.rentByLevel[tile.buildingLevel+1])}</dd></div></dl><button class="primary-button" type="button" data-action="build-tile" ${player.money<cost?'disabled':''}>${escapeHtml(buildingLabel(tile,tile.buildingLevel+1))} <span>−${formatMoney(cost)}</span></button>`}<button class="secondary-button wide" type="button" data-action="decline-decision">건설하지 않기</button></div>`;
  }
  if(state.phase===PHASES.TRAVEL_DECISION){
    return `<div class="travel-decision"><span class="action-kicker">SPACE TRAVEL</span><h3>게임판에서 도시를 누르세요</h3><p>노란빛으로 표시된 도시를 직접 누르면 즉시 이동하고 도착 효과를 적용합니다.</p><div class="travel-board-hint"><i>✦</i><span>목적지 도시 선택 대기 중</span></div></div>`;
  }
  if(state.phase===PHASES.WORLD_CUP_DECISION){const cities=state.board.filter(item=>item.type==='city'&&item.ownerId===player.id);return `<div class="world-cup-decision"><span class="action-kicker">WORLD CUP</span><h3>개최 도시를 선택하세요</h3><p>선택한 도시의 통행료가 다음 자신의 3번 차례 동안 2배가 됩니다.</p><div class="world-cup-city-list">${cities.map(item=>`<button type="button" data-action="choose-world-cup-city" data-tile="${item.id}"><i>${escapeHtml(item.landmarkGlyph||'▥')}</i><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.landmarkName||'대표 랜드마크')}</small></span><strong>선택</strong></button>`).join('')}</div></div>`}
  if(state.phase===PHASES.PAYMENT_DECISION){const debt=state.pendingDebt;return `<div class="debt-panel payment-choice"><span class="action-kicker warning">TOLL PAYMENT</span><h3>${escapeHtml(debt.reason)}</h3><p class="debt-total">${formatMoney(debt.amount)} <small>우대권을 사용할지 직접 선택하세요.</small></p><button class="primary-button" type="button" data-action="use-special-card" data-card="toll-waiver">우대권 사용 <span>◇</span></button><button class="secondary-button wide" type="button" data-action="settle-debt">${player.money>=debt.amount?'현금으로 지불':'우대권 없이 자산 정리'}</button></div>`}
  if(state.phase===PHASES.ASSET_MANAGEMENT)return debtPanel(state);
  if(state.phase===PHASES.END_TURN)return `<div class="action-copy end-turn"><span class="action-kicker">TURN COMPLETE</span><h3>턴을 마칩니다</h3><p>${state.rolledDouble?'더블이면 한 번 더 여행할 수 있어요.':'다음 차례로 바로 이어집니다.'}</p></div><div class="dice-row">${die(state.dice[0])}${die(state.dice[1])}<b>${state.rollTotal||'—'}</b></div><button class="primary-button" type="button" data-action="end-turn">턴 종료 <span>→</span></button>`;
  return `<div class="rolling-state"><h3>${phaseLabel[state.phase]}</h3></div>`;
}

function debtPanel(state){
  const player=getCurrentPlayer(state);const debt=state.pendingDebt;const assets=state.board.filter(tile=>tile.ownerId===player.id);const cards=player.specialCards||[];
  const assetRows=assets.map(tile=>`<article><span><b>${escapeHtml(tile.name)}</b><small>${tile.type==='city'?escapeHtml(buildingLabel(tile)):'탈것'}</small></span><span>${tile.buildingLevel>0?`<button type="button" data-action="sell-building" data-tile="${tile.id}">건물 +${formatMoney(tile.buildingCosts[tile.buildingLevel-1]*RULES.SELL_BUILDING_RATE)}</button>`:`<button type="button" data-action="sell-asset" data-tile="${tile.id}">매각 +${formatMoney(tile.purchasePrice*RULES.SELL_PROPERTY_RATE)}</button>`}</span></article>`);
  const cardRows=cards.map(cardId=>{const card=SPECIAL_CARD_INFO[cardId];return `<article><span><b>${card.icon} ${escapeHtml(card.name)}</b><small>보관 중인 황금열쇠</small></span><span><button type="button" data-action="sell-special-card" data-card="${cardId}">매각 +${formatMoney(card.sellPrice)}</button></span></article>`});
  return `<div class="debt-panel"><span class="action-kicker warning">PAYMENT DUE</span><h3>${escapeHtml(debt.reason)}</h3><p class="debt-total">필요 ${formatMoney(debt.amount)} <small>현재 ${formatMoney(player.money)}</small></p><div class="liquidation-list">${assetRows.length||cardRows.length?[...assetRows,...cardRows].join(''):'<p class="empty-copy">매각할 자산이 없습니다.</p>'}</div><button class="primary-button" type="button" data-action="settle-debt" ${player.money<debt.amount?'disabled':''}>${formatMoney(debt.amount)} 지불 <span>→</span></button><button class="danger-button" type="button" data-action="declare-bankruptcy">파산 선언</button></div>`;
}

function currentAssets(state){
  const player=getCurrentPlayer(state);const assets=state.board.filter(tile=>tile.ownerId===player.id);const cards=player.specialCards||[];
  const canSellCard=[PHASES.WAITING_FOR_ROLL,PHASES.END_TURN,PHASES.ASSET_MANAGEMENT].includes(state.phase);
  const assetsMarkup=assets.map(tile=>`<span style="--asset:${regionMeta(tile.region).color}"><i>${tile.type==='city'&&tile.buildingLevel>0?escapeHtml(tile.landmarkGlyph||tile.icon):tile.icon}</i>${escapeHtml(tile.name)}${tile.type==='city'?` · ${escapeHtml(buildingLabel(tile))}${tile.worldCupTurns>0?` · ⚽ ×2 (${tile.worldCupTurns}턴)`:''}`:''}</span>`).join('');
  const cardsMarkup=cards.map(cardId=>{const card=SPECIAL_CARD_INFO[cardId];return `<span class="special-card-chip" style="--asset:#ffd95c"><i>${card.icon}</i>${escapeHtml(card.name)}<button type="button" data-action="sell-special-card" data-card="${cardId}" title="${formatMoney(card.sellPrice)}에 매각" ${canSellCard?'':'disabled'}>매각</button></span>`}).join('');
  return `<section class="asset-summary"><div class="section-label"><span>MY PORTFOLIO</span><b>${assets.length+cards.length}</b></div><div class="asset-chips">${assetsMarkup||cardsMarkup?assetsMarkup+cardsMarkup:'<p>아직 보유한 자산이 없습니다.</p>'}</div></section>`;
}

function activity(state){return `<section class="activity-log"><div class="section-label"><span>TRAVEL LOG</span></div>${state.log.slice(0,4).map(entry=>`<p>${escapeHtml(entry.message)}</p>`).join('')}</section>`}

function noticeModal(state){
  if(!state.notice)return '';
  const golden=state.notice.source==='golden-key';
  return `<div class="modal-backdrop${golden?' golden-key-backdrop':''}" role="dialog" aria-modal="true" aria-labelledby="notice-title"><section class="notice-card tone-${state.notice.tone}${golden?' golden-key-draw-card':''}"><span class="notice-symbol">${golden?'◆':state.notice.tone==='landmark'?'★':state.notice.tone==='danger'?'!':'✦'}</span><p class="eyebrow">${golden?'GOLDEN KEY':'TRAVEL UPDATE'}</p><h2 id="notice-title">${escapeHtml(state.notice.title)}</h2><p>${escapeHtml(state.notice.message)}</p><button class="primary-button" type="button" data-action="dismiss-notice">확인 <span>→</span></button></section></div>`;
}

function optionAssets(assets){return `<option value="">자산 없음</option>${assets.map(tile=>`<option value="${tile.id}">${escapeHtml(tile.name)}</option>`).join('')}`}
function tradeModal(state){
  if(state.phase!==PHASES.TRADE)return '';
  const proposer=getCurrentPlayer(state);const others=state.players.filter(player=>player.id!==proposer.id&&!player.bankrupt);const trade=state.trade;
  if(trade.stage==='review'){
    const partner=state.players.find(player=>player.id===trade.partnerId);const offered=state.board.find(tile=>tile.id===trade.offerAssetId);const requested=state.board.find(tile=>tile.id===trade.requestAssetId);
    return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="trade-card"><p class="eyebrow">TRADE REVIEW</p><h2>${escapeHtml(partner.name)}</h2><p class="trade-intro">${escapeHtml(proposer.name)}의 거래 제안입니다.</p><div class="trade-review"><article><span>받는 것</span><b>${trade.offerCash?`${formatMoney(trade.offerCash)} 현금`:''}${trade.offerCash&&offered?' + ':''}${offered?escapeHtml(offered.name):''}</b></article><i>⇄</i><article><span>주는 것</span><b>${trade.requestCash?`${formatMoney(trade.requestCash)} 현금`:''}${trade.requestCash&&requested?' + ':''}${requested?escapeHtml(requested.name):''}</b></article></div><button class="primary-button" type="button" data-action="accept-trade">거래 수락 <span>✓</span></button><button class="secondary-button wide" type="button" data-action="reject-trade">거래 거절</button></section></div>`;
  }
  const otherAssets=others.flatMap(player=>getTradeableAssets(state,player.id).map(tile=>({...tile,ownerName:player.name})));
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><form class="trade-card" data-trade-form><p class="eyebrow">PLAYER TRADE</p><h2>자산 거래 제안</h2><label>거래 상대<select name="partnerId">${others.map(player=>`<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('')}</select></label><div class="trade-columns"><fieldset><legend>내가 주는 것</legend><label>현금<input type="number" name="offerCash" min="0" max="${proposer.money}" step="10000" value="0"></label><label>자산<select name="offerAssetId">${optionAssets(getTradeableAssets(state,proposer.id))}</select></label></fieldset><fieldset><legend>내가 받는 것</legend><label>현금<input type="number" name="requestCash" min="0" step="10000" value="0"></label><label>자산<select name="requestAssetId"><option value="">자산 없음</option>${otherAssets.map(tile=>`<option value="${tile.id}">${escapeHtml(tile.ownerName)} · ${escapeHtml(tile.name)}</option>`).join('')}</select></label></fieldset></div><p class="trade-note">건물이 있는 도시는 먼저 건물을 정리해야 거래할 수 있습니다.</p><button class="primary-button" type="submit">제안하기 <span>→</span></button><button class="secondary-button wide" type="button" data-action="cancel-trade">취소</button></form></div>`;
}

function gameOverModal(state){
  if(state.status!=='finished')return '';
  const ranking=[...state.players].sort((a,b)=>getNetWorth(state,b.id)-getNetWorth(state,a.id));
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="gameover-card"><span class="winner-crown">♛</span><p class="eyebrow">JOURNEY COMPLETE</p><h2>${state.winnerIds.length>1?'공동 우승!':`${escapeHtml(state.players.find(player=>player.id===state.winnerIds[0])?.name)} 승리!`}</h2><p>${state.finishedReason==='time-limit'?'제한 시간이 끝나 순자산을 비교했습니다.':'마지막까지 살아남은 타이쿤입니다.'}</p><div class="ranking">${ranking.map((player,index)=>`<article><b>${index+1}</b><i style="--player-color:${player.color}">${player.token}</i><span>${escapeHtml(player.name)}</span><strong>${formatMoney(getNetWorth(state,player.id))}</strong></article>`).join('')}</div><button class="primary-button" type="button" data-action="new-game-from-finish">새 게임 <span>→</span></button></section></div>`;
}

export function renderGame(root,state){
  const player=getCurrentPlayer(state);
  root.innerHTML=`<main class="in-game"><header class="game-topbar"><div class="game-brand"><span>WT</span><b>WORLD TYCOON</b></div><div class="game-meta"><span>${modeLabel(state.mode)}</span><b data-timer>${timerLabel(state)}</b><span>TURN ${state.turnNumber}</span></div><div class="utility-actions"><button type="button" data-action="open-help" aria-label="게임 방법">?</button><button type="button" data-action="open-menu" aria-label="게임 메뉴">☰</button></div></header>${playerStrip(state)}<div class="play-layout"><section class="board-panel">${boardMarkup(state)}</section><aside class="control-panel turn-panel" style="--player-color:${player.color}"><div class="current-player"><span class="current-token">${player.token}</span><div><small>CURRENT PLAYER</small><h2>${escapeHtml(player.name)}</h2></div><strong>${formatMoney(player.money)}<small>보유 현금</small></strong></div><div class="phase-pill">${phaseLabel[state.phase]}</div><section class="turn-actions">${decisionPanel(state)}</section>${currentAssets(state)}${activity(state)}</aside></div></main><div id="modal-root">${noticeModal(state)||tradeModal(state)||gameOverModal(state)}</div>`;
  if(state.notice?.source==='golden-key')animateGoldenKeyDraw(root);
}

export function renderHelp(){
  return `<div class="modal-backdrop free-modal" role="dialog" aria-modal="true"><section class="help-card"><button class="modal-close" type="button" data-action="close-free-modal" aria-label="닫기">×</button><p class="eyebrow">HOW TO PLAY</p><h2>World Tycoon 가이드</h2><div class="help-grid">${[
    ['🎲','주사위','주사위 2개의 합만큼 이동합니다. 무인도에서는 횟수 제한 없이 매 차례 더블로 탈출을 시도합니다.'],
    ['◈','도시 구매','소유자가 없는 도시에 도착하면 표시된 가격으로 인수할 수 있습니다.'],['▥','랜드마크','자기 도시에 도착하면 그 도시의 대표 건축물을 기초, 건설 중, 1동, 2동 단계로 개발합니다.'],
    ['₩','통행료','상대 도시나 탈것에 도착하면 표시된 통행료를 냅니다. 우대권은 지불 직전에 직접 선택해 사용합니다.'],['◆','황금열쇠','우대권과 무인도 탈출권은 필요한 순간에 직접 사용하거나 은행에 팔 수 있습니다.'],
    ['✈','탈것','콩코드·퀸 엘리자베스호 여행과 콜럼비아호를 이용하는 우주여행은 소유자에게 이용료를 냅니다. 목적지는 판의 도시를 직접 눌러 선택합니다.'],['⚽','월드컵','보유 도시 하나를 골라 다음 자신의 3번 차례 동안 통행료를 2배로 올립니다.'],
    ['⇄','거래','주사위를 굴리기 전에 현금·도시·탈것을 다른 플레이어와 교환할 수 있습니다. 건물 있는 도시는 거래할 수 없습니다.'],
    ['!','파산','현금이 부족하면 건물과 자산을 반값에 정리합니다. 모두 정리해도 못 내면 파산합니다.'],['♛','승리','완전 게임은 마지막 생존자가, 시간제 게임은 종료 시 순자산 1위가 승리합니다.']
  ].map(([icon,title,copy])=>`<article><i>${icon}</i><span><b>${title}</b><p>${copy}</p></span></article>`).join('')}</div></section></div>`;
}

export function renderMenu(){return `<div class="modal-backdrop free-modal" role="dialog" aria-modal="true"><section class="menu-card"><p class="eyebrow">GAME MENU</p><h2>여행을 멈출까요?</h2><p>진행 상황은 이 기기에 자동 저장됩니다.</p><button class="primary-button" type="button" data-action="close-free-modal">게임 계속 <span>→</span></button><button class="danger-button" type="button" data-action="confirm-new-game">저장 삭제 후 새 게임</button></section></div>`}

export function showFreeModal(markup){document.querySelector('#modal-root')?.replaceChildren(document.createRange().createContextualFragment(markup))}
export function closeFreeModal(){document.querySelector('#modal-root')?.replaceChildren()}
export function toast(message){const element=document.createElement('div');element.className='toast';element.textContent=message;document.body.append(element);requestAnimationFrame(()=>element.classList.add('show'));setTimeout(()=>{element.classList.remove('show');setTimeout(()=>element.remove(),200)},2300)}
export function updateTimer(state){const timer=document.querySelector('[data-timer]');if(timer)timer.textContent=timerLabel(state)}

export function showDiceResult(dice,total){
  document.querySelector('.dice-result-feedback')?.remove();const element=document.createElement('div');element.className='dice-result-feedback';element.setAttribute('role','status');element.setAttribute('aria-live','assertive');
  element.innerHTML=`<small>DICE RESULT</small><div>${die(dice[0])}${die(dice[1])}</div><strong>${total}칸 이동</strong><span>${dice[0]} + ${dice[1]} = ${total}</span>`;document.body.append(element);requestAnimationFrame(()=>element.classList.add('show'));
  return new Promise(resolve=>setTimeout(()=>{element.classList.remove('show');setTimeout(()=>{element.remove();resolve()},240)},1050));
}

function animateGoldenKeyDraw(root){
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  requestAnimationFrame(()=>{const deck=root.querySelector('.center-card-deck');const card=root.querySelector('.golden-key-draw-card');const backdrop=root.querySelector('.golden-key-backdrop');if(!deck||!card)return;
    const from=deck.getBoundingClientRect();const to=card.getBoundingClientRect();const dx=from.left+from.width/2-(to.left+to.width/2);const dy=from.top+from.height/2-(to.top+to.height/2);
    backdrop?.animate([{backgroundColor:'transparent',backdropFilter:'blur(0)'},{backgroundColor:'#020912d9',backdropFilter:'blur(9px)'}],{duration:560,easing:'ease-out'});
    card.animate([{opacity:.2,transform:`translate(${dx}px,${dy}px) scale(.16) rotate(-25deg)`},{opacity:1,transform:'translate(0,0) scale(1.04) rotate(1deg)',offset:.82},{opacity:1,transform:'translate(0,0) scale(1) rotate(0)'}],{duration:680,easing:'cubic-bezier(.2,.8,.2,1)'});
  });
}

export function captureTokenRect(playerId){
  const token=document.querySelector(`[data-player-token="${playerId}"]`);if(!token)return null;const rect=token.getBoundingClientRect();return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};
}

export async function animateTokenStep(playerId,fromRect){
  const token=document.querySelector(`[data-player-token="${playerId}"]`);if(!token||!fromRect||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const to=token.getBoundingClientRect();const dx=fromRect.left+fromRect.width/2-(to.left+to.width/2);const dy=fromRect.top+fromRect.height/2-(to.top+to.height/2);
  try{await token.animate([{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.92)`,filter:'brightness(1)'},{transform:'translate(-50%,-50%) scale(1.14)',filter:'brightness(1.35)',offset:.78},{transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1)'}],{duration:270,easing:'cubic-bezier(.2,.75,.25,1)'}).finished}catch{}
}

export function showMoneyFeedback(feedback){
  if(!feedback)return;document.querySelector('.money-feedback')?.remove();const element=document.createElement('div');element.className=`money-feedback tone-${feedback.tone||'info'}`;
  const sign=feedback.amount>0?'+':'−';element.innerHTML=`<small>${escapeHtml(feedback.title)}</small><strong>${sign}${formatMoney(Math.abs(feedback.amount))}</strong><span>${escapeHtml(feedback.message)}</span>`;document.body.append(element);
  requestAnimationFrame(()=>element.classList.add('show'));setTimeout(()=>{element.classList.remove('show');setTimeout(()=>element.remove(),260)},1900);
}
