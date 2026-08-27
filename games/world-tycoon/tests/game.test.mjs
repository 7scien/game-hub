import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMovement,buildCurrentTile,buyCurrentTile,chooseSpaceTravelDestination,completeRoll,createGame,declareBankruptcy,endTurn,finishMovement,getNetWorth,openTrade,
  proposeTrade,resolveTile,resolveTrade,rollDice,sellSpecialCard,updateClock,
} from '../js/game.js';
import {EVENT_CARDS} from '../js/data/events.js';
import {PHASES,RULES,calculateRent,formatMoney} from '../js/rules.js';
import {isValidSavedGame,loadGame,saveGame} from '../js/storage.js';

const rngFor=(...values)=>{let index=0;return ()=>values[index++]??.1};
const finishDiceMovement=state=>{completeRoll(state);while(state.phase===PHASES.MOVING)advanceMovement(state);if(state.phase===PHASES.RESOLVING_TILE&&state.pendingMovement)finishMovement(state)};

test('2~4인 게임을 원화 경제와 데이터 기반 보드로 생성한다',()=>{
  for(const count of [2,3,4]){
    const state=createGame(count,{mode:'30',rng:()=>.2});
    assert.equal(state.players.length,count);assert.equal(state.board.length,40);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
    assert.equal(state.timer.remainingSeconds,1800);assert.equal(state.players[0].money,2930000);assert.equal(state.welfareFund,0);
    assert.ok(state.players.every(player=>player.token==='✈'));
  }
  assert.equal(formatMoney(50000),'5만 원');assert.equal(formatMoney(1000),'1,000원');
});

test('보드는 요청한 40칸 순서와 한·영문 이름을 사용한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});
  assert.deepEqual(state.board.map(tile=>tile.name),[
    '출발','타이페이','황금열쇠','홍콩','마닐라','제주도','싱가폴','황금열쇠','카이로','이스탄불','무인도',
    '아테네','황금열쇠','코펜하겐','스톡홀름','콩코드여객기','취리히','황금열쇠','베를린','몬트리올','사회복지기금',
    '부에노스 아이레스','황금열쇠','상파울루','시드니','부산','하와이','리스본','퀸 엘리자베스호','마드리드','우주여행',
    '도쿄','콜럼비아호','파리','로마','황금열쇠','런던','뉴욕','사회복지기금','서울',
  ]);
  assert.ok(state.board.every(tile=>tile.englishName));
});

test('도시와 탈것은 지정한 한국 원화 가격을 사용한다',()=>{
  const board=createGame(2,{mode:'full',rng:()=>.2}).board;const prices=Object.fromEntries(board.filter(tile=>tile.purchasePrice).map(tile=>[tile.id,tile.purchasePrice]));
  assert.deepEqual(prices,{
    taipei:50000,'hong-kong':80000,manila:80000,jeju:200000,singapore:100000,cairo:100000,istanbul:120000,
    athens:140000,copenhagen:160000,stockholm:160000,concorde:300000,zurich:180000,berlin:180000,montreal:200000,
    'buenos-aires':220000,'sao-paulo':240000,sydney:240000,busan:500000,hawaii:260000,lisbon:260000,'queen-elizabeth':400000,madrid:280000,
    tokyo:300000,columbia:450000,paris:320000,rome:320000,london:350000,'new-york':350000,'seoul-olympic':1000000,
  });
  for(const [id,rent] of [['jeju',300000],['busan',600000],['seoul-olympic',2000000]]){
    const tile=board.find(item=>item.id===id);assert.equal(tile.buildable,false);assert.equal(tile.baseRent,rent);assert.deepEqual(tile.buildingCosts,[]);
  }
});

test('색깔띠는 지정된 칸과 변의 색만 사용한다',()=>{
  const board=createGame(2,{mode:'full',rng:()=>.2}).board;const bands=color=>board.filter(tile=>tile.bandColor===color).map(tile=>tile.id);
  assert.deepEqual(bands('#d91f2b'),['taipei','hong-kong','manila','singapore','cairo','istanbul']);
  assert.deepEqual(bands('#8b4a2f'),['buenos-aires','sao-paulo','sydney','hawaii','lisbon','madrid']);
  assert.deepEqual(bands('#171b18'),['athens','copenhagen','stockholm','zurich','berlin','montreal','tokyo','paris','rome','london','new-york']);
  assert.equal(board.filter(tile=>tile.bandColor).length,23);
});

test('황금열쇠와 특별 칸은 생성된 일러스트를 연결한다',()=>{
  const board=createGame(2,{mode:'full',rng:()=>.2}).board;
  assert.ok(board.filter(tile=>tile.type==='event').every(tile=>tile.imageKey==='golden-key'));
  assert.deepEqual(Object.fromEntries(board.filter(tile=>tile.imageKey&&tile.type!=='event').map(tile=>[tile.id,tile.imageKey])),{
    jeju:'jeju','deserted-island':'deserted-island',concorde:'concorde','social-welfare-corner':'social-welfare',
    busan:'busan','queen-elizabeth':'queen-elizabeth','space-travel':'space-travel',columbia:'columbia',
    'social-welfare-tax':'social-welfare','seoul-olympic':'seoul-olympics',
  });
});

test('출발점을 통과하면 20만 원을 받고 도착한 도시를 살 수 있다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];player.position=39;
  rollDice(state,rngFor(0,.01));finishDiceMovement(state);
  assert.equal(player.position,1);assert.equal(player.money,RULES.STARTING_MONEY+200000);assert.equal(state.phase,PHASES.BUY_DECISION);
  assert.deepEqual({title:state.feedback.title,amount:state.feedback.amount},{title:'월급 지급',amount:200000});
  buyCurrentTile(state);assert.equal(state.board[1].ownerId,player.id);assert.ok(player.ownedProperties.includes('taipei'));
});

test('건설 가능한 도시는 별장·빌딩·호텔 3단계로 개발되고 고정 통행료 도시는 건설하지 않는다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const tile=state.board[1];tile.ownerId=state.players[0].id;state.players[0].ownedProperties.push(tile.id);state.players[0].money=10000000;
  for(let level=1;level<=3;level++){
    state.phase=PHASES.BUILD_DECISION;state.pendingAction={type:'build',tileIndex:1};buildCurrentTile(state);assert.equal(tile.buildingLevel,level);
  }
  assert.equal(calculateRent(state,tile,state.players[1]),tile.rentByLevel[3]);assert.equal(state.notice.title,'호텔 완성!');
  const jeju=state.board.find(item=>item.id==='jeju');jeju.ownerId=state.players[0].id;state.players[0].ownedProperties.push(jeju.id);state.players[0].position=jeju.index;resolveTile(state);assert.equal(state.phase,PHASES.END_TURN);
});

test('지역 완성 보너스와 탈것의 고정 이용료를 계산한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];
  state.board.filter(tile=>tile.region==='europe'&&tile.buildable!==false).forEach(tile=>{tile.ownerId=owner.id;owner.ownedProperties.push(tile.id)});
  const paris=state.board.find(tile=>tile.id==='paris');assert.equal(calculateRent(state,paris,visitor),Math.round(paris.baseRent*RULES.GROUP_COMPLETION_MULTIPLIER));
  const concorde=state.board.find(tile=>tile.id==='concorde');concorde.ownerId=owner.id;assert.equal(calculateRent(state,concorde,visitor),300000);
});

test('상대 도시에 도착하면 통행료가 자동 정산된다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];const tile=state.board.find(item=>item.id==='new-york');
  tile.ownerId=owner.id;owner.ownedProperties.push(tile.id);state.currentPlayerIndex=1;visitor.position=tile.index;
  const expected=calculateRent(state,tile,visitor);const ownerBefore=owner.money;resolveTile(state);
  assert.equal(visitor.money,RULES.STARTING_MONEY-expected);assert.equal(owner.money,ownerBefore+expected);assert.equal(state.phase,PHASES.END_TURN);
  assert.deepEqual({title:state.feedback.title,amount:state.feedback.amount},{title:'통행료 지불',amount:-expected});
});

test('주사위 합만큼 말을 한 칸씩 순서대로 이동한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});rollDice(state,rngFor(.4,.4));completeRoll(state);assert.equal(state.rollTotal,6);assert.equal(state.players[0].position,0);
  for(let step=1;step<=6;step++){advanceMovement(state);assert.equal(state.players[0].position,step);assert.equal(state.pendingMovement.remaining,6-step)}
  assert.equal(state.phase,PHASES.RESOLVING_TILE);finishMovement(state);assert.equal(state.phase,PHASES.BUY_DECISION);
});

test('우주여행에서는 원하는 칸을 선택해 이동하고 도착 효과를 적용한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];player.position=30;resolveTile(state);
  assert.equal(state.phase,PHASES.TRAVEL_DECISION);assert.equal(state.pendingAction.type,'space-travel');
  chooseSpaceTravelDestination(state,37);assert.equal(player.position,37);assert.equal(state.board[37].id,'new-york');assert.equal(state.phase,PHASES.BUY_DECISION);
});

test('우주여행 초대권으로 도착해도 목적지를 선택한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});state.players[0].position=2;state.eventDeck=['space-invitation'];state.eventCursor=0;resolveTile(state);
  assert.equal(state.players[0].position,30);assert.equal(state.phase,PHASES.TRAVEL_DECISION);
});

test('클래식 대형판 황금열쇠 30장 구성을 사용한다',()=>{
  assert.equal(EVENT_CARDS.length,30);const counts=Object.groupBy(EVENT_CARDS,card=>card.category);
  assert.equal(counts.move.length,12);assert.equal(counts.income.length,7);assert.equal(counts.expense.length,6);assert.equal(counts.special.length,5);
  assert.equal(EVENT_CARDS.filter(card=>card.title==='우대권').length,2);assert.equal(EVENT_CARDS.filter(card=>card.title==='반액대매출').length,2);
});

test('항공여행은 콩코드 이용료를 낸 뒤 타이페이로 이동한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];const concorde=state.board.find(tile=>tile.id==='concorde');
  concorde.ownerId=owner.id;owner.specialAssets.push(concorde.id);traveler.position=2;state.eventDeck=['air-travel'];state.eventCursor=0;const before=owner.money;
  resolveTile(state);assert.equal(traveler.position,1);assert.equal(owner.money,before+300000);assert.equal(traveler.money,RULES.STARTING_MONEY-300000+RULES.PASS_START_BONUS);assert.equal(state.phase,PHASES.BUY_DECISION);
});

test('우대권은 통행료를 한 번 면제하고 특수카드는 정가에 매각할 수 있다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];traveler.specialCards=['toll-waiver','island-escape'];
  const newYork=state.board.find(tile=>tile.id==='new-york');newYork.ownerId=owner.id;traveler.position=newYork.index;const before=traveler.money;resolveTile(state);
  assert.equal(traveler.money,before);assert.deepEqual(traveler.specialCards,['island-escape']);
  state.phase=PHASES.END_TURN;sellSpecialCard(state,'island-escape');assert.equal(traveler.money,before+200000);assert.deepEqual(traveler.specialCards,[]);
});

test('건물 유지비와 사회복지기금을 원화로 처리한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];const taipei=state.board.find(tile=>tile.id==='taipei');taipei.ownerId=player.id;taipei.buildingLevel=2;player.ownedProperties.push(taipei.id);
  player.position=2;state.eventDeck=['income-tax'];state.eventCursor=0;resolveTile(state);assert.equal(player.money,RULES.STARTING_MONEY-100000);
  player.position=38;resolveTile(state);assert.equal(state.welfareFund,150000);assert.equal(player.money,RULES.STARTING_MONEY-250000);
  player.position=20;resolveTile(state);assert.equal(state.welfareFund,0);assert.equal(player.money,RULES.STARTING_MONEY-100000);
});

test('건물 없는 자산과 현금을 플레이어끼리 거래한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const tile=state.board[1];tile.ownerId=state.players[0].id;state.players[0].ownedProperties.push(tile.id);
  openTrade(state);proposeTrade(state,{partnerId:'player-2',offerCash:100000,requestCash:50000,offerAssetId:'taipei',requestAssetId:''});resolveTrade(state,true);
  assert.equal(tile.ownerId,'player-2');assert.equal(state.players[0].money,2880000);assert.equal(state.players[1].money,2980000);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('지불 능력이 없으면 파산하고 마지막 플레이어가 승리한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const debtor=state.players[1];const tile=state.board.find(item=>item.id==='new-york');
  tile.ownerId=owner.id;tile.buildingLevel=3;owner.ownedProperties.push(tile.id);state.currentPlayerIndex=1;debtor.position=tile.index;debtor.money=0;
  resolveTile(state);assert.equal(state.phase,PHASES.ASSET_MANAGEMENT);declareBankruptcy(state);
  assert.equal(debtor.bankrupt,true);assert.equal(state.status,'finished');assert.deepEqual(state.winnerIds,[owner.id]);
});

test('시간 제한 종료 시 순자산으로 승자를 결정한다',()=>{
  const state=createGame(3,{mode:'30',rng:()=>.2});state.players[1].money+=500000;updateClock(state,1800);
  assert.equal(state.phase,PHASES.GAME_OVER);assert.deepEqual(state.winnerIds,['player-2']);assert.equal(getNetWorth(state,'player-2'),3430000);
});

test('더블이면 같은 플레이어가 보너스 턴을 얻는다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});rollDice(state,rngFor(0,0));finishDiceMovement(state);
  if(state.phase===PHASES.BUY_DECISION)state.phase=PHASES.END_TURN;
  const result=endTurn(state);assert.equal(result.bonusTurn,true);assert.equal(state.currentPlayerIndex,0);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('게임 상태는 새 저장 형식으로 저장하고 불러올 수 있다',()=>{
  const values=new Map();const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key)};
  const state=createGame(4,{mode:'45',rng:()=>.2});assert.equal(saveGame(state,storage),true);const loaded=loadGame(storage);
  assert.ok(isValidSavedGame(loaded));assert.equal(loaded.version,4);assert.equal(loaded.players.length,4);assert.equal(loaded.timer.remainingSeconds,2700);
});
