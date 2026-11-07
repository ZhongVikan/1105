const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),Runtime=require('../src/runtime');

function controller(){
 const c=Object.assign({},Controller,{data:{...Controller.data,mode:'online',onlineMatch:true},_alive:true,_mode:'online',_matchQueue:true,_matchResolved:false,_onlineSide:null,_room:null,_state:null,_token:0,_clock:{reasons:new Set()},_audio:{effect(){},event(){},speak(){},cancelCountdown(){},cancelBattleQueue(){}}});
 c.setData=patch=>Object.assign(c.data,patch);c.sync=()=>{};c.tick=()=>{};c.stopCountdownCue=()=>{};return c;
}

test('matched room keeps the player side active and ignores a stale waiting response',async()=>{
 const c=controller(),state=G.newGame(undefined,'classic');
 const waiting={roomId:'r',rev:0,side:'red',red:{nickname:'红方'},black:null,match:true,waiting:true,state,serverNow:1};
 c.applyRoom(waiting);
 c.applyRoom({...waiting,rev:1,black:{nickname:'黑方'},waiting:false,serverNow:2});
 assert.equal(c.data.waiting,false);assert.equal(c._room.waiting,false);assert.equal(c._onlineSide,'red');
 c.data.onlineMatch=false;c._matchQueue=false;
 c.applyRoom({...waiting,rev:2,match:false,serverNow:3});
 assert.equal(c.data.waiting,false);assert.equal(c._room.waiting,false);assert.equal(c._room.rev,1);
 let move;
 c.command=async(...args)=>{move=args;};
 const piece=state.pieces.find(p=>p.side==='red');let to=null;
 for(let y=0;y<10&&!to;y++)for(let x=0;x<9;x++)if(G.legalAttempt(state.pieces,piece.id,{x,y},'red'))to={x,y};
 await c.onPoint({detail:{pieceId:piece.id,point:{x:piece.x,y:piece.y}}});
 await c.onPoint({detail:{pieceId:null,point:to}});
 assert.deepEqual(move,['move',{id:piece.id,to}]);
});

test('matched session ignores an old waiting response even when its room id is stale',()=>{
 const c=controller(),state=G.newGame(undefined,'classic');
 const waiting={roomId:'r',rev:0,side:'red',red:{nickname:'红方'},black:null,match:true,waiting:true,state,serverNow:1};
 c.applyRoom(waiting);
 c.applyRoom({...waiting,rev:1,black:{nickname:'黑方'},waiting:false,serverNow:2});
 c.applyRoom({...waiting,roomId:'old-room',rev:99,serverNow:3});
 assert.equal(c.data.waiting,false);assert.equal(c._room.roomId,'r');assert.equal(c._room.waiting,false);assert.equal(c.data.topName,'黑方');
});

test('post-match board taps ignore stale waiting hitboxes',()=>{
 let clicked=0,moved;
 const runtime={scene:'game',touch:{x:10,y:10,lastY:10,moved:false,scene:'game'},renderer:{_targetState:{scene:'game',waiting:true},targets:[{x:0,y:0,w:100,h:100,action:()=>{clicked++;}}],boardRect:{x:0,y:0,w:100,h:100},boardHit(){return {x:0,y:0};}},controller:{data:{waiting:false,showResult:false,showStickers:false,flipped:false,inference:false,pieces:[]},onPoint:event=>{moved=event.detail;}},audio:{effect(){}},position(t){return {x:t.clientX,y:t.clientY};}};
 Runtime.prototype.touchEnd.call(runtime,{changedTouches:[{clientX:10,clientY:10}]});
 assert.equal(clicked,0);assert.deepEqual(moved.point,{x:0,y:0});
});
