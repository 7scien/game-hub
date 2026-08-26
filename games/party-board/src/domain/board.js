export const BOARD_RULES=Object.freeze({
  regularSpaces:60,
  branchCount:4,
  branchMinLength:15,
  branchMaxLength:20,
  minimumSameKindDistance:7,
  kindCounts:Object.freeze({normal:39,special:7,event:6,trap:5,shop:3}),
});

const PLACEABLE_KINDS=['special','event','trap'];

export function createBoard(seed='party-board'){
  const random=createRandom(seed);
  const spaces=Array.from({length:BOARD_RULES.regularSpaces},(_,index)=>({id:`r${index}`,index,kind:'normal'}));
  const used=new Set();
  const shopOffset=random.int(0,19);
  for(const index of [shopOffset,shopOffset+20,shopOffset+40]){
    spaces[index].kind='shop';
    used.add(index);
  }

  for(const kind of PLACEABLE_KINDS){
    const positions=placeKind({random,used,count:BOARD_RULES.kindCounts[kind]});
    for(const index of positions){spaces[index].kind=kind;used.add(index)}
  }

  const splitOffset=random.int(0,14);
  const branches=Array.from({length:BOARD_RULES.branchCount},(_,branchIndex)=>{
    const splitIndex=(splitOffset+branchIndex*15)%BOARD_RULES.regularSpaces;
    const mergeIndex=(splitIndex+random.int(5,10))%BOARD_RULES.regularSpaces;
    const length=random.int(BOARD_RULES.branchMinLength,BOARD_RULES.branchMaxLength);
    return {
      id:`branch-${branchIndex+1}`,
      splitId:`r${splitIndex}`,
      mergeId:`r${mergeIndex}`,
      nodes:Array.from({length},(_,nodeIndex)=>({
        id:`b${branchIndex+1}-${nodeIndex+1}`,
        index:nodeIndex,
        kind:'branch',
      })),
    };
  });

  const board={seed:String(seed),startId:'r0',spaces,branches};
  const errors=validateBoard(board);
  if(errors.length)throw new Error(`Invalid generated board: ${errors.join('; ')}`);
  return board;
}

function placeKind({random,used,count}){
  for(let attempt=0;attempt<500;attempt+=1){
    const positions=[];
    const candidates=random.shuffle(Array.from({length:BOARD_RULES.regularSpaces},(_,index)=>index).filter(index=>!used.has(index)));
    for(const index of candidates){
      if(positions.every(other=>circularDistance(index,other)>=BOARD_RULES.minimumSameKindDistance))positions.push(index);
      if(positions.length===count)return positions;
    }
  }
  throw new Error(`Unable to place ${count} board spaces with the requested spacing`);
}

export function validateBoard(board){
  const errors=[];
  if(board.spaces?.length!==BOARD_RULES.regularSpaces)errors.push('regular board must contain 60 spaces');
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

  const shops=(board.spaces||[]).filter(space=>space.kind==='shop').map(space=>space.index).sort((a,b)=>a-b);
  if(shops.length===3){
    const gaps=shops.map((index,i)=>(shops[(i+1)%shops.length]-index+BOARD_RULES.regularSpaces)%BOARD_RULES.regularSpaces);
    if(gaps.some(gap=>gap!==20))errors.push('shops must be exactly 20 spaces apart');
  }

  for(const kind of PLACEABLE_KINDS){
    const positions=(board.spaces||[]).filter(space=>space.kind===kind).map(space=>space.index);
    for(let i=0;i<positions.length;i+=1){
      for(let j=i+1;j<positions.length;j+=1){
        if(circularDistance(positions[i],positions[j])<BOARD_RULES.minimumSameKindDistance)errors.push(`${kind} spaces are too close: ${positions[i]}, ${positions[j]}`);
      }
    }
  }

  if(board.branches?.length!==BOARD_RULES.branchCount)errors.push('board must contain four branches');
  const splitIds=new Set();
  for(const branch of board.branches||[]){
    if(splitIds.has(branch.splitId))errors.push(`duplicate branch split ${branch.splitId}`);
    splitIds.add(branch.splitId);
    if(!ids.has(branch.splitId)||!ids.has(branch.mergeId))errors.push(`${branch.id} must split from and merge into the regular path`);
    if(branch.nodes.length<BOARD_RULES.branchMinLength||branch.nodes.length>BOARD_RULES.branchMaxLength)errors.push(`${branch.id} length must be 15–20`);
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
      nextId=choice==='branch'?branchAtSplit.nodes[0].id:nextRegularId(currentId);
    }else{
      const branchWithNode=board.branches.find(branch=>branch.nodes.some(node=>node.id===currentId));
      if(branchWithNode){
        const index=branchWithNode.nodes.findIndex(node=>node.id===currentId);
        nextId=index===branchWithNode.nodes.length-1?branchWithNode.mergeId:branchWithNode.nodes[index+1].id;
      }else nextId=nextRegularId(currentId);
    }
    if(currentId!=='r0'&&nextId==='r0')laps+=1;
    currentId=nextId;
    path.push(currentId);
    remaining-=1;
  }
  return {status:'complete',currentId,path,remaining,laps};
}

function nextRegularId(nodeId){
  return `r${(Number(nodeId.slice(1))+1)%BOARD_RULES.regularSpaces}`;
}

function createRandom(seed){
  let state=hashSeed(String(seed))||0x6d2b79f5;
  const next=()=>{
    state|=0;
    state=(state+0x6d2b79f5)|0;
    let value=Math.imul(state^(state>>>15),1|state);
    value=(value+Math.imul(value^(value>>>7),61|value))^value;
    return ((value^(value>>>14))>>>0)/4294967296;
  };
  return {
    int(min,max){return Math.floor(next()*(max-min+1))+min},
    shuffle(values){
      const copy=[...values];
      for(let i=copy.length-1;i>0;i-=1){const j=Math.floor(next()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
      return copy;
    },
  };
}

function hashSeed(value){
  let hash=2166136261;
  for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return hash>>>0;
}
