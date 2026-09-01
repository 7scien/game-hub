import {
  advanceMovement,buildCurrentTile,buildOwnedCity,buyCurrentTile,cancelTrade,castEarlyAuctionVote,chooseIndustrializationCity,chooseSpaceTravelDestination,chooseTerrorTarget,chooseWorldCupCity,completeRoll,createGame,declareBankruptcy,declineDecision,dismissNotice,
  endTurn,finishBuildMode,finishMovement,openBuildMode,openTrade,passAuction,placeAuctionBid,proposeEarlyAuction,proposeTrade,repayBankLoan,resolveTrade,rollDice,sellAsset,sellBuilding,sellSpecialCard,settleDebt,takeBankLoan,updateClock,useSpecialCard,
} from './game.js';
import {clearGame,loadGames,saveGame} from './storage.js';
import {PHASES} from './rules.js';
import {
  animateAuctionAward,animateAuctionBid,animateBuildingDestruction,animateGenevaConvention,animateHalftimeAuction,animateIndustrialization,animateLandmarkConstruction,animateSecondHalfStart,animateTokenStep,captureTokenRect,closeFreeModal,renderGame,renderHelp,renderMenu,renderStart,showDiceResult,showFreeModal,showMoneyFeedback,toast,updateTimer,
} from './ui.js';

const root=document.querySelector('#app');
let state=null;let savedGames=loadGames();let setup=false;let selectedSlot=Math.max(1,savedGames.findIndex(game=>!game)+1);let playerCount=2;let actionLocked=false;let clockTicks=0;let lastAnimatedNoticeId=null;

function refreshSaves(){savedGames=loadGames()}
function persist(){if(state?.status==='playing')saveGame(state);else if(state?.status==='finished')clearGame(globalThis.localStorage,state.saveSlot)}
function render(){
  if(state){const feedback=state.feedback;const noticeAnimation=state.notice?.animation;const noticeId=state.notice?.id;state.feedback=null;renderGame(root,state);if(feedback){showMoneyFeedback(feedback);persist()}if(noticeAnimation?.type==='genevaConvention'&&noticeId!==lastAnimatedNoticeId){lastAnimatedNoticeId=noticeId;setTimeout(()=>animateGenevaConvention(noticeAnimation),720)}}else renderStart(root,{savedGames,setup,playerCount,selectedSlot});
}
function commit(action,{rerender=true}={}){
  try{const result=action();persist();if(rerender)render();return result}catch(error){toast(error.message||'행동을 완료하지 못했습니다.');return null}
}

function startGame(form){
  const data=new FormData(form);const names=Array.from({length:playerCount},(_,index)=>data.get(`player-${index}`));const mode=data.get('mode')||'30';
  state=createGame(playerCount,{mode,names,saveSlot:selectedSlot});persist();render();
}

async function handleRoll(){
  if(actionLocked)return;actionLocked=true;
  try{
    const rolled=commit(()=>rollDice(state));if(!rolled)return;
    const playerId=state.players[state.currentPlayerIndex].id;await new Promise(resolve=>setTimeout(resolve,720));await showDiceResult([...state.dice],state.rollTotal);const rollResult=commit(()=>completeRoll(state));if(rollResult?.islandPrevented)toast('제네바 협정으로 무인도 이동이 취소되었습니다.');else if(rollResult?.islandAutoReleased)toast('세 번째 차례! 무인도에서 자동 탈출합니다.');else if(rollResult?.islandEscaped)toast('더블! 무인도를 탈출합니다.');
    while(state.phase===PHASES.MOVING){const fromRect=captureTokenRect(playerId);const advanced=commit(()=>advanceMovement(state),{rerender:false});if(!advanced)break;render();await animateTokenStep(playerId,fromRect);await new Promise(resolve=>setTimeout(resolve,55))}
    if(state.phase===PHASES.RESOLVING_TILE&&state.pendingMovement)commit(()=>finishMovement(state));
  }finally{actionLocked=false}
}

function handleEndTurn(){
  const result=commit(()=>endTurn(state));if(!result)return;
  if(result.bonusTurn)toast('더블! 한 번 더 굴리세요.');
}

async function handleTerrorTarget(tileId){
  if(actionLocked)return;actionLocked=true;
  try{const result=commit(()=>chooseTerrorTarget(state,tileId));if(result){await animateBuildingDestruction(result);toast(result.completed?`${result.tileName}까지 폭격해 911 카드 효과가 끝났습니다.`:`${result.tileName}의 건물이 파괴되었습니다. ${result.remainingTargets}곳 더 선택하세요.`)}}finally{actionLocked=false}
}

async function handleBuyTile(){
  if(actionLocked)return;actionLocked=true;
  try{const result=commit(()=>buyCurrentTile(state));if(result?.type==='auction-start')await animateHalftimeAuction(result)}finally{actionLocked=false}
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
  try{const result=commit(action);if(result?.type==='auction-bid')await animateAuctionBid(result);if(result?.type==='auction-award'){await animateAuctionAward(result);if(result.finished)await animateSecondHalfStart()}}finally{actionLocked=false}
}

async function handleEarlyAuctionVote(approved){
  if(actionLocked)return;actionLocked=true;
  try{const result=commit(()=>castEarlyAuctionVote(state,approved));if(result?.type==='auction-start')await animateHalftimeAuction(result)}finally{actionLocked=false}
}

document.addEventListener('submit',event=>{
  if(event.target.matches('[data-setup-form]')){event.preventDefault();startGame(event.target);return}
  if(event.target.matches('[data-loan-form]')){event.preventDefault();const data=new FormData(event.target);commit(()=>takeBankLoan(state,data.get('loanAmount')));return}
  if(event.target.matches('[data-auction-bid-form]')){event.preventDefault();const data=new FormData(event.target);handleAuctionResult(()=>placeAuctionBid(state,data.get('auctionBid')));return}
  if(event.target.matches('[data-trade-form]')){
    event.preventDefault();const data=new FormData(event.target);commit(()=>proposeTrade(state,Object.fromEntries(data.entries())));
  }
});

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
  if(actionLocked&&action!=='open-help')return;
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
  if(action==='buy-tile'){handleBuyTile();return}
  if(action==='build-tile'){handleBuildTile();return}
  if(action==='open-build-mode'){commit(()=>openBuildMode(state));return}
  if(action==='build-owned-city'){handleBuildTile(target.dataset.tile);return}
  if(action==='finish-build-mode'){commit(()=>finishBuildMode(state));return}
  if(action==='propose-early-auction'){commit(()=>proposeEarlyAuction(state));return}
  if(action==='cast-early-auction-vote'){handleEarlyAuctionVote(target.dataset.approved==='true');return}
  if(action==='pass-auction'){handleAuctionResult(()=>passAuction(state));return}
  if(action==='repay-bank-loan'){commit(()=>repayBankLoan(state));return}
  if(action==='choose-space-destination'){commit(()=>chooseSpaceTravelDestination(state,Number(target.dataset.destinationIndex)));return}
  if(action==='choose-world-cup-city'){commit(()=>chooseWorldCupCity(state,target.dataset.tile));return}
  if(action==='choose-terror-target'){handleTerrorTarget(target.dataset.tile);return}
  if(action==='choose-industrialization-city'){handleIndustrialization(target.dataset.tile);return}
  if(action==='decline-decision'){commit(()=>declineDecision(state));return}
  if(action==='end-turn'){handleEndTurn();return}
  if(action==='dismiss-notice'){commit(()=>dismissNotice(state));return}
  if(action==='sell-building'){commit(()=>sellBuilding(state,target.dataset.tile));return}
  if(action==='sell-asset'){commit(()=>sellAsset(state,target.dataset.tile));return}
  if(action==='sell-special-card'){commit(()=>sellSpecialCard(state,target.dataset.card));return}
  if(action==='use-special-card'){commit(()=>useSpecialCard(state,target.dataset.card));return}
  if(action==='settle-debt'){commit(()=>settleDebt(state));return}
  if(action==='declare-bankruptcy'){commit(()=>declareBankruptcy(state));return}
  if(action==='open-trade'){commit(()=>openTrade(state));return}
  if(action==='cancel-trade'){commit(()=>cancelTrade(state));return}
  if(action==='accept-trade'){commit(()=>resolveTrade(state,true));return}
  if(action==='reject-trade'){commit(()=>resolveTrade(state,false));return}
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){const freeModal=document.querySelector('.free-modal');if(freeModal)closeFreeModal()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="roll-dice"]')){event.preventDefault();handleRoll()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-space-destination"]')){event.preventDefault();event.target.click()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-terror-target"]')){event.preventDefault();event.target.click()}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-action="choose-industrialization-city"]')){event.preventDefault();event.target.click()}
});

setInterval(()=>{
  if(!state||state.status!=='playing')return;
  const ended=updateClock(state,1);clockTicks+=1;if(ended){persist();render();return}updateTimer(state);if(clockTicks%10===0)persist();
},1000);

window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);
render();
