import {boardPosition,createBoard} from './board.js';
import {getCurrentPlayer,getNetWorth,getTradeableAssets} from './game.js';
import {PHASES,RULES,formatMoney,regionMeta} from './rules.js';

const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const phaseLabel={
  [PHASES.WAITING_FOR_ROLL]:'주사위를 굴릴 차례',[PHASES.ROLLING]:'주사위 굴리는 중',[PHASES.MOVING]:'이동 중',[PHASES.RESOLVING_TILE]:'도착지 확인 중',
  [PHASES.BUY_DECISION]:'인수 결정',[PHASES.BUILD_DECISION]:'도시 개발',[PHASES.TRADE]:'플레이어 거래',[PHASES.ASSET_MANAGEMENT]:'자산 정리',[PHASES.END_TURN]:'턴 마무리',[PHASES.GAME_OVER]:'게임 종료',
};

function tilePrice(tile){return tile.purchasePrice?`₩${formatMoney(tile.purchasePrice)}`:tile.type==='event'?'KEY CARD':tile.type==='tax'?`−${formatMoney(tile.amount)}`:tile.type.toUpperCase()}
function buildingMarkup(tile){
  if(tile.type!=='city'||!tile.ownerId)return '';
  if(tile.buildingLevel===RULES.MAX_BUILDING_LEVEL)return '<span class="landmark-mark" title="랜드마크">★</span>';
  return `<span class="building-pips" aria-label="건물 레벨 ${tile.buildingLevel}">${Array.from({length:tile.buildingLevel},()=>'<i></i>').join('')}</span>`;
}
function tokenMarkup(players,index){
  return `<span class="tile-tokens">${players.filter(player=>!player.bankrupt&&player.position===index).map((player,tokenIndex)=>`<i class="player-token token-${tokenIndex}" style="--token:${player.color}" title="${escapeHtml(player.name)}"><b>${player.token}</b></i>`).join('')}</span>`;
}
function tileSide(index){
  if([0,10,20,30].includes(index))return 'corner';
  if(index<10)return 'bottom';if(index<20)return 'left';if(index<30)return 'top';return 'right';
}
function boardMarkup(state){
  const board=state?.board??createBoard();const players=state?.players??[];
  return `<div class="board-grid">${board.map((tile,index)=>{
    const position=boardPosition(index);const region=regionMeta(tile.region);const owner=state?.players.find(player=>player.id===tile.ownerId);
    const side=tileSide(index);
    return `<article class="board-tile tile-${tile.type} side-${side}${side==='corner'?' corner':''}${tile.buildingLevel===4?' landmark':''}" style="--row:${position.row};--column:${position.column};--region:${region.color};--owner:${owner?.color||'transparent'}" aria-label="${escapeHtml(tile.name)}${owner?`, ${owner.name} 소유`:''}">
      <span class="tile-band"></span><span class="owner-strip"></span>${buildingMarkup(tile)}<span class="tile-face"><b class="tile-icon" aria-hidden="true">${tile.icon}</b><strong>${escapeHtml(tile.name)}</strong><span class="tile-en">${escapeHtml(tile.englishName)}</span><small>${tilePrice(tile)}</small></span>${tokenMarkup(players,index)}
    </article>`;
  }).join('')}
    <div class="board-center">
      <span class="center-card-deck" aria-hidden="true"><i></i><b>GOLDEN<br>KEY</b></span>
      <span class="center-station" aria-hidden="true"><i></i><b>✦</b></span>
      <p>WORLD TRAVEL · CITY INVESTMENT</p><h1>WORLD<br><em>TYCOON</em></h1>
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
  if(state.phase===PHASES.WAITING_FOR_ROLL)return `<div class="action-copy"><span class="action-kicker">READY TO GO</span><h3>주사위를 굴리세요</h3><p>두 주사위의 합만큼 세계를 여행합니다.</p></div><div class="dice-row">${die(state.dice[0])}${die(state.dice[1])}<b>${state.rollTotal||'?'}</b></div><button class="roll-button" type="button" data-action="roll-dice">주사위 굴리기 <span>🎲</span></button><button class="secondary-button wide" type="button" data-action="open-trade">거래하기</button>`;
  if(state.phase===PHASES.ROLLING||state.phase===PHASES.MOVING||state.phase===PHASES.RESOLVING_TILE)return `<div class="rolling-state"><div class="dice-row rolling">${die(state.dice[0])}${die(state.dice[1])}</div><h3>${state.phase===PHASES.ROLLING?'주사위가 구르는 중…':'여행 중…'}</h3><p>도착지의 새로운 기회를 확인하고 있어요.</p></div>`;
  if(state.phase===PHASES.BUY_DECISION)return `<div class="asset-decision" style="--region:${regionMeta(tile.region).color}"><span class="decision-icon">${tile.icon}</span><p>${tile.type==='city'?regionMeta(tile.region).name:'특별 시설'}</p><h3>${escapeHtml(tile.name)}</h3><dl><div><dt>인수 가격</dt><dd>${formatMoney(tile.purchasePrice)}</dd></div><div><dt>기본 통행료</dt><dd>${formatMoney(tile.baseRent)}</dd></div></dl><button class="primary-button" type="button" data-action="buy-tile" ${player.money<tile.purchasePrice?'disabled':''}>인수하기 <span>−${formatMoney(tile.purchasePrice)}</span></button><button class="secondary-button wide" type="button" data-action="decline-decision">이번에는 지나가기</button></div>`;
  if(state.phase===PHASES.BUILD_DECISION){
    const maxed=tile.buildingLevel>=RULES.MAX_BUILDING_LEVEL;const cost=maxed?0:tile.buildingCosts[tile.buildingLevel];
    return `<div class="asset-decision build" style="--region:${regionMeta(tile.region).color}"><span class="decision-icon">${maxed?'★':'▥'}</span><p>${regionMeta(tile.region).name} · Lv${tile.buildingLevel}</p><h3>${escapeHtml(tile.name)} 개발</h3>${maxed?'<div class="landmark-complete">랜드마크 완성</div>':`<dl><div><dt>건설 비용</dt><dd>${formatMoney(cost)}</dd></div><div><dt>다음 통행료</dt><dd>${formatMoney(tile.rentByLevel[tile.buildingLevel+1])}</dd></div></dl><button class="primary-button" type="button" data-action="build-tile" ${player.money<cost?'disabled':''}>Lv${tile.buildingLevel+1} 건설 <span>−${formatMoney(cost)}</span></button>`}<button class="secondary-button wide" type="button" data-action="decline-decision">건설하지 않기</button></div>`;
  }
  if(state.phase===PHASES.ASSET_MANAGEMENT)return debtPanel(state);
  if(state.phase===PHASES.END_TURN)return `<div class="action-copy end-turn"><span class="action-kicker">TURN COMPLETE</span><h3>턴을 마칩니다</h3><p>${state.rolledDouble?'더블이면 한 번 더 여행할 수 있어요.':'다음 플레이어에게 기기를 넘겨주세요.'}</p></div><div class="dice-row">${die(state.dice[0])}${die(state.dice[1])}<b>${state.rollTotal||'—'}</b></div><button class="primary-button" type="button" data-action="end-turn">턴 종료 <span>→</span></button>`;
  return `<div class="rolling-state"><h3>${phaseLabel[state.phase]}</h3></div>`;
}

function debtPanel(state){
  const player=getCurrentPlayer(state);const debt=state.pendingDebt;const assets=state.board.filter(tile=>tile.ownerId===player.id);
  return `<div class="debt-panel"><span class="action-kicker warning">PAYMENT DUE</span><h3>${escapeHtml(debt.reason)}</h3><p class="debt-total">필요 ${formatMoney(debt.amount)} <small>현재 ${formatMoney(player.money)}</small></p><div class="liquidation-list">${assets.length?assets.map(tile=>`<article><span><b>${escapeHtml(tile.name)}</b><small>${tile.type==='city'?`건물 Lv${tile.buildingLevel}`:'특별 시설'}</small></span><span>${tile.buildingLevel>0?`<button type="button" data-action="sell-building" data-tile="${tile.id}">건물 +${formatMoney(tile.buildingCosts[tile.buildingLevel-1]*RULES.SELL_BUILDING_RATE)}</button>`:`<button type="button" data-action="sell-asset" data-tile="${tile.id}">매각 +${formatMoney(tile.purchasePrice*RULES.SELL_PROPERTY_RATE)}</button>`}</span></article>`).join(''):'<p class="empty-copy">매각할 자산이 없습니다.</p>'}</div><button class="primary-button" type="button" data-action="settle-debt" ${player.money<debt.amount?'disabled':''}>${formatMoney(debt.amount)} 지불 <span>→</span></button><button class="danger-button" type="button" data-action="declare-bankruptcy">파산 선언</button></div>`;
}

function currentAssets(state){
  const player=getCurrentPlayer(state);const assets=state.board.filter(tile=>tile.ownerId===player.id);
  return `<section class="asset-summary"><div class="section-label"><span>MY PORTFOLIO</span><b>${assets.length}</b></div><div class="asset-chips">${assets.length?assets.map(tile=>`<span style="--asset:${regionMeta(tile.region).color}"><i>${tile.icon}</i>${escapeHtml(tile.name)}${tile.type==='city'?` · Lv${tile.buildingLevel}`:''}</span>`).join(''):'<p>아직 보유한 도시가 없습니다.</p>'}</div></section>`;
}

function activity(state){return `<section class="activity-log"><div class="section-label"><span>TRAVEL LOG</span></div>${state.log.slice(0,4).map(entry=>`<p>${escapeHtml(entry.message)}</p>`).join('')}</section>`}

function noticeModal(state){
  if(!state.notice)return '';
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title"><section class="notice-card tone-${state.notice.tone}"><span class="notice-symbol">${state.notice.tone==='event'?'◆':state.notice.tone==='landmark'?'★':state.notice.tone==='danger'?'!':'✦'}</span><p class="eyebrow">${state.notice.tone==='event'?'GOLDEN KEY':'TRAVEL UPDATE'}</p><h2 id="notice-title">${escapeHtml(state.notice.title)}</h2><p>${escapeHtml(state.notice.message)}</p><button class="primary-button" type="button" data-action="dismiss-notice">확인 <span>→</span></button></section></div>`;
}

function optionAssets(assets){return `<option value="">자산 없음</option>${assets.map(tile=>`<option value="${tile.id}">${escapeHtml(tile.name)}</option>`).join('')}`}
function tradeModal(state){
  if(state.phase!==PHASES.TRADE)return '';
  const proposer=getCurrentPlayer(state);const others=state.players.filter(player=>player.id!==proposer.id&&!player.bankrupt);const trade=state.trade;
  if(trade.stage==='review'){
    const partner=state.players.find(player=>player.id===trade.partnerId);const offered=state.board.find(tile=>tile.id===trade.offerAssetId);const requested=state.board.find(tile=>tile.id===trade.requestAssetId);
    return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="trade-card"><p class="eyebrow">HAND THE DEVICE TO</p><h2>${escapeHtml(partner.name)}</h2><p class="trade-intro">${escapeHtml(proposer.name)}의 거래 제안입니다.</p><div class="trade-review"><article><span>받는 것</span><b>${trade.offerCash?`${formatMoney(trade.offerCash)} 현금`:''}${trade.offerCash&&offered?' + ':''}${offered?escapeHtml(offered.name):''}</b></article><i>⇄</i><article><span>주는 것</span><b>${trade.requestCash?`${formatMoney(trade.requestCash)} 현금`:''}${trade.requestCash&&requested?' + ':''}${requested?escapeHtml(requested.name):''}</b></article></div><button class="primary-button" type="button" data-action="accept-trade">거래 수락 <span>✓</span></button><button class="secondary-button wide" type="button" data-action="reject-trade">거래 거절</button></section></div>`;
  }
  const otherAssets=others.flatMap(player=>getTradeableAssets(state,player.id).map(tile=>({...tile,ownerName:player.name})));
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><form class="trade-card" data-trade-form><p class="eyebrow">PLAYER TRADE</p><h2>자산 거래 제안</h2><label>거래 상대<select name="partnerId">${others.map(player=>`<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('')}</select></label><div class="trade-columns"><fieldset><legend>내가 주는 것</legend><label>현금<input type="number" name="offerCash" min="0" max="${proposer.money}" step="10" value="0"></label><label>자산<select name="offerAssetId">${optionAssets(getTradeableAssets(state,proposer.id))}</select></label></fieldset><fieldset><legend>내가 받는 것</legend><label>현금<input type="number" name="requestCash" min="0" step="10" value="0"></label><label>자산<select name="requestAssetId"><option value="">자산 없음</option>${otherAssets.map(tile=>`<option value="${tile.id}">${escapeHtml(tile.ownerName)} · ${escapeHtml(tile.name)}</option>`).join('')}</select></label></fieldset></div><p class="trade-note">건물이 있는 도시는 먼저 건물을 정리해야 거래할 수 있습니다.</p><button class="primary-button" type="submit">제안하기 <span>→</span></button><button class="secondary-button wide" type="button" data-action="cancel-trade">취소</button></form></div>`;
}

function gameOverModal(state){
  if(state.status!=='finished')return '';
  const ranking=[...state.players].sort((a,b)=>getNetWorth(state,b.id)-getNetWorth(state,a.id));
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="gameover-card"><span class="winner-crown">♛</span><p class="eyebrow">JOURNEY COMPLETE</p><h2>${state.winnerIds.length>1?'공동 우승!':`${escapeHtml(state.players.find(player=>player.id===state.winnerIds[0])?.name)} 승리!`}</h2><p>${state.finishedReason==='time-limit'?'제한 시간이 끝나 순자산을 비교했습니다.':'마지막까지 살아남은 타이쿤입니다.'}</p><div class="ranking">${ranking.map((player,index)=>`<article><b>${index+1}</b><i style="--player-color:${player.color}">${player.token}</i><span>${escapeHtml(player.name)}</span><strong>${formatMoney(getNetWorth(state,player.id))}</strong></article>`).join('')}</div><button class="primary-button" type="button" data-action="new-game-from-finish">새 게임 <span>→</span></button></section></div>`;
}

export function renderGame(root,state){
  const player=getCurrentPlayer(state);
  root.innerHTML=`<main class="in-game"><header class="game-topbar"><div class="game-brand"><span>WT</span><b>WORLD TYCOON</b></div><div class="game-meta"><span>${modeLabel(state.mode)}</span><b data-timer>${timerLabel(state)}</b><span>TURN ${state.turnNumber}</span></div><div class="utility-actions"><button type="button" data-action="open-help" aria-label="게임 방법">?</button><button type="button" data-action="open-menu" aria-label="게임 메뉴">☰</button></div></header>${playerStrip(state)}<div class="play-layout"><section class="board-panel">${boardMarkup(state)}</section><aside class="control-panel turn-panel" style="--player-color:${player.color}"><div class="current-player"><span class="current-token">${player.token}</span><div><small>CURRENT PLAYER</small><h2>${escapeHtml(player.name)}</h2></div><strong>${formatMoney(player.money)}<small>보유 현금</small></strong></div><div class="phase-pill">${phaseLabel[state.phase]}</div><section class="turn-actions">${decisionPanel(state)}</section>${currentAssets(state)}${activity(state)}</aside></div></main><div id="modal-root">${noticeModal(state)||tradeModal(state)||gameOverModal(state)}</div>`;
}

export function renderHelp(){
  return `<div class="modal-backdrop free-modal" role="dialog" aria-modal="true"><section class="help-card"><button class="modal-close" type="button" data-action="close-free-modal" aria-label="닫기">×</button><p class="eyebrow">HOW TO PLAY</p><h2>World Tycoon 가이드</h2><div class="help-grid">${[
    ['🎲','주사위','주사위 2개의 합만큼 이동합니다. 더블이면 보너스 턴을 얻고, 3연속 더블이면 무인도에서 한 턴 쉽니다.'],
    ['◈','도시 구매','소유자가 없는 도시에 도착하면 표시된 가격으로 인수할 수 있습니다.'],['▥','건물','자기 도시에 도착하면 Lv4 랜드마크까지 한 단계씩 개발할 수 있습니다.'],
    ['₩','통행료','상대 도시나 시설에 도착하면 레벨과 지역 완성 보너스를 반영한 통행료를 냅니다.'],['◆','황금열쇠','황금열쇠는 돈, 이동, 할인, 대기 등 여행의 변수를 만듭니다.'],
    ['✈','특별 시설','콩코드여객기·퀸 엘리자베스호·콜럼비아호를 함께 모을수록 이용료가 크게 오릅니다.'],['⇄','거래','주사위를 굴리기 전에 현금·도시·시설을 다른 플레이어와 교환할 수 있습니다. 건물 있는 도시는 거래할 수 없습니다.'],
    ['!','파산','현금이 부족하면 건물과 자산을 반값에 정리합니다. 모두 정리해도 못 내면 파산합니다.'],['♛','승리','완전 게임은 마지막 생존자가, 시간제 게임은 종료 시 순자산 1위가 승리합니다.']
  ].map(([icon,title,copy])=>`<article><i>${icon}</i><span><b>${title}</b><p>${copy}</p></span></article>`).join('')}</div></section></div>`;
}

export function renderMenu(){return `<div class="modal-backdrop free-modal" role="dialog" aria-modal="true"><section class="menu-card"><p class="eyebrow">GAME MENU</p><h2>여행을 멈출까요?</h2><p>진행 상황은 이 기기에 자동 저장됩니다.</p><button class="primary-button" type="button" data-action="close-free-modal">게임 계속 <span>→</span></button><button class="danger-button" type="button" data-action="confirm-new-game">저장 삭제 후 새 게임</button></section></div>`}

export function showFreeModal(markup){document.querySelector('#modal-root')?.replaceChildren(document.createRange().createContextualFragment(markup))}
export function closeFreeModal(){document.querySelector('#modal-root')?.replaceChildren()}
export function showTurnOverlay(player){
  const overlay=document.createElement('div');overlay.className='turn-overlay';overlay.innerHTML=`<span style="--player-color:${player.color}">${player.token}</span><p>NEXT PLAYER</p><h2>${escapeHtml(player.name)} TURN</h2><small>기기를 넘겨주세요</small>`;document.body.append(overlay);requestAnimationFrame(()=>overlay.classList.add('show'));setTimeout(()=>{overlay.classList.remove('show');setTimeout(()=>overlay.remove(),220)},1050);
}
export function toast(message){const element=document.createElement('div');element.className='toast';element.textContent=message;document.body.append(element);requestAnimationFrame(()=>element.classList.add('show'));setTimeout(()=>{element.classList.remove('show');setTimeout(()=>element.remove(),200)},2300)}
export function updateTimer(state){const timer=document.querySelector('[data-timer]');if(timer)timer.textContent=timerLabel(state)}
