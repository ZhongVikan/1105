// Pure room reducer, independently testable. Never send this private room to clients.
const G=require('./shared/game-engine'),R=require('./shared/rules-core');
const STICKERS=new Set(require('./shared/stickers').map(s=>s.id));
const requestLabel=(kind,state)=>kind==='restart'?(state.status==='ended'?'再来一局':'重开'):kind==='undo'?'悔棋':'合棋';
function requestResult(room,pending,outcome){room.requestResult={kind:pending.kind,by:pending.by,label:pending.label||requestLabel(pending.kind,room.state),outcome,seq:(room.requestResult?room.requestResult.seq:0)+1};room.event=pending.kind+'-'+outcome;}
function assert(v,m){if(!v)throw Error(m);}
function sideOf(room,uid){return room.red.uid===uid?'red':room.black&&room.black.uid===uid?'black':null;}
function expire(room,now){
 // Release any legacy menu pause. Opening a menu no longer grants time.
 if(room.menuPause){room.deadline-=Math.max(0,room.menuPause.until-now);if(room.holdUntil===room.menuPause.until)room.holdUntil=now;room.menuPause=null;room.rev++;}
 if(room.pending&&now>=room.pending.until){requestResult(room,room.pending,'expired');room.pending=null;room.rev++;}
 if(room.state.status==='playing'&&room.black&&now>=room.deadline){room.state={...room.state,status:'ended',reason:'timeout',motif:'超时判负',winner:R.opposite(room.state.turn)};room.pending=null;room.rev++;room.event='timeout';}
}
function publicRoom(room,uid,now){const side=sideOf(room,uid);assert(side,'你不在这个房间');const profile=p=>p?{nickname:p.nickname,avatar:p.avatar}:null;
 return {roomId:room.id,rev:room.rev,side,red:profile(room.red),black:profile(room.black),match:!!room.match,seatPreference:room.seatPreference||'random',waiting:!room.black,state:{...room.state,pieces:G.displayPieces(room.state.pieces)},deadline:room.deadline,holdUntil:room.holdUntil||0,serverNow:now,pending:room.pending?{kind:room.pending.kind,by:room.pending.by,until:room.pending.until,label:room.pending.label||requestLabel(room.pending.kind,room.state)}:null,requestResult:room.requestResult||null,menuPause:null,event:room.event||'',sticker:room.sticker||null};
}
function reduce(room,uid,input,now){
 const side=sideOf(room,uid);assert(side,'你不在这个房间');expire(room,now);if(input.action==='poll')return room;
 // A terminal timeout is always committed, even if a late request supplied an old rev.
 if(room.state.status==='ended'&&input.action==='move')return room;
 assert(input.rev===room.rev,'棋局已更新，请重试');
 if(input.action==='preference'){assert(!room.black&&room.state.status==='playing','对局已开始，不能修改对局设置');assert(room.ownerUid===uid||(!room.ownerUid&&room.red.uid===uid),'只有创建者可以修改对局设置');assert(['red','black','rotate'].includes(input.preference),'对局设置无效');room.seatPreference=input.preference;room.rev++;return room;}
 if(input.action==='menuOpen'||input.action==='menuClose')return room;
 if(input.action==='sticker'){assert(room.black,'请等待对手');assert(STICKERS.has(input.id),'表情不存在');assert(!room.sticker||now-room.sticker.at>=30000,'表情发送太快');room.sticker={id:input.id,at:now,side,seq:(room.sticker?room.sticker.seq:0)+1};room.rev++;return room;}
 if(input.action==='reply'){
  const p=room.pending;assert(p&&p.by!==side,'没有待确认请求');p.label=p.label||requestLabel(p.kind,room.state);
  // Resume unused time on rejection; accepted undo resets a fresh turn.
  room.pending=null;
  if(input.accept){
   if(p.kind==='undo'){assert(room.history.length,'没有历史记录');room.state=room.history.pop();room.deadline=now+60000;}
   if(p.kind==='restart'){room.state=G.newGame(undefined,room.state.variant||'dark');room.history=[];room.pauseUsed={};room.requestUsed={};room.deadline=now+60000;if(room.seatPreference==='rotate'){const previous=room.red;room.red=room.black;room.black=previous;room.round=(room.round||0)+1;}}
   if(p.kind==='draw')room.state=G.finish(room.state,'draw');
  }else if(room.state.status==='playing')room.deadline-=Math.max(0,p.until-now);

  room.rev++;requestResult(room,p,input.accept?'accepted':'rejected');return room;
 }
 if(input.action==='request'){
  assert(room.black&&!room.pending&&!room.menuPause,'当前不能发起请求');assert(['undo','restart','draw'].includes(input.kind),'未知请求');assert(room.state.status==='playing'||input.kind==='restart','对局已结束');
  if(input.kind==='undo')assert(room.history.length,'没有可悔棋记录');
  const label=requestLabel(input.kind,room.state);room.requestUsed=room.requestUsed||{};const used=room.requestUsed[side]||(room.requestUsed[side]={});
  if(room.state.status==='playing'){assert(used[input.kind]!==room.state.ply,'本手已请求过'+label);used[input.kind]=room.state.ply;}
  room.pending={kind:input.kind,by:side,label,until:now+15000};if(room.state.status==='playing')room.deadline+=15000;room.rev++;return room;
 }
 assert(room.black,'请等待对手');assert(room.state.status==='playing','对局已结束');
 if(input.action==='resign'){room.state={...room.state,status:'ended',reason:'resign',winner:R.opposite(side),motif:'认输'};room.pending=null;room.rev++;return room;}
 assert(input.action==='move','未知操作');assert(!room.pending&&now>=(room.holdUntil||0),'正在展示提示或等待确认');assert(room.state.turn===side,'还没轮到你');
 const result=G.move(room.state,input.id,input.to);assert(result.ok,result.message);if(!room.state.pendingChase)room.history.push(room.state);room.history=room.history.slice(-100);const sameTurn=result.state.turn===room.state.turn;room.state=result.state;room.holdUntil=result.event==='check'?now+1200:now;if(!sameTurn)room.deadline=room.holdUntil+60000;room.event=result.event;room.rev++;return room;
}
function canMatch(candidate,uid,variant){return !!candidate&&!candidate.black&&candidate.state.status==='playing'&&candidate.red.uid!==uid&&(candidate.state.variant||'dark')===variant;}
module.exports={canMatch,reduce,expire,publicRoom,sideOf};
