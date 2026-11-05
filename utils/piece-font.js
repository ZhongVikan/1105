const fallback='"KaiTi", "STKaiti", "Kaiti SC", serif';
exports.load=()=>{try{const family=wx.loadFont&&wx.loadFont('assets/fonts/DarkChessKai.ttf');return family?'"'+family+'", '+fallback:fallback;}catch(error){return fallback;}};
exports.style=(family,r)=>'normal '+Math.max(9,r*1.18)+'px '+family;
