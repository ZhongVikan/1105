// Wall-clock recording: real Runtime/Controller/Canvas, real Date.now and real timers.
// The wx I/O adapter replaces only platform services. No rendered frames are invented.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{performance}=require('perf_hooks');
const {createHost}=require('./recording/canvas-host'),{scenarios}=require('./recording/fixtures');
const out=path.resolve(process.argv[2]||'/tmp/chess-realtime');fs.mkdirSync(out,{recursive:true});
(async()=>{const host=createHost({realtime:true}),manifest={provenance:'Wall-clock capture of unmodified game renderer and rule/controller pipeline in local wx I/O host. Legal scenario fixtures, real timers and Date.now. Not WeChat phone footage. Silent media.',targetFps:30,clips:[]};let clip=null,title='',camera=null;
 const canvas=host.createCanvas(375,852),ctx=canvas.getContext('2d');
 function shot(){const began=performance.now(),at=Date.now(),screen=host.draw();ctx.fillStyle='#292117';ctx.fillRect(0,0,375,40);ctx.fillStyle='#ffe9ae';ctx.font='13px "Noto Sans CJK SC"';ctx.textAlign='center';ctx.fillText(title,187,24);ctx.drawImage(screen,0,40,375,812);const file=String(clip.frames.length).padStart(5,'0')+'.jpg';fs.writeFileSync(path.join(out,clip.name,file),canvas.toBuffer('image/jpeg',94));clip.frames.push({file,at,drawMs:performance.now()-began});camera=setTimeout(shot,Math.max(0,1000/30-(performance.now()-began)));}
 const wait=async(ms,label)=>{if(label)title=label;await new Promise(resolve=>setTimeout(resolve,ms));};
 const begin=name=>{clearTimeout(camera);clip={name,frames:[]};manifest.clips.push(clip);fs.mkdirSync(path.join(out,name),{recursive:true});shot();};
 try{await host.preload();await host.load(scenarios.walk());host.draw();
 begin('01-movement-capture-reveal');await wait(350,'实际运行录制 · 选中 / 走子 / 上一步白环');await host.app.controller.onPoint({detail:{point:{x:0,y:7},pieceId:'r'}});await wait(220);await host.move('r',{x:0,y:5});await wait(700);await host.move('b',{x:8,y:6});await wait(650);
 let c=await host.load(scenarios.capture());await wait(300,'吃子 · 白环 / 红环同规格');await c.onPoint({detail:{point:{x:2,y:7},pieceId:'r'}});await wait(220,'吃子 · 接触金光 / 消散 / 中央「吃」');await host.move('r',{x:2,y:4});await wait(950);
 c=await host.load(scenarios.captureCheck());await wait(300,'吃子并将军 · 单次事件同步');await host.move('r',{x:3,y:3});await wait(1050);
 for(const variant of ['dark','jieqi']){c=await host.load(scenarios.reveal(variant));await wait(300,variant==='dark'?'暗棋 · 到达后翻开':'揭棋 · 单面切换 / 轻扫光');const p=c._state.pieces.find(p=>p.x===0&&p.y===9);await host.move(p.id,{x:0,y:8});await wait(950);}
 c=await host.load(scenarios.hiddenVictim());await wait(300,'暗子被吃 · 不提前显示身份');await host.move('r',{x:0,y:3});await wait(950);
 begin('02-fusion-chase-double');c=await host.load(scenarios.fusion());await wait(350,'合棋 · 双向汇聚 / 原棋子UI');await host.move('h',{x:3,y:5});await wait(950);
 c=await host.load(scenarios.royal());await wait(350,'将帅合棋 · 原字形与角标');await host.move('a',{x:4,y:9});await wait(950);
 c=await host.load(scenarios.chase());await wait(350,'快速连续追击 · 状态立即响应');await host.move('x',{x:1,y:5});await wait(35);await host.move('x',{x:2,y:3});assert.equal(c._state.captured.length,2);await wait(1300);
 c=await host.load(scenarios.double());await wait(350,'轰双吃 · 两个目标 / 一次事件');await host.move('bomb',{x:0,y:3});await wait(1000);
 begin('03-countdown-lifecycle');c=await host.load(scenarios.walk());c._clock.deadline=Date.now()+9900;c.tick();await wait(2100,'红方最后10秒 · 每秒一周期');c._mode='ai';c.togglePause();await wait(800,'暂停 · 红光与动画停止');c.togglePause();c._mode='local';await wait(1000,'恢复 · 倒计时继续');await host.move('r',{x:0,y:5});await wait(400,'换边 · 原红光立即清除');c._clock.deadline=Date.now()+9900;c.tick();await wait(2100,'黑方最后10秒 · 顶部红光');
 c=await host.load(scenarios.royal());await wait(350,'合棋后超时 · 不重播上一手');await host.move('a',{x:4,y:9});await wait(650);const start=host.sounds.length;c._clock.deadline=Date.now()-1;c.tick();await wait(2300);manifest.timeoutSounds=host.sounds.slice(start);assert(!manifest.timeoutSounds.some(s=>/44_|45_|46_|合棋_|护盾|03_移动|04_吃/.test(s.src||'')));
 }finally{clearTimeout(camera);host.close();}
 for(const c of manifest.clips){const frames=c.frames,lines=['ffconcat version 1.0'];for(let i=0;i<frames.length;i++){lines.push(`file '${frames[i].file}'`);lines.push('duration '+((i+1<frames.length?frames[i+1].at-frames[i].at:1000/30)/1000).toFixed(6));}lines.push(`file '${frames[frames.length-1].file}'`);fs.writeFileSync(path.join(out,c.name,'frames.ffconcat'),lines.join('\n'));const times=frames.map(f=>f.drawMs).sort((a,b)=>a-b);c.performance={frames:frames.length,durationMs:frames[frames.length-1].at-frames[0].at,medianCaptureMs:times[Math.floor(times.length*.5)],p95CaptureMs:times[Math.floor(times.length*.95)],maxCaptureMs:times[times.length-1],note:'Includes native Canvas draw, JPEG encoding and disk write; not phone FPS.'};}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Wall-clock recording complete:',manifest.clips.map(c=>c.performance));
})();
