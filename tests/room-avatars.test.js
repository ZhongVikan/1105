const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Controller = require('../src/controller');
const Renderer = require('../src/renderer');
const Service = require('../cloudfunctions/gameService/service');
const Engine = require('../cloudfunctions/gameService/shared/game-engine');
const { cloudEnv } = require('../config');

const avatarId = user => `cloud://${cloudEnv}.test-bucket/avatars/${user}.png`;
const files = new Map([
  [avatarId('host'), fs.readFileSync(require.resolve('../uiV2_1/avatar_fallback_red.png'))],
  [avatarId('guest'), fs.readFileSync(require.resolve('../uiV2_1/avatar_fallback_black.png'))],
]);

function service() {
  const records = { chess_users: {}, chess_rooms: {}, chess_lobby: {} };
  const downloads = [];
  let uid;
  const db = {
    collection(name) {
      return { doc(id) {
        const collection = records[name];
        return {
          async get() { return { data: structuredClone(collection[id]) }; },
          async set({ data }) { collection[id] = structuredClone(data); },
          async update({ data }) { Object.assign(collection[id], data); },
        };
      } };
    },
    async runTransaction(fn) { return fn(db); },
  };
  const cloud = {
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: uid, ENV: cloudEnv }),
    async downloadFile({ fileID }) {
      downloads.push(fileID);
      return { fileContent: files.get(fileID) };
    },
  };
  const context = {
    Buffer, exports: {}, console: { error() {} },
    require: name => ({ 'wx-server-sdk': cloud, crypto, './service': Service, './shared/game-engine': Engine })[name],
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/gameService/index.js'), 'utf8'), context);
  return {
    records, downloads, call: (user, data) => {
      uid = user;
      return context.exports.main(data);
    },
  };
}

async function startRoom(cloud, match) {
  for (const user of ['host', 'guest']) {
    const result = await cloud.call(user, { action: 'profile', nickname: user, avatar: avatarId(user) });
    assert.equal(result.ok, true);
  }
  const waiting = await cloud.call('host', { action: match ? 'match' : 'create', seatPreference: 'black' });
  const joined = await cloud.call('guest', { action: match ? 'match' : 'join', roomId: waiting.roomId });
  assert.equal(joined.ok, true);
  assert.equal(joined.waiting, false);
  assert.equal(joined.roomId, waiting.roomId);
  return joined.roomId;
}

test('the avatar fallback only reads room members’ avatar files from the game environment', async () => {
  const cloud = service();
  const roomId = await startRoom(cloud, false);
  const request = { action: 'roomAvatar', roomId, fileID: avatarId('guest') };
  assert.equal((await cloud.call('outsider', request)).ok, false);
  assert.equal((await cloud.call('host', { ...request, fileID: avatarId('unrelated') })).ok, false);
  const room = cloud.records.chess_rooms[roomId];
  const original = room.red.avatar;
  for (const fileID of ['cloud://other-env/avatars/guest.png', `cloud://${cloudEnv}/private/report.png`]) {
    room.red.avatar = fileID;
    assert.equal((await cloud.call('host', { ...request, fileID })).ok, false);
  }
  room.red.avatar = original;
  assert.deepEqual(cloud.downloads, []);
  const portrait = await cloud.call('host', request);
  assert.equal(portrait.format, 'png');
  assert.deepEqual(Buffer.from(portrait.base64, 'base64'), files.get(request.fileID));
});

for (const match of [false, true]) {
  test(`${match ? 'matchmaking' : 'friend invitation'}: each device decodes the opponent portrait with owner-only storage`, async t => {
    const cloud = service();
    const roomId = await startRoom(cloud, match);
    t.after(() => delete global.wx);
    for (const user of ['host', 'guest']) {
      const local = new Map();
      const storage = {
        writeFile({ filePath, data, encoding, success }) {
          local.set(filePath, Buffer.from(data, encoding));
          success();
        },
        unlink({ filePath }) { local.delete(filePath); },
      };
      global.wx = {
        env: { USER_DATA_PATH: '/sandbox' },
        getFileSystemManager: () => storage,
        cloud: {
          async downloadFile({ fileID }) {
            if (fileID !== avatarId(user)) throw Error('owner only');
            local.set('/sandbox/own.png', files.get(fileID));
            return { tempFilePath: '/sandbox/own.png' };
          },
          async callFunction({ data }) { return { result: await cloud.call(user, data) }; },
        },
        createImage: () => ({
          set src(path) {
            this.bytes = local.get(path);
            if (this.bytes) this.onload();
            else this.onerror();
          },
        }),
      };
      const controller = {
        ...Controller, _alive: true, _mode: 'online', data: { ...Controller.data },
        setData(patch) { Object.assign(this.data, patch); }, sync() {}, tick() {},
      };
      controller.applyRoom(await cloud.call(user, { action: 'poll', roomId }));
      clearTimeout(controller._matchFoundTimer);
      const renderer = Object.assign(Object.create(Renderer.prototype), { runtime: { controller }, invalidate() {} });
      const opponent = avatarId(user === 'host' ? 'guest' : 'host');
      assert.equal(controller.data.topAvatar, opponent);
      assert.equal(controller.data.bottomAvatar, avatarId(user));
      assert.equal(renderer.avatarImage(opponent), null, 'room renders while the avatar is loading');
      assert.equal(renderer.avatarImage(opponent), null, 'a second frame shares the download');
      renderer.avatarImage(avatarId(user));
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(renderer.avatarImage(opponent).bytes, files.get(opponent));
      assert.deepEqual(renderer.avatarImage(avatarId(user)).bytes, files.get(avatarId(user)));
      assert.deepEqual([...local.keys()], ['/sandbox/own.png'], 'transport file is removed after decoding');
    }
    assert.deepEqual(cloud.downloads, [avatarId('guest'), avatarId('host')]);
  });
}
