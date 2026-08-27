const MAP_SCALE=1.3;

export function buildBoardLayout(board){
  if(!board?.spaces?.length)throw new Error('A board with regular spaces is required');
  const positions=new Map();
  const mainGuide=(board.layoutGuide||fallbackGuide()).map(([x,z])=>({x:x*MAP_SCALE,y:.34,z:z*MAP_SCALE}));
  const mainPoints=samplePolyline(mainGuide,board.spaces.length,true);
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
    const sampled=samplePolyline([start,...authoredGuide,end],branch.nodes.length+2,false).slice(1,-1);
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

function samplePolyline(points,count,closed){
  if(!points.length)return [];
  const segments=[];
  let totalLength=0;
  const segmentCount=closed?points.length:points.length-1;
  for(let index=0;index<segmentCount;index+=1){
    const from=points[index];
    const to=points[(index+1)%points.length];
    const length=Math.hypot(to.x-from.x,to.z-from.z);
    segments.push({from,to,length,start:totalLength});
    totalLength+=length;
  }
  return Array.from({length:count},(_,index)=>{
    const distance=closed?index/count*totalLength:index/(count-1)*totalLength;
    const segment=segments.find(candidate=>distance<=candidate.start+candidate.length)||segments.at(-1);
    const t=segment.length?(distance-segment.start)/segment.length:0;
    return {
      x:lerp(segment.from.x,segment.to.x,t),
      y:lerp(segment.from.y,segment.to.y,t),
      z:lerp(segment.from.z,segment.to.z,t),
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
