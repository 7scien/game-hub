export class PartyManager extends EventTarget {
  constructor(ui,{devMode=true}={}){super();this.ui=ui;this.devMode=devMode;this.games=['Push Arena','Gravity Duel','Dash Duel','Territory Rush','Orb Battle','Ricochet Duel','Hook Arena','King of the Zone'];this.reset()}
  reset(){this.round=0;this.wins=[0,0];this.order=[...this.games].sort(()=>Math.random()-.5);if(this.devMode)this.order.fill('Push Arena');this.sync()}
  sync(){this.ui.p1Wins.textContent=this.wins[0];this.ui.p2Wins.textContent=this.wins[1];this.ui.round.textContent=`ROUND ${Math.min(this.round+1,8)} / 8`}
  current(){return this.order[this.round]}
  record(winner){if(winner===0||winner===1)this.wins[winner]++;this.sync();return{finished:this.round>=7,winner}}
  advance(){this.round++;this.sync()}
}
