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
 for(const scene of ['difficulty','rules','settings','profile']){
 const variant='dark';
 const state=G.newGame(undefined,variant),app={scene,variant,scroll:0,back(){},startGame(){},toggleSetting(){},prepareProfile(){},openPrivacy(){},controller:{_state:state,data:{pieces:G.displayPieces(state.pieces),turn:'red',seconds:60,topSide:'black',bottomSide:'red',topName:'普通 · 不服就干场',bottomName:'红方 · 你',topCaptured:[],bottomCaptured:[],mode:'ai'}}};
 const r=new Renderer(app);r.images=new Map(loaded);r.uiPackages={};Object.values(assets).forEach(src=>r.uiPackages[src.split('/')[0]]='ready');r.draw();fs.writeFileSync(path.join(out,scene+'.png'),r.canvas.toBuffer('image/png'));
 }
})();
