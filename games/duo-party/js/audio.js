export class AudioManager {
  constructor(){this.ctx=null}
  unlock(){if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume()}
  tone(freq=440,duration=.08,type='sine',volume=.035){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+duration);o.connect(g).connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+duration)}
  dash(){this.tone(185,.11,'sawtooth',.025)}
  hit(power=1){this.tone(90+power*25,.09,'square',.035);setTimeout(()=>this.tone(210+power*80,.06,'sawtooth',.022),22)}
  item(){this.tone(720,.12,'sine',.035);setTimeout(()=>this.tone(980,.14,'triangle',.03),55)}
  event(){this.tone(160,.28,'sawtooth',.035);setTimeout(()=>this.tone(240,.24,'square',.02),100)}
  hazard(){this.tone(115,.08,'square',.018)}
  score(){this.tone(620,.18,'sine',.04);setTimeout(()=>this.tone(820,.16,'sine',.035),80)}
}
