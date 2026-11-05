const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),cfg=require('../game.json'),project=require('../project.config.json');
const ignored=new Set(project.packOptions.ignore.filter(r=>r.type==='folder').map(r=>r.value));
function size(p){const s=fs.statSync(p);return s.isDirectory()?fs.readdirSync(p).reduce((n,f)=>n+size(path.join(p,f)),0):s.size;}
const packages=cfg.subpackages.map(p=>({name:p.name,root:p.root,bytes:size(path.join(root,p.root))}));
const roots=new Set(cfg.subpackages.map(p=>p.root.replace(/\/$/,'')));
const main=fs.readdirSync(root).filter(f=>!ignored.has(f)&&!roots.has(f)&&!f.startsWith('.')).reduce((n,f)=>n+size(path.join(root,f)),0);
const assets=require('../src/ui-assets');for(const [key,file]of Object.entries(assets))if(!fs.existsSync(path.join(root,file)))throw Error('Missing asset '+key+': '+file);
const shared=['coordinates.js','rules-core.js','game-engine.js','stickers.js','motifs.js','fusion.js'];for(const f of shared)if(!fs.readFileSync(path.join(root,'utils',f)).equals(fs.readFileSync(path.join(root,'cloudfunctions/gameService/shared',f))))throw Error('Server rules out of sync: '+f);
const result={mainBytes:main,totalBytes:main+packages.reduce((n,p)=>n+p.bytes,0),packages,assets:Object.keys(assets).length,serverRules:'synchronized',note:'Source-byte check; final WeChat compiler output and platform quota must be verified in developer tools.'};
if(main>4*1024*1024||packages.some(p=>p.bytes>2*1024*1024))throw Error('Package exceeds conservative source budget');console.log(JSON.stringify(result,null,2));
