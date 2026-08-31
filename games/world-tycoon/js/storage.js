import {PHASES,PLAYER_TOKENS,RULES} from './rules.js';
import {createBoard} from './board.js';
import {EVENT_CARDS} from './data/events.js';

export function isValidSavedGame(value){
  return Boolean(value&&value.version===RULES.SAVE_VERSION&&value.status==='playing'&&Array.isArray(value.players)&&[2,3,4].includes(value.players.length)&&Array.isArray(value.board)&&value.board.length===40&&Object.values(PHASES).includes(value.phase));
}

export function loadGame(storage=globalThis.localStorage){
  try{
    const value=JSON.parse(storage.getItem(RULES.AUTOSAVE_KEY));if(!isValidSavedGame(value))return null;
    value.players.forEach((player,index)=>{player.token=PLAYER_TOKENS[index]});
    const freshBoard=createBoard();value.board=freshBoard.map((fresh,index)=>({...fresh,ownerId:value.board[index]?.ownerId??null,buildingLevel:Math.min(RULES.MAX_BUILDING_LEVEL,Math.max(0,Number(value.board[index]?.buildingLevel)||0)),worldCupTurns:Math.max(0,Number(value.board[index]?.worldCupTurns)||0),worldCupActivatedTurn:value.board[index]?.worldCupActivatedTurn??null}));
    if(!Array.isArray(value.eventDeck)){value.eventDeck=EVENT_CARDS.map(card=>card.id);value.eventCursor=0}
    EVENT_CARDS.forEach(card=>{if(!value.eventDeck.includes(card.id))value.eventDeck.push(card.id)});
    const savedEffects=value.globalEffects||{};value.globalEffects={imperialExploitation:normalizeEffect(savedEffects.imperialExploitation),americanRage:normalizeEffect(savedEffects.americanRage)};
    value.islandEscapeThisTurn=false;return value;
  }catch{return null}
}

function normalizeEffect(effect){
  if(!effect||Number(effect.remainingTurns)<=0)return null;
  return {remainingTurns:Math.max(1,Math.round(Number(effect.remainingTurns))),durationRounds:Math.max(1,Math.round(Number(effect.durationRounds)||1)),activatedTurn:effect.activatedTurn??null};
}

export function saveGame(state,storage=globalThis.localStorage){
  try{storage.setItem(RULES.AUTOSAVE_KEY,JSON.stringify(state));return true}catch{return false}
}

export function clearGame(storage=globalThis.localStorage){
  try{storage.removeItem(RULES.AUTOSAVE_KEY);return true}catch{return false}
}
