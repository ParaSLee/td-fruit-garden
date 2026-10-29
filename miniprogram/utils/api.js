const config = require('../config');
let localService;
function local() {
  if (!localService) {
    const { createService } = require('../lib/service');
    const { createMemoryStore } = require('../lib/memory-store');
    const store = createMemoryStore(wx.getStorageSync('mm_local_v1') || {}, value => wx.setStorageSync('mm_local_v1', value));
    localService = createService({ store, cloudEnabled: false, randomId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 12), mediaURLs: async ids => ids.map(id => ({ id, url: id.startsWith('local:') ? id.slice(6) : id })) });
  }
  return localService;
}
async function call(action, data = {}) {
  if (!config.cloudEnv) return local().execute(action, data, 'local_hero');
  let result;
  try { result = await wx.cloud.callFunction({ name: 'checkin', data: { action, data }, config: { env: config.cloudEnv } }); }
  catch (error) { const failure = new Error('暂时连不上云端，请检查网络后重试'); failure.code = 'NETWORK'; throw failure; }
  const response = result.result;
  if (!response || !response.ok) { const failure = new Error(response && response.error ? response.error.message : '服务响应异常，请重试'); failure.code = response && response.error ? response.error.code : 'SERVICE'; throw failure; }
  return response.data;
}
async function bootstrap() {
  const data = await call('bootstrap');
  getApp().globalData.snapshot = data;
  return data;
}
function cloudEnabled() { return !!config.cloudEnv; }
function error(error) { wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none', duration: 3000 }); }
module.exports = { call, bootstrap, cloudEnabled, error };
