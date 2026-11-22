const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),path=require('path'),C=require('../utils/coordinates');
function mock(width=375,height=812){
 const events={},storage={};const context=new Proxy({getImageData:()=>({data:new Uint8ClampedArray(4)}),measureText:t=>({width:String(t).length*12}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 global.wx={getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=v,getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:2,safeArea:{top:20,bottom:height-12}}),getLaunchOptionsSync:()=>({query:{}}),createCanvas:()=>({getContext:()=>context}),createImage:()=>({set src(value){this._src=value;queueMicrotask(()=>{if(this.onload)this.onload();});},get src(){return this._src;}}),getMenuButtonBoundingClientRect:()=>({bottom:52}),showShareMenu(){},showToast(){},showModal(o){o.success({confirm:false});if(o.complete)o.complete();},createInnerAudioContext:()=>({onError(){},onEnded(){},play(){},pause(){},stop(){},destroy(){}})};
 for(const n of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','ShareAppMessage'])wx['on'+n]=f=>events[n]=f;
 return {events,storage};
}
function teardown(app){if(app){app.home();app.renderer.stop();}delete global.wx;delete global.requestAnimationFrame;delete global.cancelAnimationFrame;}
test('actual game.js boots without Page/App/DOM and has the requested AppID',()=>{mock();const app=require('../game');try{a.equal(app.scene,'home');a.equal(app.renderer.targets.length,10);const root=path.resolve(__dirname,'..'),cfg=require('../project.config.json'),manifest=require('../game.json');a.equal(cfg.compileType,'game');a.equal(cfg.appid,'wx5afed2840d141da3');a.ok(fs.existsSync(path.join(root,'game.json')));a.equal(manifest.workers,'workers');a.ok(fs.existsSync(path.join(root,manifest.workers,'ai-worker.js')));a.ok(!fs.existsSync(path.join(root,'app.json')));for(const s of manifest.subpackages)a.ok(fs.existsSync(path.join(root,s.root,'game.js')));}finally{teardown(app);}});
test('Canvas touch maps all 90 points at four screen sizes and both orientations; rejects swipes',async()=>{
 for(const [width,height] of [[320,568],[375,667],[430,932],[768,1024]]){mock(width,height);const Runtime=require('../src/runtime'),app=new Runtime();await app.startGame({mode:'ai'});try{const c=app.controller,received=[];c.onPoint=e=>received.push(e.detail);app.renderer.draw();const b=app.renderer.boardRect;const touch=(p,flipped)=>{const px=app.renderer.boardPoint(p,flipped);return {clientX:(b.x+px.x*b.w/720)*app.renderer.scale+(app.renderer.offsetX||0),clientY:(b.y+px.y*b.h/800)*app.renderer.scale};};
  for(const flipped of [false,true]){c.data.flipped=flipped;for(let y=0;y<10;y++)for(let x=0;x<9;x++){const t=touch({x,y},flipped);app.touchStart({touches:[t]});app.touchEnd({changedTouches:[t]});a.deepEqual(received.at(-1).point,{x,y});}}
  const before=received.length,t=touch({x:4,y:9},true);app.touchStart({touches:[t]});app.touchMove({touches:[{...t,clientX:t.clientX+30}]});app.touchEnd({changedTouches:[t]});a.equal(received.length,before);
  for(const r of app.renderer.targets)a.ok((r.y+r.h)*app.renderer.scale<=height,'buttons stay on screen');
 }finally{teardown(app);}}
});
test('hide/show preserves deadline; settings and rule scenes keep the same match',async()=>{const {events}=mock();const Runtime=require('../src/runtime'),app=new Runtime();app.start();await app.startGame({mode:'ai'});try{const c=app.controller,deadline=c._clock.deadline;app.open('settings');app.toggleSetting('sound');a.equal(require('../utils/storage').settings().sound,false);app.back();a.equal(app.controller,c);events.Hide();a.equal(c._hidden,true);events.Show({query:{}});a.equal(c._hidden,false);a.equal(c._clock.deadline,deadline);app.open('rules');const labels=[],text=app.renderer.secondaryText;app.renderer.secondaryText=function(label,...args){labels.push(label);return text.call(this,label,...args);};app.renderer.draw();a.ok(Number.isFinite(app.renderer.maxScroll)&&app.renderer.maxScroll>=0);a.ok(labels.includes('开局布阵'));for(const hidden of ['其他操作','人机对局长将','神之一手'])a.ok(!labels.includes(hidden));app.renderer.secondaryText=text;app.back();a.equal(app.controller,c);}finally{teardown(app);}});
test('settings positions the native feedback button below the audio controls and owns its lifecycle',()=>{
 const {events}=mock(320,568),buttons=[];
 wx.createFeedbackButton=options=>{
  const button={options,visible:false,destroyed:false,
   show(){this.visible=true;},hide(){this.visible=false;},
   destroy(){this.visible=false;this.destroyed=true;},onTap(){},
  };
  buttons.push(button);return button;
 };
 const Runtime=require('../src/runtime'),app=new Runtime();
 function checkPosition(width,height){
  app.renderer.draw();
  const {scale,offsetX,targets}=app.renderer,{x,y,w,h}=app.renderer.settingsFeedbackRect();
  const {style,text}=app.feedbackButton.options;
  a.equal(text,'留言反馈');
  a.deepEqual([style.left,style.top,style.width,style.height],[x*scale+offsetX,y*scale,w*scale,h*scale]);
  a.ok(targets.every(target=>target.y+target.h<y));
  a.ok(style.left>=0&&style.left+style.width<=width&&style.top+style.height<=height-12);
 }
 try{
  app.start();a.equal(buttons.length,0);a.equal(app.profile,null);
  app.open('settings');checkPosition(320,568);
  const first=app.feedbackButton;a.equal(first.visible,true);
  events.Hide();a.equal(first.visible,false);
  events.Show({query:{}});a.equal(first.visible,true);a.equal(buttons.length,1);
  wx.getWindowInfo=()=>({windowWidth:768,windowHeight:1024,pixelRatio:2,safeArea:{top:20,bottom:1012}});
  events.WindowResize();a.equal(first.destroyed,true);checkPosition(768,1024);
  const resized=app.feedbackButton;
  app.back();a.equal(resized.destroyed,true);a.equal(app.feedbackButton,null);
  app.open('settings');const reopened=app.feedbackButton;
  app.open('rules');a.equal(reopened.destroyed,true);a.equal(app.feedbackButton,null);
 }finally{teardown(app);}
});
test('settings shows a feedback entry with a useful hint when the native button is unavailable',()=>{
 mock();const Runtime=require('../src/runtime'),app=new Runtime();
 wx.createFeedbackButton=()=>undefined;
 let message;wx.showToast=options=>{message=options.title;};
 try{
  app.open('settings');app.renderer.draw();
  const feedback=app.renderer.settingsFeedbackRect();
  const target=app.renderer.targets.find(r=>r.y===feedback.y&&r.w===feedback.w);
  a.ok(target);target.action();
  a.equal(message,'请在手机微信中使用留言反馈');
 }finally{teardown(app);}
});
test('the identity panel displays the saved WeChat avatar when its download completes',async()=>{
 const {storage}=mock(320,568),fileID='cloud://profile-test/avatars/player.jpg';
 storage['chess-profile']={nickname:'微信玩家',avatar:fileID};
 const Runtime=require('../src/runtime'),app=new Runtime(),renderer=app.renderer;
 const art={},photo={width:640,height:480,set src(path){a.equal(path,'/tmp/player.jpg');queueMicrotask(()=>this.onload());}};
 const downloads=[],crops=[];
 let completeDownload;
 wx.cloud={downloadFile({fileID:id}){downloads.push(id);return new Promise(resolve=>{completeDownload=resolve;});}};
 wx.createImage=()=>photo;
 renderer.uiImage=key=>key==='secondary_profile'?art:null;
 renderer.ctx.drawImage=(image,...crop)=>{if(image===photo)crops.push(crop);};
 try{
  app.open('profile');renderer.draw();renderer.draw();
  a.deepEqual(downloads,[fileID]);a.equal(crops.length,0);
  completeDownload({tempFilePath:'/tmp/player.jpg'});
  await new Promise(resolve=>setImmediate(resolve));
  renderer.draw();
  a.deepEqual(crops,[[80,0,480,480,-110.5,-110.5,221,221]]);
  app.profile=null;renderer.draw();
  a.equal(crops.length,1);a.deepEqual(downloads,[fileID]);
 }finally{teardown(app);}
});
test('avatar taps open stats for the displayed player in online and simulated games',async()=>{
 mock();
 const Runtime=require('../src/runtime'),G=require('../utils/game-engine'),app=new Runtime(),r=app.renderer;
 const roomId='a'.repeat(32),simulationId='b'.repeat(32),deadline=Date.now()+60000,requests=[];
 app.profile={nickname:'甲',avatar:'cloud://a'};
 const room={ok:true,roomId,rev:1,side:'red',state:G.newGame(undefined,'classic'),waiting:false,deadline,serverNow:Date.now(),red:app.profile,black:{nickname:'乙',avatar:'cloud://b'}};
 wx.cloud={downloadFile:async()=>({tempFilePath:'/tmp/avatar.jpg'}),callFunction:async({data})=>{
  if(data.action==='playerStats'){
   requests.push(data);return {result:{ok:true,variant:'classic',nickname:data.side==='red'?'甲':'乙',games:8,wins:5}};
  }
  return {result:room};
 }};
 const avatarTargets=()=>r.targets.filter(target=>target.w===48&&target.h===48);
 const tap=target=>{
  const t={clientX:(target.x+target.w/2)*r.scale+r.offsetX,clientY:(target.y+target.h/2)*r.scale};
  app.touchStart({touches:[t]});app.touchEnd({changedTouches:[t]});
 };
 const settled=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  a.equal(await app.startGame({mode:'online',room:roomId,variant:'classic'}),true);
  const c=app.controller;
  r.draw();a.equal(avatarTargets().length,2);tap(avatarTargets()[0]);await settled();
  a.equal(requests[0].side,'black');a.equal(requests[0].roomId,roomId);
  a.equal(c.data.playerStats.name,'乙');a.equal(c.data.playerStats.games,8);a.equal(c._room.deadline,deadline);
  r.draw();tap(r.targets[0]);a.equal(c.data.playerStats,null);
  c.flip();r.draw();tap(avatarTargets()[0]);await settled();
  a.equal(requests[1].side,'red');a.equal(c.data.playerStats.name,'甲');c.closePlayerStats();
  c.stopPolling();c._mode='ai';c._room=null;c._fakeOpponent={nickname:'乙'};c._simulatedMatch={id:simulationId,round:1};
  c._clock.start();c.setData({mode:'ai',fakeOpponent:true});c.sync();
  const localDeadline=c._clock.deadline;r.draw();tap(avatarTargets()[1]);await settled();
  a.equal(requests[2].side,'black');a.equal(requests[2].simulationId,simulationId);
  a.equal(c.data.playerStats.status,'ready');a.equal(c._clock.deadline,localDeadline);a.equal(c._clock.reasons.size,0);
  c.closePlayerStats();c._fakeOpponent=null;c.setData({fakeOpponent:false});r.draw();
  a.equal(avatarTargets().length,0);
 }finally{teardown(app);}
});
test('stats paints translucent cards, ranks the displayed rate, and matches the close and retry buttons',()=>{
 mock();
 const Renderer=require('../src/renderer'),r=new Renderer({scene:'game'}),paints=[],labels=[],frames=[],textPasses=[];
 const bronze=[[0,'#32363e'],[.38,'#4c484b'],[.65,'#a56e49'],[1,'#875333']];
 const silver=[[0,'#f5faff'],[.38,'#eaf0f8'],[.66,'#bbcbd9'],[1,'#a0b2c4']];
 const platinum=[[0,'#ffe57a'],[.43,'#ffc93c'],[.53,'#f7f1d8'],[.65,'#a9e5fa'],[1,'#64bee3']];
 const diamond=[[0,'#6726a7'],[.42,'#922ab1'],[.56,'#b82a64'],[1,'#b51f2f']];
 r.ctx.createLinearGradient=()=>({stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}});
 r.ctx.strokeText=label=>textPasses.push([label,r.ctx.strokeStyle]);
 r.ctx.fillText=label=>textPasses.push([label]);
 r.card=(x,y,w,h,fill)=>paints.push(fill);
 const text=r.text;
 r.text=(label,x,y,size,fill,align,bold,outline)=>{
  labels.push({label,fill});
  text.call(r,label,x,y,size,fill,align,bold,outline);
 };
 r.pauseFrameArt=(...box)=>{frames.push(box);return true;};
 let closed=0,retrySide;
 const controller={closePlayerStats(){closed++;},showPlayerStats(side){retrySide=side;}};
 const stats={status:'ready',variant:'dark',name:'棋友',games:10000};
 const errorStats={...stats,status:'error',side:'black'};
 const checkButtonFrame=([x,,w,h],center)=>{
  a.ok(Math.abs(w/h-147/81)<1e-10);
  a.ok(Math.abs(x+w/2-center)<1e-10);
 };
 try{
  const tiers=[
   [2990,'29.9%',bronze],[2996,'30%',silver,'#556578'],[4990,'49.9%',silver,'#556578'],
   [5000,'50%',platinum,'#596577'],[6990,'69.9%',platinum,'#596577'],[7000,'70%',diamond]
  ];
  for(const [wins,rate,fill,outline] of tiers){
   r.playerStatsCard(controller,{...stats,wins});
   const rateLabel=labels.find(text=>text.label===rate);
   a.ok(rateLabel);a.deepEqual(rateLabel.fill.stops,fill);
   a.deepEqual(textPasses.filter(([label])=>label===rate),outline?[[rate,outline],[rate]]:[[rate]]);
   textPasses.length=0;
   a.deepEqual(labels.find(text=>text.label===stats.games),{label:stats.games,fill:'#000000'});
   a.deepEqual(paints.splice(0),['rgba(255,248,232,.76)','rgba(248,234,209,.58)','rgba(248,234,209,.58)']);
   a.ok(labels.some(text=>text.label==='关闭'));labels.length=0;
   checkButtonFrame(frames.at(-1),187.5);
   r.targets[0].action();
  }
  a.equal(closed,6);a.equal(frames.length,6);
  const singleFrame=frames.at(-1);
  r.playerStatsCard(controller,errorStats);
  const [closeFrame,retryFrame]=frames.slice(6);
  checkButtonFrame(closeFrame,119.5);checkButtonFrame(retryFrame,255.5);
  a.deepEqual(retryFrame.slice(1),closeFrame.slice(1));
  a.ok(labels.some(text=>text.label==='重试'));a.equal(r.targets.length,2);
  r.targets[1].action();a.equal(retrySide,'black');
  r.targets[0].action();a.equal(closed,7);
  r.pauseFrameArt=()=>false;
  const artwork=[];
  r.battleArt=(box,x,y,w,h,radius,blank,key)=>{artwork.push({key,frame:[x,y,w,h]});return key==='inference_button';};
  r.playerStatsCard(controller,{...stats,games:0,wins:0});
  a.deepEqual(labels.find(text=>text.label==='—'),{label:'—',fill:'#826048'});
  r.playerStatsCard(controller,errorStats);
  a.deepEqual(artwork,[singleFrame,closeFrame,retryFrame].map(frame=>({key:'inference_button',frame})));
 }finally{delete global.wx;delete global.requestAnimationFrame;delete global.cancelAnimationFrame;}
});
test('navigation refreshes target scene for home and AI controls',async()=>{
 mock();const Runtime=require('../src/runtime'),app=new Runtime();
 const tap=target=>{const x=(target.x+target.w/2)*app.renderer.scale+(app.renderer.offsetX||0),y=(target.y+target.h/2)*app.renderer.scale;app.touchStart({touches:[{clientX:x,clientY:y}]});app.touchEnd({changedTouches:[{clientX:x,clientY:y}]});};
 try{
  app.open('difficulty');app.renderer.draw();a.equal(app.renderer._targetState.scene,'difficulty');tap(app.renderer.targets.at(-1));
  a.equal(app.scene,'home');app.renderer.draw();a.equal(app.renderer._targetState.scene,'home');tap(app.renderer.targets.find(t=>t.w>300&&t.y>420&&t.y<520));
  a.equal(app.scene,'difficulty');app.renderer.draw();await app.startGame({mode:'ai'});app.renderer.draw();a.equal(app.renderer._targetState.scene,'game');let paused=0;app.controller.togglePause=()=>paused++;tap(app.renderer.targets.find(t=>t.x>280&&t.y<100));a.equal(paused,1);
 }finally{teardown(app);}
});
test('mini game invitation uses query instead of a miniprogram page path',()=>{const def=require('../src/controller'),share=def.onShareAppMessage.call({data:{roomId:'a'.repeat(32)}});a.equal(share.query,'room='+'a'.repeat(32));a.equal(share.path,undefined);});

test('home variant tabs launch selected rules and restart preserves variant',async()=>{mock();const Runtime=require('../src/runtime'),app=new Runtime();try{for(const [i,variant] of ['dark','classic','jieqi','fusion'].entries()){app.home();app.renderer.draw();app.renderer.targets[i].action();a.equal(app.variant,variant);await app.startGame({mode:'ai'});const c=app.controller;a.equal(c._state.variant,variant);c.modal=(title,body,fn)=>fn();c.restart();a.equal(c._state.variant,variant);app.open('rules');app.renderer.draw();}}finally{teardown(app);}});

test('new board artwork uses measured intersections, rejects river center and frame',()=>{mock();const R=require('../src/renderer'),r=new R({});try{a.deepEqual(r.boardPoint({x:0,y:0}),{x:71,y:78});a.deepEqual(r.boardPoint({x:8,y:9}),{x:648,y:680});const b={x:0,y:0,w:720,h:800};a.equal(r.boardHit(0,0,b),null);a.equal(r.boardHit(359.75,(689.5+825)/4,b),null);}finally{delete global.wx;}});
test('hidden pieces only request the shared back; missing resources fall back without crashing',()=>{mock();const R=require('../src/renderer'),r=new R({}),keys=[];r.uiImage=key=>{keys.push(key);return null;};try{for(const side of ['red','black'])r.disc(20,20,16,'車',side,true,false);a.deepEqual(keys,['v2_piece_hidden','v2_piece_hidden']);r.disc(20,20,16,'帥','red',false,true);a.equal(keys.at(-1),'v2_piece_red_general');}finally{delete global.wx;}});

test('stationary pieces are cached across animation frames',()=>{mock();const R=require('../src/renderer'),G=require('../utils/game-engine'),r=new R({}),state=G.newGame(undefined,'classic'),pieces=G.displayPieces(state.pieces);let count=0;const disc=r.disc;r.disc=function(...args){count++;return disc.apply(this,args);};const m=pieces.find(p=>p.kind==='pawn');const motion={at:1000,move:{id:m.id,from:{x:m.x,y:m.y+1},to:{x:m.x,y:m.y}}};try{for(let i=0;i<6;i++)r.board({pieces,flipped:false,selectedId:''},{x:0,y:0,w:343,h:381},motion,1000+i*45);a.equal(count,37);}finally{delete global.wx;}});

test('captured tray preserves each captured piece allegiance',()=>{mock();const R=require('../src/renderer'),r=new R({}),seen=[];try{r.boardRect={w:343};r.disc=(x,y,radius,label,side)=>seen.push({label,side});r.captureTray([{text:'車',side:'red'},{text:'馬',side:'black'}],200);a.deepEqual(seen,[{label:'車',side:'red'},{label:'馬',side:'black'}]);}finally{delete global.wx;}});
test('fusion timeout preserves last move highlight without replaying motion',async()=>{mock();const Runtime=require('../src/runtime'),app=new Runtime();app.variant='fusion';await app.startGame({mode:'ai'});try{const c=app.controller;c._state.lastMove={id:c._state.pieces[0].id,from:{x:0,y:0},to:{x:0,y:1},fusionType:'guard_king',revealed:true,capturedId:'old-capture'};c._state.ply=1;c.sync('fusion');a.ok(c.motion);c._clock.deadline=Date.now()-1;c.tick();a.equal(c._state.reason,'timeout');a.equal(c.motion,null);a.equal(c.data.movingId,'');a.equal(c.data.captureId,'');a.equal(c.data.revealId,'');a.equal(c.data.lastMoveId,c._state.lastMove.id);}finally{teardown(app);}});

test('online entry is independent of stickers; receiving one loads its own package',async()=>{
 mock();
 const Runtime=require('../src/runtime'),G=require('../utils/game-engine'),app=new Runtime(),packages=[],actions=[];
 const state=G.newGame(undefined,'classic');
 let failSticker=true;
 wx.loadSubpackage=options=>{
  packages.push(options.name);
  if(failSticker&&options.name==='stickersB')options.fail();
  else options.success();
 };
 wx.cloud={callFunction:async({data})=>{
  actions.push(data.action);
  return {result:{ok:true,roomId:'r',rev:0,side:'red',state,waiting:true,red:{nickname:'R'},black:null}};
 }};
 app.profile={nickname:'R'};
 try{
  a.equal(await app.startGame({mode:'online',variant:'classic',match:'1'}),true);
  a.deepEqual(actions,['match']);a.ok(!packages.some(name=>name.startsWith('stickers')));
  a.ok(!packages.includes('uiFusionPieces'));
  const c=app.controller;
  await c.showSticker('sticker-6');
  a.equal(c.data.stickerImage,'');a.equal(app.scene,'game');
  failSticker=false;await c.showSticker('sticker-6');
  a.equal(c.data.stickerImage,'stickersB/sticker-6.png');
  a.deepEqual(packages.filter(name=>name.startsWith('stickers')),['stickersB','stickersB']);
 }finally{teardown(app);}
});
