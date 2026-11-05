const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),AI=require('../utils/ai'),Renderer=require('../src/renderer'),Runtime=require('../src/runtime');

function syncController(profile,fake=null){
 const c=Object.assign({},Controller,{data:{...Controller.data,mode:'ai',flipped:false},runtime:{profile},_mode:'ai',_fakeOpponent:fake,_level:'normal',_state:G.newGame(undefined,'classic'),_alive:true,_history:[],_repetitionHistory:[],_clock:{seconds:()=>60,reasons:new Set()},_audio:{}});
 c.setData=patch=>Object.assign(c.data,patch);c.presentTransition=()=>{};c.updateResult=()=>{};return c;
}

test('boot gate keeps fallback demo UI hidden while assets load',()=>{
 const context=new Proxy({measureText:t=>({width:String(t).length*10})},{get:(o,k)=>k in o?o[k]:()=>{}});
 global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};global.wx={createCanvas:()=>({getContext:()=>context}),getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:20,bottom:800}}),getMenuButtonBoundingClientRect:()=>({bottom:52})};
 const r=new Renderer({scene:'home',controller:null});r._uiBooting=true;r.draw();assert.deepEqual(r.targets,[]);delete global.wx;delete global.requestAnimationFrame;delete global.cancelAnimationFrame;
});

test('online undo sends an undo request instead of a restart request',()=>{
 const c=Object.assign({},Controller,{data:{...Controller.data,mode:'online'},_mode:'online',_alive:true,_state:G.newGame(undefined,'classic'),_room:{roomId:'r',rev:3,black:{nickname:'对手'},waiting:false},_audio:{}});let call;
 c.setData=patch=>Object.assign(c.data,patch);c.sync=()=>{};c.command=(action,data)=>{call=[action,data];};c.undo();assert.deepEqual(call,['request',{kind:'undo'}]);assert.equal(c.data.pendingRequest,'undo');
});

test('fake opponent undo restores the previous position instead of starting a new game',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});const originalRandom=Math.random;Math.random=()=>0;
 try{
  const initial=G.newGame(undefined,'classic'),move=AI.moves(initial.pieces,'red')[0],after=G.move(initial,move.id,move.to).state;let syncs=0;
  const c=Object.assign({},Controller,{data:{...Controller.data},_fakeOpponent:{nickname:'拟真人'},_alive:true,_state:after,_history:[initial],_repetitionHistory:[],_clock:{start(){}},_audio:{},setData(p){Object.assign(this.data,p)},sync(){syncs++;},toast(){},scheduleAI(){}});
  c.requestFake('undo');t.mock.timers.tick(1200);assert.equal(c._state,initial);assert.equal(c.data.pendingRequest,'');assert.ok(syncs>=2);
 }finally{Math.random=originalRandom;}
});

test('fake opponent stickers observe a 30 second cooldown',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});const originalRandom=Math.random;Math.random=()=>0;
 try{let shown=0;const c=Object.assign({},Controller,{_fakeOpponent:{nickname:'拟真人'},_alive:true,_state:{status:'playing'},_fakeBotStickerCooldownUntil:0,showSticker(){shown++;}});assert.equal(c.queueFakeSticker(),true);assert.equal(c.queueFakeSticker(),false);assert.equal(c._fakeBotStickerCooldownUntil,30000);t.mock.timers.tick(250);assert.equal(shown,1);}
 finally{Math.random=originalRandom;}
});

test('local and fake games show the logged-in player profile in the player bar',()=>{
 const profile={nickname:'微信玩家',avatar:'cloud://avatar'};const local=syncController(profile);local.sync();assert.equal(local.data.bottomName,'微信玩家');assert.equal(local.data.bottomAvatar,'cloud://avatar');
 const fake=syncController(profile,{nickname:'拟真人',avatar:''});fake.sync();assert.equal(fake.data.bottomName,'微信玩家');assert.equal(fake.data.bottomAvatar,'cloud://avatar');assert.equal(fake.data.topName,'拟真人');
});

test('match fallback starts between ten and twenty seconds',()=>{
 const c=Object.assign({},Controller,{data:{...Controller.data,onlineMatch:true},_alive:true,_matchQueue:true,_matchResolved:false,_room:null,_state:G.newGame(),setData(p){Object.assign(this.data,p)},sync(){},tick(){}});
 const originalRandom=Math.random;Math.random=()=>0;try{c.applyRoom({roomId:'r',rev:0,side:'red',red:{nickname:'R'},black:null,match:true,waiting:true,state:c._state,serverNow:1});assert.equal(c._matchFallbackAt,10);}finally{Math.random=originalRandom;}
});

test('post-match touch dispatch uses the current waiting state',()=>{
 let clicked=0,moved;const runtime={scene:'game',touch:{x:10,y:10,lastY:10,moved:false,scene:'game'},renderer:{_targetState:{scene:'game',waiting:true},targets:[{x:0,y:0,w:100,h:100,action:()=>clicked++}],boardRect:{x:0,y:0,w:100,h:100},boardHit(){return {x:0,y:0};}},controller:{data:{waiting:false,showResult:false,showStickers:false,flipped:false,inference:false,pieces:[]},onPoint:e=>moved=e.detail},audio:{effect(){}},position:t=>({x:t.clientX,y:t.clientY})};
 Runtime.prototype.touchEnd.call(runtime,{changedTouches:[{clientX:10,clientY:10}]});assert.equal(clicked,0);assert.deepEqual(moved.point,{x:0,y:0});
});
