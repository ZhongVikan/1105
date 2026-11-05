// Two compact converging arcs and a clipped reveal. Never changes the new piece artwork.
const FX=require('./battle-effects');
exports.draw=function(renderer,event,elapsed,flipped){
 const m=event.move,t=event.timings||FX.timing(m),age=elapsed-t.contact;if(age< -65||age>=280)return;
 const q=renderer.boardPoint(m.to,flipped),c=renderer.ctx,p=FX.smooth((age+65)/240),alpha=Math.sin(Math.PI*Math.min(1,(age+65)/345));
 c.save();c.globalAlpha=.65*alpha;c.strokeStyle='#f4c361';c.lineWidth=1.4;
 for(const sign of [-1,1]){c.beginPath();c.moveTo(q.x+sign*(42-28*p),q.y-18*(1-p));c.quadraticCurveTo(q.x+sign*23,q.y-31*(1-p),q.x+sign*(14-12*p),q.y);c.stroke();}
 if(age>=0&&age<150){const v=age/150;c.globalAlpha=.3*(1-v);c.beginPath();c.arc(q.x,q.y,29+12*FX.smooth(v),0,Math.PI*2);c.stroke();}
 // Short narrow sweep clipped to the existing disc, not a replacement glyph or badge.
 if(age>40&&age<240){const v=(age-40)/200;c.beginPath();c.arc(q.x,q.y,31,0,Math.PI*2);c.clip();c.globalAlpha=.32*Math.sin(Math.PI*v);c.fillStyle='#fff2bf';c.save();c.translate(q.x-42+84*v,q.y);c.rotate(-.35);c.fillRect(-2,-40,4,80);c.restore();}
 c.restore();
};
