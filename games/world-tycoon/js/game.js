import {createBoard,findTileIndex} from './board.js';
import {EVENT_CARDS} from './data/events.js';
import {gamblerOutcome} from './data/gambler.js';
import {PHASES,PLAYER_COLORS,PLAYER_TOKENS,RULES,buildingValue,calculateRent,formatMoney,liquidationValue,netWorth} from './rules.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const currentPlayer=state=>state.players[state.currentPlayerIndex];
const addLog=(state,message)=>{state.log.unshift({id:`log-${state.sequence++}`,message});state.log=state.log.slice(0,10)};
const notice=(state,title,message,tone='info',source=null)=>{state.notice={id:`notice-${state.sequence++}`,title,message,tone,source}};
const cashFeedback=(state,title,amount,message,tone,details=null)=>{if(state.feedback)(state.feedbackQueue??=[]).push(state.feedback);state.feedback={id:`feedback-${state.sequence++}`,title,amount,message,tone,...(details||{})}};
const shuffled=(items,rng=Math.random)=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result};

export const SPECIAL_CARD_INFO={
  'toll-waiver':{name:'우대권',sellPrice:300000,icon:'◇'},
  'island-escape':{name:'무인도 탈출권',sellPrice:200000,icon:'⌁'},
};

const removeSpecialCard=(player,cardId)=>{const index=player.specialCards.indexOf(cardId);if(index<0)return false;player.specialCards.splice(index,1);return true};
const collectWelfareFund=(state,player)=>{const amount=state.welfareFund||0;player.money+=amount;state.welfareFund=0;return amount};
const KOREAN_TILE_IDS=new Set(['jeju','busan','seoul-olympic']);
const MOVEMENT_EFFECT_TYPES=new Set(['moveBy','moveTo','travelRoute','worldTour']);
const EFFECT_NAMES={imperialExploitation:'일제의 수탈',americanRage:'미국의 분노',genevaConvention:'제네바 협정'};
const PURCHASABLE_TYPES=new Set(['city','facility']);
const BANK_PHASES=new Set([PHASES.WAITING_FOR_ROLL,PHASES.BUY_DECISION,PHASES.BUILD_DECISION,PHASES.BUILD_ANYWHERE_DECISION,PHASES.PAYMENT_DECISION,PHASES.ASSET_MANAGEMENT,PHASES.END_TURN,PHASES.AUCTION]);

function activePlayerCount(state){return Math.max(1,state.players.filter(player=>!player.bankrupt).length)}
export function isGlobalEffectActive(state,key){return Boolean(state.globalEffects?.[key]?.remainingTurns>0)}
export function getGlobalEffectRounds(state,key){const effect=state.globalEffects?.[key];return effect?.remainingTurns>0?Math.ceil(effect.remainingTurns/activePlayerCount(state)):0}
function startGlobalEffect(state,key,rounds){
  state.globalEffects??={imperialExploitation:null,americanRage:null,genevaConvention:null};const duration=Math.max(1,Number(rounds)||1);
  state.globalEffects[key]={remainingTurns:activePlayerCount(state)*duration,durationRounds:duration,activatedTurn:state.turnNumber};return state.globalEffects[key];
}

export function createGame(playerCount,{mode='30',names=[],rng=Math.random,saveSlot=1}={}){
  if(![2,3,4].includes(playerCount))throw new Error('플레이 인원은 2~4명이어야 합니다.');
  const players=Array.from({length:playerCount},(_,index)=>({
    id:`player-${index+1}`,name:(names[index]||`플레이어 ${index+1}`).trim().slice(0,12)||`플레이어 ${index+1}`,
    color:PLAYER_COLORS[index],token:PLAYER_TOKENS[index],money:RULES.STARTING_MONEY,position:0,ownedProperties:[],specialAssets:[],specialCards:[],
    bankrupt:false,skipTurns:0,islandFailedRolls:0,lapsCompleted:0,bankLoan:null,gamblerPending:false,
  }));
  const minutes=mode==='full'?null:Number(mode);
  const state={
    version:RULES.SAVE_VERSION,status:'playing',mode:String(mode),saveSlot:Math.min(RULES.SAVE_SLOT_COUNT,Math.max(1,Number(saveSlot)||1)),gameStage:'FIRST_HALF',auction:null,earlyAuctionVote:null,players,board:createBoard(),currentPlayerIndex:0,turnNumber:1,
    phase:PHASES.WAITING_FOR_ROLL,dice:[1,1],rollTotal:0,rolledDouble:false,consecutiveDoubles:0,islandEscapeThisTurn:false,pendingMovement:null,pendingAction:null,pendingDebt:null,
    eventDeck:shuffled(EVENT_CARDS.map(card=>card.id),rng),eventCursor:0,welfareFund:0,globalEffects:{imperialExploitation:null,americanRage:null,genevaConvention:null},trade:null,notice:null,feedback:null,feedbackQueue:[],log:[],sequence:1,
    timer:{remainingSeconds:minutes===null?null:minutes*60},winnerIds:[],finishedReason:null,
  };
  addLog(state,`${players[0].name}의 전반전 토지 여행이 시작되었습니다.`);
  return state;
}

export function getCurrentPlayer(state){return currentPlayer(state)}
export function getAuctionBidder(state){return state.players.find(player=>player.id===state.auction?.turnPlayerId)??currentPlayer(state)}
export function getEarlyAuctionVoter(state){return state.players.find(player=>player.id===state.earlyAuctionVote?.currentVoterId)??currentPlayer(state)}
export function getUnownedPurchasableAssets(state){return state.board.filter(tile=>PURCHASABLE_TYPES.has(tile.type)&&!tile.ownerId)}
export function maxBuildingLevel(tile){return tile?.industrialized?RULES.INDUSTRIALIZED_MAX_BUILDING_LEVEL:RULES.MAX_BUILDING_LEVEL}
export function getLoanBalance(player){return (player?.bankLoan?.principal||0)+(player?.bankLoan?.interest||0)}
function bankingPlayer(state){return state.phase===PHASES.AUCTION?getAuctionBidder(state):currentPlayer(state)}
export function canUseBank(state){return state.status==='playing'&&BANK_PHASES.has(state.phase)&&!bankingPlayer(state).bankrupt}
function requirePhase(state,...phases){if(!phases.includes(state.phase))throw new Error('지금은 이 행동을 할 수 없습니다.')}

export function rollDice(state,rng=Math.random){
  requirePhase(state,PHASES.WAITING_FOR_ROLL);
  state.dice=[1+Math.floor(rng()*6),1+Math.floor(rng()*6)];
  state.rollTotal=state.dice[0]+state.dice[1];state.rolledDouble=state.dice[0]===state.dice[1];state.phase=PHASES.ROLLING;
  return [...state.dice];
}

function releasePlayerAssets(state,player){
  state.board.filter(tile=>tile.ownerId===player.id).forEach(tile=>{tile.ownerId=null;tile.buildingLevel=0;tile.worldCupTurns=0;tile.worldCupActivatedTurn=null});player.ownedProperties=[];player.specialAssets=[];player.specialCards=[];player.bankLoan=null;player.gamblerPending=false;
}

function bankruptPlayer(state,player,reason){
  player.money=0;player.bankrupt=true;releasePlayerAssets(state,player);state.pendingDebt=null;state.pendingMovement=null;notice(state,'파산',`${player.name}이 ${reason}(으)로 게임에서 제외되었습니다.`,'danger');addLog(state,`${player.name}이 ${reason}(으)로 파산했습니다.`);
  const active=state.players.filter(item=>!item.bankrupt);if(active.length<=1){finishGame(state,'last-player');return}state.phase=PHASES.END_TURN;
}

export function takeBankLoan(state,amount){
  if(!canUseBank(state))throw new Error('자기 차례의 행동 가능한 시간에만 대출할 수 있습니다.');const player=bankingPlayer(state);const requested=Math.round(Number(amount)/10000)*10000;
  if(!Number.isFinite(requested)||requested<100000)throw new Error('대출은 10만 원 이상, 1만 원 단위로 신청하세요.');const currentPrincipal=player.bankLoan?.principal||0;
  if(currentPrincipal+requested>RULES.BANK_LOAN_MAX)throw new Error(`대출 원금은 최대 ${formatMoney(RULES.BANK_LOAN_MAX)}입니다.`);
  const interest=Math.round(requested*RULES.BANK_LOAN_INTEREST_RATE);const dueLap=player.bankLoan?.dueLap??player.lapsCompleted+RULES.BANK_LOAN_TERM_LAPS;
  player.bankLoan={principal:currentPrincipal+requested,interest:(player.bankLoan?.interest||0)+interest,dueLap};player.money+=requested;addLog(state,`${player.name}이 은행에서 ${formatMoney(requested)}을 빌렸습니다. 만기는 ${dueLap}번째 바퀴입니다.`);cashFeedback(state,'은행 대출',requested,`상환액 ${formatMoney(getLoanBalance(player))} · ${Math.max(0,dueLap-player.lapsCompleted)}바퀴 남음`,'success');return player.bankLoan;
}

export function repayBankLoan(state){
  if(!canUseBank(state))throw new Error('자기 차례의 행동 가능한 시간에만 상환할 수 있습니다.');const player=bankingPlayer(state);const amount=getLoanBalance(player);if(!amount)throw new Error('상환할 은행 대출이 없습니다.');if(player.money<amount)throw new Error('원금과 이자를 모두 상환할 현금이 부족합니다.');
  player.money-=amount;player.bankLoan=null;addLog(state,`${player.name}이 은행 대출 ${formatMoney(amount)}을 모두 상환했습니다.`);cashFeedback(state,'대출 상환',-amount,'원금과 이자를 모두 갚았습니다.','danger');return amount;
}

function settleMatureLoan(state,player){
  const amount=getLoanBalance(player);if(!amount||player.lapsCompleted<player.bankLoan.dueLap)return false;
  if(player.money>=amount){player.money-=amount;player.bankLoan=null;addLog(state,`${player.name}의 3바퀴 대출이 만기되어 ${formatMoney(amount)}을 자동 상환했습니다.`);cashFeedback(state,'대출 만기 상환',-amount,'3바퀴 만기 원금과 이자를 갚았습니다.','danger');return false}
  bankruptPlayer(state,player,'은행 대출 만기 불이행');return true;
}

function passStart(state,player,count=1){
  const reward=RULES.PASS_START_BONUS*count;player.money+=reward;player.lapsCompleted=(player.lapsCompleted||0)+count;addLog(state,`${player.name}이 출발 지점을 통과해 ${formatMoney(reward)}을 받았습니다. (${player.lapsCompleted}바퀴)`);
  cashFeedback(state,'월급 지급',reward,`출발지를 통과했습니다. · ${player.lapsCompleted}바퀴`,'success',{transfer:{type:'salary',recipientId:player.id,recipientName:player.name,amount:reward}});return settleMatureLoan(state,player);
}

function moveBy(state,steps,{collectPassBonus=true}={}){
  const player=currentPlayer(state);const length=state.board.length;const raw=player.position+steps;
  if(steps>0&&collectPassBonus){const laps=Math.floor(raw/length);if(laps>0&&passStart(state,player,laps))return}
  player.position=((raw%length)+length)%length;
}

function moveTo(state,targetIndex,{collectPassBonus=true}={}){
  const player=currentPlayer(state);
  if(collectPassBonus&&targetIndex<=player.position&&targetIndex!==player.position&&passStart(state,player))return;
  player.position=targetIndex;
}

export function completeRoll(state){
  requirePhase(state,PHASES.ROLLING);const player=currentPlayer(state);
  if(player.gamblerPending){
    player.gamblerPending=false;const outcome=gamblerOutcome(state.rollTotal);const owesMoney=outcome.amount<0&&player.money<-outcome.amount;
    addLog(state,`${player.name} · 라스베가스의 도박사: 합 ${outcome.total}, ${outcome.amount===0?'변동 없음':`${formatMoney(Math.abs(outcome.amount))} ${outcome.amount<0?'손실':'획득'}`} · ${outcome.quote}`);
    if(owesMoney){
      prepareDebt(state,{amount:-outcome.amount,reason:'라스베가스의 도박사 손실금',afterPayment:{type:'resumeRoll'}});
      cashFeedback(state,'라스베가스의 도박사',outcome.amount,outcome.quote,outcome.tone,{gambler:{...outcome,pendingPayment:true}});return {gamblingDebt:true};
    }
    player.money+=outcome.amount;cashFeedback(state,'라스베가스의 도박사',outcome.amount,outcome.quote,outcome.tone,{gambler:outcome});
  }
  state.phase=PHASES.MOVING;
  if(player.skipTurns>0&&state.board[player.position]?.id==='deserted-island'){
    state.consecutiveDoubles=0;
    if(state.rolledDouble){player.skipTurns=0;player.islandFailedRolls=0;state.islandEscapeThisTurn=true;state.pendingMovement={playerId:player.id,total:state.rollTotal,remaining:state.rollTotal};addLog(state,`${player.name}이 더블로 무인도를 탈출했습니다.`);return {islandEscaped:true,islandAutoReleased:false}}
    player.islandFailedRolls=(Number(player.islandFailedRolls)||0)+1;
    if(player.islandFailedRolls>=RULES.ISLAND_MAX_TRAPPED_TURNS){player.skipTurns=0;player.islandFailedRolls=0;state.islandEscapeThisTurn=true;state.pendingMovement={playerId:player.id,total:state.rollTotal,remaining:state.rollTotal};addLog(state,`${player.name}이 세 번째 차례를 맞아 무인도에서 자동 탈출했습니다.`);return {islandEscaped:true,islandAutoReleased:true}}
    else{state.pendingMovement=null;state.phase=PHASES.END_TURN;addLog(state,`${player.name}이 더블을 만들지 못해 무인도에 남았습니다.`)}
    return {islandEscaped:false};
  }
  if(state.rolledDouble)state.consecutiveDoubles+=1;else state.consecutiveDoubles=0;
  if(state.consecutiveDoubles>=RULES.MAX_CONSECUTIVE_DOUBLES){
    if(isGlobalEffectActive(state,'genevaConvention')){state.consecutiveDoubles=0;state.pendingMovement={playerId:player.id,total:state.rollTotal,remaining:state.rollTotal};notice(state,'제네바 협정','무인도 출입 금지 기간이라 연속 더블 제재 없이 이동합니다.','success');addLog(state,`${player.name}의 무인도 이동이 제네바 협정으로 취소되었습니다.`);return {islandPrevented:true}}
    player.position=findTileIndex(state.board,'deserted-island');player.skipTurns=1;player.islandFailedRolls=0;
    notice(state,'무인도',`${RULES.MAX_CONSECUTIVE_DOUBLES}번 연속 더블로 무인도에 들어왔습니다.`,'warning');
    addLog(state,`${player.name}이 연속 더블로 무인도로 이동했습니다.`);state.pendingMovement=null;state.phase=PHASES.END_TURN;return;
  }
  state.pendingMovement={playerId:player.id,total:state.rollTotal,remaining:state.rollTotal};
}

export function advanceMovement(state){
  requirePhase(state,PHASES.MOVING);const movement=state.pendingMovement;
  if(!movement||movement.playerId!==currentPlayer(state).id||movement.remaining<1)throw new Error('진행 중인 이동이 없습니다.');
  moveBy(state,1);if(currentPlayer(state).bankrupt||state.phase===PHASES.GAME_OVER){state.pendingMovement=null;return {remaining:0,position:currentPlayer(state).position,bankrupt:true}}movement.remaining-=1;if(movement.remaining===0)state.phase=PHASES.RESOLVING_TILE;
  return {remaining:movement.remaining,position:currentPlayer(state).position};
}

export function finishMovement(state){
  requirePhase(state,PHASES.RESOLVING_TILE);const movement=state.pendingMovement;
  if(!movement)throw new Error('완료할 이동이 없습니다.');
  addLog(state,`${currentPlayer(state).name}이 ${movement.total}칸 이동했습니다.`);state.pendingMovement=null;resolveTile(state);
}

export function resetEventDeck(state,rng=Math.random){
  state.eventDeck=shuffled(EVENT_CARDS.map(card=>card.id),rng);state.eventCursor=0;return state.eventDeck.length;
}

function drawEvent(state){
  if(state.eventCursor>=state.eventDeck.length)resetEventDeck(state);
  const id=state.eventDeck[state.eventCursor++];return EVENT_CARDS.find(card=>card.id===id)??EVENT_CARDS[0];
}

function finishSimpleTile(state){state.phase=PHASES.END_TURN;state.pendingAction=null}

function continueAfterPayment(state,action){
  if(!action){finishSimpleTile(state);return}
  if(action.type==='resumeRoll'){state.notice=null;state.phase=PHASES.ROLLING;return completeRoll(state)}
  if(isGlobalEffectActive(state,'americanRage')&&(action.type==='spaceTravel'||action.type==='moveTo')){
    notice(state,'미국의 분노','이동 봉쇄 기간이라 이동수단과 특수 이동을 사용할 수 없습니다.','warning');finishSimpleTile(state);return;
  }
  if(action.type==='spaceTravel'){
    const player=currentPlayer(state);state.pendingAction={type:'space-travel',tileIndex:player.position};state.phase=PHASES.TRAVEL_DECISION;addLog(state,`${player.name}이 우주여행 목적지를 선택합니다.`);return;
  }
  if(action.type==='moveTo'){
    moveTo(state,findTileIndex(state.board,action.tileId),{collectPassBonus:action.collectPassBonus!==false});
    if(currentPlayer(state).bankrupt||state.status==='finished')return;
    state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);return;
  }
  finishSimpleTile(state);
}

function completeDebtPayment(state,debt){
  const payer=currentPlayer(state);payer.money-=debt.amount;
  const ownerAmount=debt.recipientId?debt.recipientAmount??debt.amount:0;
  if(debt.recipientId){const target=state.players.find(player=>player.id===debt.recipientId);if(target&&!target.bankrupt)target.money+=ownerAmount}
  if(debt.recipientIds)debt.recipientIds.forEach(id=>{const target=state.players.find(player=>player.id===id);if(target&&!target.bankrupt)target.money+=debt.shareAmount});
  if(debt.fundDeposit)state.welfareFund=(state.welfareFund||0)+debt.amount;
  addLog(state,`${payer.name}이 ${formatMoney(debt.amount)}을 지불했습니다.`);
  const title=debt.recipientId?'통행료 지불':debt.fundDeposit?'사회복지기금 납부':'현금 지불';
  const bankAmount=Math.max(0,debt.amount-ownerAmount);const industrialSplit=debt.recipientId&&bankAmount>0?{payerId:payer.id,recipientId:debt.recipientId,ownerAmount,bankAmount}:null;
  const recipient=state.players.find(target=>target.id===debt.recipientId);
  const transfer=debt.recipientId?{type:'toll',payerId:payer.id,payerName:payer.name,recipientId:debt.recipientId,recipientName:recipient?.name||'소유주',amount:debt.amount}:null;
  cashFeedback(state,title,-debt.amount,debt.reason,'danger',{industrialSplit,transfer});state.pendingDebt=null;return continueAfterPayment(state,debt.afterPayment);
}

function prepareDebt(state,{amount,recipientId=null,recipientAmount=null,recipientIds=null,shareAmount=null,reason,fundDeposit=false,afterPayment=null}){
  const payer=currentPlayer(state);const debt={amount:Math.round(amount),recipientId,recipientAmount:recipientId?Math.round(recipientAmount??amount):null,recipientIds,shareAmount,reason,fundDeposit,afterPayment};
  if(recipientId&&payer.specialCards.includes('toll-waiver')){state.pendingDebt=debt;state.phase=PHASES.PAYMENT_DECISION;return}
  if(payer.money>=debt.amount){completeDebtPayment(state,debt);return}
  state.pendingDebt=debt;state.phase=PHASES.ASSET_MANAGEMENT;
  notice(state,'자산 정리가 필요합니다',`${reason} ${formatMoney(debt.amount)}을 지불하려면 자산을 정리하세요.`,'warning');
}

function buildingFeeAmount(state,playerId,rates){
  return state.board.filter(tile=>tile.type==='city'&&tile.ownerId===playerId&&tile.buildingLevel>0).reduce((sum,tile)=>{
    if(tile.buildingLevel===1)return sum+rates.villa;
    if(tile.buildingLevel===2)return sum+rates.building;
    return sum+rates.hotel*(tile.buildingLevel-2);
  },0);
}

function sellMostExpensive(state,player,rate,saleName){
  const assets=state.board.filter(tile=>tile.type==='city'&&tile.ownerId===player.id);
  if(!assets.length){addLog(state,`${player.name}은 ${saleName}할 부동산이 없습니다.`);return null}
  const currentValue=tile=>(tile.purchasePrice||0)+buildingValue(tile);const tile=[...assets].sort((a,b)=>currentValue(b)-currentValue(a)||b.baseRent-a.baseRent)[0];
  const refund=Math.round((tile.purchasePrice+buildingValue(tile))*rate);tile.ownerId=null;tile.buildingLevel=0;tile.worldCupTurns=0;tile.worldCupActivatedTurn=null;removeOwnedId(player,tile);player.money+=refund;
  addLog(state,`${player.name}이 현재 가치가 가장 높은 ${tile.name}을 ${saleName}해 ${formatMoney(refund)}을 받았습니다.`);return {tile,refund};
}

function travelRoute(state,effect){
  if(isGlobalEffectActive(state,'americanRage')){notice(state,'미국의 분노','이동 봉쇄로 이번 항공·선박 여행은 취소됩니다. 이용료도 내지 않습니다.','warning','golden-key');finishSimpleTile(state);return}
  const player=currentPlayer(state);const vehicleIndex=findTileIndex(state.board,effect.vehicleTileId);moveTo(state,vehicleIndex);
  if(player.bankrupt||state.status==='finished')return;
  const vehicle=state.board[vehicleIndex];const afterPayment={type:'moveTo',tileId:effect.destinationTileId};
  if(vehicle.ownerId&&vehicle.ownerId!==player.id){prepareDebt(state,{amount:vehicle.baseRent,recipientId:vehicle.ownerId,reason:`${vehicle.name} 이용료`,afterPayment});return}
  continueAfterPayment(state,afterPayment);
}

function beginSpaceTravel(state){
  if(isGlobalEffectActive(state,'americanRage')){notice(state,'미국의 분노','우주여행 이용이 금지되어 목적지를 선택할 수 없고 이용료도 내지 않습니다.','warning');finishSimpleTile(state);return}
  const player=currentPlayer(state);const vehicle=state.board[findTileIndex(state.board,'columbia')];const afterPayment={type:'spaceTravel'};
  if(vehicle?.ownerId&&vehicle.ownerId!==player.id){prepareDebt(state,{amount:calculateRent(state,vehicle,player),recipientId:vehicle.ownerId,reason:`${vehicle.name} 우주여행 이용료`,afterPayment});return}
  continueAfterPayment(state,afterPayment);
}

function applyEvent(state,card){
  const player=currentPlayer(state);const effect=card.effect;
  notice(state,card.title,card.text,'event','golden-key');addLog(state,`${player.name}: ${card.title}`);
  if(effect.type==='resetEventDeck'){
    const count=resetEventDeck(state);notice(state,card.title,`황금열쇠 ${count}장을 모두 다시 채우고 무작위로 섞었습니다. 보유 중인 우대권·탈출권과 발동 중인 효과는 그대로 유지됩니다.`,'success','golden-key');addLog(state,`황금열쇠 ${count}장 리셋 · 무작위로 다시 섞었습니다.`);finishSimpleTile(state);return;
  }
  if(effect.type==='nextRollGamble'){player.gamblerPending=true;finishSimpleTile(state);return}
  if(isGlobalEffectActive(state,'americanRage')&&MOVEMENT_EFFECT_TYPES.has(effect.type)){
    notice(state,card.title,'미국의 분노로 이동이 봉쇄되어 이 카드의 이동 효과는 발동하지 않습니다.','warning','golden-key');addLog(state,`${card.title} 이동 효과가 미국의 분노로 무효화되었습니다.`);finishSimpleTile(state);return;
  }
  if(effect.type==='cash'){
    if(effect.amount>=0){player.money+=effect.amount;finishSimpleTile(state)}else prepareDebt(state,{amount:-effect.amount,reason:card.title});
    return;
  }
  if(effect.type==='moveBy'){moveBy(state,effect.steps);if(player.bankrupt||state.status==='finished')return;state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);return}
  if(effect.type==='moveTo'){
    if(effect.tileId==='deserted-island'&&isGlobalEffectActive(state,'genevaConvention')){notice(state,card.title,'제네바 협정으로 무인도 출입이 금지되어 현재 위치에 머뭅니다.','success','golden-key');addLog(state,`${card.title}의 무인도 이동이 제네바 협정으로 취소되었습니다.`);finishSimpleTile(state);return}
    const index=findTileIndex(state.board,effect.tileId);moveTo(state,index,{collectPassBonus:effect.collectPassBonus!==false});
    if(player.bankrupt||state.status==='finished')return;
    if(effect.resolveTile===false){finishSimpleTile(state);return}state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);return;
  }
  if(effect.type==='travelRoute'){travelRoute(state,effect);return}
  if(effect.type==='worldTour'){
    if(passStart(state,player))return;const fund=collectWelfareFund(state,player);addLog(state,`${player.name}이 세계일주를 마치고 사회복지기금 ${formatMoney(fund)}을 받았습니다.`);finishSimpleTile(state);return;
  }
  if(effect.type==='collectEach'){
    let total=0;state.players.filter(other=>other.id!==player.id&&!other.bankrupt).forEach(other=>{const paid=Math.min(other.money,effect.amount);other.money-=paid;total+=paid});
    player.money+=total;finishSimpleTile(state);return;
  }
  if(effect.type==='buildingFee'){
    const amount=buildingFeeAmount(state,player.id,effect.rates);if(amount>0)prepareDebt(state,{amount,reason:card.title});else finishSimpleTile(state);return;
  }
  if(effect.type==='sellMostExpensive'){sellMostExpensive(state,player,effect.rate,card.title);finishSimpleTile(state);return}
  if(effect.type==='worldCup'){
    const cities=state.board.filter(tile=>tile.type==='city'&&tile.ownerId===player.id);
    if(!cities.length){notice(state,card.title,'아직 보유한 도시가 없어 월드컵을 개최할 수 없습니다.','warning','golden-key');finishSimpleTile(state);return}
    state.pendingAction={type:'world-cup',turns:effect.turns};state.phase=PHASES.WORLD_CUP_DECISION;return;
  }
  if(effect.type==='imperialExploitation'){
    startGlobalEffect(state,'imperialExploitation',effect.rounds);notice(state,card.title,`즉시 발동했습니다. 앞으로 ${effect.rounds}라운드 동안 제주도·부산·서울 통행료가 도쿄 소유주에게 귀속됩니다.`,'warning','golden-key');addLog(state,`일제의 수탈이 ${effect.rounds}라운드 동안 적용됩니다.`);finishSimpleTile(state);return;
  }
  if(effect.type==='terrorAttack'){
    startGlobalEffect(state,'americanRage',effect.rageRounds);const targets=state.board.filter(tile=>tile.type==='city'&&tile.buildingLevel>0);
    if(!targets.length){notice(state,card.title,`파괴할 건물이 없습니다. 미국의 분노 이동 봉쇄만 ${effect.rageRounds}라운드 동안 즉시 적용됩니다.`,'warning','golden-key');addLog(state,`미국의 분노가 ${effect.rageRounds}라운드 동안 적용됩니다.`);finishSimpleTile(state);return}
    state.pendingAction={type:'terror-attack',remainingTargets:Math.min(Math.max(1,Number(effect.targetCount)||2),targets.length),selectedTileIds:[]};state.phase=PHASES.TERROR_TARGET_DECISION;addLog(state,`미국의 분노가 ${effect.rageRounds}라운드 동안 적용됩니다.`);return;
  }
  if(effect.type==='industrialization'){
    const targets=state.board.filter(tile=>tile.type==='city'&&tile.ownerId===player.id&&tile.buildable!==false&&(!tile.industrialized||tile.buildingLevel<RULES.INDUSTRIALIZED_MAX_BUILDING_LEVEL));
    if(!targets.length){notice(state,card.title,'산업화할 수 있는 보유 도시가 없습니다.','warning','golden-key');finishSimpleTile(state);return}
    state.pendingAction={type:'industrialization'};state.phase=PHASES.INDUSTRIALIZATION_DECISION;return;
  }
  if(effect.type==='genevaConvention'){
    const releasedPlayers=state.players.filter(item=>state.board[item.position]?.id==='deserted-island'&&item.skipTurns>0).map(item=>({id:item.id,name:item.name,color:item.color,token:item.token}));
    startGlobalEffect(state,'genevaConvention',effect.rounds);state.players.forEach(item=>{if(state.board[item.position]?.id==='deserted-island'){item.skipTurns=0;item.islandFailedRolls=0}});notice(state,card.title,`즉시 발동했습니다. ${effect.rounds}라운드 동안 무인도 출입이 금지되고 갇힌 플레이어도 풀려납니다.`,'success','golden-key');state.notice.animation={type:'genevaConvention',rounds:effect.rounds,releasedPlayers};addLog(state,`제네바 협정으로 무인도가 ${effect.rounds}라운드 동안 폐쇄됩니다.`);finishSimpleTile(state);return;
  }
  if(effect.type==='keepCard'){player.specialCards.push(effect.cardId);finishSimpleTile(state);return}
}

export function resolveTile(state,depth=0){
  if(depth>3){finishSimpleTile(state);return}
  const player=currentPlayer(state);const tile=state.board[player.position];state.pendingAction=null;
  if(isGlobalEffectActive(state,'americanRage')&&(tile.type==='facility'||tile.type==='move')){
    const isSpace=tile.id==='space-travel';notice(state,'미국의 분노',isSpace?'우주여행이 봉쇄되어 목적지를 선택할 수 없고 이용료도 내지 않습니다.':`${tile.name} 이용이 금지되어 인수·이용·통행료 정산 없이 지나갑니다.`,'warning');addLog(state,`${player.name}이 이동 봉쇄로 ${tile.name}을 이용하지 못했습니다.`);finishSimpleTile(state);return;
  }
  if(tile.type==='city'){
    if(!tile.ownerId){state.pendingAction={type:'buy',tileIndex:tile.index};state.phase=PHASES.BUY_DECISION;return}
    if(tile.ownerId===player.id){if(state.gameStage==='FIRST_HALF'||tile.buildable===false){finishSimpleTile(state);return}state.pendingAction={type:'build',tileIndex:tile.index};state.phase=PHASES.BUILD_DECISION;return}
    let recipientId=tile.ownerId;let reason=state.gameStage==='FIRST_HALF'?`${tile.name} 대지 통행료`:`${tile.name} 통행료`;
    if(isGlobalEffectActive(state,'imperialExploitation')&&KOREAN_TILE_IDS.has(tile.id)){
      const tokyo=state.board.find(item=>item.id==='tokyo');const tokyoOwner=state.players.find(item=>item.id===tokyo?.ownerId&&!item.bankrupt);recipientId=tokyoOwner?.id??null;
      reason=recipientId?`일제의 수탈 · ${tile.name} 통행료 → ${tokyoOwner.name}`:`일제의 수탈 · ${tile.name} 통행료 은행 귀속`;
      addLog(state,recipientId?`${tile.name} 통행료가 도쿄 소유주 ${tokyoOwner.name}에게 귀속됩니다.`:`도쿄가 미소유 상태라 ${tile.name} 통행료를 은행이 회수합니다.`);
    }
    const rent=state.gameStage==='FIRST_HALF'?Math.round(tile.baseRent*(tile.worldCupTurns>0?2:1)):calculateRent(state,tile,player);const recipientAmount=tile.industrialized&&recipientId?Math.round(rent*RULES.INDUSTRIALIZED_OWNER_SHARE):rent;if(tile.industrialized)reason=`산업화 · ${reason} (20% 은행 반환)`;prepareDebt(state,{amount:rent,recipientId,recipientAmount,reason});return;
  }
  if(tile.type==='facility'){
    if(!tile.ownerId){state.pendingAction={type:'buy',tileIndex:tile.index};state.phase=PHASES.BUY_DECISION;return}
    if(tile.ownerId===player.id){finishSimpleTile(state);return}
    prepareDebt(state,{amount:calculateRent(state,tile,player),recipientId:tile.ownerId,reason:`${tile.name} 이용료`});return;
  }
  if(tile.type==='event'){applyEvent(state,drawEvent(state));return}
  if(tile.type==='tax'){prepareDebt(state,{amount:tile.amount,reason:tile.name,fundDeposit:tile.id==='social-welfare-tax'});return}
  if(tile.type==='bonus'){const amount=collectWelfareFund(state,player);notice(state,tile.name,amount?`${formatMoney(amount)}을 받았습니다.`:'아직 모인 기금이 없습니다.','success');finishSimpleTile(state);return}
  if(tile.type==='wait'){if(isGlobalEffectActive(state,'genevaConvention')){player.skipTurns=0;player.islandFailedRolls=0;notice(state,'제네바 협정','무인도 출입 금지 기간이라 머무르지 않고 지나갑니다.','success');addLog(state,`${player.name}이 제네바 협정으로 무인도에 갇히지 않았습니다.`);finishSimpleTile(state);return}player.skipTurns=1;player.islandFailedRolls=0;notice(state,tile.name,'무인도에 들어왔습니다. 더블이나 탈출권으로 먼저 나갈 수 있고, 세 번째 차례에는 자동으로 탈출합니다.','warning');finishSimpleTile(state);return}
  if(tile.id==='space-travel'){beginSpaceTravel(state);return}
  if(tile.type==='move'){const destination=state.board[tile.target];moveTo(state,tile.target);if(player.bankrupt||state.status==='finished')return;notice(state,tile.name,`${destination.name}(으)로 이동합니다.`,'event');state.phase=PHASES.RESOLVING_TILE;resolveTile(state,depth+1);return}
  if(tile.type==='rest'){notice(state,tile.name,'잠시 쉬며 다음 여행을 준비합니다.','success');finishSimpleTile(state);return}
  finishSimpleTile(state);
}

export function chooseSpaceTravelDestination(state,targetIndex){
  requirePhase(state,PHASES.TRAVEL_DECISION);const player=currentPlayer(state);const index=Number(targetIndex);const origin=state.board[player.position];const destination=state.board[index];
  if(isGlobalEffectActive(state,'americanRage'))throw new Error('미국의 분노가 지속되는 동안 우주여행을 이용할 수 없습니다.');
  if(state.pendingAction?.type!=='space-travel'||origin?.id!=='space-travel')throw new Error('지금은 우주여행 목적지를 정할 수 없습니다.');
  if(!Number.isInteger(index)||!destination||destination.type!=='city')throw new Error('게임판에서 이동할 도시를 선택하세요.');
  moveTo(state,index);if(player.bankrupt||state.status==='finished')return destination;state.pendingAction=null;addLog(state,`${player.name}이 우주여행으로 ${destination.name}(으)로 이동했습니다.`);notice(state,'우주여행',`${destination.name}(으)로 이동했습니다.`,'success');state.phase=PHASES.RESOLVING_TILE;resolveTile(state,1);
  return destination;
}

export function chooseWorldCupCity(state,tileId){
  requirePhase(state,PHASES.WORLD_CUP_DECISION);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);const turns=Math.max(1,Number(state.pendingAction?.turns)||3);
  if(state.pendingAction?.type!=='world-cup'||!tile||tile.type!=='city'||tile.ownerId!==player.id)throw new Error('월드컵을 개최할 내 도시를 선택하세요.');
  tile.worldCupTurns=turns;tile.worldCupActivatedTurn=state.turnNumber;state.pendingAction=null;state.phase=PHASES.END_TURN;notice(state,'월드컵 개최!',`${tile.name}의 통행료가 다음 자신의 ${turns}번 차례 동안 2배가 됩니다.`,'landmark');addLog(state,`${player.name}이 ${tile.name}에서 월드컵을 개최합니다.`);return tile;
}

export function chooseTerrorTarget(state,tileId){
  requirePhase(state,PHASES.TERROR_TARGET_DECISION);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(state.pendingAction?.type!=='terror-attack'||!tile||tile.type!=='city'||tile.buildingLevel<1)throw new Error('건물이 있는 도시를 선택하세요.');
  const result={tileIndex:tile.index,tileId:tile.id,tileName:tile.name,landmarkName:tile.landmarkName||'랜드마크',landmarkGlyph:tile.landmarkGlyph||'▥',previousLevel:tile.buildingLevel,buildingCount:Math.max(1,tile.buildingLevel-2)};
  tile.buildingLevel=0;state.pendingAction.selectedTileIds.push(tile.id);state.pendingAction.remainingTargets-=1;const completed=state.pendingAction.remainingTargets<=0||!state.board.some(item=>item.type==='city'&&item.buildingLevel>0);result.completed=completed;result.remainingTargets=completed?0:state.pendingAction.remainingTargets;state.notice=null;addLog(state,`${player.name}이 ${tile.name}을 지정해 ${result.landmarkName} 건물을 모두 파괴했습니다.`);if(completed){state.pendingAction=null;state.phase=PHASES.END_TURN}return result;
}

export function chooseIndustrializationCity(state,tileId){
  requirePhase(state,PHASES.INDUSTRIALIZATION_DECISION);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(state.pendingAction?.type!=='industrialization'||!tile||tile.type!=='city'||tile.ownerId!==player.id||tile.buildable===false||tile.buildingLevel>=RULES.INDUSTRIALIZED_MAX_BUILDING_LEVEL)throw new Error('산업화할 수 있는 내 도시를 선택하세요.');
  const previousLevel=tile.buildingLevel;tile.industrialized=true;tile.buildingLevel=previousLevel<3?3:Math.min(RULES.INDUSTRIALIZED_MAX_BUILDING_LEVEL,previousLevel+1);state.pendingAction=null;state.phase=PHASES.END_TURN;notice(state,'산업화 완료',`${tile.name}에 은행이 ${tile.landmarkName||'대표 랜드마크'} 1동을 무료로 세웠습니다. 이 도시는 영구적으로 3동까지 개발할 수 있고 통행료 수익의 20%를 은행에 반환합니다.`,'landmark');addLog(state,`${player.name}의 ${tile.name}이 산업화되어 건물 ${tile.buildingLevel-2}동을 보유합니다.`);return {tile,previousLevel,newLevel:tile.buildingLevel};
}

function auctionMinimum(tile){return Math.max(RULES.AUCTION_MIN_INCREMENT,Math.ceil(tile.purchasePrice*.5/RULES.AUCTION_MIN_INCREMENT)*RULES.AUCTION_MIN_INCREMENT)}
function auctionPlayerIds(state){return state.players.filter(player=>!player.bankrupt).map(player=>player.id)}
function nextAuctionPlayerId(state,fromId,candidates){
  const start=state.players.findIndex(player=>player.id===fromId);for(let step=1;step<=state.players.length;step+=1){const id=state.players[(start+step)%state.players.length].id;if(candidates.includes(id))return id}return candidates[0]??null;
}
function prepareNextAuction(state){
  const auction=state.auction;if(!auction?.queue.length){state.gameStage='SECOND_HALF';state.currentPlayerIndex=auction?.resumePlayerIndex??state.currentPlayerIndex;state.auction=null;prepareTurn(state);notice(state,'후반전 시작','모든 자산의 경매가 끝났습니다. 이제 자기 차례에 주사위를 굴리기 전 어느 보유 도시든 자유롭게 개발할 수 있습니다.','landmark');addLog(state,'경매가 끝나 후반전이 시작되었습니다.');return}
  const tileId=auction.queue.shift();const tile=state.board.find(item=>item.id===tileId);const bidders=auctionPlayerIds(state);const starter=bidders[auction.completed%bidders.length];auction.currentTileId=tileId;auction.minimumBid=auctionMinimum(tile);auction.currentBid=0;auction.highestBidderId=null;auction.activeBidderIds=bidders;auction.turnPlayerId=starter;state.phase=PHASES.AUCTION;state.pendingAction={type:'auction',tileIndex:tile.index};
}
function beginLandAuction(state){
  const remaining=getUnownedPurchasableAssets(state);const tiles=remaining.map(tile=>({id:tile.id,index:tile.index,name:tile.name,icon:tile.icon}));state.gameStage='AUCTION';state.earlyAuctionVote=null;state.auction={queue:remaining.map(tile=>tile.id),completed:0,resumePlayerIndex:nextActiveIndex(state,state.currentPlayerIndex),currentTileId:null,minimumBid:0,currentBid:0,highestBidderId:null,activeBidderIds:[],turnPlayerId:null};prepareNextAuction(state);notice(state,'전반전 종료',`미분양 자산 ${remaining.length}개를 차례대로 경매합니다. 모든 경매가 끝나면 후반전이 시작됩니다.`,'event');addLog(state,`남은 자산 ${remaining.length}개의 경매가 시작되었습니다.`);return {type:'auction-start',tiles};
}
export function proposeEarlyAuction(state){
  requirePhase(state,PHASES.WAITING_FOR_ROLL);if(state.gameStage!=='FIRST_HALF')throw new Error('조기 경매 투표는 전반전에만 제안할 수 있습니다.');const remaining=getUnownedPurchasableAssets(state);if(!remaining.length)throw new Error('경매할 미분양 자산이 없습니다.');const voters=auctionPlayerIds(state);const proposer=currentPlayer(state);state.earlyAuctionVote={proposerId:proposer.id,voterIds:voters,approvedIds:[proposer.id],currentVoterId:nextAuctionPlayerId(state,proposer.id,voters.filter(id=>id!==proposer.id)),remainingTileCount:remaining.length};state.pendingAction={type:'early-auction-vote'};state.phase=PHASES.EARLY_AUCTION_VOTE;addLog(state,`${proposer.name}이 남은 자산 ${remaining.length}개의 조기 경매를 제안했습니다.`);return state.earlyAuctionVote;
}
export function castEarlyAuctionVote(state,approved){
  requirePhase(state,PHASES.EARLY_AUCTION_VOTE);const vote=state.earlyAuctionVote;const voter=getEarlyAuctionVoter(state);if(!vote||!vote.voterIds.includes(voter.id))throw new Error('진행 중인 조기 경매 투표가 없습니다.');
  if(!approved){state.earlyAuctionVote=null;state.pendingAction=null;state.phase=PHASES.WAITING_FOR_ROLL;notice(state,'조기 경매 부결',`${voter.name}이 동의하지 않아 전반전을 계속합니다.`,'warning');addLog(state,`${voter.name}의 반대로 조기 경매 투표가 부결되었습니다.`);return {approved:false,finished:true}}
  if(!vote.approvedIds.includes(voter.id))vote.approvedIds.push(voter.id);const nextId=vote.voterIds.find(id=>!vote.approvedIds.includes(id));if(nextId){vote.currentVoterId=nextId;addLog(state,`${voter.name}이 조기 경매에 동의했습니다.`);return {approved:true,finished:false}}
  addLog(state,'모든 플레이어가 조기 경매에 동의했습니다.');const result=beginLandAuction(state);result.early=true;return result;
}
function finishAuctionAsset(state,winnerId,amount){
  const auction=state.auction;const tile=state.board.find(item=>item.id===auction.currentTileId);const winner=state.players.find(player=>player.id===winnerId);if(!winner||winner.money<amount)throw new Error('낙찰 금액을 지불할 수 없습니다.');winner.money-=amount;tile.ownerId=winner.id;(tile.type==='city'?winner.ownedProperties:winner.specialAssets).push(tile.id);auction.completed+=1;addLog(state,`${winner.name}이 ${tile.name}을 ${formatMoney(amount)}에 낙찰받았습니다.`);const finished=auction.queue.length===0;prepareNextAuction(state);notice(state,finished?'마지막 낙찰':'낙찰 완료',`${winner.name}이 ${tile.name}을 ${formatMoney(amount)}에 낙찰받았습니다.${finished?' 후반전을 시작합니다.':''}`,'success');return {type:'auction-award',tile,winner,amount,finished};
}
export function placeAuctionBid(state,amount){
  requirePhase(state,PHASES.AUCTION);const auction=state.auction;const bidder=getAuctionBidder(state);const bid=Math.round(Number(amount)/RULES.AUCTION_MIN_INCREMENT)*RULES.AUCTION_MIN_INCREMENT;const required=auction.currentBid?auction.currentBid+RULES.AUCTION_MIN_INCREMENT:auction.minimumBid;
  if(!auction.activeBidderIds.includes(bidder.id)||bidder.id===auction.highestBidderId)throw new Error('지금 입찰할 차례가 아닙니다.');if(!Number.isFinite(bid)||bid<required)throw new Error(`최소 입찰가는 ${formatMoney(required)}입니다.`);if(bid>bidder.money)throw new Error('보유 현금보다 많이 입찰할 수 없습니다.');auction.currentBid=bid;auction.highestBidderId=bidder.id;
  const contenders=auction.activeBidderIds.filter(id=>id!==bidder.id);if(!contenders.length)return finishAuctionAsset(state,bidder.id,bid);auction.turnPlayerId=nextAuctionPlayerId(state,bidder.id,contenders);return {type:'auction-bid',bidder,amount:bid};
}
export function passAuction(state){
  requirePhase(state,PHASES.AUCTION);const auction=state.auction;const bidder=getAuctionBidder(state);if(bidder.id===auction.highestBidderId)throw new Error('현재 최고 입찰자는 패스할 수 없습니다.');auction.activeBidderIds=auction.activeBidderIds.filter(id=>id!==bidder.id);addLog(state,`${bidder.name}이 ${state.board.find(tile=>tile.id===auction.currentTileId).name} 경매에서 패스했습니다.`);
  if(auction.highestBidderId&&auction.activeBidderIds.length===1)return finishAuctionAsset(state,auction.highestBidderId,auction.currentBid);
  if(!auction.highestBidderId&&auction.activeBidderIds.length===1){const last=state.players.find(player=>player.id===auction.activeBidderIds[0]);if(last.money>=auction.minimumBid)return finishAuctionAsset(state,last.id,auction.minimumBid)}
  if(!auction.activeBidderIds.length){auction.minimumBid=Math.max(RULES.AUCTION_MIN_INCREMENT,Math.floor(auction.minimumBid*.8/RULES.AUCTION_MIN_INCREMENT)*RULES.AUCTION_MIN_INCREMENT);auction.activeBidderIds=auctionPlayerIds(state);auction.turnPlayerId=auction.activeBidderIds[0];notice(state,'유찰','모두 패스해 최저가를 낮추고 같은 자산을 다시 경매합니다.','warning');return null}
  const candidates=auction.activeBidderIds.filter(id=>id!==auction.highestBidderId);auction.turnPlayerId=nextAuctionPlayerId(state,bidder.id,candidates);return null;
}

export function buyCurrentTile(state){
  requirePhase(state,PHASES.BUY_DECISION);const player=currentPlayer(state);const tile=state.board[state.pendingAction.tileIndex];
  if(tile.ownerId)throw new Error('이미 소유자가 있는 자산입니다.');if(player.money<tile.purchasePrice)throw new Error('구매할 현금이 부족합니다.');
  player.money-=tile.purchasePrice;tile.ownerId=player.id;(tile.type==='city'?player.ownedProperties:player.specialAssets).push(tile.id);
  addLog(state,`${player.name}이 ${tile.name}을 ${formatMoney(tile.purchasePrice)}에 인수했습니다.`);if(state.gameStage==='FIRST_HALF'&&getUnownedPurchasableAssets(state).length===RULES.FIRST_HALF_AUCTION_REMAINDER)return beginLandAuction(state);finishSimpleTile(state);return {type:'asset-purchase',tile};
}

export function declineDecision(state){requirePhase(state,PHASES.BUY_DECISION,PHASES.BUILD_DECISION);finishSimpleTile(state)}

export function getBuildableOwnedCities(state,playerId=currentPlayer(state).id){return state.board.filter(tile=>tile.type==='city'&&tile.ownerId===playerId&&tile.buildable!==false&&tile.buildingLevel<maxBuildingLevel(tile))}
function developCity(state,player,tile){
  if(state.gameStage!=='SECOND_HALF')throw new Error('건설은 경매가 끝난 후반전부터 가능합니다.');if(!tile||tile.ownerId!==player.id||tile.type!=='city'||tile.buildable===false)throw new Error('이 도시에는 건설할 수 없습니다.');const maxLevel=maxBuildingLevel(tile);if(tile.buildingLevel>=maxLevel)throw new Error(`이미 대표 랜드마크 ${maxLevel-2}동이 완성되었습니다.`);
  const cost=tile.buildingCosts[tile.buildingLevel];if(player.money<cost)throw new Error('건설할 현금이 부족합니다.');player.money-=cost;tile.buildingLevel+=1;const landmark=tile.landmarkName||'대표 랜드마크';const buildingName=[null,`${landmark} 기초`,`${landmark} 건설 중`,`${landmark} 1동`,`${landmark} 2동`,`${landmark} 3동`][tile.buildingLevel];addLog(state,`${player.name}이 ${tile.name}에 ${buildingName} 단계를 완성했습니다.`);
  if(tile.buildingLevel===3)notice(state,'랜드마크 완성!',`${tile.name}에 ${landmark} 1동이 완성되었습니다.`,'landmark');if(tile.buildingLevel>=4)notice(state,`랜드마크 ${tile.buildingLevel-2}동 완성!`,`${tile.name}에 ${landmark} ${tile.buildingLevel-2}동이 완성되었습니다.`,'landmark');return tile;
}

export function buildCurrentTile(state){
  requirePhase(state,PHASES.BUILD_DECISION);const player=currentPlayer(state);const tile=state.board[state.pendingAction.tileIndex];
  developCity(state,player,tile);finishSimpleTile(state);return tile;
}

export function openBuildMode(state){requirePhase(state,PHASES.WAITING_FOR_ROLL);if(state.gameStage!=='SECOND_HALF')throw new Error('후반전부터 자유 건설을 사용할 수 있습니다.');if(!getBuildableOwnedCities(state).length)throw new Error('지금 개발할 수 있는 보유 도시가 없습니다.');state.phase=PHASES.BUILD_ANYWHERE_DECISION;state.pendingAction={type:'build-anywhere'};}
export function buildOwnedCity(state,tileId){requirePhase(state,PHASES.BUILD_ANYWHERE_DECISION);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);developCity(state,player,tile);state.phase=PHASES.BUILD_ANYWHERE_DECISION;state.pendingAction={type:'build-anywhere'};return tile}
export function finishBuildMode(state){requirePhase(state,PHASES.BUILD_ANYWHERE_DECISION);state.pendingAction=null;state.phase=PHASES.WAITING_FOR_ROLL}

function removeOwnedId(player,tile){const list=tile.type==='city'?player.ownedProperties:player.specialAssets;const index=list.indexOf(tile.id);if(index>=0)list.splice(index,1)}

export function sellBuilding(state,tileId){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(!tile||tile.ownerId!==player.id||tile.buildingLevel<1)throw new Error('매각할 건물이 없습니다.');
  const refund=Math.round(tile.buildingCosts[tile.buildingLevel-1]*RULES.SELL_BUILDING_RATE);tile.buildingLevel-=1;player.money+=refund;addLog(state,`${tile.name} 건물을 매각해 ${formatMoney(refund)}을 확보했습니다.`);return refund;
}

export function sellAsset(state,tileId){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const tile=state.board.find(item=>item.id===tileId);
  if(!tile||tile.ownerId!==player.id)throw new Error('매각할 수 없는 자산입니다.');if(tile.buildingLevel>0)throw new Error('건물을 먼저 모두 매각하세요.');
  const refund=Math.round(tile.purchasePrice*RULES.SELL_PROPERTY_RATE);tile.ownerId=null;tile.worldCupTurns=0;tile.worldCupActivatedTurn=null;player.money+=refund;removeOwnedId(player,tile);addLog(state,`${tile.name}을 매각해 ${formatMoney(refund)}을 확보했습니다.`);return refund;
}

export function sellSpecialCard(state,cardId){
  requirePhase(state,PHASES.WAITING_FOR_ROLL,PHASES.END_TURN,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const info=SPECIAL_CARD_INFO[cardId];
  if(!info||!removeSpecialCard(player,cardId))throw new Error('매각할 수 없는 황금열쇠 카드입니다.');
  player.money+=info.sellPrice;addLog(state,`${player.name}이 ${info.name}을 은행에 팔아 ${formatMoney(info.sellPrice)}을 받았습니다.`);return info.sellPrice;
}

export function useSpecialCard(state,cardId){
  const player=currentPlayer(state);
  if(cardId==='toll-waiver'){
    requirePhase(state,PHASES.PAYMENT_DECISION);const debt=state.pendingDebt;if(!debt?.recipientId)throw new Error('우대권을 사용할 통행료가 없습니다.');
    if(!removeSpecialCard(player,cardId))throw new Error('보유한 우대권이 없습니다.');state.pendingDebt=null;addLog(state,`${player.name}이 우대권으로 ${debt.reason}를 면제받았습니다.`);notice(state,'우대권 사용',`${debt.reason} ${formatMoney(debt.amount)}을 내지 않습니다.`,'success');continueAfterPayment(state,debt.afterPayment);return;
  }
  if(cardId==='island-escape'){
    requirePhase(state,PHASES.WAITING_FOR_ROLL);if(player.skipTurns<1||state.board[player.position]?.id!=='deserted-island')throw new Error('무인도에 갇힌 차례에만 사용할 수 있습니다.');
    if(!removeSpecialCard(player,cardId))throw new Error('보유한 무인도 탈출권이 없습니다.');player.skipTurns=0;player.islandFailedRolls=0;addLog(state,`${player.name}이 무인도 탈출권을 사용했습니다.`);notice(state,'무인도 탈출권 사용','이제 주사위를 굴려 정상적으로 이동할 수 있습니다.','success');return;
  }
  throw new Error('지금 사용할 수 없는 카드입니다.');
}

export function settleDebt(state){
  requirePhase(state,PHASES.PAYMENT_DECISION,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const debt=state.pendingDebt;if(!debt)throw new Error('지불할 금액이 없습니다.');
  if(player.money<debt.amount){if(state.phase===PHASES.PAYMENT_DECISION){state.phase=PHASES.ASSET_MANAGEMENT;notice(state,'자산 정리가 필요합니다',`${debt.reason} ${formatMoney(debt.amount)}을 지불하려면 자산을 정리하세요.`,'warning');return}throw new Error('아직 현금이 부족합니다.');}
  return completeDebtPayment(state,debt);
}

function finishGame(state,reason){
  state.status='finished';state.phase=PHASES.GAME_OVER;state.finishedReason=reason;
  const active=state.players.filter(player=>!player.bankrupt);const values=active.map(player=>({id:player.id,value:netWorth(state,player.id)}));const best=Math.max(...values.map(entry=>entry.value));
  state.winnerIds=values.filter(entry=>entry.value===best).map(entry=>entry.id);addLog(state,`게임 종료 · ${state.winnerIds.map(id=>state.players.find(player=>player.id===id).name).join(', ')} 승리`);
}

export function declareBankruptcy(state){
  requirePhase(state,PHASES.ASSET_MANAGEMENT);const player=currentPlayer(state);const debt=state.pendingDebt;
  const cardValue=(player.specialCards||[]).reduce((sum,id)=>sum+(SPECIAL_CARD_INFO[id]?.sellPrice||0),0);
  if(player.money+liquidationValue(state,player.id)+cardValue>=debt.amount)throw new Error('매각 가능한 자산으로 아직 지불할 수 있습니다.');
  if(debt.recipientId){const target=state.players.find(item=>item.id===debt.recipientId);if(target)target.money+=player.money}
  bankruptPlayer(state,player,'지불 불능');
}

function nextActiveIndex(state,from){let next=from;do{next=(next+1)%state.players.length}while(state.players[next].bankrupt);return next}
function prepareTurn(state){
  const player=currentPlayer(state);state.pendingMovement=null;state.pendingAction=null;state.pendingDebt=null;state.rolledDouble=false;state.rollTotal=0;state.islandEscapeThisTurn=false;state.phase=PHASES.WAITING_FOR_ROLL;
}

function tickWorldCupBonuses(state,playerId){
  state.board.filter(tile=>tile.ownerId===playerId&&tile.worldCupTurns>0).forEach(tile=>{
    if(tile.worldCupActivatedTurn===state.turnNumber){tile.worldCupActivatedTurn=null;return}
    tile.worldCupTurns-=1;if(tile.worldCupTurns<=0){tile.worldCupTurns=0;tile.worldCupActivatedTurn=null;addLog(state,`${tile.name} 월드컵 통행료 2배 효과가 끝났습니다.`)}
  });
}

function tickGlobalEffects(state){
  if(!state.globalEffects)return;
  for(const key of ['imperialExploitation','americanRage','genevaConvention']){
    const effect=state.globalEffects[key];if(!effect?.remainingTurns)continue;
    if(effect.activatedTurn===state.turnNumber){effect.activatedTurn=null;continue}
    effect.remainingTurns-=1;
    if(effect.remainingTurns<=0){state.globalEffects[key]=null;addLog(state,`${EFFECT_NAMES[key]} 효과가 끝났습니다.`)}
  }
}

export function endTurn(state){
  requirePhase(state,PHASES.END_TURN);const oldIndex=state.currentPlayerIndex;
  const bonus=RULES.BONUS_TURN_ON_DOUBLE&&state.rolledDouble&&!state.islandEscapeThisTurn&&state.consecutiveDoubles<RULES.MAX_CONSECUTIVE_DOUBLES&&!currentPlayer(state).bankrupt;
  tickWorldCupBonuses(state,currentPlayer(state).id);
  if(!bonus){tickGlobalEffects(state);state.currentPlayerIndex=nextActiveIndex(state,state.currentPlayerIndex);state.turnNumber+=1;state.consecutiveDoubles=0}else addLog(state,`${currentPlayer(state).name}이 더블 보너스 턴을 얻었습니다.`);
  prepareTurn(state);return {playerChanged:oldIndex!==state.currentPlayerIndex,bonusTurn:bonus};
}

export function openTrade(state){requirePhase(state,PHASES.WAITING_FOR_ROLL);state.phase=PHASES.TRADE;state.trade={stage:'editing'}}
function tradeableTiles(state,playerId){return state.board.filter(tile=>tile.ownerId===playerId&&(tile.type==='facility'||tile.buildingLevel===0))}
export function getTradeableAssets(state,playerId){return tradeableTiles(state,playerId)}

export function proposeTrade(state,proposal){
  requirePhase(state,PHASES.TRADE);const proposer=currentPlayer(state);const partner=state.players.find(player=>player.id===proposal.partnerId&&!player.bankrupt);
  if(!partner||partner.id===proposer.id)throw new Error('거래 상대를 선택하세요.');
  const offerCash=Math.max(0,Math.round(Number(proposal.offerCash)||0));const requestCash=Math.max(0,Math.round(Number(proposal.requestCash)||0));
  if(offerCash>proposer.money||requestCash>partner.money)throw new Error('제안한 현금이 보유 금액보다 많습니다.');
  const offered=proposal.offerAssetId?state.board.find(tile=>tile.id===proposal.offerAssetId):null;const requested=proposal.requestAssetId?state.board.find(tile=>tile.id===proposal.requestAssetId):null;
  if(offered&&(offered.ownerId!==proposer.id||offered.buildingLevel>0))throw new Error('제안 자산을 거래할 수 없습니다.');
  if(requested&&(requested.ownerId!==partner.id||requested.buildingLevel>0))throw new Error('요청 자산을 거래할 수 없습니다.');
  if(!offerCash&&!requestCash&&!offered&&!requested)throw new Error('거래할 현금이나 자산을 선택하세요.');
  state.trade={stage:'review',proposerId:proposer.id,partnerId:partner.id,offerCash,requestCash,offerAssetId:offered?.id||null,requestAssetId:requested?.id||null};
}

function transferTile(state,tileId,from,to){if(!tileId)return;const tile=state.board.find(item=>item.id===tileId);removeOwnedId(from,tile);tile.ownerId=to.id;tile.worldCupTurns=0;tile.worldCupActivatedTurn=null;(tile.type==='city'?to.ownedProperties:to.specialAssets).push(tile.id)}
export function resolveTrade(state,accepted){
  requirePhase(state,PHASES.TRADE);if(state.trade?.stage!=='review')throw new Error('검토할 거래가 없습니다.');const trade=state.trade;
  const proposer=state.players.find(player=>player.id===trade.proposerId);const partner=state.players.find(player=>player.id===trade.partnerId);
  if(accepted){
    if(proposer.money<trade.offerCash||partner.money<trade.requestCash)throw new Error('보유 현금이 달라져 거래를 완료할 수 없습니다.');
    proposer.money+=trade.requestCash-trade.offerCash;partner.money+=trade.offerCash-trade.requestCash;
    transferTile(state,trade.offerAssetId,proposer,partner);transferTile(state,trade.requestAssetId,partner,proposer);addLog(state,`${proposer.name}과 ${partner.name}의 거래가 성사되었습니다.`);
  }else addLog(state,`${partner.name}이 거래를 거절했습니다.`);
  state.trade=null;state.phase=PHASES.WAITING_FOR_ROLL;
}

export function cancelTrade(state){requirePhase(state,PHASES.TRADE);state.trade=null;state.phase=PHASES.WAITING_FOR_ROLL}
export function dismissNotice(state){state.notice=null}
export function updateClock(state,seconds=1){
  if(state.status!=='playing'||state.timer.remainingSeconds===null)return false;
  state.timer.remainingSeconds=Math.max(0,state.timer.remainingSeconds-seconds);if(state.timer.remainingSeconds===0){finishGame(state,'time-limit');return true}return false;
}
export function getNetWorth(state,playerId){return netWorth(state,playerId)}
export function canDeclareBankruptcy(state){const player=currentPlayer(state);const cards=(player.specialCards||[]).reduce((sum,id)=>sum+(SPECIAL_CARD_INFO[id]?.sellPrice||0),0);return Boolean(state.pendingDebt&&player.money+liquidationValue(state,player.id)+cards<state.pendingDebt.amount)}
export function cloneGame(state){return clone(state)}
