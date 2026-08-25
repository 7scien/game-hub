(()=>{
  try{
    const homeUrl=new URL(/* @vite-ignore */'../',import.meta.url).href;
    const style=document.createElement('style');
    style.id='game-hub-shell-style';
    style.textContent='#game-hub-home{position:fixed;z-index:2147483647;left:max(9px,env(safe-area-inset-left));top:max(9px,env(safe-area-inset-top));width:46px;height:46px;display:grid;place-items:center;border:1px solid #fff4;border-radius:15px;color:#fff;background:#11152dcc;box-shadow:0 7px 24px #0006;text-decoration:none;font:900 22px/1 system-ui,-apple-system,sans-serif;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);touch-action:manipulation}#game-hub-home:hover,#game-hub-home:focus-visible{background:#242a53;transform:translateY(-2px);outline:3px solid #c8ff5b;outline-offset:2px}@media(prefers-reduced-motion:reduce){#game-hub-home{transition:none}}';
    document.head.append(style);
    const link=document.createElement('a');
    link.id='game-hub-home';link.href=homeUrl;link.setAttribute('aria-label','Game Hub 홈으로 돌아가기');link.title='Game Hub 홈';link.textContent='⌂';
    document.body.append(link);
  }catch(error){console.error('Game Hub home control failed',error)}
})();
