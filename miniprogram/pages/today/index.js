const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', goal: null, summary: null, user: {}, nudges: [], todayLabel: '' },
  onShow() { P.selectTab(this, 0); this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  refresh() { return P.load(this, async () => {
    const snapshot = P.decorate(await P.api.bootstrap());
    return { ...snapshot, nudges: snapshot.nudges.filter(n => !n.read).slice(0, 3), todayLabel: snapshot.today.replace(/-/g, '.') };
  }); },
  createGoal() { P.go('/pages/goal/index'); },
  checkin() { P.go('/pages/checkin/index'); },
  showStats() { wx.switchTab({ url: '/pages/stats/index' }); },
  showTeam() { wx.switchTab({ url: '/pages/team/index' }); },
  shareProgress() { P.go('/pages/share/index?mode=progress'); },
  inviteSupervisor() { P.go('/pages/share/index?mode=supervise'); },
  async dismissNudges() { try { await P.api.call('nudges.read'); this.setData({ nudges: [] }); } catch (error) { P.api.error(error); } },
  async finishGoal() {
    if (!await P.confirm('结束本次挑战', '记录会保留在战绩中。结束后，你可以开启一个新的打卡目标。')) return;
    try { await P.api.call('goal.archive', { goalId: this.data.goal.id }); await this.refresh(); } catch (error) { P.api.error(error); }
  },
  onShareAppMessage() { return { title: '猛男打卡 · 今天，也要说到做到', path: '/pages/today/index' }; }
});
