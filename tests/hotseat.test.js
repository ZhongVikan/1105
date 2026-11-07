const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),Clock=require('../utils/turn-clock'),Online=require('../utils/online'),Renderer=require('../src/renderer');

function page(state=G.newGame(undefined,'classic')){
 const c=Object.assign({},Controller,{data:{...Controller.data,mode:'online',waiting:true,onlineMatch:false},_alive:true,_mode:'online',_room:{roomId:'r',rev:2,waiting:true},_state:state,_history:[],_repetitionHistory:[],_clock:new Clock(),_audio:{effect(){},event(){},speak(){},cancelCountdown(){},cancelBattleQueue(){}},_token:0});
 c.setData=patch=>Object.assign(c.data,patch);c.sync=()=>{};c.toast=()=>{};return c;
}

test('waiting friend room can switch to offline hotseat without keeping network state',async()=>{
 const original=Online.call,calls=[];Online.call=async(...args)=>{calls.push(args);return {ok:true};};
 try{const c=page();assert.equal(c.startHotseat(),true);await Promise.resolve();assert.equal(c._mode,'local');assert.equal(c.data.mode,'local');assert.equal(c.data.waiting,false);assert.equal(c.data.onlineMatch,false);assert.equal(c._room,null);assert.deepEqual(calls,[['cancel',{roomId:'r',rev:2}]]);}finally{Online.call=original;}
});

test('hotseat mode lets both sides move manually and never schedules AI',async()=>{
 const c=page();c._mode='local';c.data={...c.data,mode:'local',waiting:false,onlineMatch:false};c._room=null;c._clock.start();let auto=0;c.scheduleAI=()=>{auto++;};
 const moveFor=side=>{const piece=c._state.pieces.find(p=>p.side===side);let to=null;for(let y=0;y<10&&!to;y++)for(let x=0;x<9;x++)if(G.legalAttempt(c._state.pieces,piece.id,{x,y},side))to={x,y};return {piece,to};};
 let m=moveFor('red');await c.onPoint({detail:{pieceId:m.piece.id,point:{x:m.piece.x,y:m.piece.y}}});await c.onPoint({detail:{pieceId:null,point:m.to}});
 assert.equal(c._state.ply,1);assert.equal(c._state.turn,'black');
 m=moveFor('black');await c.onPoint({detail:{pieceId:m.piece.id,point:{x:m.piece.x,y:m.piece.y}}});await c.onPoint({detail:{pieceId:null,point:m.to}});
 assert.equal(c._state.ply,2);assert.equal(c._state.turn,'red');assert.equal(auto,0);
});

test('hotseat rotates black pieces and supports a timer-only pause',()=>{
 const r=Object.create(Renderer.prototype);
 assert.equal(r.pieceShouldRotate({mode:'local'},{hidden:true,side:'red',x:4,y:0}),true);
 assert.equal(r.pieceShouldRotate({mode:'local'},{hidden:true,side:'red',x:4,y:9}),false);
 assert.equal(r.pieceShouldRotate({mode:'local'},{hidden:false,side:'black'}),true);
 assert.equal(r.pieceShouldRotate({mode:'ai'},{hidden:false,side:'black'}),false);
 const rotations=[];r.ctx={save(){},restore(){},translate(){},rotate(angle){rotations.push(angle)}};r.disc=()=>{};r.orientedDisc(0,0,10,{side:'red',hidden:false,text:'兵'},{mode:'local'},false,true);assert.deepEqual(rotations,[Math.PI]);rotations.length=0;r.orientedDisc(0,0,10,{side:'black',hidden:false,text:'卒'},{mode:'local'},false,false);assert.deepEqual(rotations,[]);
 const c=page();c._mode='local';c.data={...c.data,mode:'local',waiting:false};c._room=null;c._clock.start();c.togglePause();assert.equal(c.data.manualPaused,true);assert.ok(c._clock.reasons.has('manual'));c.togglePause();assert.equal(c.data.manualPaused,false);assert.equal(c._clock.reasons.has('manual'),false);
});
