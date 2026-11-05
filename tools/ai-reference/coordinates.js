// All positions are logical intersections, never screen pixels.
const WIDTH = 720, HEIGHT = 800, PAD = 40, STEP = 80;
function valid(p) { return !!p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x>=0 && p.x<=8 && p.y>=0 && p.y<=9; }
function orient(p, flipped=false) { if (!valid(p)) throw new RangeError('Invalid intersection'); return flipped ? {x:8-p.x,y:9-p.y} : {x:p.x,y:p.y}; }
function toPixel(p, flipped=false) { const v=orient(p,flipped); return {x:PAD+v.x*STEP,y:PAD+v.y*STEP}; }
function fromPixel(px,py,flipped=false) {
 if (!Number.isFinite(px)||!Number.isFinite(py)) return null;
 const x=Math.round((px-PAD)/STEP)||0, y=Math.round((py-PAD)/STEP)||0;
 if (!valid({x,y})) return null;
 // Nearest intersection only; reject grid-cell corners and outer frame.
 if (Math.hypot(px-(PAD+x*STEP),py-(PAD+y*STEP))>STEP*0.46) return null;
 return orient({x,y},flipped);
}
function fromClient(clientX,clientY,rect,flipped=false) {
 if (!rect||rect.width<=0||rect.height<=0) return null;
 return fromPixel((clientX-rect.left)*WIDTH/rect.width,(clientY-rect.top)*HEIGHT/rect.height,flipped);
}
function lines() {
 const out=[]; const add=(x1,y1,x2,y2)=>out.push({x1,y1,x2,y2});
 for(let y=0;y<10;y++) add(PAD,PAD+y*STEP,WIDTH-PAD,PAD+y*STEP);
 for(let x=0;x<9;x++) {
  const px=PAD+x*STEP;
  if(x===0||x===8) add(px,PAD,px,HEIGHT-PAD);
  else {add(px,PAD,px,PAD+4*STEP);add(px,PAD+5*STEP,px,HEIGHT-PAD);}
 }
 for(const y of [0,7]) {add(PAD+3*STEP,PAD+y*STEP,PAD+5*STEP,PAD+(y+2)*STEP);add(PAD+5*STEP,PAD+y*STEP,PAD+3*STEP,PAD+(y+2)*STEP);}
 return out;
}
function initialPieces() {
 const pieces=[];
 const rows={black:['車','馬','象','士','將','士','象','馬','車'],red:['俥','傌','相','仕','帥','仕','相','傌','俥']};
 for(const side of ['black','red']) {
  const y=side==='black'?0:9;
  rows[side].forEach((text,x)=>pieces.push({id:side+'-back-'+x,side,text,x,y,hidden:false,general:x===4}));
  [1,7].forEach(x=>pieces.push({id:side+'-cannon-'+x,side,text:side==='red'?'炮':'砲',x,y:side==='black'?2:7,hidden:false}));
  [0,2,4,6,8].forEach(x=>pieces.push({id:side+'-pawn-'+x,side,text:side==='red'?'兵':'卒',x,y:side==='black'?3:6,hidden:false}));
 }
 return pieces;
}
function validatePieces(pieces) {
 const occupied=new Set(), ids=new Set();
 for(const p of pieces) {
  if(!valid(p)||!p.id||ids.has(p.id)||occupied.has(p.x+','+p.y)||!['red','black'].includes(p.side)) throw new Error('Invalid / overlapping piece data');
  ids.add(p.id); occupied.add(p.x+','+p.y);
 }
 return true;
}
module.exports={WIDTH,HEIGHT,PAD,STEP,valid,orient,toPixel,fromPixel,fromClient,lines,initialPieces,validatePieces};
