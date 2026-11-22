const cloud=require('wx-server-sdk'),crypto=require('crypto');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),G=require('./shared/game-engine'),S=require('./service');
const QUEUE_HEARTBEAT_MS=4000,QUEUE_TTL_MS=12000,READY_TIMEOUT_MS=15000;
const uidKey=id=>crypto.createHash('sha256').update(id).digest('hex');
const profile=p=>({uid:p.uid,nickname:p.nickname,avatar:p.avatar});
async function optional(ref){try{const data=(await ref.get()).data;if(data)delete data._id;return data;}catch(e){if(/not exist|not found|不存在/i.test(e.message))return null;throw e;}}
function liveEntries(lobby,now){return lobby.entries.filter(entry=>now-entry.at<QUEUE_TTL_MS);}
const validRoomId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const simulationRef=(rooms,id)=>rooms.doc(uidKey('simulation:'+id));
const simulatedPlayerKey=nickname=>uidKey('simulated-player:'+nickname);
const totals=(user,variant)=>user?.matchStats?.[variant]||{games:0,wins:0};

async function addMatchResults(tx,variant,players){
 const users=tx.collection('chess_users');
 const refs=players.map(player=>users.doc(player.key));
 const records=await Promise.all(refs.map(optional));
 for(let i=0;i<players.length;i++){
  const record=records[i],player=players[i];
  if(!record&&!player.simulated)continue;
  const {games,wins}=totals(record,variant);
  const matchStats={...record?.matchStats,[variant]:{games:games+1,wins:wins+(player.won?1:0)}};
  if(record)await refs[i].update({data:{matchStats}});
  else await refs[i].set({data:{matchStats}});
 }
}

async function recordRoomResult(tx,room,previousStatus){
 const {state,red,black}=room;
 if(previousStatus!=='playing'||state.status!=='ended'||state.reason==='not-ready'||!red||!black||red.uid===black.uid)return;
 await addMatchResults(tx,state.variant||'dark',[
  {key:uidKey(red.uid),won:state.winner==='red'},
  {key:uidKey(black.uid),won:state.winner==='black'},
 ]);
}

async function playerStats(rooms,users,uid,event){
 if(!['red','black'].includes(event.side))throw Error('请选择玩家');
 let key,nickname,variant;
 if(validRoomId(event.simulationId)){
  const simulation=await optional(simulationRef(rooms,event.simulationId));
  if(!simulation||simulation.uid!==uid)throw Error('未找到拟真人对局');
  variant=simulation.variant;
  if(event.side==='red')key=uidKey(uid);
  else{nickname=simulation.nickname;key=simulatedPlayerKey(nickname);}
 }else{
  if(!validRoomId(event.roomId))throw Error('房间链接无效');
  const room=await optional(rooms.doc(event.roomId));
  if(!room||!S.sideOf(room,uid)||!room[event.side])throw Error('你不在这个房间');
  const player=room[event.side];
  if(event.avatar!==player.avatar||event.nickname!==player.nickname)throw Error('玩家信息已更新，请重试');
  variant=room.state.variant||'dark';nickname=player.nickname;key=uidKey(player.uid);
 }
 const user=await optional(users.doc(key));
 const {games,wins}=totals(user,variant);
 return {ok:true,variant,nickname:nickname||user?.nickname||'玩家',games,wins};
}

async function recordSimulatedResult(uid,event){
 if(!validRoomId(event.simulationId)||!Number.isSafeInteger(event.round)||event.round<1||![null,'red','black'].includes(event.winner))throw Error('拟真人对局结果无效');
 return db.runTransaction(async tx=>{
  const ref=simulationRef(tx.collection('chess_rooms'),event.simulationId),simulation=await optional(ref);
  if(!simulation||simulation.uid!==uid)throw Error('未找到拟真人对局');
  if(event.round<=simulation.rounds)return {ok:true};
  if(event.round!==simulation.rounds+1)throw Error('请先同步上一局战绩');
  await addMatchResults(tx,simulation.variant,[
   {key:uidKey(uid),won:event.winner==='red'},
   {key:simulatedPlayerKey(simulation.nickname),won:event.winner==='black',simulated:true},
  ]);
  await ref.update({data:{rounds:event.round}});
  return {ok:true};
 });
}

function avatarFormat(bytes) {
 if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 384 * 1024) return '';
 if (bytes.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'png';
 if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
 const header = bytes.toString('ascii', 0, 12);
 if (header.startsWith('RIFF') && header.slice(8) === 'WEBP') return 'webp';
 if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'gif';
 return '';
}

async function roomAvatar(rooms, uid, env, roomId, fileID) {
 if (typeof roomId !== 'string' || !/^[a-f0-9]{32}$/.test(roomId)) throw Error('房间链接无效');
 const room = await optional(rooms.doc(roomId));
 if (!room || !S.sideOf(room, uid)) throw Error('你不在这个房间');

 // Accept only an avatar from this room, in the upload directory of this environment.
 const source = typeof fileID === 'string' && /^cloud:\/\/([\w.-]+)\/avatars\/[\w.-]+$/.exec(fileID);
 if (!source || (env && source[1] !== env && !source[1].startsWith(env + '.')) ||
     ![room.red, room.black].some(player => player && player.avatar === fileID)) {
  throw Error('头像不属于当前对局');
 }
 const { fileContent } = await cloud.downloadFile({ fileID });
 const format = avatarFormat(fileContent);
 if (!format) throw Error('头像格式不受支持');
 return { ok: true, format, base64: fileContent.toString('base64') };
}

exports.main=async event=>{
 try{
 const variant=event.variant||'dark';if(['create','match'].includes(event.action)&&!['dark','classic','jieqi','fusion'].includes(variant))throw Error('未知玩法');
 const {OPENID:uid,ENV:env}=cloud.getWXContext();if(!uid)throw Error('请在微信中登录');const rooms=db.collection('chess_rooms');
 if(event.action==='roomAvatar')return await roomAvatar(rooms,uid,env,event.roomId,event.fileID);
 const key=uidKey(uid),users=db.collection('chess_users');
 if(event.action==='playerStats')return await playerStats(rooms,users,uid,event);
 if(event.action==='recordSimulatedResult')return await recordSimulatedResult(uid,event);
 // Polls are by far the hottest online path.  A paired room that is still
 // inside its current deadline has no state to mutate, so avoid opening a
 // transaction (and the extra user read) just to return the same snapshot.
 // Mutating polls (timeout/expired request) and waiting-room heartbeats keep
 // using the transactional path below so their revisions remain authoritative.
 if(event.action==='poll'&&/^[a-f0-9]{32}$/.test(event.roomId||'')){
  const room=await optional(rooms.doc(event.roomId)),now=Date.now();
  if(!room)throw Error('房间不存在');
  const beforeRev=room.rev;S.expire(room,now);
  if(room.rev===beforeRev&&!room.starting&&(room.black||room.state.status==='ended'))return {ok:true,...S.publicRoom(room,uid,now)};
 }
 if(event.action==='profile'){
  const nickname=String(event.nickname||'').trim(),avatar=String(event.avatar||'');if(!nickname||nickname.length>24||!avatar.startsWith('cloud://'))throw Error('请填写昵称并选择头像');
  // Identity comes only from WX context, never from a caller-supplied openid.
  await db.runTransaction(async tx=>{const ref=tx.collection('chess_users').doc(key),old=await optional(ref);await ref.set({data:{...old,uid,nickname,avatar,activeRoom:old&&old.activeRoom||null}});});return {ok:true};
 }
 const me=await optional(users.doc(key));if(!me)throw Error('请先设置头像昵称');
 const result=await db.runTransaction(async tx=>{
  const now=Date.now(),ur=tx.collection('chess_users').doc(key),fresh=await optional(ur);if(!fresh)throw Error('请先登录');
  const roomCollection=tx.collection('chess_rooms');
  if(['create','match','join','cancel'].includes(event.action)){
   const lobbyRef=tx.collection('chess_lobby').doc('queue'),lobby=await optional(lobbyRef)||{entries:[]};lobby.entries=liveEntries(lobby,now);
   let simulated;
   if(fresh.activeRoom){
    const activeRef=roomCollection.doc(fresh.activeRoom),active=await optional(activeRef);
    if(event.action==='cancel'&&event.roomId&&event.roomId!==fresh.activeRoom){
     // A retry for an old queue entry must not cancel the current room.
     if(active&&active.red&&active.black&&active.state.status==='playing'){
      S.expire(active,now);await recordRoomResult(tx,active,'playing');
      await activeRef.set({data:active});return {ok:true,...S.publicRoom(active,uid,now)};
     }
     return {ok:true,cancelled:true};
    }
    if(active){
     // Settle timeout before deciding whether this account is still occupied.
     const previousStatus=active.state.status;
     S.expire(active,now);await recordRoomResult(tx,active,previousStatus);
     if(active.state.status==='playing'){
      const reuseWaiting=event.action==='join'?event.roomId===active.id:
       event.action!=='cancel'&&(active.state.variant||'dark')===variant&&!!active.match===(event.action==='match')&&
       (!active.match||lobby.entries.some(entry=>entry.id===active.id));
      if(active.black||reuseWaiting){
       // Resume a real game, including its server-side variant, rather than lock the user out.
       await activeRef.set({data:active});return {ok:true,...S.publicRoom(active,uid,now)};
      }
      if(event.action==='cancel'&&event.simulate===true&&active.match&&active.id===event.roomId){
       const {nickname}=require('./shared/fake-opponents').pick();
       await simulationRef(roomCollection,active.id).set({data:{uid,nickname,variant:active.state.variant||'dark',rounds:0}});
       simulated={id:active.id,nickname};
      }
      // Switching an unpaired room is safe; remove its queue entry in the same transaction.
      await activeRef.remove();
     }else await activeRef.set({data:active});
    }
    lobby.entries=lobby.entries.filter(e=>e.id!==fresh.activeRoom);
    await ur.update({data:{activeRoom:null}});
   }
   if(event.action==='cancel'){
    if(!simulated&&event.simulate===true&&validRoomId(event.roomId)){
     const prior=await optional(simulationRef(roomCollection,event.roomId));
     if(prior&&prior.uid===uid)simulated={id:event.roomId,nickname:prior.nickname};
    }
    await lobbyRef.set({data:lobby});return {ok:true,cancelled:true,...(simulated?{simulated}:{})};
   }
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
    room.deadline=0;room.rev++;
    room.starting={rev:room.rev,until:now+READY_TIMEOUT_MS,red:null,black:null};
    lobby.entries=lobby.entries.filter(e=>e.id!==room.id);
   }
   else {room={id:crypto.randomBytes(16).toString('hex'),red:profile(fresh),black:null,ownerUid:fresh.uid,seatPreference:event.action==='create'?(event.seatPreference||'rotate'):'random',round:0,state:G.newGame(undefined,variant),history:[],deadline:0,rev:0,pauseUsed:{},createdAt:now,match:event.action==='match',queueHeartbeatAt:now};if(event.action==='match'){if(lobby.entries.length>=100)throw Error('匹配繁忙，请稍后重试');lobby.entries.push({id:room.id,at:now});}}
   await roomCollection.doc(room.id).set({data:room});await ur.update({data:{activeRoom:room.id}});await lobbyRef.set({data:lobby});return {ok:true,...S.publicRoom(room,uid,now)};
  }
  if(!/^[a-f0-9]{32}$/.test(event.roomId||''))throw Error('房间链接无效');const ref=roomCollection.doc(event.roomId),room=await optional(ref);if(!room)throw Error('房间不存在');
  if(event.action==='leave'){
   const side=room.red&&room.red.uid===uid?'red':room.black&&room.black.uid===uid?'black':null;
   if(!side)throw Error('你不在这个房间');
   if(room.state.status==='ended'){
    room[side]=null;room.pending=null;room.rev++;
    await ref.set({data:room});
    if(fresh.activeRoom===room.id)await ur.update({data:{activeRoom:null}});
    return {ok:true,left:true};
   }
   throw Error('对局进行中不能离开房间');
  }
  const beforeRev=room.rev,previousStatus=room.state.status;
  S.reduce(room,uid,event,now);
  await recordRoomResult(tx,room,previousStatus);
  let writeRoom=event.action!=='poll'||room.rev!==beforeRev;
  if(event.action==='poll'&&room.match&&!room.black&&room.state.status==='playing'){
   const age=now-(room.queueHeartbeatAt||room.createdAt||0);
   if(age>=QUEUE_TTL_MS)return {ok:true,...S.publicRoom(room,uid,now),queueExpired:true};
   if(age>=QUEUE_HEARTBEAT_MS){
    const lr=tx.collection('chess_lobby').doc('queue'),lobby=await optional(lr)||{entries:[]};
    lobby.entries=liveEntries(lobby,now);
    const entry=lobby.entries.find(value=>value.id===room.id);
    if(entry)entry.at=now;
    else{
     if(lobby.entries.length>=100)return {ok:true,...S.publicRoom(room,uid,now),queueExpired:true};
     lobby.entries.push({id:room.id,at:now});
    }
    room.queueHeartbeatAt=now;writeRoom=true;
    await lr.set({data:lobby});
   }
  }
  if(writeRoom)await ref.set({data:room});
  return {ok:true,...S.publicRoom(room,uid,now)};
 });return result;
 }catch(e){console.error('gameService failed:',e.message);return {ok:false,error:e.message||'服务暂不可用'};}
};
