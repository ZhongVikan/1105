const FX=require('./battle-effects');
// Presentation-only replacement layer. Game state, hit boxes and timers stay in the controller.
const meta=require('./ui-v2-meta');
const TYPES={'帥':'general','帅':'general','將':'general','将':'general','仕':'advisor','士':'advisor','相':'elephant','象':'elephant','車':'rook','车':'rook','俥':'rook','馬':'horse','马':'horse','傌':'horse','炮':'cannon','砲':'cannon','兵':'pawn','卒':'pawn'};
const BUTTONS={'简易 · 菜就多练局':'002','普通 · 不服就干场':'003','困难 · 棋王修罗场':'004','暂停':'005','悔棋':'006','翻转':'007','重开':'008','更多':'009','表情':'010','查看隐私保护指引':'011','取消等待':'014','取消匹配':'014','收起表情':'015','查看棋局':'017','返回首页':'018'};
function install(Renderer){const p=Renderer.prototype;
 const old={header:p.header,disc:p.disc,button:p.button,uiButton:p.uiButton,uiIcon:p.uiIcon,home:p.home,text:p.text,player:p.player,profileScene:p.profileScene,preload:p.preloadGameAssets};
 p.v2Art=function(key,x,y,w,h){const m=meta[key],im=this.uiImage(key);if(!im||!m)return false;this.ctx.drawImage(im,...m.box,x,y,w,h);return true;};
 // Reuse a text-free strip of the provided player panel as a stretchable fill.
 // Draw the frame independently so baked nicknames and timer digits never leak through.
 p.v2Frame=function(key,x,y,w,h){const im=this.uiImage(key),m=meta[key];if(!im||!m)return false;const [sx,sy,sw,sh]=m.box,c=this.ctx;
 c.save();c.shadowColor='#32241455';c.shadowBlur=3;c.shadowOffsetY=2;this.rounded(x,y,w,h,14);c.fillStyle=key.endsWith('red')?'#ce342f':'#302c27';c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
 this.rounded(x+2,y+2,w-4,h-4,12);c.save();c.clip();c.drawImage(im,sx+sw*.54,sy+10,2,sh-20,x+2,y+2,w-4,h-4);c.restore();c.strokeStyle='#efc77f';c.lineWidth=1;c.stroke();c.restore();return true;};
 p.text=function(label,x,y,size,color,align,bold){if(this._v2HomeFunctions){const functions=['暗棋','经典象棋','揭棋','邀请好友','与好友来一局','大厅匹配','在线匹配对手'];if(functions.includes(String(label)))color='#ffffff';}
 if(this._v2HomeFunctions&&color==='#ffffff'){this.ctx.save();this.ctx.shadowColor='#422600';this.ctx.shadowBlur=2;this.ctx.shadowOffsetY=1;old.text.call(this,label,x,y,size,color,align,bold);this.ctx.restore();return;}return old.text.call(this,label,x,y,size,color,align,bold);};
 p.home=function(){this._v2HomeFunctions=true;try{return old.home.call(this);}finally{this._v2HomeFunctions=false;}};
 p.referenceModeButton=function(variant,x,y,w,h,action){const im=this.uiImage('mode_reference');if(!im)return false;const selected=(this.runtime.variant||'dark')===variant,c=this.ctx;
 this._modeSprites=this._modeSprites||{};const key=variant+'|'+selected;let layer=this._modeSprites[key];if(!layer){layer=wx.createCanvas();layer.width=432;layer.height=132;const q=layer.getContext('2d'),sx=selected?94:553;
 q.beginPath();q.moveTo(66,0);q.lineTo(366,0);q.bezierCurveTo(454,0,454,132,366,132);q.lineTo(66,132);q.bezierCurveTo(-22,132,-22,0,66,0);q.closePath();q.clip();
 q.drawImage(im,sx,214,432,132,0,0,432,132);q.drawImage(im,selected?220:630,240,2,65,80,26,272,65);
 this._modeSprites[key]=layer;}
 c.drawImage(layer,x,y,w,h);old.text.call(this,{dark:'暗棋',classic:'经典',jieqi:'揭棋',fusion:'合棋'}[variant],x+w/2,y+h*.46,16,'#421d09','center',true);this.targets.push({x,y,w,h,action});return true;};
 // Sample original artwork directly. No regenerated icons or font substitution.
 p.referenceHomeFunctions=function(y,width){const im=this.uiImage('home_reference');if(!im)return false;const c=this.ctx,k=width/940,x=(375-width)/2;
 if(!this._homeLabelBackground){const layer=wx.createCanvas();layer.width=940;layer.height=551;const q=layer.getContext('2d');q.filter='saturate(.88) brightness(1.03)';q.drawImage(im,0,0);[[357,50,323,112,675],[619,264,163,84,788]].forEach(([bx,by,bw,bh,strip])=>q.drawImage(im,strip,by,1,bh,bx,by,bw,bh));q.filter='none';this._homeLabelBackground=layer;}
 const sprite=(sx,sy,sw,sh,r,action)=>{c.save();this.rounded(x+sx*k,y+sy*k,sw*k,sh*k,r*k);c.clip();c.drawImage(this._homeLabelBackground,sx,sy,sw,sh,x+sx*k,y+sy*k,sw*k,sh*k);c.restore();this.targets.push({x:x+sx*k,y:y+sy*k,w:sw*k,h:sh*k,action});};
 sprite(122,17,694,185,90,()=>this.runtime.open('difficulty'));
 sprite(51,227,414,156,60,()=>this.runtime.startGame({mode:'online'}));
 sprite(479,227,412,156,60,()=>this.runtime.startGame({mode:'online',match:'1'}));
 const label=(text,px,py,size,color,bold)=>old.text.call(this,text,x+px*k,y+py*k,size*k,color,'left',bold);
 label('人机对战',369,88,60,'#421d09',true);label('挑战智能对手，提升棋力',369,145,25,'#421d09',false);
 label('大厅匹配',622,290,38,'#ffffff',true);label('在线匹配对手',622,333,25,'#ffffff',false);
 [[195,'profile'],[408,'rules'],[624,'settings']].forEach(([sx,scene],i)=>{
 const ek=k*1.22,cx=x+(sx+60.5)*k,ey=y+405*k+18,ew=121*ek,eh=104*ek;
 c.save();this.rounded(cx-ew/2,ey,ew,eh,52*ek);c.clip();c.drawImage(im,sx,405,121,104,cx-ew/2,ey,ew,eh);c.restore();
 this.targets.push({x:cx-ew/2,y:ey,w:ew,h:140*ek,action:()=>this.runtime.open(scene)});
 old.text.call(this,i===0&&this.runtime.profile?'已登录':['登录','游戏规则','设置'][i],cx,ey+127*ek,26*ek,'#202020','center',true);
 });return true;};
 p.uiButton=function(label,x,y,w,h,action,color='cream',font=16){if(['gold','blue','green'].includes(color)){
 const compact=this.height-this.bottom-this.top<590;const tablet=this.windowWidth>=600;
 const start=compact?13:tablet?16:4;const offset={gold:0,blue:1,green:2}[color];
 if(this.v2Art('v2_home_button_'+(start+offset),x-3,y-3,w+6,h+8)){if(label)this.text(label,x+w/2,y+h/2,font,'#fff','center',true);this.targets.push({x,y,w,h,action});return;}}
 return old.uiButton.call(this,label,x,y,w,h,action,color,font);};
 p.v2TintedArt=function(key,x,y,w,h,color){const im=this.uiImage(key),m=meta[key];if(!im||!m)return false;this._v2TintCache=this._v2TintCache||new Map();const cacheKey=key+'|'+color;let layer=this._v2TintCache.get(cacheKey);if(!layer){const [sx,sy,sw,sh]=m.box;layer=wx.createCanvas();layer.width=sw;layer.height=sh;const c=layer.getContext('2d');c.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,sw,sh);c.globalCompositeOperation='source-over';this._v2TintCache.set(cacheKey,layer);}this.ctx.drawImage(layer,x,y,w,h);return true;};
 p.uiIcon=function(kind,x,y,size,color){const key='v2_icon_'+kind;if(color&&color!=='#fff'&&color!=='#ffffff'){if(this.v2TintedArt(key,x-size/2,y-size/2,size,size,color))return;}else if(this.v2Art(key,x-size/2,y-size/2,size,size))return;return old.uiIcon.call(this,kind,x,y,size,color);};
 p.button=function(label,x,y,w,h,action,primary){const id=BUTTONS[label];if(id&&this.v2Art('v2_button_'+id,x-3,y-3,w+6,h+6)){this.targets.push({x,y,w,h,action});return;}
 return old.button.call(this,label,x,y,w,h,action,primary);};
 // Piece faces come exclusively from replaceable PNG artwork, including fusion badges.
 p.pieceRing=function(x,y,r,color){const c=this.ctx;c.save();c.beginPath();c.arc(x,y,r*36/33,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=r*4/33;c.stroke();c.restore();};
 p.disc=function(x,y,r,label,side='red',hidden=false,selected=false,info){
 const fusionType=!hidden&&info&&info.fusionType;
 const kind=TYPES[label]||(info&&info.kind);
 const draw=(key,cx,cy,radius)=>{const im=this.uiImage(key),m=meta[key];if(!im||!m)return false;const [sx,sy,sw,sh]=m.box,k=radius*2/Math.max(sw,sh);this.ctx.drawImage(im,sx,sy,sw,sh,cx-sw*k/2,cy-sh*k/2,sw*k,sh*k);return true;};
 const c=this.ctx;c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 // Never fall back to font-drawn faces while images are loading.
 draw(hidden?'v2_piece_hidden':fusionType?'v2_fusion_'+side+'_'+fusionType:'v2_piece_'+side+'_'+kind,x,y,r);
 c.restore();if(selected)this.pieceRing(x,y,r,'#fff');if(info&&info.assumed&&!hidden){c.save();c.beginPath();c.arc(x+r*.66,y-r*.66,7,0,Math.PI*2);c.fillStyle='#9a5b1c';c.fill();c.strokeStyle='#ffe4a1';c.lineWidth=1;c.stroke();this.text('假',x+r*.66,y-r*.66,7,'#fff','center',true);c.restore();}
 };
 p.fusionHints=function(controller,b){const d=controller.data,s=d.inference&&controller._inference?controller._inference.state:controller._state,F=require('../utils/fusion');if(!d.inference&&!d.selectedId||d.inference&&!d.inferenceSelectedId||d.paused)return;const selectedId=d.inference?d.inferenceSelectedId:d.selectedId;const ctx=this.ctx;ctx.save();ctx.translate(b.x,b.y);ctx.scale(b.w/720,b.h/800);if(!this._fusionHints||this._fusionHints.state!==s||this._fusionHints.id!==selectedId){const points=[];for(let y=0;y<10;y++)for(let x=0;x<9;x++){const a=F.attempt(s,selectedId,{x,y});if(a)points.push({x,y,a});}this._fusionHints={state:s,id:selectedId,points};}for(const {x,y,a} of this._fusionHints.points){const t=this.boardPoint({x,y},d.flipped);ctx.strokeStyle=a.fusion?'#ffd24d':a.removed.length?'#62b878':'#ffffff';if(!a.fusion&&a.removed.length)this.pieceRing(t.x,t.y,33,'#62b878');else{ctx.lineWidth=a.fusion?3:2;ctx.beginPath();ctx.arc(t.x,t.y,a.fusion?35:12,0,Math.PI*2);ctx.stroke();}if(a.fusion){ctx.beginPath();ctx.arc(t.x,t.y,40,0,Math.PI*2);ctx.stroke();if(a.moving.general)this.text('王',t.x,t.y-44,15,'#ffd24d','center');}}ctx.restore();};
 p.captureHints=function(controller,b){
 const d=controller.data,s=d.inference&&controller._inference?controller._inference.state:controller._state,selectedId=d.inference?d.inferenceSelectedId:d.selectedId;if(!selectedId||d.paused||d.ended)return;
 if(s.variant==='fusion'){this.fusionHints(controller,b);return;}
 if(!this._captureHints||this._captureHints.state!==s||this._captureHints.id!==selectedId){
  const points=[],G=require('../utils/game-engine'),selected=s.pieces.find(p=>p.id===selectedId),actor=selected&&selected.hidden?require('../utils/rules-core').controller(selected):selected&&selected.side;for(let y=0;y<10;y++)for(let x=0;x<9;x++){if(!selected||!G.legalAttempt({...s,turn:actor}.pieces,selectedId,{x,y},actor))continue;const target=s.pieces.find(p=>p.id!==selectedId&&p.x===x&&p.y===y);points.push({x,y,capture:!!target,selected});}
  this._captureHints={state:s,id:selectedId,points};
 }
 const c=this.ctx;c.save();c.translate(b.x,b.y);c.scale(b.w/720,b.h/800);for(const p of this._captureHints.points){const q=this.boardPoint(p,d.flipped);if(p.capture)this.pieceRing(q.x,q.y,33,'#62b878');else{c.save();c.beginPath();c.arc(q.x,q.y,12,0,Math.PI*2);c.strokeStyle='#ffffff';c.lineWidth=2;c.stroke();c.restore();}}c.restore();
 };
 p.captureTray=function(captured,y,width=335){const r=33*this.boardRect.w/720*.8,step=2*r+3,columns=Math.max(1,Math.floor(width/step));
 captured.forEach((piece,i)=>this.disc(22+r+(i%columns)*step,y+r+Math.floor(i/columns)*step,r,piece.text,piece.side));
 return Math.max(step,Math.ceil(captured.length/columns)*step);
 };
 p.player=function(side,name,avatar,y,captured,data,now,capturePlacement='below'){const active=data.turn===side&&!data.ended&&!data.waiting;
 if(!this.v2Frame('v2_player_bar_'+side,16,y,343,48))return old.player.call(this,side,name,avatar,y,captured,data,now);
 const c=this.ctx;c.save();c.beginPath();c.arc(41,y+24,17,0,Math.PI*2);c.clip();const loaded=this.image(avatar,24,y+7,34,34);c.restore();
 if(!loaded&&!this.v2Art('v2_avatar_fallback_'+side,22,y+5,38,38))this.disc(41,y+23,16,side==='red'?'帥':'將',side);
 if(active){c.save();c.beginPath();c.arc(41,y+24,21,0,Math.PI*2);c.strokeStyle=side==='red'?'#b71e16':'#302720';c.lineWidth=1.5;c.stroke();c.restore();}
 const chars=Array.from((name||'').replace(/\s*·\s*/g,'·')),limit=active?5:13,short=chars.slice(0,limit).join('')+(chars.length>limit?'…':'');this.text(short,68,y+17,12,side==='red'?'#ac231a':'#191919');this.text(active?(data.paused?'计时暂停':'当前行棋'):'等待对方',68,y+34,11,'#9c8567');
 if(active){const g=c.createLinearGradient(268,y+5,268,y+44);g.addColorStop(0,'#fff080');g.addColorStop(1,'#ffc837');this.card(145,y+7,85,34,g,'#edb12c');const clock=this.uiImage('v2_player_bar_black');if(clock)c.drawImage(clock,536,101,48,45,149,y+13,20,20);this.text(data.seconds+'秒',223,y+25,19,data.seconds<=10?'#c33d2b':'#ae1c10','right',true);}
 if(capturePlacement==='below')this.captureTray(captured,y+58);
 };
 p.profileScene=function(){old.profileScene.call(this);if(!this.runtime.loginBusy&&!this.runtime._privacyBusy){const b=this.profileButtonRect();this.v2Art('v2_profile_authorize_button',b.x,b.y,b.w,b.h);}};
 // The generated reference contains a matte outside the plaque. Canvas clips the
 // illustrated outline before drawing; no matte/checker pixels enter the scene.
 p.matchTitleFrame=function(x,y,w,h){const im=this.uiImage('match_info_frame');if(!im)return false;const c=this.ctx;c.save();c.translate(x,y);c.scale(w/2057,h/764);c.beginPath();
 c.moveTo(268,169);c.lineTo(1777,169);c.bezierCurveTo(1841,169,1881,194,1905,257);c.bezierCurveTo(1970,274,1994,302,2008,361);c.lineTo(2020,389);c.lineTo(2008,424);c.bezierCurveTo(1995,473,1970,500,1908,520);c.bezierCurveTo(1884,574,1847,599,1793,600);c.lineTo(248,600);c.bezierCurveTo(194,600,161,578,145,528);c.bezierCurveTo(85,514,58,479,47,432);c.lineTo(41,390);c.lineTo(54,352);c.bezierCurveTo(65,306,88,279,145,261);c.bezierCurveTo(166,205,201,173,268,169);c.closePath();
 // Leaves are separate contours, safely inside the illustrated edges.
 c.moveTo(211,89);c.bezierCurveTo(184,110,175,142,185,177);c.lineTo(239,167);c.bezierCurveTo(254,141,245,111,211,89);c.closePath();
 c.moveTo(336,122);c.bezierCurveTo(294,120,260,137,247,165);c.lineTo(290,167);c.bezierCurveTo(313,159,326,143,336,122);c.closePath();
 c.moveTo(79,193);c.bezierCurveTo(94,230,109,254,141,261);c.lineTo(174,214);c.bezierCurveTo(145,180,110,182,79,193);c.closePath();
 c.clip();c.drawImage(im,0,0,2057,764);c.restore();return true;};
 p.header=function(title,back=true){if(this.runtime.scene!=='game'||back)return old.header.call(this,title,back);
 const w=220,h=58,x=(375-w)/2,y=this.top-31;
 if(!this.matchTitleFrame(x,y,w,h)){const g=this.ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#854221');g.addColorStop(1,'#512913');this.card(x+4,this.top-13,w-8,32,g,'#e9ac51');}
 this.ctx.save();this.ctx.shadowColor='#331706';this.ctx.shadowBlur=1;this.ctx.shadowOffsetY=1;this.text(title,187.5,y+h/2,15,'#fff9eb','center',true);this.ctx.restore();
 };
 p.game=function(now){
 const c=this.runtime.controller;if(!c)return;const d=c.data,inference=d.inference&&c._inference,trial=inference&&c._inference.state,motion=inference?null:FX.frame(c,now),visualNow=c._battle&&c._battle.pausedAt!==null?c._battle.pausedAt:now;this.layoutBoard(d);const b=this.boardRect;
 const view=this._boardView||(this._boardView={});view.pieces=inference?d.inferencePieces:(motion&&motion.pieces||d.pieces);view.flipped=d.flipped;view.selectedId=inference?d.inferenceSelectedId:d.selectedId;view.lastMoveId=inference?d.inferenceLastMoveId:(motion?(visualNow-motion.at>=motion.timings.contact?motion.lastMoveId:motion.beforeLastMoveId):d.lastMoveId);
 const afterContact=!motion||visualNow-motion.at>=motion.timings.contact;
 const topCaptured=inference?d.inferenceTopCaptured:(motion?((afterContact?motion.afterBySide:motion.beforeBySide)[d.topSide]||[]):d.topCaptured);
 const bottomCaptured=inference?d.inferenceBottomCaptured:(motion?((afterContact?motion.afterBySide:motion.beforeBySide)[d.bottomSide]||[]):d.bottomCaptured);
 const warning=FX.warningPhase(c,now),variantTitle=({dark:'暗棋',classic:'经典象棋',jieqi:'揭棋',fusion:'合棋'})[c._state&&c._state.variant||this.runtime.variant||'dark'];
 this.header(inference?'推理中':variantTitle+' · 对局中',false);
 if(!inference&&!d.waiting&&!d.ended)this.button('推理',16,this.top-16,56,36,()=>c.enterInference());
 if(!inference&&d.mode==='ai'&&!d.fakeOpponent&&!d.ended)this.button('暂停',375-72,this.top-16,56,36,()=>c.togglePause());
 this.player(d.topSide,d.topName,d.topAvatar,this.top+28,topCaptured,d,now);if(d.turn===d.topSide&&!d.paused&&!inference)FX.danger(this,this.top+28,warning);
 this.board(view,b,motion,visualNow);
 if(!motion)this.captureHints(c,b);
 if(!inference){this.ctx.save();this.ctx.translate(b.x,b.y);this.ctx.scale(b.w/720,b.h/800);if(c._battle)FX.drawCues(this,c._battle.cues,visualNow,d.flipped);FX.rings(this,view,motion,visualNow,c._battle&&c._battle.selection);this.ctx.restore();}
 const boardBottom=b.y+b.h*(1094/1200),trayY=boardBottom+7,step=this.captureTray(bottomCaptured,trayY);
 const rowStep=2*33*b.w/720*.8+3,trayHeight=Math.max(64,2*rowStep+6,step);
 if(!inference&&d.pendingChase&&(d.mode!=='ai'||d.turn==='red'))this.button('结束行动',264,trayY+36,95,28,()=>c.finishChase(),true);if(inference&&trial&&trial.pendingChase)this.button('结束追击',264,trayY+36,95,28,()=>c.finishInferenceChase(),true);
 const playerY=trayY+trayHeight+5;this.player(d.bottomSide,d.bottomName,d.bottomAvatar,playerY,[],d,now,'none');if(d.turn===d.bottomSide&&!d.paused&&!inference)FX.danger(this,playerY,warning);
 if(!inference&&!d.waiting&&!d.ended)this.button('表情',264,playerY+7,88,34,()=>c.toggleStickers());
 const by=playerY+58;
 if(inference){[['撤回一步','undoInference'],['重置推理','resetInference'],['退出推理','exitInference']].forEach(([label,fn],idx)=>this.button(label,16+idx*114,by,105,46,()=>c[fn]()));}
 else [['悔棋','undo'],['翻转','flip'],['重开','restart'],['更多','more']].forEach(([label,fn],i)=>this.button(label,16+i*88,by,79,46,()=>c[fn]()));
 if(!inference&&d.matchFound){const age=Math.max(0,now-(d.matchFoundAt||now)),p=Math.min(1,age/900),alpha=p<.22?p/.22:1-(p-.22)/.78,scale=.92+.08*Math.min(1,p/.28);this.ctx.save();this.ctx.globalAlpha=Math.max(0,alpha);this.ctx.translate(187.5,Math.min(this.height/2,b.y+b.h*.52));this.ctx.scale(scale,scale);this.card(-112,-34,224,68,'rgba(255,248,225,.94)','#d49b3e');this.text('匹配成功',0,0,25,'#9b5d1c','center',true);this.ctx.restore();}
 if(!inference&&d.stickerImage)this.image(d.stickerImage,102,b.y+b.h*.25,171,171);
 if(d.waiting){const y=this.top+145;this.overlay();const expanded=!d.onlineMatch&&d.seatMenu;if(d.onlineMatch){this.card(27,y,321,187,'rgba(255,247,231,.78)','#e6c58d');this.text('正在匹配棋友',187.5,y+33,22,'#74512d','center',true);this.text('已等待 '+Math.max(0,d.matchSeconds||0)+' 秒',187.5,y+61,14,'#a47745','center');this.button('取消匹配',54,y+90,267,48,()=>c.cancelWait(),true);}else{this.card(27,y,321,expanded?420:345,'rgba(255,247,231,.78)','#e6c58d');this.text('等待棋友入座',187.5,y+33,22,'#74512d','center',true);this.button('邀请微信好友',54,y+66,267,48,()=>this.runtime.share(),true);this.button('面对面模式',54,y+124,267,48,()=>c.startHotseat(),true);this.button('取消等待',54,y+182,267,48,()=>c.cancelWait(),true);const labels={red:'红方',black:'黑方',rotate:'轮换'},label=labels[d.seatPreference]||'轮换';this.button('对局设置',54,y+240,267,48,()=>c.toggleSeatMenu(),true);if(!d.seatMenu){this.text('我方：',112,y+302,13,'#8a6b4a','right');if(label==='轮换'){this.text('轮',132,y+302,13,'#c52d21','left',true);this.text('换',145,y+302,13,'#252525','left',true);}else this.text(label,132,y+302,13,label==='红方'?'#c52d21':'#252525','left',true);}if(d.seatMenu){[['red','红方'],['black','黑方'],['rotate','轮换']].forEach(([value,text],i)=>{const oy=y+289+i*36;if(value==='rotate'){this.text('轮',178,oy+17,16,'#c52d21','center',true);this.text('换',196,oy+17,16,'#252525','center',true);}else this.text(text,187.5,oy+17,16,value==='red'?'#c52d21':'#252525','center',true);this.targets.push({x:54,y:oy,w:267,h:36,action:()=>c.setSeatPreference(value)});});}}}
 if(d.inference&&d.inferenceAssumptionMenu)this.inferenceAssumptionSheet(c);
 if(d.showStickers&&!inference)this.stickerSheet(c);
 if(d.showResult)this.result(c);if(!inference&&d.manualPaused){this.overlay();const y=Math.max(this.top+60,(this.height-180)/2);this.card(35,y,305,180);this.text('对局已暂停',187.5,y+39,22,'#74512d','center',true);this.text('计时与 AI 均已暂停',187.5,y+76,13,'#927650','center');this.button('继续对局',64,y+110,247,46,()=>c.togglePause(),true);}
 };

 // Reference battle controls; cached source artwork, with live labels and timers.
 p.battleArt=function(box,x,y,w,h,r,blank,source='game_reference'){const im=this.uiImage(source);if(!im)return false;
 this._battleArt=this._battleArt||{};const key=source+'|'+box.join(',')+'|'+r+'|'+JSON.stringify(blank);let layer=this._battleArt[key];
 if(!layer){layer=wx.createCanvas();layer.width=box[2];layer.height=box[3];const q=layer.getContext('2d'),[sx,sy,sw,sh]=box;
 q.beginPath();q.moveTo(r,0);q.lineTo(sw-r,0);q.quadraticCurveTo(sw,0,sw,r);q.lineTo(sw,sh-r);q.quadraticCurveTo(sw,sh,sw-r,sh);q.lineTo(r,sh);q.quadraticCurveTo(0,sh,0,sh-r);q.lineTo(0,r);q.quadraticCurveTo(0,0,r,0);q.closePath();q.clip();q.drawImage(im,...box,0,0,sw,sh);
 if(blank){q.save();if(sw===774){q.beginPath();q.moveTo(43,5);q.lineTo(sw-43,5);q.quadraticCurveTo(sw-5,5,sw-5,43);q.lineTo(sw-5,sh-43);q.quadraticCurveTo(sw-5,sh-5,sw-43,sh-5);q.lineTo(43,sh-5);q.quadraticCurveTo(5,sh-5,5,sh-43);q.lineTo(5,43);q.quadraticCurveTo(5,5,43,5);q.closePath();q.clip();}q.drawImage(im,blank[0],blank[1],blank[6]||2,blank[3],blank[2],blank[4],blank[5],blank[3]);q.restore();}this._battleArt[key]=layer;}
 const k=Math.min(w/box[2],h/box[3]),dw=box[2]*k,dh=box[3]*k;this.ctx.save();this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';this.ctx.shadowColor='rgba(100,49,9,0.20)';this.ctx.shadowBlur=2;this.ctx.shadowOffsetY=1.3;this.ctx.drawImage(layer,x+(w-dw)/2,y+(h-dh)/2,dw,dh);this.ctx.restore();return true;};
 // The inference controls reuse the pause frame and scale the clean blank
 // frame to their adaptive button box before drawing the live label.
 p.pauseFrameArt=function(x,y,w,h){const im=this.uiImage('pause_button_blank');if(!im)return false;
  const rx=Math.min(28*w/147,w/2),ry=Math.min(28*h/81,h/2),k=.5522848,c=this.ctx;c.save();c.beginPath();c.moveTo(x+rx,y);c.lineTo(x+w-rx,y);c.bezierCurveTo(x+w-rx+k*rx,y,x+w,y+ry-k*ry,x+w,y+ry);c.lineTo(x+w,y+h-ry);c.bezierCurveTo(x+w,y+h-ry+k*ry,x+w-rx+k*rx,y+h,x+w-rx,y+h);c.lineTo(x+rx,y+h);c.bezierCurveTo(x+rx-k*rx,y+h,x,y+h-ry+k*ry,x,y+h-ry);c.lineTo(x,y+ry);c.bezierCurveTo(x,y+ry-k*ry,x+rx-k*rx,y,x+rx,y);c.closePath();c.clip();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,0,0,147,81,x,y,w,h);c.restore();return true;};
 p.pauseLabel=function(label,x,y,w,h){const count=Array.from(label).length,size=Math.min(17,14*h/36,w/(count+2));this.text(label,x+w/2,y+h/2,size,'#65300c','center',true);};
 const previousBattleButton=p.button;
 p.button=function(label,x,y,w,h,action,primary){const boxes={'暂停':[32,99,147,81,28],'悔棋':[39,1381,195,106,34],'翻转':[243,1381,185,106,34],'重开':[438,1381,187,106,34],'更多':[635,1381,192,106,34],'表情':[661,1172,168,72,28]};
 const waitingButton=['waiting_button',[0,0,621,112]];
 if(this.runtime.scene==='game'&&['推理','暂停'].includes(label)&&this.pauseFrameArt(x,y,w,h)){this.pauseLabel(label,x,y,w,h);this.targets.push({x,y,w,h,action});return;}
 if(this.runtime.scene==='game'&&label==='推理'&&this.battleArt([0,0,147,81],x,y,w,h,28,null,'inference_button')){this.pauseLabel(label,x,y,w,h);this.targets.push({x,y,w,h,action});return;}
 if(this.runtime.scene==='game'&&['撤回一步','重置推理','退出推理','取消选择'].includes(label)&&this.pauseFrameArt(x,y,w,h)){this.pauseLabel(label,x,y,w,h);this.targets.push({x,y,w,h,action});return;}
 const modalArt={'收起表情':['extra_buttons',[0,0,269,80]],'继续对局':['extra_buttons',[0,85,578,112]],'邀请微信好友':waitingButton,'面对面模式':waitingButton,'取消等待':waitingButton,'取消匹配':waitingButton,'对局设置':waitingButton,'再来一局':['result_reference',[120,827,625,112]],'查看棋局':['result_reference',[124,951,298,101]],'返回首页':['result_reference',[443,951,298,101]]}[label];
 if(this.runtime.scene==='game'&&modalArt&&this.battleArt(modalArt[1],x,y,w,h,modalArt[1][3]/2,null,modalArt[0])){if(['邀请微信好友','面对面模式','取消等待','取消匹配','对局设置'].includes(label))this.text(label,x+w/2,y+h/2,Math.min(17,w/(Array.from(label).length+2)),'#65300c','center',true);this.targets.push({x,y,w,h,action});return;}
 const b=boxes[label];if(this.runtime.scene==='game'&&b&&this.battleArt(b.slice(0,4),x,y,w,h,b[4])){this.targets.push({x,y,w,h,action});return;}
 if(this.runtime.scene==='game'){const c=this.ctx,g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#fffaa1');g.addColorStop(.42,'#ffe472');g.addColorStop(1,'#ffc249');c.save();c.shadowColor='#99551e66';c.shadowBlur=3;c.shadowOffsetY=2;this.rounded(x,y,w,h,18);c.fillStyle=g;c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.lineWidth=1.5;c.strokeStyle='#e8a134';c.stroke();this.rounded(x+2,y+2,w-4,h-5,16);c.strokeStyle='#fff4c6';c.stroke();c.restore();this.text(label,x+w/2,y+h/2,Math.min(17,w/(Array.from(label).length+2)),'#65300c','center',true);this.targets.push({x,y,w,h,action});return;}
 return previousBattleButton.call(this,label,x,y,w,h,action,primary);};
 const previousBattleCard=p.card;
 p.card=function(x,y,w,h,fill,stroke){if(this.runtime.scene!=='game')return previousBattleCard.call(this,x,y,w,h,fill,stroke);
 if(!fill){const g=this.ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#fffbed');g.addColorStop(1,'#f8e6c5');fill=g;stroke='#e5ad48';}
 return previousBattleCard.call(this,x,y,w,h,fill,stroke);};
 // Cache the reference silhouette at its native resolution, keeping the bevel intact.
 p.battleTitleArt=function(x,y,w,h,originalLabel){
  const im=this.uiImage('match_info_frame');if(!im)return false;const c=this.ctx;c.save();c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,0,0,2172,724,x,y,w,h);c.restore();return true;
 };
 const previousBattleHeader=p.header;
 p.header=function(title,back=true){if(this.runtime.scene!=='game'||back)return previousBattleHeader.call(this,title,back);
 const w=176,h=Math.round(w*724/2172),x=(375-w)/2,y=this.top+2-h/2;
 if(!this.battleTitleArt(x,y,w,h,title==='经典象棋 · 对局中'))return previousBattleHeader.call(this,title,back);
 this.ctx.save();this.ctx.shadowColor='#51250c';this.ctx.shadowBlur=1;this.ctx.shadowOffsetY=1;this.text(title,x+w/2,y+h/2,Math.min(16,w/(Array.from(title).length+1)),'#fff9ed','center',true);this.ctx.restore();};
 const previousBattlePlayer=p.player;
 p.player=function(side,name,avatar,y,captured,data,now,capturePlacement='below'){
 const red=side==='red',sy=red?1257:198,active=data.turn===side&&!data.ended&&!data.waiting;
 if(!this.battleArt([44,sy,774,105],16,y,343,48,42,[red?320:500,sy+12,114,81,12,red?651:610,250]))return previousBattlePlayer.call(this,side,name,avatar,y,captured,data,now,capturePlacement);
 // The source portrait is retained unless an actual player avatar is available.
 const c=this.ctx;c.save();c.beginPath();c.arc(45,y+24,18,0,Math.PI*2);c.clip();this.image(avatar,27,y+6,36,36);c.restore();
 const chars=Array.from((name||'').replace(/\s*·\s*/g,'·')),limit=active?5:13,short=chars.slice(0,limit).join('')+(chars.length>limit?'…':'');this.text(short,74,y+17,12.5,red?'#a52612':'#30302d','left',true);
 this.text(active?(data.paused?'计时暂停':'当前行棋'):'等待对方',74,y+34,11.5,'#a58c70','left',true);
 if(active){this.battleArt([590,1273,214,71],140.5,y+8,94,32,30,[665,1280,77,54,7,120]);this.ctx.save();this.ctx.shadowColor='#fff5ae';this.ctx.shadowOffsetY=0.6;this.text(data.seconds+'秒',226.5,y+25,19.5,'#c1200a','right',true);this.ctx.restore();}
 if(capturePlacement==='below')this.captureTray(captured,y+58);
 };
 p.inferenceAssumptionSheet=function(controller){
 const opts=this.runtime.controller.data.inferenceAssumptionOptions||[],rows=Math.ceil(opts.length/2),h=86+rows*38+48,y=Math.max(this.top+18,(this.height-h)/2);this.overlay('rgba(47,36,28,.74)');this.card(27,y,321,h,'rgba(255,247,231,.78)','#e6c58d');this.text('选择假设身份',187.5,y+30,20,'#74512d','center',true);this.text('仅用于推理，不代表正式棋局已揭示',187.5,y+57,11,'#8f7354','center');opts.forEach((o,i)=>{const x=44+(i%2)*145,yy=y+78+Math.floor(i/2)*38;this.card(x,yy,133,32,'#fff1cf','#d3a05a');this.text(o.label,x+66.5,yy+16,14,o.side==='red'?'#c52d21':'#252525','center',true);this.targets.push({x,y:yy,w:133,h:32,action:()=>controller.chooseInferenceAssumption(o.side,o.kind)});});this.button('取消选择',135,y+h-48,105,46,()=>controller.cancelInferenceAssumption(),true);
 };
 p.preloadGameAssets=function(){if(this._v2Loading)return this._v2Loading;const a=require('./ui-assets'),keys=['extra_buttons','waiting_reference','waiting_button','inference_button','pause_button_blank','result_reference','game_reference','match_info_frame','board_base','capture_ring',...Object.keys(meta).filter(k=>((k.startsWith('v2_piece_')||k.startsWith('v2_fusion_'))&&!k.endsWith('_selected'))||k.startsWith('v2_player_bar_')||k.startsWith('v2_avatar_')||/^v2_button_00[5-9]$/.test(k)||k==='v2_button_010')];
 const pkgs=[...new Set(keys.map(k=>a[k].split('/')[0]))];this.uiPackages=this.uiPackages||{};
 this._v2Loading=Promise.all(pkgs.map(name=>new Promise(resolve=>{if(this.uiPackages[name]==='ready')return resolve(true);this.uiPackages[name]='loading';const done=ok=>{this.uiPackages[name]=ok?'ready':'failed';resolve(ok);};if(!wx.loadSubpackage)return done(true);try{wx.loadSubpackage({name,success:()=>done(true),fail:()=>done(false)});}catch(e){done(false);}}))).then(async results=>{const images=await Promise.all(keys.map(k=>{this.uiImage(k);const rec=this.images.get(a[k]);return rec&&(rec.image?true:rec.ready)||false;}));FX.preload(this);this.invalidate();return results.every(Boolean)&&images.every(Boolean);}).finally(()=>{this._v2Loading=null;});return this._v2Loading;
 };
}
module.exports={install};
