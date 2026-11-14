// Immutable public snapshots keep presentation sequential without blocking chess input or clocks.
const FX=require('./battle-effects');
class BattleTimeline{
 constructor(){this.events=[];this.cues=[];this.selection=null;this.pausedAt=null;this.revision=0;this.serial=0;}
 enqueue(move,view,event,state,now=Date.now(),options={}){
  this.advance(now);const tail=this.events[this.events.length-1],at=Math.max(now,tail?tail.at+tail.timings.total:now);
  const e={id:++this.serial,at,move,timings:FX.timing(move),...view,particles:FX.particles(move.id+':'+this.serial,12)};
  if(options.awaitReveal&&move.revealed)e.timings.revealOpenAt=Infinity;
  this.events.push(e);this.revision++;
  if(!options.silent&&(move.capturedId||(move.capturedIds&&move.capturedIds.length)))this.cues.push({type:'eat',at:at+e.timings.contact,duration:FX.EAT_DURATION});
  if(!options.silent&&(event==='check'||state.status==='ended'))this.cues.push({at:at+e.timings.impact,duration:650,warning:event==='check',reason:state.reason,king:event==='check'?state.pieces.find(p=>p.kind==='general'&&p.side===state.turn):null});
  return e;
 }
 confirm(e,move,view,now=Date.now()){
  if(!e)return;
  Object.assign(e,view,{move});
  if(e.timings.revealOpenAt===Infinity){
   const half=e.timings.travel+e.timings.reveal/2;
   const openAt=Math.max(half,now-e.at),wait=openAt-half;
   e.timings.revealOpenAt=openAt;e.timings.impact+=wait;e.timings.total+=wait;
  }
  this.revision++;
 }
 advance(now=Date.now()){
  if(this.pausedAt!==null)now=this.pausedAt;
  while(this.events.length&&this.events[0].timings.revealOpenAt!==Infinity&&now>=this.events[0].at+this.events[0].timings.total){this.events.shift();this.revision++;}
  for(let i=this.cues.length-1;i>=0;i--)if(now>=this.cues[i].at+this.cues[i].duration){this.cues.splice(i,1);this.revision++;}
  if(this.selection&&now>=this.selection.at+150){this.selection=null;this.revision++;}
  return this.events[0]||null;
 }
 select(id,now=Date.now()){this.selection=id?{id,at:now}:null;this.revision++;}
 pause(now=Date.now()){if(this.pausedAt===null)this.pausedAt=now;}
 resume(now=Date.now()){if(this.pausedAt===null)return 0;const delta=now-this.pausedAt;for(const e of this.events)e.at+=delta;for(const e of this.cues)e.at+=delta;if(this.selection)this.selection.at+=delta;this.pausedAt=null;this.revision++;return delta;}
 clear(){this.events.length=0;this.cues.length=0;this.selection=null;this.pausedAt=null;this.revision++;}
 active(){return this.events.length>0||this.cues.length>0||!!this.selection;}
 animating(now=Date.now()){
  if(this.pausedAt!==null)return false;
  return this.events.some(e=>e.timings.revealOpenAt===Infinity||now<e.at+e.timings.total)||this.cues.length>0||!!this.selection;
 }
}
module.exports=BattleTimeline;
