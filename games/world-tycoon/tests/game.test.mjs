import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurrentTile,buyCurrentTile,completeRoll,createGame,declareBankruptcy,endTurn,getNetWorth,openTrade,
  proposeTrade,resolveTile,resolveTrade,rollDice,updateClock,
} from '../js/game.js';
import {PHASES,RULES,calculateRent} from '../js/rules.js';
import {isValidSavedGame,loadGame,saveGame} from '../js/storage.js';

const rngFor=(...values)=>{let index=0;return ()=>values[index++]??.1};

test('2~4인 게임을 데이터 기반 보드와 함께 생성한다',()=>{
  for(const count of [2,3,4]){
    const state=createGame(count,{mode:'30',rng:()=>.2});
    assert.equal(state.players.length,count);assert.equal(state.board.length,40);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
    assert.equal(state.timer.remainingSeconds,1800);assert.equal(state.players[0].money,RULES.STARTING_MONEY);
  }
});

test('보드는 요청한 40칸 순서와 한·영문 이름을 사용한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});
  assert.deepEqual(state.board.map(tile=>tile.name),[
    '출발','타이페이','황금열쇠','홍콩','마닐라','제주도','싱가폴','황금열쇠','카이로','이스탄불','무인도',
    '아테네','황금열쇠','코펜하겐','스톡홀름','콩코드여객기','취리히','황금열쇠','베를린','몬트리올','사회복지기금',
    '부에노스 아이레스','황금열쇠','상파올로','시드니','부산','하와이','리스본','퀸 엘리자베스호','마드리드','우주여행',
    '도쿄','콜럼비아호','파리','로마','황금열쇠','런던','뉴욕','사회복지기금','서울올림픽',
  ]);
  assert.ok(state.board.every(tile=>tile.englishName));
});

test('출발점을 통과하면 보너스를 받고 도착한 도시를 살 수 있다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];player.position=39;
  rollDice(state,rngFor(0,.01));completeRoll(state);
  assert.equal(player.position,1);assert.equal(player.money,RULES.STARTING_MONEY+RULES.PASS_START_BONUS);assert.equal(state.phase,PHASES.BUY_DECISION);
  buyCurrentTile(state);assert.equal(state.board[1].ownerId,player.id);assert.ok(player.ownedProperties.includes('taipei'));
});

test('도시는 Lv4 랜드마크까지 개발되고 통행료가 상승한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const tile=state.board[1];tile.ownerId=state.players[0].id;state.players[0].ownedProperties.push(tile.id);state.players[0].money=3000;
  for(let level=1;level<=4;level++){
    state.phase=PHASES.BUILD_DECISION;state.pendingAction={type:'build',tileIndex:1};buildCurrentTile(state);assert.equal(tile.buildingLevel,level);
  }
  assert.equal(calculateRent(state,tile,state.players[1]),tile.rentByLevel[4]);assert.equal(state.notice.title,'랜드마크 완성!');
});

test('지역 완성과 시설 묶음 보너스가 통행료에 반영된다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];
  state.board.filter(tile=>tile.region==='asia').forEach(tile=>{tile.ownerId=owner.id;owner.ownedProperties.push(tile.id)});
  assert.equal(calculateRent(state,state.board[1],visitor),Math.round(state.board[1].baseRent*RULES.GROUP_COMPLETION_MULTIPLIER));
  state.board.filter(tile=>tile.type==='facility').forEach(tile=>{tile.ownerId=owner.id;owner.specialAssets.push(tile.id)});
  const concorde=state.board.find(tile=>tile.id==='concorde');assert.equal(calculateRent(state,concorde,visitor),concorde.baseRent*RULES.FACILITY_MULTIPLIERS[3]);
});

test('상대 도시에 도착하면 통행료가 자동 정산된다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];const tile=state.board.find(item=>item.id==='new-york');
  tile.ownerId=owner.id;owner.ownedProperties.push(tile.id);state.currentPlayerIndex=1;visitor.position=tile.index;
  const expected=calculateRent(state,tile,visitor);const ownerBefore=owner.money;resolveTile(state);
  assert.equal(visitor.money,RULES.STARTING_MONEY-expected);assert.equal(owner.money,ownerBefore+expected);assert.equal(state.phase,PHASES.END_TURN);
});

test('이벤트 덱은 독립 카드 효과를 적용한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});state.players[0].position=2;state.eventDeck=['innovation-award'];state.eventCursor=0;
  resolveTile(state);assert.equal(state.players[0].money,RULES.STARTING_MONEY+180);assert.equal(state.notice.title,'도시 혁신상');
});

test('건물 없는 자산과 현금을 플레이어끼리 거래한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const tile=state.board[1];tile.ownerId=state.players[0].id;state.players[0].ownedProperties.push(tile.id);
  openTrade(state);proposeTrade(state,{partnerId:'player-2',offerCash:100,requestCash:50,offerAssetId:'taipei',requestAssetId:''});resolveTrade(state,true);
  assert.equal(tile.ownerId,'player-2');assert.equal(state.players[0].money,1450);assert.equal(state.players[1].money,1550);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('지불 능력이 없으면 파산하고 마지막 플레이어가 승리한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const debtor=state.players[1];const tile=state.board.find(item=>item.id==='new-york');
  tile.ownerId=owner.id;tile.buildingLevel=4;owner.ownedProperties.push(tile.id);state.currentPlayerIndex=1;debtor.position=tile.index;debtor.money=0;
  resolveTile(state);assert.equal(state.phase,PHASES.ASSET_MANAGEMENT);declareBankruptcy(state);
  assert.equal(debtor.bankrupt,true);assert.equal(state.status,'finished');assert.deepEqual(state.winnerIds,[owner.id]);
});

test('시간 제한 종료 시 순자산으로 승자를 결정한다',()=>{
  const state=createGame(3,{mode:'30',rng:()=>.2});state.players[1].money+=500;updateClock(state,1800);
  assert.equal(state.phase,PHASES.GAME_OVER);assert.deepEqual(state.winnerIds,['player-2']);assert.equal(getNetWorth(state,'player-2'),2000);
});

test('더블이면 같은 플레이어가 보너스 턴을 얻는다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});rollDice(state,rngFor(0,0));completeRoll(state);
  if(state.phase===PHASES.BUY_DECISION)state.phase=PHASES.END_TURN;
  const result=endTurn(state);assert.equal(result.bonusTurn,true);assert.equal(state.currentPlayerIndex,0);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('게임 상태는 localStorage 형식으로 저장하고 불러올 수 있다',()=>{
  const values=new Map();const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key)};
  const state=createGame(4,{mode:'45',rng:()=>.2});assert.equal(saveGame(state,storage),true);const loaded=loadGame(storage);
  assert.ok(isValidSavedGame(loaded));assert.equal(loaded.players.length,4);assert.equal(loaded.timer.remainingSeconds,2700);
});
