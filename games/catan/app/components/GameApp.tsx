'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { tilePoints } from '../../lib/game/board';
import {
  canPlaceRoad, canPlaceSettlement, canUpgradeCity, createGame, getTradeRatio, hasResources,
  longestRoadLength, reduceGame, requiredDiscardCount, scorePlayer, type GameAction,
} from '../../lib/game/rules';
import { clearGame, exportGame, importGame, loadGames, saveGame, SAVE_SLOTS, type SaveSlot } from '../../lib/game/storage';
import {
  bagTotal, COSTS, DEV_LABELS, emptyBag, RESOURCES, RESOURCE_ICONS, RESOURCE_LABELS,
  TERRAIN_LABELS, type DevCard, type GameState, type Resource, type ResourceBag, type Terrain,
} from '../../lib/game/types';
import desertArt from '../../assets/terrain/desert.webp';
import fieldArt from '../../assets/terrain/field.webp';
import forestArt from '../../assets/terrain/forest.webp';
import hillArt from '../../assets/terrain/hill.webp';
import mountainArt from '../../assets/terrain/mountain.webp';
import pastureArt from '../../assets/terrain/pasture.webp';

const COLORS = ['#c65343', '#287a72', '#d49a32', '#6552a0'];
const TERRAIN_IMAGES: Record<Terrain,string> = {
  forest: forestArt, hill: hillArt, pasture: pastureArt, field: fieldArt, mountain: mountainArt, desert: desertArt,
};

function tone(enabled: boolean, kind: 'tap' | 'dice' | 'build' = 'tap') {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Audio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'dice' ? 'triangle' : 'sine';
    oscillator.frequency.value = kind === 'build' ? 520 : kind === 'dice' ? 180 : 360;
    gain.gain.setValueAtTime(.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + (kind === 'dice' ? .22 : .12));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .24);
  } catch { /* 소리가 없어도 게임은 완전하게 동작한다. */ }
}

function ResourcePill({ resource, amount, active, onClick, disabled }: { resource: Resource; amount: number; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`resource-pill resource-${resource}${active ? ' selected' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={active}>
      <span aria-hidden="true">{RESOURCE_ICONS[resource]}</span><strong>{RESOURCE_LABELS[resource]}</strong><b>{amount}</b>
    </button>
  );
}

function Cost({ cost }: { cost: ResourceBag }) {
  return <span className="cost-line">{RESOURCES.filter((resource) => cost[resource]).map((resource) => <i key={resource} className={`dot resource-${resource}`}>{RESOURCE_ICONS[resource]} {cost[resource]}</i>)}</span>;
}

const DIE_DOTS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function DiceFace({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (!value) return <span className={`dice-face${compact ? ' compact' : ''}`} aria-label="굴리기 전"><b className="dice-question">?</b></span>;
  const dots = new Set(DIE_DOTS[value]);
  return <span className={`dice-face${compact ? ' compact' : ''}`} role="img" aria-label={`주사위 ${value}`}>{Array.from({ length: 9 }, (_, index) => <i key={index} className={dots.has(index) ? 'die-dot visible' : 'die-dot'} />)}</span>;
}

function DicePair({ dice, rolling = false, compact = false }: { dice: [number | null, number | null]; rolling?: boolean; compact?: boolean }) {
  return <span className={`dice-pair${rolling ? ' rolling' : ''}${compact ? ' compact' : ''}`}><DiceFace value={dice[0]} compact={compact} /><DiceFace value={dice[1]} compact={compact} /></span>;
}

function SetupScreen({ onStart }: { onStart: (game: GameState, slot: SaveSlot | null) => void }) {
  const [count, setCount] = useState<3 | 4>(3);
  const [names, setNames] = useState(['', '', '', '']);
  const [saved, setSaved] = useState<[GameState | null, GameState | null]>([null, null]);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSaved(loadGames()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const start = () => {
    if (names.slice(0, count).some((name) => !name.trim())) {
      setError('모든 플레이어의 이름을 입력해 주세요.');
      return;
    }
    const seed = Math.floor(Date.now() % 2_147_483_647);
    onStart(createGame(names.slice(0, count), COLORS.slice(0, count), seed), null);
  };
  const chooseCount = (value: 3 | 4) => { setCount(value); tone(true); };
  const removeSave = (slot: SaveSlot) => {
    if (!window.confirm(`${slot}번 저장을 지울까요? 삭제한 게임은 되돌릴 수 없습니다.`)) return;
    clearGame(slot);
    setSaved(loadGames());
  };

  return (
    <main className="welcome-shell">
      <section className="hero-panel">
        <div className="brand-row"><span className="brand-mark" aria-hidden="true">⬡</span><span>한 기기로 함께하는 로컬 보드게임</span></div>
        <p className="eyebrow">따뜻한 섬에서 시작하는 오늘의 모험</p>
        <h1>카탄</h1>
        <p className="hero-copy">주사위로 자원을 모으고, 거래와 건설로 섬을 개척해 가장 먼저 10점을 완성하세요.</p>
        <PreviewBoard />
      </section>
      <section className="setup-card" aria-labelledby="setup-title">
        <div><p className="step-label">새 게임 설정</p><h2 id="setup-title">오늘의 개척단</h2><p className="muted">각자 이름과 색을 정한 뒤 기기를 번갈아 사용합니다.</p></div>
        <button className="setup-help-button" type="button" onClick={() => setHelp(true)}><span aria-hidden="true">?</span><span><b>처음 플레이하시나요?</b><small>목표부터 초기 배치, 거래와 건설까지 친절하게 알아보기</small></span><strong>게임 설명 보기 →</strong></button>
        <div className="segmented" aria-label="플레이어 수">
          {[3, 4].map((value) => <button key={value} type="button" className={count === value ? 'active' : ''} onClick={() => chooseCount(value as 3 | 4)} aria-pressed={count === value}><strong>{value}명</strong><span>{value === 3 ? '여유로운 전략' : '활기찬 교역'}</span></button>)}
        </div>
        <div className="player-inputs">
          {names.slice(0, count).map((name, index) => (
            <label key={index}><span className="color-dot" style={{ background: COLORS[index] }}>{index + 1}</span><span className="sr-only">플레이어 {index + 1} 이름</span><input value={name} placeholder="이름을 입력하세요" maxLength={10} onChange={(event) => { setError(''); setNames((current) => current.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry)); }} /></label>
          ))}
        </div>
        {error && <p className="error-note" role="alert">{error}</p>}
        <button className="primary-button" type="button" onClick={start}>무작위 시작 플레이어로 출항 <span aria-hidden="true">→</span></button>
        <section className="save-slots" aria-label="저장된 게임 2개">
          {SAVE_SLOTS.map((slot) => { const savedGame=saved[slot-1]; return <article key={slot} className={`save-slot-card${savedGame?' occupied':' empty'}`}><div className="save-slot-title"><span>{slot}</span><div><b>{slot}번 저장</b><small>{savedGame?`${savedGame.round}라운드 · ${savedGame.players.map((player)=>player.name).join(', ')}`:'비어 있음'}</small></div></div>{savedGame?<div className="save-slot-actions"><button type="button" onClick={()=>onStart(savedGame,slot)}>이어하기</button><button type="button" className="save-slot-delete" onClick={()=>removeSave(slot)}>지우기</button></div>:<p>게임 중 오른쪽 위의 ‘저장하기’에서 선택할 수 있어요.</p>}</article>; })}
        </section>
        <button className="text-button" type="button" onClick={() => importRef.current?.click()}>JSON 저장 파일 불러오기</button>
        <input ref={importRef} type="file" accept="application/json" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { onStart(await importGame(file), null); } catch (reason) { setError(reason instanceof Error ? reason.message : '파일을 읽지 못했습니다.'); } }} />
        <div className="offline-note"><span aria-hidden="true">✓</span> 저장 위치를 고른 뒤에는 해당 슬롯에 진행 상황이 자동 반영됩니다</div>
      </section>
      {help && <HelpModal close={() => setHelp(false)} />}
    </main>
  );
}

function PreviewBoard() {
  const terrains = ['forest','hill','field','pasture','mountain','forest','field','field','pasture','desert','hill','forest','mountain','forest','pasture','field','hill','mountain','pasture'] as const;
  const coords = Array.from({ length: 5 }, (_, row) => row - 2).flatMap((r) => Array.from({ length: 5 }, (_, col) => col - 2).filter((q) => Math.abs(q + r) <= 2).map((q) => [q, r]));
  const size=31;
  const tiles=coords.map(([q,r],index)=>{const x=size*Math.sqrt(3)*(q+r/2),y=size*1.5*r;const points=Array.from({length:6},(_,corner)=>{const angle=Math.PI/180*(60*corner-30);return `${x+size*Math.cos(angle)},${y+size*Math.sin(angle)}`}).join(' ');return {index,x,y,points,terrain:terrains[index]}});
  return <svg className="mini-board" viewBox="-140 -115 280 230" role="img" aria-label="손그림 지형의 육각 타일 19개로 이루어진 섬 미리보기"><defs>{tiles.map((tile)=><clipPath key={tile.index} id={`preview-tile-${tile.index}`}><polygon points={tile.points}/></clipPath>)}</defs>{tiles.map((tile)=><g key={tile.index}><image className="mini-tile-art" href={TERRAIN_IMAGES[tile.terrain]} x={tile.x-size} y={tile.y-size} width={size*2} height={size*2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#preview-tile-${tile.index})`}/><polygon points={tile.points} className="mini-tile-frame"/></g>)}</svg>;
}

type BuildMode = 'road' | 'settlement' | 'city' | null;

function GameBoard({ game, buildMode, act }: { game: GameState; buildMode: BuildMode; act: (action: GameAction, sound?: 'tap' | 'build') => void }) {
  const canTile = game.phase === 'robber-move';
  const possibleVertices = useMemo(() => new Set(Object.keys(game.board.vertices).filter((id) => game.phase === 'setup-settlement' ? canPlaceSettlement(game, id, true) : buildMode === 'settlement' ? canPlaceSettlement(game, id) : buildMode === 'city' ? canUpgradeCity(game, id) : false)), [game, buildMode]);
  const possibleEdges = useMemo(() => new Set(Object.keys(game.board.edges).filter((id) => game.phase === 'setup-road' ? canPlaceRoad(game, id, game.lastPlacedVertexId) : buildMode === 'road' ? canPlaceRoad(game, id) : false)), [game, buildMode]);
  const clickVertex = (id: string) => {
    if (!possibleVertices.has(id)) return;
    if (game.phase === 'setup-settlement') act({ type: 'PLACE_SETTLEMENT', vertexId: id }, 'build');
    else if (buildMode === 'settlement') act({ type: 'BUILD_SETTLEMENT', vertexId: id }, 'build');
    else if (buildMode === 'city') act({ type: 'BUILD_CITY', vertexId: id }, 'build');
  };
  const clickEdge = (id: string) => {
    if (!possibleEdges.has(id)) return;
    if (game.phase === 'setup-road') act({ type: 'PLACE_ROAD', edgeId: id }, 'build');
    else act({ type: 'BUILD_ROAD', edgeId: id }, 'build');
  };
  return (
    <div className="board-wrap">
      <svg className="game-board" viewBox="-410 -335 820 670" role="group" aria-label="카탄 게임판">
        <defs><filter id="boardShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity=".25" /></filter>{game.board.tiles.map((tile,index)=><clipPath key={tile.id} id={`board-tile-${index}`}><polygon points={tilePoints(tile)}/></clipPath>)}</defs>
        <ellipse className="sea" cx="0" cy="0" rx="390" ry="305" />
        <g filter="url(#boardShadow)">
          {game.board.tiles.map((tile,index) => (
            <g key={tile.id} className={`board-tile-group${canTile && tile.id !== game.board.robberTileId ? ' selectable' : ''}`} onClick={() => canTile && act({ type: 'MOVE_ROBBER', tileId: tile.id })} onKeyDown={(event) => { if (canTile && (event.key === 'Enter' || event.key === ' ')) act({ type: 'MOVE_ROBBER', tileId: tile.id }); }} role={canTile ? 'button' : undefined} aria-label={canTile ? `${TERRAIN_LABELS[tile.terrain]} 타일로 도둑 이동` : undefined} tabIndex={canTile && tile.id !== game.board.robberTileId ? 0 : undefined}>
              <image className="tile-art-image" href={TERRAIN_IMAGES[tile.terrain]} x={tile.x-74} y={tile.y-74} width="148" height="148" preserveAspectRatio="xMidYMid slice" clipPath={`url(#board-tile-${index})`}/>
              <polygon points={tilePoints(tile)} className={`board-tile ${tile.terrain}`} style={{fill:'transparent'}} />
              <text x={tile.x} y={tile.y + 38} className="terrain-name" textAnchor="middle">{TERRAIN_LABELS[tile.terrain]}</text>
              {tile.number && <g className={tile.number === 6 || tile.number === 8 ? 'hot-number' : ''}><circle cx={tile.x} cy={tile.y + 5} r="20" className="number-disc" /><text x={tile.x} y={tile.y + 12} className="number-text" textAnchor="middle">{tile.number}</text></g>}
              {game.board.robberTileId === tile.id && <g className="robber" transform={`translate(${tile.x + 29} ${tile.y - 25})`}><circle cy="-9" r="8"/><path d="M-10 18 Q0-3 10 18Z"/></g>}
            </g>
          ))}
        </g>
        {Object.values(game.board.edges).map((edge) => {
          const a=game.board.vertices[edge.a], b=game.board.vertices[edge.b];
          const owner=game.players.find((player)=>player.roads.includes(edge.id));
          const available=possibleEdges.has(edge.id);
          return <g key={edge.id} onClick={() => clickEdge(edge.id)} onKeyDown={(event) => { if (available && (event.key === 'Enter' || event.key === ' ')) clickEdge(edge.id); }} role={available?'button':undefined} aria-label={available?'이 위치에 길 놓기':undefined} tabIndex={available?0:undefined} className={available ? 'edge-action available' : 'edge-action'}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-hit" />{available && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-option" />}{owner && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="road" style={{ stroke: owner.color }} />}</g>;
        })}
        {game.board.ports.map((port) => { const edge=game.board.edges[port.edgeId],a=game.board.vertices[edge.a],b=game.board.vertices[edge.b],mx=(a.x+b.x)/2,my=(a.y+b.y)/2,scale=1.15; return <g key={port.edgeId} className="port" transform={`translate(${mx*scale} ${my*scale})`}><circle r="24"/><text y="-3" textAnchor="middle">{port.type === 'generic' ? '3:1' : '2:1'}</text><text y="12" textAnchor="middle">{port.type === 'generic' ? '교역' : RESOURCE_LABELS[port.type]}</text></g>; })}
        {Object.values(game.board.vertices).map((vertex) => {
          const building=game.buildings[vertex.id], owner=building&&game.players.find((player)=>player.id===building.playerId);
          const available=possibleVertices.has(vertex.id);
          return <g key={vertex.id} transform={`translate(${vertex.x} ${vertex.y})`} className={available ? 'vertex available' : 'vertex'} onClick={() => clickVertex(vertex.id)} onKeyDown={(event) => { if (available && (event.key === 'Enter' || event.key === ' ')) clickVertex(vertex.id); }} role={available?'button':undefined} aria-label={available ? (buildMode==='city'?'이 마을을 도시로 확장':'이 교차점에 마을 놓기') : undefined} tabIndex={available?0:undefined}>{available && <circle r="15" className="vertex-option" />}{building?.type === 'settlement' && <path d="M-12 12V-3L0-14 12-3V12Z" className="building" style={{ fill: owner?.color }} />}{building?.type === 'city' && <path d="M-15 12V-5L-5-14 4-5V-10H15V12Z" className="building city-piece" style={{ fill: owner?.color }} />}</g>;
        })}
      </svg>
    </div>
  );
}

function PhaseGuide({ game }: { game: GameState }) {
  const player=game.players.find((entry)=>entry.id===game.currentPlayerId)!;
  const content = game.phase === 'setup-settlement' ? ['초기 배치','강조된 교차점에 마을을 놓으세요'] : game.phase === 'setup-road' ? ['초기 배치','방금 놓은 마을과 연결된 길을 고르세요'] : game.phase === 'pre-roll' ? ['주사위 굴리기','기사를 먼저 쓰거나 주사위를 굴리세요'] : game.phase === 'robber-move' ? ['도둑 이동','현재 위치가 아닌 타일을 고르세요'] : game.phase === 'robber-steal' ? ['자원 가져오기','도둑 주변의 상대를 고르세요'] : game.phase === 'discard' ? ['자원 버리기','가림 화면에서 각자 자원을 정리합니다'] : ['교역과 건설','원하는 행동을 마치고 차례를 넘기세요'];
  return <div className="phase-guide"><span className="player-token" style={{background:player.color}}>{player.name.slice(0,1)}</span><div className="phase-copy"><b>{player.name}님의 {content[0]}</b><span>{content[1]}</span></div>{game.dice&&<div className="phase-dice" aria-label={`주사위 결과 ${game.dice[0]} 더하기 ${game.dice[1]}은 ${game.dice[0]+game.dice[1]}`}><DicePair dice={game.dice} compact/><strong>= {game.dice[0]+game.dice[1]}</strong></div>}</div>;
}

function ScoreStrip({ game, onInspect }: { game: GameState; onInspect: (playerId: string) => void }) {
  return <div className="score-strip" aria-label="플레이어 공개 현황">{game.players.map((player) => <button type="button" key={player.id} className={player.id===game.currentPlayerId?'score-player current':'score-player'} onClick={()=>onInspect(player.id)} aria-label={`${player.name}님의 자원과 현황 보기`}><span className="score-color" style={{background:player.color}}>{player.name.slice(0,1)}</span><span className="score-copy"><b>{player.name}</b><small>공개 {scorePlayer(game,player.id)}점 · 자원 {bagTotal(player.resources)}장</small></span>{game.longestRoadOwner===player.id&&<em title="최장 교역로">길 +2</em>}{game.largestArmyOwner===player.id&&<em title="최대 기사단">기사 +2</em>}</button>)}</div>;
}

function BuildPanel({ game, mode, setMode }: { game: GameState; mode: BuildMode; setMode: (mode: BuildMode) => void }) {
  const player=game.players.find((entry)=>entry.id===game.currentPlayerId)!;
  const options=[['road','길',COSTS.road,`${player.roads.length}/15`],['settlement','마을',COSTS.settlement,`${Object.values(game.buildings).filter((b)=>b.playerId===player.id&&b.type==='settlement').length}/5`],['city','도시',COSTS.city,`${Object.values(game.buildings).filter((b)=>b.playerId===player.id&&b.type==='city').length}/4`]] as const;
  return <div className="panel-stack"><p className="panel-help">건설할 구성물을 고른 뒤 게임판의 강조된 위치를 누르세요.</p>{options.map(([key,label,cost,count])=><button key={key} type="button" className={mode===key?'action-card active':'action-card'} onClick={()=>setMode(mode===key?null:key)} disabled={game.phase!=='main'||(!hasResources(player,cost)&&!(key==='road'&&game.freeRoads>0))}><span className={`piece-preview ${key}`} style={{color:player.color}}>{key==='road'?'━':key==='settlement'?'⌂':'♜'}</span><span><b>{label}</b><Cost cost={cost}/></span><small>{count}</small></button>)}{game.freeRoads>0&&<div className="bonus-note">도로 건설 효과: 무료 길 {game.freeRoads}개 남음</div>}</div>;
}

function TradePanel({ game, act }: { game: GameState; act: (action: GameAction) => void }) {
  const [give,setGive]=useState<Resource>('wood'),[receive,setReceive]=useState<Resource>('brick');
  const [target,setTarget]=useState(game.players.find((player)=>player.id!==game.currentPlayerId)!.id);
  const player=game.players.find((entry)=>entry.id===game.currentPlayerId)!;
  const ratio=getTradeRatio(game,player.id,give);
  const changeGive=(value:Resource)=>{setGive(value);if(receive===value)setReceive(RESOURCES.find((resource)=>resource!==value)!)};
  const offer=()=>{const giveBag=emptyBag(),receiveBag=emptyBag();giveBag[give]=1;receiveBag[receive]=1;act({type:'PROPOSE_TRADE',offer:{from:game.currentPlayerId,to:target,give:giveBag,receive:receiveBag}})};
  return <div className="panel-stack"><div className="trade-box"><h3>은행·항구 거래 <span>{ratio}:1</span></h3><label>내가 내는 자원<select value={give} onChange={(e)=>changeGive(e.target.value as Resource)}>{RESOURCES.map((resource)=><option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select></label><span className="trade-arrow">↓ {ratio}장을 내고 1장 받기</span><label>은행에서 받을 자원<select value={receive} onChange={(e)=>setReceive(e.target.value as Resource)}>{RESOURCES.filter((resource)=>resource!==give).map((resource)=><option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select></label><button type="button" className="small-primary" disabled={player.resources[give]<ratio||game.bank[receive]<1} onClick={()=>act({type:'BANK_TRADE',give,receive})}>은행과 거래</button></div><div className="trade-box"><h3>직접 거래 <span>각 1장</span></h3><label>제안할 상대<select value={target} onChange={(e)=>setTarget(e.target.value)}>{game.players.filter((candidate)=>candidate.id!==game.currentPlayerId).map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><div className="direct-grid"><label>제공<select value={give} onChange={(e)=>changeGive(e.target.value as Resource)}>{RESOURCES.map((resource)=><option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select></label><label>요청<select value={receive} onChange={(e)=>setReceive(e.target.value as Resource)}>{RESOURCES.filter((resource)=>resource!==give).map((resource)=><option key={resource} value={resource}>{RESOURCE_LABELS[resource]}</option>)}</select></label></div><button type="button" className="small-primary" disabled={player.resources[give]<1||give===receive} onClick={offer}>거래 제안하기</button></div></div>;
}

function CardPanel({ game, act, setBuildMode }: { game: GameState; act: (action: GameAction) => void; setBuildMode: (mode: BuildMode) => void }) {
  const player=game.players.find((entry)=>entry.id===game.currentPlayerId)!;
  const [resource,setResource]=useState<Resource>('wood');
  const [second,setSecond]=useState<Resource>('grain');
  const play=(card:DevCard)=>{ if(card.type==='roadBuilding')setBuildMode('road'); act({type:'PLAY_DEV',cardId:card.id,resource,resources:[resource,second]}); };
  return <div className="panel-stack"><button className="buy-card" type="button" disabled={game.phase!=='main'||!game.devDeck.length||!hasResources(player,COSTS.development)} onClick={()=>act({type:'BUY_DEV'})}><span>?</span><div><b>개발 카드 구매</b><Cost cost={COSTS.development}/></div><small>덱 {game.devDeck.length}장</small></button><div className="card-choices"><label>카드 효과 자원<select value={resource} onChange={(e)=>setResource(e.target.value as Resource)}>{RESOURCES.map((entry)=><option key={entry} value={entry}>{RESOURCE_LABELS[entry]}</option>)}</select></label><label>풍요의 해 두 번째<select value={second} onChange={(e)=>setSecond(e.target.value as Resource)}>{RESOURCES.map((entry)=><option key={entry} value={entry}>{RESOURCE_LABELS[entry]}</option>)}</select></label></div>{player.devCards.length===0?<p className="empty-state">아직 개발 카드가 없습니다.</p>:player.devCards.map((card)=><div key={card.id} className={`dev-card ${card.played?'used':''}`}><div><b>{DEV_LABELS[card.type]}</b><small>{card.type==='victory'?'비공개 승점 +1':card.boughtTurn===game.turnNumber?'다음 차례부터 사용 가능':card.played?'사용 완료':'사용 가능'}</small></div>{card.type!=='victory'&&!card.played&&<button type="button" disabled={card.boughtTurn>=game.turnNumber||game.devPlayedThisTurn||(game.phase!=='main'&&!(game.phase==='pre-roll'&&card.type==='knight'))} onClick={()=>play(card)}>사용</button>}</div>)}</div>;
}

function DiscardOverlay({ game, act }: { game: GameState; act: (action: GameAction) => void }) {
  const player=game.players.find((entry)=>entry.id===game.privacyPlayerId)!;
  const required=requiredDiscardCount(player); const [selected,setSelected]=useState<ResourceBag>(emptyBag());
  const total=bagTotal(selected);
  return <div className="privacy-task"><div className="task-card"><p className="step-label">주사위 7 · 비공개 처리</p><h2>{player.name}님, 자원 {required}장을 버리세요</h2><p className="muted">선택한 자원은 다른 플레이어에게 보이지 않습니다.</p><div className="discard-grid">{RESOURCES.map((resource)=><div key={resource}><ResourcePill resource={resource} amount={player.resources[resource]} /><div className="counter"><button onClick={()=>setSelected((bag)=>({...bag,[resource]:Math.max(0,bag[resource]-1)}))}>−</button><b>{selected[resource]}</b><button onClick={()=>setSelected((bag)=>({...bag,[resource]:Math.min(player.resources[resource],bag[resource]+1)}))}>＋</button></div></div>)}</div><button className="primary-button" type="button" disabled={total!==required} onClick={()=>act({type:'DISCARD',playerId:player.id,resources:selected})}>{total}/{required}장 버리기</button></div></div>;
}

function TradeDecision({ game, act }: { game: GameState; act: (action: GameAction) => void }) {
  const offer=game.pendingTrade!,from=game.players.find((p)=>p.id===offer.from)!,to=game.players.find((p)=>p.id===offer.to)!;
  const list=(bag:ResourceBag)=>RESOURCES.filter((r)=>bag[r]).map((r)=>`${RESOURCE_LABELS[r]} ${bag[r]}`).join(', ');
  return <div className="modal-backdrop trade-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${to.name}님의 거래 제안`}><div className="task-card trade-decision-card"><p className="step-label">직접 거래 제안</p><h2>{to.name}님, 거래할까요?</h2><p className="muted">게임 화면을 그대로 둔 채 이 창에서 바로 결정할 수 있습니다.</p><div className="offer-paper"><span>{from.name}님이 제공</span><b>{list(offer.give)}</b><span>{to.name}님에게 요청</span><b>{list(offer.receive)}</b></div><p className="trade-holding"><b>{to.name}님의 보유 자원</b><span>{RESOURCES.map((r)=>`${RESOURCE_LABELS[r]} ${to.resources[r]}`).join(' · ')}</span></p><div className="decision-buttons"><button className="secondary-button" onClick={()=>act({type:'RESOLVE_TRADE',accept:false})}>거절</button><button className="primary-button" disabled={!hasResources(to,offer.receive)} onClick={()=>act({type:'RESOLVE_TRADE',accept:true})}>수락하고 교환</button></div></div></div>;
}

function Handoff({ game, act }: { game: GameState; act: (action: GameAction) => void }) {
  const targetId=game.privacyPlayerId??game.currentPlayerId,target=game.players.find((player)=>player.id===targetId)!;
  return <div className="handoff"><div className="handoff-pattern" aria-hidden="true">⬡ ⬡ ⬡</div><div className="handoff-card"><span className="big-token" style={{background:target.color}}>{target.name.slice(0,1)}</span><p className="step-label">플레이어 전환</p><h2>다음 플레이어에게<br/>기기를 넘겨주세요</h2><p>{game.handoffReason}</p><div className="privacy-lock">비공개 자원과 개발 카드를 가렸습니다</div><button className="primary-button reveal-button" type="button" onClick={()=>act({type:'UNLOCK'})}><span>{target.name}입니다</span><strong>화면 열기 →</strong></button></div></div>;
}

function HelpModal({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="help-sheet"><button className="close-button" onClick={close} aria-label="게임 설명 닫기">×</button><p className="step-label">처음부터 배우는 카탄</p><h2 id="help-title">이 순서대로 하면 어렵지 않아요</h2><p className="help-lead">주사위로 자원을 얻고, 서로 거래하며 길과 마을을 넓혀 <b>자기 차례에 10점</b>을 먼저 만들면 승리합니다.</p><div className="help-grid detailed"><section className="help-wide"><b><span>1</span> 게임 시작과 초기 배치</b><ol><li>화면에 표시된 순서대로 마을 1개와 연결된 길 1개를 놓습니다.</li><li>모두 한 번 놓으면 순서를 거꾸로 바꿔 마을과 길을 한 번 더 놓습니다.</li><li>두 번째 마을 주변의 땅에서 시작 자원을 받습니다.</li><li>마을끼리는 최소 두 칸 떨어져야 합니다.</li></ol></section><section><b><span>2</span> 내 차례</b><ol><li>주사위 2개를 굴립니다.</li><li>합계 숫자가 적힌 땅 주변의 마을·도시가 자원을 생산합니다.</li><li>원하는 만큼 거래·건설·개발 카드 사용을 합니다.</li><li>끝나면 ‘차례 마치기’를 누릅니다.</li></ol></section><section><b><span>3</span> 자원 얻기</b><p>숲은 목재, 구릉은 벽돌, 목초지는 양모, 농경지는 곡물, 산지는 광석을 줍니다.</p><p>마을은 1장, 도시는 2장을 받습니다. 도둑이 있는 땅은 생산하지 않습니다.</p></section><section><b><span>4</span> 건설 비용</b><ul className="cost-rules"><li><strong>길</strong> 목재 1 + 벽돌 1</li><li><strong>마을</strong> 목재·벽돌·양모·곡물 각 1</li><li><strong>도시</strong> 곡물 2 + 광석 3</li><li><strong>개발 카드</strong> 양모·곡물·광석 각 1</li></ul><p>새 길은 내 길이나 건물에 이어야 하며, 새 마을은 내 길과 연결된 빈 교차점에 놓습니다.</p></section><section><b><span>5</span> 거래</b><p>다른 플레이어에게 자원 1장을 제안하고 원하는 자원 1장을 요청할 수 있습니다.</p><p>은행은 기본 4:1이며, 항구를 가진 경우 3:1 또는 해당 자원 2:1로 더 유리하게 교환합니다.</p></section><section><b><span>6</span> 주사위 7과 도둑</b><p>자원 8장 이상인 플레이어는 절반을 버립니다. 현재 플레이어는 도둑을 다른 땅으로 옮기고, 그 주변 상대에게서 무작위 자원 1장을 가져옵니다.</p></section><section><b><span>7</span> 점수와 승리</b><p>마을 1점 · 도시 2점 · 승점 카드 1점입니다. 길 5개 이상으로 가장 긴 연결을 만들면 ‘최장 교역로’ 2점, 기사 3장 이상을 가장 많이 사용하면 ‘최대 기사단’ 2점을 받습니다.</p></section><section><b><span>8</span> 개발 카드</b><p>기사는 도둑을 옮기고, 도로 건설은 길 2개를 무료로 놓습니다. 풍요의 해는 자원 2장, 독점은 선택한 자원을 모두 가져옵니다. 구매한 카드는 다음 차례부터 사용할 수 있습니다.</p></section></div><div className="help-tip"><b>게임 중 헷갈리면</b><span>화면 오른쪽 위의 ‘게임 설명’을 언제든 다시 누르세요. 현재 게임은 그대로 유지됩니다.</span></div><button className="primary-button help-done" onClick={close}>설명 확인하고 게임으로 돌아가기</button></div></div>;
}

function SaveModal({ activeSlot, onSave, close }: { activeSlot: SaveSlot | null; onSave: (slot: SaveSlot) => void; close: () => void }) {
  const [selected,setSelected]=useState<SaveSlot>(activeSlot??1);
  const saved=useMemo(()=>loadGames(),[]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-title"><div className="settings-sheet save-sheet"><button className="close-button" onClick={close} aria-label="저장 창 닫기">×</button><p className="step-label">게임 저장</p><h2 id="save-title">어디에 저장할까요?</h2><p className="muted">저장 위치를 한 번 정하면 이후 진행 상황도 같은 곳에 자동으로 반영됩니다.</p><div className="save-choice-grid">{SAVE_SLOTS.map((slot)=>{const savedGame=saved[slot-1];return <button type="button" key={slot} className={selected===slot?'save-choice selected':'save-choice'} aria-pressed={selected===slot} onClick={()=>setSelected(slot)}><span>{slot}</span><div><b>{slot}번 저장</b><small>{savedGame?`${savedGame.round}라운드 · ${savedGame.players.map((player)=>player.name).join(', ')}`:'비어 있음'}</small></div>{activeSlot===slot&&<em>현재 저장</em>}</button>})}</div>{saved[selected-1]&&activeSlot!==selected&&<p className="save-overwrite-note">선택한 곳의 기존 게임을 현재 게임으로 덮어씁니다.</p>}<div className="decision-buttons save-decisions"><button className="secondary-button" type="button" onClick={close}>저장하지 않기</button><button className="primary-button" type="button" onClick={()=>onSave(selected)}>{saved[selected-1]?'덮어써서 저장':'이곳에 저장'}</button></div></div></div>;
}

function PlayerStatusModal({ game, playerId, close }: { game: GameState; playerId: string; close: () => void }) {
  const player=game.players.find((entry)=>entry.id===playerId)!;
  const [revealed,setRevealed]=useState(playerId===game.currentPlayerId);
  const settlements=Object.values(game.buildings).filter((building)=>building.playerId===player.id&&building.type==='settlement').length;
  const cities=Object.values(game.buildings).filter((building)=>building.playerId===player.id&&building.type==='city').length;
  if(!revealed)return <div className="modal-backdrop player-status-backdrop" role="dialog" aria-modal="true" aria-labelledby="player-private-title"><div className="player-private-gate"><button className="close-button" onClick={close} aria-label="플레이어 현황 닫기">×</button><span className="big-token" style={{background:player.color}}>{player.name.slice(0,1)}</span><p className="step-label">비공개 현황 확인</p><h2 id="player-private-title">{player.name}님에게 기기를 건네주세요</h2><p>자원과 개발 카드는 본인만 확인해 주세요.</p><button className="primary-button" type="button" onClick={()=>setRevealed(true)}>{player.name}입니다 · 현황 열기</button></div></div>;
  return <div className="modal-backdrop player-status-backdrop" role="dialog" aria-modal="true" aria-labelledby="player-status-title"><div className="player-status-sheet"><button className="close-button" onClick={close} aria-label="플레이어 현황 닫기">×</button><div className="player-status-heading"><span className="big-token" style={{background:player.color}}>{player.name.slice(0,1)}</span><div><p className="step-label">개인 현황</p><h2 id="player-status-title">{player.name}님의 자원</h2><small>실제 {scorePlayer(game,player.id,true)}점 · 공개 {scorePlayer(game,player.id)}점</small></div></div><div className="status-resource-grid">{RESOURCES.map((resource)=><ResourcePill key={resource} resource={resource} amount={player.resources[resource]}/>)}</div><div className="status-stat-grid"><span><b>{player.roads.length}</b>놓은 길</span><span><b>{settlements}</b>마을</span><span><b>{cities}</b>도시</span><span><b>{longestRoadLength(game,player.id)}</b>최장 길</span><span><b>{player.usedKnights}</b>사용 기사</span><span><b>{player.devCards.filter((card)=>!card.played).length}</b>보유 카드</span></div><section className="status-dev-cards"><b>개발 카드</b>{player.devCards.filter((card)=>!card.played).length?<div>{player.devCards.filter((card)=>!card.played).map((card)=><span key={card.id}>{DEV_LABELS[card.type]}</span>)}</div>:<p>보유한 개발 카드가 없습니다.</p>}</section><button className="primary-button status-close" type="button" onClick={close}>확인 완료</button></div></div>;
}

function SettingsModal({ game, activeSlot, act, onExit, onImport, close }: { game: GameState; activeSlot: SaveSlot | null; act: (action: GameAction) => void; onExit: () => void; onImport: (game: GameState) => void; close: () => void }) {
  const input=useRef<HTMLInputElement>(null); const [error,setError]=useState('');
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="설정"><div className="settings-sheet"><button className="close-button" onClick={close} aria-label="닫기">×</button><p className="step-label">게임 설정</p><h2>저장과 편의 기능</h2><button className="settings-row" onClick={()=>act({type:'TOGGLE_SOUND'})}><span>효과음</span><b>{game.sound?'켜짐':'꺼짐'}</b></button><button className="settings-row" onClick={()=>exportGame(game)}><span>게임 상태 내보내기</span><b>JSON ↓</b></button><button className="settings-row" onClick={()=>input.current?.click()}><span>게임 상태 가져오기</span><b>JSON ↑</b></button><input ref={input} className="sr-only" type="file" accept="application/json" onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;try{onImport(await importGame(file));close()}catch(reason){setError(reason instanceof Error?reason.message:'불러오지 못했습니다.')}}}/>{error&&<p className="error-note">{error}</p>}<button className="settings-row" onClick={()=>{close();onExit()}}><span>시작 화면으로</span><b>나가기</b></button><p className="autosave-note">{activeSlot?`${activeSlot}번 저장에 진행 상황이 자동 반영되고 있습니다.`:'아직 저장 위치를 선택하지 않았습니다.'}</p></div></div>;
}

export default function GameApp() {
  const [game,setGame]=useState<GameState|null>(null); const [activeSlot,setActiveSlot]=useState<SaveSlot|null>(null); const [panel,setPanel]=useState<'build'|'trade'|'cards'|'log'>('build'); const [buildMode,setBuildMode]=useState<BuildMode>(null); const [help,setHelp]=useState(false); const [settings,setSettings]=useState(false); const [saveOpen,setSaveOpen]=useState(false); const [inspectPlayerId,setInspectPlayerId]=useState<string|null>(null);
  const [rolling,setRolling]=useState(false); const [animatedDice,setAnimatedDice]=useState<[number|null,number|null]>([null,null]); const [rollResult,setRollResult]=useState<[number,number]|null>(null);
  const [playerPanelCollapsed,setPlayerPanelCollapsed]=useState(false);
  const [robberNotice,setRobberNotice]=useState<{message:string;victimName:string;resource:Resource}|null>(null);
  const rollInterval=useRef<number|null>(null); const rollTimeouts=useRef<number[]>([]);
  const robberNoticeTimeout=useRef<number|null>(null);
  const pendingSteal=useRef<{existingLogIds:Set<string>;victimName:string}|null>(null);
  useEffect(()=>{if(game&&activeSlot)saveGame(game,activeSlot)},[game,activeSlot]);
  useEffect(()=>{
    const pending=pendingSteal.current;
    if(!game||!pending)return;
    const entry=game.log.find((candidate)=>!pending.existingLogIds.has(candidate.id)&&candidate.privateFor?.includes(game.currentPlayerId)&&RESOURCES.some((resource)=>candidate.message.startsWith(`${RESOURCE_LABELS[resource]} `)));
    if(!entry)return;
    const resource=RESOURCES.find((candidate)=>entry.message.startsWith(`${RESOURCE_LABELS[candidate]} `));
    if(!resource)return;
    pendingSteal.current=null;
    setRobberNotice({message:entry.message,victimName:pending.victimName,resource});
    if(robberNoticeTimeout.current!==null)window.clearTimeout(robberNoticeTimeout.current);
    robberNoticeTimeout.current=window.setTimeout(()=>{setRobberNotice(null);robberNoticeTimeout.current=null},3600);
  },[game]);
  useEffect(()=>()=>{if(rollInterval.current!==null)window.clearInterval(rollInterval.current);rollTimeouts.current.forEach((timer)=>window.clearTimeout(timer));if(robberNoticeTimeout.current!==null)window.clearTimeout(robberNoticeTimeout.current);},[]);
  const resetTurnUi=()=>{if(rollInterval.current!==null){window.clearInterval(rollInterval.current);rollInterval.current=null}rollTimeouts.current.forEach((timer)=>window.clearTimeout(timer));rollTimeouts.current=[];if(robberNoticeTimeout.current!==null){window.clearTimeout(robberNoticeTimeout.current);robberNoticeTimeout.current=null}pendingSteal.current=null;setRobberNotice(null);setRolling(false);setAnimatedDice([null,null]);setRollResult(null)};
  const act=(action:GameAction,sound:'tap'|'dice'|'build'='tap')=>setGame((current)=>{if(!current)return current;const next=reduceGame(current,action);if(next!==current)tone(current.sound,sound);return next;});
  if(!game)return <SetupScreen onStart={(nextGame,slot)=>{setActiveSlot(slot);setGame(nextGame)}}/>;
  const setupHandoff=game.hidden&&(game.phase.startsWith('setup')||(game.phase==='pre-roll'&&game.setupIndex>=game.setupSequence.length&&game.turnNumber===1));
  if(setupHandoff)return <main className="game-shell"><Handoff game={game} act={act}/></main>;
  if(game.phase==='discard')return <main className="game-shell"><DiscardOverlay game={game} act={act}/></main>;
  const player=game.players.find((entry)=>entry.id===game.currentPlayerId)!;
  const preRollKnight=!game.devPlayedThisTurn?player.devCards.find((card)=>card.type==='knight'&&!card.played&&card.boughtTurn<game.turnNumber):undefined;
  const randomDie=()=>1+Math.floor(Math.random()*6);
  const roll=()=>{if(rolling||game.phase!=='pre-roll')return;const finalDice:[number,number]=[randomDie(),randomDie()];let steps=0;setRolling(true);setAnimatedDice([randomDie(),randomDie()]);rollInterval.current=window.setInterval(()=>{steps+=1;setAnimatedDice([randomDie(),randomDie()]);if(steps>=9){if(rollInterval.current!==null)window.clearInterval(rollInterval.current);rollInterval.current=null;setAnimatedDice(finalDice);const finish=window.setTimeout(()=>{setRolling(false);setRollResult(finalDice);act({type:'ROLL',dice:finalDice},'dice');const hide=window.setTimeout(()=>setRollResult(null),1800);rollTimeouts.current.push(hide)},110);rollTimeouts.current.push(finish)}},80)};
  const steal=(victimId:string)=>{const victim=game.players.find((candidate)=>candidate.id===victimId);pendingSteal.current={existingLogIds:new Set(game.log.map((entry)=>entry.id)),victimName:victim?.name??'상대'};act({type:'STEAL',victimId,randomValue:Math.random()})};
  const visibleLogs=game.log.filter((entry)=>!entry.privateFor||entry.privateFor.includes(game.currentPlayerId));
  return <main className="game-shell">
    <header className="game-header"><div className="compact-brand"><span>⬡</span><b>카탄</b></div><div className="round-label">{game.round} 라운드 {game.dice&&<span className="dice-mini"><DicePair dice={game.dice} compact/><b>{game.dice[0]+game.dice[1]}</b></span>}</div><div className="header-actions"><button className="save-header-button" onClick={()=>setSaveOpen(true)}>저장하기{activeSlot&&<small>{activeSlot}번</small>}</button><button className="help-header-button" onClick={()=>setHelp(true)}>게임 설명</button><button onClick={()=>setSettings(true)}>설정</button></div></header>
    <ScoreStrip game={game} onInspect={setInspectPlayerId}/><PhaseGuide game={game}/>
    <div className={`game-layout${playerPanelCollapsed?' panel-collapsed':''}`}>
      <section className="board-column">
        <GameBoard game={game} buildMode={buildMode} act={act}/>
        {playerPanelCollapsed&&<button className="player-panel-expand" type="button" aria-expanded="false" onClick={()=>setPlayerPanelCollapsed(false)}><span aria-hidden="true">‹</span><b>내 패 열기</b></button>}
      </section>
      {!playerPanelCollapsed&&<aside className="player-panel">
        <div className="private-title"><span className="player-token" style={{background:player.color}}>{player.name.slice(0,1)}</span><div><b>{player.name}님의 패</b><small>실제 {scorePlayer(game,player.id,true)}점 · 공개 {scorePlayer(game,player.id)}점</small></div><button className="player-panel-collapse" type="button" aria-expanded="true" onClick={()=>setPlayerPanelCollapsed(true)}><span aria-hidden="true">›</span><small>패널 접기</small></button></div>
        <div className="resource-row">{RESOURCES.map((resource)=><ResourcePill key={resource} resource={resource} amount={player.resources[resource]}/>)}</div>
        <div className="piece-stats"><span>길 {player.roads.length}/15</span><span>최장 {longestRoadLength(game,player.id)}</span><span>기사 {player.usedKnights}</span><span>카드 {player.devCards.filter((c)=>!c.played).length}</span></div>
        {game.phase==='pre-roll'&&<div className="roll-zone"><DicePair dice={animatedDice} rolling={rolling}/><span className="roll-status" aria-live="polite">{rolling?'주사위가 굴러가는 중입니다':'두 주사위의 눈을 확인하세요'}</span>{preRollKnight&&<button className="pre-roll-knight" disabled={rolling} onClick={()=>act({type:'PLAY_DEV',cardId:preRollKnight.id})}>기사 먼저 사용하기</button>}<button className="roll-button" disabled={rolling} onClick={roll}>{rolling?'굴리는 중…':'주사위 굴리기'}</button></div>}
        {game.phase==='robber-steal'&&<div className="victim-list"><h3>자원을 가져올 상대</h3>{game.eligibleVictims.map((id)=><button key={id} onClick={()=>steal(id)}>{game.players.find((candidate)=>candidate.id===id)?.name} · 무작위 1장</button>)}</div>}
        {game.phase==='main'&&<><nav className="panel-tabs">{([['build','건설'],['trade','거래'],['cards','개발'],['log','기록']] as const).map(([id,label])=><button key={id} className={panel===id?'active':''} onClick={()=>{setPanel(id);setBuildMode(null)}}>{label}</button>)}</nav><div className="action-panel">{panel==='build'&&<BuildPanel game={game} mode={buildMode} setMode={setBuildMode}/>} {panel==='trade'&&<TradePanel game={game} act={act}/>} {panel==='cards'&&<CardPanel game={game} act={act} setBuildMode={setBuildMode}/>} {panel==='log'&&<div className="log-list">{visibleLogs.map((entry)=><p key={entry.id}>{entry.message}</p>)}</div>}</div><button className="end-turn" disabled={game.freeRoads>0||Boolean(game.pendingTrade)} onClick={()=>{resetTurnUi();setPanel('build');setBuildMode(null);act({type:'END_TURN'})}}>차례 마치기 →</button></>}
      </aside>}
    </div>
    {rollResult&&<div className="dice-result-pop" role="status" aria-live="assertive"><DicePair dice={rollResult}/><div><strong>{rollResult[0]+rollResult[1]}</strong><span>이 나왔습니다!</span></div></div>}
    {robberNotice&&<div className="robber-result-pop" role="status" aria-live="assertive"><span className={`robber-resource resource-${robberNotice.resource}`} aria-hidden="true">{RESOURCE_ICONS[robberNotice.resource]}</span><div><small>도둑이 가져온 자원</small><strong>{robberNotice.victimName}님에게서 {robberNotice.message}</strong><span>기록 탭에서도 다시 확인할 수 있어요.</span></div><button type="button" aria-label="도둑 자원 알림 닫기" onClick={()=>setRobberNotice(null)}>×</button></div>}
    {game.phase==='victory'&&<div className="victory-overlay"><div className="victory-card"><span className="victory-mark">⬡</span><p className="step-label">개척 완료</p><h2>{player.name}님이 섬을 완성했습니다!</h2><p>총 {scorePlayer(game,player.id,true)}점 · {game.round}라운드</p><button className="primary-button" onClick={()=>{if(activeSlot)clearGame(activeSlot);resetTurnUi();setActiveSlot(null);setGame(null)}}>새 모험 시작하기</button></div></div>}
    {game.pendingTrade&&<TradeDecision game={game} act={act}/>} {help&&<HelpModal close={()=>setHelp(false)}/>} {saveOpen&&<SaveModal activeSlot={activeSlot} onSave={(slot)=>{saveGame(game,slot);setActiveSlot(slot);setSaveOpen(false)}} close={()=>setSaveOpen(false)}/>} {inspectPlayerId&&<PlayerStatusModal game={game} playerId={inspectPlayerId} close={()=>setInspectPlayerId(null)}/>} {settings&&<SettingsModal game={game} activeSlot={activeSlot} act={act} onExit={()=>{resetTurnUi();setActiveSlot(null);setGame(null)}} onImport={(imported)=>{resetTurnUi();setPanel('build');setBuildMode(null);setActiveSlot(null);setGame(imported)}} close={()=>setSettings(false)}/>}
  </main>;
}
