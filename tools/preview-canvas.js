// Development-only Canvas snapshots. Does not emulate the WeChat runtime.
const fs=require('fs'),path=require('path'),{createCanvas,Image,GlobalFonts}=require('@napi-rs/canvas');
const font=process.env.CHESS_PREVIEW_FONT;if(font)GlobalFonts.registerFromPath(font,'Noto Sans CJK SC');
const root=path.resolve(__dirname,'..'),out=process.argv[2]||path.join(root,'docs/preview');fs.mkdirSync(out,{recursive:true});
let width=375,height=812;global.wx={getStorageSync:()=>null,getWindowInfo:()=>({windowWidth:width,windowHeight:height,pixelRatio:2,safeArea:{top:30,bottom:height-20}}),getMenuButtonBoundingClientRect:()=>({bottom:60}),createCanvas:()=>createCanvas(width*2,height*2),createImage:()=>new Image()};
GlobalFonts.registerFromPath(path.join(root,'assets/fonts/DarkChessKai.ttf'),'DarkChessKai');wx.loadFont=()=> 'DarkChessKai';
const Renderer=require('../src/renderer'),G=require('../utils/game-engine'),uiAssets=require('../src/ui-assets');
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
(async()=>{for(const size of [[375,812],[320,568]]){
 [width,height]=size;const app={scene:'home',profile:null,controller:null,back(){},open(){},startGame(){},toggleSetting(){},home(){},scroll:0};const r=new Renderer(app);
 r.uiPackages={};for(const src of Object.values(uiAssets))r.uiPackages[src.split('/')[0]]='ready';
 r.draw();await settle();r.draw();fs.writeFileSync(path.join(out,`home-${width}.png`),r.canvas.toBuffer('image/png'));
 if(width===375){const free=r.height-r.bottom-r.top,top=(r.top+free*.51)*r.dpr*r.scale,section=createCanvas(r.canvas.width,Math.ceil(free*.35*r.dpr*r.scale));section.getContext('2d').drawImage(r.canvas,0,top,r.canvas.width,section.height,0,0,r.canvas.width,section.height);fs.writeFileSync(path.join(out,'home-functions.png'),section.toBuffer('image/png'));}
 const state=G.newGame();app.controller={data:{pieces:G.displayPieces(state.pieces),turn:'red',seconds:60,topSide:'black',bottomSide:'red',topName:'普通 · 不服就干场',bottomName:'红方 · 你',topCaptured:state.pieces.filter(p=>p.kind!=='general').slice(0,15).map(p=>({...p,hidden:false})),bottomCaptured:state.pieces.filter(p=>p.kind!=='general').slice(15).map(p=>({...p,hidden:false})),message:'红方行棋',mode:'ai'}};app.scene='game';r.draw();await settle();r.draw();fs.writeFileSync(path.join(out,`game-${width}.png`),r.canvas.toBuffer('image/png'));
 app.controller.data.showResult=true;app.controller.data.resultTitle='长将判负';app.controller.data.resultDetail='黑方获胜';r.draw();fs.writeFileSync(path.join(out,`result-${width}.png`),r.canvas.toBuffer('image/png'));app.controller.data.showResult=false;
 app.controller.data.manualPaused=true;r.draw();fs.writeFileSync(path.join(out,`paused-${width}.png`),r.canvas.toBuffer('image/png'));app.controller.data.manualPaused=false;app.controller.data.topCaptured=state.pieces.filter(p=>p.kind!=='general').map(p=>({...p,hidden:false}));r.draw();fs.writeFileSync(path.join(out,`captured-max-${width}.png`),r.canvas.toBuffer('image/png'));
}})();
