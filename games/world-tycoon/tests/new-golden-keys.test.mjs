import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENT_CARDS} from '../js/data/events.js';
import {gamblerOutcome} from '../js/data/gambler.js';
import {completeRoll,createGame,declareBankruptcy,endTurn,resetEventDeck,resolveTile,rollDice,sellAsset,settleDebt} from '../js/game.js';
import {PHASES,RULES} from '../js/rules.js';
import {loadGame,saveGame} from '../js/storage.js';
import {renderGame} from '../js/ui.js';

const game=()=>createGame(2,{mode:'full',rng:()=>.2});
const roll=(state,a,b)=>{const values=[(a-.5)/6,(b-.5)/6];rollDice(state,()=>values.shift());return completeRoll(state)};
const draw=(state,id)=>{state.players[state.currentPlayerIndex].position=2;state.eventDeck=[id];state.eventCursor=0;resolveTile(state)};
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};

test('리셋과 도박사는 각각 한 장이며 합계 2~12의 금액과 문구가 고유하다',()=>{
  for(const id of ['golden-key-reset','las-vegas-gambler'])assert.equal(EVENT_CARDS.filter(card=>card.id===id).length,1);
  const results=Array.from({length:11},(_,i)=>gamblerOutcome(i+2));
  assert.deepEqual(results.map(result=>result.amount),[-200000,-300000,-400000,-500000,-600000,0,200000,300000,400000,500000,600000]);
  assert.equal(new Set(results.map(result=>result.quote)).size,11);
  assert.equal(gamblerOutcome(6).quote,'사실 도박은 실력이라는 것을 아시나요?');assert.equal(gamblerOutcome(7).quote,'여러가지로 운이 좋네요');
  assert.equal(gamblerOutcome(12).quote,'역시 도박은 실력이죠, 라스베가스의 지배자!');
  for(const total of [1,13,6.5,NaN])assert.throws(()=>gamblerOutcome(total));
});

test('리셋은 새 전체 덱을 무작위로 만들고 원래 배열을 수정하지 않는다',()=>{
  const state=game();const previous=state.eventDeck;const previousCopy=[...previous];
  resetEventDeck(state,()=>0);const first=[...state.eventDeck];resetEventDeck(state,()=>.99);
  assert.notDeepEqual(first,state.eventDeck);assert.deepEqual(previous,previousCopy);
  assert.deepEqual([...state.eventDeck].sort(),EVENT_CARDS.map(card=>card.id).sort());assert.equal(state.eventCursor,0);
});

for(const cursor of [0,17,EVENT_CARDS.length-1])test(`리셋을 ${cursor+1}번째로 뽑아도 전체 덱이 채워지고 기존 효과는 유지된다`,t=>{
  t.mock.method(Math,'random',()=>0);const state=game();const player=state.players[0];
  state.eventDeck=EVENT_CARDS.map(card=>card.id);const resetIndex=state.eventDeck.indexOf('golden-key-reset');[state.eventDeck[resetIndex],state.eventDeck[cursor]]=[state.eventDeck[cursor],state.eventDeck[resetIndex]];state.eventCursor=cursor;
  player.position=2;player.specialCards=['toll-waiver','island-escape'];player.gamblerPending=true;state.globalEffects.americanRage={remainingTurns:4};
  resolveTile(state);assert.equal(state.eventCursor,0);assert.equal(state.eventDeck.length,EVENT_CARDS.length);assert.equal(new Set(state.eventDeck).size,EVENT_CARDS.length);
  assert.equal(state.notice.title,'황금 열쇠 리셋');assert.ok(state.notice.message.includes(`${EVENT_CARDS.length}장`));assert.equal(state.phase,PHASES.END_TURN);
  assert.deepEqual(player.specialCards,['toll-waiver','island-escape']);assert.equal(player.gamblerPending,true);assert.equal(player.money,RULES.STARTING_MONEY);assert.equal(state.globalEffects.americanRage.remainingTurns,4);
});

test('일반 소진 후에도 전체 덱을 무작위로 채워 한 장만 뽑는다',t=>{
  t.mock.method(Math,'random',()=>0);const state=game();state.players[0].position=2;state.eventCursor=state.eventDeck.length;
  resolveTile(state);assert.equal(state.eventDeck.length,EVENT_CARDS.length);assert.equal(state.eventCursor,1);assert.equal(state.notice.title,EVENT_CARDS[1].title);
});

for(let total=2;total<=12;total++)test(`도박사 합 ${total}: 이동 전에 정확히 한 번 정산한다`,()=>{
  const state=game();draw(state,'las-vegas-gambler');const player=state.players[0];const before=player.money;
  assert.equal(player.gamblerPending,true);assert.equal(player.money,before);state.phase=PHASES.WAITING_FOR_ROLL;
  const a=Math.min(6,total-1);roll(state,a,total-a);const outcome=gamblerOutcome(total);
  assert.equal(player.money,before+outcome.amount);assert.equal(player.gamblerPending,false);assert.equal(player.position,2);
  assert.deepEqual(state.feedback.gambler,outcome);assert.equal(state.pendingMovement.remaining,total);
  assert.throws(()=>completeRoll(state));assert.equal(player.money,before+outcome.amount);
});

test('다른 플레이어의 주사위는 도박사 효과를 소모하지 않는다',()=>{
  const state=game();draw(state,'las-vegas-gambler');endTurn(state);roll(state,6,6);
  assert.equal(state.players[0].gamblerPending,true);assert.equal(state.players[1].money,RULES.STARTING_MONEY);assert.equal(state.feedback,null);
});

test('더블 보너스 주사위에도 적용하며 다음 차례로 미루지 않는다',()=>{
  const state=game();draw(state,'las-vegas-gambler');state.rolledDouble=true;state.consecutiveDoubles=1;endTurn(state);roll(state,4,4);
  assert.equal(state.currentPlayerIndex,0);assert.equal(state.players[0].money,RULES.STARTING_MONEY+200000);assert.equal(state.consecutiveDoubles,2);
});

test('현금 부족 시 저장 후 자산을 정리하고 같은 주사위로 이동을 재개한다',()=>{
  const state=game();const player=state.players[0];player.money=150000;player.gamblerPending=true;
  const tile=state.board.find(tile=>tile.id==='busan');tile.ownerId=player.id;player.ownedProperties.push(tile.id);
  const result=roll(state,1,5);assert.equal(result.gamblingDebt,true);assert.equal(state.phase,PHASES.ASSET_MANAGEMENT);assert.equal(player.money,150000);assert.equal(state.feedback.gambler.pendingPayment,true);
  const saved=storage();saveGame(state,saved);const restored=loadGame(saved);assert.equal(restored.players[0].gamblerPending,false);assert.equal(restored.pendingDebt.afterPayment.type,'resumeRoll');
  sellAsset(restored,'busan');settleDebt(restored);assert.equal(restored.players[0].money,50000);assert.equal(restored.phase,PHASES.MOVING);assert.equal(restored.pendingMovement.remaining,6);assert.deepEqual(restored.dice,[1,5]);assert.equal(restored.pendingDebt,null);
});

test('손실금을 못 내면 기존 규칙으로 파산하며 이동하지 않는다',()=>{
  const state=game();state.players[0].money=0;state.players[0].gamblerPending=true;roll(state,3,3);declareBankruptcy(state);
  assert.equal(state.players[0].bankrupt,true);assert.equal(state.players[0].gamblerPending,false);assert.equal(state.pendingMovement,null);assert.equal(state.status,'finished');
});

test('무인도 주사위도 정산하고 빚을 갚은 뒤 더블 탈출을 이어간다',()=>{
  const state=game();const player=state.players[0];player.position=10;player.skipTurns=1;player.money=50000;player.gamblerPending=true;
  const tile=state.board.find(tile=>tile.id==='jeju');tile.ownerId=player.id;player.ownedProperties.push(tile.id);
  roll(state,1,1);assert.equal(player.skipTurns,1);assert.equal(state.pendingMovement,null);sellAsset(state,'jeju');const result=settleDebt(state);
  assert.equal(result.islandEscaped,true);assert.equal(player.skipTurns,0);assert.equal(player.money,50000);assert.equal(state.pendingMovement.remaining,2);
});

test('무인도 실패와 연속 세 번 더블에서도 도박사 정산은 먼저 적용된다',()=>{
  const state=game();const player=state.players[0];player.position=10;player.skipTurns=1;player.gamblerPending=true;roll(state,2,3);
  assert.equal(player.money,RULES.STARTING_MONEY-500000);assert.equal(state.phase,PHASES.END_TURN);assert.equal(player.islandFailedRolls,1);
  player.skipTurns=0;player.position=0;player.gamblerPending=true;state.phase=PHASES.WAITING_FOR_ROLL;state.consecutiveDoubles=2;roll(state,6,6);
  assert.equal(player.money,RULES.STARTING_MONEY+100000);assert.equal(player.position,10);assert.equal(state.phase,PHASES.END_TURN);
});

test('대기 효과와 리셋한 덱 순서를 저장하고 옛 저장에도 두 카드를 한 번만 추가한다',()=>{
  const state=game();state.players[0].gamblerPending=true;resetEventDeck(state,()=>.4);const saved=storage();saveGame(state,saved);const restored=loadGame(saved);
  assert.equal(restored.players[0].gamblerPending,true);assert.deepEqual(restored.eventDeck,state.eventDeck);assert.equal(restored.eventCursor,0);
  delete state.players[0].gamblerPending;state.eventDeck=state.eventDeck.filter(id=>!['golden-key-reset','las-vegas-gambler'].includes(id));state.eventCursor=4;saveGame(state,saved);
  const migrated=loadGame(saved);assert.equal(migrated.players[0].gamblerPending,false);assert.equal(migrated.eventCursor,4);assert.equal(migrated.eventDeck.length,EVENT_CARDS.length);saveGame(migrated,saved);assert.equal(loadGame(saved).eventDeck.length,EVENT_CARDS.length);
});

test('게임판에 실제 카드 수와 다음 주사위 적용 대기를 표시한다',()=>{
  const state=game();state.players[0].gamblerPending=true;const root={querySelector:()=>null};renderGame(root,state);
  assert.ok(root.innerHTML.includes(`황금열쇠 카드 ${EVENT_CARDS.length}장`));assert.match(root.innerHTML,/내 다음 주사위에 자동 적용/);
});
