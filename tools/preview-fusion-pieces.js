// Development preview of all dedicated fusion-piece PNGs in the actual game renderer.
const fs=require('fs'),path=require('path');
const {createCanvas,Image,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
GlobalFonts.registerFromPath(process.env.CHESS_PREVIEW_FONT,'Noto Sans CJK SC');
global.wx={getStorageSync:()=>null,getWindowInfo:()=>({windowWidth:375,windowHeight:812,pixelRatio:2,safeArea:{top:30,bottom:792}}),getMenuButtonBoundingClientRect:()=>({bottom:60}),createCanvas:()=>createCanvas(750,1624),createImage:()=>new Image(),loadFont:()=>'DarkChessKai'};
GlobalFonts.registerFromPath(path.join(__dirname,'../assets/fonts/DarkChessKai.ttf'),'DarkChessKai');
const Renderer=require('../src/renderer'),assets=require('../src/ui-assets');
(async()=>{
 const loaded=new Map();await Promise.all(Object.values(assets).map(async src=>{try{loaded.set(src,{image:await loadImage(path.join(__dirname,'..',src))});}catch(e){console.error('FAILED',src,e.message);throw e;}}));
 const types=['rider','gunner','formation','xiao','bombard','guard_king','mounted_king','chariot_king'];
 const glyph={rider:'骑',gunner:'铳',formation:'阵',xiao:'骁',bombard:'轰',guard_king:'帥',mounted_king:'帥',chariot_king:'帥'};
 const pieces=[];for(const [row,side] of [[1,'black'],[8,'red']])types.forEach((fusionType,x)=>pieces.push({id:side+x,x,y:row,side,kind:fusionType.includes('king')?'general':'pawn',text:side==='black'&&fusionType.includes('king')?'將':glyph[fusionType],hidden:false,fusionType,general:fusionType.includes('king')}));
 const data={pieces,turn:'red',seconds:60,topSide:'black',bottomSide:'red',topName:'黑方合棋',bottomName:'红方合棋',topCaptured:[],bottomCaptured:[],mode:'ai'};
 const app={scene:'game',variant:'fusion',controller:{_state:{variant:'fusion',pieces,turn:'red'},data}};
 const r=new Renderer(app);r.images=new Map(loaded);r.uiPackages={};Object.values(assets).forEach(src=>r.uiPackages[src.split('/')[0]]='ready');r.draw();fs.writeFileSync(path.join(out,'fusion-board.png'),r.canvas.toBuffer('image/png'));
})();
