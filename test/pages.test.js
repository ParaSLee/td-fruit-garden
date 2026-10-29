const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { createService } = require('../shared/service');
const { createMemoryStore } = require('../shared/memory-store');
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
// This transport exercises page controllers against isolated test identities.
// It does not emulate WeChat authentication or replace two-account device acceptance.
function simulatedCloud() {
  const r = runtime({ cloud: true });
  let uid = 'test_alice';
  const service = createService({ store: createMemoryStore(), now: () => Date.parse('2026-10-29T04:00:00Z'), randomId: n => crypto.randomBytes(n).toString('hex') });
  wx.cloud = { async callFunction({ data }) {
    try { return { result: { ok: true, data: await service.execute(data.action, data.data, uid) } }; }
    catch (error) { return { result: { ok: false, error: { code: error.code, message: error.message } } }; }
  } };
  return { ...r, login(next) { uid = next; r.app.globalData.snapshot = null; } };
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
test('simulated cloud page journey joins a team, accepts supervision, reads reminders and removes access', async () => {
  const r = simulatedCloud();
  await r.api.call('goal.create', { category: 'water', title: '每天喝八杯水', days: 7 });
  const team = r.page('team'); team.showCreate();
  team.typeName({ detail: { value: '隔离测试小队' } }); await team.submit();
  const code = team.data.team.inviteCode;
  assert.match(team.onShareAppMessage().path, new RegExp('team=' + code));
  const share = r.page('share'); share.options = { mode: 'supervise' };
  await share.refresh(); await share.generate();
  const token = share.data.token;
  assert.ok(token); assert.match(share.onShareAppMessage().path, new RegExp('token=' + token));
  r.login('test_bobby');
  const invite = r.page('share'); invite.options = { team: code };
  await invite.refresh(); assert.equal(invite.data.invite.memberCount, 1); await invite.joinTeam();
  const partnerTeam = r.page('team'); await partnerTeam.refresh();
  assert.equal(partnerTeam.data.team.members.length, 2);
  assert.equal(partnerTeam.data.team.members.filter(m => m.isSelf).length, 1);
  const receiver = r.page('share'); receiver.options = { token };
  await receiver.refresh(); assert.equal(receiver.data.isOwner, false); assert.equal(receiver.data.watching, false);
  await receiver.joinSupervision(); assert.equal(receiver.data.watching, true);
  await receiver.nudge(); assert.equal(receiver.data.nudgedToday, true);
  const partnerProfile = r.page('profile'); await partnerProfile.refresh();
  assert.equal(partnerProfile.data.watching.length, 1);
  assert.equal(partnerProfile.data.watching[0].nudgedToday, true);
  await assert.rejects(r.api.call('watch.nudge', { watchId: partnerProfile.data.watching[0].id }), { code: 'ALREADY_NUDGED' });
  r.login('test_alice');
  const ownerProfile = r.page('profile'); await ownerProfile.refresh();
  assert.equal(ownerProfile.data.watchers.length, 1);
  assert.equal(ownerProfile.data.nudges.length, 1); assert.equal(ownerProfile.data.nudges[0].read, false);
  await ownerProfile.readNudges(); assert.equal(ownerProfile.data.nudges[0].read, true);
  const watchId = ownerProfile.data.watchers[0].id;
  await ownerProfile.removeWatch({ currentTarget: { dataset: { id: watchId } } });
  assert.equal(ownerProfile.data.watchers.length, 0);
  await share.revoke(); assert.equal(share.data.token, '');
  r.login('test_bobby'); await partnerProfile.refresh();
  assert.equal(partnerProfile.data.watching.length, 0);
  await assert.rejects(r.api.call('watch.nudge', { watchId }), { code: 'WATCH_ACCESS' });
  await receiver.refresh(); assert.match(receiver.data.loadError, /失效/);
  await partnerTeam.leave(); assert.equal(partnerTeam.data.team, null);
  await assert.rejects(r.api.call('team.nudge', { targetId: 'test_alice' }), { code: 'TEAM_ACCESS' });
});
test('profile pagination retains rows after failure, retries and ignores an old response after refresh', async () => {
  const r = simulatedCloud();
  const profile = r.page('profile'); await profile.refresh();
  const originalCall = wx.cloud.callFunction;
  const first = { id: 'first-watch' }; const last = { id: 'last-watch' };
  profile.setData({ watching: [first], watchingNext: first.id });
  const event = { currentTarget: { dataset: { side: 'watching' } } };
  let attempts = 0; let release;
  wx.cloud.callFunction = async request => {
    if (!request.data.data.side) return originalCall(request);
    assert.equal(request.data.data.after, first.id);
    attempts++;
    if (attempts === 1) throw new Error('offline');
    const response = { result: { ok: true, data: { watching: [first, last], watchingNext: '' } } };
    return attempts === 2 ? response : new Promise(resolve => { release = () => resolve(response); });
  };
  await profile.loadMoreWatches(event);
  assert.equal(profile.data.watching.length, 1); assert.equal(profile.data.watchingNext, first.id);
  assert.match(profile.data.watchesError, /网络/); assert.equal(profile.data.loadingWatches, '');
  await profile.loadMoreWatches(event);
  assert.deepEqual(profile.data.watching.map(row => row.id), [first.id, last.id]);
  assert.equal(profile.data.watchingNext, ''); assert.equal(profile.data.watchesError, '');
  profile.setData({ watchingNext: first.id });
  const pending = profile.loadMoreWatches(event);
  assert.equal(profile.data.loadingWatches, 'watching');
  await profile.refresh(); release(); await pending;
  assert.equal(profile.data.watching.length, 0); assert.equal(profile.data.watchingNext, '');
});
