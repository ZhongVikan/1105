// Logical layout stays unchanged. Limit actual backing pixels, not device clarity to 1.5x.
function dpr(info,low=false){const native=Math.max(1,Number(info.pixelRatio)||1),pixels=Math.max(1,info.windowWidth*info.windowHeight),budget=low?1800000:3600000;return Math.min(native,low?2:3,Math.sqrt(budget/pixels));}
function boardScale(width,screenScale=1,pixelRatio=1){return Math.max(1,Math.min(2,Math.ceil(width*screenScale*pixelRatio/720*4)/4));}
module.exports={dpr,boardScale};
