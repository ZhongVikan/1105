// Wall-clock deadlines survive backgrounding; only explicit interactions pause.
class TurnClock {
 constructor(now=Date.now){this.now=now;this.deadline=0;this.left=60000;this.reasons=new Set();}
 start(delay=0){this.reasons.clear();this.left=60000;this.deadline=this.now()+60000+delay;}
 remaining(){return Math.max(0,this.reasons.size?this.left:this.deadline-this.now());}
 pause(reason){if(!this.reasons.size)this.left=this.remaining();this.reasons.add(reason);}
 resume(reason){if(!this.reasons.delete(reason))return;if(!this.reasons.size)this.deadline=this.now()+this.left;}
 seconds(){return Math.min(60,Math.ceil(this.remaining()/1000));}
 expired(){return this.remaining()<=0;}
}
module.exports=TurnClock;
