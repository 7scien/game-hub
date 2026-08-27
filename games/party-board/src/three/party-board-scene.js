import * as THREE from 'three';
import {buildBoardLayout,getBranchDirections,getLayoutPoint,getNodeDirection,getPlayerPoint} from './board-layout.js';
import {isFastMovement,movementStepDuration,stageDuration} from './movement-timing.js';

const TILE_STYLE={
  normal:{top:0x3284e6,base:0xe9f2f0,icon:''},
  special:{top:0x47c978,base:0xe9f2f0,icon:'!'},
  event:{top:0x38bd6c,base:0xe9f2f0,icon:'?'},
  trap:{top:0xef6262,base:0xe9f2f0,icon:'×'},
  shop:{top:0xf4c84d,base:0xe9f2f0,icon:'₩'},
  branch:{top:0x3284e6,base:0xe9f2f0,icon:''},
};

const CHARACTER_COLORS={ghost:0xc9b8ff,mole:0xb97852,chick:0xffda56,slime:0x70dfbc};
const Y_AXIS=new THREE.Vector3(0,1,0);

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
    this.cameraMode='follow';
    this.branchChoice=null;
    this.cameraInitialized=false;
    this.cameraLookTarget=new THREE.Vector3();
    this.cameraDesiredPosition=new THREE.Vector3();
    this.cameraDesiredLook=new THREE.Vector3();
    this.cameraQuaternion=new THREE.Quaternion();
    this.cameraMatrix=new THREE.Matrix4();
    this.cameraUp=new THREE.Vector3(0,1,0);
    this.arrivalFocusUntil=0;
    this.lastFrameTime=performance.now();
    this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,this.isCompactDevice()?1.25:1.6));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.02;
      this.renderer.shadowMap.enabled=true;
      this.renderer.shadowMap.type=THREE.PCFShadowMap;
    }catch(error){
      onError?.(error);
      return;
    }
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x91bccc);
    this.scene.fog=new THREE.FogExp2(0x91bccc,.012);
    this.camera=new THREE.PerspectiveCamera(48,1,.1,120);
    this.camera.position.set(0,4.2,7);
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
    const hemisphere=new THREE.HemisphereLight(0xe6f8ff,0x56705b,2.7);
    const key=new THREE.DirectionalLight(0xfff6d8,3.8);
    key.position.set(-8,19,11);
    key.castShadow=true;
    key.shadow.mapSize.set(this.isCompactDevice()?1024:1536,this.isCompactDevice()?1024:1536);
    key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
    const rim=new THREE.DirectionalLight(0x9edfff,1.1);
    rim.position.set(-13,8,-9);
    this.scene.add(hemisphere,key,rim);
  }

  addSkyDust(){
    const count=this.isCompactDevice()?32:54;
    const positions=new Float32Array(count*3);
    for(let index=0;index<count;index+=1){
      const angle=index*2.39996;
      const radius=15+(index%13)*.9;
      positions[index*3]=Math.cos(angle)*radius;
      positions[index*3+1]=5+(index%8)*.8;
      positions[index*3+2]=Math.sin(angle)*radius;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=new THREE.PointsMaterial({color:0xffffff,size:.16,transparent:true,opacity:.28,sizeAttenuation:true});
    this.skyDust=new THREE.Points(geometry,material);
    this.scene.add(this.skyDust);
  }

  setBoard(board){
    if(!this.renderer||!board?.spaces?.length)return;
    const signature=`${board.layoutVersion||'legacy'}:${board.seed||'board'}:${board.spaces.length}:${board.branches?.length||0}`;
    if(signature===this.boardSignature)return;
    this.boardSignature=signature;
    disposeChildren(this.boardGroup);
    this.tileMeshes=new Map();
    this.layout=buildBoardLayout(board);
    this.board=board;
    this.createTerrain();
    this.createRoadNetwork();
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
    this.cameraInitialized=false;
  }

  createTerrain(){
    const water=new THREE.Mesh(
      new THREE.PlaneGeometry(86,86),
      new THREE.MeshStandardMaterial({color:0x4f9abd,roughness:.36,metalness:.12}),
    );
    water.rotation.x=-Math.PI/2;
    water.position.y=-1.24;
    water.receiveShadow=true;
    this.boardGroup.add(water);
    const island=new THREE.Mesh(
      new THREE.BoxGeometry(41,1.35,41),
      new THREE.MeshStandardMaterial({color:0x526d61,roughness:1,flatShading:true}),
    );
    island.position.set(0,-.71,2.2);
    island.receiveShadow=true;
    island.castShadow=true;
    this.boardGroup.add(island);
    const islandTop=new THREE.Mesh(
      new THREE.BoxGeometry(40.2,.24,40.2),
      new THREE.MeshStandardMaterial({color:0x6da862,roughness:1,flatShading:true}),
    );
    islandTop.position.set(0,.02,2.2);
    islandTop.receiveShadow=true;
    this.boardGroup.add(islandTop);
    const lawnMaterial=new THREE.MeshStandardMaterial({color:0x79b866,roughness:1});
    const wallMaterial=new THREE.MeshStandardMaterial({color:0x71807b,roughness:.95,flatShading:true});
    for(const [x,z,width,depth] of [[-5.8,-4.1,8.1,6.5],[3.5,-4.2,6.2,6.2],[-4.1,4.65,10.7,4.15],[5.9,4.65,6.4,4.15]]){
      const lawn=new THREE.Mesh(new THREE.BoxGeometry(width,.22,depth),lawnMaterial);
      lawn.position.set(x,.16,z);lawn.receiveShadow=true;this.boardGroup.add(lawn);
      for(const [wallX,wallZ,wallW,wallD] of [[x,z-depth/2,width,.16],[x,z+depth/2,width,.16],[x-width/2,z,.16,depth],[x+width/2,z,.16,depth]]){
        const wall=new THREE.Mesh(new THREE.BoxGeometry(wallW,.48,wallD),wallMaterial);
        wall.position.set(wallX,.24,wallZ);wall.castShadow=true;wall.receiveShadow=true;this.boardGroup.add(wall);
      }
    }
    const shrubMaterial=new THREE.MeshStandardMaterial({color:0x337e45,roughness:1,flatShading:true});
    const trunkMaterial=new THREE.MeshStandardMaterial({color:0x775543,roughness:1});
    const plantSpots=[[-9.1,-3.9],[-6.5,-6],[-3.2,-2.9],[1.8,-6.1],[6,-3.4],[-8.1,4.6],[-4.6,5.4],[1.8,4.4],[7.4,4.2],[-7,10.7],[1.6,12.2],[9.9,11.8]];
    for(const [index,[x,z]] of plantSpots.entries()){
      if(index%3===0){
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,.62,6),trunkMaterial);
        trunk.position.set(x,.58,z);
        const crown=new THREE.Mesh(new THREE.DodecahedronGeometry(.48+(index%2)*.1,0),shrubMaterial);
        crown.position.set(x,1.15,z);trunk.castShadow=true;crown.castShadow=true;this.boardGroup.add(trunk,crown);
      }else{
        const shrub=new THREE.Mesh(new THREE.DodecahedronGeometry(.3+(index%2)*.08,0),shrubMaterial);
        shrub.scale.y=.72;shrub.position.set(x,.48,z);shrub.castShadow=true;this.boardGroup.add(shrub);
      }
    }
    const ruinMaterial=new THREE.MeshStandardMaterial({color:0x87928c,roughness:1,flatShading:true});
    for(const [x,z,height] of [[-1.8,-4.9,1.25],[.2,-4.9,.88],[5.2,-5.5,1.4],[-6.4,4.3,1.05]]){
      const ruin=new THREE.Mesh(new THREE.BoxGeometry(.7,height,.72),ruinMaterial);
      ruin.position.set(x,height/2+.25,z);ruin.rotation.y=(x+z)*.12;ruin.castShadow=true;this.boardGroup.add(ruin);
    }
  }

  createRoadNetwork(){
    this.routeCurves=new Map();
    const mainPoints=this.layout.mainPath.map(id=>vectorFromPoint(getLayoutPoint(this.layout,id)));
    const mainCurve=this.createRoad(mainPoints,{closed:true,branch:false});
    this.routeCurves.set('main',mainCurve);
    const junctionIds=new Set();
    for(const branch of this.layout.branchPaths){
      const ids=[branch.splitId,...branch.nodeIds,branch.mergeId];
      const points=ids.map(id=>vectorFromPoint(getLayoutPoint(this.layout,id)));
      const curve=this.createRoad(points,{closed:false,branch:true});
      this.routeCurves.set(branch.id,curve);
      for(const nodeId of [branch.splitId,branch.mergeId]){
        if(junctionIds.has(nodeId))continue;
        junctionIds.add(nodeId);
        this.createJunction(nodeId,branch.id);
      }
    }
  }

  createRoad(points,{closed,branch}){
    const curve=createRouteCurve(points,closed);
    const roadWidth=branch?2.05:2.3;
    const edge=new THREE.Mesh(
      createRoadGeometry(curve,{width:roadWidth+.34,thickness:.38,closed,segments:Math.max(points.length*8,36),verticalOffset:-.08}),
      new THREE.MeshStandardMaterial({color:0x66726f,roughness:.92,metalness:.02}),
    );
    const surface=new THREE.Mesh(
      createRoadGeometry(curve,{width:roadWidth,thickness:.1,closed,segments:Math.max(points.length*8,36),verticalOffset:.17}),
      new THREE.MeshStandardMaterial({color:branch?0xc1cbc5:0xcbd3cf,roughness:.88,metalness:.015}),
    );
    edge.castShadow=false;edge.receiveShadow=true;surface.receiveShadow=true;
    this.boardGroup.add(edge,surface);
    this.createPavingDetails(curve,{closed,count:Math.max(8,points.length*2),width:roadWidth,branch});
    return curve;
  }

  createPavingDetails(curve,{closed,count,width,branch}){
    const seamMaterial=new THREE.MeshBasicMaterial({color:branch?0x87958f:0x929e99,transparent:true,opacity:.58});
    const guideMaterial=new THREE.MeshBasicMaterial({color:0xf4f6e8,transparent:true,opacity:.82});
    const xAxis=new THREE.Vector3(1,0,0);
    for(let index=0;index<count;index+=1){
      const t=closed?index/count:(index+.4)/(count+.2);
      const point=curve.getPoint(t);
      const tangent=curve.getTangent(t).setY(0).normalize();
      const side=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      const seam=new THREE.Mesh(new THREE.BoxGeometry(width*.92,.018,.026),seamMaterial);
      seam.position.set(point.x,point.y+.235,point.z);
      seam.quaternion.setFromUnitVectors(xAxis,side);
      this.boardGroup.add(seam);
      if(index%8===4){
        const guide=new THREE.Mesh(new THREE.BoxGeometry(.055,.022,.42),guideMaterial);
        guide.position.set(point.x,point.y+.247,point.z);
        guide.rotation.y=Math.atan2(tangent.x,tangent.z);
        this.boardGroup.add(guide);
      }
    }
  }

  createJunction(nodeId,branchId){
    const point=getLayoutPoint(this.layout,nodeId);
    if(!point)return;
    const base=new THREE.Mesh(
      new THREE.CylinderGeometry(1.08,1.12,.25,12),
      new THREE.MeshStandardMaterial({color:0x66726f,roughness:.9,flatShading:true}),
    );
    base.position.set(point.x,point.y-.03,point.z);
    const top=new THREE.Mesh(
      new THREE.CylinderGeometry(.99,.99,.1,12),
      new THREE.MeshStandardMaterial({color:0xcbd3cf,roughness:.88,flatShading:true}),
    );
    top.position.set(point.x,point.y+.13,point.z);
    base.castShadow=true;base.receiveShadow=true;top.receiveShadow=true;
    this.boardGroup.add(base,top);
    const directions=getBranchDirections(this.layout,branchId);
    if(!directions)return;
    const bisector=new THREE.Vector3(directions.main.x+directions.branch.x,0,directions.main.z+directions.branch.z).normalize();
    const roadside=new THREE.Vector3(-bisector.z,0,bisector.x).multiplyScalar(.82);
    const postOrigin=new THREE.Vector3(point.x+roadside.x,point.y,point.z+roadside.z);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,.72,6),new THREE.MeshStandardMaterial({color:0x655044,roughness:1}));
    post.position.set(postOrigin.x,point.y+.58,postOrigin.z);
    const signMaterial=new THREE.MeshStandardMaterial({color:0xf1e9b0,emissive:0x726427,emissiveIntensity:.18,roughness:.8});
    for(const [direction,height] of [[directions.main,.75],[directions.branch,.55]]){
      const sign=new THREE.Mesh(new THREE.BoxGeometry(.46,.14,.09),signMaterial);
      sign.position.set(postOrigin.x+direction.x*.18,point.y+height,postOrigin.z+direction.z*.18);
      sign.rotation.y=Math.atan2(direction.x,direction.z);
      this.boardGroup.add(sign);
    }
    this.boardGroup.add(post);
  }

  createTile(node){
    const point=getLayoutPoint(this.layout,node.id);
    if(!point)return;
    const style=TILE_STYLE[node.kind]||TILE_STYLE.branch;
    const radius=.42;
    const group=new THREE.Group();
    group.position.set(point.x,point.y,point.z);
    const base=new THREE.Mesh(
      new THREE.CylinderGeometry(radius+.095,radius+.115,.18,18),
      new THREE.MeshStandardMaterial({color:style.base,roughness:.75,flatShading:true}),
    );
    base.position.y=.13;base.castShadow=false;base.receiveShadow=true;
    const topMaterial=new THREE.MeshStandardMaterial({color:style.top,roughness:.44,metalness:.04,emissive:style.top,emissiveIntensity:.055});
    const top=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.1,20),topMaterial);
    top.position.y=.26;top.castShadow=false;top.receiveShadow=true;
    group.add(base,top);
    if(style.icon){
      const sprite=makeIconSprite(style.icon,node.kind==='trap'?'#fff4f7':'#172442');
      sprite.position.y=.78;
      sprite.scale.set(.56,.56,.56);
      group.add(sprite);
    }
    if(node.kind==='trap'){
      const spikeMaterial=new THREE.MeshStandardMaterial({color:0xffd6df,roughness:.7});
      for(let index=0;index<3;index+=1){
        const spike=new THREE.Mesh(new THREE.ConeGeometry(.065,.2,5),spikeMaterial);
        const angle=index/3*Math.PI*2;
        spike.position.set(Math.cos(angle)*.22,.48,Math.sin(angle)*.22);
        group.add(spike);
      }
    }
    if(node.kind==='shop'){
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.14,0),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffc84f,emissiveIntensity:1.8}));
      gem.position.y=.68;gem.castShadow=true;group.add(gem);
    }
    if(node.id==='r0'){
      const startRing=new THREE.Mesh(new THREE.TorusGeometry(radius+.12,.055,8,24),new THREE.MeshBasicMaterial({color:0xffef82}));
      startRing.rotation.x=Math.PI/2;startRing.position.y=.36;group.add(startRing);
    }
    group.userData.nodeId=node.id;
    group.userData.topMaterial=topMaterial;
    this.tileMeshes.set(node.id,group);
    this.boardGroup.add(group);
  }

  createSplitMarker(branch){
    const point=getLayoutPoint(this.layout,branch.splitId);
    if(!point)return;
    const material=new THREE.MeshStandardMaterial({color:0xffef91,emissive:0xb7942e,emissiveIntensity:.8});
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
      const direction=getNodeDirection(this.layout,root.userData.nodeId);
      root.userData.forward=new THREE.Vector3(direction.x,0,direction.z).normalize();
      if(!this.motion||this.motion.playerId!==id)root.rotation.y=Math.atan2(direction.x,direction.z);
      if(this.motion?.playerId!==id)root.position.copy(root.userData.basePosition);
      root.userData.activeRing.visible=id===this.activePlayerId;
    }
    for(const [id,root] of this.characters){
      if(seen.has(id))continue;
      this.characterGroup.remove(root);disposeObject(root);this.characters.delete(id);
    }
    this.highlightNode(players.find(player=>(player.id||player.userId||player.user_id)===this.activePlayerId)?.positionId||null);
    if(!this.cameraInitialized&&this.activePlayerId)this.updateCamera(performance.now(),1/60,true);
  }

  setActivePlayer(playerId){
    const firstSelection=!this.activePlayerId;
    this.activePlayerId=playerId;
    for(const [id,root] of this.characters)root.userData.activeRing.visible=id===playerId;
    const player=this.players.find(candidate=>(candidate.id||candidate.userId||candidate.user_id)===playerId);
    if(player)this.highlightNode(player.positionId||'r0');
    if(firstSelection)this.cameraInitialized=false;
  }

  setBranchChoice(branch){
    this.branchChoice=branch?.id?branch:null;
  }

  setCameraMode(mode){
    const next=mode==='overview'?'overview':'follow';
    if(next===this.cameraMode)return;
    this.cameraMode=next;
    this.cameraInitialized=false;
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
      const splinePoints=[root.userData.basePosition.clone(),...points.map(point=>point.vector.clone())];
      this.motion={
        playerId,root,player,points,totalSteps,reward,onStage,resolve,
        fast:isFastMovement(totalSteps),segmentIndex:0,
        curve:createMotionCurve(splinePoints),stage:'anticipation',stageStarted:performance.now(),effectShown:false,
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
      const curveProgress=(motion.segmentIndex+eased)/motion.points.length;
      motion.curve.getPoint(curveProgress,root.position);
      const tangent=motion.curve.getTangent(Math.min(.9999,curveProgress+.001)).setY(0).normalize();
      if(tangent.lengthSq()>.001){
        root.userData.forward.lerp(tangent,.22).normalize();
        smoothFacing(root,root.userData.forward,.24);
      }
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
    if(!cancelled)this.arrivalFocusUntil=performance.now()+1100;
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

  updateCamera(now,delta,snap=false){
    if(!this.camera||!this.layout)return;
    let targetFov=47;
    if(this.cameraMode==='overview'){
      this.cameraDesiredPosition.set(27,36,40);
      this.cameraDesiredLook.set(0,.1,2.4);
      targetFov=50;
    }else{
      const root=this.characters.get(this.activePlayerId)||this.characters.values().next().value;
      if(!root)return;
      const forward=(root.userData.forward||new THREE.Vector3(0,0,1)).clone().setY(0).normalize();
      if(this.branchChoice){
        const directions=getBranchDirections(this.layout,this.branchChoice.id);
        if(directions){
          const main=new THREE.Vector3(directions.main.x,0,directions.main.z);
          const branch=new THREE.Vector3(directions.branch.x,0,directions.branch.z);
          const viewDirection=main.add(branch).normalize();
          const split=vectorFromPoint(directions.split);
          this.cameraDesiredPosition.copy(split).addScaledVector(viewDirection,-5.6).addScaledVector(this.cameraUp,4.2);
          this.cameraDesiredLook.copy(split).addScaledVector(viewDirection,1.45).addScaledVector(this.cameraUp,.42);
          targetFov=50;
        }
      }else{
        const arriving=this.motion?.stage==='stop'||this.motion?.stage==='reaction'||now<this.arrivalFocusUntil;
        const running=this.motion?.fast&&this.motion.segmentIndex>=2&&this.motion.stage==='move';
        const distance=arriving?3.9:running?6.8:5.8;
        const height=arriving?2.65:running?4.05:3.5;
        const lookAhead=arriving ? .65 : running ? 2.2 : 1.35;
        this.cameraDesiredPosition.copy(root.position).addScaledVector(forward,-distance).addScaledVector(this.cameraUp,height);
        this.cameraDesiredLook.copy(root.position).addScaledVector(forward,lookAhead).addScaledVector(this.cameraUp,.48);
        targetFov=arriving?43:running?50:47;
      }
    }
    if(!this.cameraInitialized||snap){
      this.camera.position.copy(this.cameraDesiredPosition);
      this.cameraLookTarget.copy(this.cameraDesiredLook);
      this.camera.lookAt(this.cameraLookTarget);
      this.camera.fov=targetFov;
      this.camera.updateProjectionMatrix();
      this.cameraInitialized=true;
      return;
    }
    const positionAlpha=1-Math.exp(-4.6*delta);
    const lookAlpha=1-Math.exp(-6.2*delta);
    this.camera.position.lerp(this.cameraDesiredPosition,positionAlpha);
    this.cameraLookTarget.lerp(this.cameraDesiredLook,lookAlpha);
    this.cameraMatrix.lookAt(this.camera.position,this.cameraLookTarget,this.cameraUp);
    this.cameraQuaternion.setFromRotationMatrix(this.cameraMatrix);
    this.camera.quaternion.slerp(this.cameraQuaternion,lookAlpha);
    const nextFov=THREE.MathUtils.lerp(this.camera.fov,targetFov,positionAlpha);
    if(Math.abs(nextFov-this.camera.fov)>.001){this.camera.fov=nextFov;this.camera.updateProjectionMatrix()}
  }

  tick(time){
    if(!this.renderer)return;
    const delta=Math.min(.05,Math.max(.001,(time-this.lastFrameTime)/1000));
    this.lastFrameTime=time;
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
    this.updateCamera(time,delta);
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
    this.camera.aspect=width/height;
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

function createRouteCurve(points,closed=false){
  return new THREE.CatmullRomCurve3(points.map(point=>point.clone()),closed,'centripetal',.5);
}

function createMotionCurve(points){
  if(points.length===2)return new THREE.LineCurve3(points[0],points[1]);
  return createRouteCurve(points,false);
}

function createRoadGeometry(curve,{width,thickness,closed,segments,verticalOffset=0}){
  const positions=[];
  const indices=[];
  const sampleCount=closed?segments:segments+1;
  const side=new THREE.Vector3();
  for(let index=0;index<sampleCount;index+=1){
    const t=closed?index/segments:index/(sampleCount-1);
    const point=curve.getPoint(t);
    const tangent=curve.getTangent(t).setY(0).normalize();
    side.set(-tangent.z,0,tangent.x).normalize().multiplyScalar(width/2);
    const topY=point.y+verticalOffset+thickness/2;
    const bottomY=point.y+verticalOffset-thickness/2;
    positions.push(
      point.x+side.x,topY,point.z+side.z,
      point.x-side.x,topY,point.z-side.z,
      point.x+side.x,bottomY,point.z+side.z,
      point.x-side.x,bottomY,point.z-side.z,
    );
  }
  const spanCount=closed?sampleCount:sampleCount-1;
  for(let index=0;index<spanCount;index+=1){
    const next=(index+1)%sampleCount;
    const a=index*4;const b=next*4;
    indices.push(
      a,b,a+1,b,b+1,a+1,
      a+2,a+3,b+2,b+2,a+3,b+3,
      a,a+2,b,b,a+2,b+2,
      a+1,b+1,a+3,b+1,b+3,a+3,
    );
  }
  if(!closed){
    const first=0;const last=(sampleCount-1)*4;
    indices.push(first,first+1,first+2,first+1,first+3,first+2,last,last+2,last+1,last+1,last+2,last+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function vectorFromPoint(point){
  return new THREE.Vector3(point?.x||0,point?.y||0,point?.z||0);
}

function smoothFacing(root,direction,alpha){
  const target=root.userData.facingQuaternion||(root.userData.facingQuaternion=new THREE.Quaternion());
  target.setFromAxisAngle(Y_AXIS,Math.atan2(direction.x,direction.z));
  root.quaternion.slerp(target,alpha);
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
