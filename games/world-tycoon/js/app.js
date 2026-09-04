import {
  advanceMovement,buildCurrentTile,buildOwnedCity,buyCurrentTile,cancelTrade,castEarlyAuctionVote,chooseBermudaPlayer,chooseIndustrializationCity,chooseSpaceTravelDestination,chooseTerrorTarget,chooseWorldCupCity,completeRoll,createGame,declareBankruptcy,declineDecision,dismissNotice,getPaymentPlayer,resolveNextEvent,
  endTurn,finishBuildMode,finishMovement,openBuildMode,openTrade,passAuction,placeAuctionBid,proposeEarlyAuction,proposeTrade,repayBankLoan,resolveTrade,rollDice,sellAsset,sellBuilding,sellSpecialCard,settleDebt,takeBankLoan,updateClock,useSpecialCard,
} from './game.js';
import {clearGame,loadGames,saveGame} from './storage.js';
import {PHASES} from './rules.js';
import {animateCityLanding,animateGoldenKeyReset,animateIslandEscape,animatePurchase,animateSpaceFlight,animateTollWaiver,animateTransportStatus,animateTurnSpotlight} from './animations.js';
import {capturePresentation,presentationChanges} from './motion-events.js';
import {
  animateAuctionAward,animateAuctionBid,animateBankruptcy,animateBuildingDestruction,animateDiceThrow,animateEarlyAuctionConsent,animateGenevaConvention,animateHalftimeAuction,animateIndustrialization,animateLandmarkConstruction,animateRegionMonopoly,animateSecondHalfStart,animateTokenStep,animateWorldCup,captureTokenRect,closeFreeModal,renderGame,renderHelp,renderMenu,renderStart,showFreeModal,showMoneyFeedback,toast,updateTimer,
} from './ui.js';

const root=document.querySelector('#app');
let lastPresentation=null;
let state=null;let savedGames=loadGames();let setup=false;let selectedSlot=Math.max(1,savedGames.findIndex(game=>!game)+1);let playerCount=2;let actionLocked=false;let clockTicks=0;let lastAnimatedNoticeId=null;let cinematicQueue=Promise.resolve();let cinematicPending=0;

function refreshSaves(){savedGames=loadGames()}
function persist(){if(state?.status==='playing')saveGame(state);else if(state?.status==='finished')clearGame(globalThis.localStorage,state.saveSlot)}
function queueCinematic(play){cinematicPending+=1;cinematicQueue=cinematicQueue.then(play).catch(()=>{}).finally(()=>{cinematicPending-=1});return cinematicQueue}
function captureBankruptcyCandidates(){
  if(!state)return new Map();const recipientId=state.pendingDebt?.recipientId||null;
  return new Map(state.players.filter(player=>!player.bankrupt).map(player=>[player.id,{player:{id:player.id,name:player.name,color:player.color,token:player.token},recipientId,assets:state.board.filter(tile=>tile.ownerId===player.id).map(tile=>{const rect=document.querySelector(`[data-tile-index="${tile.index}"]`)?.getBoundingClientRect();return {index:tile.index,name:tile.name,icon:tile.icon,landmarkGlyph:tile.landmarkGlyph,buildingLevel:tile.buildingLevel,rect:rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:null}})}]));
}
function completedMonopolies(){
  if(!state)return new Map();const regions=new Map();state.board.filter(tile=>tile.type==='city').forEach(tile=>{if(!regions.has(tile.region))regions.set(tile.region,[]);regions.get(tile.region).push(tile)});const completed=new Map();
  regions.forEach((tiles,region)=>{const ownerId=tiles[0]?.ownerId;if(!ownerId||!tiles.every(tile=>tile.ownerId===ownerId))return;const player=state.players.find(item=>item.id===ownerId);if(!player||player.bankrupt)return;completed.set(`${ownerId}:${region}`,{region,player:{id:player.id,name:player.name,color:player.color,token:player.token},tiles:tiles.map(tile=>({index:tile.index,name:tile.name,icon:tile.icon}))})});return completed;
}
async function animateNewMonopolies(before){for(const [key,result] of completedMonopolies())if(!before.has(key))await queueCinematic(()=>animateRegionMonopoly(result))}
function render(){
  if(state){
    const feedbacks=[...(state.feedbackQueue||[]),...(state.feedback?[state.feedback]:[])];const viewState=state;const noticeAnimation=state.notice?.animation;const noticeId=state.notice?.id;
    const resetAnimation=noticeAnimation?.type==='resetEventDeck'&&noticeId!==lastAnimatedNoticeId?noticeAnimation:null;if(resetAnimation)lastAnimatedNoticeId=noticeId;
    const changes=presentationChanges(lastPresentation,state);lastPresentation=capturePresentation(state);const hasPresentation=feedbacks.length||changes.transport||changes.arrival||changes.turn||resetAnimation;
    state.feedback=null;state.feedbackQueue=[];renderGame(root,hasPresentation?{...state,notice:null}:state);
    if(hasPresentation){persist();queueCinematic(async()=>{try{if(changes.transport)await animateTransportStatus(changes.transport);if(changes.arrival)await animateCityLanding(changes.arrival);for(const feedback of feedbacks)await showMoneyFeedback(feedback);if(resetAnimation)await animateGoldenKeyReset(resetAnimation);if(changes.turn)await animateTurnSpotlight(changes.turn)}finally{if(state===viewState)render()}})}
    else if(noticeAnimation?.type==='genevaConvention'&&noticeId!==lastAnimatedNoticeId){lastAnimatedNoticeId=noticeId;queueCinematic(async()=>{await new Promise(resolve=>setTimeout(resolve,720));await animateGenevaConvention(noticeAnimation)})}
  }else{lastPresentation=null;renderStart(root,{savedGames,setup,playerCount,selectedSlot})}
}
function commit(action,{rerender=true}={}){
  const bankruptcyBefore=captureBankruptcyCandidates();
  try{const result=action();const bankruptcies=state?state.players.filter(player=>player.bankrupt&&bankruptcyBefore.has(player.id)).map(player=>({...bankruptcyBefore.get(player.id),reason:state.notice?.message||`${player.name}이 파산했습니다.`})):[];persist();if(rerender)render();bankruptcies.forEach(animation=>queueCinematic(()=>animateBankruptcy(animation)));return result}catch(error){toast(error.message||'행동을 완료하지 못했습니다.');return null}
}

function startGame(form){
  const data=new FormData(form);const names=Array.from({length:playerCount},(_,index)=>data.get(`player-${index}`));const mode=data.get('mode')||'30';
  state=createGame(playerCount,{mode,names,saveSlot:selectedSlot});persist();render();
}

async function handleRoll(){
  if(actionLocked||cinematicPending)return;actionLocked=true;
  try{
    const rolled=commit(()=>rollDice(state));if(!rolled)return;
    const dice=[...state.dice];const total=state.rollTotal;await animateDiceThrow(dice,total);const rollResult=commit(()=>completeRoll(state));await playResolvedRoll(rollResult);
  }finally{actionLocked=false}
}

async function playResolvedRoll(rollResult){
  const player=state.players[state.currentPlayerIndex];const playerId=player.id;
  await cinematicQueue;
  if(rollResult?.islandPrevented)toast('제네바 협정으로 무인도 이동이 취소되었습니다.');else if(rollResult?.islandEscaped)await queueCinematic(()=>animateIslandEscape({player,method:rollResult.islandAutoReleased?'automatic':'double'}));
  while(state.phase===PHASES.MOVING){const fromRect=captureTokenRect(playerId);const advanced=commit(()=>advanceMovement(state),{rerender:false});if(!advanced)break;render();await animateTokenStep(playerId,fromRect);await cinematicQueue;await new Promise(resolve=>setTimeout(resolve,55))}
  if(state.phase===PHASES.RESOLVING_TILE&&state.pendingMovement){const tile=state.board[player.position];if(tile?.type==='city')await queueCinematic(()=>animateCityLanding({tile,player}));commit(()=>finishMovement(state))}
}

async function handleSettleDebt(action=()=>settleDebt(state)){
  if(actionLocked||cinematicPending)return;actionLocked=true;
  try{const result=commit(()=>({rollResult:action()}));if(result)await playResolvedRoll(result.rollResult)}finally{actionLocked=false}
}

async function handleEndTurn(){
  const result=commit(()=>endTurn(state));if(result?.type==='auction-start')await queueCinematic(()=>animateHalftimeAuction(result));
}

async function handleTerrorTarget(tileId){
  if(actionLocked)return;actionLocked=true;
  try{const result=commit(()=>chooseTerrorTarget(state,tileId));if(result){await animateBuildingDestruction(result);toast(result.completed?`${result.tileName}까지 폭격해 911 카드 효과가 끝났습니다.`:`${result.tileName}의 건물이 파괴되었습니다. ${result.remainingTargets}곳 더 선택하세요.`)}}finally{actionLocked=false}
}

async function handleBuyTile(){
  if(actionLocked)return;actionLocked=true;
  const monopolies=completedMonopolies();const player=state.players[state.currentPlayerIndex];const tile=state.board[state.pendingAction?.tileIndex];
  try{const result=commit(()=>buyCurrentTile(state),{rerender:false});if(result){await queueCinematic(()=>animatePurchase({tile,player}));render();await animateNewMonopolies(monopolies);if(result.type==='auction-start')await queueCinematic(()=>animateHalftimeAuction(result))}}finally{actionLocked=false}
}

async function handleSpaceDestination(index){
  if(actionLocked)return;actionLocked=true;const player=state.players[state.currentPlayerIndex];const fromIndex=player.position;
  try{const tile=commit(()=>chooseSpaceTravelDestination(state,index),{rerender:false});if(tile){if(!player.bankrupt)await queueCinematic(()=>animateSpaceFlight({fromIndex,toIndex:tile.index,tileName:tile.name,player}));render()}}finally{actionLocked=false}
}

async function handleSpecialCard(cardId){
  if(actionLocked)return;actionLocked=true;const player=getPaymentPlayer(state);const amount=state.pendingDebt?.amount||0;
  try{const used=commit(()=>{useSpecialCard(state,cardId);return true},{rerender:false});if(used){await queueCinematic(()=>cardId==='toll-waiver'?animateTollWaiver({player,amount}):animateIslandEscape({player}));render()}}finally{actionLocked=false}
}

async function handleBuildTile(tileId=null){
  if(actionLocked)return;const tile=tileId?state.board.find(item=>item.id===tileId):state.board[state.pendingAction?.tileIndex];if(!tile)return;
  actionLocked=true;const previousLevel=tile.buildingLevel;
  try{const result=commit(()=>tileId?buildOwnedCity(state,tileId):buildCurrentTile(state));if(result)await animateLandmarkConstruction({tileIndex:result.index,tileName:result.name,landmarkName:result.landmarkName,landmarkGlyph:result.landmarkGlyph,previousLevel,newLevel:result.buildingLevel})}finally{actionLocked=false}
}

async function handleIndustrialization(tileId){
  if(actionLocked)return;actionLocked=true;
  try{const result=commit(()=>chooseIndustrializationCity(state,tileId));if(result)await animateIndustrialization(result)}finally{actionLocked=false}
}

async function handleAuctionResult(action){
  if(actionLocked)return;actionLocked=true;
  const monopolies=completedMonopolies();try{const result=commit(action,{rerender:false});if(result?.type==='auction-award'){await queueCinematic(()=>animateAuctionAward(result));await animateNewMonopolies(monopolies);if(result.finished)await queueCinematic(()=>animateSecondHalfStart());render()}else{render();if(result?.type==='auction-bid')await animateAuctionBid(result)}}finally{actionLocked=false}
}

async function handleWorldCupCity(tileId){
  if(actionLocked)return;actionLocked=true;
  try{const tile=commit(()=>chooseWorldCupCity(state,tileId));if(tile){const player=state.players.find(item=>item.id===tile.ownerId);await queueCinematic(()=>animateWorldCup({tile,player,turns:tile.worldCupTurns}))}}finally{actionLocked=false}
}

async function handleTradeResolution(accepted){
  if(actionLocked)return;actionLocked=true;const monopolies=completedMonopolies();
  try{commit(()=>resolveTrade(state,accepted));if(accepted)await animateNewMonopolies(monopolies)}finally{actionLocked=false}
}

async function handleEarlyAuctionVote(approved){
  if(actionLocked)return;actionLocked=true;
  const vote=state.earlyAuctionVote;const voter=state.players.find(player=>player.id===vote?.currentVoterId);const total=vote?.voterIds?.length||state.players.filter(player=>!player.bankrupt).length;const approvedCount=(vote?.approvedIds?.length||0)+(approved?1:0);
  try{const result=commit(()=>castEarlyAuctionVote(state,approved));if(result&&approved&&voter)await animateEarlyAuctionConsent({player:voter,approvedCount,total,final:result.type==='auction-start'});if(result?.type==='auction-start')await animateHalftimeAuction(result)}finally{actionLocked=false}
}

async function handleProposeEarlyAuction(){
  if(actionLocked)return;actionLocked=true;const proposer=state.players[state.currentPlayerIndex];
  try{const vote=commit(()=>proposeEarlyAuction(state));if(vote)await animateEarlyAuctionConsent({player:proposer,approvedCount:1,total:vote.voterIds.length,final:false})}finally{actionLocked=false}
}

document.addEventListener('submit',event=>{
  if((actionLocked||cinematicPending)&&event.target.matches('[data-setup-form],[data-loan-form],[data-auction-bid-form],[data-trade-form]')){event.preventDefault();return}
  if(event.target.matches('[data-setup-form]')){event.preventDefault();startGame(event.target);return}
  if(event.target.matches('[data-loan-form]')){event.preventDefault();const data=new FormData(event.target);commit(()=>takeBankLoan(state,data.get('loanAmount')));return}
  if(event.target.matches('[data-auction-bid-form]')){event.preventDefault();const data=new FormData(event.target);handleAuctionResult(()=>placeAuctionBid(state,data.get('auctionBid')));return}
  if(event.target.matches('[data-trade-form]')){
    event.preventDefault();const data=new FormData(event.target);commit(()=>proposeTrade(state,Object.fromEntries(data.entries())));
  }
});

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
  if((actionLocked||cinematicPending)&&!['open-help','close-free-modal'].includes(action))return;
  if(action==='choose-player-count'){
    playerCount=Number(target.dataset.players);document.querySelectorAll('[data-action="choose-player-count"]').forEach(button=>button.classList.toggle('active',button===target));document.querySelectorAll('[data-name-field]').forEach(field=>field.classList.toggle('hidden',Number(field.dataset.nameField)>=playerCount));return;
  }
  if(action==='continue-game'){const slot=Math.min(2,Math.max(1,Number(target.dataset.slot)||1));state=savedGames[slot-1];selectedSlot=slot;persist();render();return}
  if(action==='new-game'||action==='new-game-from-finish'){selectedSlot=Math.min(2,Math.max(1,Number(target.dataset.slot)||state?.saveSlot||selectedSlot));state=null;setup=true;render();return}
  if(action==='open-help'){showFreeModal(renderHelp());return}
  if(action==='open-menu'){showFreeModal(renderMenu());return}
  if(action==='close-free-modal'){closeFreeModal();return}
  if(action==='choose-save-slot'){closeFreeModal();persist();state=null;refreshSaves();setup=false;render();return}
  if(action==='confirm-new-game'){selectedSlot=state?.saveSlot||selectedSlot;clearGame(globalThis.localStorage,selectedSlot);state=null;refreshSaves();setup=true;render();return}
  if(!state)return;
  if(action==='roll-dice'){handleRoll();return}
  if(action==='resolve-next-event'){commit(()=>resolveNextEvent(state));return}
  if(action==='choose-bermuda-player'){commit(()=>chooseBermudaPlayer(state,target.dataset.player));return}
  if(action==='buy-tile'){handleBuyTile();return}
  if(action==='build-tile'){handleBuildTile();return}
  if(action==='open-build-mode'){commit(()=>openBuildMode(state));return}
  if(action==='build-owned-city'){handleBuildTile(target.dataset.tile);return}
  if(action==='finish-build-mode'){commit(()=>finishBuildMode(state));return}
  if(action==='propose-early-auction'){handleProposeEarlyAuction();return}
  if(action==='cast-early-auction-vote'){handleEarlyAuctionVote(target.dataset.approved==='true');return}
  if(action==='pass-auction'){handleAuctionResult(()=>passAuction(state));return}
  if(action==='repay-bank-loan'){commit(()=>repayBankLoan(state));return}
  if(action==='choose-space-destination'){handleSpaceDestination(Number(target.dataset.destinationIndex));return}
  if(action==='choose-world-cup-city'){handleWorldCupCity(target.dataset.tile);return}
  if(action==='choose-terror-target'){handleTerrorTarget(target.dataset.tile);return}
  if(action==='choose-industrialization-city'){handleIndustrialization(target.dataset.tile);return}
  if(action==='decline-decision'){commit(()=>declineDecision(state));return}
  if(action==='end-turn'){handleEndTurn();return}
  if(action==='dismiss-notice'){commit(()=>dismissNotice(state));return}
  if(action==='sell-building'){commit(()=>sellBuilding(state,target.dataset.tile));return}
  if(action==='sell-asset'){commit(()=>sellAsset(state,target.dataset.tile));return}
  if(action==='sell-special-card'){commit(()=>sellSpecialCard(state,target.dataset.card));return}
  if(action==='use-special-card'){handleSpecialCard(target.dataset.card);return}
  if(action==='settle-debt'){handleSettleDebt();return}
  if(action==='declare-bankruptcy'){handleSettleDebt(()=>declareBankruptcy(state));return}
  if(action==='open-trade'){commit(()=>openTrade(state));return}
  if(action==='cancel-trade'){commit(()=>cancelTrade(state));return}
  if(action==='accept-trade'){handleTradeResolution(true);return}
  if(action==='reject-trade'){handleTradeResolution(false);return}
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){const freeModal=document.querySelector('.free-modal');if(freeModal)closeFreeModal()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="roll-dice"]')){event.preventDefault();handleRoll()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-space-destination"]')){event.preventDefault();event.target.click()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-terror-target"]')){event.preventDefault();event.target.click()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-industrialization-city"]')){event.preventDefault();event.target.click()}
});

setInterval(()=>{
  if(!state||state.status!=='playing'||actionLocked||cinematicPending)return;
  const ended=updateClock(state,1);clockTicks+=1;if(ended){persist();render();return}updateTimer(state);if(clockTicks%10===0)persist();
},1000);

window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);
render();
