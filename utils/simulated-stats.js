const Online=require('./online');
const KEY='chess-pending-simulated-results';
let state,inFlight;

function ledger(){
 if(!state){
  let saved;
  try{saved=wx.getStorageSync(KEY);}catch(error){/* In-memory results are available without storage. */}
  if(Array.isArray(saved))saved={pending:saved};
  state={pending:Array.isArray(saved?.pending)?saved.pending:[],local:saved?.local||{}};
 }
 return state;
}

function save(next){
 state=next;
 try{wx.setStorageSync(KEY,next);}catch(error){/* Keep completed results in memory. */}
}

function flush(){
 if(inFlight)return inFlight;
 if(!ledger().pending.length)return Promise.resolve();
 inFlight=(async()=>{
  const blocked=new Set();
  let firstRejection;
  while(true){
   const result=ledger().pending.find(item=>!blocked.has(item.simulationId));
   if(!result)break;
   try{await Online.call('recordSimulatedResult',result);}
   catch(error){
    if(!error.serverRejected)throw error;
    blocked.add(result.simulationId);
    firstRejection=firstRejection||error;
    continue;
   }
   const current=ledger();
   save({...current,pending:current.pending.filter(item=>item!==result)});
  }
  if(firstRejection)throw firstRejection;
 })().finally(()=>{inFlight=null;});
 return inFlight;
}

function addGame(totals,won){
 return {games:(totals?.games||0)+1,wins:(totals?.wins||0)+(won?1:0)};
}

function record(result,variant,nickname){
 const {pending,local}=ledger(),stats=local[variant]||{};
 const opponents={...stats.opponents,[nickname]:addGame(stats.opponents?.[nickname],result.winner==='black')};
 save({
  pending:result.simulationId?[...pending,result]:pending,
  local:{...local,[variant]:{player:addGame(stats.player,result.winner==='red'),opponents}},
 });
 return result.simulationId?flush():Promise.resolve();
}

function localTotals(variant,nickname){
 const mode=ledger().local[variant];
 return (nickname?mode?.opponents?.[nickname]:mode?.player)||{games:0,wins:0};
}

function hasPending(simulationId){
 return ledger().pending.some(result=>result.simulationId===simulationId);
}

module.exports={record,flush,localTotals,hasPending};
