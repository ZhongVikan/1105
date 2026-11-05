const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
global.wx={createCanvas:()=>createCanvas(1,1)};
class Renderer {constructor(){this.canvas=createCanvas(1125,390);this.ctx=this.canvas.getContext('2d');this.runtime={variant:'dark'};this.targets=[];}}
require('../src/ui-v2').install(Renderer);
(async()=>{const im=await loadImage(path.join(__dirname,'../uiTitle/mode_reference.jpg'));
const r=new Renderer();r.uiImage=()=>im;r.ctx.fillStyle='#f7efdf';r.ctx.fillRect(0,0,1125,390);r.ctx.scale(3,3);
['dark','classic','jieqi'].forEach((selected,row)=>{r.runtime.variant=selected;['dark','classic','jieqi'].forEach((variant,i)=>{r.referenceModeButton(variant,28+110*i,8+42*row,101,31,()=>{r.runtime.variant=variant;});});});
assert.equal(r.targets.length,9);assert.equal(Object.keys(r._modeSprites).length,6);r.targets.forEach((target,i)=>{target.action();assert.equal(r.runtime.variant,['dark','classic','jieqi'][i%3]);});
fs.writeFileSync(process.argv[2],r.canvas.toBuffer('image/png'));
console.log('All three selected states render; 9 callbacks and 6 cached sprites verified.');
})();
