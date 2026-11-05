const fs=require('fs'),path=require('path'),{createCanvas,Image,loadImage,GlobalFonts}=require('@napi-rs/canvas');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/DarkChessKai.ttf'),'DarkChessKai');
global.wx={getStorageSync:()=>null,getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:1,safeArea:{top:24,bottom:792}}),getMenuButtonBoundingClientRect:()=>({bottom:52}),createCanvas:()=>createCanvas(750,1624),createImage:()=>new Image(),loadFont:()=>'DarkChessKai'};
const Renderer=require('../src/renderer'),G=require('../utils/game-engine'),FX=require('../src/battle-effects'),assets=require('../src/ui-assets');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
(async()=>{const images=new Map();await Promise.all(Object.values(assets).map(async src=>images.set(src,{image:await loadImage(path.join(__dirname,'..',src))})));
 const sheet=createCanvas(4*375,3*480),q=sheet.getContext('2d');q.fillStyle='#eee5d4';q.fillRect(0,0,sheet.width,sheet.height);
 const cases=['capture','reveal','fusion'];let row=0;
 for(const kind of cases){let state=G.newGame(()=>.4,kind==='fusion'?'fusion':kind==='reveal'?'dark':'classic');
 let pieces=G.displayPieces(state.pieces);const mover=pieces.find(p=>p.side==='red'&&p.kind==='rook')||pieces.find(p=>p.hidden),victim=pieces.find(p=>p.id!==mover.id&&p.side==='black');
 mover.x=0;mover.y=4;const move={id:mover.id,from:{x:0,y:7},to:{x:0,y:4},revealed:kind==='reveal',capturedId:kind==='capture'?victim.id:null};
 const ghost={...victim,x:0,y:4};if(kind==='capture')pieces=pieces.filter(p=>p.id!==victim.id);
 if(kind==='reveal'){mover.hidden=false;mover.side='red';mover.kind='rook';mover.text='俥';}
 if(kind==='fusion'){move.fusionType='chariot_king';move.sourcePieces=[{...mover,kind:'rook',text:'俥'},{...mover,kind:'general',text:'帥'}];Object.assign(mover,{fusionType:'chariot_king',text:'帥',kind:'general'});}
 const controller={_state:state,data:{pieces,selectedId:'',lastMoveId:mover.id},motion:{at:1000,move,capturedPieces:kind==='capture'?[ghost]:[]}};
 const r=new Renderer({scene:'game',controller});r.images=new Map(images);r.uiPackages={};Object.values(assets).forEach(src=>r.uiPackages[src.split('/')[0]]='ready');
 const t=FX.timing(move),times=[0,t.travel*.5,t.impact+120,t.impact+450];
 for(let col=0;col<4;col++){const canvas=createCanvas(375,480);r.ctx=canvas.getContext('2d');r.ctx.fillStyle='#eee5d4';r.ctx.fillRect(0,0,375,480);r.board(controller.data,{x:7,y:35,w:360,h:400},controller.motion,1000+times[col]);r.text(kind+' · '+Math.round(times[col])+'ms',15,17,13);q.drawImage(canvas,col*375,row*480);}
 row++;
 }
 fs.writeFileSync(path.join(out,'animation-frames.png'),sheet.toBuffer('image/png'));
 // Initial crowded board with selected ring; final foreground pass is exercised.
 const state=G.newGame(undefined,'classic'),controller={_state:state,data:{pieces:G.displayPieces(state.pieces),selectedId:'red-back-4',turn:'red',seconds:8,topSide:'black',bottomSide:'red',topName:'困难 · 棋王修罗场',bottomName:'红方 · 你',topCaptured:[],bottomCaptured:[],mode:'ai'}};
 const r=new Renderer({scene:'game',variant:'classic',controller});r.images=new Map(images);r.uiPackages={};Object.values(assets).forEach(src=>r.uiPackages[src.split('/')[0]]='ready');r.draw(1000);fs.writeFileSync(path.join(out,'selected-top-layer.png'),r.canvas.toBuffer('image/png'));
})();
