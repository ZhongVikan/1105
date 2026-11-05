// Reproducible paired self-play against the ORIGINAL normal AI. No outcome adjudication.
// Usage: CHESS_BASELINE=/path/to/previous/utils node tools/evaluate-ai.js report.json [pairs=1] [maxPlies=100]
const fs=require('fs'),path=require('path'),G=require('../utils/game-engine'),AI=require('../utils/ai'),FA=require('../utils/fusion-ai'),D=require('../utils/ai-difficulty');
const baseline=process.env.CHESS_BASELINE||path.join(__dirname,'ai-reference');
const old=require(path.join(baseline,'ai')),oldFusion=require(path.join(baseline,'fusion-ai'));
const out=process.argv[2],pairs=Number(process.argv[3]||1),maxPlies=Number(process.argv[4]||100);
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function wilson(w,n){if(!n)return [0,1];const z=1.96,p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
(async()=>{const report={date:new Date().toISOString(),reference:'Previous release normal AI; paired seeds and swapped sides',maxPlies,pairs,note:'Capped games are unfinished, not draws. Small samples do not establish human win rates. Wall-clock search budgets can vary by hardware.',results:[]};
 for(const variant of ['classic','dark','jieqi','fusion'])for(const level of ['easy','normal','hard']){
 const row={variant,level,target:D.profile(level).target,wins:0,losses:0,draws:0,unfinished:0,games:[]};
 for(let seed=1;seed<=pairs;seed++)for(const side of ['red','black']){let s=G.newGame(rng(seed),variant),history=[],random=rng(seed*71),plies=0;const initial=JSON.stringify(s.pieces);
 while(s.status==='playing'&&plies<maxPlies){const mine=s.turn===side,engine=mine?AI:old,fe=mine?FA:oldFusion,options={random,history};const m=variant==='fusion'?await fe.choose(s,mine?level:'normal',options):await engine.choose(s.pieces,s.turn,mine?level:'normal',options);if(!m)throw Error(`No move for playing ${variant} ${level}`);const r=G.move(s,m.id,m.to);if(!r.ok)throw Error(r.message);history=[...history,s].slice(-100);s=r.state;plies++;}
 const outcome=s.status!=='ended'?'unfinished':!s.winner?'draws':s.winner===side?'wins':'losses';row[outcome]++;row.games.push({seed,side,plies,outcome,reason:s.reason,initial});console.log(variant,level,seed,side,outcome,plies);}
 const n=row.games.length;row.winRate=row.wins/n;row.winRate95CI=wilson(row.wins,n);row.completed=row.wins+row.losses+row.draws;report.results.push(row);fs.writeFileSync(out,JSON.stringify(report,null,2));}
})();
