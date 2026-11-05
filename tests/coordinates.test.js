const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../utils/coordinates');
test('90 intersections round trip at six widths, three offsets and both orientations',()=>{
 for(const width of [240,320,375,390,430,768]) for(const [left,top] of [[0,0],[13,186],[29,-123]]) for(const flipped of [false,true]){
  const rect={left,top,width,height:width*C.HEIGHT/C.WIDTH};
  for(let y=0;y<10;y++)for(let x=0;x<9;x++){
   const p=C.toPixel({x,y},flipped);
   assert.deepEqual(C.fromClient(left+p.x/C.WIDTH*width,top+p.y/C.HEIGHT*rect.height,rect,flipped),{x,y});
  }
 }
});
test('standard 32 pieces with exact general/cannon/pawn placement and unique positions',()=>{
 const p=C.initialPieces();assert.equal(p.length,32);assert.ok(C.validatePieces(p));
 for(const side of ['red','black']){
  assert.equal(p.filter(v=>v.side===side).length,16);
  const g=p.find(v=>v.side===side&&v.general);assert.equal(g.x,4);assert.equal(g.y,side==='red'?9:0);
  assert.deepEqual(p.filter(v=>v.side===side&&v.id.includes('cannon')).map(v=>[v.x,v.y]),side==='red'?[[1,7],[7,7]]:[[1,2],[7,2]]);
  assert.deepEqual(p.filter(v=>v.side===side&&v.id.includes('pawn')).map(v=>[v.x,v.y]),[0,2,4,6,8].map(x=>[x,side==='red'?6:3]));
 }
 assert.throws(()=>C.validatePieces([...p,{...p[0],id:'duplicate-location'}]));
 assert.throws(()=>C.validatePieces([{id:'bad',side:'red',x:9,y:0}]));
});
test('river is exactly between rows 4 and 5; inner verticals do not cross river',()=>{
 const lines=C.lines();assert.equal(lines.length,30);
 assert.equal(lines.filter(l=>l.y1===l.y2).length,10);
 const midY=400;
 const crossing=lines.filter(l=>l.x1===l.x2&&l.y1<midY&&l.y2>midY);
 assert.deepEqual(crossing.map(l=>l.x1),[40,680]);
 assert.equal(lines.filter(l=>l.x1!==l.x2&&l.y1!==l.y2).length,4);
});
test('frame, cell centres, river centre, NaN and invalid rect cannot become a move',()=>{
 for(const [x,y] of [[0,0],[40,0],[720,760],[80,80],[360,400],[-20,40],[NaN,40]])assert.equal(C.fromPixel(x,y),null);
 assert.equal(C.fromClient(0,0,{width:0,height:0,left:0,top:0}),null);
 assert.equal(C.fromPixel(40+80*.47,40),null);
 assert.deepEqual(C.fromPixel(40+80*.45,40),{x:0,y:0});
});
test('flipping is an involution and never changes game state',()=>{
 const p=C.initialPieces(),before=JSON.stringify(p);
 for(const v of p){assert.deepEqual(C.orient(C.orient(v,true),true),{x:v.x,y:v.y});C.toPixel(v,true);}
 assert.equal(JSON.stringify(p),before);
 assert.deepEqual(C.toPixel({x:4,y:9},true),{x:360,y:40});
});
