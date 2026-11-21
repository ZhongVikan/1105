// Presentation only. All coordinates are in the existing 720 x 800 board space.
const CueArt=require('./battle-cue-art');
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10);};
function timing(move={}){
 const from=move.from||{x:0,y:0},to=move.to||from,d=Math.hypot(to.x-from.x,to.y-from.y);
 const travel=140+Math.min(100,d*16),reveal=move.revealed?220:0;
 const capture=!!(move.capturedId||(move.capturedIds&&move.capturedIds.length));
 return {travel,reveal,contact:travel,impact:travel+reveal,
  total:Math.max(travel+reveal+110,travel+(move.fusionType?280:capture?360:110))};
}
function revealProgress(elapsed,t){return clamp((elapsed-t.travel)/Math.max(1,t.reveal));}
function pose(move,elapsed,point,out={},timings){
 const t=timings||timing(move),from=point(move.from),to=point(move.to||move.from),p=smooth(elapsed/t.travel),f=revealProgress(elapsed,t);
 out.x=from.x+(to.x-from.x)*p;out.y=from.y+(to.y-from.y)*p;
 out.lift=Math.sin(Math.PI*clamp(elapsed/t.travel))*2;out.scale=1;
 out.flipScale=t.reveal?Math.max(.035,Math.abs(Math.cos(Math.PI*f))):1;
 out.hidden=!!move.revealed&&f<.5;return out;
}
function particles(seed,count){
 // Precompute a small reusable event buffer. Never consume gameplay's random stream.
 const a=new Float32Array(count*6);let s=2166136261;
 for(const ch of String(seed))s=Math.imul(s^ch.charCodeAt(0),16777619)>>>0;
 const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 for(let i=0;i<count;i++){const k=i*6,angle=rand()*Math.PI*2;
  a[k]=Math.cos(angle);a[k+1]=Math.sin(angle);a[k+2]=35+rand()*75;
  a[k+3]=2+rand()*6;a[k+4]=170+rand()*150;a[k+5]=.65+rand()*1.05;}
 return a;
}
function ring(c,x,y,r,color,alpha,width){if(alpha<=0)return;c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();c.restore();}
function selection(renderer,p,flipped,motion,now=Date.now()){
 if(!p)return;const moving=motion&&motion.move.id===p.id&&now-motion.at<motionDuration(motion),q=moving?pose(motion.move,now-motion.at,v=>renderer.boardPoint(v,flipped),renderer._ringPose||(renderer._ringPose={}),motion.timings):renderer.boardPoint(p,flipped);
 renderer.pieceRing(q.x,q.y-(q.lift||0),33,'#fff');
}
function motionDuration(m){return (m.timings||timing(m.move)).total;}
function pulse(renderer,p,flipped,pulseEvent,now){
 if(!p||!pulseEvent||pulseEvent.id!==p.id)return;const e=now-pulseEvent.at;if(e<0||e>=150)return;
 const q=renderer.boardPoint(p,flipped),c=renderer.ctx;c.save();c.globalAlpha=.13*Math.sin(Math.PI*e/150);c.fillStyle='#fff3c5';c.beginPath();c.arc(q.x,q.y,30,0,Math.PI*2);c.fill();c.restore();
}
function sweep(renderer,x,y,progress,alpha){
 if(progress<=0||progress>=1)return;const c=renderer.ctx;c.save();c.beginPath();c.arc(x,y,31,0,Math.PI*2);c.clip();
 const sx=x-47+94*progress;c.translate(sx,y);c.rotate(-.35);c.globalAlpha*=alpha*Math.sin(Math.PI*progress);
 c.fillStyle='#fff1bc';c.fillRect(-2,-42,4,84);c.globalAlpha*=.22;c.fillRect(-8,-42,16,84);c.restore();
}
function under(renderer,motion,elapsed,flipped){
 const t=motion.timings||timing(motion.move),fade=smooth((elapsed-t.contact)/140),c=renderer.ctx;
 if(fade>=1)return;
 const rotationData=renderer.runtime&&renderer.runtime.controller&&renderer.runtime.controller.data;
 for(const p of motion.removedPieces||motion.capturedPieces||[]){const q=renderer.boardPoint(p,flipped);c.save();c.globalAlpha=1-fade;c.translate(q.x,q.y);const scale=1-.14*fade;c.scale(scale,scale);if(renderer.orientedDisc)renderer.orientedDisc(0,0,33,p,rotationData);else renderer.disc(0,0,33,p.text,p.side,p.hidden,false,p);c.restore();}
}
function sparks(renderer,event,x,y,age,quality,subtle=false){
 const a=event.particles;if(!a||age<0)return;const c=renderer.ctx,n=quality===0?Math.min(6,a.length/6):a.length/6;c.save();c.lineCap='round';
 const gold=subtle?'#f3bd4b':'#ffe297',white=subtle?'#fff0ae':'#fff9df';
 for(let i=0;i<n;i++){const k=i*6,life=a[k+4],t=age/life;if(t>=1)continue;
  const dist=(subtle?17:33)+a[k+2]*(age/1000)*(1-.28*t);
  const xx=x+a[k]*dist,yy=y+a[k+1]*dist+5*t*t,len=(a[k+3]+(subtle?0:4))*(1-t),fade=(1-t)**2;
  c.beginPath();c.moveTo(xx,yy);c.lineTo(xx-a[k]*len,yy-a[k+1]*len);
  if(!subtle){c.globalAlpha=.56*fade;c.strokeStyle='#ae652c';c.lineWidth=a[k+5]+1.3;c.stroke();}
  c.globalAlpha=(subtle?.35:1)*fade;c.strokeStyle=i%3?gold:white;c.lineWidth=a[k+5];c.stroke();
 }c.restore();
}
function over(renderer,motion,elapsed,flipped){
 const m=motion.move,t=motion.timings||timing(m),c=renderer.ctx,at=renderer.boardPoint(m.to||m.from,flipped),age=elapsed-t.contact;
 if(m.fusionType)require('./fusion-effects').draw(renderer,motion,elapsed,flipped);
 if(age<0)return;
 const capture=!!(m.capturedId||(m.capturedIds&&m.capturedIds.length));
 const drop=clamp(age/120);if(drop<1)ring(c,at.x,at.y,29+15*smooth(drop),'#f1c96b',.23*(1-drop),1.1);
 if(capture){
  CueArt.captureImpact(renderer,at.x,at.y,age);
  sparks(renderer,motion,at.x,at.y,age,renderer.fxQuality);
 }
 if(m.revealed){const f=revealProgress(elapsed,t);if(f>.5){sweep(renderer,at.x,at.y,(f-.5)*2,.3);sparks(renderer,motion,at.x,at.y,elapsed-t.travel-t.reveal*.5,0,true);}}
}
const EAT_DURATION=1100;
function eatEnvelope(age){return age<0||age>=EAT_DURATION?0:age<120?smooth(age/120):age<680?1:1-smooth((age-680)/420);}
function eatLabel(renderer,point,age,board,flipped){
 const alpha=eatEnvelope(age);if(alpha<=0)return;
 const cell=renderer.boardPoint(point,flipped),w=Math.max(37,Math.min(49,board.w*.132));
 const x=board.x+cell.x*board.w/720+(cell.x>360?-1:1)*w*.64;
 const y=board.y+cell.y*board.h/800+(cell.y<180?1:-1)*w*.65;
 const inset=w*.58,entry=smooth(age/140);
 const cx=Math.max(board.x+inset,Math.min(board.x+board.w-inset,x));
 const cy=Math.max(board.y+inset,Math.min(board.y+board.h*.9-inset,y));
 const scale=age<135?.75+.33*smooth(age/135):1.08-.08*smooth((age-135)/100);
 CueArt.drawBadge(renderer,'eat',cx,cy+8*(1-entry)-3*smooth(age/EAT_DURATION),w,alpha,scale);
}
function cueAlpha(age,duration){return Math.min(smooth(age/90),1-smooth((age-(duration-180))/180));}
function terminalCue(ctx,age,duration){
 // The result modal owns its own timer.
 ctx.save();ctx.globalAlpha=.45*cueAlpha(age,duration);ctx.strokeStyle='#e6b457';ctx.lineWidth=1.5;
 const d=70-14*smooth(age/duration);
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2+Math.PI/4,x=360+Math.cos(a)*d,y=376+Math.sin(a)*d;
  ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x,y-6);ctx.lineTo(x+6,y);ctx.stroke();
 }
 ctx.restore();
}
function drawCues(renderer,events,now,flipped,{board,topSide,topCheckY,bottomCheckY}){
 const ctx=renderer.ctx;
 let eat=null,check=null;
 ctx.save();ctx.translate(board.x,board.y);ctx.scale(board.w/720,board.h/800);
 for(const event of events){
  const age=now-event.at;
  if(age<0||age>=event.duration)continue;
  if(event.type==='eat'){if(event.point&&(!eat||event.at>=eat.at))eat=event;}
  else if(event.warning){if(event.king&&(!check||event.at>=check.at))check=event;}
  else terminalCue(ctx,age,event.duration);
 }
 let checkAlpha=0;
 if(check){
  const age=now-check.at,king=renderer.boardPoint(check.king,flipped);
  checkAlpha=cueAlpha(age,check.duration);
  CueArt.checkHalo(renderer,king.x,king.y,checkAlpha,smooth(age/check.duration));
 }
 ctx.restore();
 if(eat)eatLabel(renderer,eat.point,now-eat.at,board,flipped);
 if(check){
  const age=now-check.at,baseY=check.king.side===topSide?topCheckY:bottomCheckY;
  const y=baseY+5*(1-smooth(age/140)),width=116;
  const scale=age<140?.83+.22*smooth(age/140):1.05-.05*smooth((age-140)/110);
  CueArt.checkTrails(renderer,187.5,y,width*scale,checkAlpha,age/340);
  CueArt.drawBadge(renderer,'check',187.5,y,width,checkAlpha,scale);
 }
}
function warningPhase(controller,now){
 const d=controller.data,key=d.turn;let w=controller._warningPhase;
 const on=d.seconds<=10&&!d.ended&&!d.waiting&&!controller._hidden;
 if(!on){controller._warningPhase=null;return 0;}
 if(!w||w.side!==key)w=controller._warningPhase={side:key,at:now,pausedAt:null};
 if(d.paused){if(w.pausedAt===null)w.pausedAt=now;return 0;}
 if(w.pausedAt!==null){w.at+=now-w.pausedAt;w.pausedAt=null;}
 return (.5-.5*Math.cos((now-w.at)*Math.PI*2/1000));
}
function danger(renderer,y,phase){if(phase<=0)return;const c=renderer.ctx,alpha=.34+.66*phase;c.save();renderer.rounded(12,y-4,351,56,19);c.strokeStyle=`rgba(214,42,30,${alpha})`;c.lineWidth=2.2+1.2*phase;
 if(renderer.fxQuality!==0){c.shadowColor=`rgba(235,48,33,${.72*phase})`;c.shadowBlur=8+8*phase;}c.stroke();c.shadowBlur=0;renderer.rounded(14,y-2,347,52,17);c.strokeStyle=`rgba(255,103,73,${.42+.38*phase})`;c.lineWidth=1.2+.8*phase;c.stroke();c.restore();}
function frame(controller,now){if(controller._battle){const current=controller._battle.advance(now);controller.motion=current;return current;}return controller.motion||null;}
function rings(renderer,data,motion,now,selectionPulse){
 let selected=null,last=null;for(const p of data.pieces){if(p.id===data.selectedId)selected=p;if(p.id===data.lastMoveId)last=p;}
 if(!last&&motion&&now-motion.at<(motion.timings||timing(motion.move)).contact)last=(motion.removedPieces||[]).find(p=>p.id===data.lastMoveId);
 if(last)selection(renderer,last,data.flipped,motion,now);
 if(selected&&selected!==last)selection(renderer,selected,data.flipped,motion,now);
 pulse(renderer,selected,data.flipped,selectionPulse,now);
}
module.exports={timing,pose,smooth,particles,selection,under,over,eatEnvelope,EAT_DURATION,drawCues,preload:CueArt.preload,warningPhase,danger,frame,rings};
