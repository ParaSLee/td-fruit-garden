const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createService } = require('../shared/service');
const { createMemoryStore } = require('../shared/memory-store');
function setup(options = {}) {
  let timestamp = Date.parse('2026-10-29T04:00:00Z');
  const store = createMemoryStore();
  const service = createService({ store, now: () => timestamp, randomId: n => crypto.randomBytes(n).toString('hex'), mediaURLs: async ids => ids.map(id => ({ id, url: 'https://test.invalid/signed/' + id.split('/').pop() })), ...options });
  const call = (action, data = {}, uid = 'alice') => service.execute(action, data, uid);
  const goal = (uid = 'alice') => call('goal.create', { category: 'exercise', title: '每天锻炼半小时', days: 7 }, uid);
  return { store, service, call, goal, nextDay: () => { timestamp += 86400000; }, advance: amount => { timestamp += amount; } };
}
test('runtime identity is required and spoofed payload identity does not change owner', async () => {
  const s = setup();
  await assert.rejects(s.service.execute('bootstrap', {}, ''), { code: 'UNAUTHENTICATED' });
  await assert.rejects(s.call('__proto__'), { code: 'UNKNOWN_ACTION' });
  const g = await s.call('goal.create', { category: 'water', title: '每天八杯水', days: 7, ownerId: 'bob', uid: 'bob' });
  assert.equal((await s.store.get('goals', g.id)).ownerId, 'alice');
  await assert.rejects(s.call('goal.detail', { goalId: g.id }, 'bobby'), { code: 'NOT_FOUND' });
  await assert.rejects(s.call('goal.archive', { goalId: g.id }, 'bobby'), { code: 'NOT_FOUND' });
});
test('concurrent goal creation leaves exactly one active goal', async () => {
  const s = setup();
  const results = await Promise.allSettled([s.goal(), s.goal()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(s.store.snapshot().goals).length, 1);
});
test('same-day retries update one record, preserve initial timestamp and ignore client dates', async () => {
  const s = setup(); const g = await s.goal();
  const first = await s.call('record.save', { goalId: g.id, note: '第一条', photoIds: [], date: '2025-01-01' });
  s.advance(1000);
  await Promise.all([s.call('record.save', { goalId: g.id, note: '补充', photoIds: [] }), s.call('record.save', { goalId: g.id, note: '最后一条', photoIds: [] })]);
  const current = await s.call('bootstrap');
  assert.equal(current.records.length, 1); assert.equal(current.summary.count, 1); assert.equal(current.records[0].date, '2026-10-29');
  assert.equal(current.records[0].createdAt, first.createdAt); assert.equal(current.records[0].note, '最后一条');
  s.nextDay(); await s.call('record.save', { goalId: g.id, note: '', photoIds: [] });
  assert.equal((await s.call('bootstrap')).summary.streak, 2);
});
test('archive keeps history, blocks further edits and permits next goal', async () => {
  const s = setup(); const g = await s.goal();
  await s.call('record.save', { goalId: g.id, note: '保留我', photoIds: [] });
  await s.call('goal.archive', { goalId: g.id });
  assert.equal((await s.call('goal.detail', { goalId: g.id })).records[0].note, '保留我');
  await assert.rejects(s.call('record.save', { goalId: g.id, note: '', photoIds: [] }), { code: 'GOAL_ENDED' });
  const newGoal = await s.goal(); assert.notEqual(newGoal.id, g.id);
});
test('period expiration is enforced by server time', async () => {
  const s = setup(); const g = await s.goal(); s.advance(7 * 86400000);
  await assert.rejects(s.call('record.save', { goalId: g.id, note: '', photoIds: [] }), { code: 'GOAL_ENDED' });
});
test('image ownership, duplication and count are validated before saving', async () => {
  const s = setup(); const g = await s.goal();
  await assert.rejects(s.call('record.save', { goalId: g.id, note: '', photoIds: ['cloud://env.bucket/proofs/bobby/file.jpg'] }), { code: 'INVALID_PHOTO' });
  await assert.rejects(s.call('record.save', { goalId: g.id, note: '', photoIds: ['cloud://env.bucket/proofs/alice/a.jpg', 'cloud://env.bucket/proofs/alice/a.jpg'] }), { code: 'INVALID_INPUT' });
  await assert.rejects(s.call('record.save', { goalId: g.id, note: '', photoIds: [1, 2, 3, 4] }), { code: 'INVALID_INPUT' });
  await s.call('record.save', { goalId: g.id, note: 'private note', photoIds: ['cloud://env.bucket/proofs/alice/a.jpg'] });
  await assert.rejects(s.call('record.media', { goalId: g.id }, 'bobby'), { code: 'NOT_FOUND' });
});
test('content moderation failure does not commit goals or records', async () => {
  const s = setup({ moderate: async value => { if (value.includes('reject')) { const e = new Error('rejected'); e.code = 'CONTENT_REJECTED'; throw e; } } });
  await assert.rejects(s.call('goal.create', { category: 'water', title: 'reject content', days: 7 }), { code: 'CONTENT_REJECTED' });
  assert.equal(Object.keys(s.store.snapshot().goals || {}).length, 0);
});
test('team join is idempotent, one-team invariant holds and private notes/photos never leak', async () => {
  const s = setup(); const g = await s.goal();
  await s.call('record.save', { goalId: g.id, note: 'private secret', photoIds: ['cloud://env.bucket/proofs/alice/a.jpg'] });
  const { team } = await s.call('team.create', { name: '一起坚持' });
  await s.call('team.join', { code: team.id }, 'bobby'); await s.call('team.join', { code: team.id }, 'bobby');
  const result = await s.call('team.get', {}, 'bobby');
  assert.equal(result.team.members.length, 2); assert.ok(!JSON.stringify(result).includes('private secret')); assert.ok(!JSON.stringify(result).includes('cloud://'));
  await assert.rejects(s.call('team.create', { name: '另一队' }, 'bobby'), { code: 'ALREADY_IN_TEAM' });
  await s.call('team.leave');
  const after = await s.call('team.get', {}, 'bobby'); assert.equal(after.team.captainId, 'bobby'); assert.equal(after.team.members.length, 1);
  assert.equal((await s.call('goal.detail', { goalId: g.id })).records.length, 1);
});
test('concurrent joins respect 20-member team capacity', async () => {
  const s = setup(); const { team } = await s.call('team.create', { name: '容量测试' });
  const results = await Promise.allSettled(Array.from({ length: 24 }, (_, i) => s.call('team.join', { code: team.id }, 'member_' + i)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 19);
  assert.equal((await s.store.get('teams', team.id)).memberIds.length, 20);
});
test('invalid team codes count against join rate limit', async () => {
  const s = setup();
  for (let i = 0; i < 30; i++) await assert.rejects(s.call('team.join', { code: 'NOEXIST123' }), { code: 'TEAM_NOT_FOUND' });
  await assert.rejects(s.call('team.join', { code: 'NOEXIST123' }), { code: 'RATE_LIMIT' });
});
test('progress sharing hides notes and images by default and cannot grant supervision', async () => {
  const s = setup(); const g = await s.goal();
  await s.call('record.save', { goalId: g.id, note: 'PRIVATE', photoIds: ['cloud://env.bucket/proofs/alice/a.jpg'] });
  const share = await s.call('share.create', { mode: 'progress' });
  const view = await s.call('share.get', { token: share.token }, 'bobby');
  assert.equal(view.summary.count, 1); assert.ok(!JSON.stringify(view).includes('PRIVATE')); assert.ok(!JSON.stringify(view).includes('cloud://')); assert.equal(view.records[0].photos, undefined);
  await assert.rejects(s.call('share.join', { token: share.token }, 'bobby'), { code: 'SHARE_ACCESS' });
});
test('supervision lists page both directions beyond 50 relationships and keep removal accessible', async () => {
  const s = setup();
  await s.goal();
  const invite = await s.call('share.create', { mode: 'supervise' });
  for (let i = 0; i < 53; i++) {
    const partner = 'partner_' + String(i).padStart(2, '0');
    const goal = await s.goal(partner);
    await s.call('record.save', { goalId: goal.id, note: 'PRIVATE', photoIds: ['cloud://test/proofs/' + partner + '/photo.jpg'] }, partner);
    const other = await s.call('share.create', { mode: 'supervise', includePhotos: true }, partner);
    await s.call('share.join', { token: other.token });
    await s.call('share.join', { token: invite.token }, partner);
  }
  const first = await s.call('watch.list');
  for (const side of ['watching', 'watchers']) {
    assert.equal(first[side].length, 20);
    const rows = [...first[side]];
    let next = first[side + 'Next'];
    while (next) {
      const page = await s.call('watch.list', { side, after: next });
      assert.ok(page[side].length <= 20);
      assert.equal(page[side === 'watching' ? 'watchers' : 'watching'].length, 0);
      rows.push(...page[side]); next = page[side + 'Next'];
    }
    assert.equal(rows.length, 53);
    assert.equal(new Set(rows.map(row => row.id)).size, 53);
    assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
    assert.ok(!JSON.stringify(rows).includes('https://test.invalid/signed/'));
    await s.call('watch.remove', { watchId: rows[52].id });
    assert.equal((await s.store.get('watches', rows[52].id)).enabled, false);
    const outsider = await s.call('watch.list', { side, after: first[side + 'Next'] }, 'outsider');
    assert.equal(outsider[side].length, 0);
  }
  await assert.rejects(s.call('watch.list', { side: 'users' }), { code: 'INVALID_INPUT' });
  await assert.rejects(s.call('watch.list', { side: 'watching', after: {} }), { code: 'INVALID_INPUT' });
});
test('photo sharing requires explicit opt-in; revocation and expiry are enforced', async () => {
  const s = setup(); const g = await s.goal();
  await s.call('record.save', { goalId: g.id, note: 'PRIVATE', photoIds: ['cloud://env.bucket/proofs/alice/a.jpg'] });
  const share = await s.call('share.create', { mode: 'progress', includePhotos: true });
  const view = await s.call('share.get', { token: share.token }, 'bobby');
  assert.equal(view.records[0].photos[0], 'https://test.invalid/signed/a.jpg'); assert.ok(!JSON.stringify(view).includes('PRIVATE'));
  await assert.rejects(s.call('share.revoke', { token: share.token }, 'bobby'), { code: 'NOT_FOUND' });
  await s.call('share.revoke', { token: share.token });
  await assert.rejects(s.call('share.get', { token: share.token }, 'bobby'), { code: 'SHARE_INVALID' });
  const another = await s.call('share.create', { mode: 'progress' }); s.advance(7 * 86400000);
  await assert.rejects(s.call('share.get', { token: another.token }, 'bobby'), { code: 'SHARE_INVALID' });
});
test('supervision requires acceptance, allows one nudge per day and can be removed by either party', async () => {
  const s = setup(); const g = await s.goal();
  const share = await s.call('share.create', { mode: 'supervise' });
  const watchId = g.id + '_bobby';
  await assert.rejects(s.call('watch.nudge', { watchId }, 'bobby'), { code: 'WATCH_ACCESS' });
  await s.call('share.join', { token: share.token }, 'bobby');
  const result = await Promise.allSettled([s.call('watch.nudge', { watchId }, 'bobby'), s.call('watch.nudge', { watchId }, 'bobby')]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await s.call('bootstrap')).nudges.length, 1);
  assert.equal((await s.call('watch.list', {}, 'bobby')).watching.length, 1);
  await s.call('nudges.read'); assert.equal((await s.call('bootstrap')).nudges[0].read, true);
  s.nextDay(); await s.call('watch.nudge', { watchId }, 'bobby');
  await s.call('watch.remove', { watchId });
  assert.equal((await s.call('watch.list', {}, 'bobby')).watching.length, 0);
  await assert.rejects(s.call('watch.nudge', { watchId }, 'bobby'), { code: 'WATCH_ACCESS' });
});
test('strangers and former team members cannot send team nudges', async () => {
  const s = setup(); await s.goal(); const { team } = await s.call('team.create', { name: '权限测试' });
  await assert.rejects(s.call('team.nudge', { targetId: 'alice' }, 'bobby'), { code: 'TEAM_ACCESS' });
  await s.call('team.join', { code: team.id }, 'bobby'); await s.call('team.nudge', { targetId: 'alice' }, 'bobby');
  await assert.rejects(s.call('team.nudge', { targetId: 'alice' }, 'bobby'), { code: 'ALREADY_NUDGED' });
  await s.call('team.leave', {}, 'bobby');
  await assert.rejects(s.call('team.nudge', { targetId: 'alice' }, 'bobby'), { code: 'TEAM_ACCESS' });
});
function interleavedService() {
  const base = createMemoryStore();
  const options = { now: () => Date.parse('2026-10-29T04:00:00Z'), randomId: n => crypto.randomBytes(n).toString('hex') };
  const direct = createService({ ...options, store: base });
  let pending; let mutationCount = 0;
  async function beforeMutation() {
    // The first transaction ensures the caller exists. Commit the competing
    // change before the action's subsequent transaction or standalone write.
    if (pending && ++mutationCount === 2) { const fn = pending; pending = null; await fn(); }
  }
  const store = { ...base,
    async transact(fn) { await beforeMutation(); return base.transact(fn); },
    async set(...args) { await beforeMutation(); return base.set(...args); }
  };
  const service = createService({ ...options, store });
  const call = (action, data = {}, uid = 'alice') => direct.execute(action, data, uid);
  return { call, act: (action, data, uid = 'bobby') => service.execute(action, data, uid), interleave(fn) { pending = fn; mutationCount = 0; }, base };
}
test('a share revoked before supervision is committed cannot create a relationship', async () => {
  const s = interleavedService();
  await s.call('goal.create', { category: 'water', title: '每天八杯水', days: 7 });
  const share = await s.call('share.create', { mode: 'supervise' });
  s.interleave(() => s.call('share.revoke', { token: share.token }));
  await assert.rejects(s.act('share.join', { token: share.token }), { code: 'SHARE_INVALID' });
  assert.equal((await s.call('watch.list', {}, 'bobby')).watching.length, 0);
});
test('a removed supervision relationship cannot authorize an in-flight nudge', async () => {
  const s = interleavedService();
  const goal = await s.call('goal.create', { category: 'water', title: '每天八杯水', days: 7 });
  const share = await s.call('share.create', { mode: 'supervise' });
  await s.call('share.join', { token: share.token }, 'bobby');
  const watchId = goal.id + '_bobby';
  s.interleave(() => s.call('watch.remove', { watchId }));
  await assert.rejects(s.act('watch.nudge', { watchId }), { code: 'WATCH_ACCESS' });
  assert.equal(Object.keys(s.base.snapshot().nudges || {}).length, 0);
});
test('leaving a team before a nudge commits removes its authorization', async () => {
  const s = interleavedService();
  await s.call('goal.create', { category: 'water', title: '每天八杯水', days: 7 });
  const { team } = await s.call('team.create', { name: '并发退出测试' });
  await s.call('team.join', { code: team.id }, 'bobby');
  s.interleave(() => s.call('team.leave', {}, 'bobby'));
  await assert.rejects(s.act('team.nudge', { targetId: 'alice' }), { code: 'TEAM_ACCESS' });
  assert.equal(Object.keys(s.base.snapshot().nudges || {}).length, 0);
});
test('local experience persists private records and refuses to generate fake social links', async () => {
  const s = setup({ cloudEnabled: false }); const g = await s.goal();
  await s.call('record.save', { goalId: g.id, note: 'local', photoIds: ['local:wxfile://proof.jpg'] });
  assert.equal((await s.call('bootstrap')).summary.count, 1);
  for (const [action, data] of [['team.create', { name: 'Test' }], ['share.create', { mode: 'progress' }], ['watch.list', {}]]) await assert.rejects(s.call(action, data), { code: 'CLOUD_REQUIRED' });
});
test('goal history has stable pagination', async () => {
  const s = setup();
  for (let i = 0; i < 25; i++) { const g = await s.goal(); await s.call('goal.archive', { goalId: g.id }); s.advance(1); }
  const first = await s.call('goal.list'); const second = await s.call('goal.list', { after: first.next });
  assert.equal(first.goals.length, 20); assert.equal(second.goals.length, 5); assert.equal(new Set(first.goals.concat(second.goals).map(g => g.id)).size, 25);
});
