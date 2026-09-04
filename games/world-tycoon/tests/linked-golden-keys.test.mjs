import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMovement,buildCurrentTile,buyCurrentTile,chooseBermudaPlayer,chooseIndustrializationCity,chooseSpaceTravelDestination,chooseTerrorTarget,chooseWorldCupCity,completeRoll,createGame,declareBankruptcy,declineDecision,endTurn,getBermudaTargets,getPaymentPlayer,resolveNextEvent,resolveTile,rollDice,sellAsset,settleDebt,takeBankLoan,useSpecialCard} from '../js/game.js';
import {EVENT_CARDS} from '../js/data/events.js';
import {oathPartner,paymentPlan,startOath} from '../js/oath.js';
import {PHASES,RULES,calculateRent} from '../js/rules.js';
import {loadGame,saveGame} from '../js/storage.js';
import {renderGame,renderHelp} from '../js/ui.js';
import {capturePresentation,presentationChanges} from '../js/motion-events.js';

const game=(n=3)=>createGame(n,{mode:'full',rng:()=>.2});
const draw=(s,...ids)=>{s.players[s.currentPlayerIndex].position=2;s.eventDeck=ids;s.eventCursor=0;resolveTile(s)};
const own=(s,id,p=1)=>{const tile=s.board.find(t=>t.id===id);tile.ownerId=s.players[p].id;(tile.type==='city'?s.players[p].ownedProperties:s.players[p].specialAssets).push(id);return tile};
const linked=s=>startOath(s,s.players[0].id,()=>0);
const balances=s=>s.players.map(p=>p.money);
const changes=(s,before)=>balances(s).map((n,i)=>n-before[i]);
const roll=(s,a,b)=>{s.phase=PHASES.WAITING_FOR_ROLL;const values=[(a-.5)/6,(b-.5)/6];rollDice(s,()=>values.shift());return completeRoll(s)};
const roundTrip=s=>{const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};saveGame(s,storage);return loadGame(storage)};

test('새 카드들은 한 장씩 포함되고 리셋은 현재 전체 41장을 사용한다',()=>{
  assert.equal(EVENT_CARDS.length,41);for(const id of ['bermuda-triangle','peach-garden-oath','ask-and-double'])assert.equal(EVENT_CARDS.filter(c=>c.id===id).length,1);
  const s=game();draw(s,'golden-key-reset');assert.equal(s.eventDeck.length,EVENT_CARDS.length);assert.equal(s.notice.animation.count,EVENT_CARDS.length);
});

test('버뮤다는 상대를 지정하고 소유지에서도 위치만 교환한다',()=>{
  const s=game();const tile=own(s,'seoul-olympic',2);s.players[1].position=tile.index;s.players[2].position=10;s.players[2].skipTurns=1;
  draw(s,'bermuda-triangle');assert.equal(s.phase,PHASES.BERMUDA_DECISION);assert.deepEqual(getBermudaTargets(s).map(p=>p.id),['player-2']);
  assert.throws(()=>chooseBermudaPlayer(s,'player-1'));assert.throws(()=>chooseBermudaPlayer(s,'player-3'));
  const before=balances(s);const snap=capturePresentation(s);chooseBermudaPlayer(s,'player-2');
  assert.equal(s.players[0].position,tile.index);assert.equal(s.players[1].position,2);assert.deepEqual(balances(s),before);assert.equal(s.phase,PHASES.END_TURN);assert.equal(s.pendingDebt,null);assert.equal(presentationChanges(snap,s).arrival,null);
  roll(s,1,2);advanceMovement(s);assert.equal(s.players[0].position,(tile.index+1)%40);
});

test('버뮤다는 출발·우주여행 도착 효과를 발동하지 않고 대상이 없으면 끝난다',()=>{
  for(const position of [0,30,20]){const s=game(2);s.welfareFund=500000;s.players[1].position=position;draw(s,'bermuda-triangle');chooseBermudaPlayer(s,'player-2');assert.equal(s.phase,PHASES.END_TURN);assert.equal(s.players[0].lapsCompleted,0);assert.equal(s.welfareFund,500000);assert.equal(s.players[0].money,RULES.STARTING_MONEY)}
  const s=game(2);s.players[1].position=10;draw(s,'bermuda-triangle');assert.equal(s.phase,PHASES.END_TURN);assert.match(s.notice.message,/교환 상대가 없어/);
  s.players[1].position=5;s.globalEffects.americanRage={remainingTurns:4};draw(s,'bermuda-triangle');assert.equal(s.phase,PHASES.END_TURN);assert.equal(s.players[0].position,2);
});

test('도원결의는 무작위 생존 상대를 선택하고 겹치는 결의만 대체한다',()=>{
  const s=game(4);startOath(s,'player-1',()=>0);startOath(s,'player-3',()=>.99);assert.equal(s.oaths.length,2);
  startOath(s,'player-1',()=>.5);assert.equal(oathPartner(s,'player-1').id,'player-3');assert.equal(s.oaths.length,1);
  s.players[1].bankrupt=true;assert.notEqual(startOath(s,'player-1',()=>0).id,'player-2');
});

test('도원결의 기간은 발동 차례 뒤 생존 인원×2 일반 차례이며 더블은 차감하지 않는다',()=>{
  const s=game(3);linked(s);s.phase=PHASES.END_TURN;endTurn(s);assert.equal(s.oaths[0].remainingTurns,6);
  s.phase=PHASES.END_TURN;s.rolledDouble=true;s.consecutiveDoubles=1;endTurn(s);assert.equal(s.oaths[0].remainingTurns,6);
  for(let i=0;i<5;i++){s.phase=PHASES.END_TURN;s.rolledDouble=false;endTurn(s)}assert.equal(s.oaths[0].remainingTurns,1);
  s.phase=PHASES.END_TURN;endTurn(s);assert.equal(s.oaths.length,0);
});

test('월급·현금 보너스·사회복지기금 수령을 절반씩 받는다',()=>{
  const s=game();linked(s);let before=balances(s);draw(s,'nobel-prize');assert.deepEqual(changes(s,before),[150000,150000,0]);
  before=balances(s);s.welfareFund=150000;s.players[0].position=20;resolveTile(s);assert.deepEqual(changes(s,before),[75000,75000,0]);assert.equal(s.welfareFund,0);
  before=balances(s);s.players[0].position=39;roll(s,1,2);advanceMovement(s);assert.deepEqual(changes(s,before),[100000,100000,0]);assert.equal(s.players[0].lapsCompleted,1);assert.equal(s.players[1].lapsCompleted,0);
});

test('벌금·건물 비용 카드·사회복지기금 납부는 각자 절반을 부담한다',()=>{
  const s=game();linked(s);let before=balances(s);draw(s,'speeding-fine');assert.deepEqual(changes(s,before),[-25000,-25000,0]);
  const city=own(s,'rome',0);city.buildingLevel=3;before=balances(s);draw(s,'income-tax');assert.deepEqual(changes(s,before),[-75000,-75000,0]);
  before=balances(s);s.players[0].position=38;resolveTile(s);assert.deepEqual(changes(s,before),[-75000,-75000,0]);assert.equal(s.welfareFund,150000);
});

test('남의 통행료는 둘이 반씩 내고, 결의 상대의 통행료는 방문자만 절반을 낸다',()=>{
  const s=game();linked(s);let tile=own(s,'busan',2);s.players[0].position=tile.index;let before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[-300000,-300000,600000]);
  tile=own(s,'jeju',1);s.players[0].position=tile.index;before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[-150000,150000,0]);
  tile=own(s,'seoul-olympic',0);s.currentPlayerIndex=1;s.players[1].position=tile.index;before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[1000000,-1000000,0]);
});

test('통행료 수령도 나누며 서로 다른 결의 두 쌍 간에는 양쪽 끝을 한 번씩 나눈다',()=>{
  const s=game(4);linked(s);startOath(s,'player-3',()=>.99);const tile=own(s,'busan',2);s.players[0].position=tile.index;const before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[-300000,-300000,300000,300000]);
});

test('산업화의 은행 20%를 보존하며 나머지 80% 수익만 나눈다',()=>{
  const s=game();linked(s);const tile=own(s,'taipei',0);tile.industrialized=true;tile.buildingLevel=3;s.gameStage='SECOND_HALF';s.currentPlayerIndex=2;s.players[2].position=tile.index;let rent=calculateRent(s,tile,s.players[2]);let before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[rent*.4,rent*.4,-rent]);
  s.currentPlayerIndex=1;s.players[1].position=tile.index;before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[rent*.4,-rent*.5,0]);
});

test('일제의 수탈은 도쿄 소유주로 변경한 뒤 그 소유주의 결의를 적용한다',()=>{
  const s=game(4);linked(s);const city=own(s,'busan',2);own(s,'tokyo',1);s.globalEffects.imperialExploitation={remainingTurns:8};s.currentPlayerIndex=3;s.players[3].position=city.index;const before=balances(s);resolveTile(s);assert.deepEqual(changes(s,before),[300000,300000,0,-600000]);
});

test('운송수단·항공여행·우주여행 이용료에도 도원결의를 적용한다',()=>{
  for(const id of ['air-travel','sea-travel','space-invitation']){const s=game();linked(s);const vehicle=own(s,id==='air-travel'?'concorde':id==='sea-travel'?'queen-elizabeth':'columbia',2);const before=balances(s);draw(s,id);const salary=id==='space-invitation'?0:RULES.PASS_START_BONUS/2;assert.deepEqual(changes(s,before),[salary-vehicle.baseRent/2,salary-vehicle.baseRent/2,vehicle.baseRent]);assert.ok([PHASES.BUY_DECISION,PHASES.TRAVEL_DECISION].includes(s.phase))}
});

test('구입·건설·대출·매각 수익은 나누지 않는다',()=>{
  const s=game();linked(s);const before=balances(s);takeBankLoan(s,100000);assert.deepEqual(changes(s,before),[100000,0,0]);
  s.players[0].position=1;resolveTile(s);buyCurrentTile(s);assert.deepEqual(changes(s,before),[50000,0,0]);
  s.gameStage='SECOND_HALF';resolveTile(s);const cost=s.board[1].buildingCosts[0];buildCurrentTile(s);assert.deepEqual(changes(s,before),[50000-cost,0,0]);
  own(s,'busan',0);const beforeSale=balances(s);draw(s,'full-price-sale');assert.deepEqual(changes(s,beforeSale),[500000,0,0]);
});

test('분담 상대의 현금 부족은 그 사람의 자산 정리와 대출로 해결하고 저장 후 원래 차례로 돌아온다',()=>{
  let s=game();linked(s);s.players[1].money=0;own(s,'taipei',1);draw(s,'speeding-fine');assert.equal(getPaymentPlayer(s).id,'player-2');assert.equal(s.currentPlayerIndex,0);assert.equal(s.pendingDebt.amount,25000);
  s=roundTrip(s);sellAsset(s,'taipei');settleDebt(s);assert.equal(s.players[1].money,25000);assert.equal(s.phase,PHASES.END_TURN);assert.equal(s.currentPlayerIndex,0);
  s.players[1].money=0;draw(s,'hospital-fee');takeBankLoan(s,100000);assert.equal(s.players[1].bankLoan.principal,100000);assert.equal(s.players[0].bankLoan,null);settleDebt(s);assert.equal(s.players[1].money,75000);
});

test('분담 상대 파산 후 원래 플레이어의 도박사 주사위를 재개한다',()=>{
  const s=game();linked(s);s.players[1].money=0;s.players[0].gamblerPending=true;roll(s,2,3);assert.equal(getPaymentPlayer(s).id,'player-2');declareBankruptcy(s);
  assert.equal(s.players[1].bankrupt,true);assert.equal(s.oaths.length,0);assert.equal(s.currentPlayerIndex,0);assert.equal(s.phase,PHASES.MOVING);assert.equal(s.pendingMovement.remaining,5);
});

test('뽑은 사람이 파산해도 이미 확정된 상대 분담금은 남고 추가 카드는 종료한다',()=>{
  const s=game();linked(s);s.players[0].money=0;s.doubleNextEvent=true;const before=s.players[1].money;draw(s,'speeding-fine','nobel-prize');declareBankruptcy(s);
  assert.equal(s.players[0].bankrupt,true);assert.equal(s.players[1].money,before-25000);assert.equal(s.eventQueue.length,0);assert.equal(s.phase,PHASES.END_TURN);
});

test('우대권은 본인 분담금만 면제하고 다른 분담금은 중복 없이 정산한다',()=>{
  const s=game();linked(s);const tile=own(s,'busan',2);s.players[0].specialCards=['toll-waiver'];s.players[0].position=tile.index;const before=balances(s);resolveTile(s);assert.equal(s.phase,PHASES.PAYMENT_DECISION);useSpecialCard(s,'toll-waiver');assert.deepEqual(changes(s,before),[0,-300000,300000]);assert.equal(s.phase,PHASES.END_TURN);
});

test('도박사 이익과 손실을 나누고 7은 양쪽 모두 변동이 없다',()=>{
  for(const [a,b,delta] of [[6,6,300000],[3,3,-300000],[3,4,0]]){const s=game();linked(s);const before=balances(s);s.players[0].gamblerPending=true;roll(s,a,b);assert.deepEqual(changes(s,before),[delta,delta,0]);assert.equal(s.pendingMovement.remaining,a+b)}
});

test('두 장 대기는 여러 턴 뒤 다른 사람이 뽑아도 소비되며 둘 다 적용한다',()=>{
  const s=game();draw(s,'ask-and-double');for(let i=0;i<4;i++){s.phase=PHASES.END_TURN;endTurn(s)}assert.equal(s.doubleNextEvent,true);const player=s.players[s.currentPlayerIndex];const before=player.money;
  draw(s,'nobel-prize','speeding-fine');assert.equal(s.doubleNextEvent,false);assert.equal(s.eventCursor,2);assert.equal(player.money,before+300000);assert.throws(()=>endTurn(s));resolveNextEvent(s);assert.equal(player.money,before+250000);assert.equal(s.eventQueue.length,0);
});

test('첫 카드 선택을 마쳐야 두 번째 카드를 사용하며 저장해도 순서가 유지된다',()=>{
  let s=game();s.doubleNextEvent=true;s.players[1].position=8;draw(s,'bermuda-triangle','nobel-prize');assert.throws(()=>resolveNextEvent(s));s=roundTrip(s);chooseBermudaPlayer(s,'player-2');const before=s.players[0].money;resolveNextEvent(s);assert.equal(s.players[0].money,before+300000);assert.equal(s.players[0].position,8);
});

test('두 장 중 리셋은 이미 확보한 다음 카드와 대기 효과를 없애지 않는다',()=>{
  const s=game();linked(s);s.doubleNextEvent=true;draw(s,'golden-key-reset','ask-and-double');assert.equal(s.eventDeck.length,41);assert.equal(s.eventCursor,0);assert.deepEqual(s.eventQueue,['ask-and-double']);assert.equal(s.oaths.length,1);resolveNextEvent(s);assert.equal(s.doubleNextEvent,true);assert.equal(s.eventCursor,0);
});

test('두 장 중 묻고 더블은 확보된 두 번째 카드가 아니라 다음 실제 뽑기에 적용한다',()=>{
  const s=game();s.doubleNextEvent=true;draw(s,'ask-and-double','nobel-prize');resolveNextEvent(s);assert.equal(s.doubleNextEvent,true);draw(s,'pension','scholarship');assert.equal(s.doubleNextEvent,false);assert.deepEqual(s.eventQueue,['scholarship']);
});

test('첫 카드의 이동·도착 매입을 끝내고 두 번째 카드를 현재 위치에서 적용한다',()=>{
  const s=game();s.doubleNextEvent=true;draw(s,'tour-busan','speeding-fine');assert.equal(s.phase,PHASES.BUY_DECISION);assert.throws(()=>resolveNextEvent(s));declineDecision(s);const before=s.players[0].money;resolveNextEvent(s);assert.equal(s.players[0].money,before-50000);assert.equal(s.board[s.players[0].position].id,'busan');
});

test('복합 카드의 건설·월드컵·두 도시 파괴 선택을 각각 끝내야 이어진다',()=>{
  for(const first of ['industrialization','world-cup','nine-eleven']){const s=game();const a=own(s,'taipei',0);const b=own(s,'rome',1);a.buildingLevel=1;b.buildingLevel=1;s.doubleNextEvent=true;draw(s,first,'pension');assert.throws(()=>resolveNextEvent(s));if(first==='industrialization')chooseIndustrializationCity(s,a.id);else if(first==='world-cup')chooseWorldCupCity(s,a.id);else{chooseTerrorTarget(s,a.id);assert.throws(()=>resolveNextEvent(s));chooseTerrorTarget(s,b.id)}const before=s.players[0].money;resolveNextEvent(s);assert.equal(s.players[0].money,before+50000)}
});

test('이동 봉쇄는 두 번째 이동 카드만 막고 현금 카드와 두 장 대기는 유지한다',()=>{
  const s=game();s.doubleNextEvent=true;draw(s,'nine-eleven','tour-busan');resolveNextEvent(s);assert.equal(s.players[0].position,2);assert.match(s.notice.message,/발동하지 않습니다/);assert.equal(s.eventQueue.length,0);
});

test('옛 저장에는 세 카드를 한 번씩 추가하고 새 결의·대기·큐를 보존한다',()=>{
  let s=game();delete s.oaths;delete s.eventQueue;delete s.doubleNextEvent;s.eventDeck=s.eventDeck.filter(id=>!['bermuda-triangle','peach-garden-oath','ask-and-double'].includes(id));s=roundTrip(s);assert.equal(s.eventDeck.length,41);assert.deepEqual(s.oaths,[]);assert.deepEqual(s.eventQueue,[]);assert.equal(s.doubleNextEvent,false);
  linked(s);s.doubleNextEvent=true;s.eventQueue=['nobel-prize'];const restored=roundTrip(s);assert.deepEqual(restored.oaths,s.oaths);assert.equal(restored.doubleNextEvent,true);assert.deepEqual(restored.eventQueue,['nobel-prize']);assert.equal(roundTrip(restored).eventDeck.length,41);
});

test('UI는 교환 가능한 상대·두 장 대기·개별 분담 정산·도움말을 표시한다',()=>{
  const root={querySelector:()=>null};const s=game();draw(s,'bermuda-triangle');s.notice=null;renderGame(root,s);assert.match(root.innerHTML,/data-action="choose-bermuda-player"/);linked(s);s.players[1].money=0;s.doubleNextEvent=true;draw(s,'speeding-fine','pension');s.notice=null;renderGame(root,s);assert.match(root.innerHTML,/도원결의 분담/);assert.match(root.innerHTML,/추가 황금열쇠 1장/);assert.match(root.innerHTML,/<h2>플레이어 2<\/h2>/);assert.match(renderHelp(),/버뮤다 삼각지대/);assert.match(renderHelp(),/41장/);
});

test('홀수 금액을 나눠도 통행료 총액과 은행 몫은 보존한다',()=>{
  const s=game(4);linked(s);startOath(s,'player-3',()=>.99);
  for(const amount of [1,3,101,10001,99999]){const ownerAmount=Math.round(amount*.8);const plan=paymentPlan(s,{amount,recipientId:'player-3',recipientAmount:ownerAmount,reason:'검사'},'player-1');assert.equal(plan.reduce((n,d)=>n+d.amount,0),amount);assert.equal(plan.reduce((n,d)=>n+d.credits.reduce((m,c)=>m+c.amount,0),0),ownerAmount)}
});

test('미분양 5개가 되어도 두 번째 카드까지 끝낸 뒤 경매를 시작한다',()=>{
  const s=game();const purchasable=s.board.filter(t=>['city','facility'].includes(t.type));
  for(const tile of purchasable.filter(t=>t.id!=='busan').slice(0,purchasable.length-6))own(s,tile.id,1);
  s.doubleNextEvent=true;draw(s,'tour-busan','pension');buyCurrentTile(s);assert.equal(s.gameStage,'FIRST_HALF');assert.equal(s.auctionAfterEvents,true);assert.throws(()=>endTurn(s));resolveNextEvent(s);assert.equal(s.phase,PHASES.END_TURN);const result=endTurn(s);assert.equal(result.type,'auction-start');assert.equal(s.gameStage,'AUCTION');assert.equal(s.eventQueue.length,0);
});

test('모든 두 카드 조합은 선택·지불을 끝내면 막힘 없이 완료된다',t=>{
  t.mock.method(Math,'random',()=>.5);
  for(const first of EVENT_CARDS)for(const second of EVENT_CARDS){
    const s=game(4);s.players.forEach(p=>p.money=1000000000);own(s,'taipei',0).buildingLevel=1;own(s,'rome',1).buildingLevel=3;s.doubleNextEvent=true;draw(s,first.id,second.id);
    let actions=0;
    while(s.status==='playing'&&(s.phase!==PHASES.END_TURN||s.eventQueue.length)){
      assert.ok(actions++<30,`${first.id} + ${second.id}: loop`);
      if(s.phase===PHASES.END_TURN)resolveNextEvent(s);
      else if([PHASES.BUY_DECISION,PHASES.BUILD_DECISION].includes(s.phase))declineDecision(s);
      else if(s.phase===PHASES.BERMUDA_DECISION)chooseBermudaPlayer(s,getBermudaTargets(s)[0].id);
      else if(s.phase===PHASES.WORLD_CUP_DECISION)chooseWorldCupCity(s,s.board.find(t=>t.type==='city'&&t.ownerId==='player-1').id);
      else if(s.phase===PHASES.INDUSTRIALIZATION_DECISION)chooseIndustrializationCity(s,s.board.find(t=>t.type==='city'&&t.ownerId==='player-1'&&t.buildable!==false).id);
      else if(s.phase===PHASES.TERROR_TARGET_DECISION)chooseTerrorTarget(s,s.board.find(t=>t.buildingLevel>0).id);
      else if(s.phase===PHASES.TRAVEL_DECISION)chooseSpaceTravelDestination(s,1);
      else if([PHASES.PAYMENT_DECISION,PHASES.ASSET_MANAGEMENT].includes(s.phase))settleDebt(s);
      else assert.fail(`${first.id} + ${second.id}: unexpected ${s.phase}`);
    }
    assert.ok(s.players.every(p=>Number.isFinite(p.money)&&p.money>=0),`${first.id} + ${second.id}: money`);
  }
});
