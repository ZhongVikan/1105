const test=require('node:test'),a=require('node:assert/strict');
const def=require('../src/controller'),G=require('../utils/game-engine'),R=require('../utils/rules-core'),F=require('../utils/fusion'),Clock=require('../utils/turn-clock');
function page(variant='classic'){
 const p={...def,data:JSON.parse(JSON.stringify(def.data)),_alive:true,_token:0,_mode:'ai',_level:'easy',_state:G.newGame(()=>.4,variant),_clock:new Clock(),_history:[],_repetitionHistory:[],setData(d){Object.assign(this.data,d);},_audio:{effect(){},event(){},speak(){},cancelBattleQueue(){},destroy(){}},toast(message){this.lastToast=message;},scheduleAI(){}};
 p._clock.start();p.sync();return p;
}
function touch(p,piece,to){p.inferencePoint({detail:{point:{x:piece.x,y:piece.y},pieceId:piece.id}});p.inferencePoint({detail:{point:to,pieceId:null}});}
test('inference copies only public hidden information and does not mutate formal state',()=>{
 const p=page('dark'),before=JSON.stringify(p._state);p.enterInference();const hidden=p._state.pieces.find(q=>q.hidden&&q.kind!==R.openingRole(q));a.ok(hidden,'fixture must contain a hidden role different from its opening role');const trial=p._inference.state.pieces.find(q=>q.id===hidden.id);a.equal(trial.text,'');a.equal(trial.kind,R.openingRole(hidden));a.equal(trial.side,R.controller(hidden));a.equal(trial.sourcePieces,undefined);a.equal(JSON.stringify(p._state),before);p.exitInference();a.equal(JSON.stringify(p._state),before);
});
test('inference permits either side, keeps the formal clock, and undo restores the trial snapshot',()=>{
 const p=page('classic'),before=JSON.stringify(p._state),deadline=p._clock.deadline;p.enterInference();const black=p._inference.state.pieces.find(q=>q.id==='black-back-0');touch(p,black,{x:0,y:1});a.equal(p._inference.history.length,1);a.equal(p._inference.state.pieces.find(q=>q.id===black.id).y,1);a.equal(p._clock.deadline,deadline);a.equal(p.data.paused,false);p.undoInference();a.equal(p._inference.history.length,0);a.equal(JSON.stringify(p._state),before);a.equal(JSON.stringify(p._inference.state),JSON.stringify(p._inference.base));
});
test('hidden trial reveal requires a manual hypothesis and marks only the trial piece',()=>{
 const p=page('dark'),before=JSON.stringify(p._state);p.enterInference();const hidden=p._inference.state.pieces.find(q=>q.hidden);let to=null;for(let y=0;y<10&&!to;y++)for(let x=0;x<9&&!to;x++)if(G.legalAttempt(p._inference.state.pieces,hidden.id,{x,y},R.controller(hidden)))to={x,y};a.ok(to);touch(p,hidden,to);a.equal(p.data.inferenceAssumptionMenu,true);a.equal(p.data.inferenceAssumptionOptions.length,12);const option=p.data.inferenceAssumptionOptions.find(q=>q.side==='red'&&q.kind==='rook');p.chooseInferenceAssumption(option.side,option.kind);const moved=p._inference.state.pieces.find(q=>q.id===hidden.id);a.equal(moved.assumed,true);a.equal(moved.kind,'rook');a.equal(moved.text,'俥');a.equal(JSON.stringify(p._state),before);
});
test('fusion inference uses fusion transitions and undo without formal mutation',()=>{
 const p=page('fusion'),before=JSON.stringify(p._state);p.enterInference();const move=F.actions(p._inference.state).find(q=>q.id==='red-cannon-1');a.ok(move);p.inferencePoint({detail:{point:{x:1,y:7},pieceId:move.id}});p.inferencePoint({detail:{point:move.to,pieceId:null}});a.equal(p._inference.history.length,1);a.equal(JSON.stringify(p._state),before);p.resetInference();a.equal(JSON.stringify(p._inference.state),JSON.stringify(p._inference.base));
});
test('formal move immediately exits inference',()=>{
 const p=page('classic'),messages=[];p.toast=m=>messages.push(m);p.enterInference();const m=G.legalAttempt(p._state.pieces,'red-cannon-1',{x:1,y:6},'red');a.equal(m,true);const result=G.move(p._state,'red-cannon-1',{x:1,y:6});p._state=result.state;p.sync(result.event);a.equal(p.data.inference,false);a.equal(p._inference,null);a.ok(messages.some(m=>/正式棋局已更新/.test(m)));
});
test('all four variants enter the same isolated inference workflow',()=>{
 for(const variant of ['dark','classic','jieqi','fusion']){const p=page(variant);a.equal(p.enterInference(),true);a.equal(p.data.inference,true);a.equal(p._inference.state.variant,variant);p.resetInference();p.exitInference();a.equal(p.data.inference,false);}
});
test('online games can enter isolated inference without sending a move',()=>{
 const p=page('classic');p._mode='online';p._room={side:'red',waiting:false};p.data.mode='online';
 a.equal(p.enterInference(),true);a.equal(p.data.inference,true);
 const before=JSON.stringify(p._state);const red=p._inference.state.pieces.find(q=>q.id==='red-cannon-1');
 touch(p,red,{x:1,y:6});
 a.equal(p._inference.history.length,1);a.equal(JSON.stringify(p._state),before);
 p.exitInference();
});
