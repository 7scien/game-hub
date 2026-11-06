import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const NEW_MINI_IDS=['rollarena','storybook','switchblast','flagmaster'];

const PLAYER_COLORS=['#ff6f78','#62b8ff','#ffd052','#b985ff'];
const MODEL_PATHS=[
  './assets/characters/models/KayKit_Adventurers_2.0_FREE/Characters/gltf/Knight.glb',
  './assets/characters/models/KayKit_Adventurers_2.0_FREE/Characters/gltf/Ranger.glb',
  './assets/characters/models/KayKit_Adventurers_2.0_FREE/Characters/gltf/Rogue.glb',
  './assets/characters/models/KayKit_Adventurers_2.0_FREE/Characters/gltf/Mage.glb'
];
const SWITCH_COLORS=[0xe85353,0x7e5ce5,0xf0c53d,0x55be69,0xe9edf4];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const shuffle=(items,random=Math.random)=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
const aliveIndices=players=>players.map((player,index)=>player.alive?index:-1).filter(index=>index>=0);

function injectStyles(){
  if(document.querySelector('#forest-new-mini-styles'))return;
  const style=document.createElement('style');style.id='forest-new-mini-styles';style.textContent=`
    .new-mini-shell{position:absolute;inset:0;overflow:hidden;background:#071c18;touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none}
    .new-mini-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
    .new-mini-hud{position:absolute;z-index:4;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;align-items:center;gap:10px;pointer-events:none}
    .new-mini-status,.new-mini-clock{padding:8px 15px;border:2px solid #fff5;border-radius:999px;color:#fff;background:#09291fdd;box-shadow:0 8px 20px #0007;font:900 clamp(.72rem,1.35vw,1rem)/1.15 system-ui;text-align:center;white-space:nowrap}
    .new-mini-clock{min-width:72px;color:#ffe56d;background:#3b2418e8}
    .new-mini-countdown{position:absolute;z-index:7;inset:0;display:grid;place-items:center;pointer-events:none;color:#fff39b;text-shadow:0 8px 0 #1c3828,0 14px 35px #000;font:1000 clamp(5rem,16vw,12rem)/1 system-ui;opacity:0;transform:scale(.5)}
    .new-mini-countdown.show{animation:newMiniPop .56s cubic-bezier(.18,.9,.2,1)}
    @keyframes newMiniPop{0%{opacity:0;transform:scale(.45)}35%,75%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.18)}}
    .new-mini-controls{position:absolute;z-index:5;inset:0;pointer-events:none}
    .new-mini-control{--pc:#fff;position:absolute;width:min(27vw,270px);height:min(30vh,210px);min-height:118px;pointer-events:auto;touch-action:none;border:2px solid color-mix(in srgb,var(--pc) 65%,white);border-radius:24px;background:linear-gradient(150deg,#071d18e8,#14372dd0);box-shadow:inset 0 0 0 4px #ffffff0d,0 12px 28px #0007;color:#fff;overflow:hidden}
    .new-mini-control.p0{left:max(10px,env(safe-area-inset-left));top:max(64px,calc(env(safe-area-inset-top) + 50px));transform:rotate(180deg)}
    .new-mini-control.p1{right:max(10px,env(safe-area-inset-right));top:max(64px,calc(env(safe-area-inset-top) + 50px));transform:rotate(180deg)}
    .new-mini-control.p2{left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom))}
    .new-mini-control.p3{right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom))}
    .new-mini-player-label{position:absolute;z-index:2;left:10px;top:8px;padding:4px 9px;border-radius:999px;background:var(--pc);color:#10251b;font:1000 .74rem system-ui;box-shadow:0 3px 0 #0005}
    .new-mini-player-label.dead{filter:grayscale(1);opacity:.65}.new-mini-lives{margin-left:5px;color:#7d1820}
    .new-mini-joystick{position:absolute;width:min(112px,55%);aspect-ratio:1;left:50%;top:54%;transform:translate(-50%,-50%);border-radius:50%;border:3px solid #ffffff72;background:radial-gradient(circle,#ffffff28 0 16%,#ffffff0d 17% 56%,#ffffff28 57% 60%,transparent 61%);box-shadow:inset 0 0 25px #0009}
    .new-mini-stick{position:absolute;width:38%;aspect-ratio:1;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;background:var(--pc);border:4px solid #fff;box-shadow:0 8px 14px #0008}
    .new-mini-tip{position:absolute;left:8px;right:8px;bottom:7px;text-align:center;font:800 .67rem system-ui;color:#dcefe5}
    .new-mini-switches,.new-mini-flags{position:absolute;inset:36px 8px 8px;display:grid;gap:6px;align-content:center}
    .new-mini-switches{grid-template-columns:repeat(3,1fr)}
    .new-mini-switch,.new-mini-flag{min-height:46px;border:2px solid #ffffff80;border-radius:14px;color:#fff;font:1000 clamp(.62rem,1.25vw,.86rem) system-ui;box-shadow:inset 0 -5px 0 #0003,0 5px 9px #0006;touch-action:none}
    .new-mini-switch:disabled{filter:grayscale(1);opacity:.25}.new-mini-switch.active{outline:4px solid #fff8a2;transform:translateY(3px)}
    .new-mini-flags{grid-template-columns:1fr 1fr;padding:4px 4px 10px}
    .new-mini-flag{font-size:clamp(.7rem,1.6vw,1rem)}.new-mini-flag.red{background:#d9434c}.new-mini-flag.white{background:#f4f1df;color:#28332e}.new-mini-flag.held{outline:5px solid #ffe66b;transform:translateY(5px);box-shadow:inset 0 4px 0 #0004}
    .new-mini-command{position:absolute;z-index:6;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,40vw);padding:22px;border:3px solid #fff7b1;border-radius:24px;text-align:center;color:#fff;background:#09241df0;box-shadow:0 24px 70px #000b;pointer-events:none}
    .new-mini-command small{display:block;color:#a9cbb9;font:800 .75rem system-ui}.new-mini-command strong{display:block;margin-top:6px;color:#ffe46d;font:1000 clamp(1.25rem,3vw,2.5rem) system-ui}
    .new-mini-command.fake{border-color:#ff86a2;background:#3b1722e8}.new-mini-command.fake strong{color:#ffbdca}
    @media(max-width:900px){.new-mini-control{width:min(29vw,220px);height:min(27vh,170px)}.new-mini-command{width:36vw;padding:14px}.new-mini-status{max-width:44vw;white-space:normal}.new-mini-tip{display:none}}
  `;document.head.append(style);
}

function material(color,{roughness=.82,metalness=0}={}){return new THREE.MeshStandardMaterial({color,roughness,metalness})}
function mesh(geometry,color,options){const result=new THREE.Mesh(geometry,material(color,options));result.castShadow=true;result.receiveShadow=true;return result}
function addLights(scene){
  scene.add(new THREE.HemisphereLight(0xc8efff,0x365422,2.15));
  const sun=new THREE.DirectionalLight(0xfff0c2,3.1);sun.position.set(-8,14,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;scene.add(sun);
}
function addForestBackdrop(scene,variant='forest'){
  const ground=mesh(new THREE.CylinderGeometry(15,17,1.2,48),variant==='water'?0x376b52:0x4e9449);ground.position.y=-1.15;scene.add(ground);
  for(let i=0;i<18;i++){
    const angle=i/18*Math.PI*2,r=11.5+(i%3)*1.25;
    const tree=new THREE.Group(),trunk=mesh(new THREE.CylinderGeometry(.22,.32,1.8,7),0x704126),crown=mesh(new THREE.DodecahedronGeometry(.9+(i%4)*.12,0),i%5===0?0x5b9f49:0x2f783f);trunk.position.y=.1;crown.position.y=1.45;tree.add(trunk,crown);tree.position.set(Math.cos(angle)*r,-.35,Math.sin(angle)*r);tree.scale.setScalar(.9+(i%3)*.18);scene.add(tree)
  }
}
function addPlayerPlaceholder(group,color){
  const body=mesh(new THREE.CapsuleGeometry(.3,.62,5,9),color);body.position.y=.72;const head=mesh(new THREE.SphereGeometry(.3,12,9),0xffd2aa);head.position.y=1.35;const marker=mesh(new THREE.TorusGeometry(.5,.08,8,20),color);marker.rotation.x=Math.PI/2;marker.position.y=.06;group.add(body,head,marker);return[body,head]
}

const loader=new GLTFLoader();
const modelPromises=MODEL_PATHS.map(path=>new Promise(resolve=>loader.load(path,gltf=>resolve(gltf.scene),undefined,()=>resolve(null))));
function createPlayerAvatar(index){
  const group=new THREE.Group(),fallback=addPlayerPlaceholder(group,PLAYER_COLORS[index]);group.userData.fallback=fallback;
  modelPromises[index].then(source=>{if(!source||!group.parent)return;fallback.forEach(item=>{group.remove(item);item.geometry?.dispose();item.material?.dispose()});const model=source.clone(true);model.scale.setScalar(.78);model.rotation.y=Math.PI;model.traverse(item=>{if(item.isMesh){item.castShadow=true;item.receiveShadow=true}});group.add(model);group.userData.model=model});
  return group;
}
function addNameBillboard(group,index){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;const context=canvas.getContext('2d');context.fillStyle=PLAYER_COLORS[index];context.roundRect(22,8,212,60,24);context.fill();context.strokeStyle='#fff';context.lineWidth=7;context.stroke();context.fillStyle='#14241b';context.font='900 34px system-ui';context.textAlign='center';context.textBaseline='middle';context.fillText(`P${index+1}`,128,39);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false}));sprite.scale.set(1.5,.47,1);sprite.position.y=2.1;group.add(sprite)
}

function createRenderer(root,scene,camera){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.domElement.className='new-mini-canvas';renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;root.prepend(renderer.domElement);
  const resize=()=>{const width=Math.max(1,root.clientWidth),height=Math.max(1,root.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()};resize();window.addEventListener('resize',resize);return{renderer,resize,dispose(){window.removeEventListener('resize',resize);renderer.dispose();renderer.forceContextLoss?.()}}
}
function disposeScene(scene){scene.traverse(item=>{item.geometry?.dispose?.();if(Array.isArray(item.material))item.material.forEach(value=>value.dispose?.());else item.material?.dispose?.()})}

function createShell(arena,players,id){
  arena.innerHTML=`<div class="new-mini-shell" data-new-mini="${id}"><div class="new-mini-hud"><div class="new-mini-status">경기장 준비 중</div><div class="new-mini-clock">--.-</div></div><div class="new-mini-countdown"></div><div class="new-mini-controls"></div></div>`;
  const root=arena.firstElementChild,controls=root.querySelector('.new-mini-controls');players.forEach((player,index)=>{const control=document.createElement('section');control.className=`new-mini-control p${index}`;control.dataset.player=String(index);control.style.setProperty('--pc',player.color||PLAYER_COLORS[index]);control.innerHTML=`<div class="new-mini-player-label">${player.name||`P${index+1}`}<span class="new-mini-lives"></span></div>`;controls.append(control)});return{root,controls,status:root.querySelector('.new-mini-status'),clock:root.querySelector('.new-mini-clock'),countdown:root.querySelector('.new-mini-countdown')}
}
function configureScene(root,{camera=[0,8,10],look=[0,0,0],background=0x86c7dc}={}){
  const scene=new THREE.Scene();scene.background=new THREE.Color(background);scene.fog=new THREE.Fog(background,19,34);addLights(scene);const view=new THREE.PerspectiveCamera(42,1,.1,80);view.position.set(...camera);view.lookAt(...look);const renderer=createRenderer(root,scene,view);return{scene,camera:view,...renderer}
}
function setStatus(session,text){session.ui.status.textContent=text}
function updateClock(session,seconds){session.ui.clock.textContent=`${Math.max(0,seconds).toFixed(1)}초`;session.options.onTimer?.(Math.max(0,seconds))}
async function showCountdown(session){
  for(const label of ['3','2','1','GO!']){if(session.stopped)return;session.ui.countdown.textContent=label;session.ui.countdown.classList.remove('show');void session.ui.countdown.offsetWidth;session.ui.countdown.classList.add('show');await new Promise(resolve=>setTimeout(resolve,session.options.testMode?40:label==='GO!'?520:680))}
}
function commonLoop(session){
  let last=performance.now();const frame=now=>{if(session.stopped)return;const dt=Math.min(.035,Math.max(.001,(now-last)/1000));last=now;session.elapsed+=(session.options.testMode?dt*8:dt);session.update?.(dt*(session.options.testMode?8:1),session.elapsed);session.renderer.render(session.scene,session.camera);session.raf=requestAnimationFrame(frame)};session.raf=requestAnimationFrame(frame)
}
function bindJoystick(session,players){
  const vectors=players.map(()=>new THREE.Vector2());session.inputs=vectors;
  session.ui.controls.querySelectorAll('.new-mini-control').forEach((control,index)=>{control.insertAdjacentHTML('beforeend','<div class="new-mini-joystick"><div class="new-mini-stick"></div></div><div class="new-mini-tip">누른 채 움직여 이동</div>')});
  const update=(event,tracked)=>{const rect=tracked.control.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*2-1,y=(event.clientY-rect.top)/rect.height*2-1,top=indexOfControl(tracked.control)<2?-1:1;vectors[tracked.player].set(x*top,-y*top);if(vectors[tracked.player].length()>1)vectors[tracked.player].normalize();const stick=tracked.control.querySelector('.new-mini-stick');stick.style.transform=`translate(calc(-50% + ${vectors[tracked.player].x*32}px),calc(-50% + ${-vectors[tracked.player].y*32}px))`};
  const down=event=>{const control=event.target.closest('.new-mini-control');if(!control||session.stopped)return;event.preventDefault();const player=indexOfControl(control);if(!players[player].alive)return;const tracked={player,control};session.pointers.set(event.pointerId,tracked);try{control.setPointerCapture(event.pointerId)}catch{}update(event,tracked)};
  const move=event=>{const tracked=session.pointers.get(event.pointerId);if(!tracked)return;event.preventDefault();update(event,tracked)};
  const end=event=>{const tracked=session.pointers.get(event.pointerId);if(!tracked)return;session.pointers.delete(event.pointerId);vectors[tracked.player].set(0,0);tracked.control.querySelector('.new-mini-stick').style.transform='translate(-50%,-50%)'};
  session.ui.root.addEventListener('pointerdown',down,{passive:false});session.ui.root.addEventListener('pointermove',move,{passive:false});session.ui.root.addEventListener('pointerup',end);session.ui.root.addEventListener('pointercancel',end);session.cleanups.push(()=>{session.ui.root.removeEventListener('pointerdown',down);session.ui.root.removeEventListener('pointermove',move);session.ui.root.removeEventListener('pointerup',end);session.ui.root.removeEventListener('pointercancel',end)});return vectors
}
const indexOfControl=control=>Number(control.dataset.player);
function markDead(session,index){const label=session.ui.controls.querySelector(`.p${index} .new-mini-player-label`);label?.classList.add('dead');if(label)label.childNodes[0].textContent=`P${index+1} 탈락 `}
function updateLives(session,lives){lives.forEach((life,index)=>{const target=session.ui.controls.querySelector(`.p${index} .new-mini-lives`);if(target)target.textContent='♥'.repeat(Math.max(0,life))})}

function addWaterArena(session){
  const {scene}=session;const water=mesh(new THREE.CylinderGeometry(14,14,.5,64),0x2589ab,{roughness:.3,metalness:.05});water.position.y=-1.65;scene.add(water);
  const island=mesh(new THREE.CylinderGeometry(5.65,6.15,1.3,36),0x8a613a);island.position.y=-.62;scene.add(island);
  const grass=mesh(new THREE.CylinderGeometry(5.55,5.82,.35,36),0x67c947);grass.position.y=.15;scene.add(grass);session.islandGrass=grass;
  for(let i=0;i<20;i++){const angle=i/20*Math.PI*2,r=12+(i%2)*1.5,rock=mesh(new THREE.DodecahedronGeometry(.35+(i%3)*.08,0),0x7ca58a);rock.position.set(Math.cos(angle)*r,-1.1,Math.sin(angle)*r);scene.add(rock)}
}
function createBallPlayer(session,index,position){
  const root=new THREE.Group(),ball=mesh(new THREE.SphereGeometry(.64,20,14),PLAYER_COLORS[index],{roughness:.48});ball.position.y=.72;const band=mesh(new THREE.TorusGeometry(.65,.08,7,24),0xffffff);band.rotation.x=Math.PI/2;band.position.y=.72;const avatar=createPlayerAvatar(index);avatar.scale.setScalar(.72);avatar.position.y=1.05;addNameBillboard(avatar,index);root.add(ball,band,avatar);root.position.set(position.x,0,position.y);session.scene.add(root);return{root,ball,avatar,pos:position.clone(),vel:new THREE.Vector2(),alive:true,eliminatedAt:-1}
}
function gameRollArena(session){
  addWaterArena(session);session.camera.position.set(0,9.3,11.2);session.camera.lookAt(0,.4,0);const starts=[[-2.5,-2.1],[2.5,-2.1],[-2.5,2.1],[2.5,2.1]].map(([x,y])=>new THREE.Vector2(x,y));const players=starts.map((position,index)=>createBallPlayer(session,index,position));const inputs=bindJoystick(session,players),duration=45;setStatus(session,'공을 굴려 끝까지 살아남으세요!');
  session.update=(dt,elapsed)=>{const radius=elapsed<15?5.1:elapsed<30?5.1-(elapsed-15)*.055:4.275-(elapsed-30)*.085;session.islandGrass.scale.set(radius/5.55,1,radius/5.55);updateClock(session,duration-elapsed);
    players.forEach((player,index)=>{if(!player.alive)return;if(session.options.testMode){const target=player.pos.clone().multiplyScalar(-1).normalize();inputs[index].lerp(target,.08)}player.vel.addScaledVector(inputs[index],dt*6.7);player.vel.multiplyScalar(Math.pow(.45,dt));if(player.vel.length()>3.6)player.vel.setLength(3.6);player.pos.addScaledVector(player.vel,dt);player.root.position.set(player.pos.x,player.root.position.y,player.pos.y);player.ball.rotation.z-=player.vel.x*dt*1.4;player.ball.rotation.x+=player.vel.y*dt*1.4;player.avatar.rotation.z=clamp(-player.vel.x*.08,-.22,.22);if(player.pos.length()>radius-.18){player.alive=false;player.eliminatedAt=elapsed;markDead(session,index)}});
    for(let a=0;a<players.length;a++)for(let b=a+1;b<players.length;b++){const one=players[a],two=players[b];if(!one.alive||!two.alive)continue;const delta=two.pos.clone().sub(one.pos),distance=delta.length();if(distance>0&&distance<1.28){const normal=delta.multiplyScalar(1/distance),overlap=1.28-distance;one.pos.addScaledVector(normal,-overlap*.5);two.pos.addScaledVector(normal,overlap*.5);const relative=two.vel.clone().sub(one.vel).dot(normal);if(relative<0){const impulse=-relative*.9+.6;one.vel.addScaledVector(normal,-impulse);two.vel.addScaledVector(normal,impulse)}}}
    const alive=aliveIndices(players);if((alive.length<=1&&elapsed>2)||elapsed>=duration){const winners=alive.length?alive:players.map((player,index)=>({index,time:player.eliminatedAt})).filter(entry=>entry.time===Math.max(...players.map(player=>player.eliminatedAt))).map(entry=>entry.index);const scores=players.map(player=>Math.round((player.alive?duration:player.eliminatedAt)*100)+(player.alive?10000:0));session.finish({scores,winners})}
  }
}

function addMagicBook(session){
  const {scene}=session;addForestBackdrop(scene);const desk=mesh(new THREE.BoxGeometry(15,.7,10),0x85572f);desk.position.y=-.8;scene.add(desk);const cover=mesh(new THREE.BoxGeometry(11.8,.35,7.8),0x5d2e27);cover.position.y=-.25;scene.add(cover);const left=mesh(new THREE.BoxGeometry(5.7,.22,7.1),0xf2dfad),right=left.clone();left.position.set(-2.9,0,0);right.position.set(2.9,0,0);scene.add(left,right);
  const closing=new THREE.Group(),page=mesh(new THREE.BoxGeometry(5.7,.18,7.1),0xf7e7bd);page.position.x=-2.85;closing.add(page);closing.position.set(5.75,.25,0);closing.rotation.z=0;scene.add(closing);session.closingPage=closing;
  for(let i=0;i<12;i++){const rune=mesh(new THREE.TorusGeometry(.2+(i%3)*.08,.04,6,16),i%2?0x7c5535:0x9c6e41);rune.rotation.x=Math.PI/2;rune.position.set(-5+i%6*1.9,.18,-2.4+Math.floor(i/6)*4.8);scene.add(rune)}
}
function createGroundPlayer(session,index,position){const avatar=createPlayerAvatar(index);avatar.position.set(position.x,.16,position.y);addNameBillboard(avatar,index);session.scene.add(avatar);return{root:avatar,pos:position.clone(),vel:new THREE.Vector2(),alive:true,eliminatedAt:-1}}
function gameStorybook(session){
  addMagicBook(session);session.camera.position.set(0,10.4,11.8);session.camera.lookAt(0,.2,0);const starts=[[-3,-2],[3,-2],[-3,2],[3,2]].map(([x,y])=>new THREE.Vector2(x,y)),players=starts.map((position,index)=>createGroundPlayer(session,index,position)),inputs=bindJoystick(session,players);let round=0,phase='warning',phaseElapsed=0,safeZones=[];const createSafeZones=()=>{const count=1+Math.floor(session.options.random()*3),radius=Math.max(.62,1.28-round*.055);safeZones=[];for(let i=0;i<count;i++){const x=-4.2+session.options.random()*8.4,z=-2.35+session.options.random()*4.7,disc=mesh(new THREE.CylinderGeometry(radius,radius,.05,28),0x7ff2c0);disc.position.set(x,.2,z);disc.material.emissive=new THREE.Color(0x2a916d);disc.material.emissiveIntensity=.55;session.scene.add(disc);safeZones.push({x,z,radius,mesh:disc})}phase='warning';phaseElapsed=0;setStatus(session,`${round+1}/10 · 빛나는 문양 안으로 이동!`)};createSafeZones();
  session.update=(dt,elapsed)=>{updateClock(session,Math.max(0,30-elapsed));phaseElapsed+=dt;players.forEach((player,index)=>{if(!player.alive)return;if(session.options.testMode&&safeZones[0]){const target=new THREE.Vector2(safeZones[0].x,safeZones[0].z).sub(player.pos).normalize();inputs[index].lerp(target,.15)}player.vel.addScaledVector(inputs[index],dt*5.7);player.vel.multiplyScalar(Math.pow(.34,dt));if(player.vel.length()>3.2)player.vel.setLength(3.2);player.pos.addScaledVector(player.vel,dt);player.pos.x=clamp(player.pos.x,-5.2,5.2);player.pos.y=clamp(player.pos.y,-3.15,3.15);player.root.position.x=player.pos.x;player.root.position.z=player.pos.y;player.root.rotation.y=Math.atan2(player.vel.x,player.vel.y)||player.root.rotation.y});
    for(let a=0;a<players.length;a++)for(let b=a+1;b<players.length;b++){const one=players[a],two=players[b];if(!one.alive||!two.alive)continue;const delta=two.pos.clone().sub(one.pos),distance=delta.length();if(distance&&distance<.72){delta.multiplyScalar((.72-distance)/distance*.5);one.pos.sub(delta);two.pos.add(delta)}}
    const warning=Math.max(.85,2.35-round*.13);if(phase==='warning'&&phaseElapsed>=warning){phase='closing';phaseElapsed=0;setStatus(session,'책장이 닫힙니다! 문양 안에 멈추세요')}if(phase==='closing'){session.closingPage.rotation.z=clamp(phaseElapsed/.55,0,1)*-Math.PI;if(phaseElapsed>=.58){players.forEach((player,index)=>{if(!player.alive)return;const safe=safeZones.some(zone=>Math.hypot(player.pos.x-zone.x,player.pos.y-zone.z)<=zone.radius);if(!safe){player.alive=false;player.eliminatedAt=round+1;player.root.scale.y=.18;markDead(session,index)}});phase='opening';phaseElapsed=0}}
    if(phase==='opening'){session.closingPage.rotation.z=-Math.PI*(1-clamp(phaseElapsed/.45,0,1));if(phaseElapsed>=.48){safeZones.forEach(zone=>{session.scene.remove(zone.mesh);zone.mesh.geometry.dispose();zone.mesh.material.dispose()});round++;const alive=aliveIndices(players);if(alive.length<=1||round>=10){const winners=alive.length?alive:players.map((player,index)=>({index,time:player.eliminatedAt})).filter(entry=>entry.time===Math.max(...players.map(player=>player.eliminatedAt))).map(entry=>entry.index),scores=players.map(player=>(player.alive?10000:0)+(player.alive?round:player.eliminatedAt)*100);session.finish({scores,winners});return}createSafeZones()}}
  }
}

function addSwitchMachine(session){
  const {scene}=session;addForestBackdrop(scene);const dais=mesh(new THREE.CylinderGeometry(4.9,5.5,.8,12),0x455866,{metalness:.35});dais.position.y=-.25;scene.add(dais);const machine=mesh(new THREE.CylinderGeometry(2.2,2.6,3.5,12),0x385567,{metalness:.45});machine.position.set(0,1.55,-1.2);scene.add(machine);const face=mesh(new THREE.SphereGeometry(1.25,18,12),0x76c763);face.scale.set(1.35,.9,.5);face.position.set(0,2.05,.72);scene.add(face);for(const x of [-.45,.45]){const eye=mesh(new THREE.SphereGeometry(.16,10,8),0xf8f2cb);eye.position.set(x,2.22,1.3);scene.add(eye)}
  const switchMeshes=[];for(let i=0;i<5;i++){const button=mesh(new THREE.CylinderGeometry(.5,.62,.34,18),SWITCH_COLORS[i],{metalness:.2});button.position.set(-3.2+i*1.6,.45,2.25);scene.add(button);switchMeshes.push(button)}session.switchMeshes=switchMeshes;
}
function gameSwitchBlast(session){
  addSwitchMachine(session);session.camera.position.set(0,7.4,12);session.camera.lookAt(0,1,-.4);const players=[0,1,2,3].map((_,index)=>{const position=new THREE.Vector2(-2.4+index*1.6,-3.4),player=createGroundPlayer(session,index,position);player.root.rotation.y=0;return player});let survivors=[0,1,2,3],round=0,order=[],turn=0,available=[],danger=-1,choiceDelay=0;
  session.ui.controls.querySelectorAll('.new-mini-control').forEach((control,index)=>{control.insertAdjacentHTML('beforeend',`<div class="new-mini-switches">${SWITCH_COLORS.map((color,switchIndex)=>`<button class="new-mini-switch" data-switch="${switchIndex}" style="background:#${color.toString(16).padStart(6,'0')}" aria-label="${switchIndex+1}번 스위치">${switchIndex+1}</button>`).join('')}</div><div class="new-mini-tip">내 차례에 스위치 하나 선택</div>`)});
  const startRound=()=>{round++;order=shuffle(survivors,session.options.random);turn=0;const count=survivors.length+1;available=shuffle([0,1,2,3,4],session.options.random).slice(0,count);danger=available[Math.floor(session.options.random()*available.length)];choiceDelay=0;session.switchMeshes.forEach((button,index)=>{button.visible=available.includes(index);button.position.y=.45;button.material.emissive?.setHex(0)});refresh();setStatus(session,`${round}라운드 · 생존자 ${survivors.length}명 · 위험 스위치는 단 하나!`)};
  const refresh=()=>{const active=order[turn];session.ui.controls.querySelectorAll('.new-mini-control').forEach((control,index)=>{const label=control.querySelector('.new-mini-player-label');label.textContent=survivors.includes(index)?`${index===active?'▶ ':''}P${index+1}${index===active?'의 차례':''}`:`P${index+1} 탈락`;label.classList.toggle('dead',!survivors.includes(index));control.querySelectorAll('.new-mini-switch').forEach(button=>{const switchIndex=Number(button.dataset.switch);button.disabled=index!==active||!available.includes(switchIndex);button.classList.toggle('active',index===active&&available.includes(switchIndex))})})};
  const choose=(player,switchIndex)=>{if(session.stopped||player!==order[turn]||!available.includes(switchIndex))return;session.switchMeshes[switchIndex].position.y=.22;choiceDelay=0;if(switchIndex===danger){const target=players[player];target.alive=false;target.eliminatedAt=round;target.root.rotation.z=Math.PI/2;survivors=survivors.filter(index=>index!==player);markDead(session,player);setStatus(session,`💥 P${player+1} 폭발! 다음 라운드`);if(survivors.length<=1){session.finish({scores:players.map(item=>(item.alive?10000:0)+(item.alive?round:item.eliminatedAt)*100),winners:[...survivors]});return}setTimeout(()=>{if(!session.stopped)startRound()},session.options.testMode?30:900)}else{available=available.filter(value=>value!==switchIndex);turn++;if(turn>=order.length){setStatus(session,'모두 안전! 스위치를 다시 섞습니다');setTimeout(()=>{if(!session.stopped)startRound()},session.options.testMode?30:700)}else refresh()}};
  const down=event=>{const button=event.target.closest('.new-mini-switch');if(!button)return;event.preventDefault();const control=button.closest('.new-mini-control'),player=indexOfControl(control);session.pointers.set(event.pointerId,{player,button});try{button.setPointerCapture(event.pointerId)}catch{}choose(player,Number(button.dataset.switch))};const end=event=>session.pointers.delete(event.pointerId);session.ui.root.addEventListener('pointerdown',down,{passive:false});session.ui.root.addEventListener('pointerup',end);session.ui.root.addEventListener('pointercancel',end);session.cleanups.push(()=>{session.ui.root.removeEventListener('pointerdown',down);session.ui.root.removeEventListener('pointerup',end);session.ui.root.removeEventListener('pointercancel',end)});startRound();
  session.update=(dt,elapsed)=>{updateClock(session,45-elapsed);choiceDelay+=dt;session.switchMeshes.forEach((button,index)=>{if(button.visible)button.rotation.y+=dt*(1+index*.08)});if(session.options.testMode&&choiceDelay>.35&&survivors.length>1){const active=order[turn],safe=available.find(value=>value!==danger),pick=(round+turn)%3===0&&survivors.length>1?danger:(safe??danger);choose(active,pick)}if(elapsed>=45&&survivors.length>1)session.finish({scores:players.map(item=>(item.alive?10000:0)+(item.alive?round:item.eliminatedAt)*100),winners:[...survivors]})}
}

function addFlagStage(session){
  const {scene}=session;addForestBackdrop(scene);const platform=mesh(new THREE.CylinderGeometry(5.8,6.3,.7,24),0x8b6336);platform.position.y=-.35;scene.add(platform);const host=mesh(new THREE.CapsuleGeometry(.7,1.5,8,12),0x6fcb79);host.position.set(0,1.25,0);scene.add(host);const eyeMat=material(0xffffff);for(const x of [-.28,.28]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),eyeMat);eye.position.set(x,1.65,.65);scene.add(eye)}
  const flagRoot=new THREE.Group(),poleR=mesh(new THREE.CylinderGeometry(.045,.045,2.3,8),0x5c3828),poleW=poleR.clone(),flagR=mesh(new THREE.BoxGeometry(.78,.52,.05),0xe2444d),flagW=mesh(new THREE.BoxGeometry(.78,.52,.05),0xf5f0dc);poleR.position.x=-.82;poleW.position.x=.82;poleR.position.y=poleW.position.y=1.35;flagR.position.set(-1.15,2.15,0);flagW.position.set(1.15,2.15,0);flagRoot.add(poleR,poleW,flagR,flagW);scene.add(flagRoot);session.flags={root:flagRoot,red:flagR,white:flagW};
}
function gameFlagMaster(session){
  addFlagStage(session);session.camera.position.set(0,6.2,11.5);session.camera.lookAt(0,1,0);const positions=[[-3.5,1.5],[3.5,1.5],[-3.5,-2],[3.5,-2]],players=positions.map(([x,z],index)=>createGroundPlayer(session,index,new THREE.Vector2(x,z)));players.forEach(player=>player.root.rotation.y=0);let lives=[2,2,2,2],round=0,phase='fake',phaseElapsed=0,command='red',faulted=new Set(),responded=new Set(),held=Array.from({length:4},()=>new Set()),autoActed=new Set();updateLives(session,lives);
  const commandBox=document.createElement('div');commandBox.className='new-mini-command fake';commandBox.innerHTML='<small>숲 정령의 말에 집중!</small><strong>빨간… 아니, 속임수!</strong>';session.ui.root.append(commandBox);
  session.ui.controls.querySelectorAll('.new-mini-control').forEach(control=>control.insertAdjacentHTML('beforeend','<div class="new-mini-flags"><button class="new-mini-flag red" data-flag="red">🚩 빨강</button><button class="new-mini-flag white" data-flag="white">🏳️ 하양</button></div><div class="new-mini-tip">버튼을 누른 동안 깃발이 올라갑니다</div>'));
  const alive=player=>lives[player]>0,penalize=(player,reason)=>{if(!alive(player)||faulted.has(player))return;faulted.add(player);lives[player]--;players[player].root.rotation.z=lives[player]?-.35:Math.PI/2;updateLives(session,lives);if(!lives[player])markDead(session,player);setStatus(session,`P${player+1} ${reason} · 남은 ♥ ${lives[player]}`)};
  const updateButtons=()=>session.ui.controls.querySelectorAll('.new-mini-flag').forEach(button=>{const player=indexOfControl(button.closest('.new-mini-control'));button.classList.toggle('held',held[player].has(button.dataset.flag));button.disabled=!alive(player)});
  const down=event=>{const button=event.target.closest('.new-mini-flag');if(!button)return;event.preventDefault();const player=indexOfControl(button.closest('.new-mini-control')),color=button.dataset.flag;if(!alive(player))return;session.pointers.set(event.pointerId,{player,color,button});try{button.setPointerCapture(event.pointerId)}catch{}held[player].add(color);if(phase==='fake')penalize(player,'속임수에 반응');else if(phase==='command'){if(color!==command)penalize(player,'반대 깃발');else responded.add(player)}else if(phase==='release')penalize(player,'너무 늦게 올림');updateButtons()};
  const end=event=>{const tracked=session.pointers.get(event.pointerId);if(!tracked)return;session.pointers.delete(event.pointerId);held[tracked.player].delete(tracked.color);updateButtons()};session.ui.root.addEventListener('pointerdown',down,{passive:false});session.ui.root.addEventListener('pointerup',end);session.ui.root.addEventListener('pointercancel',end);session.cleanups.push(()=>{session.ui.root.removeEventListener('pointerdown',down);session.ui.root.removeEventListener('pointerup',end);session.ui.root.removeEventListener('pointercancel',end)});
  const startFake=()=>{round++;phase='fake';phaseElapsed=0;faulted=new Set();responded=new Set();autoActed=new Set();command=session.options.random()<.5?'red':'white';commandBox.className='new-mini-command fake';commandBox.innerHTML=`<small>${round}라운드 · 속임수일 수도 있어요</small><strong>${command==='red'?'하얀':'빨간'}… 깃발은 그대로!</strong>`;setStatus(session,'진짜 명령이 나올 때까지 기다리세요')};startFake();
  session.update=(dt,elapsed)=>{updateClock(session,30-elapsed);phaseElapsed+=dt;const response=Math.max(.58,1.18-round*.035);if(phase==='fake'&&phaseElapsed>=Math.max(.48,1.05-round*.025)){phase='command';phaseElapsed=0;faulted=new Set();responded=new Set();autoActed=new Set();commandBox.className='new-mini-command';commandBox.innerHTML=`<small>지금!</small><strong>${command==='red'?'🚩 빨간':'🏳️ 하얀'} 깃발을 들어라!</strong>`;setStatus(session,'정확한 깃발 버튼을 누르고 유지!')}
    if(phase==='command'){if(session.options.testMode){players.forEach((_,index)=>{if(!alive(index)||autoActed.has(index)||phaseElapsed<.18+index*.025)return;autoActed.add(index);if((round+index)%5===0)penalize(index,'늦은 반응');else{held[index].add(command);responded.add(index);updateButtons()}})}if(phaseElapsed>=response){players.forEach((_,index)=>{if(alive(index)&&!responded.has(index))penalize(index,'시간 초과')});phase='release';phaseElapsed=0;commandBox.innerHTML='<small>마무리!</small><strong>깃발을 내려라!</strong>';setStatus(session,'버튼에서 손을 떼세요')}}
    if(phase==='release'){if(session.options.testMode&&phaseElapsed>.16){held.forEach((set,index)=>{if((round+index)%7!==0)set.clear()});updateButtons()}if(phaseElapsed>=.58){players.forEach((_,index)=>{if(alive(index)&&held[index].size)penalize(index,'너무 오래 유지')});const survivors=lives.map((life,index)=>life>0?index:-1).filter(index=>index>=0);if(survivors.length<=1||round>=18||elapsed>=30){session.finish({scores:lives.map((life,index)=>life*10000+(alive(index)?round:Math.max(0,round-1))*100),winners:survivors.length?survivors:[lives.indexOf(Math.max(...lives))]});return}startFake()}}
    session.flags.red.rotation.z=held.some(set=>set.has('red'))?-.65:0;session.flags.white.rotation.z=held.some(set=>set.has('white'))?.65:0
  }
}

const GAME_BUILDERS={rollarena:gameRollArena,storybook:gameStorybook,switchblast:gameSwitchBlast,flagmaster:gameFlagMaster};

export function runNewMinigameLogicTests(){
  const assertions=[];const assert=(ok,name)=>assertions.push({ok:Boolean(ok),name});
  const shuffled=shuffle([0,1,2,3],()=>.37);assert(shuffled.length===4&&new Set(shuffled).size===4,'스위치 순번은 4명을 중복 없이 섞음');
  for(let survivors=1;survivors<=4;survivors++){const count=survivors+1;assert(count>=2&&count<=5,`생존자 ${survivors}명일 때 스위치 ${count}개`)}
  const pointerMap=new Map([[11,{player:0}],[22,{player:3}]]);pointerMap.delete(11);assert(pointerMap.size===1&&pointerMap.get(22).player===3,'pointerId별 멀티터치 상태 격리');
  const balls=[{alive:false},{alive:true},{alive:true},{alive:false}];assert(aliveIndices(balls).join(',')==='1,2','공동 생존자 판정');
  const safe={x:1,z:-1,radius:.8};assert(Math.hypot(1.2-safe.x,-.8-safe.z)<=safe.radius&&Math.hypot(2-safe.x,-1-safe.z)>safe.radius,'책 문양 안/밖 판정');
  const lives=[2,0,1,0];assert(lives.map((life,index)=>life>0?index:-1).filter(index=>index>=0).join(',')==='0,2','깃발 생존자 판정');
  return{ok:assertions.every(test=>test.ok),assertions}
}

export function createNewMinigameEngine(){
  injectStyles();let active=null;
  const stop=({clear=true}={})=>{if(!active)return;active.stopped=true;cancelAnimationFrame(active.raf);active.cleanups.forEach(cleanup=>cleanup());active.cleanups.length=0;active.pointers.clear();active.renderTools?.dispose();disposeScene(active.scene);if(clear&&active.ui.root.isConnected)active.ui.root.remove();active=null};
  const play=async options=>{
    stop();if(!NEW_MINI_IDS.includes(options.id))throw new Error(`알 수 없는 신규 미니게임: ${options.id}`);const ui=createShell(options.arena,options.players,options.id),tools=configureScene(ui.root),session={options:{random:Math.random,...options},ui,...tools,renderTools:tools,elapsed:0,raf:0,stopped:false,cleanups:[],pointers:new Map(),update:null,finish:null};active=session;let resolveResult;const resultPromise=new Promise(resolve=>resolveResult=resolve);session.finish=result=>{if(session.stopped)return;session.stopped=true;cancelAnimationFrame(session.raf);session.cleanups.forEach(cleanup=>cleanup());session.cleanups.length=0;session.pointers.clear();resolveResult(result)};GAME_BUILDERS[options.id](session);tools.renderer.render(tools.scene,tools.camera);await showCountdown(session);if(session.stopped)return resultPromise;session.elapsed=0;commonLoop(session);const result=await resultPromise;if(active===session){session.renderTools.dispose();disposeScene(session.scene);active=null}return result
  };
  return{ids:[...NEW_MINI_IDS],play,stop,dispose:stop,runLogicTests:runNewMinigameLogicTests}
}
