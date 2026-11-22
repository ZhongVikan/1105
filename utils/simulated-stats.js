const Online=require('./online');
const KEY='chess-pending-simulated-results';
let queue,inFlight;

function pending(){
 if(!queue){
  try{const saved=wx.getStorageSync(KEY);queue=Array.isArray(saved)?saved:[];}
  catch(error){queue=[];}
 }
 return queue;
}

function save(results){
 queue=results;
 try{wx.setStorageSync(KEY,results);}catch(error){/* Keep the results in memory until they sync. */}
}

function flush(){
 if(inFlight)return inFlight;
 if(!pending().length)return Promise.resolve();
 inFlight=(async()=>{
  while(pending().length){
   await Online.call('recordSimulatedResult',pending()[0]);
   save(pending().slice(1));
  }
 })().finally(()=>{inFlight=null;});
 return inFlight;
}

function record(result){
 save([...pending(),result]);
 return flush();
}

module.exports={record,flush};
