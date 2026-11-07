// Targets describe AI win rate against a defined opponent pool, not guaranteed outcomes.
// Keep tuning in one place for classic/dark/jieqi and fusion. `ms` is the wall-clock
// ceiling, `cpu` is the active CPU budget, and `nodes`/`depth` are independent caps.
const profiles={
 easy:{target:.30,ms:100,cpu:40,nodes:350,depth:3,mistake:.58,tolerance:320},
 normal:{target:.60,ms:550,cpu:280,nodes:60000,depth:8,mistake:.08,tolerance:65},
 hard:{target:.80,ms:1200,cpu:700,nodes:200000,depth:11,mistake:0,tolerance:0}
};

// WeChat's benchmarkLevel is a coarse device-performance score. Keep the threshold
// conservative and use memory only as a fallback because some SDK versions report 0.
const LOW_END_BENCHMARK=10,LOW_END_MEMORY_MB=2048;
function platformInfo(){
 if(typeof wx==='undefined')return {};
 try{
  const system=typeof wx.getSystemInfoSync==='function'?wx.getSystemInfoSync()||{}:{};
  const device=typeof wx.getDeviceInfo==='function'?wx.getDeviceInfo()||{}:{};
  return {...system,...device};
 }catch(error){return {};}
}
function isLowEndDevice(info=platformInfo()){
 const benchmark=Number(info&&info.benchmarkLevel),memory=Number(info&&(info.memorySize??info.memory));
 return benchmark>0&&benchmark<=LOW_END_BENCHMARK||memory>0&&memory<=LOW_END_MEMORY_MB;
}
function effectiveLevel(level,options={}){
 const requested=profiles[level]?level:'normal';
 const lowEnd=Object.prototype.hasOwnProperty.call(options,'lowEnd')?!!options.lowEnd:isLowEndDevice(options.deviceInfo||platformInfo());
 return requested==='hard'&&lowEnd?'normal':requested;
}
function profile(level,options={}){return profiles[effectiveLevel(level,options)];}
function select(ranked,level,random=Math.random){
 if(!ranked.length)return null;const cfg=profile(level),sorted=ranked.slice().sort((a,b)=>b.v-a.v),best=sorted[0];
 // Always take a known forced win and never deliberately select a known forced loss.
 if(best.v>=99000||cfg.mistake===0||random()>=cfg.mistake)return best.m;
 const alternatives=sorted.filter((r,i)=>i>0&&r.v>-99000&&r.v>=best.v-cfg.tolerance);
 return alternatives.length?alternatives[Math.min(alternatives.length-1,Math.floor(random()*alternatives.length))].m:best.m;
}
module.exports={profiles,profile,select,effectiveLevel,isLowEndDevice};
