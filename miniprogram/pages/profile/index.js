const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', user: {}, goal: null, summary: null, nickname: '', editing: false, saving: false, cloud: P.api.cloudEnabled(), watching: [], watchers: [], watchingNext: '', watchersNext: '', loadingWatches: '', watchesError: '', watchesErrorSide: '', nudges: [] },
  onShow() { P.selectTab(this, 3); this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  refresh() {
    this.watchListVersion = (this.watchListVersion || 0) + 1;
    this.setData({ loadingWatches: '', watchesError: '' });
    return P.load(this, async () => {
      const snapshot = P.decorate(await P.api.bootstrap());
      const watches = P.api.cloudEnabled() ? await P.api.call('watch.list') : { watching: [], watchers: [], watchingNext: '', watchersNext: '' };
      return { ...snapshot, ...watches, nickname: snapshot.user.nickname };
    });
  },
  async loadMoreWatches(e) {
    const side = e.currentTarget.dataset.side;
    if (!['watching', 'watchers'].includes(side) || this.data.loading || this.data.loadingWatches || !this.data[side + 'Next']) return;
    const version = this.watchListVersion;
    this.setData({ loadingWatches: side, watchesError: '', watchesErrorSide: side });
    try {
      const result = await P.api.call('watch.list', { side, after: this.data[side + 'Next'] });
      if (this.watchListVersion !== version) return;
      const known = new Set(this.data[side].map(item => item.id));
      this.setData({ [side]: this.data[side].concat(result[side].filter(item => !known.has(item.id))), [side + 'Next']: result[side + 'Next'] });
    } catch (error) {
      if (this.watchListVersion === version) this.setData({ watchesError: error.message });
    } finally {
      if (this.watchListVersion === version) this.setData({ loadingWatches: '' });
    }
  },
  editNickname() { this.setData({ editing: !this.data.editing }); },
  typeNickname(e) { this.setData({ nickname: e.detail.value }); },
  async saveNickname() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try { await P.api.call('profile.save', { nickname: this.data.nickname }); this.setData({ editing: false }); await this.refresh(); }
    catch (error) { P.api.error(error); }
    finally { this.setData({ saving: false }); }
  },
  showPrivacy() { P.go('/pages/privacy/index'); },
  showStats() { wx.switchTab({ url: '/pages/stats/index' }); },
  async finishGoal() {
    if (!await P.confirm('结束当前挑战？', '所有记录都会保留在战绩里。确认结束后，你可以开启新的打卡目标。')) return;
    try { await P.api.call('goal.archive', { goalId: this.data.goal.id }); await this.refresh(); }
    catch (error) { P.api.error(error); }
  },
  inviteSupervisor() { P.go('/pages/share/index?mode=supervise'); },
  async nudge(e) {
    try { await P.api.call('watch.nudge', { watchId: e.currentTarget.dataset.id }); wx.showToast({ title: '站内提醒已送达' }); await this.refresh(); }
    catch (error) { P.api.error(error); }
  },
  async removeWatch(e) {
    if (!await P.confirm('解除这段监督关系？', '解除后，监督人将无法继续通过这段关系查看进度或发送提醒。')) return;
    try { await P.api.call('watch.remove', { watchId: e.currentTarget.dataset.id }); await this.refresh(); }
    catch (error) { P.api.error(error); }
  },
  async readNudges() { try { await P.api.call('nudges.read'); await this.refresh(); } catch (error) { P.api.error(error); } }
});
