/* Shared by the mini program and cloud function. Run npm run build after edits. */
const DAY = 86400000;
const CATEGORIES = [
  { id: 'sleep', name: '早睡', icon: '☾', color: '#7163AD', label: '早点休息，明天更有力', placeholder: '例如：23:00 前放下手机睡觉', suggestion: '23:00 前睡觉' },
  { id: 'water', name: '多喝水', icon: '◉', color: '#3886AF', label: '给身体补满能量', placeholder: '例如：每天喝够 8 杯水', suggestion: '每天喝够 8 杯水' },
  { id: 'exercise', name: '锻炼', icon: '↗', color: '#D75A32', label: '动起来，就是进步', placeholder: '例如：每天运动 30 分钟', suggestion: '每天运动 30 分钟' }
];
const DURATIONS = [7, 14, 21, 30, 60, 90];
const NUDGE_TEXTS = ['说到做到，今天也别掉队 💪', '你的搭子来查岗啦，记得打卡！', '今天的一小步，明天的一大步。'];
class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function assert(condition, code, message) { if (!condition) throw new AppError(code, message); }
function dateKey(value = Date.now()) { return new Date(Number(value) + 8 * 3600000).toISOString().slice(0, 10); }
function dayNumber(key) { return Math.floor(Date.parse(key + 'T00:00:00+08:00') / DAY); }
function addDays(key, days) { return dateKey(Date.parse(key + 'T00:00:00+08:00') + days * DAY); }
function category(id) { return CATEGORIES.find(item => item.id === id) || CATEGORIES[2]; }
function text(value, min, max, label) {
  assert(typeof value === 'string', 'INVALID_INPUT', label + '格式不正确');
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 'INVALID_INPUT', label + '请填写 ' + min + '–' + max + ' 个字');
  return result;
}
function validateGoal(input) {
  assert(input && CATEGORIES.some(item => item.id === input.category), 'INVALID_INPUT', '请选择打卡分类');
  assert(DURATIONS.includes(Number(input.days)), 'INVALID_INPUT', '请选择支持的挑战周期');
  return { category: input.category, title: text(input.title, 2, 40, '打卡内容'), days: Number(input.days) };
}
function summary(goal, records, today = dateKey()) {
  if (!goal) return null;
  const observedToday = today;
  if (goal.status === 'archived' && goal.endedAt) today = today < dateKey(goal.endedAt) ? today : dateKey(goal.endedAt);
  const end = addDays(goal.startDate, goal.days - 1);
  const valid = records.filter(item => item.goalId === goal.id && item.date >= goal.startDate && item.date <= end && item.date <= today);
  const dates = new Set(valid.map(item => item.date));
  const count = dates.size;
  const elapsed = Math.max(0, Math.min(goal.days, dayNumber(today) - dayNumber(goal.startDate) + 1));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  let best = 0; let running = 0;
  const calendar = Array.from({ length: goal.days }, (_, index) => {
    const date = addDays(goal.startDate, index);
    const done = dates.has(date);
    running = done ? running + 1 : 0;
    best = Math.max(best, running);
    return { date, day: Number(date.slice(8)), done, today: date === today, future: date > today, label: date.slice(5).replace('-', '/') };
  });
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    return { date, label: ['日', '一', '二', '三', '四', '五', '六'][new Date(date + 'T12:00:00+08:00').getUTCDay()], done: dates.has(date), eligible: date >= goal.startDate && date <= end, today: date === today };
  });
  const weekEligible = week.filter(item => item.eligible).length;
  const weekDone = week.filter(item => item.done).length;
  return {
    count, elapsed, streak, best, todayDone: dates.has(today), endDate: end,
    dayIndex: Math.max(1, Math.min(goal.days, elapsed)), remaining: Math.max(0, goal.days - count),
    progress: Math.round(count / goal.days * 100), rate: elapsed ? Math.round(count / elapsed * 100) : 0,
    weekRate: weekEligible ? Math.round(weekDone / weekEligible * 100) : 0,
    weekDone, weekEligible, calendar, week,
    finished: observedToday > end || goal.status === 'archived',
    insight: count === 0 ? '第一步不必完美，先为今天留下记录。' : streak >= 7 ? '你已经连续坚持 ' + streak + ' 天，节奏保持得很好。' : weekDone >= 5 ? '最近 7 天完成了 ' + weekDone + ' 次，继续保持这个节奏。' : '最近 7 天完成了 ' + weekDone + ' 次，下一个小目标：连续坚持 3 天。'
  };
}
function publicGoal(goal) { return goal ? { id: goal.id, category: goal.category, title: goal.title, days: goal.days, startDate: goal.startDate, status: goal.status, endedAt: goal.endedAt || null } : null; }
function publicUser(user) { return { id: user.id, nickname: user.nickname, initial: user.nickname.slice(0, 1), color: user.color || '#D75A32' }; }
module.exports = { DAY, CATEGORIES, DURATIONS, NUDGE_TEXTS, AppError, assert, dateKey, addDays, dayNumber, category, text, validateGoal, summary, publicGoal, publicUser };
