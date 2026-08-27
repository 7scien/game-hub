import {useEffect,useMemo,useRef,useState} from 'react';
import {achievementBonusStars,distributeMinigameCoins,rankPlayers,resolveAchievementAwards,TEST_MINIGAME,transitionMinigamePhase} from '../domain/presentation.js';
import {Character} from './characters.jsx';
import {MiniGameArena} from './MiniGameArena.jsx';

export function MiniGameFlow({players,currentPlayerId,onComplete}){
  const [phase,setPhase]=useState('reveal');const [readyIds,setReadyIds]=useState([]);const [countdown,setCountdown]=useState(3);
  const [score,setScore]=useState(0);const [timeLeft,setTimeLeft]=useState(TEST_MINIGAME.durationSeconds);const [results,setResults]=useState(null);
  const scoreRef=useRef(0);
  const go=event=>setPhase(value=>transitionMinigamePhase(value,event));

  useEffect(()=>{if(phase!=='reveal')return undefined;const timer=setTimeout(()=>go('revealed'),1150);return()=>clearTimeout(timer)},[phase]);
  useEffect(()=>{
    if(phase!=='countdown')return undefined;setCountdown(3);let value=3;
    const timer=setInterval(()=>{value-=1;if(value<0){clearInterval(timer);go('go')}else setCountdown(value)},780);
    return()=>clearInterval(timer);
  },[phase]);
  useEffect(()=>{
    if(phase!=='playing')return undefined;scoreRef.current=0;setScore(0);setTimeLeft(TEST_MINIGAME.durationSeconds);let remaining=TEST_MINIGAME.durationSeconds;
    const timer=setInterval(()=>{remaining-=1;setTimeLeft(remaining);if(remaining<=0){clearInterval(timer);finishGame()}},1000);
    return()=>clearInterval(timer);
  },[phase]);
  useEffect(()=>{if(phase!=='returning')return undefined;const timer=setTimeout(onComplete,850);return()=>clearTimeout(timer)},[phase,onComplete]);

  const finishGame=()=>{
    const scores=Object.fromEntries(players.map((player,index)=>[player.id,player.id===currentPlayerId?scoreRef.current:[7,5,4,6][index]||4]));
    const ranked=[...players].sort((first,second)=>scores[second.id]-scores[first.id]||first.seat-second.seat);
    const rewards=distributeMinigameCoins(TEST_MINIGAME.type,[ranked[0].id]);
    setResults({scores,ranked,rewards,winnerIds:[ranked[0].id]});go('finish');
  };
  const readyAll=()=>{setReadyIds(players.map(player=>player.id));setTimeout(()=>go('ready'),480)};

  return <section className={`presentation-layer minigame-flow phase-${phase}`} aria-label="미니게임 전환 화면">
    {phase==='reveal'&&<div className="minigame-reveal"><span>NEXT UP</span><h1>MINIGAME!</h1><i/><p>보드에서 잠시 벗어나 새로운 경기장으로 이동합니다.</p></div>}
    {phase==='briefing'&&<div className="minigame-briefing">
      <header><div><span>MINIGAME 01 · {TEST_MINIGAME.typeLabel}</span><h1>{TEST_MINIGAME.name}</h1><p>{TEST_MINIGAME.description}</p></div><button type="button" onClick={()=>go('cancel')}>보드로 돌아가기</button></header>
      <div className="briefing-grid">
        <div className="briefing-preview"><MiniGameArena active={false}/><span>3D ARENA PREVIEW</span></div>
        <div className="briefing-rules">
          <Rule icon="◎" label="조작법" value={TEST_MINIGAME.controls}/><Rule icon="◆" label="승리 조건" value={TEST_MINIGAME.winCondition}/><Rule icon="✦" label="TIP" value={TEST_MINIGAME.tip}/>
          <div className="ready-roster">{players.map(player=><article key={player.id} className={readyIds.includes(player.id)?'ready':''}><Character id={player.character} small/><b>{player.displayName}</b><span>{readyIds.includes(player.id)?'READY':'WAITING'}</span></article>)}</div>
          <button className="ready-button" type="button" onClick={readyAll} disabled={readyIds.length>0}>{readyIds.length===players.length?'모두 준비 완료':'준비 완료'}</button>
          <small className="authority-note">실제 온라인 경기에서는 4명의 서버 READY 상태가 모이면 시작됩니다.</small>
        </div>
      </div>
    </div>}
    {(phase==='countdown'||phase==='playing')&&<div className="minigame-play">
      <MiniGameArena active={phase==='playing'} onScore={value=>{scoreRef.current=value;setScore(value)}}/>
      <header><span>{TEST_MINIGAME.name}</span><b>{phase==='playing'?`${timeLeft}s`:'READY'}</b></header>
      <div className="live-score"><span>MY SCORE</span><strong>{score}</strong><small>빛나는 별을 터치하세요!</small></div>
      {phase==='countdown'&&<div className="countdown"><b>{countdown===0?'GO!':countdown}</b></div>}
    </div>}
    {phase==='results'&&results&&<MiniGameResults players={players} results={results} onContinue={()=>go('continue')}/>} 
    {phase==='returning'&&<div className="returning-board"><i/><b>BOARD로 돌아가는 중</b><span>확정된 결과를 모든 플레이어에게 동기화합니다.</span></div>}
  </section>;
}

function Rule({icon,label,value}){return <article className="briefing-rule"><i>{icon}</i><div><span>{label}</span><b>{value}</b></div></article>}

function MiniGameResults({players,results,onContinue}){
  return <div className="minigame-results">
    <header><span>MATCH COMPLETE</span><h1>승리!</h1><p>총 40코인 보상 결과</p></header>
    <div className="result-podium">{results.ranked.map((player,index)=>{
      const winner=results.winnerIds.includes(player.id);return <article key={player.id} className={winner?'winner':'loser'}>
        <span>{index+1}<small>{['ST','ND','RD','TH'][index]}</small></span><Character id={player.character} state={winner?'move':'reaction'}/><b>{player.displayName}</b>
        <dl><div><dt>SCORE</dt><dd>{results.scores[player.id]}</dd></div><div><dt>COIN</dt><dd>+{results.rewards[player.id]||0}</dd></div></dl>
      </article>})}</div>
    <p className="authority-note">보상 값은 공통 분배 규칙으로 계산되며, 실전에서는 Supabase 권위 상태의 확정 결과만 표시합니다.</p>
    <button className="results-continue" type="button" onClick={onContinue}>결과 확인 · 보드로 복귀</button>
  </div>;
}

export function FinalWinnerPrototype({players,onClose}){
  const metrics=useMemo(()=>Object.fromEntries(players.map((player,index)=>[player.id,{distance:[31,27,38,34][index],minigameWins:[2,1,3,2][index],itemUses:[3,5,2,4][index]}])),[players]);
  const awards=useMemo(()=>resolveAchievementAwards(players,metrics),[players,metrics]);const bonus=useMemo(()=>achievementBonusStars(awards),[awards]);
  const ranked=useMemo(()=>rankPlayers(players,{bonusStars:bonus}),[players,bonus]);const [revealed,setRevealed]=useState(0);const [showWinner,setShowWinner]=useState(false);
  useEffect(()=>{const timer=setInterval(()=>setRevealed(value=>{if(value>=awards.length){clearInterval(timer);setTimeout(()=>setShowWinner(true),650);return value}return value+1}),850);return()=>clearInterval(timer)},[awards.length]);
  const top=ranked[0];const winners=ranked.filter(player=>player.finalStars===top.finalStars&&player.coins===top.coins);
  return <section className={`presentation-layer final-prototype${showWinner?' show-winner':''}`} aria-label="최종 우승 화면 프로토타입">
    {!showWinner?<div className="achievement-stage"><span>FINAL AWARDS</span><h1>마지막 업적을 발표합니다</h1><div>{awards.map((award,index)=>{
      const winner=players.find(player=>player.id===award.winnerId);return <article key={award.id} className={index<revealed?'revealed':''}><i>{['➜','◆','▣'][index]}</i><div><small>ACHIEVEMENT {index+1}</small><b>{award.label}</b></div><span>{winner?.displayName||'—'}</span><em>★ +1</em></article>})}</div></div>:
      <div className="winner-stage">
        <div className="spotlight"/><header><span>GAME COMPLETE</span><h1>{winners.length>1?'공동 최종 우승!':'최종 우승!'}</h1></header>
        <div className="winner-characters">{winners.map(player=><article key={player.id}><Character id={player.character} state="move"/><b>{player.displayName}</b></article>)}</div>
        <ol>{ranked.map(player=><li key={player.id}><span>{player.rank}위</span><Character id={player.character} small/><b>{player.displayName}</b><em>★ {player.finalStars}</em><small>● {player.coins}</small><i>업적 +{bonus[player.id]||0}</i></li>)}</ol>
        <button type="button" onClick={onClose}>보드 화면으로 돌아가기</button>
      </div>}
    <small className="prototype-label">FINAL PRESENTATION PROTOTYPE · 서버 상태 변경 없음</small>
  </section>;
}
