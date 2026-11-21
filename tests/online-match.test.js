const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),Runtime=require('../src/runtime'),Online=require('../utils/online');

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

test('an opponent profile wins over an inconsistent waiting flag',()=>{
 const c=controller(),state=G.newGame(undefined,'classic');
 c.applyRoom({roomId:'r',rev:1,side:'red',red:{nickname:'红方'},black:{nickname:'黑方'},match:true,waiting:true,state,serverNow:2});
 assert.equal(c.data.waiting,false);assert.equal(c._room.waiting,false);assert.equal(c.data.topName,'黑方');
});

test('post-match board taps ignore stale waiting hitboxes',()=>{
 let clicked=0,moved;
 const runtime={scene:'game',touch:{x:10,y:10,lastY:10,moved:false,scene:'game'},renderer:{_targetState:{scene:'game',waiting:true},targets:[{x:0,y:0,w:100,h:100,action:()=>{clicked++;}}],boardRect:{x:0,y:0,w:100,h:100},boardHit(){return {x:0,y:0};}},controller:{data:{waiting:false,showResult:false,showStickers:false,flipped:false,inference:false,pieces:[]},onPoint:event=>{moved=event.detail;}},audio:{effect(){}},position(t){return {x:t.clientX,y:t.clientY};}};
 Runtime.prototype.touchEnd.call(runtime,{changedTouches:[{clientX:10,clientY:10}]});
 assert.equal(clicked,0);assert.deepEqual(moved.point,{x:0,y:0});
});

for(const action of ['cancelWait','activateFakeOpponent','startHotseat'])test(`${action} stays online if the server paired a player first`,async t=>{
 const c=controller(),state=G.newGame(undefined,'classic');
 const waiting={roomId:'r',rev:0,side:'red',red:{nickname:'R'},black:null,waiting:true,state};
 c.applyRoom(waiting);
 c.startPolling=()=>{};
 c.home=()=>assert.fail('cannot leave an already paired room');
 let resolve;
 t.mock.method(Online,'call',name=>{
  assert.equal(name,'cancel');
  return new Promise(done=>{resolve=done;});
 });
 const exit=c[action]();
 assert.equal(c._mode,'online');
 resolve({...waiting,rev:1,waiting:false,starting:true,black:{nickname:'B'}});
 assert.equal(await exit,false);
 assert.equal(c._room.roomId,'r');assert.equal(c.data.starting,true);
});

test('after a finished match loses a seat, the remaining player can search again',async()=>{
 const c=controller(),state={...G.newGame(undefined,'classic'),status:'ended'};
 const room={roomId:'r',rev:2,side:'red',red:{nickname:'R'},black:{nickname:'B'},waiting:false,state,match:true};
 c.applyRoom(room);
 c.data.ended=true;
 let launched;
 c.runtime={startGame:async options=>{launched=options;return true;}};
 c.applyRoom({...room,rev:3,black:null,waiting:true,canRematch:false});
 assert.equal(c.data.waiting,false);
 assert.equal(c.data.canRematch,false);
 assert.equal(await c.restart(),true);
 assert.deepEqual(launched,{mode:'online',match:'1',variant:'classic'});
});

test('cancelling before room creation finishes releases the room that was just created',async t=>{
 const c=controller(),state=G.newGame(undefined,'classic');
 let finishEntry,left=false,called=false;
 c._entryRequest=new Promise(resolve=>{finishEntry=resolve;});
 c.home=()=>{left=true;};
 c.startPolling=()=>{};
 t.mock.method(Online,'call',async(action,params)=>{
  called=true;assert.equal(action,'cancel');assert.equal(params.roomId,'r');
  return {cancelled:true};
 });
 const cancel=c.cancelWait();
 assert.equal(called,false);assert.equal(left,false);
 finishEntry({roomId:'r',rev:0,waiting:true,state});
 assert.equal(await cancel,true);assert.equal(called,true);assert.equal(left,true);
});

test('an expired queue snapshot re-enters the same variant when the client polls again',async t=>{
 const c=controller(),state=G.newGame(undefined,'jieqi'),calls=[];
 const waiting={roomId:'r',rev:0,side:'red',red:{nickname:'R'},black:null,waiting:true,state,match:true};
 c.applyRoom(waiting);
 t.mock.method(Online,'call',async(action,params)=>{
  calls.push([action,params]);
  return action==='poll'?{...waiting,queueExpired:true}:{...waiting,roomId:'new'};
 });
 await c.poll();
 assert.deepEqual(calls,[['poll',{roomId:'r',rev:0}],['match',{variant:'jieqi'}]]);
 assert.equal(c._room.roomId,'new');assert.equal(c.data.waiting,true);
});

test('an intervening poll does not cancel the match notice cleanup',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const c=controller(),state=G.newGame(undefined,'classic');
 const room={roomId:'r',rev:2,side:'red',red:{nickname:'R'},black:{nickname:'B'},waiting:false,state,match:true};
 c.applyRoom(room);
 t.mock.timers.tick(650);
 c.applyRoom(room);
 assert.equal(c.data.matchFound,true);
 t.mock.timers.tick(250);
 assert.equal(c.data.matchFound,false);
});
