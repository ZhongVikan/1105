const definition = require('./controller');
const Renderer = require('./renderer');
const C = require('../utils/coordinates');
const S = require('../utils/storage');
const Online = require('../utils/online');
const config = require('../config');
const Audio = require('../utils/audio');

function inviteRoom(query){
 let room=query&&query.room;
 if(typeof query==='string'){
  for(const part of query.replace(/^\?/,'').split('&')){const bits=part.split('=');let key=bits.shift()||'',value=bits.join('=');try{key=decodeURIComponent(key);value=decodeURIComponent(value);}catch(e){}if(key==='room'){room=value;break;}}
 }
 if(Array.isArray(room))room=room[0];
 try{room=decodeURIComponent(String(room||''));}catch(e){room=String(room||'');}
 return /^[a-f0-9]{32}$/i.test(room)?room.toLowerCase():'';
}

class Runtime {
 constructor(){
  this.variant='dark';this.scene='home';this.controller=null;this.returnScene='home';this.scroll=0;
  this.profile=wx.getStorageSync('chess-profile')||null;this.pendingRoom='';this._inviteRoom='';this._inviteBusy=false;this._invitePromptRoom='';this.hidden=false;
  this.renderer=new Renderer(this);this.audio=new Audio();this.touch=null;this.authButton=null;this.loginBusy=false;
 }
 start(){
  this.onStart=e=>this.touchStart(e);this.onMove=e=>this.touchMove(e);this.onEnd=e=>this.touchEnd(e);
  wx.onTouchStart(this.onStart);wx.onTouchMove(this.onMove);wx.onTouchEnd(this.onEnd);
  wx.onTouchCancel(()=>{this.touch=null;});
  wx.onHide(()=>{this.hidden=true;this.audio.hide();this.renderer.stop();if(this.authButton)this.authButton.hide();if(this.controller)this.controller.onHide();});
  wx.onShow(options=>{this.hidden=false;this.audio.refresh();this.renderer.resume();if(this.authButton)this.authButton.show();if(this.controller)this.controller.onShow();this.invite(options&&options.query);});
  if(wx.onWindowResize)wx.onWindowResize(()=>{this.renderer.resize();if(this.scene==='profile'&&this.authButton)this.makeAuthButton();});
  if(wx.showShareMenu)wx.showShareMenu({withShareTicket:true,menus:['shareAppMessage']});
  if(wx.onShareAppMessage)wx.onShareAppMessage(()=>this.shareInfo());
  // Hold the first frame until the new UI subpackages and their images are
  // ready. Otherwise the legacy canvas fallback can flash briefly before the
  // reference UI finishes decoding.
  if(typeof wx.loadSubpackage==='function'){
   this.renderer._uiBooting=true;this.renderer.draw();
   let ready;try{ready=this.renderer.preloadGameAssets?this.renderer.preloadGameAssets():Promise.resolve(true);}catch(e){ready=Promise.resolve(false);}
   Promise.resolve(ready).catch(()=>false).finally(()=>{if(this.renderer){this.renderer._uiBooting=false;this.renderer.invalidate();this.renderer.resume();}});
  }else this.renderer.resume();
  this.invite(wx.getLaunchOptionsSync?wx.getLaunchOptionsSync().query:null);
 }
 toast(title){wx.showToast({title,icon:'none'});}
 invalidate(){this.renderer.invalidate();}
 invite(query){
  const room=inviteRoom(query);if(!room)return;
  const currentRoom=this.controller&&(this.controller.data.roomId||(this.controller._room&&this.controller._room.roomId));if(currentRoom===room)return;
  if(this._inviteRoom===room&&(
   this._inviteBusy||this._invitePromptRoom===room||
   this.pendingRoom===room&&this.scene==='profile'
  ))return;
  this._inviteRoom=room;
  this.pendingRoom=room;
  if(this.controller&&this.controller._state.status==='playing'){
   this._invitePromptRoom=room;
   wx.showModal({title:'加入好友房间',content:'离开当前棋局并尝试加入好友房间？离开不会暂停真人局计时。',success:r=>{if(r.confirm)this.enterInvite();else{this.pendingRoom='';this._inviteRoom='';}},complete:()=>{this._invitePromptRoom='';}});
  }else this.enterInvite();
 }
 enterInvite(){if(this._inviteBusy)return;if(!this.profile){this.open('profile');return;}const room=this.pendingRoom;if(!room)return;this._inviteBusy=true;Promise.resolve(this.startGame({mode:'online',room})).then(ok=>{if(ok)this.pendingRoom='';if(this._inviteRoom===room){this._inviteBusy=false;this._inviteRoom=ok?'':room;}}).catch(()=>{if(this._inviteRoom===room){this._inviteBusy=false;this._inviteRoom=room;}});}
 open(scene){
  if(scene==='rules')this.ruleVariant=this.controller?this.controller._state.variant:this.variant;
  this.destroyAuthButton();this.returnScene=this.controller?'game':'home';this.scene=scene;this.scroll=0;this.invalidate();
  // Privacy permission is requested only by the visible profile button tap.
 }
 back(){this.destroyAuthButton();this.scene=this.controller?'game':'home';this.audio.refresh();this.invalidate();}
 home(){this.destroyAuthButton();if(this.controller){this.controller.onUnload();this.controller=null;}this.scene='home';this.audio.refresh();this.invalidate();}
 async startGame(options){
  options={variant:this.variant||'dark',...options};
  if(options.mode==='online'&&!config.cloudEnv){this.toast('真人对战还需配置云开发环境');return;}
  if(options.mode==='online'&&!this.profile){this.open('profile');return;}
  this.destroyAuthButton();if(this.controller)this.controller.onUnload();
  // Never enter the game scene until board/piece assets are decoded and reusable.
  // preloadGameAssets is cached, so after the first warm-up this resolves immediately.
  try{if(this.renderer.preloadGameAssets)await this.renderer.preloadGameAssets();}catch(e){this.toast('游戏资源加载失败，请重试');return false;}
  const c={...definition,data:JSON.parse(JSON.stringify(definition.data)),runtime:this};
  c.setData=patch=>{if(patch.showResult&&!c.data.showResult)c._resultShownAt=Date.now();const changed=Object.keys(patch).some(k=>c.data[k]!==patch[k]);Object.assign(c.data,patch);if(changed&&this.controller===c)this.invalidate();};
  this.controller=c;this.scene='game';this.invalidate();
  try{await c.onLoad(options);}catch(e){if(this.controller===c){this.home();this.toast('游戏启动失败：'+e.message);}return false;}
  return this.controller===c&&(!(options&&options.mode==='online')||!!c._room);
 }
 toggleSetting(key){const s=S.settings();s[key]=!s[key];S.setSettings(s);this.audio.refresh();this.invalidate();}
 shareInfo(){return this.controller&&(this.controller.data.roomId||(this.controller._room&&this.controller._room.roomId))?this.controller.onShareAppMessage():{title:'暗棋大乱斗 · 真假难辨，步步为营',query:''};}
 share(){const info=this.shareInfo();if(this.controller&&this.controller._mode==='online'&&this.controller.data.waiting&&!info.query){this.toast('房间创建中，请稍候');return false;}if(wx.shareAppMessage){wx.shareAppMessage(info);return true;}this.toast('当前环境不支持分享');return false;}
 destroyAuthButton(){if(this.authButton){this.authButton.destroy();this.authButton=null;}}
 makeAuthButton(){
  if(!this._privacyApproved||this.scene!=='profile')return;
  this.destroyAuthButton();if(!wx.createUserInfoButton){this.toast('当前微信版本不支持小游戏身份授权');return;}
  const rect=this.renderer.profileButtonRect(),scale=this.renderer.scale;
  this.authButton=wx.createUserInfoButton({type:'text',text:'继续授权头像昵称并登录',withCredentials:false,lang:'zh_CN',style:{left:rect.x*scale+(this.renderer.offsetX||0),top:rect.y*scale,width:rect.w*scale,height:rect.h*scale,lineHeight:rect.h*scale,fontSize:16*scale,borderRadius:12*scale,backgroundColor:'rgba(0,0,0,0)',color:'rgba(0,0,0,0)',textAlign:'center',borderWidth:0,borderColor:'#976535'}});
  this.authButton.onTap(res=>{this.audio.effect('click');this.handleProfileResult(res);});
 }
 openPrivacy(){if(wx.openPrivacyContract)wx.openPrivacyContract({fail:e=>this.profileError('打开隐私指引',e)});else this.toast('当前微信版本不支持查看隐私指引');}
 async prepareProfile(){
  if(this.scene!=='profile'||this._privacyBusy||this.loginBusy||this.authErrorOpen)return;
  if(!require('../utils/privacy-support').supported()){this.profileError('基础库检查',{message:'获取头像昵称需要微信基础库 2.32.3 及以上，请更新微信；开发者工具请切换到满足要求的基础库。'});return;}
  this._privacyBusy=true;this._privacyApproved=false;if(this.invalidate)this.invalidate();
  try{
   // First operation in the profile button handler: platform privacy consent.
   await new Promise((resolve,reject)=>wx.requirePrivacyAuthorize({success:resolve,fail:reject}));
   if(this.scene!=='profile')return;this._privacyApproved=true;
   const setting=wx.getSetting?await new Promise((resolve,reject)=>wx.getSetting({success:resolve,fail:reject})):null;
   if(this.scene!=='profile')return;
   if(setting&&setting.authSetting&&setting.authSetting['scope.userInfo']&&wx.getUserInfo){
    const result=await new Promise((resolve,reject)=>wx.getUserInfo({withCredentials:false,lang:'zh_CN',success:resolve,fail:reject}));
    if(this.scene==='profile')this.handleProfileResult(result);
   }else{
    // Privacy consent is separate from profile permission. WeChat's native
    // user-info button collects the latter on a subsequent explicit tap.
    this.makeAuthButton();
   }
  }catch(error){if(this.scene==='profile')this.profileError(this._privacyApproved?'获取头像昵称':'隐私授权',error);}
  finally{this._privacyBusy=false;if(this.invalidate)this.invalidate();}
 }

 handleProfileResult(res){
  if(this.scene!=='profile'||this.loginBusy||this.authErrorOpen)return;
  if(res&&res.userInfo){this.saveProfile(res.userInfo);return;}
  this.profileError('获取头像昵称',res||{});
 }
 profileError(stage,error){
  if(this.authErrorOpen)return;
  const raw=String(error&&(error.errMsg||error.message)||'微信未返回用户信息，也未提供错误原因');
  const code=error&&(error.errCode!==undefined?error.errCode:error.code);
  const cancelled=/cancel|取消/i.test(raw),missingPrivacy=/noprivacy|api permission/i.test(raw);
  const title=cancelled?'本次操作已取消':'登录未完成';
  this.authErrorOpen=true;if(this.authButton)this.authButton.hide();
  wx.showModal({title,showCancel:false,confirmText:'知道了',content:(missingPrivacy?'该 AppID 尚未获得头像昵称隐私接口权限。请管理员在微信公众平台完善并发布用户隐私保护指引，声明用户头像、昵称的收集用途，再重新预览或上传验证。此项不能靠玩家重复授权解决。\n\n':'')+stage+'阶段：'+raw.slice(0,420)+(code!==undefined?'\n错误码：'+String(code):'')+'\n\n未完成登录，仍可进行人机练习。若未主动取消，请截图此提示以便排查。',complete:()=>{this.authErrorOpen=false;if(this.scene==='profile'&&this.authButton)this.authButton.show();}});
 }
 async saveProfile(info){
  if(this.loginBusy)return;if(!config.cloudEnv)return this.toast('真人对战还需配置云开发环境');
  if(!info.avatarUrl||!info.nickName)return this.profileError('获取头像昵称',{message:'微信返回的信息缺少头像或昵称'});
  this.loginBusy=true;this.invalidate();let stage='下载头像';
  try{
   // Authentication is supplied by cloud WX context. Never trust a client OPENID.
   const file=await new Promise((resolve,reject)=>wx.downloadFile({url:info.avatarUrl,success:r=>r.statusCode===200?resolve(r.tempFilePath):reject(Error('头像下载失败')),fail:reject}));
   stage='上传头像到云存储';
   const uploaded=await wx.cloud.uploadFile({cloudPath:'avatars/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.png',filePath:file});
   stage='云函数保存玩家资料';
   await Online.call('profile',{nickname:info.nickName,avatar:uploaded.fileID});
   this.profile={nickname:info.nickName,avatar:uploaded.fileID};wx.setStorageSync('chess-profile',this.profile);
   if(this.scene==='profile'){this.back();if(this.pendingRoom)this.enterInvite();}
  }catch(e){this.profileError(stage,e);}finally{this.loginBusy=false;this.invalidate();}
 }
 position(t){return {x:(t.clientX-(this.renderer.offsetX||0))/this.renderer.scale,y:t.clientY/this.renderer.scale};}
 touchStart(e){this.audio.unlock();const t=e.touches&&e.touches[0];if(!t)return;const p=this.position(t);this.touch={...p,lastY:p.y,moved:false,scene:this.scene};}
 touchMove(e){if(!this.touch||!e.touches||!e.touches[0])return;const p=this.position(e.touches[0]);if(Math.hypot(p.x-this.touch.x,p.y-this.touch.y)>10)this.touch.moved=true;
  if(this.scene==='rules'){this.scroll=Math.max(0,Math.min(this.renderer.maxScroll||0,this.scroll+this.touch.lastY-p.y));this.invalidate();}this.touch.lastY=p.y;
 }
 touchEnd(e){const start=this.touch;this.touch=null;const t=e.changedTouches&&e.changedTouches[0];if(!start||!t||start.moved||start.scene!==this.scene)return;const p=this.position(t);if(Math.hypot(p.x-start.x,p.y-start.y)>10)return;
  const targetState=this.renderer._targetState,controller=this.controller,targetStateFresh=!targetState||targetState.scene===this.scene&&(!controller||targetState.waiting===!!controller.data.waiting);const action=targetStateFresh&&this.renderer.targets.slice().reverse().find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);if(action){this.audio.effect('click');action.action();return;}
  const c=controller;if(this.scene!=='game'||!c||c.data.showResult||c.data.showStickers||c.data.waiting)return;
  const rect=this.renderer.boardRect,point=this.renderer.boardHit(p.x,p.y,rect,c.data.flipped);if(!point)return;
  const visiblePieces=c.data.inference?c.data.inferencePieces:c.data.pieces;const piece=visiblePieces.find(v=>v.x===point.x&&v.y===point.y);c.onPoint({detail:{point,pieceId:piece?piece.id:null}});
 }
}
module.exports=Runtime;
