const FX=require('./battle-effects'),Resolution=require('./render-resolution');
const C=require('../utils/coordinates'),S=require('../utils/storage'),rules=require('./rules'),rulesCore=require('../utils/rules-core'),pieceFont=require('../utils/piece-font');
const VARIANTS={dark:'暗棋',classic:'经典象棋',jieqi:'揭棋',fusion:'合棋'};
const DISCLAIMER='抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。创作者Vikan';
class Renderer {
 constructor(runtime){this.runtime=runtime;this.canvas=wx.createCanvas();this.ctx=this.canvas.getContext('2d');this.targets=[];this.images=new Map();this.dirty=true;this.running=false;this.lastDraw=0;this.boardCache=null;this.fxQuality=1;try{const d=wx.getDeviceInfo?wx.getDeviceInfo():{};if(d.benchmarkLevel>0&&d.benchmarkLevel<=10)this.fxQuality=0;}catch(e){}this.pieceFamily=pieceFont.load();this.resize();}
 resize(){const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.scale=info.windowWidth/375;this.height=info.windowHeight/this.scale;this.dpr=Resolution.dpr(info,this.fxQuality===0);this.canvas.width=Math.round(info.windowWidth*this.dpr);this.canvas.height=Math.round(info.windowHeight*this.dpr);this.top=(info.safeArea?info.safeArea.top:20)/this.scale;
  if(wx.getMenuButtonBoundingClientRect){const b=wx.getMenuButtonBoundingClientRect();if(b&&b.bottom)this.top=Math.max(this.top,b.bottom/this.scale+8);}this.top=Math.max(28,this.top);this.bottom=(info.safeArea?Math.max(0,info.windowHeight-info.safeArea.bottom):0)/this.scale;
  this.layoutBoard(this.runtime.controller&&this.runtime.controller.data);this.invalidate();}
 layoutBoard(data){const count=Math.max(data&&data.topCaptured?data.topCaptured.length:0,data&&data.bottomCaptured?data.bottomCaptured.length:0),designWidth=this.windowWidth&&this.scale?this.windowWidth/this.scale:375,tablet=designWidth>500,boardMax=tablet?Math.min(560,designWidth-64):364,topOffset=tablet?112:138,reserve=tablet?195:176;let extra=0,w=210;for(let i=0;i<4;i++){const y=this.top+topOffset+extra;w=Math.min(boardMax,Math.max(190,(this.height-this.bottom-y-reserve-extra)/1.013));const step=2*33*w/720*.8+3,cols=Math.max(1,Math.floor(250/step));extra=Math.max(0,Math.ceil(count/cols)-2)*step;}this.trayExtra=extra;this.boardRect={x:(375-w)/2,y:this.top+topOffset+extra,w,h:w/.9};}

 invalidate(){this.dirty=true;this.queueFrame();}
 queueFrame(){if(this.running&&!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.loop();});}
 resume(){if(this.running)return;this.running=true;this.dirty=true;this.loop();}
 stop(){this.running=false;if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;}
 loop(){if(!this.running)return;const time=Date.now(),c=this.runtime.controller;let animate=false;
  if(c&&this.runtime.scene==='game'){
   const revision=c._battle&&c._battle.revision;FX.frame(c,time);if(c._battle&&revision!==c._battle.revision)this.dirty=true;
   const warning=c.data.seconds<=10&&!c.data.ended&&!c.data.waiting&&!c.data.paused&&!c._hidden;
   animate=!c.data.manualPaused&&!c._hidden&&((c._battle&&c._battle.active())||warning||(c.data.showResult&&time-c._resultShownAt<340)||c.data.matchFound);
   if(!c._battle&&c.motion){const end=c.motion.at+FX.timing(c.motion.move).total;if(time<end)animate=true;else if(this.lastDraw<end)this.dirty=true;}
  }
  if((this.dirty||animate)&&time-this.lastDraw>=(animate?(this.fxQuality===0?33:16):(this.runtime.scene==='rules'?16:42))){this.draw(time);this.lastDraw=time;this.dirty=false;}
  if(this.dirty||animate)this.queueFrame();
 }


 rounded(x,y,w,h,r=12){const c=this.ctx;r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
 card(x,y,w,h,fill='#fffaf1',stroke){const c=this.ctx;c.save();this.rounded(x,y,w,h);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}c.restore();}
 text(text,x,y,size=16,color='#392f25',align='left',bold=false){const c=this.ctx;c.fillStyle=color;c.font=(bold?'bold ':'')+size+'px "Noto Sans CJK SC", sans-serif';c.textAlign=align;c.textBaseline='middle';c.fillText(String(text),x,y);}
 wrap(text,x,y,width,size=13,color='#786b5a',lineHeight=21){let line='',yy=y;for(const char of text){this.ctx.font=size+'px "Noto Sans CJK SC", sans-serif';if(this.ctx.measureText(line+char).width>width&&line){this.text(line,x,yy,size,color);yy+=lineHeight;line=char;}else line+=char;}if(line)this.text(line,x,yy,size,color);return yy+lineHeight;}
 button(label,x,y,w,h,action,primary=false){const c=this.ctx,g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,primary?'#bb874b':'#fffaf0');g.addColorStop(1,primary?'#89592e':'#eddfc9');c.save();c.shadowColor='#5e3e2225';c.shadowBlur=8;c.shadowOffsetY=3;this.card(x,y,w,h,g,primary?'#ac743b':'#dccbad');c.restore();this.text(label,x+w/2,y+h/2,Math.min(16,w<85?13:16),primary?'#fffaf0':'#695036','center',primary);this.targets.push({x,y,w,h,action});}
 image(src,x,y,w,h){if(!src)return false;let rec=this.images.get(src);if(!rec){rec={image:null};this.images.set(src,rec);const load=url=>{const im=wx.createImage();im.onload=()=>{rec.image=im;this.invalidate();};im.onerror=()=>{rec.error=true;};im.src=url;};
   if(src.startsWith('cloud://')&&wx.cloud)wx.cloud.getTempFileURL({fileList:[src]}).then(r=>{const url=r.fileList[0]&&r.fileList[0].tempFileURL;if(url)load(url);}).catch(()=>{});else load(src);
  }if(rec.image){this.ctx.drawImage(rec.image,x,y,w,h);return true;}return false;}
 disc(x,y,r,label,side='red',hidden=false,selected=false){const c=this.ctx;c.save();c.translate(x,y-(selected?3:0));c.shadowColor=selected?'#a77d4055':'#60432255';c.shadowBlur=selected?12:4;c.shadowOffsetY=selected?8:4;
  c.beginPath();c.arc(0,2,r,0,Math.PI*2);c.fillStyle='#a87942';c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
  const g=c.createRadialGradient(-r*.3,-r*.45,1,0,0,r*1.25);g.addColorStop(0,hidden?'#edd2a1':'#fff1c8');g.addColorStop(1,hidden?'#b98344':'#d6a566');c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fillStyle=g;c.fill();c.strokeStyle='#a97940';c.lineWidth=1;c.stroke();c.beginPath();c.arc(0,0,r-3,0,Math.PI*2);c.strokeStyle='#f8e3b5';c.stroke();c.beginPath();c.arc(0,0,r-5,0,Math.PI*2);c.strokeStyle='#bb9056';c.lineWidth=.7;c.stroke();
  if(selected){c.beginPath();c.arc(0,0,r+3,0,Math.PI*2);c.strokeStyle='#af8640';c.lineWidth=1.3;c.stroke();}c.restore();}
 pieceSide(piece){return piece&&piece.hidden?rulesCore.controller(piece):piece&&piece.side;}
 pieceShouldRotate(data,piece){return !!(data&&data.mode==='local'&&this.pieceSide(piece)==='black');}
 orientedDisc(x,y,r,piece,data,selected=false,forceRotate=null){const rotate=forceRotate===null?this.pieceShouldRotate(data,piece):!!forceRotate;if(!rotate)return this.disc(x,y,r,piece.text,piece.side,piece.hidden,selected,piece);const c=this.ctx;c.save();c.translate(x,y);c.rotate(Math.PI);this.disc(0,0,r,piece.text,piece.side,piece.hidden,selected,piece);c.restore();}
 beginPlayerPerspective(data,side,y){const rotate=!!(data&&data.mode==='local'&&side==='black');if(rotate){this.ctx.save();this.ctx.translate(187.5,y+24);this.ctx.rotate(Math.PI);this.ctx.translate(-187.5,-(y+24));}return rotate;}
 endPlayerPerspective(rotate){if(rotate)this.ctx.restore();}
 header(title,back=true){this.text(title,187.5,this.top+6,18,'#3c332a','center',true);if(back)this.button('返回',16,this.top-16,56,36,()=>this.runtime.back());}
 draw(now=Date.now()){const c=this.ctx;const controller=this.runtime.controller;this._targetState={scene:this.runtime.scene,waiting:!!(controller&&controller.data&&controller.data.waiting)};c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,0,0);c.clearRect(0,0,375,this.height);c.fillStyle='#faf6ef';c.fillRect(0,0,375,this.height);this.targets=[];
  const scene=this.runtime.scene;if(scene==='home')this.home();else if(scene==='difficulty')this.difficulty();else if(scene==='settings')this.settings();else if(scene==='rules')this.ruleScene();else if(scene==='profile')this.profileScene();else if(scene==='game')this.game(now);
 }
 home(){const t=this.top,h=this.height,compact=h-this.bottom-t<570;this.text('智谋无声 · 棋局制胜',187.5,t+26,13,'#9b8369','center');this.text('暗棋大乱斗',187.5,t+72,compact?31:35,'#352a21','center',true);
  const hero=t+(compact?125:145);this.disc(139,hero,compact?29:38,'帥','red');this.disc(236,hero,compact?29:38,'將','black');this.disc(187,hero+(compact?19:26),compact?19:24,'','red',true);Object.entries(VARIANTS).forEach(([key,label],i)=>this.button(label,38+i*103,hero+(compact?39:59),93,30,()=>{this.runtime.variant=key;this.runtime.invalidate();},(this.runtime.variant||'dark')===key));
  const by=hero+(compact?75:100),bh=compact?40:48,gap=compact?48:61;this.button('人机对战',38,by,299,bh,()=>this.runtime.open('difficulty'),true);this.button('邀请好友',38,by+gap,299,bh,()=>this.runtime.startGame({mode:'online'}));this.button('大厅匹配',38,by+gap*2,299,bh,()=>this.runtime.startGame({mode:'online',match:'1'}));
  this.button(this.runtime.profile?'已登录':'登录',38,by+gap*3,88,42,()=>this.runtime.open('profile'));this.button('游戏规则',144,by+gap*3,88,42,()=>this.runtime.open('rules'));this.button('设置',249,by+gap*3,88,42,()=>this.runtime.open('settings'));
  this.wrap(DISCLAIMER,28,Math.max(by+gap*3+64,h-this.bottom-70),319,10,'#9b948b',15);
 }
 difficulty(){this.header(VARIANTS[this.runtime.variant||'dark']+' · 选择难度');const levels=[['简易','菜就多练局','easy'],['普通','不服就干场','normal'],['困难','棋王修罗场','hard']];levels.forEach((l,i)=>{const y=this.top+95+i*104;this.button(l[0]+' · '+l[1],28,y,319,76,()=>this.runtime.startGame({mode:'ai',level:l[2]}),i===1);});this.wrap(this.runtime.variant==='classic'?'经典象棋全明子，士守九宫、象不过河。三档 AI 均使用合法走法，困难模式拥有更高的搜索预算。':this.runtime.variant==='jieqi'?'双方各自洗牌，没有卧底；不能吃己方棋子。暗子走完揭开，AI 不读取隐藏身份。':'暗子身份对双方未知。AI 只根据公开棋面判断，困难模式拥有更高的搜索预算。',35,this.top+430,305,13);}
 settings(){this.header('声音设置');const s=S.settings();[['全部声音','sound'],['背景音乐','music'],['棋子操作音效','effects'],['播报与表情语音','voice']].forEach(([label,key],i)=>{const y=this.top+65+i*76;this.card(22,y,331,62);this.text(label,40,y+31,16);this.card(281,y+19,49,25,s[key]?'#a27c45':'#c9c2b8');const c=this.ctx;c.beginPath();c.arc(s[key]?318:294,y+31.5,9,0,Math.PI*2);c.fillStyle='#fff';c.fill();this.targets.push({x:22,y,w:331,h:62,action:()=>this.runtime.toggleSetting(key)});});this.wrap('关闭全部声音后，背景音乐、操作音效、中文播报与表情语音均静音。',30,this.top+400,315,13);}
 ruleScene(){this.header(VARIANTS[this.runtime.variant||'dark']+'规则');const c=this.ctx,top=this.top+45,bottom=this.height-this.bottom-18;c.save();c.beginPath();c.rect(18,top,339,bottom-top);c.clip();let y=top+15-this.runtime.scroll;for(const section of rules.forVariant(this.runtime.variant||'dark').filter(section=>!section.hidden)){this.text(section.title,28,y,17,'#6b4b2e',undefined,true);y=this.wrap(section.body,28,y+30,315,14,'#625444',24)+22;}c.restore();this.maxScroll=Math.max(0,y+this.runtime.scroll-bottom);}
 profileButtonRect(){return {x:40,y:this.top+235,w:295,h:48};}
 profileScene(){this.header('对局身份');this.disc(187.5,this.top+91,35,'帥');this.wrap('经你确认的头像昵称将展示给对局对手。未授权仍可进行人机练习。',40,this.top+160,295,14);const b=this.profileButtonRect();this.card(b.x,b.y,b.w,b.h,'#976535');this.text(this.runtime.loginBusy?'正在登录…':this.runtime._privacyBusy?'正在确认隐私授权…':'点击授权头像昵称',187.5,b.y+24,16,'#fff','center');if(!this.runtime.authButton)this.targets.push({...b,action:()=>this.runtime.prepareProfile()});this.wrap('首次点击确认隐私授权，再点击继续授权头像昵称。',40,b.y+82,295,12);this.button('查看隐私保护指引',70,b.y+115,235,38,()=>this.runtime.openPrivacy());}
 player(side,name,avatar,y,captured,data,now){const active=data.turn===side&&!data.ended&&!data.waiting,rotateBar=this.beginPlayerPerspective(data,side,y);this.card(16,y,343,48,active?'#f4e5c9':'#fffaf2',active?'#c79e61':'#ede3d3');const ctx=this.ctx;ctx.save();ctx.beginPath();ctx.arc(41,y+24,17,0,Math.PI*2);ctx.clip();const loaded=this.image(avatar,24,y+7,34,34);ctx.restore();if(!loaded)this.disc(41,y+23,16,side==='red'?'帥':'將',side);
  if(active){ctx.beginPath();ctx.arc(41,y+24,20,0,Math.PI*2);ctx.strokeStyle='rgba(172,128,60,'+(.45+.25*Math.sin(now/600))+')';ctx.lineWidth=2;ctx.stroke();}

  const short=Array.from(name).slice(0,14).join('');this.text(short,68,y+17,12,'#514030');this.text(active?(data.paused?'计时暂停':'当前行棋'):'等待对方',68,y+34,11,'#9c8567');if(active)this.text(data.seconds+'秒',342,y+25,23,data.seconds<=10?'#c33d2b':'#997640','right',true);
  this.endPlayerPerspective(rotateBar);const r=33*this.boardRect.w/720*.8,step=2*r+3,columns=Math.floor(286/step),rotateCaptured=data.mode==='local'&&side==='black';captured.forEach((p,i)=>{this.orientedDisc(72+r+(i%columns)*step,y+62+Math.floor(i/columns)*step,r,p,data,false,rotateCaptured);});
 }
  game(now){const c=this.runtime.controller;if(!c)return;const d=c.data;this.layoutBoard(d);const b=this.boardRect;this.header(d.inference?'推理中':VARIANTS[c._state&&c._state.variant||this.runtime.variant||'dark']+' · 对局中',false);if(!d.inference&&!d.waiting&&!d.ended)this.button('推理',16,Math.max(4,this.top-68),56,36,()=>c.enterInference());if(!d.inference&&(d.mode==='ai'||d.mode==='local')&&!d.fakeOpponent&&!d.ended)this.button('暂停',16,this.top-16,56,36,()=>c.togglePause());this.player(d.topSide,d.topName,d.topAvatar,this.top+28,d.topCaptured,d,now);
  this.board(d,b,c.motion,now);const bottom=b.y+b.h+12;this.player(d.bottomSide,d.bottomName,d.bottomAvatar,bottom,d.bottomCaptured,d,now);
  this.text(d.message||'准备棋局…',20,bottom+114+this.trayExtra,12,'#846545');const by=bottom+132+this.trayExtra;[['悔棋','undo'],...(d.mode==='local'?[]:[['翻转','flip']]),['重开','restart'],['更多','more']].forEach(([label,fn],i)=>this.button(label,16+i*88,by,79,46,()=>c[fn]()));
  if(!d.waiting&&!d.ended)this.button('表情',301,bottom+100+this.trayExtra,58,28,()=>c.toggleStickers());
  if(d.stickerImage){this.image(d.stickerImage,102,b.y+b.h*.25,171,171);}
  if(d.waiting){const y=this.top+145;this.overlay();const expanded=!d.onlineMatch&&d.seatMenu;this.card(27,y,321,d.onlineMatch?187:expanded?420:345,'rgba(255,247,231,.78)','#e6c58d');if(d.onlineMatch){this.text('正在匹配棋友',187.5,y+33,22,'#74512d','center',true);this.text('已等待 '+Math.max(0,d.matchSeconds||0)+' 秒',187.5,y+61,14,'#a47745','center');this.button('取消匹配',54,y+90,267,48,()=>c.cancelWait(),true);}else{this.text('等待棋友入座',187.5,y+33,22,'#74512d','center',true);this.button('邀请微信好友',54,y+66,267,48,()=>this.runtime.share(),true);this.button('面对面模式',54,y+124,267,48,()=>c.startHotseat(),true);this.button('取消等待',54,y+182,267,48,()=>c.cancelWait(),true);const labels={red:'红方',black:'黑方',rotate:'轮换'},label=labels[d.seatPreference]||'轮换';this.button('对局设置',54,y+240,267,48,()=>c.toggleSeatMenu(),true);if(!d.seatMenu){this.text('我方：',112,y+302,13,'#8a6b4a','right');if(label==='轮换'){this.text('轮',132,y+302,13,'#c52d21','left',true);this.text('换',145,y+302,13,'#252525','left',true);}else this.text(label,132,y+302,13,label==='红方'?'#c52d21':'#252525','left',true);}if(d.seatMenu){[['red','红方'],['black','黑方'],['rotate','轮换']].forEach(([value,text],i)=>{const oy=y+289+i*36;if(value==='rotate'){this.text('轮',178,oy+17,16,'#c52d21','center',true);this.text('换',196,oy+17,16,'#252525','center',true);}else this.text(text,187.5,oy+17,16,value==='red'?'#c52d21':'#252525','center',true);this.targets.push({x:54,y:oy,w:267,h:36,action:()=>c.setSeatPreference(value)});});}}}
  if(d.showStickers)this.stickerSheet(c);
  if(d.showResult)this.result(c);if(d.manualPaused){this.overlay();const y=Math.max(this.top+60,(this.height-180)/2);this.card(35,y,305,180);this.text('对局已暂停',187.5,y+39,22,'#74512d','center',true);this.text(d.mode==='local'?'计时已暂停':'计时与 AI 均已暂停',187.5,y+76,13,'#927650','center');this.button('继续对局',64,y+110,247,46,()=>c.togglePause(),true);}
 }
 board(d,b,motion,now=Date.now()){
  const ctx=this.ctx;ctx.save();ctx.translate(b.x,b.y);ctx.scale(b.w/720,b.h/800);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const raster=Resolution.boardScale(b.w,this.scale||1,this.dpr||1);if((this._boardRasterScale||1)!==raster){this.boardCache=null;this.stationaryKey=null;}this._boardRasterScale=raster;
  if(!this.boardCache){const canvas=wx.createCanvas();canvas.width=Math.round(720*raster);canvas.height=Math.round(800*raster);const original=this.ctx;this.ctx=canvas.getContext('2d');this.ctx.setTransform(raster,0,0,raster,0,0);this.paintBoardBase();this.ctx=original;this.boardCache=canvas;}
  ctx.drawImage(this.boardCache,0,0,720,800);
  const elapsed=motion?Math.max(0,now-motion.at):Infinity,moving=motion&&elapsed<(motion.timings||FX.timing(motion.move)).total?motion.move.id:null;
  const signature=[d.pieces,d.flipped,d.selectedId,moving,this.uiRevision||0];
  if(!this.stationaryKey||signature.some((v,i)=>v!==this.stationaryKey[i])){
   const layer=this.stationaryLayer||wx.createCanvas(),width=Math.round(720*raster),height=Math.round(800*raster);if(layer.width!==width)layer.width=width;if(layer.height!==height)layer.height=height;const original=this.ctx;this.ctx=layer.getContext('2d');this.ctx.setTransform(raster,0,0,raster,0,0);this.ctx.clearRect(0,0,720,800);
   for(const p of d.pieces){if(p.id===moving||p.id===d.selectedId)continue;const pos=this.boardPoint(p,d.flipped);this.orientedDisc(pos.x,pos.y,33,p,d);}
   this.ctx=original;this.stationaryLayer=layer;this.stationaryKey=signature;
  }
  ctx.drawImage(this.stationaryLayer,0,0,720,800);if(moving)FX.under(this,motion,elapsed,d.flipped);
  const draw=p=>{const animated=p.id===moving,at=animated?FX.pose(motion.move,elapsed,q=>this.boardPoint(q,d.flipped),this._movingPose||(this._movingPose={}),motion.timings):this.boardPoint(p,d.flipped);
   let face=p,hidden=p.hidden;if(animated){hidden=motion.move.revealed?at.hidden:p.hidden;
    if(motion.move.fusionType&&elapsed<(motion.timings||FX.timing(motion.move)).contact&&motion.move.sourcePieces)face=motion.move.sourcePieces[0];}
   ctx.save();ctx.translate(at.x,at.y-(at.lift||0));ctx.scale(at.flipScale||1,1);this.orientedDisc(0,0,33,face,d);ctx.restore();
  };
  for(const p of d.pieces)if(p.id===moving&&p.id!==d.selectedId)draw(p);
  for(const p of d.pieces)if(p.id===d.selectedId)draw(p);
  if(moving)FX.over(this,motion,elapsed,d.flipped);
  ctx.restore();
 }

 paintBoardBase(){const ctx=this.ctx;this.card(0,0,720,800,'#d9ae73','#a16f37');this.card(8,8,704,780,'#e8c48c','#f6dbad');ctx.save();this.rounded(10,10,700,778,8);ctx.clip();for(let i=0;i<90;i++){const x=10+i*8;ctx.beginPath();ctx.moveTo(x,10);ctx.bezierCurveTo(x+8,240,x-5,560,x+3,790);ctx.strokeStyle=i%3?'#ab78331b':'#ffebbf30';ctx.lineWidth=i%3?1:2;ctx.stroke();}ctx.restore();
  for(const l of C.lines()){ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.strokeStyle='#9b713d';ctx.lineWidth=1.4;ctx.stroke();}this.text('楚 河',210,400,26,'#9c7443','center');this.text('漢 界',510,400,26,'#9c7443','center');}

 overlay(fill='#2f241ca0'){this.ctx.fillStyle=fill;this.ctx.fillRect(0,0,375,this.height);this.targets=[];}
 result(c){const d=c.data,y=Math.max(this.top+75,(this.height-310)/2);this.overlay('#2f241c55');this.card(27,y,321,302,'rgba(255,247,231,0.76)');this.text(d.unlucky?'卧底现身 · 反将自身':'本局结束',187.5,y+35,13,'#9b8059','center');this.text(d.resultTitle,187.5,y+87,31,'#9a642a','center',true);this.text(d.resultDetail,187.5,y+135,19,'#5e4933','center');this.button('再来一局',52,y+170,271,49,()=>c.restart(),true);this.button('查看棋局',52,y+226,128,44,()=>c.closeResult());this.button('返回首页',194,y+226,128,44,()=>this.runtime.home());}
 stickerSheet(c){this.overlay();const y=Math.max(this.top+20,this.height-this.bottom-325);this.card(8,y,359,325);this.button('收起表情',245,y+10,111,36,()=>c.toggleStickers());c.data.stickers.forEach((s,i)=>{const x=17+(i%4)*88,yy=y+61+Math.floor(i/4)*124;this.image(s.image,x,yy,78,85);this.text(Array.from(s.text).slice(0,6).join(''),x+39,yy+96,10,'#725634','center');this.targets.push({x,y:yy,w:82,h:112,action:()=>c.sendSticker({currentTarget:{dataset:{id:s.id}}})});});}
}
require('./ui-process').install(Renderer);
require('./ui-v2').install(Renderer);
require('./ui-secondary').install(Renderer);
const drawResult=Renderer.prototype.result;
Renderer.prototype.result=function(controller){this.ctx.save();this.ctx.globalAlpha=FX.smooth((Date.now()-(controller._resultShownAt||0))/320);drawResult.call(this,controller);this.ctx.restore();};
module.exports=Renderer;
