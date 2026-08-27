import assert from 'node:assert/strict';
import test from 'node:test';
import {achievementBonusStars,countConfirmed,deriveOnlineMinigameView,distributeMinigameCoins,mergeMinigameScores,rankPlayers,resolveAchievementAwards,transitionMinigamePhase} from '../src/domain/presentation.js';

const players=[
  {id:'p1',seat:0,stars:1,coins:12},
  {id:'p2',seat:1,stars:2,coins:5},
  {id:'p3',seat:2,stars:1,coins:30},
  {id:'p4',seat:3,stars:0,coins:40},
];

test('the minigame presentation follows the documented transition order',()=>{
  const events=['start','revealed','ready','go','finish','continue','complete'];
  assert.deepEqual(events.reduce((phases,event)=>[...phases,transitionMinigamePhase(phases.at(-1),event)],['board']),[
    'board','reveal','briefing','countdown','playing','results','returning','board',
  ]);
  assert.equal(transitionMinigamePhase('briefing','unknown'),'briefing');
});

test('all minigame reward modes distribute exactly 40 coins',()=>{
  const solo=distributeMinigameCoins('free_for_all',['p1']);
  const duo=distributeMinigameCoins('two_vs_two',['p1','p2']);
  const lone=distributeMinigameCoins('one_vs_three',['p3']);
  const trio=distributeMinigameCoins('one_vs_three',['p1','p2','p4']);
  for(const rewards of [solo,duo,lone,trio])assert.equal(Object.values(rewards).reduce((sum,value)=>sum+value,0),40);
  assert.deepEqual(solo,{p1:40});assert.deepEqual(duo,{p1:20,p2:20});assert.deepEqual(trio,{p1:14,p2:13,p4:13});
});

test('player standings prioritize stars and then coins',()=>{
  assert.deepEqual(rankPlayers(players).map(player=>player.id),['p2','p3','p1','p4']);
  assert.deepEqual(rankPlayers(players,{bonusStars:{p1:2}}).map(player=>player.id),['p1','p2','p3','p4']);
});

test('achievement ties are resolved by coins and become bonus stars',()=>{
  const metrics={
    p1:{distance:8,minigameWins:1,itemUses:2},p2:{distance:8,minigameWins:3,itemUses:1},
    p3:{distance:8,minigameWins:3,itemUses:5},p4:{distance:4,minigameWins:0,itemUses:5},
  };
  const awards=resolveAchievementAwards(players,metrics);
  assert.deepEqual(awards.map(award=>award.winnerId),['p3','p3','p4']);
  assert.deepEqual(achievementBonusStars(awards),{p3:2,p4:1});
});

test('online minigame view catches up from authoritative timestamps',()=>{
  const base=Date.parse('2026-08-27T00:00:00.000Z');
  const minigame={phase:'COUNTDOWN',startAt:new Date(base+4000).toISOString(),endsAt:new Date(base+16000).toISOString(),finalizeAt:new Date(base+17500).toISOString()};
  assert.deepEqual(deriveOnlineMinigameView(minigame,base),{view:'countdown',remainingMs:4000});
  assert.deepEqual(deriveOnlineMinigameView(minigame,base+5000),{view:'playing',remainingMs:11000});
  assert.deepEqual(deriveOnlineMinigameView(minigame,base+16500),{view:'settling',remainingMs:1000});
  assert.deepEqual(deriveOnlineMinigameView(minigame,base+18000),{view:'finalizing',remainingMs:0});
  assert.equal(deriveOnlineMinigameView({...minigame,phase:'MINIGAME_RESULT'},base).view,'results');
});

test('READY counts and broadcast score merges are deterministic',()=>{
  assert.equal(countConfirmed({p1:true,p2:false,p3:true,p4:true}),3);
  assert.deepEqual(mergeMinigameScores(players,{p1:2,p2:4},{p1:5,p2:3,p3:1}),{p1:5,p2:4,p3:1,p4:0});
});
