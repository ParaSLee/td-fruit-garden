const P = require('../../utils/page');
const { saveAvatar } = require('../../utils/avatar');
Page({
  data: { loading: true, loadError: '', user: {}, goal: null, summary: null, nickname: '', editing: false, saving: false, avatarDraft: {}, avatarPath: '', avatarId: '', avatarChanged: false, formError: '', cloud: P.api.cloudEnabled(), watching: [], watchers: [], watchingNext: '', watchersNext: '', loadingWatches: '', watchesError: '', watchesErrorSide: '', nudges: [] },
  onShow() { P.selectTab(this, 3); this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  refresh() {
    this.watchListVersion = (this.watchListVersion || 0) + 1;
    this.setData({ loadingWatches: '', watchesError: '' });
    return P.load(this, async () => {
      const snapshot = P.decorate(await P.api.bootstrap());
      const watches = P.api.cloudEnabled() ? await P.api.call('watch.list') : { watching: [], watchers: [], watchingNext: '', watchersNext: '' };
      return { ...snapshot, ...watches, ...(this.data.editing ? {} : { nickname: snapshot.user.nickname, avatarDraft: snapshot.user }) };
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
  editNickname() {
    if (this.data.saving) return;
    this.setData({ editing: !this.data.editing, nickname: this.data.user.nickname, avatarDraft: this.data.user, avatarPath: '', avatarId: '', avatarChanged: false, formError: '' });
  },
  typeNickname(e) { this.setData({ nickname: e.detail.value, formError: '' }); },
  reviewNickname(e) { if (e.detail && e.detail.pass === false) this.setData({ formError: '昵称未通过检查，请重新填写' }); },
  chooseAvatar(e) {
    if (this.data.saving || !e.detail.avatarUrl) return;
    this.setData({ avatarPath: e.detail.avatarUrl, avatarId: '', avatarChanged: true, avatarDraft: { ...this.data.user, avatarUrl: e.detail.avatarUrl }, formError: '' });
  },
  avatarError() { this.setData({ formError: '未能选择头像，请重试；也可以保留默认头像' }); },
  removeAvatar() { if (!this.data.saving) this.setData({ avatarPath: '', avatarId: '', avatarChanged: true, avatarDraft: { ...this.data.user, avatarUrl: '' }, formError: '' }); },
  async saveNickname(e) {
    if (this.data.saving) return;
    const nickname = e && e.detail && e.detail.value ? e.detail.value.nickname : this.data.nickname;
    this.setData({ saving: true, nickname, formError: '' });
    try {
      P.D.text(nickname, 1, 16, '昵称');
      if (this.data.avatarPath && !this.data.avatarId) {
        const avatarId = await saveAvatar(this.data.avatarPath, this.data.user.id, P.api.cloudEnabled());
        // Retain the upload if moderation or profile saving needs a retry.
        this.setData({ avatarId });
      }
      const data = { nickname };
      if (this.data.avatarChanged) data.avatarId = this.data.avatarId;
      await P.api.call('profile.save', data);
      this.setData({ editing: false, avatarChanged: false, avatarPath: '', avatarId: '' });
      await this.refresh();
      wx.showToast({ title: '个人资料已保存' });
    }
    catch (error) { this.setData({ formError: error.message || '保存失败，请重试' }); }
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
