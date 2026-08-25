import {PHASES,RULES} from './rules.js';

export function isValidSavedGame(value){
  return Boolean(value&&value.version===RULES.SAVE_VERSION&&value.status==='playing'&&Array.isArray(value.players)&&[2,3,4].includes(value.players.length)&&Array.isArray(value.board)&&value.board.length===40&&Object.values(PHASES).includes(value.phase));
}

export function loadGame(storage=globalThis.localStorage){
  try{const value=JSON.parse(storage.getItem(RULES.AUTOSAVE_KEY));return isValidSavedGame(value)?value:null}catch{return null}
}

export function saveGame(state,storage=globalThis.localStorage){
  try{storage.setItem(RULES.AUTOSAVE_KEY,JSON.stringify(state));return true}catch{return false}
}

export function clearGame(storage=globalThis.localStorage){
  try{storage.removeItem(RULES.AUTOSAVE_KEY);return true}catch{return false}
}
