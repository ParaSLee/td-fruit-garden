const config = require('./config');
App({
  globalData: { cloudEnabled: !!config.cloudEnv, snapshot: null },
  onLaunch() {
    if (config.cloudEnv && wx.cloud) wx.cloud.init({ env: config.cloudEnv, traceUser: false });
  }
});
