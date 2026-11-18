const test=require('node:test'),assert=require('node:assert/strict');
const Service=require('../cloudfunctions/gameService/service'),G=require('../cloudfunctions/gameService/shared/game-engine'),Controller=require('../src/controller'),Runtime=require('../src/runtime');

function room(){const state=G.newGame(undefined,'classic');return {id:'r',red:{uid:'R',nickname:'甲'},black:{uid:'B',nickname:'乙'},state,history:[],deadline:60000,rev:0,pauseUsed:{}};}

test('合棋与再来一局使用独立的每手请求额度',()=>{
 const r=room();Service.reduce(r,'R',{action:'request',kind:'draw',rev:0},1000);Service.reduce(r,'B',{action:'reply',accept:false,rev:1},2000);assert.equal(r.event,'draw-rejected');
 Service.reduce(r,'R',{action:'request',kind:'restart',rev:2},3000);assert.equal(r.pending.kind,'restart');Service.reduce(r,'B',{action:'reply',accept:false,rev:3},4000);
 assert.throws(()=>Service.reduce(r,'R',{action:'request',kind:'draw',rev:4},5000),/本手已请求过合棋/);
});

test('菜单动作不改变真人局截止时间',()=>{
 const r=room(),deadline=r.deadline;Service.reduce(r,'R',{action:'menuOpen',rev:0},1000);assert.equal(r.deadline,deadline);assert.equal(r.menuPause,undefined);Service.reduce(r,'R',{action:'menuClose',rev:r.rev},2000);assert.equal(r.deadline,deadline);
});

test('棋盘外点击会清除选中棋子',()=>{
 const c={data:{selectedId:'piece',inference:false},cancelSelectionCalled:0,cancelSelection(){this.cancelSelectionCalled++;}};
 const runtime={scene:'game',touch:{x:200,y:200,lastY:200,moved:false,scene:'game'},renderer:{_targetState:{scene:'game',waiting:false},targets:[],boardRect:{x:0,y:0,w:100,h:100},boardHit(){return null;}},controller:c,audio:{effect(){}},position:()=>({x:200,y:200})};
 Runtime.prototype.touchEnd.call(runtime,{changedTouches:[{clientX:200,clientY:200}]});assert.equal(c.cancelSelectionCalled,1);
});

test('拟真人协商合棋按 80% 概率拒绝并显示统一提示',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:0});const messages=[],state=G.newGame(undefined,'classic');const c=Object.assign({},Controller,{data:{...Controller.data,mode:'ai'},_alive:true,_mode:'ai',_fakeOpponent:{nickname:'拟真人'},_state:state,_clock:{start(){},reasons:new Set()},_audio:{},setData(p){Object.assign(this.data,p)},sync(){},toast:m=>messages.push(m),scheduleAI(){}});
 const originalRandom=Math.random;Math.random=()=>.5;try{c.requestFake('draw');assert.equal(messages[0],'已发送合棋请求，等待对方回应');t.mock.timers.tick(3000);assert.equal(messages.at(-1),'对方拒绝了合棋');}finally{Math.random=originalRandom;}
});

test('好友房间收到合棋拒绝时显示与匹配房间相同的反馈',()=>{
 const state=G.newGame(undefined,'classic'),messages=[];
 const c={...Controller,data:{...Controller.data,mode:'online',pendingRequest:'draw',pendingRequestLabel:'合棋',pendingUntil:Date.now()+10000},_alive:true,_mode:'online',_room:null,_state:state,_audio:{},setData(p){Object.assign(this.data,p);},sync(){},tick(){},toast:m=>messages.push(m)};
 c.applyRoom({roomId:'r',rev:0,side:'red',red:{nickname:'甲'},black:{nickname:'乙'},state,waiting:false,serverNow:Date.now(),deadline:Date.now()+60000});
 c.applyRoom({roomId:'r',rev:1,side:'red',red:{nickname:'甲'},black:{nickname:'乙'},state,waiting:false,serverNow:Date.now(),deadline:Date.now()+60000,event:'draw-rejected',requestResult:{kind:'draw',by:'red',label:'合棋',outcome:'rejected',seq:1}});
 assert.ok(messages.includes('对方拒绝了合棋'));assert.equal(c.data.pendingRequest,'');
});
