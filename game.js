// Real WeChat Mini Game entry. No App(), Page(), WXML or DOM dependency.
const config = require('./config');
if (wx.cloud && config.cloudEnv) wx.cloud.init({env: config.cloudEnv, traceUser: true});
const Runtime = require('./src/runtime');
const game = new Runtime();
game.start();
// Exported for startup smoke tests; runtime entry remains game.js.
module.exports = game;
