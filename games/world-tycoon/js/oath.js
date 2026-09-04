// Money is divided once at each end, never recursively between oath partners.
export function oathPartner(state,playerId){
  const oath=(state.oaths||[]).find(item=>item.remainingTurns>0&&item.playerIds.includes(playerId));
  if(!oath)return null;
  return state.players.find(player=>player.id!==playerId&&oath.playerIds.includes(player.id)&&!player.bankrupt)||null;
}

export function splitReceipt(state,playerId,amount,{share=true}={}){
  const partner=share?oathPartner(state,playerId):null;
  return partner?[{playerId,amount:Math.ceil(amount/2)},{playerId:partner.id,amount:Math.floor(amount/2)}]:[{playerId,amount}];
}

export function paymentPlan(state,debt,payerId){
  const partner=oathPartner(state,payerId);
  const internal=partner&&partner.id===debt.recipientId;
  const total=internal?Math.ceil(debt.amount/2):debt.amount;
  const payers=partner&&!internal?splitReceipt(state,payerId,total):[{playerId:payerId,amount:total}];
  const ownerTotal=debt.recipientId?Math.round((debt.recipientAmount??debt.amount)*total/Math.max(1,debt.amount)):0;
  let ownerRemaining=ownerTotal;
  return payers.map((payer,index)=>{
    const ownerAmount=index===payers.length-1?ownerRemaining:Math.floor(ownerTotal*payer.amount/Math.max(1,total));ownerRemaining-=ownerAmount;
    const credits=debt.recipientId?splitReceipt(state,debt.recipientId,ownerAmount,{share:!internal}):[];
    return {...debt,payerId:payer.playerId,amount:payer.amount,recipientAmount:ownerAmount,credits,
      oathShared:Boolean(partner||oathPartner(state,debt.recipientId)),
      reason:internal?`도원결의 · 서로의 통행료 절반 · ${debt.reason}`:partner||credits.length>1?`도원결의 분담 · ${debt.reason}`:debt.reason};
  });
}

export function startOath(state,playerId,rng=Math.random){
  const candidates=state.players.filter(player=>player.id!==playerId&&!player.bankrupt);
  if(!candidates.length)return null;
  const partner=candidates[Math.floor(rng()*candidates.length)];const playerIds=[playerId,partner.id];
  state.oaths=(state.oaths||[]).filter(oath=>!oath.playerIds.some(id=>playerIds.includes(id)));
  state.oaths.push({playerIds,remainingTurns:state.players.filter(player=>!player.bankrupt).length*2,activatedTurn:state.turnNumber});
  return partner;
}

export function tickOaths(state){
  state.oaths=(state.oaths||[]).filter(oath=>oath.playerIds.every(id=>state.players.some(player=>player.id===id&&!player.bankrupt)));
  for(const oath of state.oaths){if(oath.activatedTurn===state.turnNumber)oath.activatedTurn=null;else oath.remainingTurns-=1}
  state.oaths=state.oaths.filter(oath=>oath.remainingTurns>0);
}
