const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', team: null, cloud: P.api.cloudEnabled(), form: '', name: '', motto: '', code: '', saving: false, formError: '' },
  onShow() { P.selectTab(this, 1); this.refresh(); },
  onPullDownRefresh() { this.refresh(); },
  refresh() { return P.load(this, async () => {
    if (!P.api.cloudEnabled()) return { team: null };
    const data = await P.api.call('team.get');
    if (data.team) data.team.members = data.team.members.map(m => ({ ...m, goal: m.goal ? { ...m.goal, categoryInfo: P.D.category(m.goal.category) } : null }));
    return data;
  }); },
  showCreate() { if (!this.ensureCloud()) return; this.setData({ form: 'create', formError: '' }); },
  showJoin() { if (!this.ensureCloud()) return; this.setData({ form: 'join', formError: '' }); },
  cancelForm() { this.setData({ form: '', formError: '' }); },
  ensureCloud() { if (P.api.cloudEnabled()) return true; wx.showModal({ title: '先连接云端，再和搭子组队', content: '当前为本机体验。管理员配置云开发后，就能创建真实小队、发送邀请和互相提醒。', showCancel: false, confirmColor: '#D75A32' }); return false; },
  typeName(e) { this.setData({ name: e.detail.value }); },
  typeMotto(e) { this.setData({ motto: e.detail.value }); },
  typeCode(e) { this.setData({ code: e.detail.value.toUpperCase() }); },
  async submit() {
    if (this.data.saving) return;
    this.setData({ saving: true, formError: '' });
    try {
      const result = this.data.form === 'create' ? await P.api.call('team.create', { name: this.data.name, motto: this.data.motto }) : await P.api.call('team.join', { code: this.data.code.trim() });
      this.setData({ team: result.team, form: '' });
      await this.refresh();
      wx.showToast({ title: '找到组织了！' });
    } catch (error) { this.setData({ formError: error.message }); }
    finally { this.setData({ saving: false }); }
  },
  copyCode() { wx.setClipboardData({ data: this.data.team.inviteCode }); },
  async nudge(e) {
    const id = e.currentTarget.dataset.id;
    try { await P.api.call('team.nudge', { targetId: id }); wx.showToast({ title: '站内提醒已送达' }); await this.refresh(); }
    catch (error) { P.api.error(error); }
  },
  async leave() {
    if (!await P.confirm('退出这个小队？', '你的目标和记录会保留。如果你是队长，队长会自动转交给下一位队友。')) return;
    try { await P.api.call('team.leave'); await this.refresh(); } catch (error) { P.api.error(error); }
  },
  onShareAppMessage() { return this.data.team ? { title: '加入「' + this.data.team.name + '」，一起说到做到 💪', path: '/pages/share/index?team=' + encodeURIComponent(this.data.team.inviteCode) } : { title: '猛男打卡 · 找几个搭子一起坚持', path: '/pages/today/index' }; }
});
