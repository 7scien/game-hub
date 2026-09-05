import {PHASES} from './rules.js';

// Presentation-only snapshots: never mutate the rules or persist replay flags.
export function capturePresentation(state){
  if(!state)return null;
  const player=state.players[state.currentPlayerIndex];
  return {status:state.status,phase:state.phase,stage:state.gameStage,turn:state.turnNumber,playerId:player?.id,position:player?.position,swapSequence:state.positionSwapSequence||0,transportLocked:Boolean(state.globalEffects?.americanRage?.remainingTurns>0)};
}

export function presentationChanges(before,state){
  const next=capturePresentation(state);const changes={transport:null,arrival:null,turn:null};
  if(!next||next.status!=='playing')return changes;
  const current=state.players[state.currentPlayerIndex];const player={id:current.id,name:current.name,color:current.color,token:current.token};
  if(before&&before.transportLocked!==next.transportLocked){
    changes.transport={locked:next.transportLocked,tiles:state.board.filter(tile=>tile.type==='facility'||tile.id==='space-travel').map(tile=>({index:tile.index,name:tile.name}))};
  }
  if(before&&before.swapSequence===next.swapSequence&&before.playerId===next.playerId&&before.position!==next.position&&!state.pendingMovement&&!current.bankrupt){
    const tile=state.board[next.position];if(tile?.type==='city')changes.arrival={tile:{index:tile.index,name:tile.name},player};
  }
  const newTurn=!before||before.playerId!==next.playerId||before.turn!==next.turn||before.phase===PHASES.END_TURN||before.stage==='AUCTION';
  if(newTurn&&next.phase===PHASES.WAITING_FOR_ROLL&&next.stage!=='AUCTION'&&!current.bankrupt){
    changes.turn={player,bonus:Boolean(before&&before.playerId===next.playerId&&before.turn===next.turn&&before.phase===PHASES.END_TURN)};
  }
  return changes;
}

export function shouldShowGoldenKeyBeforePresentation(state,{feedbacks=[],changes={},resetAnimation=null}={}){
  const hasPresentation=Boolean(feedbacks.length||changes.transport||changes.arrival||changes.turn||resetAnimation);
  return Boolean(hasPresentation&&state?.notice?.source==='golden-key');
}
