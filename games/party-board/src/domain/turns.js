export const TURN_RULES=Object.freeze({finalTurn:60,minigameInterval:6,starAppearsAfterTurn:9,companionTurns:[21,42]});

export function getTurnMilestones(completedGlobalTurn){
  if(!Number.isInteger(completedGlobalTurn)||completedGlobalTurn<1||completedGlobalTurn>TURN_RULES.finalTurn)throw new RangeError('global turn must be an integer from 1 to 60');
  return Object.freeze({
    showResults:completedGlobalTurn===TURN_RULES.finalTurn,
    startPlaceholderMinigame:completedGlobalTurn<TURN_RULES.finalTurn&&completedGlobalTurn%TURN_RULES.minigameInterval===0,
    spawnInitialStar:completedGlobalTurn===TURN_RULES.starAppearsAfterTurn,
    spawnCompanion:TURN_RULES.companionTurns.includes(completedGlobalTurn),
  });
}

export function salaryForCompletedLap(completedLapCount){
  if(!Number.isInteger(completedLapCount)||completedLapCount<1)throw new RangeError('lap count must be a positive integer');
  return completedLapCount*10;
}
