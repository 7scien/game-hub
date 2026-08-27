import {useEffect,useRef,useState} from 'react';
import {StarCatchScene} from '../three/minigame-scene.js';

export function MiniGameArena({active,onScore}){
  const canvasRef=useRef(null);const sceneRef=useRef(null);const onScoreRef=useRef(onScore);
  const [ready,setReady]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{onScoreRef.current=onScore},[onScore]);
  useEffect(()=>{
    const scene=new StarCatchScene({canvas:canvasRef.current,onReady:()=>setReady(true),onScore:value=>onScoreRef.current?.(value),onError:reason=>setError(reason?.message||'미니게임 경기장을 열 수 없습니다.')});
    sceneRef.current=scene;return ()=>{sceneRef.current=null;scene.dispose()};
  },[]);
  useEffect(()=>{sceneRef.current?.setActive(active)},[active]);
  return <div className={`minigame-arena${ready?' ready':''}`}>
    <canvas ref={canvasRef} role="img" aria-label="별빛 부두 포착전 3D 경기장"/>
    {!ready&&!error&&<span className="arena-loading">경기장 준비 중</span>}
    {error&&<span className="arena-error">{error}</span>}
  </div>;
}
