import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabaseConfig} from '../config.js';
import {advanceMovement,createBoard} from '../domain/board.js';
import {roomService} from '../online/room-service.js';
import {BoardPreview} from './BoardPreview.jsx';
import {CHARACTERS,Character} from './characters.jsx';
import {ThreeBoard} from './ThreeBoard.jsx';

const emptyPresence=new Set();

export function App(){
  const [screen,setScreen]=useState('home');
  const [name,setName]=useState(()=>localStorage.getItem('party-board:player-name')||'');
  const [code,setCode]=useState('');
  const [snapshot,setSnapshot]=useState(null);
  const [presence,setPresence]=useState(emptyPresence);
  const [connection,setConnection]=useState('CLOSED');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const resumeCode=roomService.getResumeCode();
  const devBoardSnapshot=useMemo(()=>import.meta.env.DEV&&new URLSearchParams(location.search).has('board3d')?createBoardDemoSnapshot():null,[]);

  useEffect(()=>{
    if(!snapshot)return undefined;
    let disposed=false;
    let unsubscribe;
    roomService.subscribe(snapshot,{
      onSnapshot:value=>{if(!disposed)setSnapshot(value)},
      onPresence:value=>{if(!disposed)setPresence(value)},
      onStatus:value=>{if(!disposed)setConnection(value)},
    }).then(cleanup=>{if(disposed)cleanup();else unsubscribe=cleanup}).catch(reason=>setError(reason.message));
    return ()=>{disposed=true;unsubscribe?.()};
  },[snapshot?.room?.id]);

  const run=async action=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      localStorage.setItem('party-board:player-name',name.trim());
      const next=await action();
      setSnapshot(next);setScreen('room');
    }catch(reason){setError(reason.message)}finally{setBusy(false)}
  };

  if(devBoardSnapshot)return <GameFoundation snapshot={devBoardSnapshot} connection="SUBSCRIBED" canSave={false} onExit={()=>location.assign('./')} />;
  if(screen==='room'&&snapshot)return <RoomScreen snapshot={snapshot} presence={presence} connection={connection} busy={busy} error={error} onError={setError} onBusy={setBusy} onSnapshot={setSnapshot} onExit={()=>{setScreen('home');setSnapshot(null);setPresence(emptyPresence)}} />;

  return <main className="party-app">
    <div className="sky" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    <header className="party-topbar"><a href="../../" className="mini-logo">GH</a><div><b>별빛 대소동</b><span>ONLINE PARTY BOARD</span></div><ConnectionPill configured={supabaseConfig.isConfigured} /></header>
    <section className="landing">
      <div className="landing-copy">
        <p className="eyebrow">ROLL · CHOOSE · LAUGH · REPEAT</p>
        <h1>친구 넷과<br/><em>별빛 한 바퀴!</em></h1>
        <p className="lead">방 코드를 공유하고, 주사위를 굴려 60칸의 보드를 누비세요. 모든 결과는 하나의 온라인 게임 상태로 함께 움직입니다.</p>
        <div className="character-parade">{CHARACTERS.map(character=><div key={character.id}><Character id={character.id}/><b>{character.name}</b></div>)}</div>
      </div>
      <BoardPreview />
    </section>
    <section className="room-actions" aria-label="온라인 방 메뉴">
      {!supabaseConfig.isConfigured&&<div className="setup-note"><span>연결 준비됨</span><strong>Supabase 프로젝트를 연결하면 온라인 방이 열립니다.</strong><p>실제 URL과 Publishable key가 생길 때까지 가짜 키를 사용하지 않습니다.</p></div>}
      <label className="name-field"><span>내 닉네임</span><input value={name} maxLength="16" onChange={event=>setName(event.target.value)} placeholder="2–16자" autoComplete="nickname" /></label>
      <article><span className="action-number">01</span><div><small>새로운 모험</small><h2>방 만들기</h2><p>6자리 초대 코드가 생성됩니다.</p></div><button disabled={!supabaseConfig.isConfigured||busy} onClick={()=>run(()=>roomService.createRoom(name))}>새 방 열기</button></article>
      <article><span className="action-number">02</span><div><small>친구와 합류</small><h2>방 참여하기</h2><p>방장이 보낸 코드를 입력하세요.</p></div><div className="join-control"><input value={code} onChange={event=>setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="ABC123" aria-label="6자리 방 코드"/><button disabled={!supabaseConfig.isConfigured||busy||code.length!==6} onClick={()=>run(()=>roomService.joinRoom(code,name))}>입장</button></div></article>
      {resumeCode&&<article className="resume-card"><span className="action-number">↻</span><div><small>SAVED ROOM</small><h2>이어하기</h2><p>마지막 방 <b>{resumeCode}</b>의 서버 저장 상태로 복귀합니다.</p></div><button disabled={!supabaseConfig.isConfigured||busy} onClick={()=>run(()=>roomService.resumeRoom())}>복귀</button></article>}
      {error&&<p className="error-message" role="alert">{error}</p>}
    </section>
    <footer className="phase-strip"><span>PHASE 1</span><b>ROOMS</b><b>PRESENCE</b><b>RECONNECT</b><b>60-SPACE BOARD</b><b>GLOBAL TURNS</b></footer>
  </main>;
}

function RoomScreen({snapshot,presence,connection,busy,error,onError,onBusy,onSnapshot,onExit}){
  const room=snapshot.room;
  const players=snapshot.players||[];
  const me=players.find(player=>player.user_id===snapshot.current_user_id);
  const isHost=room.host_user_id===snapshot.current_user_id;
  const allOnline=players.length===4&&players.every(player=>presence.has(player.user_id));
  const canStart=isHost&&allOnline&&players.every(player=>player.character);
  const active=room.status==='active';
  const perform=async action=>{
    onBusy(true);onError('');
    try{onSnapshot(await action())}catch(reason){onError(reason.message)}finally{onBusy(false)}
  };
  if(active)return <GameFoundation snapshot={snapshot} connection={connection} onSave={()=>perform(()=>roomService.saveRoom(room.id))} canSave={isHost} onExit={onExit}/>;
  return <main className="room-screen">
    <header className="room-header"><button className="text-button" onClick={onExit}>← 나가기</button><div><small>ROOM CODE</small><strong>{room.code}</strong></div><span className={`live-state ${connection==='SUBSCRIBED'?'online':''}`}>{connection==='SUBSCRIBED'?'실시간 연결':'다시 연결 중'}</span></header>
    <section className="lobby-title"><p className="eyebrow">CHARACTER SELECT</p><h1>함께 떠날 친구를 골라요</h1><p>캐릭터 능력은 모두 같고, 움직임과 표정만 달라요.</p></section>
    <section className="character-select">{CHARACTERS.map(character=>{
      const owner=players.find(player=>player.character===character.id);
      const selected=me?.character===character.id;
      return <button key={character.id} className={selected?'selected':''} disabled={busy||Boolean(owner&&!selected)||room.status==='saved'} onClick={()=>perform(()=>roomService.chooseCharacter(room.id,character.id))} style={{'--accent':character.accent}}>
        <Character id={character.id}/><small>{owner?owner.display_name:'선택 가능'}</small><strong>{character.name}</strong><span>{character.caption}</span>
      </button>;
    })}</section>
    <section className="player-slots">{Array.from({length:4},(_,seat)=>{
      const player=players.find(candidate=>candidate.seat===seat);
      const online=player&&presence.has(player.user_id);
      return <article key={seat} className={player?'filled':''}><span className="seat">P{seat+1}</span>{player?.character?<Character id={player.character} small/>:<i className="empty-avatar">?</i>}<div><b>{player?.display_name||'친구 기다리는 중'}</b><small>{player?.user_id===room.host_user_id?'방장 · ':''}{player?(online?'온라인':'재접속 대기'):'빈 자리'}</small></div><i className={`presence-dot ${online?'online':''}`}/></article>;
    })}</section>
    <div className="lobby-footer"><p>{players.length}/4 입장 · {presence.size}/4 온라인 · {players.filter(player=>player.character).length}/4 캐릭터 선택</p><button disabled={!canStart||busy} onClick={()=>perform(()=>roomService.startRoom(room.id))}>{isHost?(canStart?'게임 시작':'4명 모두 준비되면 시작'):'방장이 시작합니다'}</button></div>
    {error&&<p className="error-message" role="alert">{error}</p>}
  </main>;
}

function GameFoundation({snapshot,connection,onSave,canSave,onExit}){
  const state=snapshot.room.game_state||{};
  const fallbackBoard=useMemo(()=>createBoard(`fallback-${snapshot.room.code}`),[snapshot.room.code]);
  const board=state.board?.spaces?.length===60?state.board:fallbackBoard;
  const serverPlayers=useMemo(()=>normalizeGamePlayers(state,snapshot.players||[]),[state,snapshot.players]);
  const currentPlayerId=state.currentPlayerId||serverPlayers[0]?.id||null;
  const [previewPositions,setPreviewPositions]=useState(()=>Object.fromEntries(serverPlayers.map(player=>[player.id,player.positionId])));
  const [motionStage,setMotionStage]=useState('idle');
  const [moveCommand,setMoveCommand]=useState(null);
  const [effectCommand,setEffectCommand]=useState(null);
  const [isAnimating,setIsAnimating]=useState(false);
  const [pendingChoice,setPendingChoice]=useState(null);
  const [cameraMode,setCameraMode]=useState('follow');
  const [lastLanding,setLastLanding]=useState(currentPlayerId?serverPlayers.find(player=>player.id===currentPlayerId)?.positionId||'r0':'r0');
  const tokenRef=useRef(0);

  useEffect(()=>{
    setPreviewPositions(Object.fromEntries(serverPlayers.map(player=>[player.id,player.positionId])));
    setPendingChoice(null);setMoveCommand(null);setIsAnimating(false);setMotionStage('idle');
    setCameraMode('follow');
    setLastLanding(serverPlayers.find(player=>player.id===currentPlayerId)?.positionId||'r0');
  },[snapshot.room.state_version,serverPlayers,currentPlayerId]);

  const displayPlayers=useMemo(()=>serverPlayers.map(player=>({...player,positionId:previewPositions[player.id]||player.positionId})),[serverPlayers,previewPositions]);
  const currentPlayer=displayPlayers.find(player=>player.id===currentPlayerId)||displayPlayers[0];
  const busy=isAnimating||Boolean(pendingChoice);

  const queueMovement=useCallback((result,{totalSteps,reward})=>{
    if(!currentPlayer)return;
    if(!result.path.length){
      if(result.status==='choice_required')setPendingChoice({branch:result.branch,remaining:result.remaining,totalSteps,reward});
      return;
    }
    setIsAnimating(true);
    setMoveCommand({
      token:++tokenRef.current,
      playerId:currentPlayer.id,
      path:result.path,
      totalSteps,
      reward:result.status==='complete'?reward:null,
      result,
      deferredReward:reward,
    });
  },[currentPlayer]);

  const startMovement=useCallback((steps,reward='coin')=>{
    if(!currentPlayer||busy)return;
    const startId=previewPositions[currentPlayer.id]||currentPlayer.positionId||'r0';
    const result=advanceMovement(board,{startId,steps});
    queueMovement(result,{totalSteps:steps,reward});
  },[board,busy,currentPlayer,previewPositions,queueMovement]);

  const startBranchDemo=useCallback(()=>{
    if(!currentPlayer||busy)return;
    const startId=previewPositions[currentPlayer.id]||currentPlayer.positionId||'r0';
    startMovement(stepsToBranchDemo(board,startId),'star');
  },[board,busy,currentPlayer,previewPositions,startMovement]);

  const handleMoveComplete=useCallback(command=>{
    const result=command.result;
    setPreviewPositions(previous=>({...previous,[command.playerId]:result.currentId}));
    setLastLanding(result.currentId);
    setIsAnimating(false);
    if(result.status==='choice_required')setPendingChoice({branch:result.branch,remaining:result.remaining,totalSteps:command.totalSteps,reward:command.deferredReward});
    else setPendingChoice(null);
  },[]);

  const chooseBranch=useCallback(choice=>{
    if(!pendingChoice||!currentPlayer)return;
    const result=advanceMovement(board,{
      startId:pendingChoice.branch.splitId,
      steps:pendingChoice.remaining,
      choices:{[pendingChoice.branch.id]:choice},
    });
    const context={totalSteps:pendingChoice.totalSteps,reward:pendingChoice.reward};
    setPendingChoice(null);
    queueMovement(result,context);
  },[board,currentPlayer,pendingChoice,queueMovement]);

  const previewEffect=useCallback(type=>{
    if(!currentPlayer||isAnimating)return;
    setEffectCommand({token:++tokenRef.current,playerId:currentPlayer.id,type});
  },[currentPlayer,isAnimating]);

  const stageLabel=MOTION_LABELS[motionStage]||motionStage;
  const inventory=currentPlayer?.inventory||[];
  return <main className="game-3d-shell">
    <header className="game-hud game-hud-3d">
      <div className="turn-readout"><small>GLOBAL TURN</small><strong>{String(snapshot.room.global_turn||1).padStart(2,'0')} <i>/ 60</i></strong></div>
      <div className="current-turn"><span>NOW PLAYING</span><b>{currentPlayer?.displayName||'플레이어'}</b></div>
      <div className="room-chip">ROOM {snapshot.room.code}</div>
      <span className={`live-state ${connection==='SUBSCRIBED'?'online':''}`}>● {connection==='SUBSCRIBED'?'SYNCED':'RECONNECTING'}</span>
    </header>
    <section className="game-3d-viewport">
      <ThreeBoard
        board={board}
        players={displayPlayers}
        activePlayerId={currentPlayerId}
        moveCommand={moveCommand}
        effectCommand={effectCommand}
        branchChoice={pendingChoice?.branch||null}
        cameraMode={cameraMode}
        onMotionStage={setMotionStage}
        onMoveComplete={handleMoveComplete}
        className="game-board-canvas"
        label="현재 온라인 게임 상태를 표시하는 3D 파티 보드"
      />
      <aside className="player-wallet" aria-label="현재 플레이어 정보">
        <span className="player-wallet-character"><Character id={currentPlayer?.character||'slime'} small/></span>
        <div><small>CURRENT PLAYER</small><b>{currentPlayer?.displayName||'플레이어'}</b><em>{CHARACTERS.find(character=>character.id===currentPlayer?.character)?.name||'캐릭터'}</em></div>
        <dl><div><dt>COIN</dt><dd>● {currentPlayer?.coins??20}</dd></div><div><dt>STAR</dt><dd>★ {currentPlayer?.stars??0}</dd></div></dl>
        <div className="inventory-strip" aria-label="인벤토리 6칸">{Array.from({length:6},(_,index)=><i key={index} className={inventory[index]?'filled':''}>{inventory[index]?'◆':'·'}</i>)}</div>
      </aside>
      <div className="board-legend-3d" aria-label="칸 종류"><span className="normal">일반</span><span className="special">특수</span><span className="event">이벤트</span><span className="trap">함정</span><span className="shop">상점</span></div>
      <section className="movement-console" aria-label="3D 이동 연출 미리보기">
        <div className="motion-status"><span className={motionStage!=='idle'?'active':''}/><div><small>ANIMATION STATE</small><b>{stageLabel}{moveCommand?.totalSteps>12&&motionStage==='move'?' · RUN':''}</b></div><em>도착 {lastLanding}</em></div>
        <p>캐릭터 뒤에서 길을 따라가는 렌더링 미리보기입니다. 서버 상태는 변경하지 않습니다.</p>
        <div className="movement-buttons">
          <button disabled={busy} onClick={()=>startMovement(8,'coin')}>8칸 이동</button>
          <button disabled={busy} onClick={startBranchDemo}>갈림길 체험</button>
          <button className="effect-button" disabled={isAnimating} onClick={()=>previewEffect('shield')}>보호권 연출</button>
        </div>
      </section>
      {pendingChoice&&<section className="branch-choice" role="dialog" aria-modal="true" aria-label="갈림길 경로 선택">
        <span>ROUTE CHOICE</span><h2>갈림길에 도착했어요</h2><p>여기서 잠시 멈췄습니다. 남은 <b>{pendingChoice.remaining}칸</b>을 어느 길로 이동할까요?</p>
        <div><button onClick={()=>chooseBranch('main')}>정규길</button><button onClick={()=>chooseBranch('branch')}>별빛 샛길</button></div>
      </section>}
      <nav className="game-3d-actions" aria-label="게임 화면 메뉴">
        <span>PHASE 1 · 3D RENDER SLICE</span>
        {import.meta.env.DEV&&<button className="secondary" onClick={()=>setCameraMode(mode=>mode==='follow'?'overview':'follow')}>{cameraMode==='follow'?'디버그 전체 보기':'플레이어 추적'}</button>}
        {canSave&&<button onClick={onSave}>저장하고 종료</button>}
        <button className="secondary" onClick={onExit}>시작 화면</button>
      </nav>
      <div className="player-ribbon">{displayPlayers.map((player,index)=><article key={player.id} className={player.id===currentPlayerId?'current':''}><span>P{index+1}</span><Character id={player.character||'slime'} small/><div><b>{player.displayName}</b><small>{player.positionId} · ● {player.coins} · ★ {player.stars}</small></div></article>)}</div>
    </section>
  </main>;
}

function ConnectionPill({configured}){
  return <span className={`connection-pill ${configured?'ready':''}`}><i />{configured?'ONLINE READY':'SUPABASE SETUP'}</span>;
}

const MOTION_LABELS={idle:'IDLE',anticipation:'ANTICIPATION',move:'MOVE',slow_down:'SLOW DOWN',stop:'STOP',reaction:'REACTION'};

function normalizeGamePlayers(state,roomPlayers){
  const stored=Object.values(state.players||{});
  const storedById=new Map(stored.map(player=>[player.userId,player]));
  return roomPlayers.map((roomPlayer,index)=>{
    const gamePlayer=storedById.get(roomPlayer.user_id)||stored[index]||{};
    return {
      id:roomPlayer.user_id||gamePlayer.userId||`player-${index}`,
      seat:roomPlayer.seat??gamePlayer.seat??index,
      displayName:gamePlayer.displayName||roomPlayer.display_name||`플레이어 ${index+1}`,
      character:gamePlayer.character||roomPlayer.character||CHARACTERS[index%CHARACTERS.length].id,
      coins:gamePlayer.coins??20,
      stars:gamePlayer.stars??0,
      inventory:Array.isArray(gamePlayer.inventory)?gamePlayer.inventory:[],
      positionId:gamePlayer.positionId||'r0',
    };
  });
}

function stepsToBranchDemo(board,startId){
  const startIndex=startId?.startsWith('r')?Number(startId.slice(1)):0;
  const distances=(board.branches||[]).map(branch=>(Number(branch.splitId.slice(1))-startIndex+60)%60).map(distance=>distance||60).sort((a,b)=>a-b);
  const target=distances.find(distance=>distance>=8)||distances[0]||8;
  return target+5;
}

function createBoardDemoSnapshot(){
  const characters=['ghost','mole','chick','slime'];
  const ids=characters.map(character=>`demo-${character}`);
  const players=ids.map((id,index)=>({user_id:id,seat:index,display_name:['별이','구름','노을','새벽'][index],character:characters[index]}));
  const gamePlayers=Object.fromEntries(players.map((player,index)=>[player.user_id,{
    userId:player.user_id,seat:index,displayName:player.display_name,character:player.character,
    coins:20+index*3,stars:index===2?1:0,inventory:index===1?['demo-item']:[],positionId:`r${index*4}`,
  }]));
  return {
    room:{id:'demo-room',code:'3DDEMO',host_user_id:ids[0],status:'active',global_turn:8,state_version:1,game_state:{board:createBoard('three-board-demo'),players:gamePlayers,currentPlayerId:ids[0],turnOrder:ids}},
    players,current_user_id:ids[0],
  };
}
