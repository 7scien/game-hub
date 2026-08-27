import {useMemo} from 'react';
import {createBoard} from '../domain/board.js';
import {ThreeBoard} from './ThreeBoard.jsx';

export function BoardPreview({board:providedBoard,compact=false}){
  const fallback=useMemo(()=>createBoard('starlight-preview'),[]);
  const board=providedBoard?.spaces?.length===60?providedBoard:fallback;
  const players=useMemo(()=>[
    {id:'preview-ghost',seat:0,character:'ghost',positionId:'r1'},
    {id:'preview-mole',seat:1,character:'mole',positionId:'r16'},
    {id:'preview-chick',seat:2,character:'chick',positionId:'r31'},
    {id:'preview-slime',seat:3,character:'slime',positionId:'r46'},
  ],[]);
  return <div className={`board-preview board-preview-3d${compact?' board-compact':''}`}>
    <ThreeBoard board={board} players={players} activePlayerId="preview-ghost" cameraMode="follow" label="캐릭터 뒤에서 연결된 길을 바라보는 3D 보드 미리보기"/>
    <div className="board-preview-caption"><span>PLAYER FOLLOW CAMERA</span><b>CONNECTED ROAD · 4 BRANCHES</b></div>
  </div>;
}
