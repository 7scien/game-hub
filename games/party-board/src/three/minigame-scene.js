import * as THREE from 'three';

const PLAYER_COLORS=[0xc9b8ff,0xb97852,0xffda56,0x70dfbc];

export class StarCatchScene{
  constructor({canvas,onReady,onScore,onError}){
    this.canvas=canvas;this.onScore=onScore;this.active=false;this.score=0;this.hitIndex=0;this.targets=[];
    this.pointer=new THREE.Vector2();this.raycaster=new THREE.Raycaster();this.clock=new THREE.Clock();
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.45));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    }catch(error){onError?.(error);return}
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x071326);this.scene.fog=new THREE.Fog(0x071326,10,23);
    this.camera=new THREE.PerspectiveCamera(46,1,.1,50);this.camera.position.set(0,7.5,10);this.camera.lookAt(0,0,-.6);
    this.buildArena();
    this.onPointer=event=>this.handlePointer(event);canvas.addEventListener('pointerdown',this.onPointer,{passive:true});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement||canvas);this.resize();
    this.renderer.setAnimationLoop(()=>this.tick());onReady?.();
  }

  buildArena(){
    const hemi=new THREE.HemisphereLight(0xb8e8ff,0x082033,2.7);
    const key=new THREE.DirectionalLight(0xfff0b5,4.2);key.position.set(-5,10,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    const rim=new THREE.PointLight(0x62ddff,18,18);rim.position.set(5,3,-4);this.scene.add(hemi,key,rim);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(11,.55,7.4),new THREE.MeshStandardMaterial({color:0x1d3942,roughness:.68,metalness:.12}));
    floor.position.y=-.35;floor.receiveShadow=true;this.scene.add(floor);
    const inset=new THREE.Mesh(new THREE.PlaneGeometry(9.8,6.2,1,1),new THREE.MeshStandardMaterial({color:0x14314a,roughness:.52,metalness:.2}));
    inset.rotation.x=-Math.PI/2;inset.position.y=-.065;inset.receiveShadow=true;this.scene.add(inset);
    const stripeMaterial=new THREE.MeshBasicMaterial({color:0x4bdad2,transparent:true,opacity:.28});
    for(let index=-2;index<=2;index+=1){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.035,.012,5.7),stripeMaterial);stripe.position.set(index*1.95,.01,0);this.scene.add(stripe)}
    const railMaterial=new THREE.MeshStandardMaterial({color:0x8b765c,roughness:.9});
    for(const z of [-3.45,3.45]){const rail=new THREE.Mesh(new THREE.BoxGeometry(11.6,.3,.22),railMaterial);rail.position.set(0,.28,z);rail.castShadow=true;this.scene.add(rail)}
    for(let index=0;index<4;index+=1)this.createPlayerTotem(index);
    for(let index=0;index<8;index+=1)this.createTarget(index);
    const title=this.createLabelTexture('STARLIGHT DOCK');
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.8,.72),new THREE.MeshBasicMaterial({map:title,transparent:true,depthWrite:false}));
    sign.position.set(0,2.3,-3.62);this.scene.add(sign);
  }

  createPlayerTotem(index){
    const material=new THREE.MeshStandardMaterial({color:PLAYER_COLORS[index],roughness:.58,emissive:PLAYER_COLORS[index],emissiveIntensity:.08,flatShading:true});
    const group=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.38,4,8),material);body.position.y=.35;body.castShadow=true;group.add(body);
    const x=index%2===0?-4.8:4.8,z=index<2?-2.65:2.65;group.position.set(x,0,z);this.scene.add(group);
  }

  createTarget(index){
    const group=new THREE.Group();
    const glowMaterial=new THREE.MeshStandardMaterial({color:0xffef87,emissive:0xff9f34,emissiveIntensity:1.7,roughness:.28,metalness:.1});
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.28,0),glowMaterial);core.castShadow=true;core.userData.target=group;group.add(core);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.39,.035,8,20),new THREE.MeshBasicMaterial({color:0xfff2a3,transparent:true,opacity:.7}));ring.rotation.x=Math.PI/2;ring.userData.target=group;group.add(ring);
    group.userData={index,phase:index*.83,core,ring,target:group};this.positionTarget(group,index);this.targets.push(group);this.scene.add(group);
  }

  positionTarget(group,seed){
    const column=seed%4,row=Math.floor(seed/4)%2;
    const drift=Math.sin((seed+this.hitIndex)*2.17)*.48;
    group.position.set(-3.3+column*2.2+drift,.48,-1.45+row*3+Math.cos(seed*1.31+this.hitIndex)*.35);
    group.scale.setScalar(1);group.visible=true;
  }

  setActive(active){this.active=Boolean(active);if(active){this.score=0;this.hitIndex=0;this.targets.forEach((target,index)=>this.positionTarget(target,index));this.onScore?.(0)}}

  handlePointer(event){
    if(!this.active||!this.renderer)return;
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1));
    this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.targets,true)[0];const target=hit?.object?.userData?.target;
    if(!target)return;
    this.score+=1;this.hitIndex+=1;target.scale.setScalar(.2);this.positionTarget(target,target.userData.index+this.hitIndex*3);this.onScore?.(this.score);
  }

  tick(){
    if(!this.renderer)return;const time=this.clock.getElapsedTime();
    for(const target of this.targets){target.position.y=.5+Math.sin(time*2.8+target.userData.phase)*.16;target.rotation.y=time*1.35+target.userData.phase;target.userData.ring.rotation.z=time*.9}
    this.camera.position.x=Math.sin(time*.18)*.22;this.camera.lookAt(0,.1,-.35);this.renderer.render(this.scene,this.camera);
  }

  resize(){
    if(!this.renderer)return;const rect=this.canvas.getBoundingClientRect();const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
  }

  createLabelTexture(text){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const context=canvas.getContext('2d');context.clearRect(0,0,1024,160);
    context.font='900 72px Nunito,system-ui';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#e8ffff';context.shadowColor='#31dcd5';context.shadowBlur=18;context.fillText(text,512,82);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }

  dispose(){
    this.resizeObserver?.disconnect();this.canvas?.removeEventListener('pointerdown',this.onPointer);this.renderer?.setAnimationLoop(null);
    this.scene?.traverse(object=>{object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){if(!material)continue;for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose?.()}});
    this.renderer?.dispose();
  }
}
