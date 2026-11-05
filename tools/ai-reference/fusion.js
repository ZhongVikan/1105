// 合棋 V1.1: pure state transitions shared by client, AI and cloud.
const R=require('./rules-core'),C=require('./coordinates');
const names={rider:'骑',gunner:'铳',formation:'阵',xiao:'骁',bombard:'轰',guard_king:'御',mounted_king:'驭',chariot_king:'巡'};
const pairs={'horse+pawn':'rider','cannon+pawn':'gunner','elephant+pawn':'formation','horse+rook':'xiao','cannon+rook':'bombard','advisor+general':'guard_king','general+horse':'mounted_king','general+rook':'chariot_king'};
const at=(ps,t)=>ps.find(p=>p.x===t.x&&p.y===t.y),home=(s,y)=>s==='red'?y>=5:y<=4;
function between(ps,p,t){if(p.x!==t.x&&p.y!==t.y)return [];return ps.filter(q=>p.x===t.x?q.x===p.x&&q.y>Math.min(p.y,t.y)&&q.y<Math.max(p.y,t.y):q.y===p.y&&q.x>Math.min(p.x,t.x)&&q.x<Math.max(p.x,t.x));}
function combination(a,b){return a&&b&&a.id!==b.id&&a.side===b.side&&!a.fusionType&&!b.fusionType?pairs[[a.kind,b.kind].sort().join('+')]:null;}
function reach(ps,p,t,attack=false){
 if(!C.valid(t))return false;const dx=t.x-p.x,dy=t.y-p.y,ax=Math.abs(dx),ay=Math.abs(dy),target=at(ps,t),f=p.fusionType;
 if(!ax&&!ay)return false;if(target&&target.side===p.side)return false;
 if(f==='mounted_king'){if(attack||target||!home(p.side,t.y))return false;}
 if(f==='chariot_king'){if(attack||target)return false;}
 if(f==='guard_king')return Math.max(ax,ay)===1&&t.x>=3&&t.x<=5&&(p.side==='red'?t.y>=7:t.y<=2);
 if(f==='rider')return ax*ay===2;
 if(f==='formation')return ax===2&&ay===2&&!at(ps,{x:p.x+dx/2,y:p.y+dy/2});
 if(f==='xiao'||f==='mounted_king')return ax===2&&ay===1&&!at(ps,{x:p.x+dx/2,y:p.y})||ax===1&&ay===2&&!at(ps,{x:p.x,y:p.y+dy/2});
 if(f==='chariot_king')return (!dx||!dy)&&between(ps,p,t).length===0;
 if(f==='gunner'&&target&&ax+ay===1)return true;
 return R.canReach(ps,{...p,variant:'classic',kind:f==='gunner'||f==='bombard'?'cannon':p.kind},t,p.side);
}
function checked(ps,side){const k=ps.find(p=>p.kind==='general'&&p.side===side);if(!k)return true;
 return ps.some(p=>{if(p.side===side)return false;if(p.kind==='general'&&p.x===k.x&&!between(ps,p,k).length)return true;if(reach(ps,p,k,true))return true;
 return p.fusionType==='bombard'&&ps.some(t=>t.side===side&&t.id!==k.id&&reach(ps,p,t,true)&&between(ps,p,t).some(q=>q.id===k.id));});
}
function source(p){return p.sourcePieces||[{...p}];}
function attempt(s,id,to){const ps=s.pieces,p=ps.find(q=>q.id===id);if(!p||p.side!==s.turn||!C.valid(to)||s.pendingChase&&s.pendingChase!==id)return null;
 const t=at(ps,to),f=combination(p,t);let removed=[],moving={...p,...to};
 if(t&&t.side===p.side){if(!f||s.pendingChase)return null;
 const fake=ps.map(q=>q.id===t.id?{...q,side:R.opposite(p.side)}:q);if(!reach(fake,p,to))return null;
 const king=p.kind==='general'?p:t.kind==='general'?t:null;
 moving={...moving,kind:king?'general':p.kind,text:king?king.text:names[f],general:!!king,fusionType:f,sourcePieces:[...source(p),...source(t)]};removed=[t];
 }else{if(!reach(ps,p,to)||t&&t.kind==='general')return null;if(t)removed=[t];
 if(t&&p.fusionType==='bombard'){const screen=between(ps,p,to)[0];if(screen&&screen.side!==p.side){if(screen.kind==='general')return null;removed.push(screen);}}
 if(p.fusionType==='chariot_king'){let x=p.x,y=p.y;while(x!==to.x||y!==to.y){x+=Math.sign(to.x-p.x);y+=Math.sign(to.y-p.y);if(checked(ps.map(q=>q.id===id?{...q,x,y}:q),p.side))return null;}}
 }
 const pieces=ps.filter(q=>!removed.some(r=>r.id===q.id)).map(q=>q.id===id?moving:q);if(checked(pieces,s.turn))return null;
 return {pieces,removed,fusion:f||null,p,moving};
}
function targets(p){const f=p.fusionType,k=f==='chariot_king'?'rook':f==='guard_king'?'guard':f==='mounted_king'||f==='rider'||f==='xiao'?'horse':f==='formation'?'elephant':f==='gunner'||f==='bombard'?'cannon':p.kind,out=[],add=(x,y)=>{if(x>=0&&x<9&&y>=0&&y<10)out.push({x,y});};
 if(k==='rook'||k==='cannon'){for(let x=0;x<9;x++)if(x!==p.x)add(x,p.y);for(let y=0;y<10;y++)if(y!==p.y)add(p.x,y);}
 else if(k==='horse'){for(const [x,y] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])add(p.x+x,p.y+y);}
 else if(k==='elephant'||k==='advisor'){const d=k==='elephant'?2:1;for(const x of [-d,d])for(const y of [-d,d])add(p.x+x,p.y+y);}
 else if(k==='pawn'){add(p.x,p.y+(p.side==='red'?-1:1));if(p.side==='red'?p.y<=4:p.y>=5){add(p.x-1,p.y);add(p.x+1,p.y);}}
 else {for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if((x||y)&&(k==='guard'||Math.abs(x)+Math.abs(y)===1))add(p.x+x,p.y+y);}return out;
}
function actions(s,firstOnly=false,capturesOnly=false){if(s.status!=='playing')return [];const result=[];for(const p of s.pieces){if(p.side!==s.turn||s.pendingChase&&p.id!==s.pendingChase)continue;for(const to of targets(p)){if(capturesOnly&&!s.pieces.some(t=>t.side!==s.turn&&t.x===to.x&&t.y===to.y))continue;if(attempt(s,p.id,to)){result.push({id:p.id,to});if(firstOnly)return result;}}}if(s.pendingChase&&!capturesOnly)result.push({id:s.pendingChase,to:null});return result;}
function key(s){return JSON.stringify([s.turn,s.fusionUsed,s.pieces.map(p=>[p.side,p.fusionType||p.kind,p.x,p.y]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);}
function complete(s,actor,event,adjudicate){const n={...s,turn:R.opposite(actor),pendingChase:null,ply:s.ply+1};const check=checked(n.pieces,n.turn);n.recentMoves=[...(s.recentMoves||[]),{actor,check,ply:n.ply}].slice(-12);
 if(adjudicate){if(!actions(n,true).length)return {ok:true,state:{...n,status:'ended',winner:actor,reason:check?'checkmate':'stalemate',motif:check?'将死':'困毙'},event:check?'checkmate':'stalemate'};
 const entry={key:key(n),actor,check};n.repetition=[...((s.noProgress===0||s.lastMove&&s.lastMove.fusionType)?[]:(s.repetition||[])),entry];const matches=n.repetition.map((r,i)=>r.key===entry.key?i:-1).filter(i=>i>=0);
 if(matches.length>=3){const cycle=n.repetition.slice(matches[matches.length-3]+1);const offenders=['red','black'].filter(side=>{const turns=cycle.filter(r=>r.actor===side);return turns.length&&turns.every(r=>r.check);});return {ok:true,state:{...n,status:'ended',winner:offenders.length===1?R.opposite(offenders[0]):null,reason:offenders.length===1?'perpetual-check':'repetition',motif:offenders.length===1?'长将判负':'三次重复和棋'},event:'end'};}
 if(n.noProgress>=120)return {ok:true,state:{...n,status:'ended',winner:null,reason:'no-progress',motif:'无进展和棋'},event:'end'};
 }
 return {ok:true,state:n,event:check?'check':event};}
function move(s,id,to,adjudicate=true){if(s.status!=='playing')return {ok:false,message:'对局已结束'};
 if(to===null&&s.pendingChase===id){const p=s.pieces.find(p=>p.id===id);return complete({...s,lastMove:{id,actor:s.turn,from:{x:p.x,y:p.y},to:{x:p.x,y:p.y},firstHop:s.lastMove,chase:true}},s.turn,'move',adjudicate);}
 const a=attempt(s,id,to);if(!a)return {ok:false,message:'这一步不合法'};
 const captured=a.fusion?[]:a.removed.flatMap(source).map(p=>({...p,hidden:false,capturedBy:s.turn,atPly:s.ply+1}));
 const n={...s,pieces:a.pieces,captured:[...s.captured,...captured],fusionUsed:{...(s.fusionUsed||{red:0,black:0})},lastMove:{id,from:{x:a.p.x,y:a.p.y},to:{...to},actor:s.turn,revealed:false,capturedId:captured.length?a.removed[0].id:null,capturedIds:a.fusion?[]:a.removed.map(p=>p.id),fusionType:a.fusion,sourcePieces:a.fusion?[a.p,...a.removed]:null,chase:!!s.pendingChase},noProgress:captured.length||a.p.kind==='pawn'&&a.p.y!==to.y?0:(s.noProgress||0)+(s.pendingChase?0:1)};
 if(a.fusion)n.fusionUsed[s.turn]++;
 if(a.p.fusionType==='xiao'&&captured.length&&!s.pendingChase){n.pendingChase=id;return {ok:true,state:n,event:'chase'};}
 if(s.pendingChase)n.lastMove.firstHop=s.lastMove;
 return complete(n,s.turn,a.fusion?'fusion':captured.length?'capture':'move',adjudicate);
}
function initialize(s){s.fusionUsed={red:0,black:0};s.noProgress=0;s.pendingChase=null;s.repetition=[{key:key(s),actor:null,check:false}];return s;}
module.exports={names,combination,reach,checked,attempt,actions,move,initialize,key};
