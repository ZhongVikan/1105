// Legal, sparse positions for deterministic controller integration and recording.
const G=require('../../utils/game-engine'),F=require('../../utils/fusion');
const labels={general:{red:'帥',black:'將'},rook:{red:'俥',black:'車'},horse:{red:'傌',black:'馬'},cannon:{red:'炮',black:'砲'},pawn:{red:'兵',black:'卒'},advisor:{red:'仕',black:'士'},elephant:{red:'相',black:'象'}};
const p=(id,kind,side,x,y,extra={})=>({id,kind,side,x,y,text:labels[kind][side],hidden:false,...extra});
function state(variant,extra=[]){const s={...G.newGame(()=>.4,variant),pieces:[p('rk','general','red',4,9),p('bk','general','black',3,0),...extra],turn:'red',status:'playing',ply:0,captured:[],lastMove:null};for(const p of s.pieces)p.variant=variant;if(variant==='fusion')F.initialize(s);return s;}
function fused(id,type,kind,x,y){const combinations={xiao:['rook','horse'],bombard:['rook','cannon']},k=combinations[type];return p(id,kind,'red',x,y,{variant:'fusion',fusionType:type,sourcePieces:[p(id+'a',k[0],'red',0,8),p(id+'b',k[1],'red',0,9)]});}
module.exports={p,state,fused,scenarios:{
 walk:()=>state('classic',[p('r','rook','red',0,7),p('b','rook','black',8,2)]),
 capture:()=>state('classic',[p('r','rook','red',2,7),p('victim','horse','black',2,4),p('b','rook','black',8,2)]),
 captureCheck:()=>state('classic',[p('r','rook','red',0,3),p('victim','horse','black',3,3),p('b','rook','black',8,2)]),
 reveal:variant=>{const s=G.newGame(()=>.4,variant||'jieqi');return s;},
 hiddenVictim:()=>{const s=state('dark',[p('r','rook','red',0,7),p('victim','horse','black',0,3,{hidden:true,slot:{x:0,y:0,side:'black',kind:'rook'}}),p('b','rook','black',8,2)]);return s;},
 fusion:()=>state('fusion',[p('h','horse','red',2,7),p('p','pawn','red',3,5)]),
 royal:()=>state('fusion',[p('a','advisor','red',3,8)]),
 chase:()=>state('fusion',[fused('x','xiao','horse',0,7),p('v1','pawn','black',1,5),p('v2','pawn','black',2,3),p('b','rook','black',8,2)]),
 double:()=>state('fusion',[fused('bomb','bombard','cannon',0,7),p('screen','pawn','black',0,5),p('v2','rook','black',0,3)]),
 }};
