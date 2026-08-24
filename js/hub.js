import {games} from './games.js';
import {isStandaloneDisplay} from '../shared/platform.js';

const $=selector=>document.querySelector(selector);
const standalone=isStandaloneDisplay();
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let deferredPrompt=null;

function gameCard(game,index){
  const action=game.ready?'플레이':'슬롯 확인';
  return `<a class="game-card theme-${game.theme}" href="${game.href}" style="--delay:${index*70}ms" aria-label="${game.title} ${action}"><div class="card-top"><span>${game.kicker}</span><b>${game.ready?'PLAYABLE':'COMING SOON'}</b></div><div class="card-mark" aria-hidden="true">${game.mark}</div><div class="card-copy"><h3>${game.title}</h3><p>${game.description}</p></div><div class="card-meta"><span>${game.players}</span><span>${game.duration}</span><strong>${action} →</strong></div></a>`;
}

function renderGames(){
  $('#game-grid').innerHTML=games.map(gameCard).join('');
  $('#game-count').textContent=`플레이 가능 ${games.filter(game=>game.ready).length} · 전체 ${games.length}`;
}

function showInstallGuide(){
  $('#install-steps').innerHTML=isIOS?'<ol><li>Safari의 <b>공유</b> 버튼을 누르세요.</li><li><b>홈 화면에 추가</b>를 선택하세요.</li><li>오른쪽 위의 <b>추가</b>를 누르세요.</li></ol>':'<ol><li>Chrome 오른쪽 위의 <b>⋮ 메뉴</b>를 여세요.</li><li><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요.</li></ol>';
  $('#install-dialog').showModal();
}

function setupInstall(){
  const button=$('#install-button');
  if(standalone){document.documentElement.classList.add('standalone');button.hidden=true;return}
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;button.textContent='Game Hub 설치'});
  button.addEventListener('click',async()=>{if(!deferredPrompt){showInstallGuide();return}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null});
  addEventListener('appinstalled',()=>{button.hidden=true;$('#offline-status').textContent='설치 완료 · 오프라인 플레이 가능'});
}

async function setupOffline(){
  const status=$('#offline-status');
  if(!('serviceWorker' in navigator)||!window.isSecureContext){status.textContent='HTTPS에서 오프라인 설치 가능';return}
  try{
    const registration=await navigator.serviceWorker.register(new URL('./sw.js',document.baseURI),{scope:'./',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    status.textContent=standalone?'오프라인 앱으로 실행 중':'오프라인 준비 완료';status.classList.add('ready');registration.update().catch(()=>{});
  }catch(error){console.error('Game Hub service worker registration failed',error);status.textContent='오프라인 준비 실패 · 새로고침 필요'}
}

renderGames();setupInstall();setupOffline();
