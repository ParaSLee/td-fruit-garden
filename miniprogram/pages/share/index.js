const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', token: '', mode: 'progress', composing: false, includePhotos: false, generating: false, formError: '', goal: null, summary: null, records: [], owner: {}, isOwner: false, watching: false, nudgedToday: false, teamCode: '', invite: null, working: false },
  onLoad(options) {
    this.options = options;
    wx.hideShareMenu();
    this.refresh();
  },
  refresh() { return P.load(this, async () => {
    if (this.options.team) {
      const invite = await P.api.call('team.preview', { code: this.options.team });
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
      return { invite, teamCode: this.options.team, composing: false };
    }
    if (this.options.token) {
      const data = await P.api.call('share.get', { token: this.options.token });
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
      return { ...P.decorate(data), token: this.options.token, composing: false };
    }
    const snapshot = P.decorate(await P.api.bootstrap());
    if (!snapshot.goal) throw new Error('先创建一个目标，再来分享你的进步');
    return { goal: snapshot.goal, summary: snapshot.summary, owner: snapshot.user, composing: true, isOwner: true, mode: this.options.mode === 'supervise' ? 'supervise' : 'progress' };
  }); },
  togglePhotos(e) { this.setData({ includePhotos: e.detail.value }); },
  async generate() {
    if (this.data.generating) return;
    this.setData({ generating: true, formError: '' });
    try {
      const data = await P.api.call('share.create', { mode: this.data.mode, includePhotos: this.data.includePhotos });
      this.setData({ ...P.decorate(data), isOwner: true, composing: true });
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (error) { this.setData({ formError: error.message }); }
    finally { this.setData({ generating: false }); }
  },
  async revoke() {
    if (!await P.confirm('撤销这张分享卡？', '持有这张卡的人将无法继续通过链接访问。已加入的监督关系需到“我的”单独解除。')) return;
    try { await P.api.call('share.revoke', { token: this.data.token }); this.setData({ token: '', records: [] }); wx.hideShareMenu(); wx.showToast({ title: '已撤销分享' }); }
    catch (error) { P.api.error(error); }
  },
  async joinSupervision() {
    if (this.data.working) return;
    this.setData({ working: true });
    try { await P.api.call('share.join', { token: this.data.token }); this.setData({ watching: true }); wx.showToast({ title: '已成为监督搭子' }); }
    catch (error) { P.api.error(error); }
    finally { this.setData({ working: false }); }
  },
  async nudge() {
    if (this.data.working) return;
    this.setData({ working: true });
    try { await P.api.call('watch.nudge', { watchId: this.data.goal.id + '_' + (await P.api.bootstrap()).user.id }); this.setData({ nudgedToday: true }); wx.showToast({ title: '站内提醒已送达' }); }
    catch (error) { P.api.error(error); }
    finally { this.setData({ working: false }); }
  },
  async joinTeam() {
    if (this.data.working) return;
    this.setData({ working: true });
    try { await P.api.call('team.join', { code: this.data.teamCode }); wx.switchTab({ url: '/pages/team/index' }); }
    catch (error) { P.api.error(error); }
    finally { this.setData({ working: false }); }
  },
  goToday() { wx.switchTab({ url: '/pages/today/index' }); },
  previewPhoto: P.viewPhoto,
  onShareAppMessage() {
    if (this.data.teamCode) return { title: '加入「' + this.data.invite.name + '」，一起坚持', path: '/pages/share/index?team=' + encodeURIComponent(this.data.teamCode) };
    if (!this.data.token) return { title: '猛男打卡 · 每一步，都算数', path: '/pages/today/index' };
    return { title: this.data.mode === 'supervise' ? this.data.owner.nickname + ' 邀请你监督：' + this.data.goal.title : this.data.owner.nickname + ' 已坚持 ' + this.data.summary.count + ' 天，来看看我的进步', path: '/pages/share/index?token=' + encodeURIComponent(this.data.token) };
  },
  onShareTimeline() { const share = this.onShareAppMessage(); return { title: share.title, query: share.path.split('?')[1] || '' }; }
});
