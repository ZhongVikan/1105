// Exercise the real Canvas renderer against delayed authoritative room snapshots.
// This local wx I/O host is not a WeChat device or a real cloud RTT measurement.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHost}=require('./recording/canvas-host');
const G=require('../utils/game-engine'),Online=require('../utils/online'),assets=require('../src/ui-assets');
const output=path.resolve(process.argv[2]||path.join(__dirname,'../../work/online-reveal'));
const delays=[80,400,1000,3000],copy=value=>JSON.parse(JSON.stringify(value));

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const host=createHost(),originalCall=Online.call,renderer=host.app.renderer;
 const originalImage=renderer.uiImage,originalDisc=renderer.disc;
 let frames=0,caseState=null;const results=[],failures=[];
 renderer.uiImage=function(key){
  if(caseState&&key.startsWith('v2_piece_')){
   assert.ok(assets[key],`invalid/empty piece image requested: ${key}`);
  }
  return originalImage.call(this,key);
 };
 renderer.disc=function(x,y,r,label,side,hidden,selected,info){
  if(caseState&&info&&info.id===caseState.id){
   caseState.moverRenders++;
   if(!caseState.confirmed)assert.equal(hidden,true,'concealed preview must keep its back artwork');
  }
  return originalDisc.apply(this,arguments);
 };
 try{
  await host.preload();
  for(const variant of ['dark','jieqi'])for(const delay of delays){
   caseState=null;
   const privateState=G.newGame(()=>.4,variant),state={...privateState,pieces:G.displayPieces(privateState.pieces)};
   const moving=state.pieces.find(p=>p.x===0&&p.y===6),move={id:moving.id,to:{x:0,y:5}};
   const result=G.move(privateState,move.id,move.to);assert.ok(result.ok,result.message);
   const c=await host.load(state);
   c._mode='online';c._offset=0;c.setData({mode:'online'});
   c._room={roomId:'render-test',rev:0,side:'red',state,waiting:false,red:{nickname:'R'},black:{nickname:'B'},serverNow:host.now,deadline:host.now+60000};c.sync();
   const started=host.now;let sent=0;
   caseState={id:move.id,confirmed:false,moverRenders:0};
   Online.call=action=>{
    assert.equal(action,'move');sent++;
    return new Promise(resolve=>setTimeout(()=>{
     caseState.confirmed=true;
     resolve({...c._room,rev:1,state:{...result.state,pieces:G.displayPieces(result.state.pieces)},event:result.event,serverNow:host.now});
    },delay));
   };
   const request=c.command('move',move),motion=c.motion;
   assert.ok(motion,'the move must start before awaiting the cloud response');
   const duration=motion.timings.total;
   const times=new Set();
   for(let ms=0;ms<=640;ms+=16)times.add(ms);
   for(const ms of [duration-1,duration+1,delay-1,delay,delay+16,delay+120,delay+240,delay+650])if(ms>=0)times.add(ms);
   for(let ms=1000;ms<delay;ms+=500)times.add(ms);
   let caseFrames=0,quietAfterAnimation=false;
   try{
    for(const ms of [...times].sort((a,b)=>a-b)){
     host.advance(started+ms);await Promise.resolve();await Promise.resolve();
     host.draw();frames++;caseFrames++;
     assert.equal(motion.timings.total,duration,'network latency must not extend the local animation');
     if(ms>duration&&ms<delay){
      assert.equal(c.motion,null,'the animation must complete while the request is still pending');
      assert.equal(c._battle.animating(host.now),false,'waiting for the cloud must not spin frames');
      assert.equal(c.data.busy,true);quietAfterAnimation=true;
     }
     if(delay===3000&&[0,160,272,368,512,2999,3000,3120].includes(ms)){
      fs.writeFileSync(path.join(output,`${variant}-${delay}-${ms}.png`),renderer.canvas.toBuffer('image/png'));
     }
    }
    await request;
    assert.equal(sent,1);assert.equal(c._battle.serial,1,'the authoritative response must not replay the move');
    assert.deepEqual(c.data.pieces.find(p=>p.id===move.id),G.displayPieces(result.state.pieces).find(p=>p.id===move.id));
    assert.equal(c.motion,null);assert.ok(caseFrames>=20);assert.ok(caseState.moverRenders>0);
    results.push({variant,delayMs:delay,animationMs:duration,frames:caseFrames,quietWhilePending:quietAfterAnimation,events:c._battle.serial,passed:true});
   }catch(error){
    failures.push({variant,delayMs:delay,error:error.message});
    // Settle the request before another case replaces Online.call/caseState.
    if(host.now<started+delay)host.advance(started+delay);
    await Promise.resolve();await request.catch(()=>{});
   }
  }
  const report={frames,cases:results.length+failures.length,passed:results.length,failures,results,note:'Native Canvas wx I/O host; not real-device FPS/RTT.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  assert.equal(failures.length,0,'online reveal rendering regressions');
 }finally{
  caseState=null;Online.call=originalCall;renderer.uiImage=originalImage;renderer.disc=originalDisc;host.close();
 }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
