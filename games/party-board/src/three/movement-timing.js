export const MOTION_STAGES=Object.freeze(['idle','anticipation','move','slow_down','stop','reaction','idle']);

export function isFastMovement(totalSteps){
  return Number(totalSteps)>12;
}

export function movementStepDuration({totalSteps,stepIndex,pathLength,reducedMotion=false}){
  if(reducedMotion)return 45;
  const base=isFastMovement(totalSteps)?145:310;
  const stepsFromEnd=Math.max(0,pathLength-stepIndex-1);
  if(stepsFromEnd===0)return Math.round(base*1.72);
  if(stepsFromEnd===1)return Math.round(base*1.35);
  return base;
}

export function stageDuration(stage,reducedMotion=false){
  if(reducedMotion)return stage==='reaction'?120:55;
  return {anticipation:330,stop:190,reaction:720}[stage]||0;
}
