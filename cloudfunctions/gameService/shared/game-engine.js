const C=require('./coordinates'),R=require('./rules-core');
function attackers(pieces,side){
 const king=pieces.find(p=>p.kind==='general'&&p.side===side);if(!king)return [];
 return pieces.filter(p=>{const actor=R.controller(p);if(actor===side)return false;
  if(!p.hidden&&p.kind==='general'&&p.x===king.x&&!pieces.some(q=>q.x===p.x&&q.y>Math.min(p.y,king.y)&&q.y<Math.max(p.y,king.y)))return true;
  return R.canReach(pieces,p,king,actor);
 });
}
const checked=(pieces,side)=>pieces.some(p=>p.variant==='fusion')?require('./fusion').checked(pieces,side):attackers(pieces,side).length>0;
function legalAttempt(pieces,id,to,actor){
 if(pieces.some(p=>p.variant==='fusion'))return !!require('./fusion').attempt({pieces,turn:actor,fusionUsed:{red:0,black:0}},id,to);
 const p=pieces.find(q=>q.id===id);if(!p||!C.valid(to)||R.controller(p)!==actor)return false;
 const target=pieces.find(q=>q.x===to.x&&q.y===to.y);
 if(target&&!target.hidden&&target.kind==='general')return false;
 if(!R.canReach(pieces,p,to,actor))return false;
 // Validate using public information only. Never reject based on a secret identity.
 const preview=pieces.filter(q=>q.id===id||q.x!==to.x||q.y!==to.y).map(q=>q.id===id?{...q,...to,hidden:false,side:actor,kind:p.hidden?R.openingRole(p):p.kind}:q);
 return !checked(preview,actor);
}
function hasAttempt(pieces,actor){for(const p of pieces){if(R.controller(p)!==actor)continue;for(let y=0;y<10;y++)for(let x=0;x<9;x++)if(legalAttempt(pieces,p.id,{x,y},actor))return true;}return false;}
function newGame(random,variant='dark'){const state={version:2,variant,pieces:R.initialLayout(variant,random),turn:'red',status:'playing',winner:null,reason:null,motif:null,ply:0,captured:[],lastMove:null};return variant==='fusion'?require('./fusion').initialize(state):state;}
function validate(s){
 if(!s||s.version!==2||!['red','black'].includes(s.turn)||!['playing','ended'].includes(s.status)||!Array.isArray(s.captured)||!Number.isInteger(s.ply)||s.ply<0)throw new Error('无效存档');
 if(!['dark','classic','jieqi','fusion'].includes(s.variant||'dark'))throw Error('未知玩法');
 for(const p of s.pieces){if((p.variant||'dark')!==(s.variant||'dark'))throw Error('棋子玩法不一致');if(['classic','fusion'].includes(s.variant)&&p.hidden)throw Error('经典模式没有暗子');if(s.variant==='jieqi'&&p.hidden&&R.controller(p)!==p.side)throw Error('揭棋阵营异常');}
 if(s.variant==='fusion'){const F=require('./fusion');if(!s.fusionUsed||['red','black'].some(side=>!Number.isInteger(s.fusionUsed[side])||s.fusionUsed[side]<0))throw Error('合棋次数异常');for(const p of s.pieces)if(p.fusionType&&(!F.names[p.fusionType]||!p.sourcePieces||p.sourcePieces.length!==2||p.sourcePieces.some(q=>q.side!==p.side||q.fusionType)||F.combination(p.sourcePieces[0],p.sourcePieces[1])!==p.fusionType))throw Error('合棋来源异常');if(s.pendingChase&&!s.pieces.some(p=>p.id===s.pendingChase&&p.side===s.turn&&p.fusionType==='xiao'))throw Error('追击状态异常');}
 C.validatePieces(s.pieces);
 for(const side of ['red','black'])if(s.pieces.filter(p=>p.kind==='general'&&p.side===side&&!p.hidden).length!==1)throw new Error('将帅数据异常');
 for(const p of s.pieces){if(!['rook','horse','elephant','advisor','general','cannon','pawn'].includes(p.kind))throw new Error('棋种异常');if(p.hidden&&(!R.openingRole(p)||p.kind==='general'))throw new Error('暗子位置异常');}return true;
}
function classify(pieces,loser,context){return require('./motifs').detect(pieces,loser,attackers(pieces,loser),context);}
function move(s,id,to){
 if(s.variant==='fusion'){validate(s);return require('./fusion').move(s,id,to);}
 validate(s);if(s.status!=='playing')return {ok:false,message:'对局已结束'};
 const actor=s.turn,p=s.pieces.find(q=>q.id===id);
 if(!legalAttempt(s.pieces,id,to,actor))return {ok:false,message:checked(s.pieces,actor)?'正在被将军，请先应将':'这一步不合法'};
 const target=s.pieces.find(q=>q.x===to.x&&q.y===to.y);
 const pieces=s.pieces.filter(q=>q.id===id||q.x!==to.x||q.y!==to.y).map(q=>q.id===id?{...q,...to,hidden:false}:q);
 const next={...s,pieces,turn:R.opposite(actor),ply:s.ply+1,captured:target?[...s.captured,{...target,hidden:false,capturedBy:actor,atPly:s.ply+1}]:s.captured.slice(),lastMove:{id,from:{x:p.x,y:p.y},to:{...to},actor,revealed:p.hidden,capturedId:target?target.id:null}};
 if(p.hidden&&p.side!==actor&&checked(pieces,actor))return {ok:true,state:{...next,status:'ended',winner:R.opposite(actor),reason:'unlucky',motif:'神之一手'},event:'unlucky'};
 const check=checked(pieces,next.turn);next.recentMoves=[...(s.recentMoves||[]),{id,actor,ply:next.ply,check}].slice(-8);
 if(!hasAttempt(pieces,next.turn))return {ok:true,state:{...next,status:'ended',winner:actor,reason:check?'checkmate':'stalemate',motif:check?classify(pieces,next.turn,{captured:target,last:next.lastMove,recent:s.recentMoves,ply:next.ply}):'困毙'},event:check?'checkmate':'stalemate'};
 return {ok:true,state:next,event:check?'check':target?'capture':p.hidden?'reveal':'move'};
}
function finish(s,reason){if(s.status!=='playing')return s;if(!['resign','draw'].includes(reason))throw new Error('Unknown result');return {...s,status:'ended',reason,winner:reason==='draw'?null:R.opposite(s.turn),motif:reason==='draw'?'和棋':'认输'};}
const displayPieces=pieces=>pieces.map(p=>p.hidden?{id:p.id,x:p.x,y:p.y,side:p.variant==='jieqi'?R.controller(p):'red',text:'',hidden:true,...(p.variant?{variant:p.variant}:{})}:{...p});
module.exports={attackers,checked,legalAttempt,hasAttempt,newGame,validate,classify,move,finish,displayPieces};
