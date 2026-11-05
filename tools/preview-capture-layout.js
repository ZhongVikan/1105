// Render actual project code with opening positions; no game logic changes.
const fs=require('fs'),path=require('path');
const {createCanvas,Image,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
GlobalFonts.registerFromPath(process.env.CHESS_PREVIEW_FONT,'Noto Sans CJK SC');
global.wx={getStorageSync:()=>null,getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:30,bottom:792}}),getMenuButtonBoundingClientRect:()=>({bottom:60}),createCanvas:()=>createCanvas(750,1624),createImage:()=>new Image(),loadFont:()=>'DarkChessKai'};
GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/DarkChessKai.ttf'),'DarkChessKai');
const Renderer=require('../src/renderer'),G=require('../utils/game-engine'),assets=require('../src/ui-assets');
(async()=>{
 const loaded=new Map();await Promise.all(Object.values(assets).map(async src=>{loaded.set(src,{image:await loadImage(path.join(__dirname,'..',src))});}));
 let previousY;
 for(const scenario of ['one-row','two-rows']){
 const variant='classic';
 const state=G.newGame(undefined,variant),app={scene:'game',variant,controller:{_state:state,data:{pieces:G.displayPieces(state.pieces),turn:'red',seconds:60,topSide:'black',bottomSide:'red',topName:'普通 · 不服就干场',bottomName:'红方 · 你',topCaptured:[],bottomCaptured:[],mode:'ai'}}};
 if(scenario==='home')app.scene='home';
 const d=app.controller.data;if(scenario==='waiting')d.waiting=true;if(scenario==='result'){d.showResult=true;d.ended=true;d.resultTitle='认输';d.resultDetail='黑方获胜';}d.turn='black';d.seconds=17;if(scenario==='paused'){d.paused=true;d.manualPaused=true;}if(scenario==='one-row'||scenario==='two-rows'){d.topCaptured=[{text:'車',side:'red'},{text:'馬',side:'red'},{text:'炮',side:'red'}];d.bottomCaptured=[{text:'卒',side:'black'},{text:'象',side:'black'},{text:'士',side:'black'}];}
 if(scenario==='two-rows')d.bottomCaptured=Array.from({length:12},(_,i)=>({text:['卒','象','士','馬','炮','車'][i%6],side:'black'}));
 const r=new Renderer(app);r.images=new Map(loaded);r.uiPackages={};Object.values(assets).forEach(src=>r.uiPackages[src.split('/')[0]]='ready');const originalPlayer=r.player;let bottomY;r.player=function(side,name,avatar,y,...args){if(side==='red')bottomY=y;return originalPlayer.call(this,side,name,avatar,y,...args);};r.draw();if(previousY!==undefined&&previousY!==bottomY)throw new Error('Player bar moved when second row appeared');previousY=bottomY;fs.writeFileSync(path.join(out,scenario+'.png'),r.canvas.toBuffer('image/png'));
 }
})();
