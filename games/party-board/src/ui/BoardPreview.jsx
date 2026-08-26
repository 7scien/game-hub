import {useMemo} from 'react';
import {createBoard} from '../domain/board.js';

const KIND_LABELS={normal:'',special:'!',event:'?',trap:'×',shop:'₩'};

export function BoardPreview({board:providedBoard,compact=false}){
  const fallback=useMemo(()=>createBoard('starlight-preview'),[]);
  const board=providedBoard?.spaces?.length===60?providedBoard:fallback;
  return <div className={`board-preview${compact?' board-compact':''}`} aria-label="60칸 정규 보드 미리보기">
    <div className="board-glow" />
    <div className="board-center"><small>GLOBAL TURN</small><strong>60</strong><span>4 ROUTES · 4 PLAYERS</span></div>
    {board.spaces.map((space,index)=>{
      const angle=(index/60)*Math.PI*2-Math.PI/2;
      const left=50+45*Math.cos(angle);
      const top=50+41*Math.sin(angle);
      return <i key={space.id||index} className={`space space-${space.kind}`} style={{left:`${left}%`,top:`${top}%`}}><b>{KIND_LABELS[space.kind]||''}</b></i>;
    })}
    {[0,1,2,3].map(index=><span className={`fork fork-${index+1}`} key={index}>갈림길 {index+1}</span>)}
  </div>;
}
