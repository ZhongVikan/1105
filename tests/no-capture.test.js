const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../utils/game-engine'),N=require('../utils/no-capture'),Clock=require('../utils/turn-clock');
const Controller=require('../src/controller'),Server=require('../cloudfunctions/gameService/service');
const ServerEngine=require('../cloudfunctions/gameService/shared/game-engine');
const {state,p,scenarios}=require('../tools/recording/fixtures');

for(const variant of ['dark','classic','jieqi','fusion'])test(variant+' draws after 80 completed turns since the previous capture',()=>{
 const start=state(variant,[p('pawn','pawn','red',0,6),p('b','rook','black',8,2)]);
 start.ply=82;
 start.captured=[{...p('last','pawn','black',0,5),capturedBy:'red',atPly:4}];
 const before=G.move(start,'pawn',{x:0,y:5});
 assert.ok(before.ok);assert.equal(N.turns(before.state),79);assert.equal(before.state.status,'playing');
 const limit=G.move(before.state,'b',{x:8,y:3});
 assert.ok(limit.ok);assert.equal(N.turns(limit.state),80);
 assert.equal(limit.state.reason,N.DRAW_REASON);assert.equal(limit.state.winner,null);assert.equal(limit.event,'move');
 assert.deepEqual(ServerEngine.move(before.state,'b',{x:8,y:3}),limit);
 assert.equal(G.move(limit.state,'pawn',{x:0,y:4}).ok,false);
});

test('captures reset the streak at the limit, including a chase before the turn is complete',()=>{
 const start=scenarios.capture();start.ply=79;
 const taken=G.move(start,'r',{x:2,y:4});
 assert.ok(taken.ok);assert.equal(taken.state.status,'playing');assert.equal(N.turns(taken.state),0);
 assert.equal(N.turns(G.move(taken.state,'b',{x:8,y:3}).state),1);

 const chase=scenarios.chase();chase.ply=79;
 const first=G.move(chase,'x',{x:1,y:5});
 assert.equal(first.event,'chase');assert.equal(first.state.ply,79);assert.equal(N.turns(first.state),0);
 for(const followUp of [null,{x:2,y:3}]){
  const complete=G.move(first.state,'x',followUp);
  assert.ok(complete.ok);assert.equal(complete.state.ply,80);
  assert.equal(complete.state.status,'playing');assert.equal(N.turns(complete.state),0);
 }
 const merge=scenarios.fusion();merge.ply=79;
 const friendly=G.move(merge,'h',{x:3,y:5});
 assert.ok(friendly.ok);assert.equal(friendly.event,'fusion');assert.equal(friendly.state.reason,N.DRAW_REASON);
});

test('checkmate on the draw boundary still ends with the winner',()=>{
 const finish=state('classic',[
  p('r','rook','red',3,2),p('left','rook','red',3,1),p('right','rook','red',5,1),p('block','pawn','red',4,6),
 ]);
 finish.pieces.find(piece=>piece.id==='bk').x=4;
 finish.ply=79;
 const won=G.move(finish,'r',{x:4,y:2});
 assert.ok(won.ok);assert.equal(won.state.reason,'checkmate');assert.equal(won.state.winner,'red');
});

function controller(t,start,mode){
 const messages=[],c={...Controller,data:{...Controller.data,mode},_state:start,_mode:mode,_alive:true,_token:0,_history:[],_repetitionHistory:[],_clock:new Clock(),
  _audio:{event(){}},setData(patch){Object.assign(this.data,patch);},toast(message){messages.push(message);}};
 c._clock.start();t.after(()=>{c.clearPresentation();clearTimeout(c._resultTimer);});
 return {c,messages};
}

test('local warning appears at 30 rounds and can reappear after a capture resets the streak',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const start=state('classic',[p('r','rook','red',0,7),p('b','rook','black',0,3)]);start.ply=59;
 const {c,messages}=controller(t,start,'local');
 c.sync();assert.equal(messages.length,0);
 assert.ok(c.localMove('r',{x:0,y:6}));assert.equal(N.turns(c._state),60);
 assert.deepEqual(messages,['已连续30回合未吃子，10回合后判和']);
 c.flip();assert.equal(messages.length,1);
 assert.ok(c.localMove('b',{x:0,y:6}));assert.equal(N.turns(c._state),0);
 c._state={...c._state,ply:120};c.sync();assert.equal(messages.length,1);
 assert.ok(c.localMove('rk',{x:5,y:9}));assert.equal(N.turns(c._state),60);assert.equal(messages.length,2);
});

test('both online players warn once from the confirmed room and see the same draw',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const start=scenarios.walk();start.ply=59;
 const red=controller(t,start,'online'),black=controller(t,start,'online');
 const room={id:'room',rev:0,state:start,red:{uid:'R',nickname:'甲'},black:{uid:'B',nickname:'乙'},history:[],deadline:61000};
 const apply=(client,uid)=>client.c.applyRoom(Server.publicRoom(room,uid,Date.now()));
 apply(red,'R');apply(black,'B');
 const move={id:'r',to:{x:0,y:6}};
 assert.ok(red.c.beginOptimisticMove(move));assert.equal(red.messages.length,0);
 Server.reduce(room,'R',{...move,action:'move',rev:room.rev},Date.now());
 apply(red,'R');apply(red,'R');assert.equal(red.messages.length,1);
 black.c._hidden=true;apply(black,'B');assert.equal(black.messages.length,0);
 black.c._hidden=false;apply(black,'B');apply(black,'B');assert.deepEqual(black.messages,red.messages);
 room.state={...room.state,ply:79};
 Server.reduce(room,'B',{action:'move',id:'b',to:{x:8,y:3},rev:room.rev},Date.now());
 apply(red,'R');apply(black,'B');
 assert.equal(room.state.reason,N.DRAW_REASON);assert.equal(room.state.winner,null);
 for(const {c,messages} of [red,black]){
  assert.equal(c.data.ended,true);assert.equal(c.data.resultTitle,'无吃子和棋');assert.equal(c.data.resultDetail,'连续40回合未吃子');
  assert.equal(messages.length,1);
 }
});
