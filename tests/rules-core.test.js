const test=require('node:test'),a=require('node:assert/strict'),R=require('../utils/rules-core');
const piece=(kind,x,y,side='red',hidden=false)=>({id:'p',kind,x,y,side,hidden});
test('hidden control follows half, revealed control follows actual identity',()=>{
 const p=piece('horse',1,7,'black',true);a.equal(R.controller(p),'red');a.equal(R.controller({...p,hidden:false}),'black');
 a.equal(R.controller({...p,y:4}),'black');a.equal(R.controller({...p,y:5}),'red');
});
test('hidden friendly fire allowed, revealed friendly capture forbidden',()=>{
 a.equal(R.canCapture('red',piece('rook',2,2,'red',true)),true);
 a.equal(R.canCapture('red',piece('rook',2,2)),false);
});
test('hidden cannon-location movement never consults secret role or side',()=>{
 for(const kind of ['horse','pawn','rook'])for(const side of ['red','black']){
  const p=piece(kind,1,7,side,true);a.equal(R.canReach([p],p,{x:1,y:4},'red'),true);
  a.equal(R.canReach([p],p,{x:2,y:5},'red'),false);
 }
 a.equal(R.openingRole({x:4,y:4}),null);
 const p=piece('rook',4,4,'red',true);a.throws(()=>R.canReach([p],p,{x:4,y:3},'black'),/UNRESOLVED/);
});
test('advisor crosses river and elephant eye blocks either identity',()=>{
 const p=piece('advisor',2,5);a.equal(R.canReach([p],p,{x:3,y:4},'red'),true);
 const e=piece('elephant',2,5);a.equal(R.canReach([e],e,{x:4,y:3},'red'),true);
 a.equal(R.canReach([e,piece('pawn',3,4,'black',true)],e,{x:4,y:3},'red'),false);
});
test('horse leg, rook blocker, cannon screen, pawn direction and palace',()=>{
 let p=piece('horse',4,5);a.equal(R.canReach([p,piece('pawn',5,5)],p,{x:6,y:4},'red'),false);
 p=piece('rook',0,5);a.equal(R.canReach([p,piece('pawn',0,4)],p,{x:0,y:2},'red'),false);
 p=piece('cannon',0,5);const target=piece('pawn',0,2,'red',true);
 a.equal(R.canReach([p,target],p,target,'red'),false);
 a.equal(R.canReach([p,target,piece('pawn',0,4)],p,target,'red'),true);
 p=piece('pawn',2,5);a.equal(R.canReach([p],p,{x:3,y:5},'red'),false);
 p=piece('pawn',2,4);a.equal(R.canReach([p],p,{x:3,y:4},'red'),true);a.equal(R.canReach([p],p,{x:2,y:5},'red'),false);
 p=piece('general',3,9);a.equal(R.canReach([p],p,{x:2,y:9},'red'),false);
});
test('100 shuffled openings retain traditional slots, inventory and both-side spies',()=>{
 let seed=7919;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const C=require('../utils/coordinates');
 const expected=C.initialPieces().map(p=>p.x+','+p.y).sort();
 for(let i=0;i<100;i++){
  const p=R.initialHiddenLayout(rng);a.equal(p.length,32);
  a.deepEqual(p.map(v=>v.x+','+v.y).sort(),expected);
  a.equal(p.filter(v=>v.hidden).length,30);
  for(const side of ['red','black']){
   a.equal(p.filter(v=>v.side===side).length,16);
   const g=p.find(v=>v.general&&v.side===side);a.equal(g.hidden,false);a.equal(g.x,4);a.equal(g.y,side==='red'?9:0);
   const half=p.filter(v=>v.hidden&&R.controller(v)===side);a.equal(half.length,15);
   a.ok(half.some(v=>v.side!==side));a.ok(half.some(v=>v.side===side));
   const roles=p.filter(v=>v.side===side).map(v=>v.kind).sort();
   a.deepEqual(roles,['general','rook','rook','horse','horse','elephant','elephant','advisor','advisor','cannon','cannon','pawn','pawn','pawn','pawn','pawn'].sort());
  }
  a.ok(p.filter(v=>v.hidden).every(v=>R.openingRole(v)));
 }
});
test('hidden advisor starts with palace rules; revealed advisor is unrestricted',()=>{
 const p=piece('rook',3,9,'black',true);
 a.equal(R.canReach([p],p,{x:2,y:8},'red'),false);
 a.equal(R.canReach([p],p,{x:4,y:8},'red'),true);
 const q=piece('advisor',3,9);a.equal(R.canReach([q],q,{x:2,y:8},'red'),true);
});
