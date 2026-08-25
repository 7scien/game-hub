import {InputManager} from './input.js';
import {AudioManager} from './audio.js';
import {PartyManager} from './party-manager.js';
import {PushArena} from './games/push-arena.js';
import {setupPWA} from './pwa.js';

const $=selector=>document.querySelector(selector);
const ui={
  canvas:$('#game'),hud:$('#hud'),combat:$('#combat-hud'),controls:$('#controls'),
  overlay:$('#overlay'),title:$('#overlay-title'),copy:$('#overlay-copy'),start:$('#start-button'),
  countdown:$('#countdown'),round:$('#round-label'),timer:$('#game-timer'),
  p1Wins:$('#p1-wins'),p2Wins:$('#p2-wins'),ring:$('#ring-score'),p1Ring:$('#p1-ring'),p2Ring:$('#p2-ring'),
  damage:[$('#p1-damage'),$('#p2-damage')],damageFill:[$('#p1-damage-fill'),$('#p2-damage-fill')],
  eventBanner:$('#event-banner'),eventName:$('#event-name')
};
const input=new InputManager(document),audio=new AudioManager(),party=new PartyManager(ui,{devMode:true});
let game=null,ticker=null,busy=false;

function showIntro(){
  busy=false;input.resetPointers();
  [ui.hud,ui.combat,ui.controls,ui.ring,ui.eventBanner].forEach(el=>el.classList.add('hidden'));
  ui.overlay.classList.remove('hidden');ui.title.textContent='PUSH ARENA';
  ui.copy.textContent='아이템과 아레나 변화를 이용해 상대를 밀어내세요!';
  ui.start.textContent=party.round?'다음 라운드':'게임 시작';
}

async function begin(){
  if(busy)return;busy=true;audio.unlock();ui.overlay.classList.add('hidden');
  [ui.hud,ui.combat,ui.controls,ui.ring].forEach(el=>el.classList.remove('hidden'));
  ui.p1Ring.textContent=ui.p2Ring.textContent='0';
  for(const text of ['3','2','1','GO!']){
    ui.countdown.textContent=text;ui.countdown.classList.remove('hidden');ui.countdown.style.animation='none';
    void ui.countdown.offsetWidth;ui.countdown.style.animation='pop .72s both';audio.tone(text==='GO!'?740:380,.09);
    await wait(text==='GO!'?600:800);
  }
  ui.countdown.classList.add('hidden');game=new PushArena(ui.canvas,input,audio,finish);game.start();
  clearInterval(ticker);ticker=setInterval(syncGameUI,60);
}

function syncGameUI(){
  if(!game)return;
  ui.timer.textContent=game.overtime?'OVERTIME':String(Math.ceil(game.time));
  ui.timer.classList.toggle('overtime',game.overtime);
  document.querySelectorAll('.dash').forEach((el,index)=>{
    const cooldown=game.players[index]?.cooldown||0;el.classList.toggle('cooling',cooldown>0);
    el.querySelector('i').style.height=`${cooldown/2*100}%`;el.querySelector('span').textContent=cooldown>0?cooldown.toFixed(1):'DASH';
  });
  const itemNames={shield:'SHIELD',power:'POWER',teleport:'BLINK'};
  document.querySelectorAll('.item-button').forEach((el,index)=>{
    const item=game.players[index]?.item;el.className=`item-button ${item||'empty'}`;
    el.querySelector('span').textContent=item?itemNames[item]:'–';
  });
  game.players.forEach((player,index)=>{
    const value=Math.round(player.knockback||0);ui.damage[index].textContent=`${value}%`;
    ui.damage[index].classList.toggle('danger',value>=70);ui.damageFill[index].style.width=`${value}%`;
  });
  if(game.eventNotice>0){ui.eventBanner.classList.remove('hidden');ui.eventName.textContent=game.eventLabel}
  else ui.eventBanner.classList.add('hidden');
}

function finish(winner){
  clearInterval(ticker);syncGameUI();party.record(winner);ui.controls.classList.add('hidden');ui.eventBanner.classList.add('hidden');
  ui.countdown.textContent=`P${winner+1} WIN!`;ui.countdown.classList.remove('hidden');audio.tone(winner?520:680,.3,'triangle',.05);
  setTimeout(()=>{
    ui.countdown.classList.add('hidden');party.advance();
    if(party.round>=8){
      const tie=party.wins[0]===party.wins[1];ui.overlay.classList.remove('hidden');
      ui.title.textContent=tie?'SUDDEN DEATH 준비 중':`P${party.wins[0]>party.wins[1]?1:2} 최종 승리!`;
      ui.copy.textContent=tie?'4 : 4 동점입니다. 추후 결승전 모드를 연결할 수 있어요.':`최종 스코어 ${party.wins[0]} : ${party.wins[1]}`;
      ui.start.textContent='처음부터 다시';ui.start.onclick=()=>{party.reset();ui.start.onclick=begin;showIntro()};
    }else showIntro();
  },2000);
}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
ui.start.onclick=begin;
addEventListener('resize',()=>game?.resize());
addEventListener('orientationchange',()=>setTimeout(()=>game?.resize(),150));
addEventListener('contextmenu',event=>event.preventDefault());
addEventListener('duo-score',event=>{ui.p1Ring.textContent=event.detail.score[0];ui.p2Ring.textContent=event.detail.score[1];ui.ring.animate?.([{transform:'translateX(-50%) scale(1.4)'},{transform:'translateX(-50%) scale(1)'}],{duration:280})});
document.addEventListener('visibilitychange',()=>{if(document.hidden)input.resetPointers()});
showIntro();
setupPWA();
window.__DUO_PARTY__={get game(){return game},party,begin,finish};
