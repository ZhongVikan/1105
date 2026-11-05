const Difficulty=require('./ai-difficulty');
const G=require('./game-engine'),R=require('./rules-core'),Repetition=require('./repetition');
const VALUE={general:20000,rook:900,cannon:450,horse:420,elephant:200,advisor:180,pawn:100};
// Never read secret identities. Simulated reveals are public role hypotheses.
function publicBoard(pieces){return pieces.map(p=>p.hidden?{id:p.id,x:p.x,y:p.y,hidden:true,side:R.controller(p),kind:R.openingRole(p),...(p.variant?{variant:p.variant}:{})}:{...p});}
function candidateTargets(p,kind,side){
 const out=[],push=(x,y)=>{if(x>=0&&x<9&&y>=0&&y<10)out.push({x,y});};
 if(kind==='rook'||kind==='cannon'){
  for(let x=0;x<9;x++)if(x!==p.x)push(x,p.y);
  for(let y=0;y<10;y++)if(y!==p.y)push(p.x,y);
 }else if(kind==='horse'){
  for(const [dx,dy] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])push(p.x+dx,p.y+dy);
 }else if(kind==='elephant'){
  for(const [dx,dy] of [[2,2],[2,-2],[-2,2],[-2,-2]])push(p.x+dx,p.y+dy);
 }else if(kind==='advisor'){
  for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]])push(p.x+dx,p.y+dy);
 }else if(kind==='pawn'){
  const forward=side==='red'?-1:1;push(p.x,p.y+forward);
  const crossed=side==='red'?p.y<=4:p.y>=5;if(crossed){push(p.x-1,p.y);push(p.x+1,p.y);}
 }else if(kind==='general'){
  push(p.x+1,p.y);push(p.x-1,p.y);push(p.x,p.y+1);push(p.x,p.y-1);
 }
 return out;
}
function moves(board,side){const out=[];for(const p of board){if(R.controller(p)!==side)continue;const k=p.hidden?R.openingRole(p):p.kind;if(!k)continue;for(const to of candidateTargets(p,k,side))if(G.legalAttempt(board,p.id,to,side))out.push({id:p.id,to});}return out;}
function movesCaptures(board,side){const out=[];for(const p of board){if(R.controller(p)!==side)continue;for(const to of candidateTargets(p,p.hidden?R.openingRole(p):p.kind,side)){if(board.some(t=>t.id!==p.id&&t.x===to.x&&t.y===to.y)&&G.legalAttempt(board,p.id,to,side))out.push({id:p.id,to});}}return out;}
function apply(board,m,side){return board.filter(p=>p.id===m.id||p.x!==m.to.x||p.y!==m.to.y).map(p=>p.id===m.id?{...p,...m.to,hidden:false,uncertain:p.hidden||p.uncertain,kind:p.hidden?R.openingRole(p):p.kind,side}:p);}
const worth=p=>p.hidden||p.uncertain?180:VALUE[p.kind];
// Hidden identities are never inspected. `uncertain` only means a simulated piece has
// been activated; rewarding that state gives the AI a reason to develop dark pieces.
function score(board,side){let n=0;for(const p of board){const owner=R.controller(p),advance=owner==='red'?9-p.y:p.y;let v=worth(p);if(p.uncertain)v+=42+Math.min(advance,5)*4+(4-Math.abs(p.x-4))*3;if(!p.hidden&&!p.uncertain){if(p.kind==='pawn')v+=advance*12+(advance>=5?40:0);if(['horse','cannon','rook'].includes(p.kind))v+=(4-Math.abs(p.x-4))*5+Math.min(advance,5)*3;}n+=owner===side?v:-v;}return n;}
function movePriority(board,m,preferred){const p=board.find(p=>p.id===m.id),target=board.find(q=>q.x===m.to.x&&q.y===m.to.y);let v=(preferred&&preferred.id===m.id&&preferred.to.x===m.to.x&&preferred.to.y===m.to.y?100000:0);if(target)v+=worth(target)*10-worth(p);if(p&&p.hidden)v+=220;const owner=p?R.controller(p):null;if(owner){const before=owner==='red'?9-p.y:p.y,after=owner==='red'?9-m.to.y:m.to.y;v+=(after-before)*12+(4-Math.abs(m.to.x-4))*2;}return v;}
function ordered(board,list,preferred){return list.map(m=>({m,priority:movePriority(board,m,preferred)})).sort((a,b)=>b.priority-a.priority).map(v=>v.m);}
function rootBonus(board,m){const p=board.find(p=>p.id===m.id),target=board.find(q=>q.x===m.to.x&&q.y===m.to.y);let v=0;if(p&&p.hidden)v+=70;return v;}
// Avoid a repetitive dark-game opening where the cannon immediately captures the
// opponent's hidden horse. Favor developing horses and pawns in the uncertain opening.
function openingBonus(board,m,historyLength){
 if(historyLength>4||board.length<28)return 0;
 const p=board.find(q=>q.id===m.id),target=board.find(q=>q.x===m.to.x&&q.y===m.to.y);if(!p)return 0;
 const kind=p.hidden?R.openingRole(p):p.kind;
 if(kind==='cannon'){if(target)return target.hidden?-900:-650;const advance=p.side==='red'?p.y-m.to.y:m.to.y-p.y;return -55-Math.max(0,advance-2)*12;}
 if(kind==='horse')return 95;if(kind==='pawn')return 55;if(kind==='elephant'||kind==='advisor')return 18;return 0;
}

// Complete each iterative depth; use alpha-beta and bounded capture extensions.
async function choose(pieces,side,level='normal',options={}){
 const cancel=options.cancel||(()=>false),random=options.random||Math.random,yieldFrame=options.yieldFrame||(()=>new Promise(r=>setTimeout(r,12)));
 if(cancel())return null;
 const board=publicBoard(pieces);let list=moves(board,side).filter(m=>!options.allowMove||options.allowMove(m));
 // Give the full-information opening a small pool of distinct plans. The old
 // priority order rewarded the legal cannon capture of the horse so strongly
 // that every classic game began with the same exchange.
 const classicOpening=!options.history?.length&&board.length===32&&board.some(p=>!p.hidden&&p.kind==='horse');
 if(classicOpening){const quiet=list.filter(m=>{const p=board.find(p=>p.id===m.id),target=board.find(q=>q.x===m.to.x&&q.y===m.to.y);return !(p&&p.kind==='cannon'&&target&&target.kind==='horse');});if(quiet.length>=4)list=quiet;}
 if(!list.length)return null;
 const hiddenCount=board.reduce((n,p)=>n+(p.hidden?1:0),0),rootCount=list.length;
 // Keep phone CPU bursts short. Complex dark/jieqi openings get a smaller budget because
 // their branching factor is much larger; the visible 2s thinking delay is handled by controller.
 const effective=Difficulty.effectiveLevel(level),base=Difficulty.profile(effective);
 const complexity=Math.max(0,rootCount-28)+Math.floor(hiddenCount/5);
 const timeBudget=Math.max(effective==='hard'?175:effective==='easy'?40:95,base.ms-complexity*2);
 const nodeLimit=Math.max(effective==='hard'?760:effective==='easy'?80:320,base.nodes-complexity*12);
 const started=Date.now(),deadline=started+timeBudget;
 const visits=new Map();for(const state of (options.history||[]).slice(-120)){const k=Repetition.key(state);visits.set(k,(visits.get(k)||0)+1);}
 const penalties=new Map(list.map(m=>{const next=apply(board,m,side),k=Repetition.key({pieces:next,turn:R.opposite(side)});return [m,Math.min(2400,(visits.get(k)||0)*600)];}));
 const moveCache=new Map(),evalCache=new Map(),tt=new Map(),killers=new Map(),historyOrder=new Map();
 const stateKey=(b,actor)=>actor+'|'+b.map(p=>p.id+':'+p.x+','+p.y+':'+p.side+':'+p.kind+':'+!!p.hidden+':'+!!p.uncertain).join(';');
 const cachedMoves=(b,actor)=>{const k=stateKey(b,actor);let v=moveCache.get(k);if(!v){v=moves(b,actor);moveCache.set(k,v);}return v;};
 const cachedScore=(b,actor)=>{const k=stateKey(b,actor);let v=evalCache.get(k);if(v===undefined){v=score(b,actor);evalCache.set(k,v);}return v;};
 const initial=ordered(board,list).map(m=>({m,v:cachedScore(apply(board,m,side),side)+rootBonus(board,m)+openingBonus(board,m,(options.history||[]).length)-penalties.get(m)})).sort((a,b)=>b.v-a.v);let ranked=initial;let nodes=0,lastYield=Date.now(),best=initial[0].m,completed=0,ttHits=0;const STOP={};let cpuMs=0;const cpuBudget=base.cpu;const moveKey=m=>m.id+':'+m.to.x+','+m.to.y;
 const searchOrder=(b,list,preferred,ply)=>list.map(m=>({m,v:movePriority(b,m,preferred)+(killers.get(ply)===moveKey(m)?500:0)+Math.min(400,historyOrder.get(moveKey(m))||0)})).sort((a,b)=>b.v-a.v).map(v=>v.m);
 async function checkpoint(){if(cancel()||Date.now()>=deadline||cpuMs+Date.now()-lastYield>=cpuBudget||nodes>=nodeLimit)throw STOP;nodes++;if(Date.now()-lastYield>=6){cpuMs+=Date.now()-lastYield;await yieldFrame();lastYield=Date.now();if(cancel()||Date.now()>=deadline)throw STOP;}}
 async function search(b,actor,depth,alpha,beta,ply,q){
  await checkpoint();if(ply>=10)return cachedScore(b,actor);if(!b.some(p=>!p.hidden&&p.kind==='general'&&p.side===actor))return -100000+ply;
  const checked=G.checked(b,actor);if(depth<=0&&!checked&&q<=0)return cachedScore(b,actor);const all=depth<=0&&!checked?movesCaptures(b,actor):cachedMoves(b,actor);if(!all.length)return depth<=0&&!checked?cachedScore(b,actor):-100000+ply;let candidates=all;
  const key=stateKey(b,actor)+'|d'+depth+'|q'+q,alpha0=alpha,beta0=beta,hit=tt.get(key);
  if(hit&&hit.depth>=depth){ttHits++;if(hit.flag==='exact')return hit.value;if(hit.flag==='lower')alpha=Math.max(alpha,hit.value);else if(hit.flag==='upper')beta=Math.min(beta,hit.value);if(alpha>=beta)return hit.value;}
  if(depth<=0){const stand=cachedScore(b,actor);if(q<=0&&!checked)return stand;if(!checked){if(stand>=beta)return stand;alpha=Math.max(alpha,stand);candidates=all.filter(m=>b.some(p=>p.x===m.to.x&&p.y===m.to.y));if(!candidates.length)return stand;}}
  let bestValue=alpha;for(const m of searchOrder(b,candidates,hit&&hit.best,ply)){const v=-await search(apply(b,m,actor),R.opposite(actor),depth-1,-beta,-bestValue,ply+1,depth<=0?q-1:q);if(v>bestValue)bestValue=v;if(bestValue>=beta){if(!b.some(p=>p.x===m.to.x&&p.y===m.to.y)){killers.set(ply,moveKey(m));historyOrder.set(moveKey(m),(historyOrder.get(moveKey(m))||0)+Math.max(1,depth*depth));}tt.set(key,{depth,value:bestValue,flag:'lower',best:m});return bestValue;}}
  tt.set(key,{depth,value:bestValue,flag:bestValue<=alpha0?'upper':bestValue>=beta0?'lower':'exact'});return bestValue;
 }
 for(let depth=1;depth<=base.depth;depth++){
  let alpha=-Infinity,choice=best;const scored=[];
  try{for(const m of ordered(board,list,best)){const penalty=penalties.get(m),bonus=rootBonus(board,m)+openingBonus(board,m,(options.history||[]).length),v=-await search(apply(board,m,side),R.opposite(side),depth-1,-Infinity,Infinity,1,effective==='easy'?0:effective==='hard'?3:2)-penalty+bonus;scored.push({m,v});if(v>alpha){alpha=v;choice=m;}}}catch(e){if(e!==STOP)throw e;break;}
  ranked=scored;best=choice;completed=depth;if(board.length>=30&&(options.history||[]).length<=3){const near=scored.filter(v=>v.v>=alpha-(effective==='easy'?70:48));best=near[Math.min(near.length-1,Math.floor(random()*near.length))].m;}if(alpha>99000)break;
 }
 if(effective!=='hard'&&!classicOpening)best=Difficulty.select(ranked,effective,random)||best;
 if(options.onStats)options.onStats({nodes,depth:completed,elapsedMs:Date.now()-started,cpuMs:cpuMs+Date.now()-lastYield,cpuBudget,nodeLimit,timeBudget,ttHits,ttSize:tt.size,moveCache:moveCache.size,evalCache:evalCache.size});return cancel()?null:best;
}
module.exports={choose,publicBoard,apply,moves,score};
