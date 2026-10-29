const P = require('../../utils/page');
Page({
  data: { categories: P.D.CATEGORIES, durations: P.D.DURATIONS, selectedCategory: 'exercise', title: '', days: 21, info: P.D.category('exercise'), saving: false, formError: '' },
  chooseCategory(event) { const id = event.currentTarget.dataset.id; this.setData({ selectedCategory: id, info: P.D.category(id), formError: '' }); },
  chooseDays(event) { this.setData({ days: Number(event.currentTarget.dataset.days) }); },
  typeTitle(event) { this.setData({ title: event.detail.value, formError: '' }); },
  useSuggestion() { this.setData({ title: this.data.info.suggestion }); },
  async save() {
    if (this.data.saving) return;
    let input;
    try { input = P.D.validateGoal({ category: this.data.selectedCategory, title: this.data.title, days: this.data.days }); }
    catch (error) { this.setData({ formError: error.message }); return; }
    this.setData({ saving: true, formError: '' });
    try { await P.api.call('goal.create', input); wx.showToast({ title: '挑战开始！', icon: 'success' }); wx.switchTab({ url: '/pages/today/index' }); }
    catch (error) { this.setData({ formError: error.message }); }
    finally { this.setData({ saving: false }); }
  }
});
