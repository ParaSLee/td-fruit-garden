const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/domain');
const goal = { id: 'g_test', category: 'exercise', title: '每天跑步 30 分钟', days: 7, startDate: '2026-10-29', status: 'active' };
const records = dates => dates.map(date => ({ goalId: goal.id, date }));
test('Beijing day boundary does not depend on host timezone', () => {
  assert.equal(D.dateKey(Date.parse('2026-10-29T15:59:59Z')), '2026-10-29');
  assert.equal(D.dateKey(Date.parse('2026-10-29T16:00:00Z')), '2026-10-30');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
});
test('completion rate excludes future days, ignores duplicates, other goals and future records', () => {
  const result = D.summary(goal, [...records(['2026-10-29', '2026-10-29', '2026-10-31']), { goalId: 'other', date: '2026-10-30' }], '2026-10-30');
  assert.equal(result.count, 1); assert.equal(result.elapsed, 2); assert.equal(result.rate, 50); assert.equal(result.progress, 14);
  assert.equal(result.weekEligible, 2); assert.equal(result.weekDone, 1); assert.equal(result.calendar.filter(d => d.future).length, 5);
});
test('current streak survives before today is checked, and breaks after a missed day', () => {
  assert.equal(D.summary(goal, records(['2026-10-29', '2026-10-30']), '2026-10-31').streak, 2);
  assert.equal(D.summary(goal, records(['2026-10-29', '2026-10-30']), '2026-11-01').streak, 0);
  const result = D.summary(goal, records(['2026-10-29', '2026-10-30', '2026-11-01']), '2026-11-01');
  assert.equal(result.streak, 1); assert.equal(result.best, 2);
});
test('completed period uses bounded denominator and status', () => {
  const result = D.summary(goal, records(['2026-10-29']), '2026-11-10');
  assert.equal(result.elapsed, 7); assert.equal(result.finished, true); assert.equal(result.rate, 14);
});
test('archived challenge statistics stop at its archive date', () => {
  const archived = { ...goal, status: 'archived', endedAt: Date.parse('2026-10-29T12:00:00+08:00') };
  const result = D.summary(archived, records(['2026-10-29']), '2026-11-10');
  assert.equal(result.elapsed, 1); assert.equal(result.rate, 100); assert.equal(result.streak, 1); assert.equal(result.finished, true);
});
test('goal validation enforces exactly the three categories, bounded content and supported duration', () => {
  for (const category of ['sleep', 'water', 'exercise']) assert.equal(D.validateGoal({ category, title: '  每天做一点  ', days: 21 }).title, '每天做一点');
  for (const input of [{ category: 'other', title: 'test', days: 21 }, { category: 'sleep', title: 'x', days: 21 }, { category: 'water', title: 'test', days: 999 }]) assert.throws(() => D.validateGoal(input), { code: 'INVALID_INPUT' });
});
