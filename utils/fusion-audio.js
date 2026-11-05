// Drop the named WAV files into assets/fusion-audio; missing files are skipped.
const sequence={
 guard_king:['44_侍卫护驾.wav','合棋_融合.wav','御_护盾展开.wav','合棋_完成.wav'],
 mounted_king:['45_战马护驾.wav','马_嘶鸣.wav','马_马蹄接近.wav','合棋_融合.wav','驭_突围.wav','合棋_完成.wav'],
 chariot_king:['46_战车护驾.wav','车_马车马蹄.wav','车_战车轮滚动.wav','合棋_融合.wav','巡_巡行.wav','合棋_完成.wav']
};
const labels=require('./fusion').names;
function cues(event,s){const m=s.lastMove,p=m&&s.pieces.find(p=>p.id===m.id);if(!m||!p)return [];
 if(m.fusionType)return sequence[m.fusionType]||['合棋_启动.wav','合棋_融合.wav','合棋_'+labels[m.fusionType]+'.wav','合棋_完成.wav'];
 if(event==='chase')return ['骁_追击触发.wav'];
 if(p.fusionType==='bombard'&&m.capturedIds&&m.capturedIds.length===2)return ['轰_破架.wav'];
 if(p.fusionType==='gunner'&&m.capturedId&&Math.abs(m.from.x-m.to.x)+Math.abs(m.from.y-m.to.y)===1)return ['铳_近击.wav'];
 if(p.fusionType==='rider')return ['骑_移动.wav'];
 if(p.fusionType==='formation'&&(m.from.y<=4)!==(m.to.y<=4))return ['阵_渡河.wav'];return [];
}
function file(name){return /^(44|45|46)_/.test(name)?{src:'fusionAudio/'+name,package:'fusionAudio'}:{src:'assets/fusion-audio/'+name};}
module.exports={cues,file};
