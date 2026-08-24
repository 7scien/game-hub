const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const angleDistance=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const ITEM_COLORS={shield:'#43d8ff',power:'#ff8a3d',teleport:'#9a70ff'};

export class PushArena {
  constructor(canvas,input,audio,onFinish){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.input=input;this.audio=audio;this.onFinish=onFinish;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.players=[];this.particles=[];
    this.running=false;this.time=45;this.elapsed=0;this.overtime=false;this.last=0;this.score=[0,0];
    this.baseRadius=200;this.ringRadius=200;this.arenaScale=1;this.worldItem=null;this.itemTimer=4.5;
    this.eventOrder=this.shuffle(['shrink','spinner','hazard']);this.eventIndex=0;this.activeEvent={type:'none',time:0};
    this.eventNotice=0;this.eventLabel='';this.hitStop=0;this.shake=0;this.collisionLock=0;
    this.frame=this.frame.bind(this);
  }

  shuffle(values){return [...values].sort(()=>Math.random()-.5)}

  resize(){
    const dpr=Math.min(devicePixelRatio||1,2),rect=this.canvas.getBoundingClientRect();
    this.w=rect.width;this.h=rect.height;this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.cx=this.w/2;this.cy=this.h*.47;
    this.baseRadius=Math.min(this.w*.29,this.h*.365,245);this.ringRadius=this.baseRadius*this.arenaScale;
  }

  start(){
    this.arenaScale=1;this.resize();this.score=[0,0];this.time=45;this.elapsed=0;this.overtime=false;
    this.worldItem=null;this.itemTimer=4.5;this.eventOrder=this.shuffle(['shrink','spinner','hazard']);this.eventIndex=0;
    this.activeEvent={type:'none',time:0};this.eventNotice=0;this.hitStop=0;this.shake=0;this.collisionLock=0;
    this.players=[this.makePlayer(0,-.3),this.makePlayer(1,.3)];this.particles=[];this.running=true;
    this.last=performance.now();requestAnimationFrame(this.frame);
  }

  stop(){this.running=false}

  makePlayer(id,side){
    return {id,x:this.cx+side*this.ringRadius,y:this.cy,vx:0,vy:0,r:Math.max(17,Math.min(25,this.ringRadius*.11)),
      angle:id?Math.PI:0,dash:0,dashPower:1,cooldown:0,invincible:1,respawn:0,knockback:0,item:null,
      shield:0,powerDash:0,hazardCooldown:0,spinnerCooldown:0,scaleX:1,scaleY:1,trail:[]};
  }

  frame(now){
    if(!this.running)return;const dt=Math.min(.033,(now-this.last)/1000||0);this.last=now;this.update(dt);this.draw();
    if(this.running)requestAnimationFrame(this.frame);
  }

  update(dt){
    this.eventNotice=Math.max(0,this.eventNotice-dt);this.shake=Math.max(0,this.shake-dt*28);this.collisionLock=Math.max(0,this.collisionLock-dt);
    if(this.hitStop>0){this.hitStop-=dt;this.updateParticles(dt*.18);return}
    if(!this.overtime){
      this.time=Math.max(0,this.time-dt);this.elapsed+=dt;
      if(this.eventIndex<2&&this.elapsed>=15*(this.eventIndex+1))this.triggerEvent(this.eventOrder[this.eventIndex++]);
      if(this.time<=0){
        if(this.score[0]===this.score[1]){this.overtime=true;this.eventLabel='SUDDEN SHRINK';this.eventNotice=2.2;this.audio.event()}
        else return this.finish(this.score[0]>this.score[1]?0:1);
      }
    }else{
      this.arenaScale=Math.max(.43,this.arenaScale-dt*.038);this.ringRadius=this.baseRadius*this.arenaScale;
    }
    this.updateEvent(dt);this.updateItem(dt);
    for(const player of this.players)this.updatePlayer(player,dt);
    this.collidePlayers();this.updateParticles(dt);
  }

  updatePlayer(player,dt){
    if(player.respawn>0){player.respawn-=dt;if(player.respawn<=0)this.respawn(player);return}
    player.invincible=Math.max(0,player.invincible-dt);player.cooldown=Math.max(0,player.cooldown-dt);
    player.dash=Math.max(0,player.dash-dt);player.shield=Math.max(0,player.shield-dt);player.powerDash=Math.max(0,player.powerDash-dt);
    player.hazardCooldown=Math.max(0,player.hazardCooldown-dt);player.spinnerCooldown=Math.max(0,player.spinnerCooldown-dt);
    const control=this.input.get(player.id);
    if(control.item&&player.item)this.useItem(player);
    if(control.dash&&player.cooldown<=0){
      player.dash=.24;player.cooldown=2;player.dashPower=player.powerDash>0?1.7:1;player.powerDash=0;
      this.audio.dash();this.vibrate(12);
    }
    const magnitude=Math.hypot(control.x,control.y);if(magnitude>.05)player.angle=Math.atan2(control.y,control.x);
    const acceleration=player.dash>0?1280:720,maxSpeed=player.dash>0?650:230;
    player.vx+=control.x*acceleration*dt;player.vy+=control.y*acceleration*dt;
    let speed=Math.hypot(player.vx,player.vy);
    if(player.dash>0&&speed<370){player.vx+=Math.cos(player.angle)*940*dt;player.vy+=Math.sin(player.angle)*940*dt;speed=Math.hypot(player.vx,player.vy)}
    if(speed>maxSpeed){player.vx=player.vx/speed*maxSpeed;player.vy=player.vy/speed*maxSpeed}
    const drag=Math.pow(player.dash>0?.48:.075,dt);player.vx*=drag;player.vy*=drag;player.x+=player.vx*dt;player.y+=player.vy*dt;
    const stretch=clamp(Math.hypot(player.vx,player.vy)/520,0,.34);player.scaleX=1+stretch;player.scaleY=1-stretch*.45;
    if(player.dash>0&&!this.reduced)player.trail.push({x:player.x,y:player.y,a:.5,r:player.r,color:player.dashPower>1?'#ffd65a':null});
    player.trail.forEach(trail=>trail.a-=dt*2.8);player.trail=player.trail.filter(trail=>trail.a>0);
    this.collectItem(player);this.applyArenaHazards(player);
    if(Math.hypot(player.x-this.cx,player.y-this.cy)>this.ringRadius+player.r*.7)this.ringOut(player);
  }

  updateItem(dt){
    if(this.worldItem)return;this.itemTimer-=dt;if(this.itemTimer<=0)this.spawnItem();
  }

  spawnItem(){
    const types=['shield','power','teleport'],type=types[Math.floor(Math.random()*types.length)];let x=this.cx,y=this.cy;
    for(let attempt=0;attempt<8;attempt++){
      const angle=Math.random()*TAU,radius=this.ringRadius*(.16+Math.random()*.42);x=this.cx+Math.cos(angle)*radius;y=this.cy+Math.sin(angle)*radius;
      if(this.players.every(player=>Math.hypot(player.x-x,player.y-y)>player.r*3))break;
    }
    this.worldItem={type,x,y,r:15,born:performance.now()};this.itemTimer=99;
  }

  collectItem(player){
    const item=this.worldItem;if(!item||player.item||Math.hypot(player.x-item.x,player.y-item.y)>player.r+item.r+3)return;
    player.item=item.type;this.worldItem=null;this.itemTimer=6.5;this.burst(item.x,item.y,ITEM_COLORS[item.type],16);this.audio.item();this.vibrate(10);
  }

  useItem(player){
    const type=player.item;player.item=null;
    if(type==='shield')player.shield=2.7;
    if(type==='power')player.powerDash=8;
    if(type==='teleport'){
      const startX=player.x,startY=player.y,opponent=this.players[1-player.id];let angle=Math.atan2(player.y-opponent.y,player.x-opponent.x);
      if(!Number.isFinite(angle))angle=player.id?0:Math.PI;
      for(let attempt=0;attempt<6;attempt++){
        const candidate=angle+attempt*.82,rad=this.ringRadius*(attempt? .34:.28);
        player.x=this.cx+Math.cos(candidate)*rad;player.y=this.cy+Math.sin(candidate)*rad;
        if(!this.isDangerZone(player.x,player.y))break;
      }
      player.vx=player.vy=0;player.invincible=Math.max(player.invincible,.28);
      this.burst(startX,startY,ITEM_COLORS.teleport,18);this.burst(player.x,player.y,ITEM_COLORS.teleport,18);
    }
    this.audio.item();this.vibrate(14);
  }

  triggerEvent(type){
    const labels={shrink:'RING COMPRESSION',spinner:'SPIN SWEEPER',hazard:'DANGER FLOOR'};
    this.eventLabel=labels[type];this.eventNotice=2.4;this.audio.event();this.vibrate(22);
    if(type==='shrink'){
      this.arenaScale=Math.max(.72,this.arenaScale*.86);this.activeEvent={type,time:2.5};
    }else if(type==='spinner'){
      this.activeEvent={type,time:11.5,angle:Math.random()*TAU};
    }else{
      this.activeEvent={type,time:10,angle:Math.random()*TAU,warmup:1.1};
    }
  }

  updateEvent(dt){
    const event=this.activeEvent;if(event.type==='none')return;event.time-=dt;
    if(event.type==='shrink')this.ringRadius+=(this.baseRadius*this.arenaScale-this.ringRadius)*Math.min(1,dt*3.4);
    if(event.type==='spinner')event.angle+=dt*2.25;
    if(event.type==='hazard')event.warmup=Math.max(0,event.warmup-dt);
    if(event.time<=0){this.activeEvent={type:'none',time:0};this.ringRadius=this.baseRadius*this.arenaScale}
  }

  applyArenaHazards(player){
    const event=this.activeEvent;
    if(event.type==='hazard'&&event.warmup<=0&&player.hazardCooldown<=0&&this.isDangerZone(player.x,player.y)){
      const dx=player.x-this.cx,dy=player.y-this.cy,length=Math.hypot(dx,dy)||1;
      this.applyEnvironmentalHit(player,dx/length,dy/length,7,175);player.hazardCooldown=.62;this.audio.hazard();
    }
    if(event.type==='spinner'&&player.spinnerCooldown<=0){
      const half=this.ringRadius*.57,ax=this.cx-Math.cos(event.angle)*half,ay=this.cy-Math.sin(event.angle)*half;
      const bx=this.cx+Math.cos(event.angle)*half,by=this.cy+Math.sin(event.angle)*half;
      const point=this.nearestPoint(player.x,player.y,ax,ay,bx,by),dx=player.x-point.x,dy=player.y-point.y,distance=Math.hypot(dx,dy)||1;
      if(distance<player.r+9){
        const side=Math.sign(Math.sin(event.angle)*(player.x-this.cx)-Math.cos(event.angle)*(player.y-this.cy))||1;
        this.applyEnvironmentalHit(player,-Math.sin(event.angle)*side,Math.cos(event.angle)*side,10,290);player.spinnerCooldown=.58;this.audio.hit(.75);
      }
    }
  }

  isDangerZone(x,y){
    const event=this.activeEvent;if(event.type!=='hazard')return false;const dx=x-this.cx,dy=y-this.cy,radius=Math.hypot(dx,dy);
    if(radius<this.ringRadius*.34||radius>this.ringRadius)return false;const angle=Math.atan2(dy,dx);
    return angleDistance(angle,event.angle)<.43||angleDistance(angle,event.angle+Math.PI)<.43;
  }

  nearestPoint(px,py,ax,ay,bx,by){
    const abx=bx-ax,aby=by-ay,t=clamp(((px-ax)*abx+(py-ay)*aby)/(abx*abx+aby*aby),0,1);
    return{x:ax+abx*t,y:ay+aby*t};
  }

  collidePlayers(){
    const a=this.players[0],b=this.players[1];if(a.respawn>0||b.respawn>0)return;
    let dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||.01,minDistance=a.r+b.r;if(distance>=minDistance)return;
    const nx=dx/distance,ny=dy/distance,overlap=minDistance-distance;a.x-=nx*overlap*.5;b.x+=nx*overlap*.5;a.y-=ny*overlap*.5;b.y+=ny*overlap*.5;
    const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny,baseImpulse=Math.max(38,-relative*.32);
    const aWeight=1+a.knockback/145,bWeight=1+b.knockback/145;
    a.vx-=nx*baseImpulse*aWeight;b.vx+=nx*baseImpulse*bWeight;a.vy-=ny*baseImpulse*aWeight;b.vy+=ny*baseImpulse*bWeight;
    if(this.collisionLock>0)return;
    const aAttacks=a.dash>0&&b.invincible<=0,bAttacks=b.dash>0&&a.invincible<=0;
    if(aAttacks)this.applyDashHit(a,b,nx,ny,a.dashPower);
    if(bAttacks)this.applyDashHit(b,a,-nx,-ny,b.dashPower);
    if(aAttacks||bAttacks){this.collisionLock=.2;return}
    if(relative<-125){
      const chip=clamp((-relative-100)/45,2,5);if(a.invincible<=0)a.knockback=clamp(a.knockback+chip,0,100);if(b.invincible<=0)b.knockback=clamp(b.knockback+chip,0,100);this.collisionLock=.26;
    }
  }

  applyDashHit(attacker,target,nx,ny,power){
    const guard=target.shield>0?.36:1,damage=(power>1?23:14)*guard;
    target.knockback=clamp(target.knockback+damage,0,100);const multiplier=1+target.knockback/62;
    const force=(270+(power-1)*155)*multiplier*(target.shield>0?.48:1);
    target.vx+=nx*force;target.vy+=ny*force;attacker.vx-=nx*force*.1;attacker.vy-=ny*force*.1;attacker.dash=0;
    const intensity=power>1?1.7:1;this.hitStop=this.reduced?0:.045+.018*intensity;this.shake=this.reduced?0:7*intensity;
    this.burst((attacker.x+target.x)/2,(attacker.y+target.y)/2,power>1?'#ffd858':'#ffffff',power>1?30:21);
    this.audio.hit(intensity);this.vibrate(power>1?28:20);
  }

  applyEnvironmentalHit(target,nx,ny,damage,force){
    const guard=target.shield>0?.38:1;target.knockback=clamp(target.knockback+damage*guard,0,100);
    const multiplier=1+target.knockback/70;target.vx+=nx*force*multiplier*guard;target.vy+=ny*force*multiplier*guard;
    this.shake=Math.max(this.shake,this.reduced?0:4);this.burst(target.x,target.y,'#ffb23f',12);
  }

  ringOut(loser){
    if(loser.respawn>0)return;const winner=1-loser.id;this.score[winner]++;loser.respawn=this.overtime?99:.85;
    loser.knockback=0;loser.item=null;loser.shield=loser.powerDash=0;
    this.burst(loser.x,loser.y,loser.id?'#ff5575':'#45c8ff',28);this.shake=this.reduced?0:12;this.audio.score();this.vibrate(30);
    window.dispatchEvent(new CustomEvent('duo-score',{detail:{score:[...this.score],winner}}));if(this.overtime)this.finish(winner);
  }

  respawn(player){
    const side=player.id?1:-1;player.x=this.cx+side*this.ringRadius*.15;player.y=this.cy+(Math.random()-.5)*this.ringRadius*.16;
    player.vx=player.vy=0;player.knockback=0;player.invincible=1;player.cooldown=Math.min(player.cooldown,.5);
  }

  finish(winner){if(!this.running)return;this.running=false;this.onFinish(winner)}

  burst(x,y,color,count=12){
    if(this.reduced)count=Math.min(count,5);for(let i=0;i<count;i++){
      const angle=Math.random()*TAU,speed=70+Math.random()*240;this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.38+Math.random()*.38,color,r:2+Math.random()*4});
    }
  }

  updateParticles(dt){
    this.particles.forEach(particle=>{particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vx*=.94;particle.vy*=.94;particle.life-=dt});
    this.particles=this.particles.filter(particle=>particle.life>0);
  }

  vibrate(ms){try{navigator.vibrate?.(ms)}catch{}}

  draw(){
    const c=this.ctx,time=performance.now()*.001;c.clearRect(0,0,this.w,this.h);c.fillStyle='#15192f';c.fillRect(0,0,this.w,this.h);
    const shakeX=this.shake?(Math.random()-.5)*this.shake:0,shakeY=this.shake?(Math.random()-.5)*this.shake:0;c.save();c.translate(shakeX,shakeY);
    this.drawArena(c,time);this.drawWorldItem(c,time);for(const player of this.players)this.drawPlayer(c,player,time);this.drawParticles(c);c.restore();
  }

  drawArena(c,time){
    c.save();c.translate(this.cx,this.cy);
    for(let radius=this.ringRadius*1.48;radius>this.ringRadius;radius-=20){c.beginPath();c.arc(0,0,radius,0,TAU);c.strokeStyle=`rgba(80,88,151,${.09*(1-(radius-this.ringRadius)/(this.ringRadius*.5))})`;c.lineWidth=12;c.stroke()}
    c.beginPath();c.arc(0,0,this.ringRadius+8,0,TAU);c.fillStyle='#080a16bb';c.fill();
    c.beginPath();c.arc(0,0,this.ringRadius,0,TAU);c.fillStyle='#f6f2e5';c.fill();
    c.globalAlpha=.1;c.strokeStyle='#50546d';c.lineWidth=2;for(let radius=38;radius<this.ringRadius;radius+=38){c.beginPath();c.arc(0,0,radius,0,TAU);c.stroke()}c.globalAlpha=1;
    if(this.activeEvent.type==='hazard')this.drawDangerFloor(c,time);
    const pulse=.55+.35*Math.sin(time*7);for(let band=0;band<4;band++){c.beginPath();c.arc(0,0,this.ringRadius-band*5,0,TAU);c.strokeStyle=`rgba(255,69,91,${(.12+band*.055)*pulse})`;c.lineWidth=4;c.stroke()}
    c.beginPath();c.arc(0,0,this.ringRadius,0,TAU);c.lineWidth=6;c.strokeStyle=this.overtime?'#ffd85e':'#c6c4cc';c.stroke();
    if(this.activeEvent.type==='spinner')this.drawSpinner(c,time);c.restore();
  }

  drawDangerFloor(c,time){
    const event=this.activeEvent,pulse=.25+.13*Math.sin(time*9);for(const offset of [0,Math.PI]){
      c.beginPath();c.arc(0,0,this.ringRadius,event.angle+offset-.43,event.angle+offset+.43);c.arc(0,0,this.ringRadius*.34,event.angle+offset+.43,event.angle+offset-.43,true);c.closePath();
      c.fillStyle=event.warmup>0?'rgba(255,166,48,.16)':`rgba(255,64,72,${pulse})`;c.fill();c.strokeStyle='#ff694f99';c.lineWidth=3;c.stroke();
    }
  }

  drawSpinner(c,time){
    const event=this.activeEvent,half=this.ringRadius*.57;c.save();c.rotate(event.angle);c.lineCap='round';c.strokeStyle='#4b345f';c.lineWidth=22;c.beginPath();c.moveTo(-half,0);c.lineTo(half,0);c.stroke();
    c.strokeStyle='#ffd759';c.lineWidth=12;c.beginPath();c.moveTo(-half,0);c.lineTo(half,0);c.stroke();c.fillStyle='#fff3a8';c.beginPath();c.arc(-half,0,10+Math.sin(time*8)*2,0,TAU);c.arc(half,0,10+Math.sin(time*8)*2,0,TAU);c.fill();c.restore();
  }

  drawWorldItem(c,time){
    const item=this.worldItem;if(!item)return;const bob=Math.sin(time*4+item.x)*4;c.save();c.translate(item.x,item.y+bob);c.shadowColor=ITEM_COLORS[item.type];c.shadowBlur=18;
    c.beginPath();c.arc(0,0,item.r+5,0,TAU);c.fillStyle='#15182d';c.fill();c.lineWidth=3;c.strokeStyle=ITEM_COLORS[item.type];c.stroke();c.shadowBlur=0;c.fillStyle=ITEM_COLORS[item.type];c.font='900 14px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(item.type==='shield'?'S':item.type==='power'?'P':'↯',0,0);c.restore();
  }

  drawPlayer(c,player,time){
    for(const trail of player.trail){c.globalAlpha=trail.a;c.beginPath();c.arc(trail.x,trail.y,trail.r*.72,0,TAU);c.fillStyle=trail.color||(player.id?'#ff496d':'#35bdf5');c.fill()}c.globalAlpha=1;if(player.respawn>0)return;
    const edge=Math.hypot(player.x-this.cx,player.y-this.cy)/this.ringRadius;if(edge>.72){c.beginPath();c.arc(player.x,player.y,player.r+9+(edge-.72)*18,0,TAU);c.strokeStyle=`rgba(255,58,77,${clamp((edge-.72)*1.8,0,.55)})`;c.lineWidth=4;c.stroke()}
    c.save();c.translate(player.x,player.y);c.rotate(player.angle);c.scale(player.scaleX,player.scaleY);
    if(player.invincible>0)c.globalAlpha=.48+.35*Math.sin(performance.now()*.025);
    if(player.powerDash>0){c.beginPath();c.arc(0,0,player.r+7+Math.sin(time*9)*2,0,TAU);c.strokeStyle='#ffac42';c.lineWidth=4;c.stroke()}
    if(player.shield>0){c.beginPath();c.arc(0,0,player.r+10,0,TAU);c.fillStyle='#54e5ff25';c.fill();c.strokeStyle='#65e8ff';c.lineWidth=4;c.stroke()}
    c.beginPath();c.arc(0,0,player.r,0,TAU);c.fillStyle=player.id?'#ff496d':'#35bdf5';c.shadowColor=player.id?'#fa375d':'#24aee8';c.shadowBlur=18;c.fill();c.shadowBlur=0;
    c.fillStyle='#fff';c.beginPath();c.ellipse(player.r*.28,-player.r*.24,player.r*.15,player.r*.2,0,0,TAU);c.ellipse(player.r*.28,player.r*.24,player.r*.15,player.r*.2,0,0,TAU);c.fill();
    c.fillStyle='#1b2136';c.beginPath();c.arc(player.r*.34,-player.r*.22,player.r*.06,0,TAU);c.arc(player.r*.34,player.r*.22,player.r*.06,0,TAU);c.fill();c.restore();
  }

  drawParticles(c){
    for(const particle of this.particles){c.globalAlpha=clamp(particle.life*2,0,1);c.beginPath();c.arc(particle.x,particle.y,particle.r,0,TAU);c.fillStyle=particle.color;c.fill()}c.globalAlpha=1;
  }
}
