import test from 'node:test';
import assert from 'node:assert/strict';
import {animateCityLanding,animateIslandEscape,animateMoneyTransfer,animatePurchase,animateSpaceFlight,animateTollWaiver,animateTransportStatus,animateTurnSpotlight} from '../js/animations.js';
import {animateDiceThrow,showMoneyFeedback} from '../js/ui.js';
import {gamblerOutcome} from '../js/data/gambler.js';

// Unit-level animation lifecycle checks; no browser or rendering dependencies.
function animationEnvironment(t,{reduced=false,throwOnAnimation=0}={}){
  const nodes=[];const animations=[];let animationCalls=0;
  class Element{
    constructor(){this.style={setProperty(){}};this.classList={add(){},remove(){}};this.attributes={};this.children=new Map();this.removed=false;nodes.push(this)}
    setAttribute(key,value){this.attributes[key]=value}
    getBoundingClientRect(){return {left:80,top:120,width:60,height:70}}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector)}
    querySelectorAll(selector){return Array.from({length:selector==='.cinematic-die'?2:selector==='.motion-flight-dot'?8:3},(_,index)=>this.querySelector(`${selector}-${index}`))}
    append(element){this.appended??=[];this.appended.push(element)}
    remove(){this.removed=true}
    animate(keyframes,options){
      animationCalls+=1;if(animationCalls===throwOnAnimation)throw new Error('Animation unavailable');
      const animation={keyframes,options,cancelled:false,finished:Promise.resolve(),cancel(){this.cancelled=true}};animations.push(animation);return animation;
    }
  }
  const body=new Element();const anchors=new Element();
  const globals={document:{body,createElement:()=>new Element(),querySelector:selector=>selector.includes('animation')||selector.includes('feedback')?null:anchors.querySelector(selector)},innerWidth:390,innerHeight:844,matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{fn();return 1}};
  for(const [key,value] of Object.entries(globals)){const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key])}
  t.mock.method(globalThis,'setTimeout',callback=>{queueMicrotask(callback);return 1});
  return {nodes,animations,body};
}

const player={id:'player-1',name:'구매자 <테스트>',color:'#57dcb8',token:'✈'};
const tile={index:1,name:'타이페이',englishName:'Taipei',purchasePrice:50000};

for(const reduced of [false,true])test(`도박사 결과는 손익·무승부·지불 대기를 한 화면에 표시한다 (${reduced?'동작 줄이기':'일반'})`,async t=>{
  const env=animationEnvironment(t,{reduced});
  for(const total of [2,6,7,8,12])await showMoneyFeedback({gambler:gamblerOutcome(total)});
  await showMoneyFeedback({gambler:{...gamblerOutcome(6),pendingPayment:true}});
  const markup=env.body.appended.map(layer=>layer.innerHTML);
  assert.match(markup[0],/−20만 원/);assert.match(markup[1],/−60만 원/);assert.match(markup[2],/0원 · 변동 없음/);assert.ok(!markup[2].includes('−0'));
  assert.match(markup[3],/\+20만 원/);assert.match(markup[4],/\+60만 원/);assert.match(markup[5],/손실 확정 · 자산 정리 후 지불/);assert.ok(!markup[5].includes('은행에 지불했습니다'));
  assert.equal(env.body.appended.length,6);assert.ok(env.body.appended.every(layer=>layer.removed));assert.ok(env.animations.every(animation=>animation.cancelled));
});

for(const reduced of [false,true])test(`운항·착륙·차례 연출의 ${reduced?'정적 안내':'애니메이션'}와 정리가 정상 동작한다`,async t=>{
  const env=animationEnvironment(t,{reduced});const tiles=[{index:15,name:'콩코드여객기'},{index:28,name:'퀸 엘리자베스호'},{index:30,name:'우주여행'},{index:32,name:'콜럼비아호'}];
  await animateTransportStatus({locked:true,tiles});await animateTransportStatus({locked:false,tiles});
  await animateCityLanding({tile,player});await animateTurnSpotlight({player});await animateTurnSpotlight({player,bonus:true});
  assert.ok(env.body.appended.every(layer=>layer.removed));assert.ok(env.nodes.some(node=>node.innerHTML?.includes('타이페이 도착')));
  assert.ok(env.nodes.some(node=>node.innerHTML?.includes('더블 · 한 번 더!')));
  if(reduced)assert.equal(env.animations.length,0);else{assert.ok(env.animations.length>30);assert.ok(env.animations.every(animation=>animation.cancelled))}
});

for(const reduced of [false,true])test(`7종 추가 연출은 완료 시 정리되며 ${reduced?'동작 줄이기':'일반 동작'} 설정을 따른다`,async t=>{
  const env=animationEnvironment(t,{reduced});
  await animatePurchase({tile,player});
  await animateMoneyTransfer({type:'salary',recipientId:player.id,recipientName:player.name,amount:200000});
  await animateMoneyTransfer({type:'toll',payerId:player.id,payerName:player.name,recipientId:'player-2',recipientName:'소유주',amount:50000});
  await animateSpaceFlight({fromIndex:30,toIndex:1,tileName:tile.name,player});
  await animateTollWaiver({player,amount:600000});
  for(const method of ['card','double','automatic'])await animateIslandEscape({player,method});
  await animateDiceThrow([4,4],8);
  assert.ok(env.body.appended.every(layer=>layer.removed));
  assert.ok(env.nodes.some(node=>node.innerHTML?.includes('구매자 &lt;테스트&gt;')));
  assert.ok(env.nodes.some(node=>node.textContent==='더블!'||node.innerHTML?.includes('dice-double-badge')));
  if(reduced)assert.equal(env.animations.length,0);else{assert.ok(env.animations.length>20);assert.ok(env.animations.filter(animation=>animation.options.duration!==1660).every(animation=>animation.cancelled))}
});

test('주사위가 더블이 아니면 더블 배지를 표시하지 않는다',async t=>{
  const env=animationEnvironment(t);await animateDiceThrow([2,6],8);
  assert.ok(!env.nodes.some(node=>node.textContent==='더블!'||node.innerHTML?.includes('dice-double-badge')));
});

test('연출 실패 시에도 오버레이와 시작된 애니메이션을 정리한다',async t=>{
  const env=animationEnvironment(t,{throwOnAnimation:2});
  await assert.rejects(()=>animatePurchase({tile,player}),/Animation unavailable/);
  assert.ok(env.body.appended.every(layer=>layer.removed));assert.ok(env.animations.every(animation=>animation.cancelled));
});

test('산업화 정산은 일반 송금과 중복 재생되지 않는다',async t=>{
  const env=animationEnvironment(t);await showMoneyFeedback({title:'통행료',amount:-100000,message:'정산',tone:'danger',transfer:{type:'toll',payerId:'player-1',recipientId:'player-2',amount:100000},industrialSplit:{payerId:'player-1',recipientId:'player-2',ownerAmount:80000,bankAmount:20000}});
  assert.ok(env.body.appended.some(layer=>layer.className==='industrial-rent-split'));
  assert.ok(!env.body.appended.some(layer=>layer.className?.includes('tycoon-motion-toll')));
  assert.ok(env.body.appended.every(layer=>layer.removed));
});
