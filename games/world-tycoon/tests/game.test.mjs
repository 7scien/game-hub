import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMovement,buildCurrentTile,buildOwnedCity,buyCurrentTile,castEarlyAuctionVote,chooseIndustrializationCity,chooseSpaceTravelDestination,chooseTerrorTarget,chooseWorldCupCity,completeRoll,createGame,declareBankruptcy,endTurn,finishBuildMode,finishMovement,getBuildableOwnedCities,getGlobalEffectRounds,getLoanBalance,getNetWorth,getSpaceTravelTargets,getUnownedPurchasableAssets,isGlobalEffectActive,openBuildMode,openTrade,passAuction,
  proposeEarlyAuction,proposeTrade,repayBankLoan,resolveTile,resolveTrade,rollDice,sellAsset,sellBuilding,sellSpecialCard,settleDebt,takeBankLoan,updateClock,useSpecialCard,
} from '../js/game.js';
import {EVENT_CARDS} from '../js/data/events.js';
import {PHASES,RULES,calculateRent,formatMoney} from '../js/rules.js';
import {isValidSavedGame,loadGame,loadGames,saveGame} from '../js/storage.js';

const rngFor=(...values)=>{let index=0;return ()=>values[index++]??.1};
const finishDiceMovement=state=>{completeRoll(state);while(state.phase===PHASES.MOVING)advanceMovement(state);if(state.phase===PHASES.RESOLVING_TILE&&state.pendingMovement)finishMovement(state)};

test('월급과 도착지 통행료 알림을 순서대로 보존하고 송금 대상을 기록한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const [visitor,owner]=state.players;const tile=state.board[1];
  tile.ownerId=owner.id;owner.ownedProperties.push(tile.id);visitor.position=39;
  const visitorBefore=visitor.money;const ownerBefore=owner.money;
  rollDice(state,rngFor(0,.01));finishDiceMovement(state);
  assert.equal(state.feedbackQueue.length,1);assert.equal(state.feedbackQueue[0].title,'월급 지급');
  assert.deepEqual(state.feedbackQueue[0].transfer,{type:'salary',recipientId:visitor.id,recipientName:visitor.name,amount:200000});
  assert.deepEqual(state.feedback.transfer,{type:'toll',payerId:visitor.id,payerName:visitor.name,recipientId:owner.id,recipientName:owner.name,amount:tile.baseRent});
  assert.equal(visitor.money,visitorBefore+200000-tile.baseRent);assert.equal(owner.money,ownerBefore+tile.baseRent);
});

test('월급과 대출 만기 상환이 같은 순간이어도 두 알림을 보존한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];
  player.position=39;player.lapsCompleted=2;player.bankLoan={principal:100000,interest:10000,dueLap:3};
  rollDice(state,rngFor(0,.01));finishDiceMovement(state);
  assert.equal(state.feedbackQueue[0].title,'월급 지급');assert.equal(state.feedback.title,'대출 만기 상환');
  assert.equal(player.bankLoan,null);assert.equal(player.money,RULES.STARTING_MONEY+90000);
});

test('우대권으로 취소한 통행료는 송금 연출을 만들지 않는다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const [visitor,owner]=state.players;const tile=state.board[1];
  tile.ownerId=owner.id;owner.ownedProperties.push(tile.id);visitor.position=1;visitor.specialCards.push('toll-waiver');
  resolveTile(state);assert.equal(state.phase,PHASES.PAYMENT_DECISION);useSpecialCard(state,'toll-waiver');
  assert.equal(state.feedback,null);assert.equal(state.feedbackQueue.length,0);assert.equal(visitor.money,RULES.STARTING_MONEY);assert.equal(owner.money,RULES.STARTING_MONEY);
});

test('2~4인 게임을 원화 경제와 데이터 기반 보드로 생성한다',()=>{
  for(const count of [2,3,4]){
    const state=createGame(count,{mode:'30',rng:()=>.2});
    assert.equal(state.players.length,count);assert.equal(state.board.length,40);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
    assert.equal(state.gameStage,'FIRST_HALF');assert.equal(state.saveSlot,1);
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
  for(const [id,rent] of [['jeju',300000],['busan',600000],['seoul-olympic',1200000]]){
    const tile=board.find(item=>item.id===id);assert.equal(tile.buildable,false);assert.equal(tile.baseRent,rent);assert.deepEqual(tile.buildingCosts,[]);
  }
});

test('모든 도시는 서로 어울리는 대표 랜드마크 정보를 가진다',()=>{
  const cities=createGame(2,{mode:'full',rng:()=>.2}).board.filter(tile=>tile.type==='city');assert.ok(cities.every(tile=>tile.landmarkName&&tile.landmarkGlyph));
  assert.equal(cities.find(tile=>tile.id==='taipei').landmarkName,'타이베이 101');assert.equal(cities.find(tile=>tile.id==='paris').landmarkName,'에펠탑');assert.equal(cities.find(tile=>tile.id==='sydney').landmarkName,'시드니 오페라하우스');
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

test('건설 가능한 도시는 대표 랜드마크 기초·건설 중·1동·2동으로 개발한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});state.gameStage='SECOND_HALF';const tile=state.board[1];tile.ownerId=state.players[0].id;state.players[0].ownedProperties.push(tile.id);state.players[0].money=10000000;
  for(let level=1;level<=4;level++){
    state.phase=PHASES.BUILD_DECISION;state.pendingAction={type:'build',tileIndex:1};buildCurrentTile(state);assert.equal(tile.buildingLevel,level);
  }
  assert.equal(calculateRent(state,tile,state.players[1]),tile.rentByLevel[4]);assert.equal(state.notice.title,'랜드마크 2동 완성!');
  const jeju=state.board.find(item=>item.id==='jeju');jeju.ownerId=state.players[0].id;state.players[0].ownedProperties.push(jeju.id);state.players[0].position=jeju.index;resolveTile(state);assert.equal(state.phase,PHASES.END_TURN);
});

test('전반전에는 건설 없이 대지 통행료만 내고 미분양 5개부터 경매한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];owner.money=10000000;visitor.money=10000000;
  const regionCities=state.board.filter(tile=>tile.type==='city'&&tile.region==='asia');for(const tile of regionCities){tile.ownerId=owner.id;owner.ownedProperties.push(tile.id)}
  const taipei=state.board.find(tile=>tile.id==='taipei');visitor.position=taipei.index;state.currentPlayerIndex=1;const before=visitor.money;resolveTile(state);assert.equal(visitor.money,before-taipei.baseRent);assert.equal(state.feedback.message.includes('대지 통행료'),true);
  state.currentPlayerIndex=0;state.phase=PHASES.WAITING_FOR_ROLL;assert.throws(()=>openBuildMode(state),/후반전/);
  for(const tile of state.board.filter(tile=>['city','facility'].includes(tile.type)&&!tile.ownerId).slice(0,-6)){tile.ownerId=owner.id;(tile.type==='city'?owner.ownedProperties:owner.specialAssets).push(tile.id)}
  const target=getUnownedPurchasableAssets(state)[0];owner.position=target.index;state.phase=PHASES.BUY_DECISION;state.pendingAction={type:'buy',tileIndex:target.index};const transition=buyCurrentTile(state);
  assert.equal(transition.type,'auction-start');assert.equal(transition.tiles.length,5);
  assert.equal(state.gameStage,'AUCTION');assert.equal(state.phase,PHASES.AUCTION);assert.equal(getUnownedPurchasableAssets(state).length,5);
  let guard=0;let lastAuctionResult=null;while(state.gameStage==='AUCTION'&&guard<12){lastAuctionResult=passAuction(state);guard+=1}
  assert.equal(lastAuctionResult.type,'auction-award');assert.equal(lastAuctionResult.finished,true);
  assert.equal(state.gameStage,'SECOND_HALF');assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);assert.equal(getUnownedPurchasableAssets(state).length,0);
});

test('전반전에는 모든 플레이어가 동의하면 남은 자산 전체를 조기 경매한다',()=>{
  const state=createGame(3,{mode:'full',rng:()=>.2});const remaining=getUnownedPurchasableAssets(state).length;const proposer=state.players[0];
  proposeEarlyAuction(state);assert.equal(state.phase,PHASES.EARLY_AUCTION_VOTE);assert.deepEqual(state.earlyAuctionVote.approvedIds,[proposer.id]);assert.equal(state.earlyAuctionVote.remainingTileCount,remaining);
  const firstApproval=castEarlyAuctionVote(state,true);assert.equal(firstApproval.finished,false);const rejected=castEarlyAuctionVote(state,false);assert.equal(rejected.approved,false);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);assert.equal(state.gameStage,'FIRST_HALF');
  proposeEarlyAuction(state);castEarlyAuctionVote(state,true);const transition=castEarlyAuctionVote(state,true);assert.equal(transition.type,'auction-start');assert.equal(transition.early,true);assert.equal(transition.tiles.length,remaining);assert.equal(state.gameStage,'AUCTION');assert.equal(state.phase,PHASES.AUCTION);
});

test('후반전에는 자기 땅을 밟지 않아도 주사위 전에 자유 건설한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});state.gameStage='SECOND_HALF';const player=state.players[0];const paris=state.board.find(tile=>tile.id==='paris');paris.ownerId=player.id;player.ownedProperties.push(paris.id);player.position=0;const before=player.money;
  assert.equal(getBuildableOwnedCities(state).some(tile=>tile.id==='paris'),true);openBuildMode(state);buildOwnedCity(state,'paris');assert.equal(paris.buildingLevel,1);assert.equal(player.position,0);assert.equal(player.money,before-paris.buildingCosts[0]);finishBuildMode(state);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('은행은 최대 100만 원을 10% 이자로 빌려주고 최초 대출 3바퀴째 만기 처리한다',()=>{
  const state=createGame(3,{mode:'full',rng:()=>.2});const player=state.players[0];takeBankLoan(state,600000);assert.equal(getLoanBalance(player),660000);assert.equal(player.bankLoan.dueLap,3);player.lapsCompleted=1;takeBankLoan(state,400000);assert.equal(getLoanBalance(player),1100000);assert.equal(player.bankLoan.dueLap,3);assert.throws(()=>takeBankLoan(state,10000),/10만 원/);assert.equal(getNetWorth(state,player.id),RULES.STARTING_MONEY-100000);
  repayBankLoan(state);assert.equal(player.bankLoan,null);assert.equal(player.money,RULES.STARTING_MONEY-100000);
  player.lapsCompleted=0;takeBankLoan(state,1000000);player.lapsCompleted=2;player.position=39;player.money=0;state.phase=PHASES.WAITING_FOR_ROLL;rollDice(state,rngFor(0,0));completeRoll(state);advanceMovement(state);
  assert.equal(player.bankrupt,true);assert.equal(state.phase,PHASES.END_TURN);assert.match(state.notice.message,/은행 대출 만기 불이행/);
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

test('우주여행에서는 자기 칸을 제외한 판의 모든 칸을 목적지로 선택한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];player.position=30;resolveTile(state);
  assert.equal(state.phase,PHASES.TRAVEL_DECISION);assert.equal(state.pendingAction.type,'space-travel');
  assert.equal(getSpaceTravelTargets(state).length,39);assert.ok(getSpaceTravelTargets(state).every(tile=>tile.id!=='space-travel'));
  assert.deepEqual(new Set(getSpaceTravelTargets(state).map(tile=>tile.type)),new Set(['start','city','event','wait','facility','bonus','tax']));
  chooseSpaceTravelDestination(state,37);assert.equal(player.position,37);assert.equal(state.board[37].id,'new-york');assert.equal(state.phase,PHASES.BUY_DECISION);
  state.phase=PHASES.TRAVEL_DECISION;state.pendingAction={type:'space-travel',tileIndex:30};player.position=30;assert.throws(()=>chooseSpaceTravelDestination(state,30),/우주여행 칸/);
});

test('우주여행으로 출발·황금열쇠·무인도에 가면 각각의 도착 효과를 적용한다',()=>{
  let state=createGame(2,{mode:'full',rng:()=>.2});let player=state.players[0];let before=player.money;player.position=30;resolveTile(state);chooseSpaceTravelDestination(state,0);
  assert.equal(player.position,0);assert.equal(player.money,before+RULES.PASS_START_BONUS);assert.equal(player.lapsCompleted,1);assert.equal(state.phase,PHASES.END_TURN);

  state=createGame(2,{mode:'full',rng:()=>.2});player=state.players[0];before=player.money;state.eventDeck=['pension'];state.eventCursor=0;player.position=30;resolveTile(state);chooseSpaceTravelDestination(state,2);
  assert.equal(player.position,2);assert.equal(state.eventCursor,1);assert.equal(state.notice.source,'golden-key');assert.equal(state.notice.title,'연금 혜택');assert.equal(player.money,before+RULES.PASS_START_BONUS+50000);

  state=createGame(2,{mode:'full',rng:()=>.2});player=state.players[0];player.position=30;resolveTile(state);chooseSpaceTravelDestination(state,10);
  assert.equal(player.position,10);assert.equal(player.skipTurns,1);assert.equal(state.notice.title,'무인도');assert.equal(state.phase,PHASES.END_TURN);
});

test('우주여행은 콜럼비아호 소유자에게 이용료를 낸 뒤 판에서 도시를 선택한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];const columbia=state.board.find(tile=>tile.id==='columbia');
  columbia.ownerId=owner.id;owner.specialAssets.push(columbia.id);traveler.position=30;const travelerBefore=traveler.money;const ownerBefore=owner.money;resolveTile(state);
  assert.equal(traveler.money,travelerBefore-columbia.baseRent);assert.equal(owner.money,ownerBefore+columbia.baseRent);assert.equal(state.phase,PHASES.TRAVEL_DECISION);
});

test('우주여행 초대권으로 도착해도 목적지를 선택한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});state.players[0].position=2;state.eventDeck=['space-invitation'];state.eventCursor=0;resolveTile(state);
  assert.equal(state.players[0].position,30);assert.equal(state.phase,PHASES.TRAVEL_DECISION);
});

test('우주여행 초대권도 콜럼비아호 이용료를 정산한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];const columbia=state.board.find(tile=>tile.id==='columbia');columbia.ownerId=owner.id;owner.specialAssets.push(columbia.id);
  traveler.position=2;state.eventDeck=['space-invitation'];state.eventCursor=0;const before=owner.money;resolveTile(state);assert.equal(owner.money,before+columbia.baseRent);assert.equal(state.phase,PHASES.TRAVEL_DECISION);
});

test('새 카드 세 종을 포함한 황금열쇠 44장 구성을 사용한다',()=>{
  assert.equal(EVENT_CARDS.length,44);const counts=Object.groupBy(EVENT_CARDS,card=>card.category);
  assert.equal(counts.move.length,13);assert.equal(counts.income.length,7);assert.equal(counts.expense.length,6);assert.equal(counts.special.length,18);
  assert.equal(EVENT_CARDS.filter(card=>card.title==='우대권').length,2);assert.equal(EVENT_CARDS.filter(card=>card.title==='반액대매출').length,2);assert.equal(EVENT_CARDS.filter(card=>card.title==='전액대매출').length,1);assert.equal(EVENT_CARDS.filter(card=>card.title==='월드컵 개최').length,1);assert.equal(EVENT_CARDS.filter(card=>card.title==='일제의 수탈').length,1);assert.equal(EVENT_CARDS.filter(card=>card.title==='911 테러').length,1);assert.equal(EVENT_CARDS.filter(card=>card.title==='산업화').length,1);assert.equal(EVENT_CARDS.filter(card=>card.title==='제네바 협정').length,1);
});

test('월드컵은 선택한 내 도시의 통행료를 다음 자신의 세 차례 동안 2배로 만든다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];const taipei=state.board.find(tile=>tile.id==='taipei');taipei.ownerId=player.id;player.ownedProperties.push(taipei.id);player.position=2;state.eventDeck=['world-cup'];state.eventCursor=0;resolveTile(state);
  assert.equal(state.phase,PHASES.WORLD_CUP_DECISION);chooseWorldCupCity(state,'taipei');assert.equal(taipei.worldCupTurns,3);assert.equal(calculateRent(state,taipei,state.players[1]),taipei.baseRent*2);
  const finishBareTurn=()=>{state.phase=PHASES.END_TURN;state.rolledDouble=false;endTurn(state)};finishBareTurn();assert.equal(taipei.worldCupTurns,3);
  for(const remaining of [2,1,0]){finishBareTurn();finishBareTurn();assert.equal(taipei.worldCupTurns,remaining)}assert.equal(calculateRent(state,taipei,state.players[1]),taipei.baseRent);
});

test('일제의 수탈은 3라운드 동안 한국 땅 통행료를 도쿄 소유주에게 귀속한다',()=>{
  const state=createGame(3,{mode:'full',rng:()=>.2});const visitor=state.players[0];const koreanOwner=state.players[1];const tokyoOwner=state.players[2];const busan=state.board.find(tile=>tile.id==='busan');const tokyo=state.board.find(tile=>tile.id==='tokyo');
  busan.ownerId=koreanOwner.id;koreanOwner.ownedProperties.push(busan.id);tokyo.ownerId=tokyoOwner.id;tokyoOwner.ownedProperties.push(tokyo.id);visitor.position=2;state.eventDeck=['imperial-exploitation'];state.eventCursor=0;resolveTile(state);
  assert.ok(isGlobalEffectActive(state,'imperialExploitation'));assert.equal(getGlobalEffectRounds(state,'imperialExploitation'),3);assert.equal(state.phase,PHASES.END_TURN);
  const visitorBefore=visitor.money;const koreanBefore=koreanOwner.money;const tokyoBefore=tokyoOwner.money;visitor.position=busan.index;resolveTile(state);
  assert.equal(visitor.money,visitorBefore-busan.baseRent);assert.equal(koreanOwner.money,koreanBefore);assert.equal(tokyoOwner.money,tokyoBefore+busan.baseRent);assert.match(state.feedback.message,/일제의 수탈/);
  state.phase=PHASES.END_TURN;endTurn(state);for(let turn=0;turn<9;turn+=1){state.phase=PHASES.END_TURN;state.rolledDouble=false;endTurn(state)}assert.equal(isGlobalEffectActive(state,'imperialExploitation'),false);
});

test('911 테러는 서로 다른 도시 두 곳의 건물을 파괴하고 2라운드 동안 특수 이동을 봉쇄한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const attacker=state.players[0];const owner=state.players[1];const newYork=state.board.find(tile=>tile.id==='new-york');const paris=state.board.find(tile=>tile.id==='paris');const concorde=state.board.find(tile=>tile.id==='concorde');
  newYork.ownerId=owner.id;newYork.buildingLevel=5;newYork.industrialized=true;paris.ownerId=owner.id;paris.buildingLevel=3;owner.ownedProperties.push(newYork.id,paris.id);concorde.ownerId=owner.id;owner.specialAssets.push(concorde.id);attacker.position=2;state.eventDeck=['nine-eleven'];state.eventCursor=0;resolveTile(state);
  assert.equal(state.phase,PHASES.TERROR_TARGET_DECISION);assert.equal(getGlobalEffectRounds(state,'americanRage'),2);const first=chooseTerrorTarget(state,'new-york');assert.equal(first.previousLevel,5);assert.equal(first.buildingCount,3);assert.equal(first.completed,false);assert.equal(newYork.buildingLevel,0);assert.equal(newYork.industrialized,true);assert.equal(state.phase,PHASES.TERROR_TARGET_DECISION);
  const second=chooseTerrorTarget(state,'paris');assert.equal(second.completed,true);assert.equal(paris.buildingLevel,0);assert.equal(state.phase,PHASES.END_TURN);
  const attackerBefore=attacker.money;const ownerBefore=owner.money;attacker.position=concorde.index;resolveTile(state);assert.equal(attacker.money,attackerBefore);assert.equal(owner.money,ownerBefore);assert.equal(state.phase,PHASES.END_TURN);
  attacker.position=30;resolveTile(state);assert.equal(attacker.position,30);assert.equal(state.phase,PHASES.END_TURN);
  attacker.position=2;state.eventDeck=['tour-busan'];state.eventCursor=0;resolveTile(state);assert.equal(attacker.position,2);assert.equal(state.phase,PHASES.END_TURN);assert.match(state.notice.message,/이동 효과는 발동하지 않습니다/);
  endTurn(state);for(let turn=0;turn<4;turn+=1){state.phase=PHASES.END_TURN;state.rolledDouble=false;endTurn(state)}assert.equal(isGlobalEffectActive(state,'americanRage'),false);
});

test('산업화는 무료 완성 건물 1동과 영구 3동 한도를 주고 통행료의 20%를 은행이 회수한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const owner=state.players[0];const visitor=state.players[1];const taipei=state.board.find(tile=>tile.id==='taipei');taipei.ownerId=owner.id;owner.ownedProperties.push(taipei.id);owner.position=2;state.eventDeck=['industrialization'];state.eventCursor=0;const ownerCash=owner.money;resolveTile(state);
  assert.equal(state.phase,PHASES.INDUSTRIALIZATION_DECISION);chooseIndustrializationCity(state,'taipei');assert.equal(taipei.industrialized,true);assert.equal(taipei.buildingLevel,3);assert.equal(owner.money,ownerCash);
  state.gameStage='SECOND_HALF';state.currentPlayerIndex=1;visitor.position=taipei.index;const rent=calculateRent(state,taipei,visitor);const visitorBefore=visitor.money;const ownerBefore=owner.money;resolveTile(state);assert.equal(visitor.money,visitorBefore-rent);assert.equal(owner.money,ownerBefore+Math.round(rent*.8));assert.match(state.feedback.message,/20% 은행 반환/);assert.deepEqual(state.feedback.industrialSplit,{payerId:visitor.id,recipientId:owner.id,ownerAmount:Math.round(rent*.8),bankAmount:rent-Math.round(rent*.8)});
  state.currentPlayerIndex=0;owner.money=10000000;for(const level of [4,5]){state.phase=PHASES.BUILD_DECISION;state.pendingAction={type:'build',tileIndex:taipei.index};buildCurrentTile(state);assert.equal(taipei.buildingLevel,level)}assert.equal(getBuildableOwnedCities(state).includes(taipei),false);
});

test('제네바 협정은 2라운드 동안 무인도 출입을 막고 갇힌 플레이어를 풀어준다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const drawer=state.players[0];const trapped=state.players[1];trapped.position=10;trapped.skipTurns=1;trapped.islandFailedRolls=2;drawer.position=2;state.eventDeck=['geneva-convention'];state.eventCursor=0;resolveTile(state);
  assert.equal(isGlobalEffectActive(state,'genevaConvention'),true);assert.equal(getGlobalEffectRounds(state,'genevaConvention'),2);assert.equal(trapped.skipTurns,0);assert.equal(trapped.islandFailedRolls,0);assert.equal(state.notice.animation.type,'genevaConvention');assert.deepEqual(state.notice.animation.releasedPlayers.map(player=>player.id),[trapped.id]);
  state.phase=PHASES.WAITING_FOR_ROLL;state.consecutiveDoubles=2;rollDice(state,rngFor(0,0));const protectedRoll=completeRoll(state);assert.equal(protectedRoll.islandPrevented,true);assert.equal(drawer.position,2);assert.equal(state.phase,PHASES.MOVING);state.pendingMovement=null;
  drawer.position=10;resolveTile(state);assert.equal(drawer.skipTurns,0);assert.equal(state.phase,PHASES.END_TURN);drawer.position=2;state.eventDeck=['go-island'];state.eventCursor=0;resolveTile(state);assert.equal(drawer.position,2);assert.match(state.notice.message,/출입이 금지/);
  for(let turn=0;turn<5;turn+=1){state.phase=PHASES.END_TURN;state.rolledDouble=false;endTurn(state)}assert.equal(isGlobalEffectActive(state,'genevaConvention'),false);
});

test('항공여행은 콩코드 이용료를 낸 뒤 타이페이로 이동한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];const concorde=state.board.find(tile=>tile.id==='concorde');
  concorde.ownerId=owner.id;owner.specialAssets.push(concorde.id);traveler.position=2;state.eventDeck=['air-travel'];state.eventCursor=0;const before=owner.money;
  resolveTile(state);assert.equal(traveler.position,1);assert.equal(owner.money,before+300000);assert.equal(traveler.money,RULES.STARTING_MONEY-300000+RULES.PASS_START_BONUS);assert.equal(state.phase,PHASES.BUY_DECISION);
});

test('유람선 여행은 퀸 엘리자베스호 이용료를 낸 뒤 부산으로 이동한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];const queen=state.board.find(tile=>tile.id==='queen-elizabeth');
  queen.ownerId=owner.id;owner.specialAssets.push(queen.id);traveler.position=2;state.eventDeck=['sea-travel'];state.eventCursor=0;const before=owner.money;resolveTile(state);
  assert.equal(owner.money,before+queen.baseRent);assert.equal(traveler.position,state.board.find(tile=>tile.id==='busan').index);
});

test('우대권은 자동으로 소모되지 않고 통행료 지불 직전에 직접 사용한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];traveler.specialCards=['toll-waiver','island-escape'];
  const newYork=state.board.find(tile=>tile.id==='new-york');newYork.ownerId=owner.id;traveler.position=newYork.index;const before=traveler.money;resolveTile(state);
  assert.equal(state.phase,PHASES.PAYMENT_DECISION);assert.equal(traveler.money,before);assert.deepEqual(traveler.specialCards,['toll-waiver','island-escape']);
  useSpecialCard(state,'toll-waiver');assert.equal(traveler.money,before);assert.deepEqual(traveler.specialCards,['island-escape']);
  state.phase=PHASES.END_TURN;sellSpecialCard(state,'island-escape');assert.equal(traveler.money,before+200000);assert.deepEqual(traveler.specialCards,[]);
});

test('우대권을 보관하고 현금으로 통행료를 낼 수도 있다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const traveler=state.players[0];const owner=state.players[1];traveler.specialCards=['toll-waiver'];
  const taipei=state.board.find(tile=>tile.id==='taipei');taipei.ownerId=owner.id;traveler.position=taipei.index;const before=traveler.money;resolveTile(state);settleDebt(state);
  assert.equal(traveler.money,before-taipei.baseRent);assert.deepEqual(traveler.specialCards,['toll-waiver']);assert.equal(state.phase,PHASES.END_TURN);
});

test('무인도에서는 더블이나 탈출권으로 먼저 나가고 세 번째 차례에 자동 탈출한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];player.position=10;resolveTile(state);assert.equal(player.skipTurns,1);assert.equal(player.islandFailedRolls,0);assert.equal(state.notice.title,'무인도');
  state.notice=null;state.phase=PHASES.WAITING_FOR_ROLL;rollDice(state,rngFor(0,.2));const firstFailed=completeRoll(state);assert.equal(firstFailed.islandEscaped,false);assert.equal(player.islandFailedRolls,1);assert.equal(player.skipTurns,1);assert.equal(state.notice,null);assert.equal(state.phase,PHASES.END_TURN);
  state.phase=PHASES.WAITING_FOR_ROLL;rollDice(state,rngFor(0,.2));const secondFailed=completeRoll(state);assert.equal(secondFailed.islandEscaped,false);assert.equal(player.islandFailedRolls,2);assert.equal(player.skipTurns,1);assert.equal(state.phase,PHASES.END_TURN);
  state.phase=PHASES.WAITING_FOR_ROLL;rollDice(state,rngFor(.2,.4));const autoReleased=completeRoll(state);assert.equal(autoReleased.islandEscaped,true);assert.equal(autoReleased.islandAutoReleased,true);assert.equal(player.skipTurns,0);assert.equal(player.islandFailedRolls,0);assert.equal(state.pendingMovement.total,5);assert.equal(state.phase,PHASES.MOVING);
  const doubleState=createGame(2,{mode:'full',rng:()=>.2});const doublePlayer=doubleState.players[0];doublePlayer.position=10;resolveTile(doubleState);doubleState.phase=PHASES.WAITING_FOR_ROLL;rollDice(doubleState,rngFor(.4,.4));const escaped=completeRoll(doubleState);assert.equal(escaped.islandEscaped,true);assert.equal(escaped.islandAutoReleased,false);assert.equal(doublePlayer.skipTurns,0);assert.equal(doublePlayer.islandFailedRolls,0);assert.equal(doubleState.phase,PHASES.MOVING);
  const cardState=createGame(2,{mode:'full',rng:()=>.2});const cardPlayer=cardState.players[0];cardPlayer.position=10;cardPlayer.skipTurns=1;cardPlayer.islandFailedRolls=2;cardPlayer.specialCards=['island-escape'];useSpecialCard(cardState,'island-escape');assert.equal(cardPlayer.skipTurns,0);assert.equal(cardPlayer.islandFailedRolls,0);assert.deepEqual(cardPlayer.specialCards,[]);assert.equal(cardState.phase,PHASES.WAITING_FOR_ROLL);
});

test('반액·전액대매출은 현재 투자 가치가 가장 높은 부동산을 대상으로 한다',()=>{
  const half=createGame(2,{mode:'full',rng:()=>.2});const player=half.players[0];const busan=half.board.find(tile=>tile.id==='busan');const rome=half.board.find(tile=>tile.id==='rome');
  for(const tile of [busan,rome]){tile.ownerId=player.id;player.ownedProperties.push(tile.id)}const before=player.money;half.players[0].position=2;half.eventDeck=['half-price-sale-1'];half.eventCursor=0;resolveTile(half);
  assert.equal(busan.ownerId,null);assert.equal(rome.ownerId,player.id);assert.equal(player.money,before+busan.purchasePrice*.5);
  const full=createGame(2,{mode:'full',rng:()=>.2});const fullPlayer=full.players[0];const fullBusan=full.board.find(tile=>tile.id==='busan');const fullRome=full.board.find(tile=>tile.id==='rome');
  fullBusan.ownerId=fullPlayer.id;fullRome.ownerId=fullPlayer.id;fullRome.buildingLevel=4;fullPlayer.ownedProperties.push(fullBusan.id,fullRome.id);const currentValue=fullRome.purchasePrice+fullRome.buildingCosts.slice(0,4).reduce((sum,cost)=>sum+cost,0);const fullBefore=fullPlayer.money;fullPlayer.position=2;full.eventDeck=['full-price-sale'];full.eventCursor=0;resolveTile(full);
  assert.equal(fullRome.ownerId,null);assert.equal(fullBusan.ownerId,fullPlayer.id);assert.equal(fullPlayer.money,fullBefore+currentValue);
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

test('빚을 갚기 위한 자산 정리에서 땅은 제값에, 건물은 반값에 매각한다',()=>{
  const state=createGame(2,{mode:'full',rng:()=>.2});const player=state.players[0];const taipei=state.board.find(tile=>tile.id==='taipei');const athens=state.board.find(tile=>tile.id==='athens');taipei.ownerId=player.id;athens.ownerId=player.id;athens.buildingLevel=1;player.ownedProperties.push(taipei.id,athens.id);player.money=0;player.position=38;resolveTile(state);assert.equal(state.phase,PHASES.ASSET_MANAGEMENT);
  const buildingRefund=sellBuilding(state,'athens');assert.equal(buildingRefund,athens.buildingCosts[0]*.5);const landRefund=sellAsset(state,'taipei');assert.equal(landRefund,taipei.purchasePrice);assert.equal(taipei.ownerId,null);
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
  const state=createGame(2,{mode:'full',rng:()=>.2});state.eventDeck=['pension'];state.eventCursor=0;rollDice(state,rngFor(0,0));finishDiceMovement(state);
  if(state.phase===PHASES.BUY_DECISION)state.phase=PHASES.END_TURN;
  const result=endTurn(state);assert.equal(result.bonusTurn,true);assert.equal(state.currentPlayerIndex,0);assert.equal(state.phase,PHASES.WAITING_FOR_ROLL);
});

test('게임 상태는 서로 독립적인 두 저장 슬롯에 저장하고 불러올 수 있다',()=>{
  const values=new Map();const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key)};
  const state=createGame(4,{mode:'45',rng:()=>.2,saveSlot:1});state.board[1].buildingCosts=state.board[1].buildingCosts.slice(0,3);state.board[1].buildingLevel=1;state.phase=PHASES.TERROR_TARGET_DECISION;state.pendingAction={type:'terror-attack'};state.eventDeck=state.eventDeck.filter(id=>!['full-price-sale','world-cup','imperial-exploitation','nine-eleven','industrialization','geneva-convention'].includes(id));delete state.board[1].industrialized;delete state.players[0].islandFailedRolls;delete state.globalEffects;assert.equal(saveGame(state,storage),true);
  const second=createGame(2,{mode:'full',rng:()=>.3,saveSlot:2});second.players[0].name='두 번째 게임';second.board[1].industrialized=true;second.board[1].buildingLevel=5;assert.equal(saveGame(second,storage),true);const [loaded,loadedSecond]=loadGames(storage);
  assert.ok(isValidSavedGame(loaded));assert.equal(loaded.version,5);assert.equal(loaded.saveSlot,1);assert.equal(loaded.players.length,4);assert.equal(loaded.players[0].islandFailedRolls,0);assert.equal(loaded.pendingAction.remainingTargets,1);assert.deepEqual(loaded.pendingAction.selectedTileIds,[]);assert.equal(loaded.timer.remainingSeconds,2700);assert.equal(loadGame(storage,2).players[0].name,'두 번째 게임');assert.equal(loadedSecond.saveSlot,2);assert.equal(loadedSecond.board[1].industrialized,true);assert.equal(loadedSecond.board[1].buildingLevel,5);
  assert.equal(loaded.board[1].buildingCosts.length,5);assert.equal(loaded.board[1].industrialized,false);assert.ok(loaded.eventDeck.includes('full-price-sale'));assert.ok(loaded.eventDeck.includes('world-cup'));assert.ok(loaded.eventDeck.includes('imperial-exploitation'));assert.ok(loaded.eventDeck.includes('nine-eleven'));assert.ok(loaded.eventDeck.includes('industrialization'));assert.ok(loaded.eventDeck.includes('geneva-convention'));assert.deepEqual(loaded.globalEffects,{imperialExploitation:null,americanRage:null,genevaConvention:null});
});
