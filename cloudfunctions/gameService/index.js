const cloud=require('wx-server-sdk'),crypto=require('crypto');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),G=require('./shared/game-engine'),S=require('./service');
const uidKey=id=>crypto.createHash('sha256').update(id).digest('hex');
const profile=p=>({uid:p.uid,nickname:p.nickname,avatar:p.avatar});
async function optional(ref){try{const data=(await ref.get()).data;if(data)delete data._id;return data;}catch(e){if(/not exist|not found|不存在/i.test(e.message))return null;throw e;}}
exports.main=async event=>{
 try{
 const variant=event.variant||'dark';if(['create','match'].includes(event.action)&&!['dark','classic','jieqi','fusion'].includes(variant))throw Error('未知玩法');
 const uid=cloud.getWXContext().OPENID;if(!uid)throw Error('请在微信中登录');const key=uidKey(uid),users=db.collection('chess_users'),rooms=db.collection('chess_rooms');
 // Polls are by far the hottest online path.  A paired room that is still
 // inside its current deadline has no state to mutate, so avoid opening a
 // transaction (and the extra user read) just to return the same snapshot.
 // Mutating polls (timeout/expired request) and waiting-room heartbeats keep
 // using the transactional path below so their revisions remain authoritative.
 if(event.action==='poll'&&/^[a-f0-9]{32}$/.test(event.roomId||'')){
  const room=await optional(rooms.doc(event.roomId)),now=Date.now();
  if(!room)throw Error('房间不存在');
  const beforeRev=room.rev;S.expire(room,now);
  if(room.black&&room.rev===beforeRev)return {ok:true,...S.publicRoom(room,uid,now)};
 }
 if(event.action==='profile'){
  const nickname=String(event.nickname||'').trim(),avatar=String(event.avatar||'');if(!nickname||nickname.length>24||!avatar.startsWith('cloud://'))throw Error('请填写昵称并选择头像');
  // Identity comes only from WX context, never from a caller-supplied openid.
  await db.runTransaction(async tx=>{const ref=tx.collection('chess_users').doc(key),old=await optional(ref);await ref.set({data:{uid,nickname,avatar,activeRoom:old&&old.activeRoom||null}});});return {ok:true};
 }
 const me=await optional(users.doc(key));if(!me)throw Error('请先设置头像昵称');
 const result=await db.runTransaction(async tx=>{
  const now=Date.now(),ur=tx.collection('chess_users').doc(key),fresh=await optional(ur);if(!fresh)throw Error('请先登录');
  const roomCollection=tx.collection('chess_rooms');
  if(['create','match','join','cancel'].includes(event.action)){
   const lobbyRef=tx.collection('chess_lobby').doc('queue'),lobby=await optional(lobbyRef)||{entries:[]};lobby.entries=lobby.entries.filter(e=>now-e.at<120000);
   if(fresh.activeRoom){
    const activeRef=roomCollection.doc(fresh.activeRoom),active=await optional(activeRef);
    if(active){
     // Settle timeout before deciding whether this account is still occupied.
     S.expire(active,now);
     if(active.state.status==='playing'){
      const reuseWaiting=event.action==='join'?event.roomId===active.id:
       event.action!=='cancel'&&(active.state.variant||'dark')===variant&&!!active.match===(event.action==='match');
      if(active.black||reuseWaiting){
       // Resume a real game, including its server-side variant, rather than lock the user out.
       await activeRef.set({data:active});return {ok:true,...S.publicRoom(active,uid,now)};
      }
      // Switching an unpaired room is safe; remove its queue entry in the same transaction.
      await activeRef.remove();
     }else await activeRef.set({data:active});
    }
    lobby.entries=lobby.entries.filter(e=>e.id!==fresh.activeRoom);
    await ur.update({data:{activeRoom:null}});
   }
   if(event.action==='cancel'){await lobbyRef.set({data:lobby});return {ok:true,cancelled:true};}
   let room=null;
   if(event.action==='join'){
    if(!/^[a-f0-9]{32}$/.test(event.roomId||''))throw Error('房间链接无效');room=await optional(roomCollection.doc(event.roomId));if(!room||room.black||room.state.status!=='playing')throw Error('房间已满或已结束');
   }else if(event.action==='match'){
    // Read queued rooms concurrently. A busy lobby can contain dozens of
    // entries; awaiting each document one by one adds one database round trip
    // per entry before a compatible opponent is found.
    const queued=await Promise.all(lobby.entries.map(async entry=>({entry,candidate:await optional(roomCollection.doc(entry.id))})));
    const stale=new Set();
    for(const {entry,candidate} of queued){
     if(!candidate){stale.add(entry.id);continue;}
     if(!room&&S.canMatch(candidate,uid,variant))room=candidate;
    }
    if(stale.size)lobby.entries=lobby.entries.filter(entry=>!stale.has(entry.id));
   }
   if(room){
    // Apply the creator's seat preference when the second player takes the seat.
    // Matchmaking rooms keep random assignment; invitation rooms default to rotation.
    const joining=profile(fresh),existing=room.red,preference=room.seatPreference||'random';
    const ownerSide=preference==='red'?'red':preference==='black'?'black':preference==='rotate'?((room.round||0)%2===0?'red':'black'):(crypto.randomInt(0,2)===0?'red':'black');
    if(ownerSide==='red'){room.red=existing;room.black=joining;}else{room.red=joining;room.black=existing;}
    room.deadline=now+60000;room.rev++;lobby.entries=lobby.entries.filter(e=>e.id!==room.id);
   }
   else {room={id:crypto.randomBytes(16).toString('hex'),red:profile(fresh),black:null,ownerUid:fresh.uid,seatPreference:event.action==='create'?(event.seatPreference||'rotate'):'random',round:0,state:G.newGame(undefined,variant),history:[],deadline:0,rev:0,pauseUsed:{},createdAt:now,match:event.action==='match',queueHeartbeatAt:now};if(event.action==='match'){if(lobby.entries.length>=100)throw Error('匹配繁忙，请稍后重试');lobby.entries.push({id:room.id,at:now});}}
   await roomCollection.doc(room.id).set({data:room});await ur.update({data:{activeRoom:room.id}});await lobbyRef.set({data:lobby});return {ok:true,...S.publicRoom(room,uid,now)};
  }
  if(!/^[a-f0-9]{32}$/.test(event.roomId||''))throw Error('房间链接无效');const ref=roomCollection.doc(event.roomId),room=await optional(ref);if(!room)throw Error('房间不存在');
  if(event.action==='leave'){
   const side=room.red&&room.red.uid===uid?'red':room.black&&room.black.uid===uid?'black':null;
   if(!side)throw Error('你不在这个房间');
   if(room.state.status==='ended'){
    room[side]=null;room.rev++;await ref.set({data:room});await ur.update({data:{activeRoom:null}});return {ok:true,left:true};
   }
   throw Error('对局进行中不能离开房间');
  }
  const beforeRev=room.rev;S.reduce(room,uid,event,now);if(event.action==='poll'&&room.rev===beforeRev){
   if(!room.black&&room.match&&now-(room.queueHeartbeatAt||room.createdAt||0)>=15000){room.queueHeartbeatAt=now;const lr=tx.collection('chess_lobby').doc('queue'),lobby=await optional(lr)||{entries:[]},entry=lobby.entries.find(e=>e.id===room.id);if(entry)entry.at=now;await lr.set({data:lobby});await ref.set({data:room});}
   return {ok:true,...S.publicRoom(room,uid,now)};
  }if(!room.black&&room.match&&event.action==='poll'){const lr=tx.collection('chess_lobby').doc('queue'),lobby=await optional(lr)||{entries:[]};const entry=lobby.entries.find(e=>e.id===room.id);if(entry){entry.at=now;await lr.set({data:lobby});}else if(lobby.entries.length<100){lobby.entries.push({id:room.id,at:now});await lr.set({data:lobby});}}await ref.set({data:room});return {ok:true,...S.publicRoom(room,uid,now)};
 });return result;
 }catch(e){console.error('gameService failed:',e.message);return {ok:false,error:e.message||'服务暂不可用'};}
};
