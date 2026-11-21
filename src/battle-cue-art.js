// Rasterize the lacquer, gilt edges and light blooms once, then reuse them per frame.
const GOLD = {
 width:88, height:76, cut:13, label:'吃', size:43,
 face:['#a75b23','#462017','#6e3218'], edge:['#fff3be','#d28129','#ffe6a2'],
 ink:['#fff9d7','#ffdc86','#f6a642'], stroke:'#3a1810', detail:'#ffe0a0',
};
const RED = {
 width:204, height:78, cut:18, label:'将军', size:46,
 face:['#842b23','#411316','#6e231e'], edge:['#ffe5a2','#d98349','#ffd58b'],
 ink:['#fff9df','#ffe5b3','#f8a86c'], stroke:'#390d13', detail:'#ffc893',
};
const IMPACT_ANGLES=[-2.8,-1.52,-.46,.82,2.27];

function texture(width,height,paint,scale=2){
 const canvas=wx.createCanvas();
 canvas.width=width*scale;canvas.height=height*scale;
 const ctx=canvas.getContext('2d');
 ctx.scale(scale,scale);paint(ctx);
 return canvas;
}

function bevelPath(ctx,x,y,w,h,cut){
 ctx.beginPath();
 ctx.moveTo(x+cut,y);ctx.lineTo(x+w-cut,y);ctx.lineTo(x+w,y+cut);
 ctx.lineTo(x+w,y+h-cut);ctx.lineTo(x+w-cut,y+h);ctx.lineTo(x+cut,y+h);
 ctx.lineTo(x,y+h-cut);ctx.lineTo(x,y+cut);ctx.closePath();
}

function ramp(ctx,top,bottom,colors){
 const color=ctx.createLinearGradient(0,top,0,bottom);
 color.addColorStop(0,colors[0]);color.addColorStop(.55,colors[1]);color.addColorStop(1,colors[2]);
 return color;
}

function diamond(ctx,x,y,width,height){
 ctx.beginPath();
 ctx.moveTo(x-width,y);ctx.lineTo(x,y-height);ctx.lineTo(x+width,y);ctx.lineTo(x,y+height);
 ctx.closePath();ctx.fill();
}

function plate(style){
 const {width:w,height:h,cut}=style;
 return texture(w,h,ctx=>{
  const x=9,y=8,frameWidth=w-18,frameHeight=h-17;
  ctx.save();ctx.shadowColor='#27110dbe';ctx.shadowBlur=9;ctx.shadowOffsetY=3;
  bevelPath(ctx,x,y,frameWidth,frameHeight,cut);
  ctx.fillStyle='#2d1513';ctx.fill();ctx.restore();
  bevelPath(ctx,x+1,y+1,frameWidth-2,frameHeight-2,cut-1);
  ctx.fillStyle=ramp(ctx,y,y+frameHeight,style.edge);ctx.fill();
  bevelPath(ctx,x+4,y+4,frameWidth-8,frameHeight-8,cut-3);
  ctx.fillStyle=ramp(ctx,y,y+frameHeight,style.face);ctx.fill();
  bevelPath(ctx,x+6,y+6,frameWidth-12,frameHeight-12,cut-5);
  ctx.strokeStyle=style.detail;ctx.lineWidth=.9;ctx.stroke();

  // Small inlaid accents and a hairline catchlight along the top bevel.
  ctx.fillStyle=style.detail;
  diamond(ctx,x+10,h/2,3,4);diamond(ctx,w-x-10,h/2,3,4);
  ctx.beginPath();ctx.moveTo(w*.32,y+3);ctx.lineTo(w*.68,y+3);
  ctx.strokeStyle='#fff6d3';ctx.lineWidth=1;ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  ctx.font='bold '+style.size+'px "KaiTi", "STKaiti", "Kaiti SC", "Noto Serif CJK SC", "Noto Sans CJK SC", serif';
  ctx.strokeStyle=style.stroke;ctx.lineWidth=2.6;ctx.strokeText(style.label,w/2,h/2+1);
  ctx.fillStyle=ramp(ctx,11,h-10,style.ink);ctx.fillText(style.label,w/2,h/2);
 });
}

function bloom(color,center){
 return texture(144,144,ctx=>{
  const light=ctx.createRadialGradient(72,72,0,72,72,72);
  light.addColorStop(0,center);
  light.addColorStop(.34,center);
  light.addColorStop(.52,color);
  light.addColorStop(1,'rgba(255,192,82,0)');
  ctx.fillStyle=light;ctx.fillRect(0,0,144,144);
 },1);
}

function preload(renderer){
 const art=renderer._battleCueArt||(renderer._battleCueArt={eat:plate(GOLD),check:plate(RED)});
 if(renderer.fxQuality!==0&&!art.goldBloom){
  art.goldBloom=bloom('rgba(255,174,52,.72)','rgba(255,232,146,.3)');
  art.redBloom=bloom('rgba(249,58,28,.7)','rgba(249,58,28,0)');
 }
 return art;
}

function drawBadge(renderer,key,x,y,width,alpha,scale){
 if(alpha<=0)return;
 const ctx=renderer.ctx,sprite=preload(renderer)[key];
 const w=width*scale,h=w*sprite.height/sprite.width;
 ctx.save();
 ctx.globalAlpha*=alpha;
 ctx.imageSmoothingEnabled=true;
 ctx.drawImage(sprite,x-w/2,y-h/2,w,h);
 ctx.restore();
}

function arcs(ctx,x,y,radius,angle,length){
 ctx.beginPath();
 for(let i=0;i<2;i++){
  const start=angle+i*Math.PI;
  ctx.moveTo(x+radius*Math.cos(start),y+radius*Math.sin(start));
  ctx.arc(x,y,radius,start,start+length);
 }
}

function impactFlakes(ctx,x,y,radius,ease,fade){
 ctx.beginPath();
 for(const angle of IMPACT_ANGLES){
  const dx=Math.cos(angle+.22*ease),dy=Math.sin(angle+.22*ease);
  const distance=radius+9+5*ease,length=6-3*ease;
  const cx=x+distance*dx,cy=y+distance*dy;
  ctx.moveTo(cx-length*dx,cy-length*dy);
  ctx.lineTo(cx-2*dy,cy+2*dx);
  ctx.lineTo(cx+length*dx,cy+length*dy);
  ctx.lineTo(cx+2*dy,cy-2*dx);
  ctx.closePath();
 }
 ctx.globalAlpha=.86*fade;
 ctx.strokeStyle='#945024';ctx.lineWidth=1.8;ctx.stroke();
 ctx.fillStyle='#fff1ab';ctx.fill();
}

function captureImpact(renderer,x,y,age){
 if(age<0||age>=300)return;
 const ctx=renderer.ctx,phase=age/300,ease=1-(1-phase)**3;
 const radius=34+29*ease,fade=(1-phase)**1.6,detail=renderer.fxQuality!==0;
 ctx.save();
 if(detail&&age<165){
  const glow=39+15*ease;
  ctx.globalAlpha=.84*(1-age/165);
  ctx.drawImage(preload(renderer).goldBloom,x-glow,y-glow,2*glow,2*glow);
 }
 ctx.lineCap='round';
 arcs(ctx,x,y,radius,-.82+.48*ease,2.35);
 ctx.globalAlpha=.84*fade;ctx.strokeStyle='#a85820';ctx.lineWidth=5.3;ctx.stroke();
 ctx.globalAlpha=fade;ctx.strokeStyle='#fff3b3';ctx.lineWidth=2.9;ctx.stroke();
 if(detail){
  arcs(ctx,x,y,radius+8,-2+.34*ease,1.35);
  ctx.strokeStyle='#b86928';ctx.lineWidth=1.5;ctx.globalAlpha=.66*fade;ctx.stroke();
  impactFlakes(ctx,x,y,radius,ease,fade);
 }
 ctx.restore();
}

function checkHalo(renderer,x,y,alpha,phase){
 if(alpha<=0)return;
 const ctx=renderer.ctx,detail=renderer.fxQuality!==0;
 ctx.save();
 if(detail){
  const radius=58+8*phase;
  ctx.globalAlpha=alpha*(.82-.45*phase);
  ctx.drawImage(preload(renderer).redBloom,x-radius,y-radius,2*radius,2*radius);
 }
 ctx.lineCap='round';
 ctx.beginPath();ctx.arc(x,y,37,0,Math.PI*2);
 ctx.strokeStyle='#831d19';ctx.lineWidth=4;ctx.globalAlpha=.82*alpha;ctx.stroke();
 ctx.strokeStyle='#ff744d';ctx.lineWidth=1.9;ctx.globalAlpha=.95*alpha;ctx.stroke();
 if(detail){
  arcs(ctx,x,y,44+4*phase,-1.24+.85*phase,1.45);
  ctx.strokeStyle='#ffbd82';ctx.lineWidth=2.2;ctx.globalAlpha=.91*alpha;ctx.stroke();
  ctx.fillStyle='#ffe6ac';
  diamond(ctx,x-43-3*phase,y,3.3,5);diamond(ctx,x+43+3*phase,y,3.3,5);
 }
 ctx.restore();
}

function checkTrails(renderer,x,y,width,alpha,phase){
 if(renderer.fxQuality===0||alpha<=0||phase>=1)return;
 const ctx=renderer.ctx,start=width*.39,spread=10+23*(1-(1-phase)**2);
 ctx.save();ctx.beginPath();
 for(const side of [-1,1]){
  ctx.moveTo(x+start*side,y+4);
  ctx.quadraticCurveTo(x+(start+spread*.67)*side,y+4,x+(start+spread)*side,y-7);
  ctx.quadraticCurveTo(x+(start+spread*.56)*side,y-2,x+start*side,y-1);
  ctx.closePath();
 }
 const opacity=alpha*(1-phase)**1.15;
 ctx.globalAlpha=.9*opacity;ctx.lineWidth=2.6;
 ctx.lineJoin='round';ctx.strokeStyle='#9b3526';ctx.stroke();
 ctx.globalAlpha=opacity;ctx.fillStyle='#ffe0a2';ctx.fill();
 ctx.restore();
}

module.exports={preload,drawBadge,captureImpact,checkHalo,checkTrails};
