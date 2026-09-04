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
async function playOverlay(kind,label,markup,duration,animate,reducedDuration=700){
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
    await pause(reducedMotion()?reducedDuration:duration);
  }finally{animations.forEach(animation=>animation.cancel());layer.remove()}
}

function targetRing(point,label=''){
  return `<span class="motion-target-ring" style="left:${point.x}px;top:${point.y}px"><b>${escapeHtml(label)}</b></span>`;
}

export async function showGamblerResult({total,amount,quote,pendingPayment=false}){
  const tone=amount<0?'loss':amount>0?'win':'draw';const magnitude=Math.abs(amount)/100000;
  const amountLabel=amount===0?'0원 · 변동 없음':`${amount>0?'+':'−'}${formatMoney(Math.abs(amount))}`;
  const status=pendingPayment?'손실 확정 · 자산 정리 후 지불':amount<0?'은행에 지불했습니다':amount>0?'은행에서 받았습니다':'잃지도, 얻지도 않았습니다';
  await playOverlay(`gambler ${tone}`,`라스베가스의 도박사 · 주사위 합 ${total} · ${amountLabel} · ${quote} · ${status}`,
    `<section class="gambler-result-card"><small>라스베가스의 도박사</small><div class="gambler-roll"><span aria-hidden="true">🎲</span><b>${total}</b><span>주사위 합</span></div><strong class="gambler-amount">${amountLabel}</strong><p class="gambler-quote">${escapeHtml(quote)}</p><em>${status}</em>${pendingPayment?'<span class="gambler-payment-hint">지불을 마치면 이 주사위로 이동합니다.</span>':''}</section>`,2800,(layer,run)=>{
      run(layer.querySelector('.gambler-result-card'),[{opacity:0,transform:move(0,15,.9)},{opacity:1,transform:move()}],{duration:300});
      run(layer.querySelector('.gambler-amount'),tone==='loss'?[{translate:'0 0'},{translate:`${magnitude}px 0`,offset:.25},{translate:`-${magnitude}px 0`,offset:.5},{translate:'0 0'}]:[{scale:.8,opacity:.4},{scale:1.08,opacity:1,offset:.7},{scale:1,opacity:1}],{duration:460,delay:250});
    },2800);
}

export async function animateTransportStatus({locked,tiles=[]}){
  const panels=tiles.map(tile=>({tile,rect:findTile(tile.index)?.getBoundingClientRect()})).filter(item=>item.rect);
  if(!panels.length)return;
  const title=locked?'이동수단 운항 중단':'이동수단 운항 재개';
  await playOverlay('transport',title,
    `<div class="motion-transport-caption ${locked?'is-closed':'is-open'}"><span aria-hidden="true">${locked?'⛔':'✓'}</span><strong>${title}</strong><small>${locked?'탈것·우주여행·황금열쇠 이동 불가':'탈것·우주여행·황금열쇠 이동 가능'}</small></div>${panels.map(({tile,rect},index)=>`<div class="motion-transport-frame ${locked?'is-closed':'is-open'}" aria-label="${escapeHtml(tile.name)} ${locked?'운항 중단':'운항 재개'}" style="left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px"><span class="motion-transport-shutter" data-shutter="${index}" aria-hidden="true">⛔</span><b class="motion-transport-signal" data-signal="${index}">${locked?'중단':'재개'}</b></div>`).join('')}`,1250,(layer,run)=>{
      panels.forEach((_,index)=>{
        run(layer.querySelector(`[data-shutter="${index}"]`),locked?[{transform:'translateY(-105%)'},{transform:'translateY(5%)',offset:.8},{transform:'translateY(0)'}]:[{transform:'translateY(0)'},{transform:'translateY(-105%)'}],{duration:600,delay:index*90});
        run(layer.querySelector(`[data-signal="${index}"]`),[{opacity:0,scale:.65},{opacity:1,scale:1.12,offset:.65},{opacity:1,scale:1}],{duration:400,delay:400+index*90});
      });
    });
}

export async function animateCityLanding({tile,player}){
  const element=findTile(tile?.index);if(!element||!player)return;const rect=element.getBoundingClientRect();
  const lights=[[12,0],[38,0],[64,0],[90,0],[100,28],[100,72],[88,100],[62,100],[36,100],[10,100],[0,72],[0,28]];
  const token=document.querySelector(`[data-player-token="${player.id}"] b`);
  const labelX=Math.max(95,Math.min(innerWidth-95,rect.left+rect.width/2));const labelY=Math.max(24,Math.min(innerHeight-30,rect.top-23));
  await playOverlay('landing',`${player.name}, ${tile.name} 도착`,
    `<div class="motion-runway" style="left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;--landing-color:${player.color}">${lights.map(([x,y],index)=>`<i data-runway-light="${index}" style="left:${x}%;top:${y}%"></i>`).join('')}<span class="motion-runway-outline"></span></div><span class="motion-landing-caption" style="left:${labelX}px;top:${labelY}px">${escapeHtml(tile.name)} 도착</span>`,780,(layer,run)=>{
      lights.forEach((_,index)=>run(layer.querySelector(`[data-runway-light="${index}"]`),[{opacity:.12,scale:.7},{opacity:1,scale:1.35,offset:.5},{opacity:.5,scale:1}],{duration:300,delay:index*32}));
      run(layer.querySelector('.motion-runway-outline'),[{opacity:0},{opacity:1,offset:.65},{opacity:0}],{duration:700});
      run(token,[{translate:'0 -14px',scale:1.22},{translate:'0 2px',scale:.94,offset:.65},{translate:'0 0',scale:1}],{duration:420,delay:240});
    });
}

export async function animateTurnSpotlight({player,bonus=false}){
  if(!player)return;
  const token=document.querySelector(`[data-player-token="${player.id}"]`);const tokenRect=token?.getBoundingClientRect();
  const panels=[findPlayer(player.id),document.querySelector('.current-player')].filter(Boolean).map(element=>element.getBoundingClientRect());
  const tokenPoint=tokenRect?{x:tokenRect.left+tokenRect.width/2,y:tokenRect.top+tokenRect.height/2}:null;
  await playOverlay('turn',`${player.name}${bonus?'의 더블 보너스 차례':'의 차례'}`,
    `<div class="motion-turn-banner" style="--spotlight-color:${player.color}"><i aria-hidden="true">${escapeHtml(player.token||'✈')}</i><div><small>${bonus?'더블 · 한 번 더!':'차례 시작'}</small><strong>${escapeHtml(player.name)}</strong></div></div>${panels.map((rect,index)=>`<span class="motion-player-focus" data-player-focus="${index}" style="left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;--spotlight-color:${player.color}"></span>`).join('')}${tokenPoint?`<span class="motion-token-focus" style="left:${tokenPoint.x}px;top:${tokenPoint.y}px;--spotlight-color:${player.color}"></span>`:''}`,850,(layer,run)=>{
      run(layer.querySelector('.motion-turn-banner'),[{opacity:0,transform:move(0,-12,.92)},{opacity:1,transform:move(),offset:.25},{opacity:1,transform:move(),offset:.78},{opacity:0,transform:move(0,-7)}],{duration:850});
      panels.forEach((_,index)=>run(layer.querySelector(`[data-player-focus="${index}"]`),[{opacity:0},{opacity:1,offset:.4},{opacity:0}],{duration:820}));
      run(layer.querySelector('.motion-token-focus'),[{opacity:0,transform:move(0,0,.4)},{opacity:1,transform:move(0,0,1.15),offset:.45},{opacity:0,transform:move(0,0,1.35)}],{duration:800});
      run(token?.querySelector('b'),[{filter:'brightness(1)'},{filter:'brightness(1.6)',offset:.5},{filter:'brightness(1)'}],{duration:760});
    });
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
