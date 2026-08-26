import {useEffect,useRef,useState} from 'react';
import {PartyBoardScene} from '../three/party-board-scene.js';

export function ThreeBoard({
  board,
  players=[],
  activePlayerId=null,
  moveCommand=null,
  effectCommand=null,
  onMotionStage,
  onMoveComplete,
  className='',
  label='입체 파티 보드',
}){
  const canvasRef=useRef(null);
  const sceneRef=useRef(null);
  const mountedRef=useRef(false);
  const handledMoveRef=useRef(null);
  const handledEffectRef=useRef(null);
  const onMotionStageRef=useRef(onMotionStage);
  const onMoveCompleteRef=useRef(onMoveComplete);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{onMotionStageRef.current=onMotionStage},[onMotionStage]);
  useEffect(()=>{onMoveCompleteRef.current=onMoveComplete},[onMoveComplete]);

  useEffect(()=>{
    mountedRef.current=true;
    const scene=new PartyBoardScene({
      canvas:canvasRef.current,
      onReady:()=>{if(mountedRef.current)setReady(true)},
      onStage:stage=>{if(mountedRef.current)onMotionStageRef.current?.(stage)},
      onError:reason=>{if(mountedRef.current)setError(reason?.message||'3D 렌더러를 시작할 수 없습니다.')},
    });
    sceneRef.current=scene;
    return ()=>{
      mountedRef.current=false;
      sceneRef.current=null;
      scene.dispose();
    };
  },[]);

  useEffect(()=>{sceneRef.current?.setBoard(board)},[board]);
  useEffect(()=>{sceneRef.current?.setPlayers(players)},[players]);
  useEffect(()=>{sceneRef.current?.setActivePlayer(activePlayerId)},[activePlayerId]);

  useEffect(()=>{
    if(!moveCommand?.token||handledMoveRef.current===moveCommand.token)return;
    handledMoveRef.current=moveCommand.token;
    let active=true;
    sceneRef.current?.playMovement({
      playerId:moveCommand.playerId,
      path:moveCommand.path,
      totalSteps:moveCommand.totalSteps,
      reward:moveCommand.reward,
    }).then(result=>{if(active&&mountedRef.current)onMoveCompleteRef.current?.(moveCommand,result)});
    return ()=>{active=false};
  },[moveCommand]);

  useEffect(()=>{
    if(!effectCommand?.token||handledEffectRef.current===effectCommand.token)return;
    handledEffectRef.current=effectCommand.token;
    sceneRef.current?.triggerEffect(effectCommand.playerId,effectCommand.type);
  },[effectCommand]);

  return <div className={`three-board ${className}${ready?' is-ready':''}`} aria-label={label}>
    <canvas ref={canvasRef} role="img" aria-label={label}/>
    {!ready&&!error&&<div className="three-board-loading"><i/><span>3D 보드 준비 중</span></div>}
    {error&&<div className="three-board-error"><b>3D 화면을 열지 못했어요</b><span>{error}</span></div>}
    <div className="three-board-vignette" aria-hidden="true"/>
  </div>;
}
