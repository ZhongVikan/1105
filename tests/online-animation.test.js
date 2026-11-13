const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),Online=require('../utils/online');

function page(){
 const state=G.newGame(undefined,'classic');
 const c=Object.assign({},Controller,{data:{...Controller.data,mode:'online',onlineMatch:false},_alive:true,_hidden:false,_mode:'online',_state:state,_room:{roomId:'r',rev:0,side:'red',waiting:false,state},_audio:{event(){},effect(){},speak(){},cancelCountdown(){},cancelBattleQueue(){}},_networkFailures:0});
 c.setData=patch=>Object.assign(c.data,patch);c.sync();return c;
}
function moveFor(state,side){
 const p=state.pieces.find(v=>v.side===side);for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(G.legalAttempt(state.pieces,p.id,{x,y},side))return {id:p.id,to:{x,y}};
 throw Error('no legal move');
}

test('online move preview starts before the authoritative response and is not replayed',()=>{
 const c=page(),m=moveFor(c._state,'red'),preview=c.beginOptimisticMove(m);
 assert.ok(preview);assert.equal(c._battle.events.length,1);assert.equal(c.data.turn,'black');
 const authoritative=G.move(c._state,m.id,m.to);assert.ok(authoritative.ok);
 c.applyRoom({...c._room,rev:1,state:authoritative.state,event:authoritative.event,serverNow:Date.now(),red:{nickname:'R'},black:{nickname:'B'},waiting:false});
 assert.equal(c._battle.events.length,1,'the server response must reconcile the preview, not enqueue a second animation');
 assert.equal(c.data.ply,1);c._optimisticMove=null;c.clearPresentation();
});

test('failed online move preview rolls back to the authoritative board',()=>{
 const c=page(),before=JSON.stringify(c.data.pieces),m=moveFor(c._state,'red');assert.ok(c.beginOptimisticMove(m));assert.notEqual(JSON.stringify(c.data.pieces),before);
 c.rollbackOptimisticMove();assert.equal(JSON.stringify(c.data.pieces),before);assert.equal(c._battle.active(),false);
});

test('online command starts the move animation while the cloud request is pending',async()=>{
 const c=page(),m=moveFor(c._state,'red'),authoritative=G.move(c._state,m.id,m.to);assert.ok(authoritative.ok);
 const original=Online.call;let release;
 Online.call=()=>new Promise(resolve=>{release=()=>resolve({...c._room,rev:1,state:authoritative.state,event:authoritative.event,serverNow:Date.now(),red:{nickname:'R'},black:{nickname:'B'},waiting:false});});
 try{
  const request=c.command('move',m);await Promise.resolve();assert.equal(c._battle.events.length,1,'animation should begin before the network response');
  release();await request;assert.equal(c.data.ply,1);assert.equal(c._battle.events.length,1);c.clearPresentation();
 }finally{Online.call=original;c._optimisticMove=null;c.clearPresentation();}
});
