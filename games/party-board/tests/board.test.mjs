import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceMovement,BOARD_RULES,createBoard,validateBoard} from '../src/domain/board.js';
import {getTurnMilestones,salaryForCompletedLap} from '../src/domain/turns.js';
import {buildBoardLayout,getPlayerPoint} from '../src/three/board-layout.js';
import {isFastMovement,MOTION_STAGES,movementStepDuration} from '../src/three/movement-timing.js';

test('generated boards satisfy every Phase 1 placement invariant',()=>{
  for(let seed=0;seed<750;seed+=1){
    const board=createBoard(`seed-${seed}`);
    assert.deepEqual(validateBoard(board),[],`seed ${seed}`);
    assert.equal(board.spaces.length,60);
    assert.equal(board.branches.length,4);
    assert.deepEqual(Object.fromEntries(Object.keys(BOARD_RULES.kindCounts).map(kind=>[kind,board.spaces.filter(space=>space.kind===kind).length])),BOARD_RULES.kindCounts);
  }
});

test('a stored seed always recreates the same board',()=>{
  assert.deepEqual(createBoard('same-room'),createBoard('same-room'));
  assert.notDeepEqual(createBoard('same-room'),createBoard('different-room'));
});

test('movement pauses at a branch and continues with only the remaining steps',()=>{
  const board=createBoard('branch-walk');
  const branch=board.branches[0];
  const splitIndex=Number(branch.splitId.slice(1));
  const startIndex=(splitIndex-4+60)%60;
  const first=advanceMovement(board,{startId:`r${startIndex}`,steps:10});
  assert.equal(first.status,'choice_required');
  assert.equal(first.currentId,branch.splitId);
  assert.equal(first.path.length,4);
  assert.equal(first.remaining,6);
  const continued=advanceMovement(board,{startId:first.currentId,steps:first.remaining,choices:{[branch.id]:'branch'}});
  assert.equal(continued.status,'complete');
  assert.equal(continued.path.length,6);
  assert.equal(continued.currentId,branch.nodes[5].id);
});

test('crossing the start line reports a completed lap',()=>{
  const board=createBoard('lap');
  const choices=Object.fromEntries(board.branches.map(branch=>[branch.id,'main']));
  const result=advanceMovement(board,{startId:'r58',steps:3,choices});
  assert.equal(result.status,'complete');
  assert.equal(result.currentId,'r1');
  assert.equal(result.laps,1);
});

test('lap salary and global-turn milestones use the documented global clock',()=>{
  assert.equal(salaryForCompletedLap(1),10);
  assert.equal(salaryForCompletedLap(3),30);
  assert.equal(getTurnMilestones(6).startPlaceholderMinigame,true);
  assert.equal(getTurnMilestones(9).spawnInitialStar,true);
  assert.equal(getTurnMilestones(21).spawnCompanion,true);
  assert.deepEqual(getTurnMilestones(60),{showResults:true,startPlaceholderMinigame:false,spawnInitialStar:false,spawnCompanion:false});
});

test('3D layout includes every regular and branch node with four complete branch paths',()=>{
  const board=createBoard('three-layout');
  const layout=buildBoardLayout(board);
  const expectedNodes=60+board.branches.reduce((total,branch)=>total+branch.nodes.length,0);
  assert.equal(layout.positions.size,expectedNodes);
  assert.equal(layout.mainPath.length,60);
  assert.equal(layout.branchPaths.length,4);
  for(const branch of layout.branchPaths){
    assert.ok(layout.positions.has(branch.splitId));
    assert.ok(layout.positions.has(branch.mergeId));
    assert.ok(branch.nodeIds.every(nodeId=>layout.positions.has(nodeId)));
  }
});

test('3D player offsets separate four characters sharing a space',()=>{
  const layout=buildBoardLayout(createBoard('player-offsets'));
  const points=Array.from({length:4},(_,seat)=>getPlayerPoint(layout,'r0',seat));
  assert.equal(new Set(points.map(point=>`${point.x},${point.z}`)).size,4);
  assert.ok(points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)));
});

test('movement timing switches to fast mode only above 12 spaces and slows for landing',()=>{
  assert.deepEqual(MOTION_STAGES,['idle','anticipation','move','slow_down','stop','reaction','idle']);
  assert.equal(isFastMovement(12),false);
  assert.equal(isFastMovement(13),true);
  const cruise=movementStepDuration({totalSteps:13,stepIndex:0,pathLength:13});
  const landing=movementStepDuration({totalSteps:13,stepIndex:12,pathLength:13});
  assert.ok(cruise<movementStepDuration({totalSteps:8,stepIndex:0,pathLength:8}));
  assert.ok(landing>cruise);
});
