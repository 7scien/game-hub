import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseFatefulCrossroads,completeFatefulRoll,chooseGhostCity,chooseTrojanCity,chooseTerrorTarget,chooseIndustrializationCity,buildOwnedCity,createGame,declareBankruptcy,endTurn,getBuildableOwnedCities,getGhostCityTargets,getTrojanTargets,resolveNextEvent,resolveTile,sellAsset,sellBuilding,settleDebt,takeBankLoan,useSpecialCard,proposeTrade,openTrade,resolveTrade} from '../js/game.js';
import {activeTrojan} from '../js/city-effects.js';
import {startOath} from '../js/oath.js';
import {PHASES,RULES,buildingValue,calculateRent,effectiveBuildingLevel,hasGhostCity,netWorth} from '../js/rules.js';
import {loadGame,saveGame} from '../js/storage.js';
import {EVENT_CARDS} from '../js/data/events.js';
import {renderGame,renderHelp} from '../js/ui.js';

const game=(count=3)=>createGame(count,{mode:'full',rng:()=>.2});
const draw=(s,...cards)=>{s.players[s.currentPlayerIndex].position=2;s.eventDeck=cards;s.eventCursor=0;resolveTile(s)};
const own=(s,id,player=0,level=0)=>{const tile=s.board.find(t=>t.id===id);tile.ownerId=s.players[player].id;tile.buildingLevel=level;(tile.type==='city'?s.players[player].ownedProperties:s.players[player].specialAssets).push(id);return tile};
const ghost=(s,id)=>{draw(s,'ghost-city');return chooseGhostCity(s,id)};
const trojan=(s,id)=>{draw(s,'trojan-horse');return chooseTrojanCity(s,id)};
const money=s=>s.players.map(p=>p.money);
const delta=(s,before)=>money(s).map((n,i)=>n-before[i]);
const end=s=>{s.phase=PHASES.END_TURN;s.rolledDouble=false;return endTurn(s)};
const restore=s=>{const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};saveGame(s,storage);return loadGame(storage)};

test('세 카드는 각각 한 장이며 새 덱과 리셋은 44장이다',()=>{
  assert.equal(EVENT_CARDS.length,44);for(const id of ['fateful-crossroads','trojan-horse','ghost-city'])assert.equal(EVENT_CARDS.filter(c=>c.id===id).length,1);
  const s=game();draw(s,'golden-key-reset');assert.equal(s.eventDeck.length,44);assert.equal(s.notice.animation.count,44);
});

test('갈림길은 선택 전 돈 변화가 없고 안전한 선택을 한 번만 적용한다',()=>{
  const s=game();const before=money(s);draw(s,'fateful-crossroads');assert.equal(s.phase,PHASES.FATE_DECISION);assert.deepEqual(money(s),before);assert.throws(()=>chooseFatefulCrossroads(s,'invalid'));
  chooseFatefulCrossroads(s,'safe');assert.deepEqual(delta(s,before),[150000,0,0]);assert.equal(s.phase,PHASES.END_TURN);assert.throws(()=>chooseFatefulCrossroads(s,'safe'));
});

for(let face=1;face<=6;face++)test(`갈림길 주사위 ${face}: 별도 주사위이며 저장해도 결과와 정산이 한 번만 유지된다`,()=>{
  let s=game();s.dice=[3,3];s.rollTotal=6;s.rolledDouble=true;s.consecutiveDoubles=1;s.players[0].gamblerPending=true;
  draw(s,'fateful-crossroads');const before=money(s);chooseFatefulCrossroads(s,'risk',()=>(face-.5)/6);assert.equal(s.phase,PHASES.FATE_ROLLING);assert.equal(s.pendingAction.face,face);assert.deepEqual(money(s),before);
  s=restore(s);const result=completeFatefulRoll(s);assert.equal(result.face,face);assert.deepEqual(delta(s,before),[face<=3?-200000:400000,0,0]);assert.equal(s.players[0].position,2);assert.deepEqual(s.dice,[3,3]);assert.equal(s.rollTotal,6);assert.equal(s.rolledDouble,true);assert.equal(s.consecutiveDoubles,1);assert.equal(s.players[0].gamblerPending,true);assert.equal(s.pendingMovement,null);assert.throws(()=>completeFatefulRoll(s));
});

test('갈림길은 도원결의를 적용하고 손실 부족분을 해결한 뒤 추가 카드로 이어진다',()=>{
  const s=game();startOath(s,'player-1',()=>0);s.players[0].money=0;s.doubleNextEvent=true;draw(s,'fateful-crossroads','pension');chooseFatefulCrossroads(s,'risk',()=>0);completeFatefulRoll(s);assert.equal(s.pendingDebt.amount,100000);assert.equal(s.phase,PHASES.ASSET_MANAGEMENT);assert.throws(()=>resolveNextEvent(s));takeBankLoan(s,100000);settleDebt(s);assert.equal(s.phase,PHASES.END_TURN);const before=money(s);resolveNextEvent(s);assert.deepEqual(delta(s,before),[25000,25000,0]);
});

test('갈림길 도전 실패로 지불 불능이면 파산하며 남은 카드는 취소한다',()=>{
  const s=game();s.players[0].money=0;s.doubleNextEvent=true;draw(s,'fateful-crossroads','pension');chooseFatefulCrossroads(s,'risk',()=>0);completeFatefulRoll(s);declareBankruptcy(s);assert.equal(s.players[0].bankrupt,true);assert.equal(s.eventQueue.length,0);
});

test('트로이 목마는 상대 도시만 고르고 다음 통행료 한 번을 가로챈다',()=>{
  const s=game();const city=own(s,'busan',1);own(s,'taipei',0);own(s,'concorde',1);draw(s,'trojan-horse');assert.deepEqual(getTrojanTargets(s).map(t=>t.id),['busan']);assert.throws(()=>chooseTrojanCity(s,'taipei'));chooseTrojanCity(s,'busan');
  s.currentPlayerIndex=2;s.players[2].position=city.index;let before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[600000,0,-600000]);assert.equal(city.trojanHorse,null);
  before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[0,600000,-600000]);
});

test('목마는 소유주의 방문과 우대권 전액 면제에는 소모되지 않는다',()=>{
  const s=game();const city=own(s,'busan',1);trojan(s,'busan');s.currentPlayerIndex=1;s.players[1].position=city.index;resolveTile(s);assert.ok(activeTrojan(s,city));
  s.currentPlayerIndex=2;s.players[2].position=city.index;s.players[2].specialCards=['toll-waiver'];const before=money(s);resolveTile(s);assert.equal(s.phase,PHASES.PAYMENT_DECISION);useSpecialCard(s,'toll-waiver');assert.deepEqual(money(s),before);assert.ok(activeTrojan(s,city));
  resolveTile(s);assert.equal(city.trojanHorse,null);
});

test('목마는 정산 대기를 저장하며 현금 지불 전에는 소모되지 않는다',()=>{
  let s=game();const city=own(s,'busan',1);trojan(s,'busan');s.currentPlayerIndex=2;s.players[2].position=city.index;s.players[2].money=0;resolveTile(s);assert.ok(city.trojanHorse);s=restore(s);takeBankLoan(s,600000);settleDebt(s);assert.equal(s.players[0].money,RULES.STARTING_MONEY+600000);assert.equal(s.board.find(t=>t.id==='busan').trojanHorse,null);
});

test('목마 수입은 산업화 은행 몫과 도원결의 분배를 유지한다',()=>{
  const s=game(4);startOath(s,'player-1',()=>.99);const city=own(s,'taipei',1,3);city.industrialized=true;s.gameStage='SECOND_HALF';trojan(s,city.id);s.currentPlayerIndex=2;s.players[2].position=city.index;const rent=calculateRent(s,city,s.players[2]);const before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[rent*.4,0,-rent,rent*.4]);
});

test('설치자가 목마 도시에 도착하면 가로챈 자기 몫은 상계하고 은행 몫만 낸다',()=>{
  const s=game();const city=own(s,'taipei',1,3);city.industrialized=true;s.gameStage='SECOND_HALF';trojan(s,city.id);s.players[0].position=city.index;const rent=calculateRent(s,city,s.players[0]);s.players[0].money=rent*.2;resolveTile(s);assert.equal(s.players[0].money,0);assert.equal(s.phase,PHASES.END_TURN);assert.equal(city.trojanHorse,null);
});

test('원래 주인과 도원결의인 방문자는 할인된 통행료만 목마 설치자에게 낸다',()=>{
  const s=game();startOath(s,'player-2',()=>.99);const city=own(s,'busan',1);trojan(s,city.id);s.currentPlayerIndex=2;s.players[2].position=city.index;const before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[300000,0,-300000]);
});

test('일제의 수탈로 소유주가 받지 않는 통행료는 목마가 기다린다',()=>{
  const s=game(4);const city=own(s,'busan',1);own(s,'tokyo',3);trojan(s,city.id);s.globalEffects.imperialExploitation={remainingTurns:12};s.currentPlayerIndex=2;s.players[2].position=city.index;const before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[0,0,-600000,600000]);assert.ok(city.trojanHorse);
});

test('목마는 발동 차례·더블을 빼고 2라운드 뒤 사라진다',()=>{
  const s=game();const city=own(s,'busan',1);trojan(s,city.id);end(s);assert.equal(city.trojanHorse.remainingTurns,6);s.phase=PHASES.END_TURN;s.rolledDouble=true;s.consecutiveDoubles=1;endTurn(s);assert.equal(city.trojanHorse.remainingTurns,6);for(let i=0;i<5;i++)end(s);assert.ok(city.trojanHorse);end(s);assert.equal(city.trojanHorse,null);
});

test('설치자 파산 또는 소유권 변경 시 목마를 해제한다',()=>{
  const s=game();const city=own(s,'busan',1);trojan(s,city.id);s.players[0].money=0;draw(s,'speeding-fine');declareBankruptcy(s);assert.equal(city.trojanHorse,null);
  const t=game();const other=own(t,'taipei',1);trojan(t,other.id);t.currentPlayerIndex=1;t.phase=PHASES.WAITING_FOR_ROLL;openTrade(t);proposeTrade(t,{partnerId:'player-3',offerAssetId:other.id});resolveTrade(t,true);assert.equal(other.trojanHorse,null);
});

for(const original of [0,1,2,3])test(`유령도시는 원래 ${original}단계를 보존하고 1라운드만 호텔 2개로 만든다`,()=>{
  let s=game();let city=own(s,'taipei',0,original);const cash=s.players[0].money;const value=buildingValue(city);const wealth=netWorth(s,'player-1');ghost(s,city.id);assert.equal(city.buildingLevel,original);assert.equal(effectiveBuildingLevel(city),4);assert.equal(s.players[0].money,cash);assert.equal(buildingValue(city),value);assert.equal(netWorth(s,'player-1'),wealth);
  s=restore(s);city=s.board[1];assert.ok(hasGhostCity(city));end(s);assert.equal(city.ghostCity.remainingTurns,3);end(s);end(s);assert.ok(hasGhostCity(city));end(s);assert.equal(city.ghostCity,null);assert.equal(city.buildingLevel,original);assert.equal(effectiveBuildingLevel(city),original);
});

test('유령도시는 특수 토지·탈것·이미 호텔 2개 이상인 도시를 제외한다',()=>{
  const s=game();own(s,'jeju');own(s,'busan');own(s,'seoul-olympic');own(s,'columbia');own(s,'taipei',0,4);const industrial=own(s,'rome',0,5);industrial.industrialized=true;draw(s,'ghost-city');assert.equal(s.phase,PHASES.END_TURN);assert.equal(getGhostCityTargets(s).length,0);
});

test('유령도시는 전반전에도 호텔 2개 통행료를 받고 월드컵·산업화를 함께 적용한다',()=>{
  const s=game();const city=own(s,'taipei',0);city.industrialized=true;city.worldCupTurns=3;ghost(s,city.id);s.currentPlayerIndex=1;s.players[1].position=1;const rent=city.rentByLevel[4]*2;const before=money(s);resolveTile(s);assert.deepEqual(delta(s,before),[rent*.8,-rent,0]);assert.match(s.feedback.message,/유령도시 호텔 2개/);
});

test('임시 호텔에는 유지비가 없고 추가 건설·산업화를 할 수 없다',()=>{
  const s=game();const city=own(s,'taipei');ghost(s,city.id);const before=money(s);draw(s,'income-tax');assert.deepEqual(money(s),before);s.gameStage='SECOND_HALF';s.phase=PHASES.BUILD_ANYWHERE_DECISION;assert.equal(getBuildableOwnedCities(s).length,0);assert.throws(()=>buildOwnedCity(s,city.id),/유령도시/);draw(s,'industrialization');assert.equal(s.phase,PHASES.END_TURN);
});

test('유령도시의 임시 건물도 파괴되며 원래 건물은 되살아나지 않는다',()=>{
  for(const level of [0,3]){const s=game();const city=own(s,'taipei',0,level);city.industrialized=true;ghost(s,city.id);draw(s,'nine-eleven');assert.equal(s.phase,PHASES.TERROR_TARGET_DECISION);const result=chooseTerrorTarget(s,city.id);assert.equal(result.previousLevel,4);assert.equal(result.buildingCount,2);assert.equal(city.ghostCity,null);assert.equal(city.buildingLevel,0);assert.equal(city.industrialized,true);for(let i=0;i<5;i++)end(s);assert.equal(city.buildingLevel,0)}
});

test('유령도시 자산 정리에서는 실제 건물만 매각하고 임시 효과를 해제한다',()=>{
  const s=game();const city=own(s,'taipei',0,1);ghost(s,city.id);s.players[0].money=0;draw(s,'speeding-fine');const refund=sellBuilding(s,city.id);assert.equal(refund,city.buildingCosts[0]*.5);assert.equal(city.ghostCity,null);assert.equal(city.buildingLevel,0);sellAsset(s,city.id);assert.equal(city.ownerId,null);
  const t=game();const land=own(t,'busan',0);const target=own(t,'taipei');ghost(t,target.id);t.players[0].money=0;draw(t,'speeding-fine');sellAsset(t,target.id);assert.equal(target.ghostCity,null);assert.equal(t.players[0].money,target.purchasePrice);assert.ok(land.ownerId);
});

test('매출 카드는 임시 호텔이 아닌 원래 부동산 가치로 대상을 고른다',()=>{
  const s=game();const taipei=own(s,'taipei');const busan=own(s,'busan');ghost(s,taipei.id);draw(s,'full-price-sale');assert.equal(busan.ownerId,null);assert.equal(taipei.ownerId,'player-1');assert.ok(hasGhostCity(taipei));
});

test('기존 저장은 새 카드를 한 번만 보충하고 임시 효과와 갈림길 선택을 보존한다',()=>{
  let s=game();s.eventDeck=s.eventDeck.filter(id=>!['fateful-crossroads','trojan-horse','ghost-city'].includes(id));s=restore(s);assert.equal(s.eventDeck.length,44);assert.equal(restore(s).eventDeck.length,44);const city=own(s,'taipei');const target=own(s,'busan',1);ghost(s,city.id);trojan(s,target.id);draw(s,'fateful-crossroads');s=restore(s);assert.equal(s.phase,PHASES.FATE_DECISION);assert.ok(hasGhostCity(s.board[1]));assert.ok(activeTrojan(s,s.board.find(t=>t.id==='busan')));
});

test('UI에는 선택지·임시 호텔 2동·목마·실제 남은 차례와 새 도움말이 표시된다',()=>{
  const s=game();const root={querySelector:()=>null};own(s,'taipei');own(s,'busan',1);ghost(s,'taipei');trojan(s,'busan');draw(s,'fateful-crossroads');s.notice=null;renderGame(root,s);assert.match(root.innerHTML,/data-choice="safe"/);assert.match(root.innerHTML,/data-choice="risk"/);assert.match(root.innerHTML,/ghost-landmark/);assert.match(root.innerHTML,/호텔 2개/);assert.match(root.innerHTML,/trojan-badge/);assert.match(root.innerHTML,/남은 일반 차례 3회/);assert.match(renderHelp(),/44장/);
});
