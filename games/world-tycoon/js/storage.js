import {PHASES,PLAYER_TOKENS,RULES} from './rules.js';
import {createBoard} from './board.js';
import {EVENT_CARDS} from './data/events.js';

const slotKey=slot=>`${RULES.AUTOSAVE_KEY_PREFIX}${Math.min(RULES.SAVE_SLOT_COUNT,Math.max(1,Number(slot)||1))}`;

export function isValidSavedGame(value){
  return Boolean(value&&[4,RULES.SAVE_VERSION].includes(value.version)&&value.status==='playing'&&Array.isArray(value.players)&&[2,3,4].includes(value.players.length)&&Array.isArray(value.board)&&value.board.length===40&&Object.values(PHASES).includes(value.phase));
}

export function loadGame(storage=globalThis.localStorage,slot=1){
  try{
    const normalizedSlot=Math.min(RULES.SAVE_SLOT_COUNT,Math.max(1,Number(slot)||1));const raw=storage.getItem(slotKey(normalizedSlot))??(normalizedSlot===1?storage.getItem(RULES.LEGACY_AUTOSAVE_KEY):null);const value=JSON.parse(raw);if(!isValidSavedGame(value))return null;
    value.version=RULES.SAVE_VERSION;value.saveSlot=normalizedSlot;value.gameStage=value.gameStage||'SECOND_HALF';value.auction=value.auction||null;
    value.players.forEach((player,index)=>{player.token=PLAYER_TOKENS[index];player.lapsCompleted=Math.max(0,Number(player.lapsCompleted)||0);player.islandFailedRolls=Math.min(RULES.ISLAND_MAX_TRAPPED_TURNS-1,Math.max(0,Number(player.islandFailedRolls)||0));player.bankLoan=normalizeLoan(player.bankLoan)});
    const freshBoard=createBoard();value.board=freshBoard.map((fresh,index)=>({...fresh,ownerId:value.board[index]?.ownerId??null,buildingLevel:Math.min(RULES.MAX_BUILDING_LEVEL,Math.max(0,Number(value.board[index]?.buildingLevel)||0)),worldCupTurns:Math.max(0,Number(value.board[index]?.worldCupTurns)||0),worldCupActivatedTurn:value.board[index]?.worldCupActivatedTurn??null}));
    if(!Array.isArray(value.eventDeck)){value.eventDeck=EVENT_CARDS.map(card=>card.id);value.eventCursor=0}
    EVENT_CARDS.forEach(card=>{if(!value.eventDeck.includes(card.id))value.eventDeck.push(card.id)});
    const savedEffects=value.globalEffects||{};value.globalEffects={imperialExploitation:normalizeEffect(savedEffects.imperialExploitation),americanRage:normalizeEffect(savedEffects.americanRage)};
    value.islandEscapeThisTurn=false;return value;
  }catch{return null}
}

export function loadGames(storage=globalThis.localStorage){return Array.from({length:RULES.SAVE_SLOT_COUNT},(_,index)=>loadGame(storage,index+1))}

function normalizeEffect(effect){
  if(!effect||Number(effect.remainingTurns)<=0)return null;
  return {remainingTurns:Math.max(1,Math.round(Number(effect.remainingTurns))),durationRounds:Math.max(1,Math.round(Number(effect.durationRounds)||1)),activatedTurn:effect.activatedTurn??null};
}

function normalizeLoan(loan){
  if(!loan||Number(loan.principal)<=0)return null;
  return {principal:Math.max(0,Math.round(Number(loan.principal)||0)),interest:Math.max(0,Math.round(Number(loan.interest)||0)),dueLap:Math.max(1,Math.round(Number(loan.dueLap)||RULES.BANK_LOAN_TERM_LAPS))};
}

export function saveGame(state,storage=globalThis.localStorage,slot=state?.saveSlot||1){
  try{state.saveSlot=Math.min(RULES.SAVE_SLOT_COUNT,Math.max(1,Number(slot)||1));storage.setItem(slotKey(state.saveSlot),JSON.stringify(state));return true}catch{return false}
}

export function clearGame(storage=globalThis.localStorage,slot=1){
  try{const normalizedSlot=Math.min(RULES.SAVE_SLOT_COUNT,Math.max(1,Number(slot)||1));storage.removeItem(slotKey(normalizedSlot));if(normalizedSlot===1)storage.removeItem(RULES.LEGACY_AUTOSAVE_KEY);return true}catch{return false}
}
