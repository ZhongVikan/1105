const FX=require('./battle-effects'),BattleTimeline=require('./battle-timeline');
const G=require('../utils/game-engine'),R=require('../utils/rules-core'),S=require('../utils/storage'),AI=require('../utils/ai'),Clock=require('../utils/turn-clock'),Audio=require('../utils/audio'),Online=require('../utils/online'),stickers=require('../utils/stickers');
const Repetition=require('../utils/repetition'),Fusion=require('../utils/fusion'),FakeOpponents=require('../utils/fake-opponents');
const names={red:'红方',black:'黑方'};
const MATCH_HUMAN_WAIT_SECONDS=10,MATCH_FAKE_MAX_SECONDS=20;
const roleLabels={red:{rook:'俥',horse:'傌',elephant:'相',advisor:'仕',cannon:'炮',pawn:'兵'},black:{rook:'車',horse:'馬',elephant:'象',advisor:'士',cannon:'砲',pawn:'卒'}};
const inferenceRoles=['rook','horse','elephant','advisor','cannon','pawn'];
const clone=value=>JSON.parse(JSON.stringify(value));
// Build a rules-ready public snapshot. Hidden pieces retain only their opening
// role and public controller side; secret side/kind/text/source data is removed.
function publicPiece(piece){
 const q=clone(piece);
 if(q.hidden){q.side=R.controller(q);q.kind=R.openingRole(q);q.text='';q.hidden=true;delete q.general;delete q.fusionType;delete q.sourcePieces;delete q.assumed;delete q.assumptionKind;delete q.assumptionSide;}
 return q;
}
function publicState(state){const q=clone(state);q.pieces=state.pieces.map(publicPiece);q.captured=clone(state.captured||[]);return q;}
function publicKey(state){return JSON.stringify({variant:state.variant,status:state.status,turn:state.turn,ply:state.ply,pendingChase:state.pendingChase||null,pieces:state.pieces.map(p=>{const hidden=!!p.hidden;return [p.id,p.x,p.y,hidden?R.controller(p):p.side,hidden?R.openingRole(p):p.kind,hidden];}).sort((a,b)=>a[0].localeCompare(b[0])),captured:(state.captured||[]).map(p=>[p.id,p.capturedBy,p.atPly]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))});}
module.exports={
 data:{pieces:[],flipped:false,selectedId:'',turn:'red',topSide:'black',bottomSide:'red',topName:'黑方',bottomName:'红方',topCaptured:[],bottomCaptured:[],message:'',ply:0,showResult:false,resultTitle:'',resultDetail:'',unlucky:false,movingId:'',lastMoveId:'',revealId:'',captureId:'',ended:false,seconds:60,paused:false,mode:'ai',level:'normal',waiting:false,matchSeconds:0,matchFound:false,matchFoundAt:0,fakeOpponent:false,pendingRequest:'',pendingUntil:0,topAvatar:'',bottomAvatar:'',stickers,showStickers:false,stickerImage:'',stickerText:'',roomId:'',busy:false,manualPaused:false,inference:false,inferencePieces:[],inferenceSelectedId:'',inferenceLastMoveId:'',inferenceTopCaptured:[],inferenceBottomCaptured:[],inferenceMessage:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[],onlineMatch:false,seatPreference:'rotate',seatMenu:false},
 async onLoad(options){this._alive=true;this._token=0;this._audio=this.runtime&&this.runtime.audio||new Audio();this._audio.refresh();this._clock=new Clock();this._history=[];this._repetitionHistory=[];this._countdownCueKey='';this._fakeOpponent=null;this._fakePending=null;this._fakeBotStickerCooldownUntil=0;this._onlineSide=null;this._matchQueue=options.mode==='online'&&options.match==='1';this._matchStartedAt=0;this._matchFallbackAt=0;this._matchResolved=false;this._state=G.newGame(undefined,options.variant||'dark');this._mode=options.mode==='online'?'online':'ai';this._level=['easy','normal','hard'].includes(options.level)?options.level:'normal';this.setData({mode:this._mode,level:this._level,matchSeconds:0,pendingRequest:'',pendingUntil:0});
  this._interval=setInterval(()=>this.tick(),250);
  if(this._mode==='online'){this.setData({waiting:true,onlineMatch:options.match==='1',fakeOpponent:false,seatPreference:options.seatPreference||'rotate'});try{await Promise.all(['stickersA','stickersB'].map(name=>new Promise((resolve,reject)=>wx.loadSubpackage({name,success:resolve,fail:reject}))));if(!this._alive)return;const action=options.room?'join':options.match==='1'?'match':'create';this.applyRoom(await Online.call(action,{roomId:options.room,variant:options.variant||'dark',seatPreference:this.data.seatPreference}));if(this._alive)this._poll=setInterval(()=>this.poll(),1200);}catch(e){this.toast(e.message);this.home();}}
  else {this.loadStickers();this._clock.start();this.sync();}
 },
 onShow(){this._hidden=false;if(this._alive&&!this._interval)this._interval=setInterval(()=>this.tick(),250);if(this._alive&&this._room&&!this._poll)this._poll=setInterval(()=>this.poll(),1200);if(this._audio)this._audio.refresh();if(this._clock){this.tick();this.scheduleAI();}if(this._room)this.poll();},
 onHide(){this.clearPresentation();this._warningPhase=null;this._hidden=true;this._token++;clearInterval(this._interval);clearInterval(this._poll);this._interval=null;this._poll=null;if(this._audio)this._audio.hide();/* Clock intentionally continues in background. */},
 onUnload(){this._inference=null;this.clearPresentation();this._warningPhase=null;clearTimeout(this._resultTimer);clearTimeout(this._matchFoundTimer);clearTimeout(this._moveAudioTimer);clearTimeout(this._fakeStickerTimer);clearTimeout(this._fakeRequestTimer);if(this._aiDelayResolve){clearTimeout(this._aiDelayTimer);this._aiDelayResolve();this._aiDelayResolve=null;}this._fakePending=null;this._alive=false;this._token++;clearInterval(this._interval);clearInterval(this._poll);clearTimeout(this._checkTimer);clearTimeout(this._stickerTimer);if(this._mode==='online'&&this._room&&this._state&&this._state.status==='ended')Online.call('leave',{roomId:this._room.roomId,rev:this._room.rev}).catch(()=>{});if(this._audio){if(this.runtime&&this.runtime.audio===this._audio)this._audio.hide();else this._audio.destroy();}},
 toast(title){wx.showToast({title,icon:'none'});},
 tick(){if(!this._alive||!this._state||this._state.status!=='playing')return;
  if(this._mode==='online'){if(this._room&&this._room.waiting){if(this._matchQueue&&this._matchStartedAt){const elapsed=Math.max(0,Math.floor((Date.now()-this._matchStartedAt)/1000));this.setData({matchSeconds:elapsed});if(elapsed>=this._matchFallbackAt)this.activateFakeOpponent();}return;}if(!this._room)return;const now=Date.now()+this._offset,r=this._room;const pause=Math.max(0,r.holdUntil-now);const seconds=Math.max(0,Math.min(60,Math.ceil((r.deadline-now-pause)/1000)));this.setData({seconds,paused:pause>0});this.countdownCue(seconds);return;}
  const seconds=this._clock.seconds(),paused=this._clock.reasons.size>0;if(seconds!==this.data.seconds||paused!==this.data.paused)this.setData({seconds,paused});this.countdownCue(seconds);if(this._clock.expired()){this._token++;this._state={...this._state,status:'ended',reason:'timeout',motif:'超时判负',winner:R.opposite(this._state.turn)};this.sync('timeout');}
 },
 countdownCue(seconds){if(seconds>10||!this._audio||!this._state||this._state.status!=='playing')return;const key=this._state.ply+':'+this._state.turn;if(this._countdownCueKey===key)return;this._countdownCueKey=key;this._audio.speak('47_十秒倒计时_渐进版.wav',{countdown:true});},
 stopCountdownCue(){this._countdownCueKey='';if(this._audio&&this._audio.cancelCountdown)this._audio.cancelCountdown();},
 async activateFakeOpponent(){
  if(!this._alive||this._mode!=='online'||!this._matchQueue||!this._room||!this._room.waiting||this._fakeOpponent||this._botActivating)return;
  this._botActivating=true;const pending=this._room,roomId=pending.roomId;
  try{
   try{const latest=await Online.call('poll',{roomId,rev:pending.rev});if(!this._alive||!this._room||this._room.roomId!==roomId)return;if(!latest.waiting){this.applyRoom(latest);return;}}catch(e){}
   if(!this._alive||this._mode!=='online'||!this._room||this._room.roomId!==roomId||!this._room.waiting)return;
   const bot=FakeOpponents.pick();this._fakeOpponent=bot;this._token++;clearInterval(this._poll);this._poll=null;this._room=null;this._mode='ai';this._level='hard';this._clock.start();Online.call('cancel').catch(()=>{});
   this.setData({mode:'ai',level:'hard',waiting:false,matchSeconds:0,roomId:'',fakeOpponent:true,manualPaused:false,paused:false,message:bot.nickname+' 已入座'});this.sync();this.scheduleAI();
  }finally{this._botActivating=false;}
 },
 sync(event){if(this._inference&&publicKey(this._state)!==this._inference.formalKey)this.leaveInference('正式棋局已更新，已退出推理');if(this._state.status==='ended'&&['timeout','resign','draw','mutual-check','perpetual-check'].includes(this._state.reason))event=this._state.reason==='timeout'?'timeout':'end';const moved=['fusion','chase','move','capture','reveal','check','checkmate','stalemate','unlucky'].includes(event);const s=this._state;if(s.status==='ended'&&!moved)this.motion=null;if(this._repetitionHistory&&this._repetitionHistory.some(v=>v.ply>=s.ply)){this._repetitionHistory=this._repetitionHistory.filter(v=>v.ply<s.ply);this._longCheckWarning=null;}const top=this.data.flipped?'red':'black',bottom=R.opposite(top),ended=s.status==='ended',last=s.lastMove;const rp=this._room;
  const profile=this.runtime&&this.runtime.profile,player=side=>rp&&rp[side]?rp[side].nickname:this._fakeOpponent&&side==='black'?this._fakeOpponent.nickname:this._mode==='ai'&&side==='red'&&profile&&profile.nickname?profile.nickname:this._mode==='ai'&&side==='black'?({easy:'简易 · 菜就多练局',normal:'普通 · 不服就干场',hard:'困难 · 棋王修罗场'}[this._level]):names[side]+' · 你',avatar=side=>rp&&rp[side]?rp[side].avatar||'':this._fakeOpponent&&side==='black'?this._fakeOpponent.avatar||'':this._mode==='ai'&&side==='red'&&profile?profile.avatar||'':'';
  const pendingMessage={restart:'等待对方同意再来一局',undo:'等待对方同意悔棋',draw:'等待对方同意和棋'}[this.data.pendingRequest]||'';
  const patch={pieces:G.displayPieces(s.pieces),turn:s.turn,topSide:top,bottomSide:bottom,topName:player(top),bottomName:player(bottom),topAvatar:avatar(top),bottomAvatar:avatar(bottom),topCaptured:s.captured.filter(p=>p.capturedBy===top),bottomCaptured:s.captured.filter(p=>p.capturedBy===bottom),message:pendingMessage|| (ended?'对局结束':rp&&rp.waiting?(this.data.onlineMatch?'正在匹配棋友':'等待棋友入座'):G.checked(s.pieces,s.turn)?names[s.turn]+'被将军，必须应将':names[s.turn]+'行棋'),ply:s.ply,selectedId:s.pendingChase||'',pendingChase:s.pendingChase||null,fusionUsed:s.fusionUsed||null,ended,showResult:ended?this.data.showResult:false,resultTitle:ended?s.motif:'',resultDetail:ended?(s.winner?names[s.winner]+'获胜':'双方和棋'):'',unlucky:ended&&s.reason==='unlucky',movingId:moved&&last?last.id:'',lastMoveId:last?last.id:'',revealId:moved&&last&&last.revealed?last.id:'',captureId:moved&&last&&last.capturedId?last.id:''};if(this._mode!=='online'&&this._clock){patch.seconds=this._clock.seconds();patch.paused=this._clock.reasons.size>0;}this.presentTransition(event,s,patch);this.setData(patch);this.updateResult(ended,s);
 },
 clearPresentation(){if(this._audio&&this._audio.cancelBattleQueue)this._audio.cancelBattleQueue();if(this._battle)this._battle.clear();this.motion=null;this.cue=null;clearTimeout(this._moveAudioTimer);for(const sound of this._battleSounds||[])clearTimeout(sound.timer);this._battleSounds=[];},
 pausePresentation(){if(this._battle)this._battle.pause();this._visualPauseAt=Date.now();for(const sound of this._battleSounds||[])clearTimeout(sound.timer);},
 resumePresentation(){const now=Date.now(),delta=this._visualPauseAt===undefined?0:now-this._visualPauseAt;if(this._battle)this._battle.resume(now);for(const sound of this._battleSounds||[]){sound.at+=delta;this.armBattleSound(sound);}this._visualPauseAt=undefined;},
 armBattleSound(sound){sound.timer=setTimeout(()=>{const list=this._battleSounds||[],i=list.indexOf(sound);if(i<0)return;list.splice(i,1);if(this._alive&&!this._hidden&&!this.data.manualPaused)this._audio.event(sound.event,sound.state);},Math.max(0,sound.at-Date.now()));},
 presentTransition(event,state,patch){
  const now=Date.now(),last=state.lastMove,moved=['fusion','chase','move','capture','reveal','check','checkmate','stalemate','unlucky'].includes(event);
  const key=last?JSON.stringify([state.variant,state.ply,last,state.captured.length]):'';
  const terminalKey=state.status==='ended'?JSON.stringify([state.ply,state.reason,state.winner,last]):null;
  if(terminalKey&&terminalKey===this._presentedTerminalKey&&!moved){this._presentedState=state;return;}
  this._presentedTerminalKey=terminalKey;
  if(!this._battle)this._battle=new BattleTimeline();
  if(this._hidden){this.clearPresentation();this._presentedState=state;this._presentedMoveKey=key;return;}
  if(moved&&last&&key!==this._presentedMoveKey){
   const pieces=patch.pieces;let before=this.data.pieces||[],beforeBySide={[this.data.topSide||'black']:this.data.topCaptured||[],[this.data.bottomSide||'red']:this.data.bottomCaptured||[]};
   // A poll can contain both chase hops. Replay only the authoritative firstHop we have not seen.
   const first=last.firstHop;
   if(first&&state.variant==='fusion'&&first.id===last.id&&JSON.stringify(this._presentedState&&this._presentedState.lastMove)!==JSON.stringify(first)){
    const firstIds=new Set(first.capturedIds||[first.capturedId]),secondIds=new Set(last.capturedIds||[last.capturedId]),secondSources=new Set();
    for(const p of before)if(secondIds.has(p.id))for(const source of p.sourcePieces||[p])secondSources.add(source.id);
    const intermediate=before.filter(p=>!firstIds.has(p.id)).map(p=>p.id===first.id?{...p,...first.to}:p),firstCaptured=state.captured.filter(p=>!secondSources.has(p.id));
    const midBySide={red:firstCaptured.filter(p=>p.capturedBy==='red'),black:firstCaptured.filter(p=>p.capturedBy==='black')};
    const firstState={...state,status:'playing',reason:null,winner:null,motif:null,turn:first.actor,ply:Math.max(0,state.ply-1),pieces:intermediate,captured:firstCaptured,lastMove:first,pendingChase:first.id};
    const e=this._battle.enqueue(first,{pieces:intermediate,removedPieces:before.filter(p=>firstIds.has(p.id)),lastMoveId:first.id,beforeLastMoveId:this.data.lastMoveId,beforeBySide,afterBySide:midBySide},'chase',firstState,now);
    const sound={event:'chase',state:firstState,at:e.at+e.timings.impact};(this._battleSounds||(this._battleSounds=[])).push(sound);this.armBattleSound(sound);
    before=intermediate;beforeBySide=midBySide;
   }
   const removed=[];for(const p of before)if(p.id!==last.id&&!pieces.some(q=>q.id===p.id))removed.push(p);
   const view={pieces,removedPieces:removed,lastMoveId:last.id,beforeLastMoveId:first?first.id:this.data.lastMoveId,beforeBySide,afterBySide:{[patch.topSide]:patch.topCaptured,[patch.bottomSide]:patch.bottomCaptured}};
   const e=this._battle.enqueue(last,view,event,state,now);this.motion=this._battle.advance(now);
   const sound={event,state,at:e.at+e.timings.impact};(this._battleSounds||(this._battleSounds=[])).push(sound);this.armBattleSound(sound);
  }else if(!moved&&(event||this._presentedState!==state)){
   this.clearPresentation();
   if(event&&state.status==='ended')this._battle.cues.push({at:now,duration:650,reason:state.reason,warning:false});
   if(event)this._audio.event(event,state);
  }
  this._presentedState=state;this._presentedMoveKey=key;
 },
 updateResult(ended,state){if(!ended){clearTimeout(this._resultTimer);this._resultKey=null;return;}const key=JSON.stringify([state.ply,state.reason,state.winner,state.motif]);if(this._resultKey===key)return;this._resultKey=key;clearTimeout(this._resultTimer);this.setData({showResult:false});this._resultTimer=setTimeout(()=>{const current=this._state;if(this._alive&&current.status==='ended'&&JSON.stringify([current.ply,current.reason,current.winner,current.motif])===key)this.setData({showResult:true});},Math.max(2000,this.motion?FX.timing(this.motion.move).total+450:2000));},

 endLongCheck(side){this._token++;this._state={...this._state,status:'ended',winner:R.opposite(side),reason:'perpetual-check',motif:'长将判负'};this.sync('end');},
 repetitionForMove(move){const piece=this._state.pieces.find(p=>p.id===move.id);if(!piece||piece.hidden)return null;const actor=this._state.turn,publicPieces=AI.publicBoard(this._state.pieces),candidate={...this._state,pieces:AI.apply(publicPieces,move,actor),turn:R.opposite(actor)};return Repetition.analyze([...(this._repetitionHistory||this._history),this._state],candidate);},


 inferenceView(){
  const i=this._inference;if(!i)return;
  const s=i.state,top=this.data.topSide||'black',bottom=R.opposite(top),display=G.displayPieces(s.pieces);
  this.setData({inference:true,inferencePieces:display,inferenceSelectedId:this.data.inferenceSelectedId||'',inferenceLastMoveId:s.lastMove&&s.lastMove.id||'',inferenceTopCaptured:s.captured.filter(p=>p.capturedBy===top),inferenceBottomCaptured:s.captured.filter(p=>p.capturedBy===bottom),inferenceMessage:i.message||('推理中 · 已试走 '+i.history.length+' 步')});
 },
 enterInference(){
  if(this._inference)return true;
  this.tick();if(!this._alive||!this._state||this._state.status!=='playing'||this.data.waiting)return false;
  if(this._mode==='online'&&this.data.paused){this.toast('当前对局正在等待确认，暂不能推理');return false;}
  if(this._mode==='ai'&&this._clock){const reasons=[...(this._clock.reasons||[])];if(reasons.length){this._token++;clearTimeout(this._checkTimer);this._checkTimer=null;for(const reason of reasons)this._clock.resume(reason);this.resumePresentation();this.setData({manualPaused:false,paused:false});}}
  const snapshot=publicState(this._state);this._inference={base:clone(snapshot),state:clone(snapshot),history:[],formalKey:publicKey(this._state),pending:null,message:'推理中 · 可自由试走双方棋子'};
  this.setData({selectedId:'',inferenceSelectedId:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[]});this.inferenceView();this.scheduleAI();return true;
 },
 leaveInference(reason){if(!this._inference)return false;this._inference=null;if(this._battle)this._battle.select(null);this.setData({inference:false,inferencePieces:[],inferenceSelectedId:'',inferenceLastMoveId:'',inferenceTopCaptured:[],inferenceBottomCaptured:[],inferenceMessage:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[]});if(reason)this.toast(reason);return true;},
 exitInference(){return this.leaveInference();},
 inferenceActor(piece){return piece.hidden?R.controller(piece):piece.side;},
 inferenceAssumptionOptions(piece){
  const sides=this._state.variant==='dark'?['red','black']:[R.controller(piece)];
  return sides.flatMap(side=>inferenceRoles.map(kind=>({side,kind,label:(side==='red'?'红':'黑')+roleLabels[side][kind]})));
 },
 openInferenceAssumption(pieceId,to){
  const i=this._inference;if(!i)return false;const piece=i.state.pieces.find(p=>p.id===pieceId);if(!piece||!piece.hidden)return false;
  i.pending={id:pieceId,to:clone(to)};const options=this.inferenceAssumptionOptions(piece);this.setData({inferenceAssumptionMenu:true,inferenceAssumptionOptions:options,inferenceMessage:'请选择假设身份（仅用于推理）'});return true;
 },
 cancelInferenceAssumption(){if(!this._inference)return;this._inference.pending=null;this.setData({inferenceAssumptionMenu:false,inferenceAssumptionOptions:[],inferenceMessage:'推理中 · 可自由试走双方棋子'});},
 chooseInferenceAssumption(side,kind){
  const i=this._inference,p=i&&i.pending;if(!p||!roleLabels[side]||!inferenceRoles.includes(kind))return false;
  i.pending=null;this.setData({inferenceAssumptionMenu:false,inferenceAssumptionOptions:[]});return this.applyInferenceMove(p.id,p.to,{side,kind});
 },
 inferencePoint(e){
  if(!this._inference||this.data.inferenceAssumptionMenu)return false;this.tick();if(!this._inference||this._state.status!=='playing')return false;
  const {point,pieceId}=e.detail||{},i=this._inference,s=i.state,piece=pieceId?s.pieces.find(v=>v.id===pieceId):null,selectedId=this.data.inferenceSelectedId;
  if(!point)return false;
  if(selectedId===pieceId){this.setData({inferenceSelectedId:''});return true;}
  if(selectedId){const selected=s.pieces.find(v=>v.id===selectedId),actor=selected&&this.inferenceActor(selected);if(selected&&actor){if(s.variant==='fusion'&&s.pendingChase&&s.pendingChase!==selected.id){this.toast('合棋追击必须继续操作同一棋子');return false;}const working={...s,turn:actor,status:'playing',winner:null,reason:null,motif:null};const attempt=s.variant==='fusion'?Fusion.attempt(working,selected.id,point):G.legalAttempt(working.pieces,selected.id,point,actor);if(attempt){if(selected.hidden)return this.openInferenceAssumption(selected.id,point);return this.applyInferenceMove(selected.id,point);}}}
  if(piece){if(s.variant==='fusion'&&s.pendingChase&&s.pendingChase!==piece.id){this.toast('合棋追击必须继续操作同一棋子');return false;}this.setData({inferenceSelectedId:piece.id,inferenceMessage:piece.hidden?'已选中暗子，落子后请选择假设身份':'推理中 · 可自由选择红黑双方'});if(this._audio)this._audio.effect('pickup');return true;}
  if(this._audio)this._audio.effect('forbidden');return false;
 },
 applyInferenceMove(id,to,hypothesis){
  const i=this._inference;if(!i)return false;const before=clone(i.state),piece=before.pieces.find(p=>p.id===id);if(!piece)return false;const actor=this.inferenceActor(piece),working={...clone(i.state),turn:actor,status:'playing',winner:null,reason:null,motif:null};
  const result=working.variant==='fusion'?Fusion.move(working,id,to,false):G.move(working,id,to);if(!result.ok){this.toast(result.message||'这一步不合法');return false;}
  const next=result.state,target=to&&before.pieces.find(p=>p.id!==id&&p.x===to.x&&p.y===to.y),moved=next.pieces.find(p=>p.id===id);
  if(target&&target.hidden){const captured=(next.captured||[]).find(p=>p.id===target.id&&p.atPly===next.ply)||next.captured&&next.captured.at(-1);if(captured&&captured.id===target.id){captured.hidden=true;captured.text='';captured.side=R.controller(target);captured.kind=R.openingRole(target);delete captured.assumed;delete captured.assumptionKind;delete captured.assumptionSide;}}
  if(hypothesis&&moved){Object.assign(moved,{side:hypothesis.side,kind:hypothesis.kind,text:roleLabels[hypothesis.side][hypothesis.kind],hidden:false,assumed:true,assumptionSide:hypothesis.side,assumptionKind:hypothesis.kind});if(next.lastMove)next.lastMove.assumed=true;}
  next.status='playing';next.winner=null;next.reason=null;next.motif=null;i.history.push(before);i.state=next;i.message='推理中 · 已试走 '+i.history.length+' 步';this.setData({inferenceSelectedId:''});this.inferenceView();if(this._audio)this._audio.effect('drop');return true;
 },
 undoInference(){const i=this._inference;if(!i)return false;if(!i.history.length){this.toast('没有可撤回的推理步骤');return false;}i.state=i.history.pop();i.pending=null;this.setData({inferenceSelectedId:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[]});i.message='推理中 · 已试走 '+i.history.length+' 步';this.inferenceView();return true;},
 resetInference(){const i=this._inference;if(!i)return false;i.state=clone(i.base);i.history=[];i.pending=null;this.setData({inferenceSelectedId:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[]});i.message='推理中 · 已重置到进入时棋面';this.inferenceView();return true;},
 finishInferenceChase(){const i=this._inference;if(!i||!i.state.pendingChase)return false;return this.applyInferenceMove(i.state.pendingChase,null);},
 localMove(id,to){this.tick();if(this._state.status!=='playing'||this._clock.reasons.size)return false;const result=G.move(this._state,id,to);if(!result.ok){this.toast(result.message);return false;}this.stopCountdownCue();const repeat=this._state.variant==='fusion'?null:Repetition.analyze([...(this._repetitionHistory||this._history),this._state],result.state);if(repeat&&repeat.kind==='perpetual'&&repeat.offender===this._state.turn){if(this._longCheckWarning&&this._longCheckWarning.ply===this._state.ply&&this._longCheckWarning.side===this._state.turn){this.endLongCheck(this._state.turn);return false;}this._longCheckWarning={ply:this._state.ply,side:this._state.turn};this.setData({message:'单方长将：必须变招，再次循环将军直接判负',selectedId:''});this.toast('单方长将，请变招；再次重复将判负');return false;}this._longCheckWarning=null;if(repeat&&repeat.kind==='mutual'){result.state={...result.state,status:'ended',winner:null,reason:'mutual-check',motif:'循环互将和棋'};result.event='end';}if(!this._repetitionHistory)this._repetitionHistory=this._history.slice();if(result.state.lastMove.revealed||result.state.lastMove.capturedId)this._repetitionHistory=[];else this._repetitionHistory.push(this._state);if(!this._state.pendingChase)this._history.push(this._state);this._history=this._history.slice(-100);const sameTurn=result.state.turn===this._state.turn;if(!sameTurn)this._clock.start();this._state=result.state;if(result.event==='check'){this._clock.pause('check');clearTimeout(this._checkTimer);this._checkTimer=setTimeout(()=>{this._clock.resume('check');this.scheduleAI();},1200);}this.sync(result.event);if(repeat&&repeat.kind==='perpetual'&&repeat.offender===this._state.turn&&this._state.status==='playing'){this._longCheckWarning={side:repeat.offender,ply:this._state.ply};this.setData({message:names[repeat.offender]+'单方长将：必须变招，否则判负'});this.toast(names[repeat.offender]+'单方长将，请变招');}this.scheduleAI();return true;},
 async scheduleAI(){if(!this._alive||this._mode!=='ai'||this._hidden||this._aiThinking||this.data.pendingRequest||!this._state||this._state.status!=='playing'||this._state.turn!=='black'||this._clock.reasons.size)return;
  this._aiThinking=true;const token=this._token,started=Date.now(),snapshot=this._state;try{
   // Let the previous move finish before starting CPU-heavy search.
   const settle=this.motion?Math.max(0,FX.timing(this.motion.move).total-(Date.now()-this.motion.at)):0;
   if(settle)await new Promise(resolve=>{this._aiDelayResolve=resolve;this._aiDelayTimer=setTimeout(()=>{this._aiDelayResolve=null;resolve();},settle);});
   if(!this._alive||this._hidden||this._clock.reasons.size||token!==this._token||this._state!==snapshot)return;
   const aiLevel=this._fakeOpponent?'hard':this._level;
   const m=snapshot.variant==='fusion'?await require('../utils/fusion-ai').choose(snapshot,aiLevel,{cancel:()=>!this._alive||this._hidden||this._clock.reasons.size>0||token!==this._token||this._state!==snapshot}):await AI.choose(snapshot.pieces,'black',aiLevel,{history:[...(this._repetitionHistory||this._history||[]),snapshot],cancel:()=>!this._alive||this._hidden||this._clock.reasons.size>0||token!==this._token||this._state!==snapshot,allowMove:move=>{const repeat=this.repetitionForMove(move);return !repeat||repeat.kind!=='perpetual'||repeat.offender!=='black';}});
   const thinkFloor=this._fakeOpponent?900+Math.floor(Math.random()*3300):2000;const wait=Math.max(0,thinkFloor-(Date.now()-started));if(wait&&this._alive&&token===this._token)await new Promise(resolve=>{this._aiDelayResolve=resolve;this._aiDelayTimer=setTimeout(()=>{this._aiDelayResolve=null;resolve();},wait);});
   if(token===this._token&&this._alive&&!this._hidden&&this._state===snapshot&&!this._clock.reasons.size){if(m){this.localMove(m.id,m.to);this.queueFakeSticker();}else if(snapshot.variant!=='fusion'){const moves=AI.moves(AI.publicBoard(snapshot.pieces),'black');if(moves.length&&moves.every(move=>{const repeat=this.repetitionForMove(move);return repeat&&repeat.kind==='perpetual'&&repeat.offender==='black';}))this.endLongCheck('black');}}
  }finally{this._aiThinking=false;if(this._alive)setTimeout(()=>this.scheduleAI(),50);}
 },
 queueFakeSticker(){const now=Date.now();if(!this._fakeOpponent||!this._alive||!this._state||this._state.status!=='playing'||now<(this._fakeBotStickerCooldownUntil||0)||Math.random()>=.22)return false;this._fakeBotStickerCooldownUntil=now+30000;const id=stickers[Math.floor(Math.random()*stickers.length)].id;clearTimeout(this._fakeStickerTimer);this._fakeStickerTimer=setTimeout(()=>{if(this._alive&&this._fakeOpponent&&this._state.status==='playing')this.showSticker(id);},250+Math.floor(Math.random()*900));return true;},
 togglePause(){if(this._inference){this.toast('推理期间不能暂停正式对局');return;}if(this._fakeOpponent||this.data.fakeOpponent)return;if(this._mode!=='ai'||this._state.status!=='playing')return;this.tick();if(this._state.status!=='playing')return;
  const paused=!this.data.manualPaused;this._token++;if(paused){this._clock.pause('manual');this.pausePresentation();}else{this._clock.resume('manual');this.resumePresentation();}this.setData({manualPaused:paused,paused:this._clock.reasons.size>0,selectedId:''});if(!paused)this.scheduleAI();
 },
 loadStickers(){if(this._stickersReady)return Promise.resolve(true);if(this._stickersLoading)return this._stickersLoading;
  this._stickersLoading=Promise.all(['stickersA','stickersB'].map(name=>new Promise((resolve,reject)=>{if(!wx.loadSubpackage)return resolve();wx.loadSubpackage({name,success:resolve,fail:reject});}))).then(()=>{this._stickersReady=true;return true;}).catch(()=>false).finally(()=>{this._stickersLoading=null;});return this._stickersLoading;
 },

 async onPoint(e){if(this._inference){this.inferencePoint(e);return;}this.tick();if(this._state.status!=='playing'||this.data.waiting||this.data.busy||this.data.paused||this.data.pendingRequest)return;if(this._mode==='ai'&&this._state.turn!=='red')return;const onlineSide=this._onlineSide||(this._room&&this._room.side);if(this._mode==='online'&&(!this._room||this._room.waiting||!onlineSide||this._state.turn!==onlineSide))return;
  const {point,pieceId}=e.detail,p=this._state.pieces.find(v=>v.id===pieceId),selected=this.data.selectedId;if(selected===pieceId){if(this._battle)this._battle.select(null);this.setData({selectedId:''});return;}
  if(this._state.variant==='fusion'&&selected&&Fusion.attempt(this._state,selected,point)){
   const a=Fusion.attempt(this._state,selected,point);const execute=()=>this._mode==='online'?this.command('move',{id:selected,to:point}):this.localMove(selected,point);
   if(a.fusion){const snapshot=this._state;this.modal('确认合棋',a.p.text+' + '+p.text+' → '+Fusion.names[a.fusion],()=>{if(this._state!==snapshot)return;this._clock.resume('modal');execute();});}else await execute();return;
  }
  if(this._state.variant!=='fusion'&&selected&&G.legalAttempt(this._state.pieces,selected,point,this._state.turn)){if(this._mode==='online'){const moving=this._state.pieces.find(v=>v.id===selected);if(!moving||R.controller(moving)!==onlineSide){this.setData({selectedId:''});return;}await this.command('move',{id:selected,to:point});}else this.localMove(selected,point);return;}
  if(p&&R.controller(p)===this._state.turn&&(!this._state.pendingChase||p.id===this._state.pendingChase)){if(!this._battle)this._battle=new BattleTimeline();this._battle.select(p.id);this.setData({selectedId:p.id});this._audio.effect('pickup');}else this._audio.effect('forbidden');
 },
 finishChase(){const onlineSide=this._onlineSide||(this._room&&this._room.side);if(!this._state.pendingChase||this.data.pendingRequest||this.data.paused||this._mode==='ai'&&this._state.turn!=='red'||this._mode==='online'&&this._state.turn!==onlineSide)return;const id=this._state.pendingChase;return this._mode==='online'?this.command('move',{id,to:null}):this.localMove(id,null);},
 flip(){this.setData({flipped:!this.data.flipped});this.sync();if(this._inference)this.inferenceView();},
 modal(title,content,fn){this.tick();if(this._state.status==='playing')this._clock.pause('modal');this._token++;wx.showModal({title,content,success:r=>{this._audio.effect('click');if(r.confirm)fn();},complete:()=>{this._clock.resume('modal');this.tick();this.scheduleAI();}});},
 requestFake(kind){if(this.data.pendingRequest)return this.toast('已有请求等待对方回应');this.setData({pendingRequest:kind,pendingUntil:Date.now()+15000});this.sync();this.toast(kind==='undo'?'已发送悔棋请求，等待对方回应':'已发送再来一局请求，等待对方回应');clearTimeout(this._fakeRequestTimer);this._fakeRequestTimer=setTimeout(()=>{if(this.data.pendingRequest!==kind)return;const ok=Math.random()<.85;this.setData({pendingRequest:'',pendingUntil:0});if(ok){if(kind==='undo'){do{this._state=this._history.pop();}while(this._state.turn!=='red'&&this._history.length);this._repetitionHistory=[];this._longCheckWarning=null;this._clock.start();this.sync();this.toast('对方同意了悔棋');this.scheduleAI();}else{this._state=G.newGame(undefined,this._state.variant||'dark');this._history=[];this._repetitionHistory=[];this._clock.start();this.sync();this.toast('对方同意了再来一局');}}else{this.sync();this.toast(kind==='undo'?'对方拒绝了悔棋':'对方拒绝了再来一局');}},1200+Math.floor(Math.random()*1800));},
 restart(){if(this._inference){this.leaveInference();return;}if(this.data.pendingRequest)return this.toast('等待对方回应');if(this._fakeOpponent)return this.requestFake('restart');if(this._mode==='online'){if(this._room&&!this._room.black){this.toast('对方已离开房间，无法再来一局');return;}this.setData({pendingRequest:'restart',pendingUntil:Date.now()+15000});this.sync();this.command('request',{kind:'restart'});return;}this.modal('重新开始','重新洗牌并开始新对局？',()=>{this._state=G.newGame(undefined,this._state.variant||'dark');this._history=[];this._repetitionHistory=[];this._longCheckWarning=null;this._clock.start();this.sync();});},
 undo(){if(this._inference){this.undoInference();return;}if(this.data.pendingRequest)return this.toast('等待对方回应');if(this._fakeOpponent){if(!this._history.length)return this.toast('没有可悔棋记录');return this.requestFake('undo');}if(this._state.status!=='playing')return this.toast('对局已结束，请重开');if(this._mode==='online'){this.setData({pendingRequest:'undo',pendingUntil:Date.now()+15000});this.sync();this.command('request',{kind:'undo'});return;}if(!this._history.length)return this.toast('没有可悔棋记录');this.modal('确认悔棋',(['classic','fusion'].includes(this._state.variant)?'退回你上一次行棋之前。':'退回你上一次行棋之前；暗棋/揭棋中已看到的暗子身份不会从记忆中消失。'),()=>{do{this._state=this._history.pop();}while(this._state.turn!=='red'&&this._history.length);this._clock.start();this.sync();});},
 async more(){if(this._inference){this.toast('推理期间请使用推理操作按钮');return;}if(this._menuOpen)return;this._menuOpen=true;this.tick();this._token++;let choice;
  if(this._mode==='ai'&&!this._fakeOpponent&&this._state.status==='playing'){this._clock.pause('more');this.tick();}
  else if(this._mode==='online'&&this._state.status==='playing'){await this.command('menuOpen');if(this._room&&this._room.menuPause)this.toast('真人局菜单最多暂停15秒');}
  if(!this._alive){this._menuOpen=false;return;}
  try{wx.showActionSheet({itemList:['认输','协商和棋','游戏规则','声音设置','返回首页'],success:r=>{choice=r.tapIndex;this._audio.effect('click');},complete:()=>this.closeMore(choice)});}catch(error){this.closeMore();}
 },
 async closeMore(choice){if(this._mode==='ai'&&!this._fakeOpponent){this._clock.resume('more');this.tick();}else if(this._room&&this._room.menuPause&&this._room.menuPause.by===this._room.side)await this.command('menuClose');this._menuOpen=false;if(!this._alive)return;this.moreAction(choice);this.scheduleAI();},
 moreAction(choice){if(choice===0){if(this._mode==='online')this.command('resign');else this.modal('确认认输','确认后本局结束。',()=>{this._state={...this._state,status:'ended',winner:'black',reason:'resign',motif:'认输'};this.sync('end');});}else if(choice===1){if(this._mode==='online')this.command('request',{kind:'draw'});else this.toast('人机练习不接受协商和棋');}else if(choice===2)this.runtime.open('rules');else if(choice===3)this.runtime.open('settings');else if(choice===4)this.home();},

 async command(action,data={}){if(this.data.busy||!this._room)return;if(action==='move')this.stopCountdownCue();this.setData({busy:true});try{this.applyRoom(await Online.call(action,{...data,roomId:this._room.roomId,rev:this._room.rev}));this._networkFailures=0;}catch(e){if(action==='move')this.setData({selectedId:''});if(action==='request')this.setData({pendingRequest:'',pendingUntil:0});this.handleNetworkError(e);this.toast(e&&e.message||'落子失败，请重新同步');if(this._room)await this.poll(true);}finally{if(this._alive)this.setData({busy:false,manualPaused:false});}},
 handleNetworkError(error){this._networkFailures=(this._networkFailures||0)+1;this._lastNetworkError=String(error&&error.message||error||'');if(this._networkFailures>=3&&!this._networkWarned){this._networkWarned=true;this.toast('网络不稳定，正在重连；服务器仍在计时');}},
 async poll(force=false){if(!this._room||this._polling||!this._alive||this._hidden||(!force&&this.data.busy))return;this._polling=true;try{let room;try{room=await Online.call('poll',{roomId:this._room.roomId});}catch(e){this.handleNetworkError(e);return;}try{this.applyRoom(room);}catch(e){console.error('room synchronization failed:',String(e&&e.message||e).slice(0,240));if(!this._syncWarned){this._syncWarned=true;this.toast('对局数据同步失败，请稍后重试');}return;}this._syncWarned=false;this._networkFailures=0;this._networkWarned=false;}finally{this._polling=false;}},
 applyRoom(room){if(!this._alive||!room||!room.state)return;if(this._room&&room.roomId===this._room.roomId&&room.rev<this._room.rev)return;if(this._matchResolved&&this._room&&room.roomId===this._room.roomId&&room.waiting)return;const old=this._room;if(old&&room.roomId!==old.roomId){this._matchResolved=false;this._onlineSide=null;}const activeSide=room.side||this._onlineSide||(old&&old.side);if(activeSide)this._onlineSide=activeSide;const stateChanged=!!(old&&old.state&&JSON.stringify(old.state)!==JSON.stringify(room.state));this._offset=(room.serverNow||Date.now())-Date.now();this._room=room;this._state=room.state;if(stateChanged)this.stopCountdownCue();if(this.runtime)this.runtime.variant=room.state.variant||'dark';if(this._matchQueue&&room.waiting&&(!old||!old.waiting)){this._matchStartedAt=Date.now();this._matchFallbackAt=MATCH_HUMAN_WAIT_SECONDS+Math.floor(Math.random()*(MATCH_FAKE_MAX_SECONDS-MATCH_HUMAN_WAIT_SECONDS+1));this.setData({matchSeconds:0});}const identityChanged=!old||JSON.stringify([old.red,old.black])!==JSON.stringify([room.red,room.black]);const sideChanged=!old||old.side!==activeSide;const matchQueue=this._matchQueue||this.data.onlineMatch||room.match===true;const matched=!!(matchQueue&&!room.waiting&&(!old||old.waiting));if(matchQueue&&!room.waiting)this._matchResolved=true;const serverPreference=['red','black','rotate'].includes(room.seatPreference)?room.seatPreference:this.data.seatPreference;const eventChanged=!!room.event&&(!old||old.event!==room.event);clearTimeout(this._matchFoundTimer);const nextFlipped=sideChanged?activeSide==='black':this.data.flipped,topSide=nextFlipped?'red':'black',bottomSide=R.opposite(topSide),topProfile=room[topSide],bottomProfile=room[bottomSide];
  this.setData({waiting:!!room.waiting,onlineMatch:matchQueue,matchFound:matched,matchFoundAt:matched?Date.now():this.data.matchFoundAt,roomId:room.roomId,seatPreference:serverPreference,seatMenu:room.waiting&&this.data.seatMenu,flipped:nextFlipped,topName:topProfile&&topProfile.nickname||this.data.topName,bottomName:bottomProfile&&bottomProfile.nickname||this.data.bottomName,topAvatar:topProfile&&topProfile.avatar||'',bottomAvatar:bottomProfile&&bottomProfile.avatar||'',busy:false,manualPaused:false,paused:false,selectedId:matched?'':this.data.selectedId});if(matched)this._matchFoundTimer=setTimeout(()=>{if(this._alive)this.setData({matchFound:false});},900);const changed=!old||stateChanged||old.waiting!==room.waiting; if(changed||identityChanged){const syncEvent=room.event&&/^undo-/.test(room.event)?'':(old?room.event:undefined);this.sync(syncEvent);}
  if(eventChanged&&room.event==='undo-accepted')this.toast('对方同意了悔棋');
  if(eventChanged&&room.event==='undo-rejected')this.toast('对方拒绝了悔棋');
  this.tick();if(room.sticker&&(!old||!old.sticker||old.sticker.seq!==room.sticker.seq)&&room.serverNow-room.sticker.at<4000)this.showSticker(room.sticker.id);
  const p=room.pending;if(p&&p.by!==room.side&&this._promptKey!==p.until){this._promptKey=p.until;wx.showModal({title:'对方请求'+({undo:'悔棋',restart:'再来一局',draw:'和棋'}[p.kind]),content:'是否同意对方的'+({undo:'悔棋',restart:'再来一局',draw:'和棋'}[p.kind])+'请求？',success:r=>this.command('reply',{accept:r.confirm})});}if(!p&&this.data.pendingRequest){const req=this.data.pendingRequest;this.setData({pendingRequest:'',pendingUntil:0});if(room.event==='restart-accepted')this.toast('对方同意了再来一局');else if(room.event==='restart-rejected')this.toast('对方拒绝了再来一局');else if(room.serverNow>=this.data.pendingUntil)this.toast('对方未回应，请求已失效');this.sync();}
 },
 onShareAppMessage(){return {title:'暗棋大乱斗 · 来一局中国象棋',query:'room='+encodeURIComponent(this.data.roomId)};},
 async toggleStickers(){if(this.data.showStickers){this.setData({showStickers:false});return;}const ready=await this.loadStickers();if(!this._alive)return;if(!ready)return this.toast('表情加载失败，请重试');this.setData({showStickers:true});},
 sendSticker(e){this.setData({showStickers:false});const id=e.currentTarget.dataset.id;if(this._fakeOpponent){const now=Date.now();if(now<(this._stickerCooldownUntil||0)){this.toast('表情冷却中，请稍候');return;}this._stickerCooldownUntil=now+30000;this.showSticker(id);return;}if(this._mode==='ai')this.showSticker(id);else {const now=Date.now();if(now<(this._stickerCooldownUntil||0)){this.toast('表情冷却中，请稍候');return;}this._stickerCooldownUntil=now+30000;this.command('sticker',{id});}},
 showSticker(id){const s=stickers.find(v=>v.id===id);if(!s)return;clearTimeout(this._stickerTimer);this.setData({stickerImage:s.image,stickerText:s.text});if(!this._hidden)this._audio.speak(s.voice||s.text);this._stickerTimer=setTimeout(()=>{if(this._alive)this.setData({stickerImage:'',stickerText:''});},3000);},
 async cancelWait(){
  if(this._canceling)return;
  this._canceling=true;
  clearInterval(this._poll);this._poll=null;
  const room=this._room;
  try{
   if(room)await Online.call('cancel',{roomId:room.roomId,rev:room.rev});
   this._room=null;
   this.home();
  }catch(e){
   this._canceling=false;
   if(this._alive)this._poll=setInterval(()=>this.poll(),1200);
   this.toast(e.message||'取消等待失败，请重试');
  }
 },toggleSeatMenu(){if(!this.data.waiting)return;this.setData({seatMenu:!this.data.seatMenu});},async setSeatPreference(preference){if(!['red','black','rotate'].includes(preference)||!this.data.waiting||this.data.onlineMatch)return;this.setData({seatPreference:preference,seatMenu:false});if(this._room){try{this.applyRoom(await Online.call('preference',{roomId:this._room.roomId,rev:this._room.rev,preference}));}catch(e){this.setData({seatPreference:preference,seatMenu:false});/* Keep the local choice visible while an older cloud function catches up. */}}},
 closeResult(){this.setData({showResult:false});},home(){this.runtime.home();}
};
