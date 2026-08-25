import {isStandaloneDisplay} from '../../../shared/platform.js';

const $=selector=>document.querySelector(selector);

export function setupPWA(){
  const installButton=$('#pwa-install'),sheet=$('#install-sheet'),closeButton=$('#install-close'),status=$('#offline-status');
  const standalone=isStandaloneDisplay();
  installButton.classList.remove('hidden');
  installButton.textContent=standalone?'GAME HUB 앱':'GAME HUB로 이동';
  status.textContent=standalone?'Game Hub 오프라인 앱에서 실행 중':'설치와 오프라인 관리는 Game Hub에서 합니다';
  if(standalone)status.classList.add('ready');
  installButton.addEventListener('click',()=>{location.href='../../'});
  closeButton.addEventListener('click',()=>sheet.classList.add('hidden'));
  sheet.addEventListener('pointerdown',event=>{if(event.target===sheet)sheet.classList.add('hidden')});
}
