// Presentation only. All coordinates are in the existing 720 x 800 board space.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10);};
function timing(move={}){
 const from=move.from||{x:0,y:0},to=move.to||from,d=Math.hypot(to.x-from.x,to.y-from.y);
 const travel=140+Math.min(100,d*16),reveal=move.revealed?220:0;
 const capture=!!(move.capturedId||(move.capturedIds&&move.capturedIds.length));
 return {travel,reveal,contact:travel,impact:travel+reveal,
  total:Math.max(travel+reveal+110,travel+(move.fusionType?280:capture?360:110))};
}
function pose(move,elapsed,point,out={},timings){
 const t=timings||timing(move),from=point(move.from),to=point(move.to||move.from),p=smooth(elapsed/t.travel),f=clamp((elapsed-t.travel)/Math.max(1,t.reveal));
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
 for(const p of motion.removedPieces||motion.capturedPieces||[]){const q=renderer.boardPoint(p,flipped);c.save();c.globalAlpha=1-fade;c.translate(q.x,q.y);const scale=1-.14*fade;c.scale(scale,scale);renderer.disc(0,0,33,p.text,p.side,p.hidden,false,p);c.restore();}
}
function sparks(renderer,event,x,y,age,quality,subtle=false){
 const a=event.particles;if(!a||age<0)return;const c=renderer.ctx,n=quality===0?Math.min(6,a.length/6):a.length/6;c.save();c.lineCap='round';
 for(let i=0;i<n;i++){const k=i*6,life=a[k+4],t=age/life;if(t>=1)continue;
  const dist=17+a[k+2]*(age/1000)*(1-.28*t),xx=x+a[k]*dist,yy=y+a[k+1]*dist+5*t*t,len=a[k+3]*(1-t);
  c.globalAlpha=(subtle?.35:.85)*(1-t)*(1-t);c.strokeStyle=i%3?'#f3bd4b':'#fff0ae';c.lineWidth=a[k+5];c.beginPath();c.moveTo(xx,yy);c.lineTo(xx-a[k]*len,yy-a[k+1]*len);c.stroke();
 }c.restore();
}
function over(renderer,motion,elapsed,flipped){
 const m=motion.move,t=motion.timings||timing(m),c=renderer.ctx,at=renderer.boardPoint(m.to||m.from,flipped),age=elapsed-t.contact;
 if(m.fusionType)require('./fusion-effects').draw(renderer,motion,elapsed,flipped);
 if(age<0)return;
 const capture=!!(m.capturedId||(m.capturedIds&&m.capturedIds.length));
 const drop=clamp(age/120);if(drop<1)ring(c,at.x,at.y,29+15*smooth(drop),'#f1c96b',.23*(1-drop),1.1);
 if(capture){
  const flash=clamp(age/95);if(flash<1){c.save();c.globalAlpha=.28*Math.sin(Math.PI*flash);c.fillStyle='#ffe7a2';c.beginPath();c.arc(at.x,at.y,17-5*flash,0,Math.PI*2);c.fill();c.restore();}
  const wave=clamp(age/230);if(wave<1)ring(c,at.x,at.y,22+28*smooth(wave),'#f1b84a',.65*(1-wave),1.3);
  sparks(renderer,motion,at.x,at.y,age,renderer.fxQuality);
 }
 if(m.revealed){const f=clamp((elapsed-t.travel)/t.reveal);if(f>.5){sweep(renderer,at.x,at.y,(f-.5)*2,.3);sparks(renderer,motion,at.x,at.y,elapsed-t.travel-t.reveal*.5,0,true);}}
}
function makeGlyph(renderer,label,size){
 const scale=1.5,canvas=wx.createCanvas();canvas.width=Math.ceil((label.length*size+32)*scale);canvas.height=Math.ceil((size+34)*scale);const c=canvas.getContext('2d');c.scale(scale,scale);
 c.font='bold '+size+'px "Noto Sans CJK SC", sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';const x=canvas.width/scale/2,y=canvas.height/scale/2;
 c.strokeStyle='#67370f';c.lineWidth=2.4;c.strokeText(label,x,y+1.5);
 const g=c.createLinearGradient(0,y-size/2,0,y+size/2);g.addColorStop(0,'#fff4c1');g.addColorStop(.45,'#ffdc6c');g.addColorStop(.55,'#edb63b');g.addColorStop(1,'#d38b1f');c.fillStyle=g;c.fillText(label,x,y);
 return {canvas,w:canvas.width/scale,h:canvas.height/scale};
}
function preload(renderer){if(renderer._battleGlyphs)return;renderer._battleGlyphs={eat:makeGlyph(renderer,'吃',76),check:makeGlyph(renderer,'将军',50)};}
function glyph(renderer,key,x,y,alpha,scale=1){if(alpha<=0)return;preload(renderer);const g=renderer._battleGlyphs[key],c=renderer.ctx;c.save();c.globalAlpha=alpha;c.translate(x,y);c.scale(scale,scale);c.drawImage(g.canvas,-g.w/2,-g.h/2,g.w,g.h);c.restore();}
const EAT_DURATION=1100;
function eatEnvelope(age){return age<0||age>=EAT_DURATION?0:age<120?smooth(age/120):age<680?1:1-smooth((age-680)/420);}
function eatLabel(renderer,age){
 const alpha=eatEnvelope(age);if(alpha<=0)return;
 const scale=age<130?.92+.11*smooth(age/130):1.03-.03*smooth((age-130)/100);
 glyph(renderer,'eat',360,376-3*smooth(age/EAT_DURATION),alpha,scale);
}
function eatText(renderer,motion,elapsed){const m=motion.move;if(m.capturedId||(m.capturedIds&&m.capturedIds.length))eatLabel(renderer,elapsed-(motion.timings||timing(m)).contact);}
function cue(renderer,event,now,flipped){
 if(!event)return;if(event.type==='eat'){eatLabel(renderer,now-event.at);return;}const age=now-event.at,duration=event.duration||650;if(age<0||age>=duration)return;
 const t=age/duration,alpha=Math.min(smooth(age/90),1-smooth((age-(duration-180))/180));
 if(event.warning){if(event.king){const q=renderer.boardPoint(event.king,flipped);ring(renderer.ctx,q.x,q.y,35+12*smooth(t),'#cf4d2a',alpha*.65,2);ring(renderer.ctx,q.x,q.y,33+6*smooth(t),'#f0ba58',alpha*.45,1);}
  glyph(renderer,'check',360,300,alpha,.96+.04*smooth(age/130));
 }else{
  // Terminal convergence: local corner strokes only; result modal keeps its own timer.
  const c=renderer.ctx;c.save();c.globalAlpha=.45*alpha;c.strokeStyle='#e6b457';c.lineWidth=1.5;const d=70-14*smooth(t);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=360+Math.cos(a)*d,y=376+Math.sin(a)*d;c.beginPath();c.moveTo(x-6,y);c.lineTo(x,y-6);c.lineTo(x+6,y);c.stroke();}c.restore();
 }
}
function drawCues(renderer,events,now,flipped){let eat=null;for(const e of events){if(e.type==='eat'){if(now>=e.at&&now<e.at+e.duration&&(!eat||e.at>=eat.at))eat=e;}else cue(renderer,e,now,flipped);}if(eat)cue(renderer,eat,now,flipped);}
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
module.exports={timing,pose,smooth,particles,selection,under,over,eatText,eatEnvelope,EAT_DURATION,drawCues,cue,preload,warningPhase,danger,frame,rings};
