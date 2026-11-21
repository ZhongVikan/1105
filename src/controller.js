const FX=require('./battle-effects'),BattleTimeline=require('./battle-timeline');
const G=require('../utils/game-engine'),R=require('../utils/rules-core'),S=require('../utils/storage'),AI=require('../utils/ai'),AIWorker=require('../utils/ai-worker-client'),Clock=require('../utils/turn-clock'),Audio=require('../utils/audio'),Online=require('../utils/online'),stickers=require('../utils/stickers');
const Repetition=require('../utils/repetition'),Fusion=require('../utils/fusion'),FakeOpponents=require('../utils/fake-opponents');
const names={red:'红方',black:'黑方'};
const requestLabel=(kind,state)=>kind==='restart'?(state.status==='ended'?'再来一局':'重开'):kind==='undo'?'悔棋':'合棋';
const MATCH_HUMAN_WAIT_SECONDS=10,MATCH_FAKE_MAX_SECONDS=20;
// Poll more often while waiting for the opponent's move and back off while
// it is our turn. A timer (rather than a fixed interval) prevents a slow
// cloud-function call from queueing another poll behind it.
const POLL_WAITING_MS=1000,POLL_STARTING_MS=400,POLL_OWN_TURN_MS=900,POLL_OPPONENT_TURN_MS=650,POLL_BACKOFF_MAX_MS=6000;
const STICKER_PACKAGES=[...new Set(stickers.map(sticker=>sticker.image.split('/')[0]))];
const roleLabels={red:{rook:'俥',horse:'傌',elephant:'相',advisor:'仕',cannon:'炮',pawn:'兵'},black:{rook:'車',horse:'馬',elephant:'象',advisor:'士',cannon:'砲',pawn:'卒'}};
const inferenceRoles=['rook','horse','elephant','advisor','cannon','pawn'];
const clone=value=>JSON.parse(JSON.stringify(value));
// Match a move by observable geometry, independent of JSON property order.
function moveIdentity(move){return move?[move.id,move.actor,move.from&&move.from.x,move.from&&move.from.y,move.to&&move.to.x,move.to&&move.to.y,!!move.revealed,move.capturedId||null,(move.capturedIds||[]).slice().sort(),move.fusionType||null,!!move.chase,moveIdentity(move.firstHop)]:null;}
function presentationKey(state){return JSON.stringify([state.variant||'dark',state.ply,moveIdentity(state.lastMove),(state.captured||[]).length]);}
// Start the visual part of an online move before the cloud round trip settles.
// Fully visible variants use the authoritative local rules; hidden variants use
// a presentation-only transition and keep concealed pieces concealed. The
// server snapshot remains authoritative and can roll the preview back.
function predictOnlineMove(state,id,to){
 if(!state||state.status!=='playing'||!Array.isArray(state.pieces)||to===undefined)return null;
 if(state.variant==='fusion'){
  const result=Fusion.move(state,id,to);
  return result&&result.ok?result:null;
 }
 if(!to)return null;
 if(!state.pieces.some(p=>p.hidden)){
  const result=G.move(state,id,to);
  return result&&result.ok?result:null;
 }
 const actor=state.turn,p=state.pieces.find(q=>q.id===id);if(!p||!Number.isInteger(to.x)||!Number.isInteger(to.y))return null;
 if(!G.legalAttempt(state.pieces,id,to,actor))return null;
 const target=state.pieces.find(q=>q.id!==id&&q.x===to.x&&q.y===to.y),captured=target?[{...target,capturedBy:actor,atPly:state.ply+1}]:[];
 const moving={...p,x:to.x,y:to.y};
 const pieces=state.pieces.filter(q=>!target||q.id!==target.id).map(q=>q.id===id?moving:q);
 const next={...state,pieces,turn:R.opposite(actor),ply:state.ply+1,captured:[...(state.captured||[]),...captured],lastMove:{id,from:{x:p.x,y:p.y},to:{x:to.x,y:to.y},actor,revealed:!!p.hidden,capturedId:target&&target.id||null}};
 return {ok:true,state:next,event:target?'capture':p.hidden?'reveal':'move'};
}
// Build a rules-ready public snapshot. Hidden pieces retain only their opening
// role and public controller side; secret side/kind/text/source data is removed.
function publicPiece(piece){
 const q=clone(piece);
 if(q.hidden){q.side=R.controller(q);q.kind=R.openingRole(q);q.text='';q.hidden=true;delete q.general;delete q.fusionType;delete q.sourcePieces;delete q.assumed;delete q.assumptionKind;delete q.assumptionSide;}
 return q;
}
function publicState(state){const q=clone(state);q.pieces=state.pieces.map(publicPiece);q.captured=clone(state.captured||[]);return q;}
function publicKey(state){return JSON.stringify({variant:state.variant,status:state.status,turn:state.turn,ply:state.ply,pendingChase:state.pendingChase||null,pieces:state.pieces.map(p=>{const hidden=!!p.hidden;return [p.id,p.x,p.y,hidden?R.controller(p):p.side,hidden?R.openingRole(p):p.kind,hidden];}).sort((a,b)=>a[0].localeCompare(b[0])),captured:(state.captured||[]).map(p=>[p.id,p.capturedBy,p.atPly]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))});}
function privateStateForOffline(state){return state&&Array.isArray(state.pieces)&&state.pieces.some(p=>p.hidden&&!p.kind)?G.newGame(undefined,state.variant||'dark'):state;}
module.exports={
 data:{pieces:[],flipped:false,selectedId:'',turn:'red',topSide:'black',bottomSide:'red',topName:'黑方',bottomName:'红方',topCaptured:[],bottomCaptured:[],message:'',ply:0,showResult:false,resultTitle:'',resultDetail:'',unlucky:false,movingId:'',lastMoveId:'',revealId:'',captureId:'',ended:false,seconds:60,paused:false,mode:'ai',level:'normal',waiting:false,starting:false,canRematch:true,matchSeconds:0,matchFound:false,matchFoundAt:0,fakeOpponent:false,pendingRequest:'',pendingRequestLabel:'',pendingUntil:0,topAvatar:'',bottomAvatar:'',stickers,showStickers:false,stickerImage:'',stickerText:'',roomId:'',busy:false,manualPaused:false,inference:false,inferencePieces:[],inferenceSelectedId:'',inferenceLastMoveId:'',inferenceTopCaptured:[],inferenceBottomCaptured:[],inferenceMessage:'',inferenceAssumptionMenu:false,inferenceAssumptionOptions:[],onlineMatch:false,seatPreference:'rotate',seatMenu:false},
 async onLoad(options){this._alive=true;this._token=0;this._audio=this.runtime&&this.runtime.audio||new Audio();this._audio.refresh();this._clock=new Clock();this._history=[];this._repetitionHistory=[];this._countdownCueKey='';this._fakeOpponent=null;this._fakeRestartRejected=false;this._fakeUndoUsed={};this._fakePending=null;this._fakeBotStickerCooldownUntil=0;this._onlineSide=null;this._matchQueue=options.mode==='online'&&options.match==='1';this._matchStartedAt=0;this._matchFallbackAt=0;this._matchResolved=false;this._state=G.newGame(undefined,options.variant||'dark');this._mode=options.mode==='online'?'online':'ai';this._level=['easy','normal','hard'].includes(options.level)?options.level:'normal';this.setData({mode:this._mode,level:this._level,matchSeconds:0,pendingRequest:'',pendingUntil:0});
  this._hidden=!!(this.runtime&&this.runtime.hidden);
  this._interval=this._hidden?null:setInterval(()=>this.tick(),250);
  if(this._mode!=='online'){this._clock.start();this.sync();return;}
  this.setData({waiting:true,onlineMatch:options.match==='1',fakeOpponent:false,seatPreference:options.seatPreference||'rotate'});
  const variant=options.variant||'dark',action=options.room?'join':options.match==='1'?'match':'create';
  const entry=(async()=>{
   const room=await Online.call(action,{roomId:options.room,variant,seatPreference:this.data.seatPreference});
   const renderer=this.runtime&&this.runtime.renderer;
   if(!room.state)throw Error('未能取得对局资料，请重试');
   if(this._alive&&room.state.variant!==variant&&renderer&&renderer.preloadGameAssets){
    if((await renderer.preloadGameAssets(room.state.variant))===false)throw Error('棋盘资源加载失败，请重试');
   }
   return room;
  })();
  this._entryRequest=entry;
  try{
   const room=await entry;
   if(this._alive){this.applyRoom(room);this.startPolling();}
  }catch(e){
   if(this._alive&&!this._waitingTransition){this.toast(e.message||e.errMsg||'进入对局失败，请重试');this.home();}
  }finally{if(this._entryRequest===entry)this._entryRequest=null;}
 },
 onShow(){
  if(!this._alive)return;
  this._hidden=false;
  if(this._matchQueue&&this._room&&this._room.waiting)this._matchStartedAt=Date.now();
  if(!this._interval)this._interval=setInterval(()=>this.tick(),250);
  if(this._audio)this._audio.refresh();
  if(this._clock){this.tick();this.scheduleAI();}
  if(this._room){
   if(!this._poll)this.startPolling();
   this.poll();
  }
 },
 onHide(){this.clearPresentation();this._warningPhase=null;this._hidden=true;this._token++;clearInterval(this._interval);this.stopPolling();this._interval=null;if(this._audio)this._audio.hide();/* Clock intentionally continues in background. */},
 onUnload(){this._inference=null;this.clearPresentation();this._warningPhase=null;clearTimeout(this._resultTimer);clearTimeout(this._matchFoundTimer);clearTimeout(this._moveAudioTimer);clearTimeout(this._fakeStickerTimer);clearTimeout(this._fakeRequestTimer);if(this._aiDelayResolve){clearTimeout(this._aiDelayTimer);this._aiDelayResolve();this._aiDelayResolve=null;}this._fakePending=null;this._alive=false;this._token++;clearInterval(this._interval);this.stopPolling();clearTimeout(this._checkTimer);clearTimeout(this._stickerTimer);if(this._mode==='online'&&this._room&&this._state&&this._state.status==='ended')Online.call('leave',{roomId:this._room.roomId,rev:this._room.rev}).catch(()=>{});if(this._audio){if(this.runtime&&this.runtime.audio===this._audio)this._audio.hide();else this._audio.destroy();}},
 stopPolling(){if(this._poll){clearTimeout(this._poll);clearInterval(this._poll);this._poll=null;}},
 pollDelay(){
  if(!this._room||this._room.waiting)return POLL_WAITING_MS;
  const opponentTurn=this._state&&this._room.side&&this._state.turn!==this._room.side;
  const base=this._room.starting?POLL_STARTING_MS:opponentTurn?POLL_OPPONENT_TURN_MS:POLL_OWN_TURN_MS;
  const failures=Math.min(3,Math.max(0,this._networkFailures||0));
  return Math.min(POLL_BACKOFF_MAX_MS,base*Math.pow(2,failures));
 },
 startPolling(delay){
  if(!this._alive||this._hidden||!this._room||this._waitingTransition)return;
  this.stopPolling();
  this._poll=setTimeout(async()=>{
   this._poll=null;
   await this.poll();
   if(this._alive&&!this._hidden&&this._room)this.startPolling(this.pollDelay());
  },Math.max(0,Number.isFinite(delay)?delay:this.pollDelay()));
 },
 toast(title){wx.showToast({title,icon:'none'});},
 tick(){if(!this._alive||!this._state||this._state.status!=='playing')return;
  if(this._mode==='online'){
   const room=this._room;
   if(!room||room.starting)return;
   const localNow=Date.now();
   if(room.waiting){
    if(this._matchQueue&&this._matchStartedAt){
     const elapsed=Math.max(0,Math.floor((localNow-this._matchStartedAt)/1000));
     this.setData({matchSeconds:elapsed});
     if(elapsed>=this._matchFallbackAt&&localNow>=(this._nextFallbackAttempt||0))this.activateFakeOpponent();
    }
    return;
   }
   const now=localNow+this._offset,pause=Math.max(0,(room.holdUntil||0)-now);
   const seconds=Math.max(0,Math.min(60,Math.ceil((room.deadline-now-pause)/1000)));
   this.setData({seconds,paused:pause>0});this.countdownCue(seconds);
   return;
  }
  const seconds=this._clock.seconds(),paused=this._clock.reasons.size>0;if(seconds!==this.data.seconds||paused!==this.data.paused)this.setData({seconds,paused});this.countdownCue(seconds);if(this._clock.expired()){this._token++;this._state={...this._state,status:'ended',reason:'timeout',motif:'超时判负',winner:R.opposite(this._state.turn)};this.sync('timeout');}
 },
 countdownCue(seconds){if(seconds>10||!this._audio||typeof this._audio.speak!=='function'||!this._state||this._state.status!=='playing')return;const key=this._state.ply+':'+this._state.turn;if(this._countdownCueKey===key)return;this._countdownCueKey=key;this._audio.speak('47_十秒倒计时_渐进版.wav',{countdown:true});},
 stopCountdownCue(){this._countdownCueKey='';if(this._audio&&this._audio.cancelCountdown)this._audio.cancelCountdown();},
 activateFakeOpponent(){
  if(!this._matchQueue||!this._room||!this._room.waiting||this._hidden)return;
  return this.exitWaiting('ai');
 },
 sync(event){if(this._optimisticMove&&!event&&this._commandPending){this.setData(this.optimisticPatch(this._optimisticMove.state));return;}if(this._inference&&publicKey(this._state)!==this._inference.formalKey)this.leaveInference('正式棋局已更新，已退出推理');if(this._state.status==='ended'&&['timeout','resign','draw','mutual-check','perpetual-check'].includes(this._state.reason))event=this._state.reason==='timeout'?'timeout':'end';const moved=['fusion','chase','move','capture','reveal','check','checkmate','stalemate','unlucky'].includes(event);const s=this._state;if(s.status==='ended'&&!moved)this.motion=null;if(this._repetitionHistory&&this._repetitionHistory.some(v=>v.ply>=s.ply)){this._repetitionHistory=this._repetitionHistory.filter(v=>v.ply<s.ply);this._longCheckWarning=null;}const top=this.data.flipped?'red':'black',bottom=R.opposite(top),ended=s.status==='ended',last=s.lastMove;const rp=this._room;
  const profile=this.runtime&&this.runtime.profile,player=side=>rp&&rp[side]?rp[side].nickname:this._fakeOpponent&&side==='black'?this._fakeOpponent.nickname:this._mode==='ai'&&side==='red'&&profile&&profile.nickname?profile.nickname:this._mode==='ai'&&side==='black'?({easy:'简易 · 菜就多练局',normal:'普通 · 不服就干场',hard:'困难 · 棋王修罗场'}[this._level]):names[side]+' · 你',avatar=side=>rp&&rp[side]?rp[side].avatar||'':this._fakeOpponent&&side==='black'?this._fakeOpponent.avatar||'':this._mode==='ai'&&side==='red'&&profile?profile.avatar||'':'';
  const pendingMessage=this.data.pendingRequest?'等待对方同意'+(this.data.pendingRequestLabel||requestLabel(this.data.pendingRequest,this._state)):'';
  const resultDetail=!ended?'':s.reason==='not-ready'?'对局未开始':s.winner?names[s.winner]+'获胜':'双方和棋';
  const patch={pieces:G.displayPieces(s.pieces),turn:s.turn,topSide:top,bottomSide:bottom,topName:player(top),bottomName:player(bottom),topAvatar:avatar(top),bottomAvatar:avatar(bottom),topCaptured:s.captured.filter(p=>p.capturedBy===top),bottomCaptured:s.captured.filter(p=>p.capturedBy===bottom),message:pendingMessage|| (ended?'对局结束':rp&&rp.waiting?(this.data.onlineMatch?'正在匹配棋友':'等待棋友入座'):G.checked(s.pieces,s.turn)?names[s.turn]+'被将军，必须应将':names[s.turn]+'行棋'),ply:s.ply,selectedId:s.pendingChase||'',pendingChase:s.pendingChase||null,fusionUsed:s.fusionUsed||null,ended,showResult:ended?this.data.showResult:false,resultTitle:ended?s.motif:'',resultDetail,unlucky:ended&&s.reason==='unlucky',movingId:moved&&last?last.id:'',lastMoveId:last?last.id:'',revealId:moved&&last&&last.revealed?last.id:'',captureId:moved&&last&&last.capturedId?last.id:''};if(this._mode!=='online'&&this._clock){patch.seconds=this._clock.seconds();patch.paused=this._clock.reasons.size>0;}this.presentTransition(event,s,patch);this.setData(patch);this.updateResult(ended,s);
 },
 clearPresentation(){if(this._audio&&this._audio.cancelBattleQueue)this._audio.cancelBattleQueue();if(this._battle)this._battle.clear();this.motion=null;this.cue=null;clearTimeout(this._moveAudioTimer);for(const sound of this._battleSounds||[])clearTimeout(sound.timer);this._battleSounds=[];},
 pausePresentation(){if(this._battle)this._battle.pause();this._visualPauseAt=Date.now();for(const sound of this._battleSounds||[])clearTimeout(sound.timer);},
 resumePresentation(){const now=Date.now(),delta=this._visualPauseAt===undefined?0:now-this._visualPauseAt;if(this._battle)this._battle.resume(now);for(const sound of this._battleSounds||[]){sound.at+=delta;this.armBattleSound(sound);}this._visualPauseAt=undefined;},
 armBattleSound(sound){sound.timer=setTimeout(()=>{const list=this._battleSounds||[],i=list.indexOf(sound);if(i<0)return;list.splice(i,1);if(this._alive&&!this._hidden&&!this.data.manualPaused)this._audio.event(sound.event,sound.state);},Math.max(0,sound.at-Date.now()));},
 optimisticPatch(state){
  const top=this.data.flipped?'red':'black',bottom=R.opposite(top),last=state.lastMove,ended=state.status==='ended';
  return {pieces:G.displayPieces(state.pieces),turn:state.turn,topSide:top,bottomSide:bottom,topCaptured:(state.captured||[]).filter(p=>p.capturedBy===top),bottomCaptured:(state.captured||[]).filter(p=>p.capturedBy===bottom),message:this.data.message,ply:state.ply,selectedId:state.pendingChase||'',pendingChase:state.pendingChase||null,fusionUsed:state.fusionUsed||null,ended,showResult:false,resultTitle:ended?state.motif:'',resultDetail:ended?(state.winner?names[state.winner]+'获胜':'双方和棋'):'',unlucky:ended&&state.reason==='unlucky',movingId:last?last.id:'',lastMoveId:last?last.id:'',revealId:last&&last.revealed?last.id:'',captureId:last&&last.capturedId?last.id:''};
 },
 beginOptimisticMove(data){
  if(this._mode!=='online'||!this._room||this._optimisticMove)return null;
  let result;try{result=predictOnlineMove(this._state,data&&data.id,data&&data.to);}catch(e){return null;}if(!result||!result.ok||!result.state||!result.state.lastMove)return null;
  const state=result.state,last=state.lastMove,key=presentationKey(state),patch=this.optimisticPatch(state);
  const pending={key,event:result.event,state,roomId:this._room.roomId,baseRev:this._room.rev};this._optimisticMove=pending;
  this.presentTransition(result.event,state,patch,{silent:true});
  pending.motion=this._battle&&this._battle.events[this._battle.events.length-1];this.setData(patch);return pending;
 },
 rollbackOptimisticMove(){
  if(!this._optimisticMove)return;
  this._optimisticMove=null;this.clearPresentation();this._presentedState=null;this._presentedMoveKey='';this._presentedEvent='';this.sync();
 },
 reconcileOptimisticTransition(event,state,patch,now){
  const pending=this._optimisticMove;if(!pending||pending.settled)return;
  pending.settled=true;
  if(!this._battle)this._battle=new BattleTimeline();const motion=pending.motion;
  this._battle.confirm(motion,state.lastMove,{pieces:patch.pieces,afterBySide:{[patch.topSide]:patch.topCaptured,[patch.bottomSide]:patch.bottomCaptured}},now);
  this.motion=this._battle.advance(now);const at=motion?Math.max(now,motion.at+motion.timings.impact):now;
  if(state.lastMove&&(state.lastMove.capturedId||(state.lastMove.capturedIds&&state.lastMove.capturedIds.length))){const contact=motion?Math.max(now,motion.at+motion.timings.contact):now;this._battle.cues.push({type:'eat',point:state.lastMove.to||state.lastMove.from,at:contact,duration:FX.EAT_DURATION});this._battle.revision++;}
  if(event==='check'||state.status==='ended'){const king=event==='check'?state.pieces.find(p=>p.kind==='general'&&p.side===state.turn):null;this._battle.cues.push({at,duration:650,warning:event==='check',reason:state.reason,king});this._battle.revision++;}
  const sound={event,state,at};(this._battleSounds||(this._battleSounds=[])).push(sound);this.armBattleSound(sound);
 },
 presentTransition(event,state,patch,options={}){
  const now=Date.now(),last=state.lastMove,moved=['fusion','chase','move','capture','reveal','check','checkmate','stalemate','unlucky'].includes(event);
  const key=last?presentationKey(state):'';
  const terminalKey=state.status==='ended'?JSON.stringify([state.ply,state.reason,state.winner,last]):null;
  if(terminalKey&&terminalKey===this._presentedTerminalKey&&!moved){this._presentedState=state;return;}
  this._presentedTerminalKey=terminalKey;
  if(!this._battle)this._battle=new BattleTimeline();
  if(this._hidden){this.clearPresentation();this._presentedState=state;this._presentedMoveKey=key;return;}
  const optimistic=this._optimisticMove,sameOptimistic=!!(optimistic&&last&&optimistic.key===key);
  if(moved&&last&&sameOptimistic&&key===this._presentedMoveKey){
   if(!options.silent)this.reconcileOptimisticTransition(event,state,patch,now);
  }else if(moved&&last&&key!==this._presentedMoveKey){
   const pieces=patch.pieces;let before=this.data.pieces||[],beforeBySide={[this.data.topSide||'black']:this.data.topCaptured||[],[this.data.bottomSide||'red']:this.data.bottomCaptured||[]};
   // A poll can contain both chase hops. Replay only the authoritative firstHop we have not seen.
   const first=last.firstHop;
   if(first&&state.variant==='fusion'&&first.id===last.id&&JSON.stringify(this._presentedState&&this._presentedState.lastMove)!==JSON.stringify(first)){
    const firstIds=new Set(first.capturedIds||[first.capturedId]),secondIds=new Set(last.capturedIds||[last.capturedId]),secondSources=new Set();
    for(const p of before)if(secondIds.has(p.id))for(const source of p.sourcePieces||[p])secondSources.add(source.id);
    const intermediate=before.filter(p=>!firstIds.has(p.id)).map(p=>p.id===first.id?{...p,...first.to}:p),firstCaptured=state.captured.filter(p=>!secondSources.has(p.id));
    const midBySide={red:firstCaptured.filter(p=>p.capturedBy==='red'),black:firstCaptured.filter(p=>p.capturedBy==='black')};
    const firstState={...state,status:'playing',reason:null,winner:null,motif:null,turn:first.actor,ply:Math.max(0,state.ply-1),pieces:intermediate,captured:firstCaptured,lastMove:first,pendingChase:first.id};
    const e=this._battle.enqueue(first,{pieces:intermediate,removedPieces:before.filter(p=>firstIds.has(p.id)),lastMoveId:first.id,beforeLastMoveId:this.data.lastMoveId,beforeBySide,afterBySide:midBySide},'chase',firstState,now,options);
    if(!options.silent){const sound={event:'chase',state:firstState,at:e.at+e.timings.impact};(this._battleSounds||(this._battleSounds=[])).push(sound);this.armBattleSound(sound);}
    before=intermediate;beforeBySide=midBySide;
   }
   const removed=[];for(const p of before)if(p.id!==last.id&&!pieces.some(q=>q.id===p.id))removed.push(p);
   const view={pieces,removedPieces:removed,lastMoveId:last.id,beforeLastMoveId:first?first.id:this.data.lastMoveId,beforeBySide,afterBySide:{[patch.topSide]:patch.topCaptured,[patch.bottomSide]:patch.bottomCaptured}};
   const e=this._battle.enqueue(last,view,event,state,now,options);this.motion=this._battle.advance(now);
   if(!options.silent){const sound={event,state,at:e.at+e.timings.impact};(this._battleSounds||(this._battleSounds=[])).push(sound);this.armBattleSound(sound);}
  }else if(!moved&&(event||this._presentedState!==state)){
   this.clearPresentation();
   if(event&&state.status==='ended')this._battle.cues.push({at:now,duration:650,reason:state.reason,warning:false});
   if(event)this._audio.event(event,state);
  }
  this._presentedState=state;this._presentedMoveKey=key;this._presentedEvent=event;
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
  this.tick();if(!this._alive||!this._state||this._state.status!=='playing'||this.data.waiting||this.data.starting)return false;
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
 localMove(id,to){this.tick();if(this._state.status!=='playing'||this._clock.reasons.size)return false;const result=G.move(this._state,id,to);if(!result.ok){this.toast(result.message);return false;}this.stopCountdownCue();const repeat=this._state.variant==='fusion'?null:Repetition.analyze([...(this._repetitionHistory||this._history),this._state],result.state);if(repeat&&repeat.kind==='perpetual'&&repeat.offender===this._state.turn){if(this._longCheckWarning&&this._longCheckWarning.ply===this._state.ply&&this._longCheckWarning.side===this._state.turn){this.endLongCheck(this._state.turn);return false;}this._longCheckWarning={ply:this._state.ply,side:this._state.turn};this.setData({message:'单方长将：必须变招，再次循环将军直接判负',selectedId:''});this.toast('单方长将，请变招；再次重复将判负');return false;}this._longCheckWarning=null;if(repeat&&repeat.kind==='mutual'){result.state={...result.state,status:'ended',winner:null,reason:'mutual-check',motif:'循环互将和棋'};result.event='end';}if(!this._repetitionHistory)this._repetitionHistory=this._history.slice();if(result.state.lastMove.revealed||result.state.lastMove.capturedId)this._repetitionHistory=[];else this._repetitionHistory.push(this._state);if(!this._state.pendingChase)this._history.push(this._state);this._history=this._history.slice(-100);const sameTurn=result.state.turn===this._state.turn;if(!sameTurn)this._clock.start();this._state=result.state;if(result.event==='check'){this._clock.pause('check');clearTimeout(this._checkTimer);this._checkTimer=setTimeout(()=>{this._clock.resume('check');if(this._mode==='ai')this.scheduleAI();},1200);}this.sync(result.event);if(repeat&&repeat.kind==='perpetual'&&repeat.offender===this._state.turn&&this._state.status==='playing'){this._longCheckWarning={side:repeat.offender,ply:this._state.ply};this.setData({message:names[repeat.offender]+'单方长将：必须变招，否则判负'});this.toast(names[repeat.offender]+'单方长将，请变招');}if(this._mode==='ai')this.scheduleAI();return true;},
 async scheduleAI(){if(!this._alive||this._mode!=='ai'||this._hidden||this._aiThinking||this.data.pendingRequest||!this._state||this._state.status!=='playing'||this._state.turn!=='black'||this._clock.reasons.size)return;
  this._aiThinking=true;const token=this._token,started=Date.now(),snapshot=this._state;try{
   // Let the previous move finish before starting CPU-heavy search.
   const settle=this.motion?Math.max(0,FX.timing(this.motion.move).total-(Date.now()-this.motion.at)):0;
   if(settle)await new Promise(resolve=>{this._aiDelayResolve=resolve;this._aiDelayTimer=setTimeout(()=>{this._aiDelayResolve=null;resolve();},settle);});
   if(!this._alive||this._hidden||this._clock.reasons.size||token!==this._token||this._state!==snapshot)return;
   const aiLevel=this._fakeOpponent?'hard':this._level,searchHistory=[...(this._repetitionHistory||this._history||[]),snapshot],cancel=()=>!this._alive||this._hidden||this._clock.reasons.size>0||token!==this._token||this._state!==snapshot;
   const m=snapshot.variant==='fusion'?await AIWorker.choose('fusion',{state:snapshot,history:searchHistory},aiLevel,{cancel}):await AIWorker.choose('classic',{pieces:snapshot.pieces,state:snapshot,history:searchHistory},aiLevel,{history:searchHistory,cancel,allowMove:move=>{const repeat=this.repetitionForMove(move);return !repeat||repeat.kind!=='perpetual'||repeat.offender!=='black';}});
   const thinkFloor=this._fakeOpponent?900+Math.floor(Math.random()*3300):2000;const wait=Math.max(0,thinkFloor-(Date.now()-started));if(wait&&this._alive&&token===this._token)await new Promise(resolve=>{this._aiDelayResolve=resolve;this._aiDelayTimer=setTimeout(()=>{this._aiDelayResolve=null;resolve();},wait);});
   if(token===this._token&&this._alive&&!this._hidden&&this._state===snapshot&&!this._clock.reasons.size){if(m){this.localMove(m.id,m.to);this.queueFakeSticker();}else if(snapshot.variant!=='fusion'){const moves=AI.moves(AI.publicBoard(snapshot.pieces),'black');if(moves.length&&moves.every(move=>{const repeat=this.repetitionForMove(move);return repeat&&repeat.kind==='perpetual'&&repeat.offender==='black';}))this.endLongCheck('black');}}
  }finally{this._aiThinking=false;if(this._alive)setTimeout(()=>this.scheduleAI(),50);}
 },
 queueFakeSticker(){const now=Date.now();if(!this._fakeOpponent||!this._alive||!this._state||this._state.status!=='playing'||now<(this._fakeBotStickerCooldownUntil||0)||Math.random()>=.22)return false;this._fakeBotStickerCooldownUntil=now+30000;const id=stickers[Math.floor(Math.random()*stickers.length)].id;clearTimeout(this._fakeStickerTimer);this._fakeStickerTimer=setTimeout(()=>{if(this._alive&&this._fakeOpponent&&this._state.status==='playing')this.showSticker(id);},250+Math.floor(Math.random()*900));return true;},
 togglePause(){if(this._inference){this.toast('推理期间不能暂停正式对局');return;}if(this._fakeOpponent||this.data.fakeOpponent)return;if(!['ai','local'].includes(this._mode)||this._state.status!=='playing')return;this.tick();if(this._state.status!=='playing')return;
  const paused=!this.data.manualPaused;this._token++;if(paused){this._clock.pause('manual');this.pausePresentation();}else{this._clock.resume('manual');this.resumePresentation();}this.setData({manualPaused:paused,paused:this._clock.reasons.size>0,selectedId:''});if(!paused&&this._mode==='ai')this.scheduleAI();
 },
 loadStickerPackage(name){
  const renderer=this.runtime&&this.runtime.renderer;
  if(renderer&&renderer.loadUiPackage)return renderer.loadUiPackage(name);
  return Promise.resolve(true);
 },

 cancelSelection(){
  if(this._battle)this._battle.select(null);
  if(this.data.inference)this.setData({inferenceSelectedId:''});
  else this.setData({selectedId:''});
 },
 async onPoint(e){if(this._inference){this.inferencePoint(e);return;}this.tick();if(this._state.status!=='playing'||this.data.waiting||this.data.starting||this.data.busy||this.data.paused||this.data.pendingRequest)return;if(this._mode==='ai'&&this._state.turn!=='red')return;const onlineSide=this._onlineSide||(this._room&&this._room.side);if(this._mode==='online'&&(!this._room||this._room.waiting||!onlineSide||this._state.turn!==onlineSide))return;
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
 requestFake(kind){
  if(this.data.pendingRequest)return this.toast('已有请求等待对方回应');
  if(this._state.status!=='playing'&&kind!=='restart')return this.toast('对局已结束，请重开');
  if(kind==='undo'){
   if(!this._history.length)return this.toast('没有可悔棋记录');
   const side='red',ply=this._state&&Number.isFinite(this._state.ply)?this._state.ply:null;
   this._fakeUndoUsed=this._fakeUndoUsed||{};
   if(ply!==null&&this._fakeUndoUsed[side]===ply)return this.toast('本手已请求过悔棋');
   if(ply!==null)this._fakeUndoUsed[side]=ply;
  }
  const label=requestLabel(kind,this._state);this._token++;
  this.setData({pendingRequest:kind,pendingRequestLabel:label,pendingUntil:Date.now()+15000});this.sync();
  this.toast('已发送'+label+'请求，等待对方回应');clearTimeout(this._fakeRequestTimer);
  this._fakeRequestTimer=setTimeout(()=>{
   if(!this._alive||this.data.pendingRequest!==kind)return;
   this.setData({pendingRequest:'',pendingRequestLabel:'',pendingUntil:0});
   if(this._state.status!=='playing'&&kind!=='restart'){this.sync();return;}
   const ok=Math.random()<(kind==='restart'?.85:.2);
   if(ok){
    if(kind==='undo'){
     do{this._state=this._history.pop();}while(this._state.turn!=='red'&&this._history.length);
     this._repetitionHistory=[];this._longCheckWarning=null;this._clock.start();
    }else if(kind==='draw')this._state=G.finish(this._state,'draw');
    else{
     this._fakeRestartRejected=false;this._fakeUndoUsed={};this._state=G.newGame(undefined,this._state.variant||'dark');
     this._history=[];this._repetitionHistory=[];this._longCheckWarning=null;this._clock.start();
    }
   }else if(kind==='restart')this._fakeRestartRejected=true;
   this.sync();this.toast('对方'+(ok?'同意':'拒绝')+'了'+label);this.scheduleAI();
  },1200+Math.floor(Math.random()*1800));
 },
 requestOnline(kind){
  if(this.data.busy||this._sendingRequest)return this.toast('操作处理中，请稍候');
  if(this.data.pendingRequest||this._room&&this._room.pending)return this.toast('等待对方回应');
  if(!this._room||!this._room.black)return this.toast('请等待对手入座');
  if(this.data.starting)return this.toast('请等待双方就绪');
  if(this._state.status!=='playing'&&kind!=='restart')return this.toast('对局已结束，请重开');
  const label=requestLabel(kind,this._state);this._sendingRequest=kind;
  this.setData({pendingRequest:kind,pendingRequestLabel:label,pendingUntil:Date.now()+15000});this.sync();
  if(typeof wx!=='undefined')this.toast('已发送'+label+'请求，等待对方回应');return this.command('request',{kind});
 },
 rematchFake(){const variant=this._state&&this._state.variant||this.runtime&&this.runtime.variant||'dark';this._fakeRestartRejected=false;this._token++;if(this.runtime&&typeof this.runtime.startGame==='function')return this.runtime.startGame({mode:'online',match:'1',variant});this.toast('正在重新匹配棋友');return false;},
 restart(){
  if(this._inference){this.leaveInference();return;}
  if(this._mode==='online'&&this.data.ended&&this.data.canRematch===false){
   return this.runtime.startGame({mode:'online',match:'1',variant:this._state.variant});
  }
  if(this.data.pendingRequest)return this.toast('等待对方回应');
  if(this._fakeOpponent)return this._fakeRestartRejected?this.rematchFake():this.requestFake('restart');
  if(this._mode==='online')return this.requestOnline('restart');
  this.modal('重新开始','重新洗牌并开始新对局？',()=>{
   this._state=G.newGame(undefined,this._state.variant||'dark');this._history=[];this._repetitionHistory=[];
   this._longCheckWarning=null;this._clock.start();this.sync();
  });
 },
 undo(){if(this._inference){this.undoInference();return;}if(this.data.pendingRequest)return this.toast('等待对方回应');if(this._fakeOpponent){if(!this._history.length)return this.toast('没有可悔棋记录');return this.requestFake('undo');}if(this._state.status!=='playing')return this.toast('对局已结束，请重开');if(this._mode==='online')return this.requestOnline('undo');if(!this._history.length)return this.toast('没有可悔棋记录');this.modal('确认悔棋',(['classic','fusion'].includes(this._state.variant)?'退回你上一次行棋之前。':'退回你上一次行棋之前；暗棋/揭棋中已看到的暗子身份不会从记忆中消失。'),()=>{do{this._state=this._history.pop();}while(this._state.turn!=='red'&&this._history.length);this._clock.start();this.sync();});},
 async more(){if(this._inference){this.toast('推理期间请使用推理操作按钮');return;}if(this._menuOpen)return;this._menuOpen=true;this.tick();this._token++;let choice;
  if(this._mode==='ai'&&!this._fakeOpponent&&this._state.status==='playing'){this._clock.pause('more');this.tick();}
  if(!this._alive){this._menuOpen=false;return;}
  try{wx.showActionSheet({itemList:['认输','协商合棋','游戏规则','声音设置','返回首页'],success:r=>{choice=r.tapIndex;this._audio.effect('click');},complete:()=>this.closeMore(choice)});}catch(error){this.closeMore();}
 },
 async closeMore(choice){if(this._mode==='ai'&&!this._fakeOpponent){this._clock.resume('more');this.tick();}this._menuOpen=false;if(!this._alive)return;this.moreAction(choice);this.scheduleAI();},
 moreAction(choice){if(choice===0){if(this._mode==='online')this.command('resign');else this.modal('确认认输','确认后本局结束。',()=>{this._state={...this._state,status:'ended',winner:'black',reason:'resign',motif:'认输'};this.sync('end');});}else if(choice===1){if(this._fakeOpponent)return this.requestFake('draw');if(this._mode==='online')return this.requestOnline('draw');this.toast('人机练习不接受协商合棋');}else if(choice===2)this.runtime.open('rules');else if(choice===3)this.runtime.open('settings');else if(choice===4)this.home();},

 async command(action,data={}){
  if(this.data.busy||!this._room||this._room.starting)return;
  const target=this._room;this._commandPending=true;this._movingOnline=action==='move';this.setData({busy:true});
  const optimistic=action==='move'?this.beginOptimisticMove(data):null;
  if(action==='move')this.stopCountdownCue();
  try{
   const room=await Online.call(action,{...data,roomId:target.roomId,rev:target.rev});
   if(!this._alive)return;
   this.applyRoom(room);
   if(optimistic&&this._optimisticMove===optimistic)this.rollbackOptimisticMove();
   this._networkFailures=0;
  }catch(e){
   // A poll can confirm the move before the command connection fails.
   if(!this._alive||optimistic&&optimistic.settled)return;
   if(action==='move'&&!(e&&e.serverRejected)){
    if(!this._room||this._room.roomId!==target.roomId||this._room.rev>target.rev)return;
    // A lost response does not tell us whether the server committed the move.
    this._moveRecovery={roomId:target.roomId,rev:target.rev,checkAfter:Date.now()+1000};
    this.handleNetworkError(e);
    await this.poll(true);
    return;
   }
   if(optimistic&&this._optimisticMove===optimistic)this.rollbackOptimisticMove();
   if(action==='move')this.setData({selectedId:''});
   if(action==='request'){this.setData({pendingRequest:'',pendingRequestLabel:'',pendingUntil:0});this.sync();}
   this.handleNetworkError(e);this.toast(e&&e.message||'落子失败，请重新同步');
   if(this._room)await this.poll(true);
  }finally{this._commandPending=false;this._movingOnline=false;if(action==='request')this._sendingRequest=null;if(this._alive)this.setData({busy:!!this._moveRecovery,manualPaused:false});}
 },
 handleNetworkError(error){this._networkFailures=(this._networkFailures||0)+1;this._lastNetworkError=String(error&&error.message||error||'');if(this._networkFailures>=3&&!this._networkWarned){this._networkWarned=true;this.toast('网络不稳定，正在重连；服务器仍在计时');}},
 async poll(force=false){
  if(!this._room||this._polling||!this._alive||this._hidden||this._waitingTransition||
     (!force&&this.data.busy&&!this._movingOnline&&!this._moveRecovery))return;
  const target=this._room,verification=this._moveRecovery;
  this._polling=true;
  try{
   let room;
   try{
    room=await Online.call('poll',{roomId:target.roomId,rev:target.rev});
    if(!this._alive||!this._room||this._room.roomId!==target.roomId)return;
    if(room.queueExpired&&!this._waitingTransition&&!this._hidden){
     this._matchStartedAt=Date.now();
     const entry=Online.call('match',{variant:target.state.variant});
     this._entryRequest=entry;
     try{room=await entry;}finally{if(this._entryRequest===entry)this._entryRequest=null;}
    }
   }catch(e){this.handleNetworkError(e);return;}
   try{
    this.applyRoom(room);
    if(verification&&this._moveRecovery===verification&&room.roomId===verification.roomId&&
       room.rev===verification.rev&&Date.now()>=verification.checkAfter){
     this._moveRecovery=null;this.rollbackOptimisticMove();this.setData({busy:!!this._commandPending,selectedId:''});
     this.toast('未能确认落子，请重试');
    }
   }catch(e){
    console.error('room synchronization failed:',String(e&&e.message||e).slice(0,240));
    if(!this._syncWarned){this._syncWarned=true;this.toast('对局数据同步失败，请稍后重试');}return;
   }
   this._syncWarned=false;this._networkFailures=0;this._networkWarned=false;
  }finally{this._polling=false;}
 },
 applyRoom(room){
  if(!this._alive||this._mode&&this._mode!=='online'||!room||!room.state)return;
  room={...room,waiting:!!room.waiting&&!room.black&&room.state.status==='playing'};
  const old=this._room;
  if(old&&room.roomId===old.roomId&&room.rev<old.rev)return;
  if(this._matchResolved&&room.waiting)return;
  const preview=this._optimisticMove;
  // A poll already in flight when we tapped still describes the old board.
  if(preview&&room.roomId===preview.roomId&&room.rev<=preview.baseRev)return;
  const confirmed=!!(preview&&room.roomId===preview.roomId&&presentationKey(room.state)===preview.key);
  if(this._moveRecovery&&(room.roomId!==this._moveRecovery.roomId||room.rev>this._moveRecovery.rev))this._moveRecovery=null;
  if(preview&&!confirmed)this.rollbackOptimisticMove();
  if(old&&room.roomId!==old.roomId){this._matchResolved=false;this._onlineSide=null;}
  const activeSide=room.side||this._onlineSide||(old&&old.side);
  if(activeSide)this._onlineSide=activeSide;
  const stateChanged=!!(!old||!old.state||old.rev!==room.rev&&JSON.stringify(old.state)!==JSON.stringify(room.state));
  const sampleOffset=(room.serverNow||Date.now())-Date.now();
  this._offset=Number.isFinite(this._offset)?Math.round(this._offset*.75+sampleOffset*.25):sampleOffset;
  this._room=room;this._state=room.state;
  if(stateChanged)this.stopCountdownCue();
  if(this.runtime)this.runtime.variant=room.state.variant||'dark';
  if(this._matchQueue&&room.waiting&&(!old||!old.waiting)){
   this._matchStartedAt=Date.now();this._matchFallbackAt=MATCH_HUMAN_WAIT_SECONDS+Math.floor(Math.random()*(MATCH_FAKE_MAX_SECONDS-MATCH_HUMAN_WAIT_SECONDS+1));this.setData({matchSeconds:0});
  }
  const identityChanged=!old||JSON.stringify([old.red,old.black])!==JSON.stringify([room.red,room.black]);
  const sideChanged=!old||old.side!==activeSide,matchQueue=this._matchQueue||this.data.onlineMatch||room.match===true;
  const matched=!!(matchQueue&&!room.waiting&&!room.starting&&room.state.status==='playing'&&(!old||old.waiting||old.starting));
  if(matchQueue&&!room.waiting)this._matchResolved=true;
  const serverPreference=['red','black','rotate'].includes(room.seatPreference)?room.seatPreference:this.data.seatPreference;
  const eventChanged=!!room.event&&(!old||old.event!==room.event);
  const nextFlipped=sideChanged?activeSide==='black':this.data.flipped,topSide=nextFlipped?'red':'black',bottomSide=R.opposite(topSide),topProfile=room[topSide],bottomProfile=room[bottomSide];
  const canRematch=room.canRematch!==false&&(room.state.status!=='ended'||room.red!==null&&room.black!==null);
  this.setData({
   waiting:room.waiting,starting:!!room.starting,canRematch,onlineMatch:matchQueue,roomId:room.roomId,
   matchFound:matched||this.data.matchFound,matchFoundAt:matched?Date.now():this.data.matchFoundAt,
   seatPreference:serverPreference,seatMenu:room.waiting&&this.data.seatMenu,flipped:nextFlipped,
   topName:topProfile&&topProfile.nickname||this.data.topName,bottomName:bottomProfile&&bottomProfile.nickname||this.data.bottomName,
   topAvatar:topProfile&&topProfile.avatar||'',bottomAvatar:bottomProfile&&bottomProfile.avatar||'',
   busy:!!(this._commandPending||this._moveRecovery),manualPaused:false,paused:false,selectedId:matched?'':this.data.selectedId
  });
  if(matched){clearTimeout(this._matchFoundTimer);this._matchFoundTimer=setTimeout(()=>{if(this._alive)this.setData({matchFound:false});},900);}
  const changed=!old||stateChanged||old.waiting!==room.waiting||old.starting!==room.starting;
  if(changed||identityChanged||confirmed){const syncEvent=room.event&&/^undo-/.test(room.event)?'':(old?room.event:undefined);this.sync(syncEvent);}
  if(confirmed){preview.settled=true;this._optimisticMove=null;}
  this.tick();
  if(room.sticker&&(!old||!old.sticker||old.sticker.seq!==room.sticker.seq)&&room.serverNow-room.sticker.at<4000)this.showSticker(room.sticker.id);
  this.applyRequestFeedback(room,old);

 },
 applyRequestFeedback(room,old){
  const p=room.pending,result=room.requestResult;
  const fresh=!!(result&&old&&(!old.requestResult||old.requestResult.seq!==result.seq));
  if(fresh){
   const own=result.by===(old.side||room.side),label=result.label||requestLabel(result.kind,room.state);
   if(result.outcome==='expired')this.toast(own?'对方未回应，'+label+'请求已失效':'对方的'+label+'请求已失效');
   else if(own)this.toast('对方'+(result.outcome==='accepted'?'同意':'拒绝')+'了'+label);
   else this.toast('已'+(result.outcome==='accepted'?'同意':'拒绝')+'对方的'+label+'请求');
  }
  // Keep feedback working while an older cloud function is being replaced.
  if(!result&&old&&old.pending&&!p){
   const pending=old.pending,label=pending.label||requestLabel(pending.kind,old.state),own=pending.by===old.side;
   if(room.event===pending.kind+'-accepted'||room.event===pending.kind+'-rejected'){
    const accept=room.event.endsWith('-accepted');this.toast(own?'对方'+(accept?'同意':'拒绝')+'了'+label:'已'+(accept?'同意':'拒绝')+'对方的'+label+'请求');
   }else if(room.serverNow>=pending.until)this.toast(own?'对方未回应，'+label+'请求已失效':'对方的'+label+'请求已失效');
  }
  if(p&&p.by===room.side){
   this.setData({pendingRequest:p.kind,pendingRequestLabel:p.label||requestLabel(p.kind,room.state),pendingUntil:Date.now()+Math.max(0,p.until-room.serverNow)});
  }else if(!p&&this.data.pendingRequest&&(!this._sendingRequest||fresh)){
   this.setData({pendingRequest:'',pendingRequestLabel:'',pendingUntil:0});this.sync();
  }
  if(!p){this._promptKey='';return;}
  const key=JSON.stringify([room.roomId,p.kind,p.by,p.until]);
  if(p.by!==room.side&&this._promptKey!==key){
   this._promptKey=key;const label=p.label||requestLabel(p.kind,room.state);
   wx.showModal({title:'对方请求'+label,content:'是否同意对方的'+label+'请求？',success:r=>this.command('reply',{accept:r.confirm})});
  }
 },
 onShareAppMessage(){const roomId=this.data.roomId||(this._room&&this._room.roomId)||'';return {title:'暗棋大乱斗 · 来一局中国象棋',query:roomId?'room='+encodeURIComponent(roomId):''};},
 async toggleStickers(){
  if(this.data.showStickers){this.setData({showStickers:false});return;}
  if(this._openingStickers)return;
  this._openingStickers=true;
  try{
   const ready=await Promise.all(STICKER_PACKAGES.map(name=>this.loadStickerPackage(name)));
   if(!this._alive)return;
   if(!ready.every(Boolean))return this.toast('表情加载失败，请重试');
   this.setData({showStickers:true});
  }finally{this._openingStickers=false;}
 },
 sendSticker(e){this.setData({showStickers:false});const id=e.currentTarget.dataset.id;if(this._fakeOpponent){const now=Date.now();if(now<(this._stickerCooldownUntil||0)){this.toast('表情冷却中，请稍候');return;}this._stickerCooldownUntil=now+30000;this.showSticker(id);return;}if(this._mode==='ai'||this._mode==='local')this.showSticker(id);else {const now=Date.now();if(now<(this._stickerCooldownUntil||0)){this.toast('表情冷却中，请稍候');return;}this._stickerCooldownUntil=now+30000;this.command('sticker',{id});}},
 async showSticker(id){
  const sticker=stickers.find(value=>value.id===id);
  if(!sticker)return;
  const sequence=this._stickerSequence=(this._stickerSequence||0)+1;
  if(!await this.loadStickerPackage(sticker.image.split('/')[0])||!this._alive||this._stickerSequence!==sequence)return;
  clearTimeout(this._stickerTimer);
  this.setData({stickerImage:sticker.image,stickerText:sticker.text});
  if(!this._hidden)this._audio.speak(sticker.voice||sticker.text);
  this._stickerTimer=setTimeout(()=>{if(this._alive)this.setData({stickerImage:'',stickerText:''});},3000);
 },
 startHotseat(){return this.exitWaiting('local');},
 cancelWait(){return this.exitWaiting('home');},
 async exitWaiting(destination){
  if(!this._alive||this._mode!=='online'||this._waitingTransition||this._room&&!this._room.waiting)return false;
  this._waitingTransition=destination;
  this.stopPolling();
  try{
   let room=this._room;
   if(this._entryRequest){
    try{room=await this._entryRequest;}catch(e){/* A lost entry response can still be cancelled by the current user. */}
   }
   if(!this._alive)return false;
   if(room&&!room.waiting){this.applyRoom(room);return false;}
   const outcome=await Online.call('cancel',room?{roomId:room.roomId,rev:room.rev}:{});
   if(!this._alive)return false;
   if(outcome&&outcome.state){this.applyRoom(outcome);return false;}
   if(!outcome||!outcome.cancelled)throw Error('尚未确认退出等待');

   this._room=null;
   if(destination==='home'){this.home();return true;}
   clearTimeout(this._matchFoundTimer);
   this.clearPresentation();
   this._state=privateStateForOffline(this._state);this._history=[];this._repetitionHistory=[];this._token++;
   this._matchQueue=false;this._matchResolved=false;this._onlineSide=null;
   this._mode=destination;this._fakeOpponent=destination==='ai'?FakeOpponents.pick():null;
   this._fakeRestartRejected=false;this._fakeUndoUsed={};
   if(this._fakeOpponent)this._level='hard';
   this._clock.start();
   this.setData({mode:destination,level:this._level,waiting:false,starting:false,onlineMatch:false,fakeOpponent:!!this._fakeOpponent,roomId:'',matchSeconds:0,matchFound:false,seatMenu:false,pendingRequest:'',pendingUntil:0,busy:false,manualPaused:false,paused:false,selectedId:'',showResult:false});
   this.sync();if(this._fakeOpponent)this.scheduleAI();
   return true;
  }catch(e){
   if(this._alive){
    if(destination==='ai')this._nextFallbackAttempt=Date.now()+2000;
    else this.toast(e.message||e.errMsg||'取消等待失败，请重试');
   }
   return false;
  }finally{
   this._waitingTransition=null;
   if(this._mode==='online')this.startPolling();
  }
 },toggleSeatMenu(){if(!this.data.waiting)return;this.setData({seatMenu:!this.data.seatMenu});},async setSeatPreference(preference){if(!['red','black','rotate'].includes(preference)||!this.data.waiting||this.data.onlineMatch)return;this.setData({seatPreference:preference,seatMenu:false});if(this._room){try{this.applyRoom(await Online.call('preference',{roomId:this._room.roomId,rev:this._room.rev,preference}));}catch(e){this.setData({seatPreference:preference,seatMenu:false});/* Keep the local choice visible while an older cloud function catches up. */}}},
 closeResult(){this.setData({showResult:false});},home(){this.runtime.home();}
};
