const test=require('node:test'),a=require('node:assert/strict');
const F=require('../utils/fake-opponents'),Def=require('../src/controller'),G=require('../utils/game-engine'),Clock=require('../utils/turn-clock');
test('fake opponent pool has 100 supplied nicknames',()=>{a.equal(F.names.length,100);a.equal(new Set(F.names).size,100);});
test('fallback enters hard local AI after a waiting match',async()=>{const c={...Def,_alive:true,_mode:'online',_matchQueue:true,_room:{waiting:true,roomId:'',rev:0},_token:0,_clock:{start(){}},data:{},setData(p){Object.assign(this.data,p)},sync(){},scheduleAI(){}};await c.activateFakeOpponent();a.equal(c._mode,'ai');a.equal(c._level,'hard');a.equal(c.data.waiting,false);a.ok(c._fakeOpponent.nickname);});
test('fake match first local move is playable after fallback',async()=>{
 const state=G.newGame(undefined,'classic');
 const c=Object.assign({},Def,{data:{...Def.data,mode:'online',onlineMatch:true,waiting:true},_alive:true,_mode:'online',_matchQueue:true,_room:{roomId:'r',rev:0,waiting:true},_state:state,_token:0,_history:[],_repetitionHistory:[],_clock:new Clock(),_audio:{cancelCountdown(){},effect(){},event(){},speak(){},cancelBattleQueue(){}},runtime:null});
 c.setData=patch=>Object.assign(c.data,patch);c.presentTransition=()=>{};c.updateResult=()=>{};c.sync=Def.sync;c.scheduleAI=()=>{};c.toast=()=>{};c._clock.start();
 await c.activateFakeOpponent();
 const piece=c._state.pieces.find(p=>p.side==='red');let to=null;
 for(let y=0;y<10&&!to;y++)for(let x=0;x<9;x++)if(G.legalAttempt(c._state.pieces,piece.id,{x,y},'red'))to={x,y};
 await c.onPoint({detail:{pieceId:piece.id,point:{x:piece.x,y:piece.y}}});
 a.equal(c.data.selectedId,piece.id);
 await c.onPoint({detail:{pieceId:null,point:to}});
 a.equal(c._state.ply,1);a.equal(c._state.turn,'black');a.equal(c.data.selectedId,'');
 c._alive=false;
});
