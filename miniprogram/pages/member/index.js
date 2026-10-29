const P = require('../../utils/page');
const labels = goals => goals.map(goal => goal.title + (goal.status === 'archived' ? ' · 已结束' : ' · 进行中'));
Page({
  data: { loading: true, loadError: '', owner: {}, goals: [], goalLabels: [], goal: null, summary: null, records: [], selectedGoalId: '', next: '', loadingMore: false, moreError: '' },
  onLoad(options) { this.targetId = options.id || ''; wx.hideShareMenu(); },
  onShow() { this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  async refresh() {
    const version = this.requestVersion = (this.requestVersion || 0) + 1;
    this.setData({ loading: true, loadError: '', loadingMore: false, moreError: '' });
    try {
      const list = await P.api.call('team.memberGoals', { targetId: this.targetId });
      const selectedGoalId = this.data.selectedGoalId || list.activeGoalId || (list.goals[0] || {}).id || '';
      const detail = selectedGoalId ? await P.api.call('team.memberDetail', { targetId: this.targetId, goalId: selectedGoalId }) : { goal: null, summary: null, records: [] };
      if (version !== this.requestVersion) return;
      const goals = list.goals.slice();
      if (detail.goal && !goals.some(goal => goal.id === detail.goal.id)) goals.push(detail.goal);
      this.setData({ owner: list.owner, ...P.decorate(detail), goals, goalLabels: labels(goals), selectedGoalId, next: list.next });
    } catch (error) {
      if (version === this.requestVersion) this.setData({ loadError: error.message, owner: {}, goals: [], goalLabels: [], goal: null, summary: null, records: [], next: '' });
    } finally {
      if (version === this.requestVersion) this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  async chooseGoal(e) {
    const goal = this.data.goals[Number(e.detail.value)];
    if (goal) { this.setData({ selectedGoalId: goal.id }); await this.refresh(); }
  },
  async moreGoals() {
    if (!this.data.next || this.data.loadingMore || this.data.loading) return;
    const version = this.requestVersion;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const list = await P.api.call('team.memberGoals', { targetId: this.targetId, after: this.data.next });
      if (version !== this.requestVersion) return;
      const known = new Set(this.data.goals.map(goal => goal.id));
      const goals = this.data.goals.concat(list.goals.filter(goal => !known.has(goal.id)));
      this.setData({ goals, goalLabels: labels(goals), next: list.next });
    } catch (error) {
      if (version !== this.requestVersion) return;
      if (error.code === 'TEAM_ACCESS') this.setData({ loadError: error.message, owner: {}, goals: [], goal: null, summary: null, records: [], next: '' });
      else this.setData({ moreError: error.message });
    } finally { if (version === this.requestVersion) this.setData({ loadingMore: false }); }
  },
  onUnload() { this.requestVersion = (this.requestVersion || 0) + 1; }
});
