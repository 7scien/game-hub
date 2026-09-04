import {formatMoney} from './rules.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const reducedMotion=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const findTile=index=>document.querySelector(`[data-tile-index="${Number(index)}"]`);
const findPlayer=id=>document.querySelector(`[data-player-mini="${id}"]`);
const centerOf=element=>{
  const rect=element?.getBoundingClientRect();
  return {x:Math.min(innerWidth-28,Math.max(28,rect?rect.left+rect.width/2:innerWidth/2)),y:Math.min(innerHeight-28,Math.max(28,rect?rect.top+rect.height/2:innerHeight/2))};
};
const move=(x=0,y=0,scale=1)=>`translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${scale})`;

// Every overlay owns its animations and removes them, including cancelled ones.
async function playOverlay(kind,label,markup,duration,animate){
  const layer=document.createElement('div');
  layer.className=`tycoon-motion tycoon-motion-${kind}${reducedMotion()?' motion-reduced':''}`;
  layer.setAttribute('role','status');layer.setAttribute('aria-label',label);layer.innerHTML=markup;
  const animations=[];
  const run=(element,keyframes,options={})=>{
    if(!element?.animate)return;
    const animation=element.animate(keyframes,{duration:650,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both',...options});
    animation.finished.catch(()=>{});animations.push(animation);
  };
  document.body.append(layer);
  try{
    if(!reducedMotion())animate?.(layer,run);
    await pause(reducedMotion()?700:duration);
  }finally{animations.forEach(animation=>animation.cancel());layer.remove()}
}

function targetRing(point,label=''){
  return `<span class="motion-target-ring" style="left:${point.x}px;top:${point.y}px"><b>${escapeHtml(label)}</b></span>`;
}

export async function animatePurchase({tile,player}){
  if(!tile||!player)return;
  const target=centerOf(findTile(tile.index));const origin={x:innerWidth/2,y:innerHeight*.46};
  await playOverlay('purchase',`${player.name}이 ${tile.name}을 ${formatMoney(tile.purchasePrice)}에 구입했습니다.`,
    `<section class="motion-deed" style="--motion-owner:${player.color}"><small>부동산 매매 계약</small><h2>${escapeHtml(tile.name)}</h2><p>${escapeHtml(tile.englishName)}</p><dl><div><dt>매수인</dt><dd>${escapeHtml(player.name)}</dd></div><div><dt>매매 금액</dt><dd>${formatMoney(tile.purchasePrice)}</dd></div></dl><strong class="motion-deed-stamp">계약 완료</strong></section>${targetRing(target,'내 땅')}`,1350,(layer,run)=>{
      run(layer.querySelector('.motion-deed'),[{opacity:0,transform:move(0,28,.84)},{opacity:1,transform:move(),offset:.2},{opacity:1,transform:move(),offset:.72},{opacity:0,transform:move(target.x-origin.x,target.y-origin.y,.13)}],{duration:1300});
      run(layer.querySelector('.motion-deed-stamp'),[{opacity:0,transform:'scale(2.2) rotate(-16deg)'},{opacity:1,transform:'scale(.94) rotate(-8deg)',offset:.7},{opacity:1,transform:'scale(1) rotate(-8deg)'}],{duration:380,delay:260});
      run(layer.querySelector('.motion-target-ring'),[{opacity:0,transform:move(0,0,.4)},{opacity:1,transform:move(0,0,1.25)},{opacity:0,transform:move(0,0,1.7)}],{duration:520,delay:800});
    });
}

export async function animateMoneyTransfer(transfer){
  if(!transfer)return;
  const salary=transfer.type==='salary';
  const source=centerOf(salary?findTile(0):findPlayer(transfer.payerId));
  const destination=centerOf(findPlayer(transfer.recipientId));
  const dx=destination.x-source.x;const dy=destination.y-source.y;
  const path=`left:${source.x}px;top:${source.y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)`;
  const amount=formatMoney(transfer.amount);
  await playOverlay(salary?'salary':'toll',salary?`${transfer.recipientName}에게 월급 ${amount} 입금`:`${transfer.payerName}에서 ${transfer.recipientName}에게 ${amount} 송금`,
    `<div class="motion-transfer-route"><span>${salary?'출발 · 월급':escapeHtml(transfer.payerName)}</span><b>→</b><span>${escapeHtml(transfer.recipientName)}</span><strong>${amount}</strong></div><i class="motion-money-path" style="${path}"></i>${Array.from({length:3},(_,i)=>`<span class="motion-money-chip" data-chip="${i}" style="left:${source.x}px;top:${source.y}px">₩</span>`).join('')}${targetRing(destination,'입금')}`,
    1150,(layer,run)=>{
      run(layer.querySelector('.motion-money-path'),[{opacity:0},{opacity:.8,offset:.25},{opacity:0}],{duration:1000});
      layer.querySelectorAll('.motion-money-chip').forEach((chip,i)=>run(chip,[{opacity:0,transform:move(0,0,.5)},{opacity:1,transform:move(dx*.2,dy*.2-24,1),offset:.2},{opacity:1,transform:move(dx,dy),offset:.85},{opacity:0,transform:move(dx,dy,.4)}],{duration:750,delay:i*100}));
      run(layer.querySelector('.motion-target-ring'),[{opacity:0,transform:move(0,0,.5)},{opacity:1,transform:move()},{opacity:0,transform:move(0,0,1.5)}],{duration:430,delay:680});
    });
}

export async function animateSpaceFlight({fromIndex,toIndex,tileName,player}){
  const source=centerOf(findTile(fromIndex));const destination=centerOf(findTile(toIndex));
  const dx=destination.x-source.x;const dy=destination.y-source.y;
  await playOverlay('space',`${player.name}이 우주여행으로 ${tileName}에 도착합니다.`,
    `<div class="motion-flight-caption"><small>우주여행</small><strong>${escapeHtml(tileName)} 도착</strong></div><span class="motion-rocket" style="left:${source.x}px;top:${source.y}px" aria-hidden="true">🚀</span>${Array.from({length:8},(_,i)=>`<i class="motion-flight-dot" style="left:${source.x+dx*i/7}px;top:${source.y+dy*i/7-55*Math.sin(Math.PI*i/7)}px"></i>`).join('')}${targetRing(destination,'도착')}`,1450,(layer,run)=>{
      run(layer.querySelector('.motion-rocket'),[{opacity:0,transform:move(0,0,.5)},{opacity:1,transform:move(0,-18,1.1),offset:.15},{opacity:1,transform:move(dx*.5,dy*.5-65,1.25),offset:.55},{opacity:1,transform:move(dx,dy,.7),offset:.88},{opacity:0,transform:move(dx,dy,.3)}],{duration:1250});
      layer.querySelectorAll('.motion-flight-dot').forEach((dot,i)=>run(dot,[{opacity:0,scale:.3},{opacity:.85,scale:1},{opacity:0,scale:.3}],{duration:480,delay:180+i*110}));
      run(layer.querySelector('.motion-target-ring'),[{opacity:0,transform:move(0,0,.4)},{opacity:1,transform:move()},{opacity:0,transform:move(0,0,1.8)}],{duration:500,delay:920});
    });
}

export async function animateTollWaiver({player,amount}){
  await playOverlay('waiver',`${player.name}이 우대권을 사용해 ${formatMoney(amount)}을 면제받았습니다.`,
    `<section class="motion-special-card"><span class="motion-shield" aria-hidden="true">🛡️</span><small>우대권 사용</small><h2>통행료 방어!</h2><del>${formatMoney(amount)}</del><strong>지불 0원</strong><p>${escapeHtml(player.name)}</p></section>`,1250,(layer,run)=>{
      run(layer.querySelector('.motion-special-card'),[{opacity:0,transform:move(0,20,.8)},{opacity:1,transform:move()}],{duration:350});
      run(layer.querySelector('.motion-shield'),[{transform:'scale(.4)',filter:'brightness(1)'},{transform:'scale(1.3)',filter:'brightness(1.65)',offset:.6},{transform:'scale(1)',filter:'brightness(1)'}],{duration:560});
      run(layer.querySelector('del'),[{opacity:0,transform:'translateX(25px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,delay:380});
      run(layer.querySelector('.motion-special-card>strong'),[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.1)',offset:.7},{opacity:1,transform:'scale(1)'}],{duration:400,delay:550});
    });
}

export async function animateIslandEscape({player,method='card'}){
  const point=centerOf(findTile(10));
  const reason=method==='double'?'더블 성공':method==='automatic'?'세 번째 차례':'무인도 탈출권';
  await playOverlay('escape',`${player.name}이 ${reason}으로 무인도에서 풀려났습니다.`,
    `<div class="motion-flight-caption"><small>${reason}</small><strong>무인도 탈출!</strong><span>${escapeHtml(player.name)}</span></div><span class="motion-escape-plane" style="left:${point.x}px;top:${point.y}px;color:${player.color}" aria-hidden="true">${escapeHtml(player.token||'✈')}</span><span class="motion-unlock" style="left:${point.x}px;top:${point.y}px" aria-hidden="true">🔓</span>${targetRing(point,'자유')}`,1100,(layer,run)=>{
      run(layer.querySelector('.motion-unlock'),[{opacity:1,transform:move(0,0,.8)},{opacity:1,transform:move(0,-20,1.35),offset:.45},{opacity:0,transform:move(0,25,.5)}],{duration:650});
      run(layer.querySelector('.motion-escape-plane'),[{opacity:0,transform:move()},{opacity:1,transform:move(0,-38,1.25),offset:.5},{opacity:0,transform:move(28,-58,.7)}],{duration:730,delay:220});
      run(layer.querySelector('.motion-target-ring'),[{opacity:0,transform:move(0,0,.3)},{opacity:1,transform:move()},{opacity:0,transform:move(0,0,1.7)}],{duration:600,delay:280});
    });
}
