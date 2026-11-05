// Captures frames of the current project's Runtime, legal rule transitions and Canvas renderer.
// No generated artwork or rewritten demo renderer. Offline wx adapter, not WeChat/phone footage.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{performance}=require('perf_hooks');
const {createHost}=require('./recording/canvas-host'),{scenarios}=require('./recording/fixtures');
const out=path.resolve(process.argv[2]||'/tmp/darkchess-recording');fs.mkdirSync(out,{recursive:true});
(async()=>{const host=createHost(),manifest={provenance:'Real project Runtime+Controller+game-engine+Canvas in a local wx API host; no AI-generated visuals; not WeChat device footage.',fps:30,clips:[],sounds:[],frameTimes:[]};let folder,count=0,title='';const screen=host.createCanvas(375,852),ctx=screen.getContext('2d');
 try{await host.preload();
 const clip=name=>{folder=path.join(out,name);fs.mkdirSync(folder,{recursive:true});count=0;manifest.clips.push({name,frames:0});};
 const shot=()=>{const start=performance.now(),canvas=host.draw();manifest.frameTimes.push(performance.now()-start);ctx.fillStyle='#292117';ctx.fillRect(0,0,375,40);ctx.fillStyle='#ffe9ae';ctx.font='13px "Noto Sans CJK SC"';ctx.textAlign='center';ctx.fillText(title,187,24);ctx.drawImage(canvas,0,40,375,812);fs.writeFileSync(path.join(folder,String(count++).padStart(5,'0')+'.jpg'),screen.toBuffer('image/jpeg',94));manifest.clips[manifest.clips.length-1].frames++;};
 const wait=async(ms,label)=>{if(label)title=label;const start=host.now;for(let i=1;i<=Math.ceil(ms/1000*30);i++){host.advance(start+i*1000/30);shot();await Promise.resolve();}};
 clip('01-movement-capture-reveal');
 let c=await host.load(scenarios.walk());await wait(300,'实际代码运行 · 普通走子');await host.move('r',{x:0,y:5});await wait(650);await host.move('b',{x:8,y:6});await wait(650);
 c=await host.load(scenarios.capture());await wait(250,'普通吃子 · 接触 / 消散 / 中央「吃」');await host.move('r',{x:2,y:4});await wait(1000);
 c=await host.load(scenarios.captureCheck());await wait(250,'吃子并将军 · 同次事件按时序播放');await host.move('r',{x:3,y:3});await wait(1100);
 for(const variant of ['dark','jieqi']){c=await host.load(scenarios.reveal(variant));await wait(250,variant==='dark'?'暗棋 · 到达后翻开':'揭棋 · 正反面单面切换');const p=c._state.pieces.find(p=>p.x===0&&p.y===9);await host.move(p.id,{x:0,y:8});await wait(1100);}
 c=await host.load(scenarios.hiddenVictim());await wait(250,'暗子被吃 · 身份不提前显示');await host.move('r',{x:0,y:3});await wait(1000);
 clip('02-fusion-chase-double');
 c=await host.load(scenarios.fusion());await wait(300,'普通合棋 · 双弧汇聚 / 原UI显现');await host.move('h',{x:3,y:5});await wait(1000);
 c=await host.load(scenarios.royal());await wait(300,'将帅合棋 · 字形与右下角标记不变');await host.move('a',{x:4,y:9});await wait(1000);
 c=await host.load(scenarios.chase());await wait(300,'连续追击 · 快速两步 / 视觉顺序保留');await host.move('x',{x:1,y:5});host.advance(host.now+35);await host.move('x',{x:2,y:3});assert.equal(c._state.captured.length,2);assert.equal(c._battle.events.length,2);await wait(1600);
 c=await host.load(scenarios.double());await wait(300,'轰双吃 · 两个目标 / 一次动作');await host.move('bomb',{x:0,y:3});assert.equal(c._state.captured.length,2);await wait(1200);
 clip('03-countdown-lifecycle');
 c=await host.load(scenarios.walk());c._clock.deadline=host.now+9900;c.tick();await wait(2200,'红方最后10秒 · 每秒一次红光');c._mode='ai';c.togglePause();await wait(900,'暂停 · 红光与特效停止');c.togglePause();c._mode='local';await wait(1100,'恢复 · 倒计时继续');
 await host.move('r',{x:0,y:5});await wait(500,'回合切换 · 原红光立即清除');c._clock.deadline=host.now+9900;c.tick();await wait(2200,'黑方最后10秒 · 顶部信息框红光');
 c=await host.load(scenarios.royal());await wait(300,'合棋后超时 · 只结算，不重播上一步');await host.move('a',{x:4,y:9});await wait(750);const soundIndex=host.sounds.length;c._clock.deadline=host.now-1;c.tick();assert.equal(c.motion,null);await wait(2300);manifest.timeoutSounds=host.sounds.slice(soundIndex);assert(!manifest.timeoutSounds.some(s=>/44_|45_|46_|合棋_|护盾|03_移动|04_吃/.test(s.src||'')));
 manifest.sounds=host.sounds;const times=manifest.frameTimes;times.sort((a,b)=>a-b);manifest.performance={frames:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times[times.length-1],note:'Offline native Canvas host on this cloud machine; not phone FPS or thermal evidence.'};delete manifest.frameTimes;fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest.performance));
 }finally{host.close();}
})();
