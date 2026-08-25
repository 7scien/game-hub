import {createBoard,findTileIndex} from './board.js';
import {EVENT_CARDS} from './data/events.js';
import {PHASES,PLAYER_COLORS,PLAYER_TOKENS,RULES,calculateRent,liquidationValue,netWorth} from './rules.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const currentPlayer=state=>state.players[state.currentPlayerIndex];
const addLog=(state,message)=>{state.log.unshift({id:`log-${state.sequence++}`,message});state.log=state.log.slice(0,10)};
const notice=(state,title,message,tone='info')=>{state.notice={id:`notice-${state.sequence++}`,title,message,tone}};
const shuffled=(items,rng)=>items.map(item=>({item,sort:rng()})).sort((a,b)=>a.sort-b.sort).map(entry=>entry.item);

export function createGame(playerCount,{mode='30',names=[],rng=Math.random}={}){
  if(![2,3,4].includes(playerCount))throw new Error('플레이 인원은 2~4명이어야 합니다.');
  const players=Array.from({length:playerCount},(_,index)=>({
    id:`player-${index+1}`,name:(names[index]||`플레이어 ${index+1}`).trim().slice(0,12)||`플레이어 ${index+1}`,
    color:PLAYER_COLORS[index],token:PLAYER_TOKENS[index],money:RULES.STARTING_MONEY,position:0,ownedProperties:[],specialAssets:[],
    bankrupt:false,skipTurns:0,rentDiscountCharges:0,rentDiscountRate:.5,
  }));
  const minutes=mode==='full'?null:Number(mode);
  const state={
    version:RULES.SAVE_VERSION,status:'playing',mode:String(mode),players,board:createBoard(),currentPlayerIndex:0,turnNumber:1,
    phase:PHASES.WAITING_FOR_ROLL,dice:[1,1],rollTotal:0,rolledDouble:false,consecutiveDoubles:0,pendingAction:null,pendingDebt:null,
    eventDeck:shuffled(EVENT_CARDS.map(card=>card.id),rng),eventCursor:0,trade:null,notice:null,log:[],sequence:1,
    timer:{remainingSeconds:minutes===null?null:minutes*60},winnerIds:[],finishedReason:null,
  };
  addLog(state,`${players[0].name}의 여행이 시작되었습니다.`);
  return state;
}

export function getCurrentPlayer(state){return currentPlayer(state)}
function requirePhase(state,...phases){if(!phases.includes(state.phase))throw new Error('지금은 이 행동을 할 수 없습니다.')}

export function rollDice(state,rng=Math.random){
  requirePhase(state,PHASES.WAITING_FOR_ROLL);
  state.dice=[1+Math.floor(rng()*6),1+Math.floor(rng()*6)];
  state.rollTotal=state.dice[0]+state.dice[1];state.rolledDouble=state.dice[0]===state.dice[1];state.phase=PHASES.ROLLING;
  return [...state.dice];
}

function passStart(state,player,count=1){
  const reward=RULES.PASS_START_BONUS*count;player.money+=reward;addLog(state,`${player.name}이 출발 지점을 통과해 ${reward}을 받았습니다.`);
}

function moveBy(state,steps,{collectPassBonus=true}={}){
  const player=currentPlayer(state);const length=state.board.length;const raw=player.position+steps;
  if(steps>0&&collectPassBonus){const laps=Math.floor(raw/length);if(laps>0)passStart(state,player,laps)}
  player.position=((raw%length)+length)%length;
}

function moveTo(state,targetIndex,{collectPassBonus=true}={}){
  const player=currentPlayer(state);
  if(collectPassBonus&&targetIndex<=player.position&&targetIndex!==player.position)passStart(state,player);
  player.position=targetIndex;
}

export function completeRoll(state){
  requirePhase(state,PHASES.ROLLING);const player=currentPlayer(state);state.phase=PHASES.MOVING;
  if(state.rolledDouble)state.consecutiveDoubles+=1;else state.consecutiveDoubles=0;
  if(state.consecutiveDoubles>=RULES.MAX_CONSECUTIVE_DOUBLES){
    player.position=findTileIndex(state.board,'deserted-island');player.skipTurns=Math.max(player.skipTurns,1);
    notice(state,'연속 더블!',`${RULES.MAX_CONSECUTIVE_DOUBLES}번 연속 더블로 무인도로 이동합니다.`,'warning');
    addLog(state,`${player.name}이 연속 더블로 무인도로 이동했습니다.`);state.phase=PHASES.END_TURN;return;
  }
  moveBy(state,state.rollTotal);addLog(state,`${player.name}이 ${state.rollTotal}칸 이동했습니다.`);state.phase=PHASES.RESOLVING_TILE;resolveTile(state);
}

function drawEvent(state){
  if(state.eventCursor>=state.eventDeck.length){state.eventDeck=[...state.eventDeck].reverse();state.eventCursor=0}
  const id=state.eventDeck[state.eventCursor++];return EVENT_CARDS.find(card=>card.id===id)??EVENT_CARDS[0];
}

function finishSimpleTile(state){state.phase=PHASES.END_TURN;state.pendingAction=null}

function prepareDebt(state,{amount,recipientId=null,recipientIds=null,shareAmount=null,reason}){
  const payer=currentPlayer(state);const debt={amount:Math.round(amount),recipientId,recipientIds,shareAmount,reason};
  if(payer.rentDiscountCharges>0&&recipientId)payer.rentDiscountCharges-=1;
  if(payer.money>=debt.amount){
    payer.money-=debt.amount;
    if(recipientId)state.players.find(player=>player.id===recipientId).money+=debt.amount;
    if(recipientIds)recipientIds.forEach(id=>{const target=state.players.find(player=>player.id===id);if(target)target.money+=shareAmount});
    addLog(state,`${payer.name}이 ${debt.amount}을 지불했습니다.`);finishSimpleTile(state);return;
  }
  state.pendingDebt=debt;state.phase=PHASES.ASSET_MANAGEMENT;
  notice(state,'자산 정리가 필요합니다',`${reason} ${debt.amount}을 지불하려면 자산을 정리하세요.`,'warning');
}

function applyEvent(state,card){
  const player=currentPlayer(state);const effect=card.effect;
  notice(state,card.title,card.text,'event');addLog(state,`${player.name}: ${card.title}`);
  if(effect.type==='cash'){
    if(effect.amount>=0){player.money+=effect.amount;finishSimpleTile(state)}else prepareDebt(state,{amount:-effect.amount,reason:card.title});
    return;
  }
  if(effect.type==='moveBy'){moveBy(state,effect.steps);state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);return}
  if(effect.type==='moveTo'){
    const index=findTileIndex(state.board,effect.tileId);moveTo(state,index,{collectPassBonus:effect.collectPassBonus!==false});state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);return;
  }
  if(effect.type==='collectEach'){
    let total=0;state.players.filter(other=>other.id!==player.id&&!other.bankrupt).forEach(other=>{const paid=Math.min(other.money,effect.amount);other.money-=paid;total+=paid});
    player.money+=total;finishSimpleTile(state);return;
  }
  if(effect.type==='payEach'){
    const ids=state.players.filter(other=>other.id!==player.id&&!other.bankrupt).map(other=>other.id);
    prepareDebt(state,{amount:effect.amount*ids.length,recipientIds:ids,shareAmount:effect.amount,reason:card.title});return;
  }
  if(effect.type==='rentDiscount'){player.rentDiscountCharges+=effect.charges;player.rentDiscountRate=effect.rate;finishSimpleTile(state);return}
  if(effect.type==='skipTurns'){player.skipTurns+=effect.turns;finishSimpleTile(state)}
}

export function resolveTile(state,depth=0){
  if(depth>3){finishSimpleTile(state);return}
  const player=currentPlayer(state);const tile=state.board[player.position];state.pendingAction=null;
  if(tile.type==='city'){
    if(!tile.ownerId){state.pendingAction={type:'buy',tileIndex:tile.index};state.phase=PHASES.BUY_DECISION;return}
    if(tile.ownerId===player.id){state.pendingAction={type:'build',tileIndex:tile.index};state.phase=PHASES.BUILD_DECISION;return}
    prepareDebt(state,{amount:calculateRent(state,tile,player),recipientId:tile.ownerId,reason:`${tile.name} 통행료`});return;
  }
  if(tile.type==='facility'){
    if(!tile.ownerId){state.pendingAction={type:'buy',tileIndex:tile.index};state.phase=PHASES.BUY_DECISION;return}
    if(tile.ownerId===player.id){finishSimpleTile(state);return}
    prepareDebt(state,{amount:calculateRent(state,tile,player),recipientId:tile.ownerId,reason:`${tile.name} 이용료`});return;
  }
  if(tile.type==='event'){applyEvent(state,drawEvent(state));return}
  if(tile.type==='tax'){prepareDebt(state,{amount:tile.amount,reason:tile.name});return}
  if(tile.type==='bonus'){player.money+=tile.amount;notice(state,tile.name,`${tile.amount}을 받았습니다.`,'success');finishSimpleTile(state);return}
  if(tile.type==='wait'){player.skipTurns+=tile.turns;notice(state,tile.name,`다음 ${tile.turns}턴 동안 쉽니다.`,'warning');finishSimpleTile(state);return}
  if(tile.type==='move'){const destination=state.board[tile.target];moveTo(state,tile.target);notice(state,tile.name,`${destination.name}(으)로 이동합니다.`,'event');state.phase=PHASES.RESOLVING_TILE;resolveTile(state,depth+1);return}
  if(tile.type==='rest'){notice(state,tile.name,'잠시 쉬며 다음 여행을 준비합니다.','success');finishSimpleTile(state);return}
  finishSimpleTile(state);
}

export function buyCurrentTile(state){
  requirePhase(state,PHASES.BUY_DECISION);const player=currentPlayer(state);const tile=state.board[state.pendingAction.tileIndex];
  if(tile.ownerId)throw new Error('이미 소유자가 있는 자산입니다.');if(player.money<tile.purchasePrice)throw new Error('구매할 현금이 부족합니다.');
  player.money-=tile.purchasePrice;tile.ownerId=player.id;(tile.type==='city'?player.ownedProperties:player.specialAssets).push(tile.id);
  addLog(state,`${player.name}이 ${tile.name}을 ${tile.purchasePrice}에 인수했습니다.`);finishSimpleTile(state);
}

export function declineDecision(state){requirePhase(state,PHASES.BUY_DECISION,PHASES.BUILD_DECISION);finishSimpleTile(state)}

export function buildCurrentTile(state){
  requirePhase(state,PHASES.BUILD_DECISION);const player=currentPlayer(state);const tile=state.board[state.pendingAction.tileIndex];
  if(tile.ownerId!==player.id||tile.type!=='city')throw new Error('이 도시에는 건설할 수 없습니다.');
  if(tile.buildingLevel>=RULES.MAX_BUILDING_LEVEL)throw new Error('이미 랜드마크가 완성되었습니다.');
  const cost=tile.buildingCosts[tile.buildingLevel];if(player.money<cost)throw new Error('건설할 현금이 부족합니다.');
  player.money-=cost;tile.buildingLevel+=1;addLog(state,`${player.name}이 ${tile.name}을 Lv${tile.buildingLevel}로 개발했습니다.`);
  if(tile.buildingLevel===RULES.MAX_BUILDING_LEVEL)notice(state,'랜드마크 완성!',`${tile.name}이 도시의 새로운 상징이 되었습니다.`,'landmark');
  finishSimpleTile(state);
}

function removeOwnedId(player,tile){const list=tile.type==='city'?player.ownedProperties:player.specialAssets;const index=list.indexOf(tile.id);if(index>=0)list.splice(index,1)}

export function sellBuilding(state,tileId){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(!tile||tile.ownerId!==player.id||tile.buildingLevel<1)throw new Error('매각할 건물이 없습니다.');
  const refund=Math.round(tile.buildingCosts[tile.buildingLevel-1]*RULES.SELL_BUILDING_RATE);tile.buildingLevel-=1;player.money+=refund;addLog(state,`${tile.name} 건물을 매각해 ${refund}을 확보했습니다.`);return refund;
}

export function sellAsset(state,tileId){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(!tile||tile.ownerId!==player.id)throw new Error('매각할 수 없는 자산입니다.');if(tile.buildingLevel>0)throw new Error('건물을 먼저 모두 매각하세요.');
  const refund=Math.round(tile.purchasePrice*RULES.SELL_PROPERTY_RATE);tile.ownerId=null;player.money+=refund;removeOwnedId(player,tile);addLog(state,`${tile.name}을 매각해 ${refund}을 확보했습니다.`);return refund;
}

export function settleDebt(state){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const debt=state.pendingDebt;if(!debt)throw new Error('지불할 금액이 없습니다.');if(player.money<debt.amount)throw new Error('아직 현금이 부족합니다.');
  player.money-=debt.amount;
  if(debt.recipientId){const target=state.players.find(item=>item.id===debt.recipientId);if(target&&!target.bankrupt)target.money+=debt.amount}
  if(debt.recipientIds)debt.recipientIds.forEach(id=>{const target=state.players.find(item=>item.id===id);if(target&&!target.bankrupt)target.money+=debt.shareAmount});
  addLog(state,`${player.name}이 ${debt.amount}을 지불했습니다.`);state.pendingDebt=null;finishSimpleTile(state);
}

function finishGame(state,reason){
  state.status='finished';state.phase=PHASES.GAME_OVER;state.finishedReason=reason;
  const active=state.players.filter(player=>!player.bankrupt);const values=active.map(player=>({id:player.id,value:netWorth(state,player.id)}));const best=Math.max(...values.map(entry=>entry.value));
  state.winnerIds=values.filter(entry=>entry.value===best).map(entry=>entry.id);addLog(state,`게임 종료 · ${state.winnerIds.map(id=>state.players.find(player=>player.id===id).name).join(', ')} 승리`);
}

export function declareBankruptcy(state){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const debt=state.pendingDebt;
  if(player.money+liquidationValue(state,player.id)>=debt.amount)throw new Error('매각 가능한 자산으로 아직 지불할 수 있습니다.');
  if(debt.recipientId){const target=state.players.find(item=>item.id===debt.recipientId);if(target)target.money+=player.money}
  player.money=0;player.bankrupt=true;state.board.filter(tile=>tile.ownerId===player.id).forEach(tile=>{tile.ownerId=null;tile.buildingLevel=0});player.ownedProperties=[];player.specialAssets=[];state.pendingDebt=null;
  notice(state,'파산',`${player.name}이 게임에서 제외되었습니다.`,'danger');addLog(state,`${player.name}이 파산했습니다.`);
  const active=state.players.filter(item=>!item.bankrupt);if(active.length<=1){finishGame(state,'last-player');return}finishSimpleTile(state);
}

function nextActiveIndex(state,from){let next=from;do{next=(next+1)%state.players.length}while(state.players[next].bankrupt);return next}
function prepareTurn(state){
  const player=currentPlayer(state);state.pendingAction=null;state.pendingDebt=null;state.rolledDouble=false;state.rollTotal=0;
  if(player.skipTurns>0){player.skipTurns-=1;state.phase=PHASES.END_TURN;notice(state,'대기 중',`${player.name}은 이번 턴을 쉽니다.`,'warning');addLog(state,`${player.name}이 한 턴 쉽니다.`)}else state.phase=PHASES.WAITING_FOR_ROLL;
}

export function endTurn(state){
  requirePhase(state,PHASES.END_TURN);const oldIndex=state.currentPlayerIndex;
  const bonus=RULES.BONUS_TURN_ON_DOUBLE&&state.rolledDouble&&state.consecutiveDoubles<RULES.MAX_CONSECUTIVE_DOUBLES&&!currentPlayer(state).bankrupt;
  if(!bonus){state.currentPlayerIndex=nextActiveIndex(state,state.currentPlayerIndex);state.turnNumber+=1;state.consecutiveDoubles=0}else addLog(state,`${currentPlayer(state).name}이 더블 보너스 턴을 얻었습니다.`);
  prepareTurn(state);return {playerChanged:oldIndex!==state.currentPlayerIndex,bonusTurn:bonus};
}

export function openTrade(state){requirePhase(state,PHASES.WAITING_FOR_ROLL);state.phase=PHASES.TRADE;state.trade={stage:'editing'}}
function tradeableTiles(state,playerId){return state.board.filter(tile=>tile.ownerId===playerId&&(tile.type==='facility'||tile.buildingLevel===0))}
export function getTradeableAssets(state,playerId){return tradeableTiles(state,playerId)}

export function proposeTrade(state,proposal){
  requirePhase(state,PHASES.TRADE);const proposer=currentPlayer(state);const partner=state.players.find(player=>player.id===proposal.partnerId&&!player.bankrupt);
  if(!partner||partner.id===proposer.id)throw new Error('거래 상대를 선택하세요.');
  const offerCash=Math.max(0,Math.round(Number(proposal.offerCash)||0));const requestCash=Math.max(0,Math.round(Number(proposal.requestCash)||0));
  if(offerCash>proposer.money||requestCash>partner.money)throw new Error('제안한 현금이 보유 금액보다 많습니다.');
  const offered=proposal.offerAssetId?state.board.find(tile=>tile.id===proposal.offerAssetId):null;const requested=proposal.requestAssetId?state.board.find(tile=>tile.id===proposal.requestAssetId):null;
  if(offered&&(offered.ownerId!==proposer.id||offered.buildingLevel>0))throw new Error('제안 자산을 거래할 수 없습니다.');
  if(requested&&(requested.ownerId!==partner.id||requested.buildingLevel>0))throw new Error('요청 자산을 거래할 수 없습니다.');
  if(!offerCash&&!requestCash&&!offered&&!requested)throw new Error('거래할 현금이나 자산을 선택하세요.');
  state.trade={stage:'review',proposerId:proposer.id,partnerId:partner.id,offerCash,requestCash,offerAssetId:offered?.id||null,requestAssetId:requested?.id||null};
}

function transferTile(state,tileId,from,to){if(!tileId)return;const tile=state.board.find(item=>item.id===tileId);removeOwnedId(from,tile);tile.ownerId=to.id;(tile.type==='city'?to.ownedProperties:to.specialAssets).push(tile.id)}
export function resolveTrade(state,accepted){
  requirePhase(state,PHASES.TRADE);if(state.trade?.stage!=='review')throw new Error('검토할 거래가 없습니다.');const trade=state.trade;
  const proposer=state.players.find(player=>player.id===trade.proposerId);const partner=state.players.find(player=>player.id===trade.partnerId);
  if(accepted){
    if(proposer.money<trade.offerCash||partner.money<trade.requestCash)throw new Error('보유 현금이 달라져 거래를 완료할 수 없습니다.');
    proposer.money+=trade.requestCash-trade.offerCash;partner.money+=trade.offerCash-trade.requestCash;
    transferTile(state,trade.offerAssetId,proposer,partner);transferTile(state,trade.requestAssetId,partner,proposer);addLog(state,`${proposer.name}과 ${partner.name}의 거래가 성사되었습니다.`);
  }else addLog(state,`${partner.name}이 거래를 거절했습니다.`);
  state.trade=null;state.phase=PHASES.WAITING_FOR_ROLL;
}

export function cancelTrade(state){requirePhase(state,PHASES.TRADE);state.trade=null;state.phase=PHASES.WAITING_FOR_ROLL}
export function dismissNotice(state){state.notice=null}
export function updateClock(state,seconds=1){
  if(state.status!=='playing'||state.timer.remainingSeconds===null)return false;
  state.timer.remainingSeconds=Math.max(0,state.timer.remainingSeconds-seconds);if(state.timer.remainingSeconds===0){finishGame(state,'time-limit');return true}return false;
}
export function getNetWorth(state,playerId){return netWorth(state,playerId)}
export function canDeclareBankruptcy(state){const player=currentPlayer(state);return Boolean(state.pendingDebt&&player.money+liquidationValue(state,player.id)<state.pendingDebt.amount)}
export function cloneGame(state){return clone(state)}
