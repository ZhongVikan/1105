const test=require('node:test'),assert=require('node:assert/strict');
const Controller=require('../src/controller'),G=require('../utils/game-engine'),FX=require('../src/battle-effects'),Online=require('../utils/online');
const copy=value=>JSON.parse(JSON.stringify(value));

function setup(t,variant='dark',capture=false){
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const privateState=G.newGame(()=>.4,variant),state={...privateState,pieces:G.displayPieces(privateState.pieces)};
 const piece=state.pieces.find(p=>p.x===(capture?1:0)&&p.y===(capture?7:6));
 const move={id:piece.id,to:capture?{x:1,y:0}:{x:0,y:5}},result=G.move(privateState,move.id,move.to);
 assert.ok(result.ok,result.message);
 const sounds=[],c={...Controller,data:copy(Controller.data),_alive:true,_hidden:false,_mode:'online',_state:state,_offset:0,
  _room:{roomId:'room',rev:0,side:'red',waiting:false,state,red:{nickname:'R'},black:{nickname:'B'},serverNow:Date.now(),deadline:Date.now()+60000},
  _audio:{event(event,state){sounds.push({event,state});},effect(){},speak(){},cancelCountdown(){},cancelBattleQueue(){},hide(){},refresh(){}}};
 c.setData=patch=>Object.assign(c.data,patch);c.toast=message=>{c.lastToast=message;};c.sync();
 const response=()=>({...c._room,rev:1,state:{...result.state,pieces:G.displayPieces(result.state.pieces)},event:result.event,serverNow:Date.now()});
 t.after(()=>{c._alive=false;c.stopPolling();c.clearPresentation();});
 return {c,move,result,response,sounds};
}

for(const variant of ['dark','jieqi']){
 test(`${variant}: pending reveal never turns to an empty face and stays in its original motion`,t=>{
  const {c,move}=setup(t,variant);c.beginOptimisticMove(move);const motion=c.motion;
  t.mock.timers.tick(motion.timings.travel+motion.timings.reveal*.75);
  const pose=FX.pose(motion.move,Date.now()-motion.at,p=>p,{},motion.timings);
  assert.equal(pose.hidden,true,'unknown identity must keep the back visible until confirmation');
  t.mock.timers.tick(1000);assert.equal(FX.frame(c,Date.now()),motion,'a slow response must not discard the reveal');
 });
 test(`${variant}: confirmation updates the animated face without replaying travel`,t=>{
  const {c,move,response}=setup(t,variant);c.beginOptimisticMove(move);const motion=c.motion,at=motion.at;
  t.mock.timers.tick(80);c.applyRoom(response());
  assert.equal(c.motion,motion);assert.equal(motion.at,at);assert.equal(c._battle.serial,1);
  const face=motion.pieces.find(p=>p.id===move.id),expected=c._state.pieces.find(p=>p.id===move.id);
  assert.deepEqual(face,expected,'the live animation must use the confirmed piece, not a concealed preview');
  t.mock.timers.tick(motion.timings.total+10);assert.equal(c._battle.animating(Date.now()),false);
 });
 test(`${variant}: late confirmation resumes the same flip and opens within 150ms`,t=>{
  const {c,move,response,sounds}=setup(t,variant);c.beginOptimisticMove(move);const motion=c.motion;
  t.mock.timers.tick(1100);FX.frame(c,Date.now());c.applyRoom(response());
  assert.equal(c.motion,motion);assert.equal(c._battle.serial,1);
  t.mock.timers.tick(120);
  const pose=FX.pose(motion.move,Date.now()-motion.at,p=>p,{},motion.timings);
  assert.equal(pose.hidden,false);assert.ok(pose.flipScale>.99);
  assert.equal(sounds.length,1,'authoritative feedback must be played once');
 });
}

test('an older in-flight poll cannot replace the preview or release the command lock',async t=>{
 const {c,move,response}=setup(t),before=copy(c._room),original=Online.call;let resolve;
 Online.call=()=>new Promise(done=>{resolve=done;});t.after(()=>{Online.call=original;});
 const request=c.command('move',move),motion=c.motion;
 c.applyRoom(before);assert.equal(c.data.busy,true,'a poll response must not unlock a pending move');
 assert.equal(c.data.pieces.find(p=>p.id===move.id).y,5);
 resolve(response());await request;assert.equal(c.motion,motion);assert.equal(c.data.busy,false);
});
