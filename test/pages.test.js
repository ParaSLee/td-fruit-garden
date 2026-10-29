const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../miniprogram');
function runtime({ cloud = false } = {}) {
  for (const key of Object.keys(require.cache)) if (key.startsWith(root)) delete require.cache[key];
  const configFile = require.resolve(path.join(root, 'config.js'));
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: { cloudEnv: cloud ? 'test-cloud' : '' } };
  const storage = {}; const calls = []; const app = { globalData: {} };
  global.getApp = () => app;
  global.wx = {
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = JSON.parse(JSON.stringify(value)); },
    stopPullDownRefresh() {}, showToast(value) { calls.push(['toast', value]); },
    switchTab(value) { calls.push(['switch', value]); }, navigateTo(value) { calls.push(['navigate', value]); }, redirectTo(value) { calls.push(['redirect', value]); },
    hideShareMenu() {}, showShareMenu() {}, vibrateShort() {},
    async chooseMedia() { return { tempFiles: [{ size: 2000, tempFilePath: 'wxfile://temp/proof.jpg' }] }; },
    async compressImage() { return { tempFilePath: 'wxfile://compressed/proof.jpg' }; },
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getFileSystemManager() { return { saveFile(options) { options.success({ savedFilePath: options.filePath }); } }; },
    showModal(options) { calls.push(['modal', options]); options.success && options.success({ confirm: true }); },
    previewImage(value) { calls.push(['preview', value]); }
  };
  function page(name) {
    let definition;
    global.Page = value => { definition = value; };
    const file = path.join(root, 'pages', name, 'index.js');
    delete require.cache[require.resolve(file)]; require(file);
    const instance = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value); }, getTabBar() { return { setData() {} }; } };
    for (const key of Object.keys(definition)) if (typeof definition[key] === 'function') instance[key] = definition[key].bind(instance);
    return instance;
  }
  return { page, app, storage, calls, api: require(path.join(root, 'utils/api.js')) };
}
test('native page controllers create a goal, save photo proof, reopen and update one daily record', async () => {
  const r = runtime(); const goal = r.page('goal');
  await goal.save(); assert.match(goal.data.formError, /2–40/);
  goal.chooseCategory({ currentTarget: { dataset: { id: 'water' } } });
  goal.typeTitle({ detail: { value: '每天喝八杯水' } }); await goal.save();
  assert.ok(r.calls.some(c => c[0] === 'switch'));
  const today = r.page('today'); await today.refresh(); assert.equal(today.data.goal.category, 'water'); assert.equal(today.data.summary.count, 0);
  const checkin = r.page('checkin'); await checkin.refresh(); await checkin.addPhoto();
  assert.equal(checkin.data.photos.length, 1);
  checkin.typeNote({ detail: { value: '做到了' } }); await checkin.save();
  assert.equal(checkin.data.saved, true);
  await today.refresh(); assert.equal(today.data.summary.count, 1); assert.equal(today.data.summary.todayDone, true);
  const stats = r.page('stats'); await stats.refresh();
  assert.equal(stats.data.records[0].note, '做到了'); assert.match(stats.data.records[0].photos[0], /^wxfile:\/\/usr\/proof_/);
  const edit = r.page('checkin'); await edit.refresh(); assert.equal(edit.data.editing, true); assert.equal(edit.data.photos[0].url, stats.data.records[0].photos[0]);
  edit.typeNote({ detail: { value: '补充了今天的记录' } }); await edit.save();
  await stats.refresh(); assert.equal(stats.data.records.length, 1); assert.equal(stats.data.records[0].note, '补充了今天的记录');
  assert.equal(stats.data.summary.count, 1); assert.equal(stats.data.summary.rate, 100);
  assert.equal(Object.keys(r.storage.mm_local_v1.records).length, 1);
});
test('local team and share pages explain cloud dependency without fake success', async () => {
  const r = runtime(); await r.api.call('goal.create', { category: 'sleep', title: '23点前睡觉', days: 21 });
  const team = r.page('team'); await team.refresh(); assert.equal(team.data.team, null); assert.equal(team.data.loadError, '');
  team.showCreate(); assert.ok(r.calls.some(c => c[0] === 'modal')); assert.equal(team.data.form, '');
  const share = r.page('share'); share.options = { mode: 'progress' }; await share.refresh(); await share.generate();
  assert.equal(share.data.token, ''); assert.match(share.data.formError, /云开发/); assert.equal(share.data.generating, false);
});
test('profile nickname, archive and historical statistics work together', async () => {
  const r = runtime(); const g = await r.api.call('goal.create', { category: 'exercise', title: '每天散步三十分钟', days: 7 });
  await r.api.call('record.save', { goalId: g.id, note: '', photoIds: [] });
  const profile = r.page('profile'); await profile.refresh(); profile.typeNickname({ detail: { value: '行动派' } }); await profile.saveNickname();
  assert.equal(profile.data.user.nickname, '行动派'); await profile.finishGoal(); assert.equal(profile.data.goal, null);
  const stats = r.page('stats'); await stats.refresh(); assert.equal(stats.data.goal.status, 'archived'); assert.equal(stats.data.summary.count, 1);
});
test('cloud photo submission retains uploaded proof after a save failure and reuses it on retry', async () => {
  const r = runtime({ cloud: true });
  const snapshot = { user: { id: 'test-user' }, goal: { id: 'test-goal', category: 'water', title: '联调目标' }, summary: { finished: false }, today: '2026-10-29', records: [] };
  let uploads = 0; let saves = 0;
  wx.getFileSystemManager = () => ({ getFileInfo(options) { options.success({ size: 2000 }); } });
  wx.getRandomValues = async () => ({ randomValues: new Uint8Array(16).buffer });
  wx.cloud = {
    async uploadFile() { uploads++; return { fileID: 'cloud://test/proofs/test-user/photo.jpg' }; },
    async callFunction({ data }) {
      if (data.action === 'bootstrap') return { result: { ok: true, data: snapshot } };
      assert.equal(data.action, 'record.save');
      assert.deepEqual(data.data.photoIds, ['cloud://test/proofs/test-user/photo.jpg']);
      saves++;
      return { result: saves === 1 ? { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '请重试' } } : { ok: true, data: { date: '2026-10-29' } } };
    }
  };
  const page = r.page('checkin'); await page.refresh(); await page.addPhoto();
  page.typeNote({ detail: { value: '保留表单' } }); await page.save();
  assert.equal(page.data.saved, false); assert.equal(page.data.note, '保留表单'); assert.equal(page.data.formError, '请重试');
  assert.equal(page.data.photos[0].id, 'cloud://test/proofs/test-user/photo.jpg');
  await page.save();
  assert.equal(page.data.saved, true); assert.equal(uploads, 1); assert.equal(saves, 2);
});
