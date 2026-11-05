const F=require('./fusion'),R=require('./rules-core');
const values={pawn:100,advisor:210,elephant:230,horse:430,cannon:450,rook:900,general:20000};
const fused={rider:570,gunner:610,formation:380,xiao:1000,bombard:1100,guard_king:20260,mounted_king:20150,chariot_king:20180};
const worth=p=>fused[p.fusionType]||values[p.kind];
function evaluate(s,side){let v=0;for(const p of s.pieces){const advance=p.side==='red'?9-p.y:p.y,center=4-Math.abs(p.x-4);let bonus=p.kind==='pawn'&&!p.fusionType?advance*10:0;if(!p.general&&['horse','cannon','rook'].includes(p.kind))bonus+=center*7+Math.min(advance,5)*4;v+=(p.side===side?1:-1)*(worth(p)+bonus);}return v;}
async function choose(s,level,{cancel=()=>false,random=Math.random,onStats}={}){
 const side=s.turn,cfg={easy:{ms:65,cpu:30,nodes:160,depth:1},normal:{ms:180,cpu:65,nodes:650,depth:3},hard:{ms:300,cpu:100,nodes:1600,depth:5}}[level]||{ms:180,cpu:65,nodes:650,depth:3},start=Date.now();let chunk=start,cpu=0,nodes=0,depthDone=0,ttHits=0;const STOP={},cache=new Map(),tt=new Map();
 const key=n=>n.turn+'|'+(n.pendingChase||'')+'|'+n.pieces.map(p=>p.id+':'+(p.fusionType||p.kind)+':'+p.x+','+p.y).join(';');
 async function checkpoint(){const now=Date.now();if(cancel()||now-start>=cfg.ms||cpu+now-chunk>=cfg.cpu||nodes>=cfg.nodes)throw STOP;if(now-chunk>=6){cpu+=now-chunk;await new Promise(r=>setTimeout(r,12));chunk=Date.now();if(cancel()||chunk-start>=cfg.ms)throw STOP;}}
 const legal=n=>{const k=key(n);let v=cache.get(k);if(!v){v=F.actions(n);cache.set(k,v);}return v;};
 const priority=(n,m)=>{if(!m.to)return -5;const p=n.pieces.find(p=>p.id===m.id),t=n.pieces.find(p=>p.x===m.to.x&&p.y===m.to.y);return t?(t.side===n.turn?-20:worth(t)*10-worth(p)):0;};
 const ordered=(n,list)=>list.slice().sort((a,b)=>priority(n,b)-priority(n,a));
 async function search(n,depth,alpha,beta,ply,q){await checkpoint();nodes++;const maximize=n.turn===side,check=F.checked(n.pieces,n.turn),stand=evaluate(n,side);if(ply>=10||depth<=0&&!check&&q<=0)return stand;const list=depth<=0&&!check?F.actions(n,false,true):legal(n);if(!list.length)return depth<=0&&!check?stand:maximize?-100000+ply:100000-ply;let candidates=list;if(depth<=0&&!check){if(!candidates.length)return stand;if(maximize){if(stand>=beta)return stand;alpha=Math.max(alpha,stand);}else{if(stand<=alpha)return stand;beta=Math.min(beta,stand);}}
 const alpha0=alpha,beta0=beta,k=key(n)+'|'+depth+'|'+q+'|'+ply,hit=tt.get(k);if(hit!==undefined){ttHits++;return hit;}let best=depth<=0&&!check?stand:maximize?-Infinity:Infinity,cut=false;
 for(const m of ordered(n,candidates)){const next=F.move(n,m.id,m.to,false).state,v=await search(next,depth-1,alpha,beta,ply+1,depth<=0?q-1:q);best=maximize?Math.max(best,v):Math.min(best,v);if(maximize)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(alpha>=beta){cut=true;break;}}
 if(!cut&&best>alpha0&&best<beta0)tt.set(k,best);return best;
 }
 if(cancel())return null;const roots=ordered(s,legal(s));if(!roots.length)return null;let best=roots[0],ranked=[];
 try{for(const m of roots){await checkpoint();let n=F.move(s,m.id,m.to,false).state;const repeats=(s.repetition||[]).filter(r=>r.key===F.key(n)).length,penalty=repeats>=2?2400:repeats*600;if(repeats>=2)n=F.move(s,m.id,m.to,true).state;let terminal=n.status==='ended'?(n.winner===side?100000:n.winner?-100000:0):null;if(terminal===null&&n.turn!==side&&F.checked(n.pieces,n.turn)&&!F.actions(n,true).length)terminal=100000;let v=terminal===null?evaluate(n,side)-penalty:terminal;const p=n.pieces.find(p=>p.id===m.id);if(p&&!p.general&&n.pieces.some(t=>t.side!==side&&F.reach(n.pieces,t,p,true)))v-=worth(p)*.85;ranked.push({m,n,penalty,v,terminal});if(terminal===100000)break;}}catch(e){if(e!==STOP)throw e;}
 ranked.sort((a,b)=>b.v-a.v);if(ranked.length)best=ranked[0].m;
 try{for(let depth=1;depth<=cfg.depth&&ranked[0]?.terminal!==100000;depth++){const results=[];for(const c of ranked){const v=c.terminal===null?await search(c.n,depth-1,-Infinity,Infinity,1,level==='easy'?0:level==='hard'?3:2)-c.penalty:c.terminal;results.push({...c,v});}if(!results.length)break;results.sort((a,b)=>b.v-a.v);ranked=results;best=results[0].m;depthDone=depth;if(Math.abs(results[0].v)>99000)break;}}catch(e){if(e!==STOP)throw e;}
 if(s.ply<4&&depthDone){const near=ranked.filter(c=>!c.penalty&&c.v>=ranked[0].v-12);if(near.length>1)best=near[Math.min(near.length-1,Math.floor(random()*near.length))].m;}
 if(onStats)onStats({nodes,nodeLimit:cfg.nodes,elapsedMs:Date.now()-start,timeBudget:cfg.ms,cpuMs:cpu+Date.now()-chunk,cpuBudget:cfg.cpu,depth:depthDone,ttHits});return cancel()?null:best;
}
module.exports={choose,evaluate};
