const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { createService } = require('./lib/service');
const { createCloudStore } = require('./store');
const { resolveMediaFiles } = require('./media');
const { AppError, assert } = require('./lib/domain');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const store = createCloudStore(cloud.database());
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
exports.main = async event => {
  try {
    const context = cloud.getWXContext();
    assert(context.OPENID && context.APPID, 'UNAUTHENTICATED', '请通过微信小程序进入');
    assert(context.APPID === 'wx0efd96316ff696fd', 'UNAUTHENTICATED', '小程序身份不匹配');
    assert(event && JSON.stringify(event).length <= 30000, 'INVALID_INPUT', '请求内容过多');
    const uid = digest(context.APPID + ':' + context.OPENID).slice(0, 32);
    const service = createService({
      store,
      randomId: bytes => crypto.randomBytes(bytes).toString('hex'),
      async moderate(content) {
        if (!content) return;
        const result = await cloud.openapi.security.msgSecCheck({ openid: context.OPENID, scene: 2, version: 2, content });
        assert(result.result && result.result.suggest === 'pass', 'CONTENT_REJECTED', '内容未通过检查，请调整后重试');
      },
      async validateMedia(ids) {
        for (const fileID of ids) {
          const key = digest(fileID);
          const receipt = await store.get('uploads', key);
          if (receipt && receipt.ownerId === uid) continue;
          const result = await cloud.downloadFile({ fileID });
          const bytes = result.fileContent;
          assert(bytes && bytes.length <= 1024 * 1024, 'INVALID_PHOTO', '图片过大，请压缩后重新上传');
          const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
          const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          assert(jpeg || png, 'INVALID_PHOTO', '请上传 JPG 或 PNG 格式图片');
          const checked = await cloud.openapi.security.imgSecCheck({ media: { contentType: jpeg ? 'image/jpeg' : 'image/png', value: bytes } });
          assert(!checked.errCode, 'CONTENT_REJECTED', '图片未通过检查，请更换后重试');
          await store.set('uploads', key, { id: key, ownerId: uid, fileID, checkedAt: Date.now() });
        }
      },
      mediaURLs: ids => resolveMediaFiles(cloud, ids)
    });
    const data = await service.execute(event.action, event.data || {}, uid);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
    console.error('checkin request failed', { action: event && event.action, code: error.errCode || error.code, message: error.message });
    const reasonCode = String(error.errCode || error.code || 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
    return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', reasonCode, message: '服务暂时未就绪，请稍后重试；若持续出现，请联系小程序管理员' } };
  }
};
