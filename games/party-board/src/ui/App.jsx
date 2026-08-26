import {useEffect,useMemo,useState} from 'react';
import {supabaseConfig} from '../config.js';
import {roomService} from '../online/room-service.js';
import {BoardPreview} from './BoardPreview.jsx';
import {CHARACTERS,Character} from './characters.jsx';

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
  const board=state.board;
  return <main className="game-foundation">
    <header className="game-hud"><div><small>GLOBAL TURN</small><strong>{String(snapshot.room.global_turn||1).padStart(2,'0')} <i>/ 60</i></strong></div><div className="room-chip">ROOM {snapshot.room.code}</div><span className={`live-state ${connection==='SUBSCRIBED'?'online':''}`}>● {connection==='SUBSCRIBED'?'SYNCED':'RECONNECTING'}</span></header>
    <section className="game-stage"><BoardPreview board={board} compact/><div className="phase-card"><span>PHASE 1 FOUNDATION</span><h1>모든 플레이어가 같은 보드에 도착했어요!</h1><p>서버가 확정한 보드·플레이어 순서·20코인·빈 인벤토리 상태가 저장되었습니다. 다음 구현 슬라이스에서 주사위 명령과 단계별 이동을 이 화면에 연결합니다.</p><div className="placeholder-minigame"><b>MINIGAME PLACEHOLDER</b><span>6턴마다 이 패널을 거쳐 다음 턴으로 복귀</span></div><div className="foundation-actions">{canSave&&<button onClick={onSave}>저장하고 종료</button>}<button className="secondary" onClick={onExit}>시작 화면</button></div></div></section>
  </main>;
}

function ConnectionPill({configured}){
  return <span className={`connection-pill ${configured?'ready':''}`}><i />{configured?'ONLINE READY':'SUPABASE SETUP'}</span>;
}
