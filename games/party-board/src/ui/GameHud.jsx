import {useMemo,useState} from 'react';
import {rankPlayers} from '../domain/presentation.js';
import {Character} from './characters.jsx';

const ITEM_LABELS=Object.freeze({
  'demo-item':{icon:'✦',name:'행운 부적'},
  shield:{icon:'◇',name:'보호권'},
  boost:{icon:'➜',name:'이동권'},
  swap:{icon:'↻',name:'교환권'},
});

export function PlayerStandings({players,currentPlayerId}){
  const [expanded,setExpanded]=useState(false);
  const ranked=useMemo(()=>rankPlayers(players),[players]);
  return <aside className={`standings-panel${expanded?' expanded':''}`} aria-label="플레이어 순위">
    <button className="standings-toggle" type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
      <span>PLAYERS</span><b>{ranked.find(player=>player.id===currentPlayerId)?.rank||1}위</b><i>{expanded?'접기':'전체'}</i>
    </button>
    <ol>{ranked.map(player=><li key={player.id} className={player.id===currentPlayerId?'current':''}>
      <span className="rank-badge">{player.rank}<small>{rankSuffix(player.rank)}</small></span>
      <span className="standing-avatar"><Character id={player.character||'slime'} small/></span>
      <b>{player.displayName}</b>
      <dl><div><dt>별</dt><dd><i>★</i>{player.stars??0}</dd></div><div><dt>코인</dt><dd><i>●</i>{player.coins??20}</dd></div></dl>
    </li>)}</ol>
  </aside>;
}

export function PersonalInventory({player,motionStage,disabled=false}){
  const inventory=player?.inventory||[];
  return <section className="personal-dock" aria-label="내 플레이어 정보와 인벤토리">
    <div className="personal-identity">
      <span><Character id={player?.character||'slime'} small/></span>
      <div><small>MY STATUS</small><b>{player?.displayName||'플레이어'}</b><em>{motionLabel(motionStage)}</em></div>
      <dl><div><dt>별</dt><dd>★ {player?.stars??0}</dd></div><div><dt>코인</dt><dd>● {player?.coins??20}</dd></div></dl>
    </div>
    <div className="inventory-bar">
      <header><span>INVENTORY</span><small>{inventory.length}/6</small></header>
      <div>{Array.from({length:6},(_,index)=>{
        const item=ITEM_LABELS[inventory[index]];
        return <button key={index} type="button" disabled={disabled||!item} aria-label={item?.name||`빈 아이템 슬롯 ${index+1}`} title={item?.name||'빈 슬롯'}>
          <i>{item?.icon||''}</i><small>{index+1}</small>
        </button>;
      })}</div>
    </div>
  </section>;
}

export function SpaceIconLegend(){
  return <div className="space-icon-legend" aria-label="칸 아이콘 안내">
    {[
      ['normal','➜','일반'],['special','✦','특수'],['event','?','이벤트'],['trap','!','함정'],['shop','▣','상점'],['star','★','별'],['companion','●','동료'],
    ].map(([kind,icon,label])=><span key={kind} className={kind}><i>{icon}</i><b>{label}</b></span>)}
  </div>;
}

function rankSuffix(rank){return ['ST','ND','RD'][rank-1]||'TH'}
function motionLabel(stage){return ({idle:'이동 준비',anticipation:'출발 준비',move:'이동 중',slow_down:'도착 준비',stop:'도착',reaction:'칸 반응'}[stage]||stage)}
