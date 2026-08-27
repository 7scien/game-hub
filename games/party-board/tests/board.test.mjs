import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceMovement,BOARD_LAYOUT_VERSION,BOARD_RULES,createBoard,validateBoard} from '../src/domain/board.js';
import {getTurnMilestones,salaryForCompletedLap} from '../src/domain/turns.js';
import {buildBoardLayout,getBranchDirections,getNodeDirection,getPlayerPoint,getRouteSamplePoints} from '../src/three/board-layout.js';
import {isFastMovement,MOTION_STAGES,movementPace,movementStepDuration} from '../src/three/movement-timing.js';

test('the authored harbor route satisfies its Phase 1 topology contract',()=>{
  for(let seed=0;seed<750;seed+=1){
    const board=createBoard(`seed-${seed}`);
    assert.deepEqual(validateBoard(board),[],`seed ${seed}`);
    assert.equal(board.layoutVersion,BOARD_LAYOUT_VERSION);
    assert.equal(board.spaces.length,BOARD_RULES.regularSpaces);
    assert.equal(board.branches.length,4);
    assert.deepEqual(board.branches.map(branch=>branch.name),['중앙 마을길','부두 반원길','정원 S지름길','해변 마을고리']);
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
  const startIndex=(splitIndex-4+board.spaces.length)%board.spaces.length;
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
  const result=advanceMovement(board,{startId:'r'+(board.spaces.length-2),steps:3,choices});
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
  const expectedNodes=board.spaces.length+board.branches.reduce((total,branch)=>total+branch.nodes.length,0);
  assert.equal(layout.positions.size,expectedNodes);
  assert.equal(layout.mainPath.length,BOARD_RULES.regularSpaces);
  assert.equal(layout.branchPaths.length,4);
  for(const branch of layout.branchPaths){
    assert.ok(layout.positions.has(branch.splitId));
    assert.ok(layout.positions.has(branch.mergeId));
    assert.ok(branch.nodeIds.every(nodeId=>layout.positions.has(nodeId)));
    const directions=getBranchDirections(layout,branch.id);
    assert.ok(directions);
    assert.ok(Math.hypot(directions.main.x,directions.main.z)>.99);
    assert.ok(Math.hypot(directions.branch.x,directions.branch.z)>.99);
    const branchDirection=getNodeDirection(layout,branch.nodeIds[0],branch.id);
    assert.ok(Math.hypot(branchDirection.x,branchDirection.z)>.99);
  }
});

test('3D player offsets separate four characters sharing a space',()=>{
  const layout=buildBoardLayout(createBoard('player-offsets'));
  const points=Array.from({length:4},(_,seat)=>getPlayerPoint(layout,'r0',seat));
  assert.equal(new Set(points.map(point=>`${point.x},${point.z}`)).size,4);
  assert.ok(points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)));
});

test('authored 3D spaces remain visibly separated outside shared junction nodes',()=>{
  const layout=buildBoardLayout(createBoard('visual-spacing'));
  const points=[...layout.positions.values()];
  for(let first=0;first<points.length;first+=1){
    for(let second=first+1;second<points.length;second+=1){
      const distance=Math.hypot(points[first].x-points[second].x,points[first].z-points[second].z);
      assert.ok(distance>1.4,`${points[first].id} overlaps ${points[second].id} at ${distance.toFixed(3)}`);
    }
  }
});

test('no four consecutive spaces collapse into a nearly straight run',()=>{
  const layout=buildBoardLayout(createBoard('curve-runs'));
  const routes=[
    {id:'main',nodeIds:layout.mainPath,closed:true},
    ...layout.branchPaths.map(branch=>({id:branch.id,nodeIds:[branch.splitId,...branch.nodeIds,branch.mergeId],closed:false})),
  ];
  for(const route of routes){
    const windowCount=route.closed?route.nodeIds.length:route.nodeIds.length-3;
    for(let start=0;start<windowCount;start+=1){
      const points=Array.from({length:4},(_,offset)=>layout.positions.get(route.nodeIds[(start+offset)%route.nodeIds.length]));
      const turns=[turnAngle(points[0],points[1],points[2]),turnAngle(points[1],points[2],points[3])];
      assert.ok(turns.some(turn=>turn>=4),`${route.id} has a four-space straight run at ${route.nodeIds[start]}`);
    }
  }
});

test('curved route centerlines have no abnormal self-crossing or cross-route intersection',()=>{
  const layout=buildBoardLayout(createBoard('curve-crossings'));
  const routes=[
    {id:'main',closed:true,points:getRouteSamplePoints(layout,'main',340)},
    ...layout.branchPaths.map(branch=>({id:branch.id,closed:false,points:getRouteSamplePoints(layout,branch.id,180)})),
  ];
  for(let firstRoute=0;firstRoute<routes.length;firstRoute+=1){
    for(let secondRoute=firstRoute;secondRoute<routes.length;secondRoute+=1){
      const first=routes[firstRoute],second=routes[secondRoute];
      const firstCount=first.closed?first.points.length:first.points.length-1;
      const secondCount=second.closed?second.points.length:second.points.length-1;
      for(let firstSegment=0;firstSegment<firstCount;firstSegment+=1){
        for(let secondSegment=0;secondSegment<secondCount;secondSegment+=1){
          if(firstRoute===secondRoute&&segmentsAreAdjacent(firstSegment,secondSegment,firstCount,first.closed))continue;
          if(firstRoute!==secondRoute&&(isBranchEndpointSegment(first,firstSegment)||isBranchEndpointSegment(second,secondSegment)))continue;
          const crosses=properSegmentsIntersect(
            first.points[firstSegment],first.points[(firstSegment+1)%first.points.length],
            second.points[secondSegment],second.points[(secondSegment+1)%second.points.length],
          );
          assert.equal(crosses,false,`${first.id} and ${second.id} cross outside a junction`);
        }
      }
    }
  }
});

test('branch roads separate from the main road outside smooth junction zones',()=>{
  const layout=buildBoardLayout(createBoard('route-clearance'));
  const main=getRouteSamplePoints(layout,'main',400);
  for(const branch of layout.branchPaths){
    const split=layout.positions.get(branch.splitId);
    const merge=layout.positions.get(branch.mergeId);
    let clearance=Infinity;
    for(const branchPoint of getRouteSamplePoints(layout,branch.id,180)){
      if(distanceToEither(branchPoint,split,merge)<4)continue;
      for(const mainPoint of main){
        if(distanceToEither(mainPoint,split,merge)<4)continue;
        clearance=Math.min(clearance,planarDistance(branchPoint,mainPoint));
      }
    }
    assert.ok(clearance>2.25,`${branch.id} overlaps the main road at ${clearance.toFixed(3)}`);
  }
});

test('every authored node is reachable and every branch rejoins the main route',()=>{
  const board=createBoard('graph-reachability');
  const edges=new Map(board.spaces.map((space,index)=>[space.id,[board.spaces[(index+1)%board.spaces.length].id]]));
  for(const branch of board.branches){
    edges.get(branch.splitId).push(branch.nodes[0].id);
    branch.nodes.forEach((node,index)=>edges.set(node.id,[index===branch.nodes.length-1?branch.mergeId:branch.nodes[index+1].id]));
    const walked=advanceMovement(board,{startId:branch.splitId,steps:branch.nodes.length+1,choices:{[branch.id]:'branch'}});
    assert.equal(walked.status,'complete');
    assert.equal(walked.currentId,branch.mergeId);
    assert.deepEqual(walked.path.slice(0,-1),branch.nodes.map(node=>node.id));
  }
  const reached=new Set([board.startId]);
  const queue=[board.startId];
  while(queue.length){
    for(const next of edges.get(queue.shift())||[]){
      if(reached.has(next))continue;
      reached.add(next);queue.push(next);
    }
  }
  assert.equal(reached.size,board.spaces.length+board.branches.reduce((total,branch)=>total+branch.nodes.length,0));
});

test('movement timing switches to fast mode only above 12 spaces and slows for landing',()=>{
  assert.deepEqual(MOTION_STAGES,['idle','anticipation','move','slow_down','stop','reaction','idle']);
  assert.equal(isFastMovement(12),false);
  assert.equal(isFastMovement(13),true);
  const cruise=movementStepDuration({totalSteps:13,stepIndex:0,pathLength:13});
  const landing=movementStepDuration({totalSteps:13,stepIndex:12,pathLength:13});
  assert.ok(cruise<movementStepDuration({totalSteps:8,stepIndex:0,pathLength:8}));
  assert.ok(landing>cruise);
  assert.equal(movementPace({totalSteps:13,stepIndex:0,pathLength:13}),'walk');
  assert.equal(movementPace({totalSteps:13,stepIndex:2,pathLength:13}),'run');
  assert.equal(movementPace({totalSteps:13,stepIndex:12,pathLength:13}),'slow_down');
});

function turnAngle(first,middle,last){
  const incoming={x:middle.x-first.x,z:middle.z-first.z};
  const outgoing={x:last.x-middle.x,z:last.z-middle.z};
  const dot=incoming.x*outgoing.x+incoming.z*outgoing.z;
  const lengths=Math.hypot(incoming.x,incoming.z)*Math.hypot(outgoing.x,outgoing.z);
  return Math.acos(Math.max(-1,Math.min(1,dot/lengths)))*180/Math.PI;
}

function planarDistance(first,second){return Math.hypot(first.x-second.x,first.z-second.z)}
function distanceToEither(point,first,second){return Math.min(planarDistance(point,first),planarDistance(point,second))}
function orientation(first,second,third){return (second.x-first.x)*(third.z-first.z)-(second.z-first.z)*(third.x-first.x)}
function properSegmentsIntersect(first,second,third,fourth){
  const a=orientation(first,second,third),b=orientation(first,second,fourth);
  const c=orientation(third,fourth,first),d=orientation(third,fourth,second);
  return a*b<-1e-8&&c*d<-1e-8;
}
function segmentsAreAdjacent(first,second,count,closed){
  if(Math.abs(first-second)<=1)return true;
  return closed&&Math.abs(first-second)>=count-1;
}
function isBranchEndpointSegment(route,index){
  if(route.id==='main')return false;
  const count=route.points.length-1;
  return index<3||index>=count-3;
}
