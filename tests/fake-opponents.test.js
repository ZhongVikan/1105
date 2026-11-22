const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../utils/fake-opponents'),Def=require('../src/controller'),G=require('../utils/game-engine'),Clock=require('../utils/turn-clock'),Online=require('../utils/online');
function approveCancel(t,outcome={cancelled:true}){t.mock.method(Online,'call',async action=>{a.equal(action,'cancel');return outcome;});}
test('all 100 fake opponents have distinct packaged avatars shared by both rosters',()=>{
 const server=require('../cloudfunctions/gameService/shared/fake-opponents');
 const avatars=new Set();
 a.equal(F.names.length,100);a.equal(new Set(F.names).size,100);
 a.deepEqual(server.names,F.names);
 for(const [index,nickname] of F.names.entries()){
  const opponent=F.forNickname(nickname);
  a.deepEqual(F.pick(()=>(index+.5)/F.names.length),opponent);
  a.deepEqual(server.forNickname(nickname),opponent);
  a.match(opponent.avatar,/^uiV2_2\/fake-avatars\/\d{3}\.jpg$/);
  const image=fs.readFileSync(path.join(__dirname,'..',opponent.avatar));
  a.deepEqual([...image.subarray(0,3)],[255,216,255]);
  avatars.add(opponent.avatar);
 }
 a.equal(avatars.size,100);
});
test('fallback enters hard local AI with its fixed avatar after cancellation',async t=>{approveCancel(t);const c={...Def,_alive:true,_mode:'online',_matchQueue:true,_room:{waiting:true,roomId:'r',rev:0},_token:0,_clock:{start(){}},data:{},setData(p){Object.assign(this.data,p)},sync(){},scheduleAI(){}};await c.activateFakeOpponent();a.equal(c._mode,'ai');a.equal(c._level,'hard');a.equal(c.data.waiting,false);a.ok(c._fakeOpponent.avatar);a.deepEqual(c._fakeOpponent,F.forNickname(c._fakeOpponent.nickname));});
test('a cloud-selected fake opponent shows its avatar and plays the first local move',async t=>{
 const opponent=F.forNickname(F.names[38]);
 approveCancel(t,{cancelled:true,simulated:{id:'a'.repeat(32),nickname:opponent.nickname}});
 const state=G.newGame(undefined,'classic');
 const c=Object.assign({},Def,{data:{...Def.data,mode:'online',onlineMatch:true,waiting:true},_alive:true,_mode:'online',_matchQueue:true,_room:{roomId:'r',rev:0,waiting:true},_state:state,_token:0,_history:[],_repetitionHistory:[],_clock:new Clock(),_audio:{cancelCountdown(){},effect(){},event(){},speak(){},cancelBattleQueue(){}},runtime:null});
 c.setData=patch=>Object.assign(c.data,patch);c.presentTransition=()=>{};c.updateResult=()=>{};c.sync=Def.sync;c.scheduleAI=()=>{};c.toast=()=>{};c._clock.start();
 await c.activateFakeOpponent();
 a.equal(c.data.topName,opponent.nickname);
 a.equal(c.data.topAvatar,opponent.avatar);
 const piece=c._state.pieces.find(p=>p.side==='red');let to=null;
 for(let y=0;y<10&&!to;y++)for(let x=0;x<9;x++)if(G.legalAttempt(c._state.pieces,piece.id,{x,y},'red'))to={x,y};
 await c.onPoint({detail:{pieceId:piece.id,point:{x:piece.x,y:piece.y}}});
 a.equal(c.data.selectedId,piece.id);
 await c.onPoint({detail:{pieceId:null,point:to}});
 a.equal(c._state.ply,1);a.equal(c._state.turn,'black');a.equal(c.data.selectedId,'');
 c._alive=false;
});
test('fake fallback restores private dark pieces before local moves',async t=>{
 approveCancel(t);
 const privateState=G.newGame(()=>.4,'dark'),publicState={...privateState,pieces:G.displayPieces(privateState.pieces)};
 const c=Object.assign({},Def,{data:{...Def.data,mode:'online',onlineMatch:true,waiting:true},_alive:true,_mode:'online',_matchQueue:true,_room:{roomId:'r',rev:0,waiting:true},_state:publicState,_token:0,_history:[],_repetitionHistory:[],_clock:new Clock(),_audio:{cancelCountdown(){},effect(){},event(){},speak(){},cancelBattleQueue(){}},runtime:null});
 c.setData=patch=>Object.assign(c.data,patch);c.sync=()=>{};c.scheduleAI=()=>{};c.toast=()=>{};c._clock.start();
 try{await c.activateFakeOpponent();a.doesNotThrow(()=>G.validate(c._state));a.ok(c._state.pieces.some(p=>p.hidden&&p.kind));let chosen=null;for(const p of c._state.pieces){for(let y=0;y<10&&!chosen;y++)for(let x=0;x<9&&!chosen;x++)if(G.legalAttempt(c._state.pieces,p.id,{x,y},'red'))chosen={id:p.id,to:{x,y}};if(chosen)break;}a.ok(chosen);a.equal(c.localMove(chosen.id,chosen.to),true);}finally{c._alive=false;}
});
test('fake rematch rejection sends the next retry back to matchmaking',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});const originalRandom=Math.random,values=[0,.9];Math.random=()=>values.shift()??.9;
 try{
  let started=null;const state={...G.newGame(undefined,'classic'),status:'ended'};
  const c=Object.assign({},Def,{data:{...Def.data,showResult:true},_fakeOpponent:{nickname:'拟真人'},_fakeRestartRejected:false,_alive:true,_state:state,_history:[],_repetitionHistory:[],_token:0,_clock:{start(){}},_audio:{},runtime:{variant:'classic',startGame(options){started=options;}},setData(p){Object.assign(this.data,p)},sync(){},toast(){},scheduleAI(){}});
  c.requestFake('restart');t.mock.timers.tick(1200);a.equal(c._fakeRestartRejected,true);c.restart();a.deepEqual(started,{mode:'online',match:'1',variant:'classic'});a.equal(c._fakeRestartRejected,false);
 }finally{Math.random=originalRandom;}
});
