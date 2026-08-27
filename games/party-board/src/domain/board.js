export const BOARD_LAYOUT_VERSION='harbor-village-v2';

export const BOARD_RULES=Object.freeze({
  regularSpaces:68,
  branchCount:4,
  kindCounts:Object.freeze({normal:43,special:7,event:7,trap:7,shop:4}),
  branchLengths:Object.freeze([12,11,9,10]),
});

const KIND_POSITIONS=Object.freeze({
  shop:[5,22,40,56],
  trap:[11,20,30,38,48,59,65],
  event:[2,15,26,35,45,54,63],
  special:[8,18,28,33,43,52,61],
});

// Authored from the user's route sketch: west climb, north promenade,
// large pier loop, middle crossing, south promenade, village loop, coast return.
const MAIN_GUIDE=Object.freeze([
  [-13,7],[-14.8,3],[-13.3,0],[-15,-3.5],[-12.5,-8.5],[-8.5,-11],[-4,-10.2],
  [0,-11],[4,-10.6],[7,-12.5],[11,-12],[14,-9],[15,-5],
  [13.5,-1.5],[11,.5],[12,4.5],[14,8],[13,11.5],[10,14],
  [6,15],[2.5,13],[-1,15],[-5.5,12.7],[-9.8,14.5],[-12.8,9.5],
]);

const BRANCH_BLUEPRINTS=Object.freeze([
  {
    id:'village-crossing',name:'중앙 마을길',splitId:'r8',mergeId:'r38',
    guide:[[-11,-4],[-9,-1],[-6,.2],[-2,-.8],[2,.7],[6,-.2],[9,-1.5],[11,-3]],
    kinds:['normal','special','normal','event','normal','normal','trap','normal','event','normal','special','normal'],
  },
  {
    id:'north-pier-loop',name:'부두 반원길',splitId:'r18',mergeId:'r34',
    guide:[[-2.2,-7.5],[0,-5],[4,-3],[8,-4],[8.5,-5.5],[10.5,-8]],
    kinds:['normal','normal','event','normal','special','normal','normal','trap','normal','event','normal'],
  },
  {
    id:'garden-cut',name:'정원 S지름길',splitId:'r54',mergeId:'r65',
    guide:[[1.5,11],[-1,9],[-4,10],[-6.5,8],[-9,9]],
    kinds:['normal','event','normal','special','normal','normal','trap','normal','event'],
  },
  {
    id:'beach-village-loop',name:'해변 마을고리',splitId:'r40',mergeId:'r50',
    guide:[[8.8,3.5],[6.8,5.8],[6.2,8],[6.8,11],[6,12]],
    kinds:['normal','trap','normal','event','normal','special','normal','normal','event','normal'],
  },
]);

export function createBoard(seed='party-board'){
  const spaces=Array.from({length:BOARD_RULES.regularSpaces},(_,index)=>({
    id:`r${index}`,
    index,
    kind:kindAt(index),
  }));
  const branches=BRANCH_BLUEPRINTS.map((blueprint,branchIndex)=>({
    id:blueprint.id,
    name:blueprint.name,
    splitId:blueprint.splitId,
    mergeId:blueprint.mergeId,
    guide:blueprint.guide.map(([x,z])=>[x,z]),
    nodes:blueprint.kinds.map((kind,nodeIndex)=>({
      id:`b${branchIndex+1}-${nodeIndex+1}`,
      index:nodeIndex,
      kind,
    })),
  }));
  const board={
    seed:String(seed),
    layoutVersion:BOARD_LAYOUT_VERSION,
    startId:'r0',
    layoutGuide:MAIN_GUIDE.map(([x,z])=>[x,z]),
    spaces,
    branches,
  };
  const errors=validateBoard(board);
  if(errors.length)throw new Error(`Invalid authored board: ${errors.join('; ')}`);
  return board;
}

function kindAt(index){
  for(const [kind,indices] of Object.entries(KIND_POSITIONS))if(indices.includes(index))return kind;
  return 'normal';
}

export function validateBoard(board){
  const errors=[];
  if(board.layoutVersion!==BOARD_LAYOUT_VERSION)errors.push(`layout version must be ${BOARD_LAYOUT_VERSION}`);
  if(board.spaces?.length!==BOARD_RULES.regularSpaces)errors.push(`authored route must contain ${BOARD_RULES.regularSpaces} regular spaces`);
  if(!Array.isArray(board.layoutGuide)||board.layoutGuide.length<4)errors.push('authored route guide is missing');
  const ids=new Set();
  const counts={normal:0,special:0,event:0,trap:0,shop:0};
  for(const space of board.spaces||[]){
    if(ids.has(space.id))errors.push(`duplicate node id ${space.id}`);
    ids.add(space.id);
    if(!(space.kind in counts))errors.push(`unknown regular-space kind ${space.kind}`);
    else counts[space.kind]+=1;
  }
  for(const [kind,expected] of Object.entries(BOARD_RULES.kindCounts)){
    if(counts[kind]!==expected)errors.push(`${kind} count must be ${expected}`);
  }
  if(board.branches?.length!==BOARD_RULES.branchCount)errors.push('authored route must contain four linked alternatives');
  const splitIds=new Set();
  for(const [branchIndex,branch] of (board.branches||[]).entries()){
    if(splitIds.has(branch.splitId))errors.push(`duplicate branch split ${branch.splitId}`);
    splitIds.add(branch.splitId);
    if(!ids.has(branch.splitId)||!ids.has(branch.mergeId))errors.push(`${branch.id} must split from and merge into the main route`);
    if(branch.nodes.length!==BOARD_RULES.branchLengths[branchIndex])errors.push(`${branch.id} length must match the authored route`);
    if(!Array.isArray(branch.guide)||!branch.guide.length)errors.push(`${branch.id} guide is missing`);
    for(const node of branch.nodes){
      if(ids.has(node.id))errors.push(`duplicate node id ${node.id}`);
      ids.add(node.id);
    }
  }
  return [...new Set(errors)];
}

export function circularDistance(a,b,total=BOARD_RULES.regularSpaces){
  const distance=Math.abs(a-b);
  return Math.min(distance,total-distance);
}

export function getNode(board,nodeId){
  if(nodeId.startsWith('r'))return board.spaces[Number(nodeId.slice(1))]||null;
  for(const branch of board.branches){
    const node=branch.nodes.find(candidate=>candidate.id===nodeId);
    if(node)return node;
  }
  return null;
}

export function advanceMovement(board,{startId,steps,choices={}}){
  let currentId=startId;
  let remaining=steps;
  let laps=0;
  const path=[];
  while(remaining>0){
    const branchAtSplit=board.branches.find(branch=>branch.splitId===currentId);
    let nextId;
    if(branchAtSplit){
      const choice=choices[branchAtSplit.id];
      if(!choice)return {status:'choice_required',currentId,path,remaining,laps,branch:branchAtSplit};
      nextId=choice==='branch'?branchAtSplit.nodes[0].id:nextRegularId(board,currentId);
    }else{
      const branchWithNode=board.branches.find(branch=>branch.nodes.some(node=>node.id===currentId));
      if(branchWithNode){
        const index=branchWithNode.nodes.findIndex(node=>node.id===currentId);
        nextId=index===branchWithNode.nodes.length-1?branchWithNode.mergeId:branchWithNode.nodes[index+1].id;
      }else nextId=nextRegularId(board,currentId);
    }
    if(currentId!==board.startId&&nextId===board.startId)laps+=1;
    currentId=nextId;
    path.push(currentId);
    remaining-=1;
  }
  return {status:'complete',currentId,path,remaining,laps};
}

function nextRegularId(board,nodeId){
  return `r${(Number(nodeId.slice(1))+1)%board.spaces.length}`;
}
