// Edit assets/audio-map.json, then run node tools/build-audio-map.js.
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const map=JSON.parse(fs.readFileSync(path.join(root,'assets/audio-map.json'),'utf8')),voices={};
for(const [name,file] of Object.entries(map.files)){if(name.includes('..')||file.src.includes('..')||path.isAbsolute(file.src))throw new Error('Unsafe audio resource path: '+file.src);const key=file.key||path.basename(name,path.extname(name)).replace(/^\d+_/,'');voices[key]=file.src;}
fs.writeFileSync(path.join(root,'utils/audio-map.js'),'module.exports='+JSON.stringify(map)+';\n');
fs.writeFileSync(path.join(root,'utils/voice-manifest.js'),'module.exports='+JSON.stringify(voices)+';\n');
