import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const BOARD_W=1000;
const BOARD_H=650;
const WORLD_W=28;
const WORLD_D=18.2;
const SPACE_COLORS={
  blue:0x4ea8ff,red:0xf05a5b,item:0xc96de2,event:0x55d67b,trap:0x294c34,
  shop:0xf6c64f,star:0xffdf47,companion:0xf0a2ff,placedTrap:0x1f4a31,starTrap:0x8b397b,
};
const SPACE_ICONS={blue:'',red:'',item:'?',event:'!',trap:'♧',shop:'⌂',star:'★',companion:'✦',placedTrap:'♧',starTrap:'★'};
const TERRACES=[[-10,-6.5,7.2,4.2,.65,0x3f9c52],[8.4,-6,8.3,4.7,1.08,0x358f4d],[-8.7,5.8,7.3,4.1,.58,0x4bad60],[8.9,5.8,7.1,4.2,.72,0x3f9954],[0,-.3,7.4,4.5,.38,0x4fae5f]];

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function ease(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2}

function canvasTexture(text,{size=128,color='#fff',background='transparent',font='900 62px system-ui',stroke='#17351f'}={}){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);
  if(background!=='transparent'){ctx.fillStyle=background;ctx.beginPath();ctx.arc(size/2,size/2,size*.46,0,Math.PI*2);ctx.fill()}
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;ctx.lineJoin='round';
  if(stroke){ctx.lineWidth=Math.max(3,size*.045);ctx.strokeStyle=stroke;ctx.strokeText(text,size/2,size*.52)}
  ctx.fillStyle=color;ctx.fillText(text,size/2,size*.52);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

function roundedBoxGeometry(width,height,depth,radius=.18,segments=4){
  const shape=new THREE.Shape();const x=-width/2,y=-depth/2;
  shape.moveTo(x+radius,y);shape.lineTo(x+width-radius,y);shape.quadraticCurveTo(x+width,y,x+width,y+radius);
  shape.lineTo(x+width,y+depth-radius);shape.quadraticCurveTo(x+width,y+depth,x+width-radius,y+depth);
  shape.lineTo(x+radius,y+depth);shape.quadraticCurveTo(x,y+depth,x,y+depth-radius);shape.lineTo(x,y+radius);shape.quadraticCurveTo(x,y,x+radius,y);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelSegments:segments,steps:1,bevelSize:radius*.38,bevelThickness:radius*.38});
  geometry.rotateX(Math.PI/2);geometry.translate(0,height/2,0);return geometry;
}

function makeTextSprite(text,{color='#fff8c9',background='rgba(21,49,31,.9)',scale=[2.1,.62,1],font='900 48px system-ui'}={}){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=144;const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.roundRect(8,8,496,128,34);ctx.fill();ctx.strokeStyle='#ffe68a';ctx.lineWidth=7;ctx.stroke();ctx.fillStyle=color;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,74);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.SpriteMaterial({map,transparent:true,depthTest:false});const sprite=new THREE.Sprite(mat);sprite.scale.set(...scale);sprite.renderOrder=20;return sprite;
}

export function createForestParty3D({container,nodes,effectiveType,getState,getActiveIndex,onWebGLError}){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch(error){onWebGLError?.(error);return createFallback();}
  if(!renderer.getContext()){onWebGLError?.(new Error('WebGL context unavailable'));return createFallback()}

  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.className='forest-3d-canvas';renderer.domElement.setAttribute('aria-label','Forest Party 3D 숲속 보드');container.prepend(renderer.domElement);

  const scene=new THREE.Scene();scene.background=new THREE.Color(0x8ed9cf);scene.fog=new THREE.Fog(0xa8ded1,25,48);
  const camera=new THREE.PerspectiveCamera(43,1,.1,100);camera.position.set(0,21,21);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=13;controls.maxDistance=38;controls.minPolarAngle=.48;controls.maxPolarAngle=1.18;controls.target.set(0,0,0);
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};

  const hemi=new THREE.HemisphereLight(0xd9fff0,0x314025,2.25);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff4c9,3.1);sun.position.set(-10,24,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.bias=-.0006;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xaed8ff,.75);fill.position.set(14,8,-12);scene.add(fill);

  const root=new THREE.Group();scene.add(root);
  const terrainGroup=new THREE.Group(),pathGroup=new THREE.Group(),spaceGroup=new THREE.Group(),decorGroup=new THREE.Group(),characterGroup=new THREE.Group(),dynamicGroup=new THREE.Group();
  root.add(terrainGroup,pathGroup,spaceGroup,decorGroup,dynamicGroup,characterGroup);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const nodeMeshes=[],nodeLabels=[],playerModels=[],playerTargets=[],companionModels=new Map(),sceneryGroups=[];let startSign=null;
  const moving=new Map();let running=false,paused=false,frame=0,last=performance.now(),cameraMode='follow',movementActive=false,activePlayer=0,branchState=null,followFov=43;
  const overviewPosition=new THREE.Vector3(0,22.5,22.5),overviewTarget=new THREE.Vector3(0,0,-.2),cameraTarget=new THREE.Vector3(),desiredPosition=new THREE.Vector3(),desiredLook=new THREE.Vector3();
  const occlusionRaycaster=new THREE.Raycaster(),occlusionDirection=new THREE.Vector3();

  function worldPoint(nodeOrId){const n=typeof nodeOrId==='number'?nodes[nodeOrId]:nodeOrId;const x=(n.x/BOARD_W-.5)*WORLD_W,z=(n.y/BOARD_H-.5)*WORLD_D;return new THREE.Vector3(x,terrainHeight(x,z)+.56,z)}
  function terrainHeight(x,z){let lift=0;for(const [tx,tz,w,d,h] of TERRACES){if(Math.abs(x-tx)<=w/2-.18&&Math.abs(z-tz)<=d/2-.18)lift=Math.max(lift,h+.18)}return lift||.12+Math.sin(x*.24)*.08+Math.cos(z*.31)*.07+(z<-5?Math.max(0,(-z-5)*.035):0)}

  function material(color,roughness=.86){return new THREE.MeshStandardMaterial({color,roughness,metalness:.02})}
  function mesh(geometry,mat,{cast=false,receive=true}={}){const value=new THREE.Mesh(geometry,mat);value.castShadow=cast;value.receiveShadow=receive;return value}

  function buildTerrain(){
    const cliff=mesh(roundedBoxGeometry(30,1.05,20.2,.65,5),material(0x9a6b3e),{receive:true});cliff.position.y=-.72;terrainGroup.add(cliff);
    const grass=mesh(roundedBoxGeometry(29.2,.5,19.35,.58,5),material(0x43a85b),{receive:true});grass.position.y=-.13;terrainGroup.add(grass);
    TERRACES.forEach(([x,z,w,d,h,c])=>{const base=mesh(roundedBoxGeometry(w,h,d,.48,3),material(0x93613b));base.position.set(x,h/2-.08,z);const top=mesh(roundedBoxGeometry(w-.28,.2,d-.28,.4,3),material(c));top.position.set(x,h+.01,z);terrainGroup.add(base,top)});
    const water=mesh(new THREE.CylinderGeometry(2.25,2.5,.18,48),new THREE.MeshStandardMaterial({color:0x4fc7dc,roughness:.25,metalness:.05,transparent:true,opacity:.86}));water.scale.z=.62;water.position.set(10.5,.05,-1.2);terrainGroup.add(water);
  }

  function roadRibbon(start,end,width,color,yOffset=0){
    const flat=end.clone().sub(start);flat.y=0;if(flat.lengthSq()<.001)return null;const side=new THREE.Vector3(-flat.z,0,flat.x).normalize().multiplyScalar(width/2);
    const positions=new Float32Array([
      start.x+side.x,start.y+yOffset,start.z+side.z,start.x-side.x,start.y+yOffset,start.z-side.z,
      end.x+side.x,end.y+yOffset,end.z+side.z,end.x-side.x,end.y+yOffset,end.z-side.z,
    ]);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex([0,1,2,2,1,3]);geometry.computeVertexNormals();
    const path=mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.88,metalness:.01,side:THREE.DoubleSide}),{receive:true});path.userData.path=true;pathGroup.add(path);return path
  }

  function addMushroomBridge(start,end,index){
    const colors=[0xf06a62,0xffd45d,0x9b69cf];[.25,.5,.75].forEach((t,i)=>{const point=start.clone().lerp(end,t),ground=terrainHeight(point.x,point.z),capTop=point.y-.03,stemHeight=Math.max(.34,capTop-ground-.26);const group=new THREE.Group(),stem=mesh(new THREE.CylinderGeometry(.13,.2,stemHeight,8),material(0xffe8c7),{cast:true}),cap=mesh(new THREE.SphereGeometry(.53,14,8,0,Math.PI*2,0,Math.PI/2),material(colors[(index+i)%colors.length]),{cast:true});stem.position.y=ground+stemHeight/2;cap.position.y=capTop-.48;cap.scale.z=.88;group.add(stem,cap);pathGroup.add(group);group.position.set(point.x,0,point.z)});
    const direction=end.clone().sub(start);direction.y=0;const arrow=new THREE.Mesh(new THREE.ConeGeometry(.15,.42,3),material(0x7a4b28));arrow.position.copy(start.clone().lerp(end,.5));arrow.position.y+=.06;arrow.rotation.z=-Math.PI/2;arrow.rotation.y=-Math.atan2(direction.z,direction.x);pathGroup.add(arrow)
  }

  function addPathSegment(a,b,index){const start=worldPoint(a),end=worldPoint(b),heightGap=Math.abs(end.y-start.y);if(heightGap>.34){addMushroomBridge(start,end,index);return}roadRibbon(start,end,1.02,0x956f3d,-.07);roadRibbon(start,end,.78,index%5===0?0xf4d18c:0xedc983,0);
    const length=start.distanceTo(end);if(index%3===0&&length>1.25){const direction=end.clone().sub(start);direction.y=0;const arrow=new THREE.Mesh(new THREE.ConeGeometry(.14,.4,3),material(0x9a6a27));arrow.rotation.z=-Math.PI/2;arrow.rotation.y=-Math.atan2(direction.z,direction.x);arrow.position.copy(start.clone().lerp(end,.58));arrow.position.y+=.08;pathGroup.add(arrow)}
  }

  function buildPaths(){let i=0;const seen=new Set();nodes.forEach(a=>a.next.forEach(id=>{const b=nodes[id],key=`${a.id}-${b.id}`;if(seen.has(key))return;seen.add(key);addPathSegment(a,b,i++)}))}

  function makeSpace(node){const type='blue',outer=mesh(new THREE.CylinderGeometry(.46,.5,.2,28),material(0xffedbd),{cast:true});const top=mesh(new THREE.CylinderGeometry(.35,.37,.225,28),material(SPACE_COLORS[type]),{cast:true});top.position.y=.12;const group=new THREE.Group();group.position.copy(worldPoint(node));group.add(outer,top);outer.userData.nodeId=node.id;top.userData.nodeId=node.id;spaceGroup.add(group);nodeMeshes[node.id]={group,outer,top,type:null};return group}

  function refreshSpace(id,type){const record=nodeMeshes[id];if(!record||record.type===type)return;record.type=type;record.top.material.dispose();record.top.material=material(SPACE_COLORS[type]??0xd9d9d9);if(nodeLabels[id]){nodeLabels[id].material.map.dispose();nodeLabels[id].material.dispose();nodeLabels[id].removeFromParent();nodeLabels[id]=null}const icon=SPACE_ICONS[type];if(icon){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasTexture(icon,{size:96,font:type==='star'?'900 72px system-ui':'900 58px system-ui',color:type==='star'?'#fff7ad':'#fff'}),transparent:true,depthTest:false}));sprite.scale.set(.68,.68,1);sprite.position.set(0,.41,0);sprite.renderOrder=8;record.group.add(sprite);nodeLabels[id]=sprite}record.group.scale.setScalar(type==='star'?1.3:1)}

  function buildSpaces(){nodes.forEach(makeSpace);startSign=makeTextSprite('START',{scale:[1.65,.5,1],background:'rgba(91,55,19,.93)'});startSign.position.copy(worldPoint(0)).add(new THREE.Vector3(-.9,1.05,.55));decorGroup.add(startSign)}

  function routeDistance(x,z){let closest=Infinity;nodes.forEach(node=>{const p=worldPoint(node);closest=Math.min(closest,Math.hypot(x-p.x,z-p.z));node.next.forEach(id=>{const q=worldPoint(id),dx=q.x-p.x,dz=q.z-p.z,length=dx*dx+dz*dz||1,t=clamp(((x-p.x)*dx+(z-p.z)*dz)/length,0,1);closest=Math.min(closest,Math.hypot(x-(p.x+t*dx),z-(p.z+t*dz)))})});return closest}
  function makeTree({x,z,scale=1,color=0x3f9c50,trunk=0x79502d,purple=false}){if(routeDistance(x,z)<1.1)return null;const group=new THREE.Group();const trunkMesh=mesh(new THREE.CylinderGeometry(.24*scale,.34*scale,1.45*scale,7),material(trunk),{cast:true});trunkMesh.position.y=.72*scale;group.add(trunkMesh);const crownMat=material(purple?0x8c52b8:color);[[0,1.65,0],[-.42,1.48,.05],[.42,1.48,.03],[0,1.5,-.38]].forEach(([cx,cy,cz],i)=>{const crown=mesh(new THREE.DodecahedronGeometry((.65-(i%2)*.07)*scale,0),crownMat,{cast:true});crown.position.set(cx*scale,cy*scale,cz*scale);group.add(crown)});group.position.set(x,terrainHeight(x,z),z);group.userData.occlusionOpacity=1;group.traverse(object=>{if(object.isMesh){object.userData.sceneryGroup=group;object.material.transparent=true}});sceneryGroups.push(group);decorGroup.add(group);return group}

  function makeShop(nodeId){const pos=worldPoint(nodeId),group=new THREE.Group();const base=mesh(new THREE.BoxGeometry(1.35,.86,1.08),material(0xf3bb45),{cast:true});base.position.y=.48;const roof=mesh(new THREE.ConeGeometry(1.05,.78,4),material(0xd97834),{cast:true});roof.position.y=1.29;roof.rotation.y=Math.PI/4;const door=mesh(new THREE.BoxGeometry(.32,.55,.05),material(0x664321),{cast:true});door.position.set(.26,.32,.565);const windowMesh=mesh(new THREE.BoxGeometry(.34,.3,.05),material(0xa8e6ff,.3),{cast:true});windowMesh.position.set(-.34,.56,.566);const sign=makeTextSprite('SHOP',{scale:[1.35,.4,1],background:'rgba(102,66,25,.95)',font:'900 43px system-ui'});sign.position.set(0,1.75,.25);group.add(base,roof,door,windowMesh,sign);group.position.copy(pos).add(new THREE.Vector3(0,.1,-1.15));group.rotation.y=nodeId===44?-.5:.15;decorGroup.add(group)}

  function makeSign(nodeId){const n=nodes[nodeId],pos=worldPoint(n),group=new THREE.Group();const post=mesh(new THREE.CylinderGeometry(.07,.09,.92,6),material(0x714822),{cast:true});post.position.y=.46;group.add(post);n.next.forEach((toId,i)=>{const arrow=mesh(new THREE.BoxGeometry(.85,.23,.12),material(i?0xc27734:0xe2a64c),{cast:true});arrow.position.set(0,.9+i*.27,0);const to=worldPoint(toId),ang=Math.atan2(to.x-pos.x,to.z-pos.z);arrow.rotation.y=ang;const tip=mesh(new THREE.ConeGeometry(.17,.35,3),arrow.material,{cast:true});tip.position.set(Math.sin(ang)*.5,.9+i*.27,Math.cos(ang)*.5);tip.rotation.z=Math.PI/2;tip.rotation.y=ang;group.add(arrow,tip)});group.position.copy(pos).add(new THREE.Vector3(.68,0,.2));decorGroup.add(group)}

  function buildDecor(){
    makeTree({x:-13.25,z:-8.1,scale:1.18,purple:true,trunk:0x35415a});makeTree({x:-13.2,z:8.05,scale:1.28,color:0x54ae55});
    const trees=[[-13.5,-4.6,.82],[-13.4,-.5,.76],[-13.5,3.6,.8],[-10.1,-8.2,.74],[-6.8,-8.25,.68],[-3.5,-8.3,.73],[.1,-8.3,.66],[3.8,-8.25,.72],[7.1,-8.2,.7],[10.6,-8,.74],[13.45,-5.8,.72],[13.5,-2.4,.68],[13.5,1.2,.7],[13.4,4.8,.76],[10.8,8.05,.78],[7.2,8.25,.7],[3.8,8.25,.72],[.2,8.3,.7],[-3.5,8.25,.68],[-7,8.25,.73],[-10.4,8.1,.76]];
    trees.forEach(([x,z,s],i)=>makeTree({x,z,scale:s,color:i%3===0?0x2f8050:i%3===1?0x4aa35a:0x347849}));
    [21,30,44].forEach(makeShop);[10,11,43,46,55,57,64].forEach(makeSign);
    const rockGeo=new THREE.DodecahedronGeometry(.18,0),rockMat=material(0x819089);const rocks=new THREE.InstancedMesh(rockGeo,rockMat,30);rocks.castShadow=true;const dummy=new THREE.Object3D();for(let i=0;i<30;i++){const x=((i*7.31)%26)-13,z=((i*4.77)%16)-8;dummy.position.set(x,terrainHeight(x,z)+.13,z);dummy.scale.setScalar(.65+(i%4)*.2);dummy.rotation.set(i*.3,i*.8,0);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix)}decorGroup.add(rocks);
    const flowerGeo=new THREE.ConeGeometry(.09,.26,5),flowerMat=material(0xffd1e6);const flowers=new THREE.InstancedMesh(flowerGeo,flowerMat,64);for(let i=0;i<64;i++){const x=((i*5.73)%25.5)-12.75,z=((i*8.91)%15.5)-7.75;dummy.position.set(x,terrainHeight(x,z)+.14,z);dummy.rotation.y=i;dummy.scale.setScalar(.7+(i%3)*.18);dummy.updateMatrix();flowers.setMatrixAt(i,dummy.matrix)}decorGroup.add(flowers);
    const mushroomColors=[0xf15b5f,0xffd44f,0x8a5bc6];for(let i=0;i<16;i++){const group=new THREE.Group(),stem=mesh(new THREE.CylinderGeometry(.055,.075,.24,6),material(0xffe6bd),{cast:true}),cap=mesh(new THREE.SphereGeometry(.16,8,5,0,Math.PI*2,0,Math.PI/2),material(mushroomColors[i%3]),{cast:true});stem.position.y=.12;cap.position.y=.25;group.add(stem,cap);const x=((i*9.2)%24)-12,z=((i*5.1)%14)-7;group.position.set(x,terrainHeight(x,z),z);decorGroup.add(group)}
  }

  function limb(color,radius=.085,length=.58){const part=mesh(new THREE.CapsuleGeometry(radius,length,3,7),material(color),{cast:true});part.geometry.rotateZ(Math.PI/2);return part}
  function makeCharacter(index,color){const group=new THREE.Group(),cloth=new THREE.Color(color);const body=mesh(new THREE.CapsuleGeometry(.25,.56,5,10),material(cloth),{cast:true});body.position.y=.78;const head=mesh(new THREE.SphereGeometry(.31,14,10),material(0xffd7b5),{cast:true});head.position.y=1.46;const eyeMat=material(0x17231b);[-.11,.11].forEach(x=>{const eye=mesh(new THREE.SphereGeometry(.035,7,5),eyeMat);eye.position.set(x,1.5,.29);group.add(eye)});const leftArm=limb(cloth),rightArm=limb(cloth),leftLeg=limb(0x3a4552,.09,.5),rightLeg=limb(0x3a4552,.09,.5);leftArm.position.set(-.36,.95,0);rightArm.position.set(.36,.95,0);leftLeg.position.set(-.16,.28,0);rightLeg.position.set(.16,.28,0);group.add(body,head,leftArm,rightArm,leftLeg,rightLeg);
    if(index===0){const hat=mesh(new THREE.ConeGeometry(.36,.52,6),material(0xe84f5b),{cast:true});hat.position.y=1.86;hat.rotation.z=-.1;group.add(hat)}
    if(index===1){const cap=mesh(new THREE.CylinderGeometry(.35,.35,.18,12),material(0x3f8ee8),{cast:true});cap.position.y=1.74;const brim=mesh(new THREE.BoxGeometry(.38,.06,.35),cap.material,{cast:true});brim.position.set(0,1.69,.27);group.add(cap,brim)}
    if(index===2){const crown=mesh(new THREE.CylinderGeometry(.34,.38,.22,8),material(0xffd34e),{cast:true});crown.position.y=1.78;const leaf=mesh(new THREE.ConeGeometry(.11,.34,5),material(0x57a849),{cast:true});leaf.position.set(.2,2.02,0);leaf.rotation.z=-.5;group.add(crown,leaf)}
    if(index===3){const cap=mesh(new THREE.SphereGeometry(.46,12,8,0,Math.PI*2,0,Math.PI/2),material(0xa96be5),{cast:true});cap.position.y=1.73;const dotMat=material(0xffefcf);[-.23,.16].forEach(x=>{const dot=mesh(new THREE.SphereGeometry(.07,7,5),dotMat);dot.position.set(x,1.94,.25);group.add(dot)});group.add(cap)}
    const label=makeTextSprite(`P${index+1}`,{scale:[.95,.3,1],background:'rgba(18,35,25,.9)',font:'900 55px system-ui'});label.position.set(0,2.35,0);group.add(label);const ring=mesh(new THREE.TorusGeometry(.48,.055,8,24),material(0xfff18a));ring.rotation.x=Math.PI/2;ring.position.y=.12;ring.visible=false;group.add(ring);group.userData={index,leftArm,rightArm,leftLeg,rightLeg,ring,label,facing:new THREE.Vector3(0,0,1)};characterGroup.add(group);playerModels[index]=group;playerTargets[index]=new THREE.Vector3();return group}

  function makeCompanion(nodeId){const group=new THREE.Group(),body=mesh(new THREE.SphereGeometry(.27,10,7),material(0xf7b35c),{cast:true}),head=mesh(new THREE.SphereGeometry(.23,10,7),material(0xffc477),{cast:true});body.position.y=.4;head.position.set(0,.75,.02);const wingMat=material(0xbfefff);[-1,1].forEach(side=>{const wing=mesh(new THREE.SphereGeometry(.18,8,5),wingMat,{cast:true});wing.scale.set(.5,1.1,.18);wing.position.set(side*.28,.55,-.05);group.add(wing)});const glow=mesh(new THREE.TorusGeometry(.38,.035,7,20),material(0xffc8ff));glow.rotation.x=Math.PI/2;glow.position.y=.12;group.add(body,head,glow);group.position.copy(worldPoint(nodeId));dynamicGroup.add(group);companionModels.set(nodeId,group)}

  function buildCharacters(){for(let i=0;i<4;i++)makeCharacter(i,['#ff646f','#55a8ff','#ffd34e','#b782ff'][i])}

  function effective(state,id){if(state.starSpace===id)return'star';if(state.companionSpaces?.some(s=>s.nodeId===id))return'companion';return state.board?.nodeOverrides?.[id]?.type||effectiveType(id)}
  function sameNodeOffsets(state,index){const same=state.players.map((p,i)=>p.position===state.players[index].position?i:-1).filter(i=>i>=0),slot=same.indexOf(index),angle=same.length===1?0:slot/same.length*Math.PI*2;return new THREE.Vector3(Math.sin(angle)*.68,0,Math.cos(angle)*.68)}
  function sync(state=getState?.(),nextActive=getActiveIndex?.()??0){if(!state)return;const activeChanged=activePlayer!==nextActive;activePlayer=nextActive;nodes.forEach(n=>refreshSpace(n.id,effective(state,n.id)));state.players.forEach((player,i)=>{if(!moving.has(i)){const target=worldPoint(player.position).add(sameNodeOffsets(state,i));playerModels[i].position.copy(target);playerTargets[i].copy(target)}playerModels[i].userData.ring.visible=i===activePlayer;playerModels[i].userData.label.visible=cameraMode==='overview'||i===activePlayer});if(startSign)startSign.visible=cameraMode==='overview';if(activeChanged&&!moving.has(activePlayer)){const player=state.players[activePlayer],nextId=nodes[player.position]?.next?.[0];if(Number.isInteger(nextId)){const direction=worldPoint(nextId).sub(worldPoint(player.position));direction.y=0;if(direction.lengthSq())playerModels[activePlayer].userData.facing.copy(direction.normalize())}}const wanted=new Set((state.companionSpaces||[]).map(s=>s.nodeId));for(const [id,model] of companionModels){if(!wanted.has(id)){model.removeFromParent();companionModels.delete(id)}}wanted.forEach(id=>{if(!companionModels.has(id))makeCompanion(id)})}

  function animateStep(index,fromId,toId,{fast=false,reduced=false}={}){const model=playerModels[index],start=worldPoint(fromId).clone(),end=worldPoint(toId).clone(),heightGap=Math.abs(end.y-start.y),direction=end.clone().sub(start);direction.y=0;if(direction.lengthSq())direction.normalize();model.userData.facing.copy(direction);const duration=reduced?20:fast?145:heightGap>.34?560:430,startTime=performance.now();moving.set(index,{start,end,startTime,duration,direction,hop:heightGap>.34?.78:.16});movementActive=true;setCameraMode('follow');return new Promise(resolve=>moving.get(index).resolve=resolve)}

  function updateMoves(now){for(const [index,motion] of moving){const model=playerModels[index],raw=clamp((now-motion.startTime)/motion.duration,0,1),t=ease(raw),hop=Math.sin(t*Math.PI)*motion.hop;model.position.lerpVectors(motion.start,motion.end,t);model.position.y+=hop;model.rotation.y=Math.atan2(motion.direction.x,motion.direction.z);const swing=Math.sin(raw*Math.PI*5)*.68;model.userData.leftArm.rotation.z=swing;model.userData.rightArm.rotation.z=-swing;model.userData.leftLeg.rotation.z=-swing;model.userData.rightLeg.rotation.z=swing;if(raw>=1){model.position.copy(motion.end);model.userData.leftArm.rotation.z=model.userData.rightArm.rotation.z=model.userData.leftLeg.rotation.z=model.userData.rightLeg.rotation.z=0;moving.delete(index);motion.resolve?.()}}movementActive=moving.size>0}

  function setCameraMode(mode){cameraMode=mode==='follow'?'follow':'overview';controls.enabled=cameraMode==='overview';container.dataset.cameraMode=cameraMode;updateCameraButtons()}
  function updateCameraButtons(){container.querySelectorAll('[data-camera]').forEach(button=>button.classList.toggle('active',button.dataset.camera===cameraMode))}
  function updateCamera(delta){if(cameraMode==='overview'){controls.enabled=true;controls.update();camera.fov+=(followFov-camera.fov)*.08;camera.updateProjectionMatrix();return}controls.enabled=false;const model=playerModels[activePlayer];if(!model)return;let facing=model.userData.facing.lengthSq()?model.userData.facing:new THREE.Vector3(0,0,1),height=3.55,distance=5.8,lookAhead=2.55,targetFov=followFov;if(branchState){const from=worldPoint(branchState.from),center=branchState.options.reduce((sum,id)=>sum.add(worldPoint(id)),new THREE.Vector3()).multiplyScalar(1/branchState.options.length);facing=center.sub(from);facing.y=0;if(facing.lengthSq())facing.normalize();height=5.15;distance=7.4;lookAhead=3.6;targetFov=Math.max(followFov,50)}desiredLook.copy(model.position).add(new THREE.Vector3(0,1.05,0)).addScaledVector(facing,lookAhead);desiredPosition.copy(model.position).add(new THREE.Vector3(0,height,0)).addScaledVector(facing,-distance);desiredPosition.y=Math.max(desiredPosition.y,3);const factor=1-Math.pow(.001,Math.min(.05,delta));camera.position.lerp(desiredPosition,factor);cameraTarget.lerp(desiredLook,factor);camera.fov+=(targetFov-camera.fov)*factor;camera.updateProjectionMatrix();camera.lookAt(cameraTarget)}

  function updateSceneryOcclusion(){const model=playerModels[activePlayer];if(!model)return;const targets=[model.position.clone().add(new THREE.Vector3(0,1.05,0))];if(branchState)branchState.options.forEach(id=>targets.push(worldPoint(id).add(new THREE.Vector3(0,.55,0))));const faded=new Set();targets.forEach(target=>{occlusionDirection.copy(target).sub(camera.position);const distance=occlusionDirection.length();if(distance<.1)return;occlusionRaycaster.set(camera.position,occlusionDirection.normalize());occlusionRaycaster.near=0;occlusionRaycaster.far=distance-.25;occlusionRaycaster.intersectObjects(sceneryGroups,true).forEach(hit=>{const group=hit.object.userData.sceneryGroup;if(group)faded.add(group)})});sceneryGroups.forEach(group=>{const close=group.position.distanceTo(camera.position)<2.5,target=faded.has(group)||close?.1:1;group.userData.occlusionOpacity+=(target-group.userData.occlusionOpacity)*.2;group.traverse(object=>{if(!object.isMesh)return;object.material.opacity=group.userData.occlusionOpacity;object.material.depthWrite=group.userData.occlusionOpacity>.45})})}

  function projectNode(id){const rect=container.getBoundingClientRect(),v=worldPoint(id).add(new THREE.Vector3(0,.9,0)).project(camera);return{x:(v.x*.5+.5)*rect.width,y:(-.5*v.y+.5)*rect.height,visible:v.z>-1&&v.z<1}}
  function setBranchChoice(from,options,onChoose){clearBranchChoice();setCameraMode('follow');branchState={from,options,onChoose};options.forEach((id,index)=>{const button=document.createElement('button');button.type='button';button.className=`branch-option-3d branch-${index}`;button.dataset.branchNode=String(id);button.textContent=directionName(from,id);button.addEventListener('click',event=>{event.stopPropagation();onChoose(id)});container.append(button)});options.forEach(id=>{nodeMeshes[id].group.userData.branchScale=1.32})}
  function clearBranchChoice(){container.querySelectorAll('.branch-option-3d').forEach(el=>el.remove());if(branchState)branchState.options.forEach(id=>{if(nodeMeshes[id])nodeMeshes[id].group.userData.branchScale=1});branchState=null}
  function directionName(fromId,toId){const a=nodes[fromId],b=nodes[toId],dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)>Math.abs(dy))return dx>0?'오른쪽 길':'왼쪽 길';return dy>0?'아래쪽 길':'위쪽 길'}
  function updateBranchButtons(now){if(!branchState)return;branchState.options.forEach((id,index)=>{const button=container.querySelector(`[data-branch-node="${id}"]`),point=projectNode(id);if(button){button.style.left=`${point.x}px`;button.style.top=`${point.y}px`;button.hidden=!point.visible}const pulse=1.16+Math.sin(now*.008+index)*.12;nodeMeshes[id].group.scale.setScalar(pulse)})}
  function pickNode(clientX,clientY){const rect=renderer.domElement.getBoundingClientRect();pointer.x=((clientX-rect.left)/rect.width)*2-1;pointer.y=-((clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(spaceGroup.children,true);return hits.find(hit=>Number.isInteger(hit.object.userData.nodeId))?.object.userData.nodeId??null}
  function screenPoint(id){const p=projectNode(id),rect=container.getBoundingClientRect();return{x:rect.left+p.x,y:rect.top+p.y}}

  function resetOverview(){camera.position.copy(overviewPosition);controls.target.copy(overviewTarget);cameraTarget.copy(overviewTarget);controls.update()}
  function resize(){const rect=container.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;followFov=width/height<1.35?52:43;if(cameraMode==='overview')camera.fov=followFov;camera.updateProjectionMatrix()}
  function render(now){if(!running)return;frame=requestAnimationFrame(render);if(paused)return;const delta=Math.min(.05,(now-last)/1000||.016);last=now;updateMoves(now);sync();updateCamera(delta);updateSceneryOcclusion();updateBranchButtons(now);for(const [i,model] of companionModels)model.position.y=worldPoint(i).y+Math.sin(now*.004+i)*.12;renderer.render(scene,camera)}
  function start(){if(running)return;running=true;last=performance.now();frame=requestAnimationFrame(render)}
  function stop(){running=false;cancelAnimationFrame(frame)}
  function setPaused(value){paused=!!value;if(!paused)last=performance.now()}
  function setVisible(value){renderer.domElement.style.visibility=value?'visible':'hidden';setPaused(!value)}
  function dispose(){stop();controls.dispose();renderer.dispose();renderer.domElement.remove()}

  buildTerrain();buildPaths();buildSpaces();buildDecor();buildCharacters();resetOverview();setCameraMode('follow');resize();start();
  return{available:true,renderer,scene,camera,controls,sync,animateStep,setCameraMode,getCameraMode:()=>cameraMode,setBranchChoice,clearBranchChoice,pickNode,screenPoint,resize,start,stop,setPaused,setVisible,dispose,diagnostics:()=>({spaces:nodeMeshes.length,players:playerModels.length,shops:3,branches:7,renderer:renderer.capabilities.isWebGL2?'WebGL2':'WebGL1'}),returnToOverview(){setCameraMode('overview');resetOverview()},followActive(){setCameraMode('follow')}}
}

function createFallback(){return{available:false,sync(){},animateStep(){return Promise.resolve()},setCameraMode(){},getCameraMode(){return'follow'},setBranchChoice(){},clearBranchChoice(){},pickNode(){return null},screenPoint(){return null},resize(){},start(){},stop(){},setPaused(){},setVisible(){},dispose(){},diagnostics:()=>({spaces:0,players:0,shops:0,branches:0,renderer:'unavailable'}),returnToOverview(){},followActive(){}}}
