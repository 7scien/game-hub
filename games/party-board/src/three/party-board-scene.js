import * as THREE from 'three';
import {buildBoardLayout,getLayoutPoint,getPlayerPoint} from './board-layout.js';
import {isFastMovement,movementStepDuration,stageDuration} from './movement-timing.js';

const TILE_STYLE={
  normal:{top:0x78a9dd,base:0x315584,icon:''},
  special:{top:0x72e4c3,base:0x257d72,icon:'!'},
  event:{top:0xad8bf4,base:0x6045a5,icon:'?'},
  trap:{top:0xff738f,base:0x9b2d53,icon:'×'},
  shop:{top:0xffd45f,base:0xa66d24,icon:'₩'},
  branch:{top:0x69d5ef,base:0x236a8e,icon:''},
};

const CHARACTER_COLORS={ghost:0xc9b8ff,mole:0xb97852,chick:0xffda56,slime:0x70dfbc};

export class PartyBoardScene{
  constructor({canvas,onReady,onStage,onError}){
    this.canvas=canvas;
    this.onStage=onStage;
    this.onError=onError;
    this.players=[];
    this.characters=new Map();
    this.effects=[];
    this.activePlayerId=null;
    this.motion=null;
    this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,this.isCompactDevice()?1.25:1.6));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.08;
      this.renderer.shadowMap.enabled=true;
      this.renderer.shadowMap.type=THREE.PCFShadowMap;
    }catch(error){
      onError?.(error);
      return;
    }
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x09152e);
    this.scene.fog=new THREE.FogExp2(0x09152e,.018);
    this.camera=new THREE.OrthographicCamera(-13,13,10,-10,.1,100);
    this.camera.position.set(18,20,22);
    this.camera.lookAt(0,0,0);
    this.boardGroup=new THREE.Group();
    this.characterGroup=new THREE.Group();
    this.effectGroup=new THREE.Group();
    this.scene.add(this.boardGroup,this.characterGroup,this.effectGroup);
    this.addLighting();
    this.addSkyDust();
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas.parentElement||canvas);
    this.resize();
    this.renderer.setAnimationLoop(time=>this.tick(time));
    onReady?.();
  }

  isCompactDevice(){
    return Math.min(globalThis.innerWidth||1024,globalThis.innerHeight||768)<700;
  }

  addLighting(){
    const hemisphere=new THREE.HemisphereLight(0xb9d9ff,0x1b1738,2.35);
    const key=new THREE.DirectionalLight(0xffefcf,3.4);
    key.position.set(8,18,11);
    key.castShadow=true;
    key.shadow.mapSize.set(this.isCompactDevice()?1024:1536,this.isCompactDevice()?1024:1536);
    key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
    const rim=new THREE.DirectionalLight(0x6fe4ff,1.45);
    rim.position.set(-13,8,-9);
    this.scene.add(hemisphere,key,rim);
  }

  addSkyDust(){
    const count=this.isCompactDevice()?90:150;
    const positions=new Float32Array(count*3);
    for(let index=0;index<count;index+=1){
      const angle=index*2.39996;
      const radius=13+(index%17)*.85;
      positions[index*3]=Math.cos(angle)*radius;
      positions[index*3+1]=4+(index%11)*.72;
      positions[index*3+2]=Math.sin(angle)*radius;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=new THREE.PointsMaterial({color:0xaeefff,size:.09,transparent:true,opacity:.62,sizeAttenuation:true});
    this.skyDust=new THREE.Points(geometry,material);
    this.scene.add(this.skyDust);
  }

  setBoard(board){
    if(!this.renderer||!board?.spaces?.length)return;
    const signature=`${board.seed||'board'}:${board.spaces.length}:${board.branches?.length||0}`;
    if(signature===this.boardSignature)return;
    this.boardSignature=signature;
    disposeChildren(this.boardGroup);
    this.tileMeshes=new Map();
    this.layout=buildBoardLayout(board);
    this.board=board;
    this.createTerrain();
    this.createConnectors();
    for(const space of board.spaces)this.createTile(space);
    for(const branch of board.branches||[]){
      for(const node of branch.nodes)this.createTile(node);
      this.createSplitMarker(branch);
    }
    this.landingRing=new THREE.Mesh(
      new THREE.TorusGeometry(.58,.075,8,28),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false}),
    );
    this.landingRing.rotation.x=Math.PI/2;
    this.landingRing.visible=false;
    this.boardGroup.add(this.landingRing);
    if(this.players.length)this.setPlayers(this.players);
  }

  createTerrain(){
    const water=new THREE.Mesh(
      new THREE.CylinderGeometry(17.5,18.4,.45,48),
      new THREE.MeshStandardMaterial({color:0x123c62,roughness:.46,metalness:.24}),
    );
    water.position.y=-1.35;
    water.receiveShadow=true;
    this.boardGroup.add(water);
    const island=new THREE.Mesh(
      new THREE.CylinderGeometry(8.1,9.6,1.25,12),
      new THREE.MeshStandardMaterial({color:0x2c8c78,roughness:.93,flatShading:true}),
    );
    island.position.y=-.83;
    island.receiveShadow=true;
    island.castShadow=true;
    this.boardGroup.add(island);
    const islandTop=new THREE.Mesh(
      new THREE.CylinderGeometry(7.6,8.1,.28,12),
      new THREE.MeshStandardMaterial({color:0x5fbc78,roughness:1,flatShading:true}),
    );
    islandTop.position.y=-.08;
    islandTop.receiveShadow=true;
    this.boardGroup.add(islandTop);
    for(let index=0;index<10;index+=1){
      const angle=index/10*Math.PI*2+.28;
      const radius=2.65+(index%3)*.45;
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.55,6),new THREE.MeshStandardMaterial({color:0x815239,roughness:1}));
      trunk.position.set(Math.cos(angle)*radius,.32,Math.sin(angle)*radius);
      const crown=new THREE.Mesh(new THREE.ConeGeometry(.46,.95,7),new THREE.MeshStandardMaterial({color:index%2?0x57c69b:0x43a985,roughness:.9,flatShading:true}));
      crown.position.copy(trunk.position);crown.position.y=.95;
      trunk.castShadow=true;crown.castShadow=true;
      this.boardGroup.add(trunk,crown);
    }
    const beacon=new THREE.Mesh(
      new THREE.OctahedronGeometry(.72,0),
      new THREE.MeshStandardMaterial({color:0xffe06e,emissive:0x8a5d16,emissiveIntensity:1.4,roughness:.35,flatShading:true}),
    );
    beacon.position.y=1.16;
    beacon.castShadow=true;
    beacon.userData.beacon=true;
    this.boardGroup.add(beacon);
  }

  createConnectors(){
    const mainMaterial=new THREE.MeshStandardMaterial({color:0x254d78,roughness:.7,metalness:.12});
    const branchMaterial=new THREE.MeshStandardMaterial({color:0x1e7898,emissive:0x0d4055,emissiveIntensity:.7,roughness:.62});
    const main=this.layout.mainPath;
    for(let index=0;index<main.length;index+=1)this.createConnector(main[index],main[(index+1)%main.length],mainMaterial,.25);
    for(const branch of this.layout.branchPaths){
      const ids=[branch.splitId,...branch.nodeIds,branch.mergeId];
      for(let index=0;index<ids.length-1;index+=1)this.createConnector(ids[index],ids[index+1],branchMaterial,.17);
    }
  }

  createConnector(fromId,toId,material,width){
    const from=getLayoutPoint(this.layout,fromId);
    const to=getLayoutPoint(this.layout,toId);
    if(!from||!to)return;
    const dx=to.x-from.x;const dz=to.z-from.z;
    const distance=Math.hypot(dx,dz);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(distance,.1,width),material);
    mesh.position.set((from.x+to.x)/2,Math.min(from.y,to.y)-.05,(from.z+to.z)/2);
    mesh.rotation.y=-Math.atan2(dz,dx);
    mesh.receiveShadow=true;
    this.boardGroup.add(mesh);
  }

  createTile(node){
    const point=getLayoutPoint(this.layout,node.id);
    if(!point)return;
    const style=TILE_STYLE[node.kind]||TILE_STYLE.branch;
    const branch=node.kind==='branch';
    const radius=branch ? .29 : .43;
    const group=new THREE.Group();
    group.position.set(point.x,point.y,point.z);
    const base=new THREE.Mesh(
      new THREE.CylinderGeometry(radius+.055,radius+.085,.28,branch?10:12),
      new THREE.MeshStandardMaterial({color:style.base,roughness:.75,flatShading:true}),
    );
    base.position.y=-.05;base.castShadow=true;base.receiveShadow=true;
    const topMaterial=new THREE.MeshStandardMaterial({color:style.top,roughness:.5,metalness:.08,emissive:style.top,emissiveIntensity:.08,flatShading:true});
    const top=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.15,branch?10:12),topMaterial);
    top.position.y=.13;top.castShadow=true;top.receiveShadow=true;
    group.add(base,top);
    if(style.icon){
      const sprite=makeIconSprite(style.icon,node.kind==='trap'?'#fff4f7':'#172442');
      sprite.position.y=.73;
      sprite.scale.set(.56,.56,.56);
      group.add(sprite);
    }
    if(node.kind==='trap'){
      const spikeMaterial=new THREE.MeshStandardMaterial({color:0xffd6df,roughness:.7});
      for(let index=0;index<3;index+=1){
        const spike=new THREE.Mesh(new THREE.ConeGeometry(.065,.2,5),spikeMaterial);
        const angle=index/3*Math.PI*2;
        spike.position.set(Math.cos(angle)*.22,.34,Math.sin(angle)*.22);
        group.add(spike);
      }
    }
    if(node.kind==='shop'){
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.14,0),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffc84f,emissiveIntensity:1.8}));
      gem.position.y=.57;gem.castShadow=true;group.add(gem);
    }
    if(node.id==='r0'){
      const startRing=new THREE.Mesh(new THREE.TorusGeometry(radius+.12,.055,8,24),new THREE.MeshBasicMaterial({color:0xffef82}));
      startRing.rotation.x=Math.PI/2;startRing.position.y=.24;group.add(startRing);
    }
    group.userData.nodeId=node.id;
    group.userData.topMaterial=topMaterial;
    this.tileMeshes.set(node.id,group);
    this.boardGroup.add(group);
  }

  createSplitMarker(branch){
    const point=getLayoutPoint(this.layout,branch.splitId);
    if(!point)return;
    const material=new THREE.MeshStandardMaterial({color:0x8ef3ff,emissive:0x2a98b2,emissiveIntensity:1.4});
    const marker=new THREE.Mesh(new THREE.TorusGeometry(.58,.055,7,20),material);
    marker.position.set(point.x,point.y+.28,point.z);
    marker.rotation.x=Math.PI/2;
    marker.userData.splitMarker=true;
    this.boardGroup.add(marker);
  }

  setPlayers(players=[]){
    this.players=players;
    if(!this.layout)return;
    const seen=new Set();
    for(const player of players){
      const id=player.id||player.userId||player.user_id;
      if(!id)continue;
      seen.add(id);
      let root=this.characters.get(id);
      if(root&&root.userData.character!==player.character){
        this.characterGroup.remove(root);disposeObject(root);this.characters.delete(id);root=null;
      }
      if(!root){
        root=createCharacter(player.character||'slime');
        root.userData.character=player.character||'slime';
        root.userData.playerId=id;
        this.characterGroup.add(root);
        this.characters.set(id,root);
      }
      root.userData.player={...player,id};
      root.userData.nodeId=player.positionId||'r0';
      const point=getPlayerPoint(this.layout,root.userData.nodeId,player.seat);
      root.userData.basePosition=new THREE.Vector3(point.x,point.y,point.z);
      if(this.motion?.playerId!==id)root.position.copy(root.userData.basePosition);
      root.userData.activeRing.visible=id===this.activePlayerId;
    }
    for(const [id,root] of this.characters){
      if(seen.has(id))continue;
      this.characterGroup.remove(root);disposeObject(root);this.characters.delete(id);
    }
    this.highlightNode(players.find(player=>(player.id||player.userId||player.user_id)===this.activePlayerId)?.positionId||null);
  }

  setActivePlayer(playerId){
    this.activePlayerId=playerId;
    for(const [id,root] of this.characters)root.userData.activeRing.visible=id===playerId;
    const player=this.players.find(candidate=>(candidate.id||candidate.userId||candidate.user_id)===playerId);
    if(player)this.highlightNode(player.positionId||'r0');
  }

  highlightNode(nodeId){
    const point=getLayoutPoint(this.layout,nodeId);
    if(!this.landingRing||!point){if(this.landingRing)this.landingRing.visible=false;return}
    this.landingRing.position.set(point.x,point.y+.29,point.z);
    this.landingRing.visible=true;
    this.highlightedNodeId=nodeId;
  }

  playMovement({playerId,path=[],totalSteps=path.length,reward=null,onStage}){
    const root=this.characters.get(playerId);
    if(!root||!this.layout||!path.length)return Promise.resolve({playerId,nodeId:root?.userData.nodeId||null});
    if(this.motion)this.finishMotion(true);
    return new Promise(resolve=>{
      const player=root.userData.player;
      const points=path.map(nodeId=>{
        const point=getPlayerPoint(this.layout,nodeId,player.seat);
        return {nodeId,vector:new THREE.Vector3(point.x,point.y,point.z)};
      });
      this.motion={
        playerId,root,player,points,totalSteps,reward,onStage,resolve,
        fast:isFastMovement(totalSteps),segmentIndex:0,
        segmentStart:root.position.clone(),stage:'anticipation',stageStarted:performance.now(),effectShown:false,
      };
      this.setMotionStage('anticipation');
    });
  }

  setMotionStage(stage){
    if(!this.motion)return;
    this.motion.stage=stage;
    this.motion.stageStarted=performance.now();
    this.motion.onStage?.(stage,{fast:this.motion.fast});
    this.onStage?.(stage,{fast:this.motion.fast});
  }

  updateMotion(now){
    const motion=this.motion;
    if(!motion)return;
    const {root}=motion;
    const body=root.userData.body;
    const elapsed=now-motion.stageStarted;
    if(motion.stage==='anticipation'){
      const progress=clamp01(elapsed/stageDuration('anticipation',this.reducedMotion));
      root.position.copy(root.userData.basePosition);
      body.scale.set(1+progress*.1,1-progress*.16,1+progress*.1);
      if(progress>=1){body.scale.set(1,1,1);this.setMotionStage(motion.points.length<=2?'slow_down':'move')}
      return;
    }
    if(motion.stage==='move'||motion.stage==='slow_down'){
      const duration=movementStepDuration({totalSteps:motion.totalSteps,stepIndex:motion.segmentIndex,pathLength:motion.points.length,reducedMotion:this.reducedMotion});
      const progress=clamp01(elapsed/duration);
      const eased=easeInOut(progress);
      const target=motion.points[motion.segmentIndex];
      root.position.lerpVectors(motion.segmentStart,target.vector,eased);
      const dx=target.vector.x-motion.segmentStart.x;const dz=target.vector.z-motion.segmentStart.z;
      if(Math.abs(dx)+Math.abs(dz)>.001)root.rotation.y=Math.atan2(dx,dz);
      root.position.y+=movementHop(root.userData.character,progress,motion.fast);
      applyMovingShape(root,progress);
      if(progress>=1){
        root.position.copy(target.vector);
        root.userData.basePosition.copy(target.vector);
        root.userData.nodeId=target.nodeId;
        motion.segmentIndex+=1;
        body.scale.set(1,1,1);
        if(motion.segmentIndex>=motion.points.length){this.highlightNode(target.nodeId);this.setMotionStage('stop')}
        else{
          motion.segmentStart=target.vector.clone();
          const remaining=motion.points.length-motion.segmentIndex;
          this.setMotionStage(remaining<=2?'slow_down':'move');
        }
      }
      return;
    }
    if(motion.stage==='stop'){
      const progress=clamp01(elapsed/stageDuration('stop',this.reducedMotion));
      root.position.copy(root.userData.basePosition);
      body.scale.set(1+Math.sin(progress*Math.PI)*.08,1-Math.sin(progress*Math.PI)*.1,1+Math.sin(progress*Math.PI)*.08);
      if(progress>=1){body.scale.set(1,1,1);this.setMotionStage('reaction')}
      return;
    }
    if(motion.stage==='reaction'){
      if(!motion.effectShown&&motion.reward){this.triggerEffect(motion.playerId,motion.reward);motion.effectShown=true}
      const progress=clamp01(elapsed/stageDuration('reaction',this.reducedMotion));
      root.position.copy(root.userData.basePosition);
      root.position.y+=Math.sin(progress*Math.PI*2)*.12*(1-progress);
      body.rotation.z=Math.sin(progress*Math.PI*4)*.12*(1-progress);
      if(progress>=1)this.finishMotion(false);
    }
  }

  finishMotion(cancelled){
    const motion=this.motion;
    if(!motion)return;
    motion.root.userData.body.scale.set(1,1,1);
    motion.root.userData.body.rotation.set(0,0,0);
    motion.root.position.copy(motion.root.userData.basePosition);
    this.motion=null;
    motion.onStage?.('idle',{fast:false});
    this.onStage?.('idle',{fast:false});
    motion.resolve({playerId:motion.playerId,nodeId:motion.root.userData.nodeId,cancelled});
  }

  triggerEffect(playerId,type='coin'){
    const root=this.characters.get(playerId);
    if(!root)return;
    const effect=type==='shield'?createShieldEffect():createRewardEffect(type);
    effect.playerId=playerId;
    effect.started=performance.now();
    this.effectGroup.add(effect.group);
    this.effects.push(effect);
  }

  updateEffects(now){
    for(let index=this.effects.length-1;index>=0;index-=1){
      const effect=this.effects[index];
      const root=this.characters.get(effect.playerId);
      if(!root){this.removeEffect(index);continue}
      const progress=clamp01((now-effect.started)/effect.duration);
      effect.group.position.copy(root.position);
      if(effect.type==='shield'){
        effect.group.position.y+=.58;
        if(progress<.46){
          effect.shell.visible=true;
          effect.shell.scale.setScalar(.72+Math.sin(progress*Math.PI*5)*.06+progress*.35);
          effect.shell.material.opacity=.72;
        }else{
          effect.shell.visible=false;
          const burst=(progress-.46)/.54;
          effect.shards.forEach((shard,shardIndex)=>{
            const velocity=shard.userData.velocity;
            shard.position.set(velocity.x*burst,velocity.y*burst-.25*burst*burst,velocity.z*burst);
            shard.rotation.x=burst*(shardIndex+2);shard.rotation.z=burst*(shardIndex+1.4);
            shard.material.opacity=1-burst;
          });
        }
      }else{
        effect.group.position.y+=.75+easeOut(progress)*1.05;
        effect.group.rotation.y=progress*Math.PI*3;
        const scale=progress<.2?progress/.2:1;
        effect.group.scale.setScalar(scale*(1-progress*.18));
        effect.materials.forEach(material=>{material.opacity=progress>.72?(1-progress)/.28:1});
      }
      if(progress>=1)this.removeEffect(index);
    }
  }

  removeEffect(index){
    const [effect]=this.effects.splice(index,1);
    if(!effect)return;
    this.effectGroup.remove(effect.group);disposeObject(effect.group);
  }

  tick(time){
    if(!this.renderer)return;
    const seconds=time*.001;
    if(this.skyDust)this.skyDust.rotation.y=seconds*.014;
    const beacon=this.boardGroup.children.find(child=>child.userData.beacon);
    if(beacon){beacon.rotation.y=seconds*.8;beacon.position.y=1.16+Math.sin(seconds*1.8)*.12}
    for(const [id,root] of this.characters){
      if(this.motion?.playerId===id)continue;
      applyIdle(root,seconds,this.reducedMotion);
    }
    this.updateMotion(time);
    this.updateEffects(time);
    if(this.landingRing?.visible){
      this.landingRing.rotation.z=seconds*.5;
      this.landingRing.material.opacity=.62+Math.sin(seconds*3.5)*.26;
    }
    for(const child of this.boardGroup.children){
      if(child.userData.splitMarker)child.material.emissiveIntensity=1.15+Math.sin(seconds*3+child.position.x)*.4;
    }
    this.renderer.render(this.scene,this.camera);
  }

  resize(){
    if(!this.renderer)return;
    const parent=this.canvas.parentElement||this.canvas;
    const width=Math.max(1,parent.clientWidth);
    const height=Math.max(1,parent.clientHeight);
    this.renderer.setSize(width,height,false);
    const aspect=width/height;
    const horizontal=Math.max(26,18*aspect);
    const vertical=horizontal/aspect;
    this.camera.left=-horizontal/2;this.camera.right=horizontal/2;
    this.camera.top=vertical/2;this.camera.bottom=-vertical/2;
    this.camera.updateProjectionMatrix();
  }

  dispose(){
    if(this.motion)this.finishMotion(true);
    this.renderer?.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    disposeObject(this.scene);
    this.renderer?.dispose();
  }
}

function createCharacter(type){
  const root=new THREE.Group();
  const body=new THREE.Group();
  root.userData.body=body;
  root.add(body);
  const color=CHARACTER_COLORS[type]||CHARACTER_COLORS.slime;
  const bodyMaterial=new THREE.MeshStandardMaterial({color,roughness:.62,flatShading:true});
  const darkMaterial=new THREE.MeshStandardMaterial({color:0x25304e,roughness:.8});
  const whiteMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7});
  if(type==='ghost'){
    const head=mesh(new THREE.SphereGeometry(.34,12,8),bodyMaterial,0,.27,0,.96,1.08,.96);
    const tail=mesh(new THREE.ConeGeometry(.31,.48,7),bodyMaterial,0,-.04,0,1,1,1);
    tail.rotation.z=Math.PI;
    body.add(head,tail);addEyes(head,darkMaterial,.14,.1,.29);
  }else if(type==='mole'){
    const torso=mesh(new THREE.SphereGeometry(.34,12,8),bodyMaterial,0,.18,0,1.03,.92,.92);
    const muzzleMaterial=new THREE.MeshStandardMaterial({color:0xf3a392,roughness:.75});
    const muzzle=mesh(new THREE.SphereGeometry(.12,10,7),muzzleMaterial,0,.14,.3,1.15,.75,.75);
    const earMaterial=new THREE.MeshStandardMaterial({color:0xf59b9a,roughness:.8});
    torso.add(mesh(new THREE.SphereGeometry(.105,9,6),earMaterial,-.25,.18,0,1,1,1),mesh(new THREE.SphereGeometry(.105,9,6),earMaterial,.25,.18,0,1,1,1));
    body.add(torso,muzzle);addEyes(torso,darkMaterial,.13,.1,.285);
  }else if(type==='chick'){
    const torso=mesh(new THREE.SphereGeometry(.32,12,8),bodyMaterial,0,.2,0,.95,1.05,.95);
    const beakMaterial=new THREE.MeshStandardMaterial({color:0xf28b39,roughness:.75});
    const beak=mesh(new THREE.ConeGeometry(.09,.22,4),beakMaterial,0,.13,.37,1,1,1);
    beak.rotation.x=Math.PI/2;
    const wingGeometry=new THREE.SphereGeometry(.12,9,6);
    torso.add(mesh(wingGeometry,bodyMaterial,-.3,.02,0,.65,1.2,.55),mesh(wingGeometry,bodyMaterial,.3,.02,0,.65,1.2,.55));
    body.add(torso,beak);addEyes(torso,darkMaterial,.12,.11,.29);
  }else{
    const torso=mesh(new THREE.SphereGeometry(.35,12,8),bodyMaterial,0,.15,0,1.12,.8,1.04);
    const blob=mesh(new THREE.SphereGeometry(.13,9,6),bodyMaterial,.19,.37,-.02,.8,1.2,.8);
    body.add(torso,blob);addEyes(torso,darkMaterial,.14,.08,.31);
  }
  const highlight=mesh(new THREE.SphereGeometry(.08,8,6),whiteMaterial,-.12,.43,.18,.8,.5,.35);
  body.add(highlight);
  root.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true}});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.43,.035,6,20),new THREE.MeshBasicMaterial({color:0xffeb77,transparent:true,opacity:.88}));
  ring.rotation.x=Math.PI/2;ring.position.y=-.48;ring.visible=false;
  root.userData.activeRing=ring;root.add(ring);
  root.scale.setScalar(.82);
  return root;
}

function addEyes(parent,material,x,y,z){
  const geometry=new THREE.SphereGeometry(.045,8,6);
  parent.add(mesh(geometry,material,-x,y,z,1,1.35,.6),mesh(geometry,material,x,y,z,1,1.35,.6));
}

function mesh(geometry,material,x,y,z,sx,sy,sz){
  const value=new THREE.Mesh(geometry,material);
  value.position.set(x,y,z);value.scale.set(sx,sy,sz);return value;
}

function applyIdle(root,time,reducedMotion){
  root.position.copy(root.userData.basePosition);
  const body=root.userData.body;
  body.scale.set(1,1,1);body.rotation.set(0,0,0);
  if(reducedMotion)return;
  const type=root.userData.character;
  if(type==='ghost')root.position.y+=.08+Math.sin(time*2.15+root.position.x)*.1;
  else if(type==='mole')root.position.y+=Math.max(0,Math.sin(time*4.5+root.position.z))*.055;
  else if(type==='chick'){root.position.y+=Math.abs(Math.sin(time*7.5))*.045;body.rotation.z=Math.sin(time*7.5)*.045}
  else{const pulse=Math.sin(time*3.8+root.position.x);body.scale.set(1+pulse*.045,1-pulse*.055,1+pulse*.045);root.position.y+=Math.max(0,pulse)*.045}
}

function applyMovingShape(root,progress){
  const body=root.userData.body;
  const type=root.userData.character;
  if(type==='slime')body.scale.set(1+Math.sin(progress*Math.PI*2)*.1,1-Math.sin(progress*Math.PI*2)*.12,1.04);
  else if(type==='chick')body.rotation.z=Math.sin(progress*Math.PI*4)*.1;
  else if(type==='mole')body.rotation.x=Math.sin(progress*Math.PI)*-.08;
  else body.rotation.z=Math.sin(progress*Math.PI*2)*.07;
}

function movementHop(type,progress,fast){
  const wave=Math.sin(progress*Math.PI);
  const multiplier=fast?.72:1;
  return ({ghost:.2,mole:.34,chick:.15,slime:.29}[type]||.2)*wave*multiplier;
}

function makeIconSprite(text,color){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d');
  context.clearRect(0,0,128,128);context.font='900 76px system-ui';context.textAlign='center';context.textBaseline='middle';
  context.shadowColor='rgba(255,255,255,.42)';context.shadowBlur=7;context.fillStyle=color;context.fillText(text,64,67);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
}

function createRewardEffect(type){
  const group=new THREE.Group();const materials=[];
  if(type==='star'){
    const material=new THREE.MeshStandardMaterial({color:0xffe26c,emissive:0xb56b18,emissiveIntensity:1.5,transparent:true,flatShading:true});
    group.add(new THREE.Mesh(new THREE.OctahedronGeometry(.27,0),material));materials.push(material);
  }else if(type==='item'){
    const material=new THREE.MeshStandardMaterial({color:0x84f1d1,emissive:0x176f67,emissiveIntensity:1,transparent:true,flatShading:true});
    const item=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,.34),material);item.rotation.set(.4,.3,.2);group.add(item);materials.push(material);
  }else{
    const material=new THREE.MeshStandardMaterial({color:0xffd354,emissive:0xb45a11,emissiveIntensity:1.25,metalness:.4,roughness:.35,transparent:true});
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.08,18),material);coin.rotation.x=Math.PI/2;group.add(coin);materials.push(material);
  }
  return {type,duration:1050,group,materials};
}

function createShieldEffect(){
  const group=new THREE.Group();
  const shellMaterial=new THREE.MeshBasicMaterial({color:0x85f3ff,transparent:true,opacity:.72,wireframe:true,depthWrite:false});
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(.52,1),shellMaterial);group.add(shell);
  const shards=[];
  for(let index=0;index<7;index+=1){
    const material=new THREE.MeshBasicMaterial({color:0xc4f8ff,transparent:true,opacity:1,depthWrite:false});
    const shard=new THREE.Mesh(new THREE.TetrahedronGeometry(.13,0),material);
    const angle=index/7*Math.PI*2;
    shard.userData.velocity=new THREE.Vector3(Math.cos(angle)*(1.1+index%2*.35),.65+(index%3)*.28,Math.sin(angle)*(1.1+index%2*.35));
    group.add(shard);shards.push(shard);
  }
  return {type:'shield',duration:1180,group,shell,shards};
}

function disposeChildren(group){
  for(const child of [...group.children]){group.remove(child);disposeObject(child)}
}

function disposeObject(object){
  object.traverse?.(child=>{
    child.geometry?.dispose?.();
    const materials=Array.isArray(child.material)?child.material:[child.material];
    for(const material of materials){
      if(!material)continue;
      for(const value of Object.values(material))if(value?.isTexture)value.dispose();
      material.dispose?.();
    }
  });
}

function clamp01(value){return Math.max(0,Math.min(1,value))}
function easeInOut(value){return value<.5?2*value*value:1-Math.pow(-2*value+2,2)/2}
function easeOut(value){return 1-Math.pow(1-value,3)}
