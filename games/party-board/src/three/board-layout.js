const MAIN_X_RADIUS=11.8;
const MAIN_Z_RADIUS=8.2;

export function buildBoardLayout(board){
  if(!board?.spaces?.length)throw new Error('A board with regular spaces is required');
  const positions=new Map();
  const mainPath=board.spaces.map((space,index)=>{
    const point=regularPoint(index,board.spaces.length,space.kind);
    positions.set(space.id,{...point,id:space.id,kind:space.kind,path:'main'});
    return space.id;
  });
  const branchPaths=[];
  for(const branch of board.branches||[]){
    const start=positions.get(branch.splitId);
    const end=positions.get(branch.mergeId);
    if(!start||!end)continue;
    const midpoint={x:(start.x+end.x)/2,z:(start.z+end.z)/2};
    const control={x:midpoint.x*.34,z:midpoint.z*.34};
    const ids=[];
    branch.nodes.forEach((node,index)=>{
      const t=(index+1)/(branch.nodes.length+1);
      const arch=Math.sin(Math.PI*t);
      const point={
        x:quadratic(start.x,control.x,end.x,t),
        y:Math.max(start.y,end.y)+.08+arch*.82,
        z:quadratic(start.z,control.z,end.z,t),
        id:node.id,
        kind:node.kind||'branch',
        path:branch.id,
      };
      positions.set(node.id,point);
      ids.push(node.id);
    });
    branchPaths.push({id:branch.id,splitId:branch.splitId,mergeId:branch.mergeId,nodeIds:ids});
  }
  return {positions,mainPath,branchPaths,bounds:measureBounds(positions)};
}

export function getLayoutPoint(layout,nodeId){
  return layout?.positions?.get(nodeId)||null;
}

export function getPlayerPoint(layout,nodeId,seat=0){
  const point=getLayoutPoint(layout,nodeId)||getLayoutPoint(layout,'r0')||{x:0,y:0,z:0};
  const offsets=[[-.18,-.16],[.18,-.16],[-.18,.16],[.18,.16]];
  const [offsetX,offsetZ]=offsets[Math.abs(Number(seat)||0)%offsets.length];
  return {x:point.x+offsetX,y:point.y+.58,z:point.z+offsetZ};
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

function regularPoint(index,total,kind){
  const angle=index/total*Math.PI*2-Math.PI/2;
  const pulse=1+Math.sin(angle*3+.55)*.035+Math.cos(angle*5)*.018;
  return {
    x:Math.cos(angle)*MAIN_X_RADIUS*pulse,
    y:.35+Math.sin(angle*2+.4)*.16+Math.cos(angle*4)*.07,
    z:Math.sin(angle)*MAIN_Z_RADIUS*pulse,
  };
}

function normalizedDirection(from,to){
  if(!from||!to)return {x:0,y:0,z:1};
  const x=to.x-from.x;
  const z=to.z-from.z;
  const length=Math.hypot(x,z)||1;
  return {x:x/length,y:0,z:z/length};
}

function quadratic(start,control,end,t){
  const inverse=1-t;
  return inverse*inverse*start+2*inverse*t*control+t*t*end;
}

function measureBounds(positions){
  const values=[...positions.values()];
  return values.reduce((bounds,point)=>({
    minX:Math.min(bounds.minX,point.x),maxX:Math.max(bounds.maxX,point.x),
    minY:Math.min(bounds.minY,point.y),maxY:Math.max(bounds.maxY,point.y),
    minZ:Math.min(bounds.minZ,point.z),maxZ:Math.max(bounds.maxZ,point.z),
  }),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
}
