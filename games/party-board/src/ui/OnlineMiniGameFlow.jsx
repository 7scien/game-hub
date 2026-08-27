import {useEffect,useMemo,useRef,useState} from 'react';
import {countConfirmed,deriveOnlineMinigameView,mergeMinigameScores,TEST_MINIGAME} from '../domain/presentation.js';
import {roomService} from '../online/room-service.js';
import {Character} from './characters.jsx';
import {MiniGameArena} from './MiniGameArena.jsx';

export function OnlineMiniGameFlow({snapshot,players,minigameEvent,onSnapshot,onError}){
  const room=snapshot.room;const minigame=room.game_state?.minigame;const currentUserId=snapshot.current_user_id;
  const me=players.find(player=>player.id===currentUserId);const instanceId=minigame?.instanceId;
  const serverOffset=useMemo(()=>{
    const serverNow=Date.parse(snapshot.server_now||'');return Number.isFinite(serverNow)?serverNow-Date.now():0;
  },[snapshot.server_now]);
  const [now,setNow]=useState(()=>Date.now()+serverOffset);
  const [liveScores,setLiveScores]=useState(()=>mergeMinigameScores(players,snapshot.minigame_scores,minigame?.scores));
  const [busy,setBusy]=useState(false);const [localError,setLocalError]=useState('');
  const hitQueueRef=useRef(Promise.resolve());const sequenceRef=useRef(liveScores[currentUserId]||0);
  const transitionRef=useRef(new Set());

  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+serverOffset),100);return()=>clearInterval(timer)},[serverOffset]);
  useEffect(()=>{
    setLiveScores(previous=>mergeMinigameScores(players,previous,snapshot.minigame_scores,minigame?.scores));
    sequenceRef.current=Math.max(sequenceRef.current,Number(snapshot.minigame_scores?.[currentUserId])||0);
  },[currentUserId,minigame?.scores,players,snapshot.minigame_scores]);
  useEffect(()=>{
    const payload=minigameEvent?.payload;
    if(!payload||payload.instanceId!==instanceId||!payload.userId)return;
    setLiveScores(previous=>mergeMinigameScores(players,previous,{[payload.userId]:payload.score}));
  },[instanceId,minigameEvent,players]);
  useEffect(()=>{transitionRef.current=new Set();sequenceRef.current=Number(snapshot.minigame_scores?.[currentUserId])||0},[currentUserId,instanceId]);

  const viewState=deriveOnlineMinigameView(minigame,now);
  const createdAt=Date.parse(minigame?.createdAt||'');
  const showReveal=minigame?.phase==='BRIEFING'&&Number.isFinite(createdAt)&&now-createdAt<1100;
  const callOnce=async(key,action)=>{
    if(transitionRef.current.has(key))return;
    transitionRef.current.add(key);
    try{onSnapshot(await action())}catch(reason){transitionRef.current.delete(key);report(reason)}
  };
  const report=reason=>{const message=reason?.message||'미니게임 동기화 요청을 처리하지 못했습니다.';setLocalError(message);onError?.(message)};

  useEffect(()=>{
    if(!instanceId)return;
    if(viewState.view==='playing'&&minigame.phase==='COUNTDOWN')callOnce(`${instanceId}:playing`,()=>roomService.syncMinigame(room.id,instanceId));
    if(viewState.view==='finalizing')callOnce(`${instanceId}:finalize`,()=>roomService.finalizeMinigame(room.id,instanceId));
    if(viewState.view==='reward'&&viewState.remainingMs<=0)callOnce(`${instanceId}:returning`,()=>roomService.syncMinigame(room.id,instanceId));
    if(viewState.view==='returning'&&viewState.remainingMs<=0)callOnce(`${instanceId}:board`,()=>roomService.syncMinigame(room.id,instanceId));
  },[instanceId,minigame?.phase,room.id,viewState.remainingMs,viewState.view]);

  if(!minigame||!instanceId)return null;

  const ready=minigame.ready||{};const resultAcks=minigame.resultAcks||{};
  const readyCount=countConfirmed(ready);const ackCount=countConfirmed(resultAcks);
  const setReady=async()=>{
    if(busy||minigame.phase!=='BRIEFING')return;
    setBusy(true);setLocalError('');
    try{onSnapshot(await roomService.setMinigameReady(room.id,instanceId,!ready[currentUserId]))}catch(reason){report(reason)}finally{setBusy(false)}
  };
  const acknowledge=async()=>{
    if(busy||resultAcks[currentUserId])return;
    setBusy(true);setLocalError('');
    try{onSnapshot(await roomService.acknowledgeMinigameResult(room.id,instanceId))}catch(reason){report(reason)}finally{setBusy(false)}
  };
  const scoreHit=value=>{
    if(viewState.view!=='playing'||value<=sequenceRef.current)return;
    const sequence=value;sequenceRef.current=sequence;
    setLiveScores(previous=>mergeMinigameScores(players,previous,{[currentUserId]:sequence}));
    const eventId=crypto.randomUUID();
    roomService.broadcastMinigameHit(room.id,{instanceId,eventId,sequence,score:sequence}).catch(()=>{});
    hitQueueRef.current=hitQueueRef.current.then(async()=>{
      const confirmed=await roomService.recordMinigameHit(room.id,instanceId,sequence,eventId);
      setLiveScores(previous=>mergeMinigameScores(players,previous,{[currentUserId]:confirmed.score}));
      await roomService.broadcastMinigameHit(room.id,{instanceId,eventId,sequence,score:confirmed.score,confirmed:true});
    }).catch(reason=>report(reason));
  };

  return <section className={`presentation-layer online-minigame-flow phase-${minigame.phase.toLowerCase()}`} aria-label="온라인 미니게임">
    {showReveal&&<div className="minigame-reveal"><span>ONLINE MATCH</span><h1>MINIGAME!</h1><i/><p>네 플레이어에게 같은 경기가 선택되었습니다.</p></div>}
    {!showReveal&&viewState.view==='briefing'&&<Briefing players={players} ready={ready} readyCount={readyCount} currentUserId={currentUserId} busy={busy} onReady={setReady}/>} 
    {!showReveal&&['countdown','playing','settling','finalizing'].includes(viewState.view)&&<OnlineArena
      players={players} me={me} scores={liveScores} viewState={viewState} minigame={minigame} now={now} onScore={scoreHit}
    />}
    {viewState.view==='results'&&<OnlineResults players={players} minigame={minigame} currentUserId={currentUserId} ackCount={ackCount} busy={busy} onAcknowledge={acknowledge}/>} 
    {viewState.view==='reward'&&<RewardApplied players={players} minigame={minigame} remainingMs={viewState.remainingMs}/>} 
    {viewState.view==='returning'&&<div className="returning-board"><i/><b>BOARD로 돌아가는 중</b><span>네 화면이 같은 복귀 시각을 기다리고 있습니다.</span></div>}
    {localError&&<p className="online-minigame-error" role="alert">{localError}</p>}
  </section>;
}

function Briefing({players,ready,readyCount,currentUserId,busy,onReady}){
  return <div className="minigame-briefing">
    <header><div><span>ONLINE MINIGAME · {TEST_MINIGAME.typeLabel}</span><h1>{TEST_MINIGAME.name}</h1><p>{TEST_MINIGAME.description}</p></div><strong className="ready-counter">READY {readyCount}/4</strong></header>
    <div className="briefing-grid">
      <div className="briefing-preview"><MiniGameArena active={false}/><span>AUTHORITATIVE MATCH PREVIEW</span></div>
      <div className="briefing-rules">
        <Rule icon="◎" label="조작법" value={TEST_MINIGAME.controls}/><Rule icon="◆" label="승리 조건" value={TEST_MINIGAME.winCondition}/><Rule icon="✦" label="동기화" value="4명 READY 후 서버 기준 시각으로 동시에 시작"/>
        <div className="ready-roster">{players.map(player=><article key={player.id} className={ready[player.id]?'ready':''}><Character id={player.character} small/><b>{player.displayName}{player.id===currentUserId?' · 나':''}</b><span>{ready[player.id]?'READY':'WAITING'}</span></article>)}</div>
        <button className="ready-button" type="button" onClick={onReady} disabled={busy}>{ready[currentUserId]?'준비 취소':'READY'}</button>
        <small className="authority-note">모든 READY 상태는 Supabase 게임 상태에 저장됩니다.</small>
      </div>
    </div>
  </div>;
}

function OnlineArena({players,me,scores,viewState,minigame,now,onScore}){
  const startAt=Date.parse(minigame.startAt||'');const elapsed=Number.isFinite(startAt)?now-startAt:0;
  const countdown=Math.ceil(viewState.remainingMs/1000);const countdownLabel=countdown>=4?'READY':Math.max(1,countdown);
  const active=viewState.view==='playing';const showGo=active&&elapsed>=0&&elapsed<700;
  return <div className="minigame-play online-arena">
    <MiniGameArena active={active} initialScore={scores[me?.id]||0} playerSeat={me?.seat||0} onScore={onScore}/>
    <header><span>{TEST_MINIGAME.name} · {me?.displayName}</span><b>{active?`${Math.max(0,Math.ceil(viewState.remainingMs/1000))}s`:'SYNC'}</b></header>
    <div className="online-scoreboard">{players.map(player=><article key={player.id} className={player.id===me?.id?'me':''}><Character id={player.character} small/><span>{player.displayName}</span><b>{scores[player.id]||0}</b></article>)}</div>
    {viewState.view==='countdown'&&<div className="countdown"><b>{countdownLabel}</b></div>}
    {showGo&&<div className="countdown go"><b>GO!</b></div>}
    {['settling','finalizing'].includes(viewState.view)&&<div className="score-settling"><i/><b>서버 점수 확정 중</b><span>입력 이벤트를 모아 최종 순위를 계산합니다.</span></div>}
  </div>;
}

function OnlineResults({players,minigame,currentUserId,ackCount,busy,onAcknowledge}){
  const byId=new Map(players.map(player=>[player.id,player]));
  const ranked=(minigame.rankedIds||[]).map(id=>byId.get(id)).filter(Boolean);
  return <div className="minigame-results online-results">
    <header><span>AUTHORITATIVE RESULT</span><h1>{minigame.winnerIds?.includes(currentUserId)?'승리!':'경기 종료'}</h1><p>서버가 입력 이벤트와 40코인 보상을 확정했습니다.</p></header>
    <div className="result-podium">{ranked.map((player,index)=>{
      const winner=minigame.winnerIds.includes(player.id);const reward=minigame.rewards?.[player.id]||0;
      return <article key={player.id} className={winner?'winner':'loser'}>
        <span>{index+1}<small>{['ST','ND','RD','TH'][index]}</small></span><Character id={player.character} state={winner?'victory':'defeat'}/><b>{player.displayName}</b>
        <dl><div><dt>SCORE</dt><dd>{minigame.scores?.[player.id]||0}</dd></div><div><dt>COIN</dt><dd>{minigame.coinsBefore?.[player.id]||0} → {minigame.coinsAfter?.[player.id]||0}<small> (+{reward})</small></dd></div></dl>
      </article>})}</div>
    <p className="authority-note">결과 확인 {ackCount}/4 · 네 명이 확인하면 보상이 한 번만 저장됩니다.</p>
    <button className="results-continue" type="button" onClick={onAcknowledge} disabled={busy||minigame.resultAcks?.[currentUserId]}>{minigame.resultAcks?.[currentUserId]?'확인 완료 · 다른 플레이어 대기':'결과 확인'}</button>
  </div>;
}

function RewardApplied({players,minigame,remainingMs}){
  return <div className="reward-applied-screen"><span>REWARD APPLIED</span><h1>보상이 저장됐어요!</h1><div>{players.map(player=><article key={player.id}><Character id={player.character} state={minigame.winnerIds?.includes(player.id)?'victory':'defeat'} small/><b>{player.displayName}</b><em>{minigame.coinsBefore?.[player.id]||0} → {minigame.coinsAfter?.[player.id]||0}</em><small>승리 +{minigame.winnerIds?.includes(player.id)?1:0}</small></article>)}</div><p>{Math.max(0,Math.ceil(remainingMs/1000))}초 후 네 플레이어가 보드로 복귀합니다.</p></div>;
}

function Rule({icon,label,value}){return <article className="briefing-rule"><i>{icon}</i><div><span>{label}</span><b>{value}</b></div></article>}
