const D = require('./domain');
const COLLECTIONS = ['users', 'goals', 'records', 'teams', 'shares', 'watches', 'nudges', 'limits'];
function createService({ store, now = Date.now, randomId, mediaURLs = async ids => ids.map(id => ({ id, url: id })), validateMedia = async () => {}, moderate = async () => {}, cloudEnabled = true }) {
  const needCloud = () => D.assert(cloudEnabled, 'CLOUD_REQUIRED', '连接云开发后，就能和真实好友组队、分享与互相督促');
  const getOwnGoal = async (uid, goalId) => {
    const goal = await store.get('goals', goalId);
    D.assert(goal && goal.ownerId === uid, 'NOT_FOUND', '这个目标不存在');
    return goal;
  };
  const getRecords = goalId => store.list('records', { goalId }, { limit: 100, orderBy: 'date', direction: 'desc' });
  const getSummary = async goal => goal ? D.summary(goal, await getRecords(goal.id), D.dateKey(now())) : null;
  async function ensureUser(uid) {
    return store.transact(async tx => {
      let user = await tx.get('users', uid);
      if (!user) {
        user = { id: uid, nickname: '猛男' + uid.slice(-4).toUpperCase(), color: '#D75A32', activeGoalId: '', teamId: '', createdAt: now() };
        await tx.set('users', uid, user);
      }
      return user;
    });
  }
  async function readableShare(token) {
    D.assert(typeof token === 'string' && /^[a-zA-Z0-9_-]{32,100}$/.test(token), 'SHARE_INVALID', '分享链接已失效');
    const share = await store.get('shares', token);
    D.assert(share && !share.revoked && share.expiresAt > now(), 'SHARE_INVALID', '分享已失效，请让好友重新分享');
    const goal = await store.get('goals', share.goalId);
    D.assert(goal, 'SHARE_INVALID', '这个目标已不可访问');
    return { share, goal };
  }
  async function viewProgress(goal, includePhotos) {
    const records = await getRecords(goal.id);
    const user = await store.get('users', goal.ownerId);
    const recent = records.slice(0, 14).map(r => ({ date: r.date, photoIds: includePhotos ? r.photoIds : [] }));
    if (includePhotos) {
      const ids = [...new Set(recent.flatMap(r => r.photoIds))];
      const urls = ids.length ? await mediaURLs(ids) : [];
      for (const record of recent) record.photos = record.photoIds.map(id => (urls.find(item => item.id === id) || {}).url).filter(Boolean);
    }
    for (const record of recent) delete record.photoIds;
    return { owner: D.publicUser(user), goal: D.publicGoal(goal), summary: D.summary(goal, records, D.dateKey(now())), records: recent };
  }
  async function teamView(uid, teamId) {
    if (!teamId) return null;
    const team = await store.get('teams', teamId);
    D.assert(team && team.memberIds.includes(uid), 'TEAM_ACCESS', '你还不是这个小队的成员');
    const members = await Promise.all(team.memberIds.map(async id => {
      const user = await store.get('users', id);
      const goal = user.activeGoalId ? await store.get('goals', user.activeGoalId) : null;
      const stats = await getSummary(goal);
      const nudgeId = 'team_' + team.id + '_' + uid + '_' + id + '_' + D.dateKey(now());
      return { ...D.publicUser(user), isSelf: id === uid, captain: team.captainId === id, goal: D.publicGoal(goal), summary: stats, nudgedToday: !!(await store.get('nudges', nudgeId)) };
    }));
    return { id: team.id, name: team.name, motto: team.motto, inviteCode: team.id, captainId: team.captainId, members, checkedToday: members.filter(m => m.summary && m.summary.todayDone).length, maxMembers: 20 };
  }
  async function nudge(uid, ownerId, goalId, key, textIndex) {
    D.assert(uid !== ownerId, 'SELF_NUDGE', '不用提醒自己，直接去打卡吧');
    D.assert(Number.isInteger(textIndex) && textIndex >= 0 && textIndex < D.NUDGE_TEXTS.length, 'INVALID_INPUT', '请选择提醒语');
    const sender = await store.get('users', uid);
    const targetGoal = await store.get('goals', goalId);
    D.assert(targetGoal && targetGoal.status === 'active' && D.dateKey(now()) <= D.addDays(targetGoal.startDate, targetGoal.days - 1), 'GOAL_ENDED', '这个挑战已结束');
    await store.transact(async tx => {
      const existing = await tx.get('nudges', key);
      D.assert(!existing, 'ALREADY_NUDGED', '今天已经提醒过啦，给 TA 一点时间');
      await tx.set('nudges', key, { id: key, ownerId, senderId: uid, senderName: sender.nickname, goalId, text: D.NUDGE_TEXTS[textIndex], date: D.dateKey(now()), createdAt: now(), read: false });
    });
    return { sent: true };
  }
  const actions = {
    async bootstrap(_, uid, user) {
      const goal = user.activeGoalId ? await store.get('goals', user.activeGoalId) : null;
      const records = goal ? await getRecords(goal.id) : [];
      const nudges = await store.list('nudges', { ownerId: uid }, { limit: 20, orderBy: 'createdAt', direction: 'desc' });
      return { user: { ...D.publicUser(user), teamId: user.teamId }, goal: D.publicGoal(goal), records, summary: D.summary(goal, records, D.dateKey(now())), nudges, today: D.dateKey(now()), cloudEnabled };
    },
    async 'profile.save'(data, uid) {
      const nickname = D.text(data.nickname, 1, 16, '昵称');
      await moderate(nickname);
      return store.transact(async tx => {
        const user = await tx.get('users', uid);
        user.nickname = nickname;
        await tx.set('users', uid, user);
        return D.publicUser(user);
      });
    },
    async 'goal.create'(data, uid) {
      const input = D.validateGoal(data);
      await moderate(input.title);
      const id = 'g_' + now() + '_' + randomId(8);
      return store.transact(async tx => {
        const user = await tx.get('users', uid);
        D.assert(!user.activeGoalId, 'ACTIVE_GOAL_EXISTS', '先结束当前目标，再开始下一个挑战');
        const goal = { ...input, id, ownerId: uid, startDate: D.dateKey(now()), status: 'active', createdAt: now() };
        await tx.set('goals', id, goal);
        user.activeGoalId = id;
        await tx.set('users', uid, user);
        return D.publicGoal(goal);
      });
    },
    async 'goal.archive'(data, uid) {
      return store.transact(async tx => {
        const user = await tx.get('users', uid);
        const goal = await tx.get('goals', data.goalId);
        D.assert(goal && goal.ownerId === uid, 'NOT_FOUND', '这个目标不存在');
        if (goal.status === 'archived') return { archived: true };
        goal.status = 'archived'; goal.endedAt = now();
        await tx.set('goals', goal.id, goal);
        if (user.activeGoalId === goal.id) { user.activeGoalId = ''; await tx.set('users', uid, user); }
        return { archived: true };
      });
    },
    async 'goal.list'(data, uid) {
      const after = typeof data.after === 'string' ? data.after : '';
      const rows = await store.list('goals', { ownerId: uid }, { limit: 21, orderBy: 'id', direction: 'desc', after });
      return { goals: rows.slice(0, 20).map(D.publicGoal), next: rows.length > 20 ? rows[19].id : '' };
    },
    async 'goal.detail'(data, uid) {
      const goal = await getOwnGoal(uid, data.goalId);
      const records = await getRecords(goal.id);
      return { goal: D.publicGoal(goal), records, summary: D.summary(goal, records, D.dateKey(now())) };
    },
    async 'record.save'(data, uid) {
      D.assert(Array.isArray(data.photoIds) && data.photoIds.length <= 3, 'INVALID_INPUT', '最多上传 3 张照片');
      D.assert(new Set(data.photoIds).size === data.photoIds.length, 'INVALID_INPUT', '照片不能重复');
      const note = D.text(data.note || '', 0, 200, '打卡感想');
      await moderate(note);
      for (const id of data.photoIds) D.assert(typeof id === 'string' && (cloudEnabled ? /^cloud:\/\/[^/]+\/proofs\//.test(id) && id.includes('/proofs/' + uid + '/') : id.startsWith('local:')), 'INVALID_PHOTO', '照片凭证无效，请重新上传');
      await validateMedia(data.photoIds, uid);
      return store.transact(async tx => {
        const user = await tx.get('users', uid);
        const goal = user.activeGoalId ? await tx.get('goals', user.activeGoalId) : null;
        const today = D.dateKey(now());
        D.assert(goal && goal.id === data.goalId && goal.ownerId === uid && goal.status === 'active', 'GOAL_ENDED', '目标已变化，请返回首页刷新');
        D.assert(today >= goal.startDate && today <= D.addDays(goal.startDate, goal.days - 1), 'GOAL_ENDED', '这次挑战已结束，开始新的目标吧');
        const id = goal.id + '_' + today;
        const existing = await tx.get('records', id);
        const record = { id, goalId: goal.id, ownerId: uid, date: today, note, photoIds: data.photoIds, createdAt: existing ? existing.createdAt : now(), updatedAt: now() };
        await tx.set('records', id, record);
        return record;
      });
    },
    async 'record.media'(data, uid) {
      const goal = await getOwnGoal(uid, data.goalId);
      const records = await getRecords(goal.id);
      const ids = [...new Set(records.flatMap(r => r.photoIds))];
      return { files: ids.length ? await mediaURLs(ids) : [] };
    },
    async 'team.get'(_, uid, user) { needCloud(); return { team: await teamView(uid, user.teamId) }; },
    async 'team.create'(data, uid) {
      needCloud();
      const name = D.text(data.name, 2, 20, '小队名称');
      const motto = D.text(data.motto || '一起坚持，说到做到。', 1, 40, '小队宣言');
      await moderate(name + ' ' + motto);
      const id = randomId(8).toUpperCase();
      await store.transact(async tx => {
        const user = await tx.get('users', uid);
        D.assert(!user.teamId, 'ALREADY_IN_TEAM', '先退出当前小队，再加入新的小队');
        D.assert(!(await tx.get('teams', id)), 'RETRY', '请重试创建小队');
        await tx.set('teams', id, { id, name, motto, captainId: uid, memberIds: [uid], createdAt: now() });
        user.teamId = id; await tx.set('users', uid, user);
      });
      return { team: await teamView(uid, id) };
    },
    async 'team.preview'(data) {
      needCloud();
      const code = D.text(data.code, 8, 32, '邀请码').toUpperCase();
      const team = await store.get('teams', code);
      D.assert(team && team.memberIds.length, 'TEAM_NOT_FOUND', '没有找到这个小队，请检查邀请码');
      return { name: team.name, motto: team.motto, memberCount: team.memberIds.length, maxMembers: 20 };
    },
    async 'team.join'(data, uid) {
      needCloud();
      const code = D.text(data.code, 8, 32, '邀请码').toUpperCase();
      const limitKey = 'join_' + uid + '_' + D.dateKey(now());
      // Count failed attempts as well; keep rate-limiting outside the join transaction.
      await store.transact(async tx => {
        const limit = await tx.get('limits', limitKey) || { id: limitKey, attempts: 0 };
        D.assert(limit.attempts < 30, 'RATE_LIMIT', '今天尝试次数较多，请明天再试');
        limit.attempts++; await tx.set('limits', limitKey, limit);
      });
      await store.transact(async tx => {
        const user = await tx.get('users', uid);
        if (user.teamId === code) return;
        D.assert(!user.teamId, 'ALREADY_IN_TEAM', '请先退出当前小队');
        const team = await tx.get('teams', code);
        D.assert(team && team.memberIds.length, 'TEAM_NOT_FOUND', '没有找到这个小队，请检查邀请码');
        D.assert(team.memberIds.length < 20, 'TEAM_FULL', '小队已满 20 人，试试创建自己的小队');
        team.memberIds.push(uid); user.teamId = code;
        await tx.set('teams', code, team); await tx.set('users', uid, user);
      });
      return { team: await teamView(uid, code) };
    },
    async 'team.leave'(_, uid) {
      needCloud();
      await store.transact(async tx => {
        const user = await tx.get('users', uid);
        if (!user.teamId) return;
        const team = await tx.get('teams', user.teamId);
        if (team) { team.memberIds = team.memberIds.filter(id => id !== uid); if (team.captainId === uid) team.captainId = team.memberIds[0] || ''; await tx.set('teams', team.id, team); }
        user.teamId = ''; await tx.set('users', uid, user);
      });
      return { left: true };
    },
    async 'team.nudge'(data, uid, user) {
      needCloud();
      const team = user.teamId ? await store.get('teams', user.teamId) : null;
      D.assert(team && team.memberIds.includes(uid) && team.memberIds.includes(data.targetId), 'TEAM_ACCESS', '只能提醒当前小队的成员');
      const target = await store.get('users', data.targetId);
      D.assert(target && target.teamId === team.id && target.activeGoalId, 'NO_GOAL', 'TA 还没有开始挑战');
      return nudge(uid, target.id, target.activeGoalId, 'team_' + team.id + '_' + uid + '_' + target.id + '_' + D.dateKey(now()), Number(data.textIndex || 0));
    },
    async 'share.create'(data, uid, user) {
      needCloud();
      D.assert(data.mode === 'progress' || data.mode === 'supervise', 'INVALID_INPUT', '分享类型不正确');
      const goal = user.activeGoalId ? await getOwnGoal(uid, user.activeGoalId) : null;
      D.assert(goal, 'NO_GOAL', '先创建一个打卡目标');
      const token = randomId(24);
      const share = { id: token, ownerId: uid, goalId: goal.id, mode: data.mode, includePhotos: data.includePhotos === true, createdAt: now(), expiresAt: now() + 7 * D.DAY, revoked: false };
      await store.set('shares', token, share);
      return { token, expiresAt: share.expiresAt, mode: share.mode, includePhotos: share.includePhotos, ...(await viewProgress(goal, share.includePhotos)) };
    },
    async 'share.get'(data, uid) {
      needCloud();
      const { share, goal } = await readableShare(data.token);
      const watch = await store.get('watches', goal.id + '_' + uid);
      const nudgeKey = 'watch_' + goal.id + '_' + uid + '_' + D.dateKey(now());
      return { ...(await viewProgress(goal, share.includePhotos)), mode: share.mode, includePhotos: share.includePhotos, expiresAt: share.expiresAt, isOwner: uid === share.ownerId, watching: !!(watch && watch.enabled), nudgedToday: !!(await store.get('nudges', nudgeKey)) };
    },
    async 'share.revoke'(data, uid) {
      needCloud();
      return store.transact(async tx => {
        const share = await tx.get('shares', data.token);
        D.assert(share && share.ownerId === uid, 'NOT_FOUND', '没有找到这个分享');
        share.revoked = true; await tx.set('shares', share.id, share);
        return { revoked: true };
      });
    },
    async 'share.join'(data, uid) {
      needCloud();
      const { share, goal } = await readableShare(data.token);
      D.assert(share.mode === 'supervise', 'SHARE_ACCESS', '这是进度分享，请让好友发送督促邀请');
      D.assert(share.ownerId !== uid, 'SELF_NUDGE', '邀请一个好友来监督你吧');
      D.assert(goal.status === 'active', 'GOAL_ENDED', '这个目标已结束');
      const id = goal.id + '_' + uid;
      await store.set('watches', id, { id, watcherId: uid, ownerId: share.ownerId, goalId: goal.id, enabled: true, createdAt: now() });
      return { watching: true };
    },
    async 'watch.list'(_, uid) {
      needCloud();
      const watching = await store.list('watches', { watcherId: uid, enabled: true }, { limit: 50 });
      const watchers = await store.list('watches', { ownerId: uid, enabled: true }, { limit: 50 });
      return {
        watching: await Promise.all(watching.map(async watch => ({ id: watch.id, ...(await viewProgress(await store.get('goals', watch.goalId), false)), nudgedToday: !!(await store.get('nudges', 'watch_' + watch.goalId + '_' + uid + '_' + D.dateKey(now()))) }))),
        watchers: await Promise.all(watchers.map(async watch => ({ id: watch.id, goalId: watch.goalId, user: D.publicUser(await store.get('users', watch.watcherId)) })))
      };
    },
    async 'watch.nudge'(data, uid) {
      needCloud();
      const watch = await store.get('watches', data.watchId);
      D.assert(watch && watch.watcherId === uid && watch.enabled, 'WATCH_ACCESS', '你还没有成为这个目标的监督人');
      return nudge(uid, watch.ownerId, watch.goalId, 'watch_' + watch.goalId + '_' + uid + '_' + D.dateKey(now()), Number(data.textIndex || 0));
    },
    async 'watch.remove'(data, uid) {
      needCloud();
      return store.transact(async tx => {
        const watch = await tx.get('watches', data.watchId);
        D.assert(watch && (watch.ownerId === uid || watch.watcherId === uid), 'WATCH_ACCESS', '没有权限修改这个监督关系');
        watch.enabled = false; await tx.set('watches', watch.id, watch);
        return { removed: true };
      });
    },
    async 'nudges.read'(_, uid) {
      const rows = await store.list('nudges', { ownerId: uid, read: false }, { limit: 50 });
      await Promise.all(rows.map(r => store.set('nudges', r.id, { ...r, read: true })));
      return { read: rows.length };
    }
  };
  return {
    async execute(action, data, uid) {
      D.assert(typeof uid === 'string' && uid.length >= 4, 'UNAUTHENTICATED', '请重新进入小程序登录');
      D.assert(Object.prototype.hasOwnProperty.call(actions, action), 'UNKNOWN_ACTION', '暂不支持这个操作');
      D.assert(data && typeof data === 'object' && !Array.isArray(data), 'INVALID_INPUT', '请求格式不正确');
      const user = await ensureUser(uid);
      return actions[action](data, uid, user);
    }
  };
}
module.exports = { createService, COLLECTIONS };
