const api = require('./api');
const D = require('../lib/domain');
function selectTab(page, index) { if (typeof page.getTabBar === 'function' && page.getTabBar()) page.getTabBar().setData({ selected: index }); }
function decorate(data) {
  if (data.goal) data.goal = { ...data.goal, categoryInfo: D.category(data.goal.category) };
  if (data.summary) data.summary = { ...data.summary, dayLabel: String(data.summary.dayIndex).padStart(2, '0') };
  return data;
}
async function load(page, fn) {
  page.setData({ loading: true, loadError: '' });
  try { const data = await fn(); if (data) page.setData(data); }
  catch (error) { page.setData({ loadError: error.message || '加载失败，请重试' }); }
  finally { page.setData({ loading: false }); wx.stopPullDownRefresh(); }
}
function go(url) { wx.navigateTo({ url }); }
function confirm(title, content) { return new Promise(resolve => wx.showModal({ title, content, confirmColor: '#D75A32', success: result => resolve(result.confirm), fail: () => resolve(false) })); }
function viewPhoto(event) { const urls = event.currentTarget.dataset.urls; if (urls && urls.length) wx.previewImage({ current: event.currentTarget.dataset.url, urls }); }
module.exports = { api, D, selectTab, decorate, load, go, confirm, viewPhoto };
