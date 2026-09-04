import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePresentation,presentationChanges} from '../js/motion-events.js';
import {createGame,endTurn} from '../js/game.js';
import {PHASES} from '../js/rules.js';
import {renderGame} from '../js/ui.js';

const game=()=>createGame(2,{mode:'full',rng:()=>.2});

test('다시 표시하거나 저장 게임을 불러와도 운항 중단 표시는 유지되고 해제 시 사라진다',()=>{
  const state=game();const root={querySelector:()=>null};state.globalEffects.americanRage={remainingTurns:4};
  renderGame(root,state);assert.equal((root.innerHTML.match(/⛔ 운항 중단/g)||[]).length,4);
  renderGame(root,state);assert.equal((root.innerHTML.match(/⛔ 운항 중단/g)||[]).length,4);
  state.globalEffects.americanRage=null;renderGame(root,state);assert.ok(!root.innerHTML.includes('⛔ 운항 중단'));
});

test('운항 중단 전환은 네 이동수단에 한 번만 적용한다',()=>{
  const state=game();const before=capturePresentation(state);state.globalEffects.americanRage={remainingTurns:4};
  const change=presentationChanges(before,state);assert.equal(change.transport.locked,true);
  assert.deepEqual(change.transport.tiles.map(tile=>tile.index),[15,28,30,32]);
  assert.equal(presentationChanges(capturePresentation(state),state).transport,null);
  assert.equal(presentationChanges(null,state).transport,null);
});

test('운항 재개와 다음 플레이어 차례를 함께 감지한다',()=>{
  const state=game();state.phase=PHASES.END_TURN;state.globalEffects.americanRage={remainingTurns:1,activatedTurn:null};
  const before=capturePresentation(state);endTurn(state);const change=presentationChanges(before,state);
  assert.equal(change.transport.locked,false);assert.equal(change.turn.player.id,'player-2');assert.equal(change.arrival,null);
});

test('도시 착륙은 특수 이동에 적용하고 주사위 이동 중간에는 적용하지 않는다',()=>{
  const state=game();state.phase=PHASES.TRAVEL_DECISION;state.players[0].position=30;
  const before=capturePresentation(state);state.players[0].position=1;state.phase=PHASES.BUY_DECISION;
  assert.equal(presentationChanges(before,state).arrival.tile.name,'타이페이');
  state.pendingMovement={remaining:0};assert.equal(presentationChanges(before,state).arrival,null);
  state.pendingMovement=null;state.players[0].position=10;assert.equal(presentationChanges(before,state).arrival,null);
  state.players[0].position=1;state.players[0].bankrupt=true;assert.equal(presentationChanges(before,state).arrival,null);
});

test('새 차례와 더블 차례만 강조하고 거래·건설 취소나 재표시는 반복하지 않는다',()=>{
  const state=game();assert.ok(presentationChanges(null,state).turn);assert.equal(presentationChanges(capturePresentation(state),state).turn,null);
  for(const phase of [PHASES.TRADE,PHASES.BUILD_ANYWHERE_DECISION]){state.phase=phase;const before=capturePresentation(state);state.phase=PHASES.WAITING_FOR_ROLL;assert.equal(presentationChanges(before,state).turn,null)}
  state.phase=PHASES.END_TURN;state.rolledDouble=true;state.consecutiveDoubles=1;const before=capturePresentation(state);endTurn(state);
  assert.equal(presentationChanges(before,state).turn.bonus,true);
});

test('경매의 입찰자 전환은 강조하지 않고 후반전 첫 차례는 강조한다',()=>{
  const state=game();state.gameStage='AUCTION';state.phase=PHASES.AUCTION;const before=capturePresentation(state);
  assert.equal(presentationChanges(before,state).turn,null);state.gameStage='SECOND_HALF';state.phase=PHASES.WAITING_FOR_ROLL;
  assert.ok(presentationChanges(before,state).turn);state.status='finished';assert.deepEqual(presentationChanges(before,state),{transport:null,arrival:null,turn:null});
});
