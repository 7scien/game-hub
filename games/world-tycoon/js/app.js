import {
  advanceMovement,buildCurrentTile,buyCurrentTile,cancelTrade,completeRoll,createGame,declareBankruptcy,declineDecision,dismissNotice,
  endTurn,finishMovement,openTrade,proposeTrade,resolveTrade,rollDice,sellAsset,sellBuilding,sellSpecialCard,settleDebt,updateClock,
} from './game.js';
import {clearGame,loadGame,saveGame} from './storage.js';
import {PHASES} from './rules.js';
import {
  animateTokenStep,captureTokenRect,closeFreeModal,renderGame,renderHelp,renderMenu,renderStart,showFreeModal,showMoneyFeedback,toast,updateTimer,
} from './ui.js';

const root=document.querySelector('#app');
let state=null;let savedGame=loadGame();let setup=Boolean(!savedGame);let playerCount=2;let actionLocked=false;let clockTicks=0;

function persist(){if(state?.status==='playing')saveGame(state);else if(state?.status==='finished')clearGame()}
function render(){
  if(state){const feedback=state.feedback;state.feedback=null;renderGame(root,state);if(feedback){showMoneyFeedback(feedback);persist()}}else renderStart(root,{savedGame,setup,playerCount});
}
function commit(action,{rerender=true}={}){
  try{const result=action();persist();if(rerender)render();return result}catch(error){toast(error.message||'행동을 완료하지 못했습니다.');return null}
}

function startGame(form){
  const data=new FormData(form);const names=Array.from({length:playerCount},(_,index)=>data.get(`player-${index}`));const mode=data.get('mode')||'30';
  state=createGame(playerCount,{mode,names});savedGame=null;persist();render();
}

async function handleRoll(){
  if(actionLocked)return;actionLocked=true;
  try{
    const rolled=commit(()=>rollDice(state));if(!rolled)return;
    const playerId=state.players[state.currentPlayerIndex].id;await new Promise(resolve=>setTimeout(resolve,720));commit(()=>completeRoll(state));
    while(state.phase===PHASES.MOVING){const fromRect=captureTokenRect(playerId);const advanced=commit(()=>advanceMovement(state),{rerender:false});if(!advanced)break;render();await animateTokenStep(playerId,fromRect);await new Promise(resolve=>setTimeout(resolve,55))}
    if(state.phase===PHASES.RESOLVING_TILE&&state.pendingMovement)commit(()=>finishMovement(state));
  }finally{actionLocked=false}
}

function handleEndTurn(){
  const result=commit(()=>endTurn(state));if(!result)return;
  if(result.bonusTurn)toast('더블! 한 번 더 굴리세요.');
}

document.addEventListener('submit',event=>{
  if(event.target.matches('[data-setup-form]')){event.preventDefault();startGame(event.target);return}
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
  if(action==='continue-game'){state=savedGame;savedGame=null;persist();render();return}
  if(action==='new-game'||action==='new-game-from-finish'){if(state)clearGame();state=null;savedGame=null;setup=true;render();return}
  if(action==='open-help'){showFreeModal(renderHelp());return}
  if(action==='open-menu'){showFreeModal(renderMenu());return}
  if(action==='close-free-modal'){closeFreeModal();return}
  if(action==='confirm-new-game'){clearGame();state=null;savedGame=null;setup=true;render();return}
  if(!state)return;
  if(action==='roll-dice'){handleRoll();return}
  if(action==='buy-tile'){commit(()=>buyCurrentTile(state));return}
  if(action==='build-tile'){commit(()=>buildCurrentTile(state));return}
  if(action==='decline-decision'){commit(()=>declineDecision(state));return}
  if(action==='end-turn'){handleEndTurn();return}
  if(action==='dismiss-notice'){commit(()=>dismissNotice(state));return}
  if(action==='sell-building'){commit(()=>sellBuilding(state,target.dataset.tile));return}
  if(action==='sell-asset'){commit(()=>sellAsset(state,target.dataset.tile));return}
  if(action==='sell-special-card'){commit(()=>sellSpecialCard(state,target.dataset.card));return}
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
});

setInterval(()=>{
  if(!state||state.status!=='playing')return;
  const ended=updateClock(state,1);clockTicks+=1;if(ended){persist();render();return}updateTimer(state);if(clockTicks%10===0)persist();
},1000);

window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);
render();
