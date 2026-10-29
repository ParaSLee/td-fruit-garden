const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', goals: [], goal: null, records: [], summary: null, selectedGoalId: '', goalLabels: [], next: '', loadingMore: false },
  onShow() { P.selectTab(this, 2); this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  refresh() { return P.load(this, async () => {
    const snapshot = await P.api.bootstrap();
    const list = await P.api.call('goal.list');
    const goals = list.goals.concat(this.data.goals.filter(g => !list.goals.some(n => n.id === g.id)));
    const selected = goals.find(g => g.id === this.data.selectedGoalId) || goals.find(g => snapshot.goal && g.id === snapshot.goal.id) || goals[0];
    const detail = selected ? await P.api.call('goal.detail', { goalId: selected.id }) : { goal: null, summary: null, records: [] };
    const media = selected ? await P.api.call('record.media', { goalId: selected.id }) : { files: [] };
    return { ...P.decorate(detail), goals, goalLabels: goals.map(g => g.title + (g.status === 'archived' ? ' · 已结束' : ' · 进行中')), selectedGoalId: selected ? selected.id : '', next: list.next, records: detail.records.map(r => ({ ...r, timeLabel: new Date(r.createdAt + 8 * 3600000).toISOString().slice(11, 16), photos: r.photoIds.map(id => (media.files.find(f => f.id === id) || {}).url || (id.startsWith('local:') ? id.slice(6) : '')).filter(Boolean) })) };
  }); },
  async chooseGoal(event) { const selected = this.data.goals[Number(event.detail.value)]; if (selected) { this.setData({ selectedGoalId: selected.id }); await this.refresh(); } },
  async moreGoals() {
    if (!this.data.next || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try { const result = await P.api.call('goal.list', { after: this.data.next }); const known = new Set(this.data.goals.map(goal => goal.id)); const goals = this.data.goals.concat(result.goals.filter(goal => !known.has(goal.id))); this.setData({ goals, goalLabels: goals.map(g => g.title + (g.status === 'archived' ? ' · 已结束' : ' · 进行中')), next: result.next }); }
    catch (error) { P.api.error(error); }
    finally { this.setData({ loadingMore: false }); }
  },
  createGoal() { P.go('/pages/goal/index'); },
  previewPhoto: P.viewPhoto,
  share() { P.go('/pages/share/index?mode=progress'); }
});
