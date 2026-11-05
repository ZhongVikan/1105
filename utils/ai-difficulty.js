// Targets describe AI win rate against a defined opponent pool, not guaranteed outcomes.
// Keep tuning in one place for classic/dark/jieqi and fusion.
const profiles={
 easy:{target:.30,ms:85,cpu:35,nodes:200,depth:2,mistake:.58,tolerance:320},
 normal:{target:.60,ms:300,cpu:120,nodes:1800,depth:4,mistake:.08,tolerance:65},
 hard:{target:.80,ms:800,cpu:240,nodes:7200,depth:6,mistake:0,tolerance:0}
};
function profile(level){return profiles[level]||profiles.normal;}
function select(ranked,level,random=Math.random){
 if(!ranked.length)return null;const cfg=profile(level),sorted=ranked.slice().sort((a,b)=>b.v-a.v),best=sorted[0];
 // Always take a known forced win and never deliberately select a known forced loss.
 if(best.v>=99000||cfg.mistake===0||random()>=cfg.mistake)return best.m;
 const alternatives=sorted.filter((r,i)=>i>0&&r.v>-99000&&r.v>=best.v-cfg.tolerance);
 return alternatives.length?alternatives[Math.min(alternatives.length-1,Math.floor(random()*alternatives.length))].m:best.m;
}
module.exports={profiles,profile,select};
