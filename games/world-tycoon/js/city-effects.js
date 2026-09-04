import {splitReceipt} from './oath.js';

export function clearCityEffects(tile){tile.ghostCity=null;tile.trojanHorse=null}

export function activeTrojan(state,tile){
  const effect=tile?.trojanHorse;
  return effect?.remainingTurns>0&&tile.ownerId===effect.ownerId&&state.players.some(p=>p.id===effect.beneficiaryId&&!p.bankrupt)?effect:null;
}

// Preserve visitor discounts, then divert the owner's actual income, not bank fees.
export function divertTrojanPayments(state,tile,payments){
  const effect=activeTrojan(state,tile);
  if(!effect||payments[0]?.recipientId!==tile.ownerId)return payments;
  return payments.map(payment=>{
    const interceptedAmount=payment.recipientAmount||0;
    const receipts=splitReceipt(state,effect.beneficiaryId,interceptedAmount);
    const selfCredit=receipts.filter(r=>r.playerId===payment.payerId).reduce((sum,r)=>sum+r.amount,0);
    return {...payment,amount:payment.amount-selfCredit,recipientId:effect.beneficiaryId,recipientAmount:interceptedAmount-selfCredit,
      credits:receipts.filter(r=>r.playerId!==payment.payerId),oathShared:payment.oathShared||receipts.length>1,
      reason:`트로이 목마 · ${payment.reason}`,trojan:{tileId:tile.id,effectId:effect.id,beneficiaryId:effect.beneficiaryId,interceptedAmount}};
  });
}

export function tickCityEffects(state){
  const expired=[];
  for(const tile of state.board)for(const key of ['ghostCity','trojanHorse']){
    const effect=tile[key];if(!effect)continue;
    const invalid=effect.ownerId!==tile.ownerId||!state.players.some(p=>p.id===effect.ownerId&&!p.bankrupt)||(key==='trojanHorse'&&!state.players.some(p=>p.id===effect.beneficiaryId&&!p.bankrupt));
    if(invalid){tile[key]=null;continue}
    if(effect.activatedTurn===state.turnNumber){effect.activatedTurn=null;continue}
    effect.remainingTurns-=1;if(effect.remainingTurns<=0){tile[key]=null;expired.push({tile,key})}
  }
  return expired;
}
