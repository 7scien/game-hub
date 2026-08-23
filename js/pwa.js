const $=selector=>document.querySelector(selector);

export function setupPWA(){
  const installButton=$('#pwa-install'),sheet=$('#install-sheet'),closeButton=$('#install-close');
  const note=$('#install-note'),status=$('#offline-status');let deferredPrompt=null;
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const secure=window.isSecureContext||location.hostname==='localhost'||location.hostname==='127.0.0.1';

  if(standalone){status.textContent='오프라인 앱으로 실행 중';status.classList.add('ready')}
  else if(isIOS){installButton.classList.remove('hidden');installButton.textContent='iPad에 설치'}

  addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();deferredPrompt=event;installButton.classList.remove('hidden');installButton.textContent='앱 설치';
  });

  installButton.addEventListener('click',async()=>{
    if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButton.classList.add('hidden');return}
    note.textContent=secure?'설치 후에는 Wi‑Fi 없이 홈 화면에서 바로 실행할 수 있어요.':'오프라인 설치에는 HTTPS 공개 주소가 필요합니다. 배포된 HTTPS 주소를 Safari로 열어주세요.';
    sheet.classList.remove('hidden');
  });
  closeButton.addEventListener('click',()=>sheet.classList.add('hidden'));
  sheet.addEventListener('pointerdown',event=>{if(event.target===sheet)sheet.classList.add('hidden')});

  if(!('serviceWorker' in navigator)||!secure){status.textContent=secure?'이 브라우저는 오프라인 설치를 지원하지 않아요':'설치하려면 HTTPS 주소가 필요해요';return}
  addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;
      status.textContent='오프라인 플레이 준비 완료';status.classList.add('ready');
      registration.update().catch(()=>{});
    }catch{status.textContent='오프라인 준비에 실패했어요'}
  });
  addEventListener('appinstalled',()=>{installButton.classList.add('hidden');status.textContent='설치 완료 · 오프라인 플레이 가능';status.classList.add('ready')});
}
