export const MINIGAME_REWARDS=Object.freeze({entryCoins:10,totalPool:40,soloWinner:40,teamWinner:20,trioWinners:Object.freeze([14,13,13])});

export const MINIGAME_PHASES=Object.freeze(['board','reveal','briefing','countdown','playing','results','returning']);

export const ONLINE_MINIGAME_PHASES=Object.freeze([
  'BRIEFING','COUNTDOWN','PLAYING','MINIGAME_RESULT','REWARD_APPLIED','RETURNING_TO_BOARD',
]);

export const TEST_MINIGAME=Object.freeze({
  id:'starlight-catch',
  name:'별빛 부두 포착전',
  type:'free_for_all',
  typeLabel:'4인 개인전',
  description:'제한 시간 동안 반짝이는 별빛을 누구보다 많이 포착하세요.',
  controls:'마우스 또는 손가락으로 빛나는 별을 터치',
  winCondition:'가장 많은 별빛을 모은 플레이어가 승리',
  tip:'연속으로 빠르게 포착하면 다음 별의 위치를 찾기 쉬워요.',
  durationSeconds:12,
});

const PHASE_EVENTS=Object.freeze({
  board:Object.freeze({start:'reveal'}),
  reveal:Object.freeze({revealed:'briefing'}),
  briefing:Object.freeze({ready:'countdown',cancel:'board'}),
  countdown:Object.freeze({go:'playing'}),
  playing:Object.freeze({finish:'results'}),
  results:Object.freeze({continue:'returning'}),
  returning:Object.freeze({complete:'board'}),
});

export function transitionMinigamePhase(phase,event){
  if(!MINIGAME_PHASES.includes(phase))throw new RangeError(`Unknown minigame phase: ${phase}`);
  return PHASE_EVENTS[phase]?.[event]||phase;
}

export function deriveOnlineMinigameView(minigame,now=Date.now()){
  const phase=minigame?.phase;
  if(!ONLINE_MINIGAME_PHASES.includes(phase))return Object.freeze({view:'board',remainingMs:0});
  if(phase==='BRIEFING')return Object.freeze({view:'briefing',remainingMs:0});
  if(phase==='COUNTDOWN'||phase==='PLAYING'){
    const startAt=Date.parse(minigame.startAt||'');
    const endsAt=Date.parse(minigame.endsAt||'');
    const finalizeAt=Date.parse(minigame.finalizeAt||'');
    if(Number.isFinite(startAt)&&now<startAt)return Object.freeze({view:'countdown',remainingMs:startAt-now});
    if(Number.isFinite(endsAt)&&now<endsAt)return Object.freeze({view:'playing',remainingMs:endsAt-now});
    if(Number.isFinite(finalizeAt)&&now<finalizeAt)return Object.freeze({view:'settling',remainingMs:finalizeAt-now});
    return Object.freeze({view:'finalizing',remainingMs:0});
  }
  if(phase==='MINIGAME_RESULT')return Object.freeze({view:'results',remainingMs:0});
  if(phase==='REWARD_APPLIED')return Object.freeze({view:'reward',remainingMs:Math.max(0,Date.parse(minigame.returnAt||'')-now)});
  return Object.freeze({view:'returning',remainingMs:Math.max(0,Date.parse(minigame.boardAt||'')-now)});
}

export function countConfirmed(record){
  return Object.values(record||{}).filter(Boolean).length;
}

export function mergeMinigameScores(players,...scoreMaps){
  const scores=Object.fromEntries(players.map(player=>[player.id,0]));
  for(const scoreMap of scoreMaps){
    for(const [id,value] of Object.entries(scoreMap||{}))if(id in scores)scores[id]=Math.max(scores[id],Math.max(0,Number(value)||0));
  }
  return Object.freeze(scores);
}

export function rankPlayers(players,{bonusStars={}}={}){
  return [...players].map(player=>({...player,finalStars:(player.stars??0)+(bonusStars[player.id]??0)})).sort((first,second)=>
    second.finalStars-first.finalStars||second.coins-first.coins||first.seat-second.seat
  ).map((player,index)=>({...player,rank:index+1}));
}

export function distributeMinigameCoins(type,winnerIds){
  const winners=[...new Set(winnerIds)];
  if(!winners.length)return Object.freeze({});
  let amounts;
  if(type==='free_for_all')amounts=[MINIGAME_REWARDS.soloWinner];
  else if(type==='two_vs_two')amounts=[MINIGAME_REWARDS.teamWinner,MINIGAME_REWARDS.teamWinner];
  else if(type==='one_vs_three')amounts=winners.length===1?[MINIGAME_REWARDS.soloWinner]:MINIGAME_REWARDS.trioWinners;
  else throw new RangeError(`Unknown minigame type: ${type}`);
  if(amounts.length!==winners.length)throw new RangeError(`${type} requires ${amounts.length} winners`);
  return Object.freeze(Object.fromEntries(winners.map((id,index)=>[id,amounts[index]])));
}

export function resolveAchievementAwards(players,metrics){
  const categories=[
    {id:'distance',label:'가장 많이 이동',metric:'distance'},
    {id:'minigames',label:'미니게임 최다승',metric:'minigameWins'},
    {id:'items',label:'아이템 최다 사용',metric:'itemUses'},
  ];
  return categories.map(category=>{
    const winner=[...players].sort((first,second)=>
      (metrics[second.id]?.[category.metric]??0)-(metrics[first.id]?.[category.metric]??0)||
      (second.coins??0)-(first.coins??0)||first.seat-second.seat
    )[0];
    return Object.freeze({...category,winnerId:winner?.id||null,value:metrics[winner?.id]?.[category.metric]??0});
  });
}

export function achievementBonusStars(awards){
  const bonus={};
  for(const award of awards)if(award.winnerId)bonus[award.winnerId]=(bonus[award.winnerId]||0)+1;
  return Object.freeze(bonus);
}
