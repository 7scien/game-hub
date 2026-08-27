const MAP_SCALE=1.22;
const ARC_SAMPLES_PER_CONTROL=72;

export function buildBoardLayout(board){
  if(!board?.spaces?.length)throw new Error('A board with regular spaces is required');
  const positions=new Map();
  const mainGuide=(board.layoutGuide||fallbackGuide()).map(([x,z])=>({x:x*MAP_SCALE,y:.34,z:z*MAP_SCALE}));
  const mainPoints=sampleSpline(mainGuide,board.spaces.length,true);
  const mainPath=board.spaces.map((space,index)=>{
    const point=mainPoints[index];
    positions.set(space.id,{...point,id:space.id,kind:space.kind,path:'main'});
    return space.id;
  });
  const branchPaths=[];
  for(const branch of board.branches||[]){
    const start=positions.get(branch.splitId);
    const end=positions.get(branch.mergeId);
    if(!start||!end)continue;
    const authoredGuide=(branch.guide||[]).map(([x,z],index)=>({
      x:x*MAP_SCALE,
      y:.38+Math.sin((index+1)/(branch.guide.length+1)*Math.PI)*.07,
      z:z*MAP_SCALE,
    }));
    const sampled=sampleSpline([start,...authoredGuide,end],branch.nodes.length+2,false).slice(1,-1);
    const ids=[];
    branch.nodes.forEach((node,index)=>{
      const point=sampled[index];
      positions.set(node.id,{...point,id:node.id,kind:node.kind,path:branch.id});
      ids.push(node.id);
    });
    branchPaths.push({
      id:branch.id,
      name:branch.name,
      splitId:branch.splitId,
      mergeId:branch.mergeId,
      nodeIds:ids,
    });
  }
  return {positions,mainPath,branchPaths,bounds:measureBounds(positions)};
}

export function getLayoutPoint(layout,nodeId){
  return layout?.positions?.get(nodeId)||null;
}

export function getPlayerPoint(layout,nodeId,seat=0){
  const point=getLayoutPoint(layout,nodeId)||getLayoutPoint(layout,'r0')||{x:0,y:0,z:0};
  const offsets=[[-.2,-.16],[.2,-.16],[-.2,.16],[.2,.16]];
  const [offsetX,offsetZ]=offsets[Math.abs(Number(seat)||0)%offsets.length];
  return {x:point.x+offsetX,y:point.y+.55,z:point.z+offsetZ};
}

export function getNodeDirection(layout,nodeId,preferredPath='auto'){
  if(!layout)return {x:0,y:0,z:1};
  const branch=preferredPath!=='main'&&layout.branchPaths.find(path=>path.id===preferredPath||path.nodeIds.includes(nodeId));
  const route=branch?[branch.splitId,...branch.nodeIds,branch.mergeId]:layout.mainPath;
  const index=route.indexOf(nodeId);
  if(index<0)return {x:0,y:0,z:1};
  const previousId=route[index===0?(branch?0:route.length-1):index-1];
  const nextId=route[index===route.length-1?(branch?route.length-1:0):index+1];
  return normalizedDirection(getLayoutPoint(layout,previousId),getLayoutPoint(layout,nextId));
}

export function getBranchDirections(layout,branchId){
  const branch=layout?.branchPaths?.find(path=>path.id===branchId);
  if(!branch)return null;
  const splitIndex=layout.mainPath.indexOf(branch.splitId);
  const split=getLayoutPoint(layout,branch.splitId);
  const mainNext=getLayoutPoint(layout,layout.mainPath[(splitIndex+1)%layout.mainPath.length]);
  const branchNext=getLayoutPoint(layout,branch.nodeIds[0]||branch.mergeId);
  return {
    split,
    main:normalizedDirection(split,mainNext),
    branch:normalizedDirection(split,branchNext),
  };
}

export function getRouteSamplePoints(layout,pathId='main',sampleCount=240){
  if(!layout)return [];
  const branch=layout.branchPaths.find(path=>path.id===pathId);
  const ids=branch?[branch.splitId,...branch.nodeIds,branch.mergeId]:layout.mainPath;
  const points=ids.map(id=>getLayoutPoint(layout,id)).filter(Boolean);
  return sampleSpline(points,Math.max(2,sampleCount),!branch);
}

function sampleSpline(points,count,closed){
  if(points.length<2)return points;
  const segmentCount=closed?points.length:points.length-1;
  const denseCount=Math.max(segmentCount*ARC_SAMPLES_PER_CONTROL,count*12);
  const dense=Array.from({length:denseCount+(closed?0:1)},(_,index)=>{
    const progress=index/denseCount*segmentCount;
    const segment=Math.min(segmentCount-1,Math.floor(progress));
    const t=progress-segment;
    return catmullRom(points,segment,t,closed);
  });
  return resampleByArcLength(dense,count,closed);
}

function catmullRom(points,segment,t,closed){
  const size=points.length;
  const at=index=>{
    if(closed)return points[(index%size+size)%size];
    return points[Math.max(0,Math.min(size-1,index))];
  };
  const p0=at(segment-1),p1=at(segment),p2=at(segment+1),p3=at(segment+2);
  const t2=t*t,t3=t2*t;
  return {
    x:catmullValue(p0.x,p1.x,p2.x,p3.x,t,t2,t3),
    y:catmullValue(p0.y,p1.y,p2.y,p3.y,t,t2,t3),
    z:catmullValue(p0.z,p1.z,p2.z,p3.z,t,t2,t3),
  };
}

function catmullValue(p0,p1,p2,p3,t,t2,t3){
  return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);
}

function resampleByArcLength(points,count,closed){
  const samples=closed?[...points,points[0]]:points;
  const distances=[0];
  for(let index=1;index<samples.length;index+=1){
    const previous=samples[index-1],current=samples[index];
    distances.push(distances.at(-1)+Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z));
  }
  const total=distances.at(-1);
  let cursor=1;
  return Array.from({length:count},(_,index)=>{
    const target=(closed?index/count:index/(count-1))*total;
    while(cursor<distances.length-1&&distances[cursor]<target)cursor+=1;
    const start=distances[cursor-1],end=distances[cursor];
    const t=end===start?0:(target-start)/(end-start);
    return {
      x:lerp(samples[cursor-1].x,samples[cursor].x,t),
      y:lerp(samples[cursor-1].y,samples[cursor].y,t),
      z:lerp(samples[cursor-1].z,samples[cursor].z,t),
    };
  });
}

function fallbackGuide(){
  return [[-8,5],[-8,-5],[8,-5],[8,5]];
}

function normalizedDirection(from,to){
  if(!from||!to)return {x:0,y:0,z:1};
  const x=to.x-from.x;
  const z=to.z-from.z;
  const length=Math.hypot(x,z)||1;
  return {x:x/length,y:0,z:z/length};
}

function lerp(start,end,t){return start+(end-start)*t}

function measureBounds(positions){
  const values=[...positions.values()];
  return values.reduce((bounds,point)=>({
    minX:Math.min(bounds.minX,point.x),maxX:Math.max(bounds.maxX,point.x),
    minY:Math.min(bounds.minY,point.y),maxY:Math.max(bounds.maxY,point.y),
    minZ:Math.min(bounds.minZ,point.z),maxZ:Math.max(bounds.maxZ,point.z),
  }),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
}
