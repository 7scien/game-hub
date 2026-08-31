import {REGION_STYLES} from './data/board.js';

export const PHASES={
  WAITING_FOR_ROLL:'WAITING_FOR_ROLL',ROLLING:'ROLLING',MOVING:'MOVING',RESOLVING_TILE:'RESOLVING_TILE',
  BUY_DECISION:'BUY_DECISION',BUILD_DECISION:'BUILD_DECISION',TRAVEL_DECISION:'TRAVEL_DECISION',WORLD_CUP_DECISION:'WORLD_CUP_DECISION',TERROR_TARGET_DECISION:'TERROR_TARGET_DECISION',PAYMENT_DECISION:'PAYMENT_DECISION',TRADE:'TRADE',ASSET_MANAGEMENT:'ASSET_MANAGEMENT',
  END_TURN:'END_TURN',GAME_OVER:'GAME_OVER',
};

export const RULES={
  STARTING_MONEY:2930000,PASS_START_BONUS:200000,MAX_BUILDING_LEVEL:4,GROUP_COMPLETION_MULTIPLIER:1.5,
  SELL_PROPERTY_RATE:.5,SELL_BUILDING_RATE:.5,BONUS_TURN_ON_DOUBLE:true,MAX_CONSECUTIVE_DOUBLES:3,
  FACILITY_MULTIPLIERS:[0,1,1,1,1],AUTOSAVE_KEY:'world-tycoon-save-v4',SAVE_VERSION:4,
};

export const PLAYER_COLORS=['#ff5d7d','#4ed6ff','#ffd65a','#8c7bff'];
export const PLAYER_TOKENS=['✈','✈','✈','✈'];

export function formatMoney(amount){
  const value=Math.round(Number(amount)||0);const sign=value<0?'−':'';const absolute=Math.abs(value);
  if(absolute>=10000&&absolute%10000===0)return `${sign}${absolute/10000}만 원`;
  return `${sign}${absolute.toLocaleString('ko-KR')}원`;
}

export function ownsRegion(state,ownerId,region){
  const cities=state.board.filter(tile=>tile.type==='city'&&tile.region===region);
  return cities.length>0&&cities.every(tile=>tile.ownerId===ownerId);
}

export function calculateRent(state,tile,visitor){
  if(tile.type==='city'){
    let rent=tile.rentByLevel[tile.buildingLevel]??tile.baseRent;
    if(tile.buildable!==false&&ownsRegion(state,tile.ownerId,tile.region))rent*=RULES.GROUP_COMPLETION_MULTIPLIER;
    if(tile.worldCupTurns>0)rent*=2;
    return Math.round(rent);
  }
  if(tile.type==='facility'){
    let rent=tile.baseRent;
    return Math.round(rent);
  }
  return 0;
}

export function buildingValue(tile){
  if(tile.type!=='city'||!tile.buildingLevel)return 0;
  return tile.buildingCosts.slice(0,tile.buildingLevel).reduce((sum,cost)=>sum+cost,0);
}

export function netWorth(state,playerId){
  const player=state.players.find(item=>item.id===playerId);
  if(!player||player.bankrupt)return 0;
  return Math.round(player.money+state.board.filter(tile=>tile.ownerId===playerId).reduce((sum,tile)=>sum+(tile.purchasePrice||0)+buildingValue(tile),0));
}

export function liquidationValue(state,playerId){
  return Math.round(state.board.filter(tile=>tile.ownerId===playerId).reduce((sum,tile)=>sum+(tile.purchasePrice||0)*RULES.SELL_PROPERTY_RATE+buildingValue(tile)*RULES.SELL_BUILDING_RATE,0));
}

export function regionMeta(region){return REGION_STYLES[region]??{name:'시설',color:'#6f85a6'}}
