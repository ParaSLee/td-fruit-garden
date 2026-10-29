const P = require('../../utils/page');
Page({
  data: { loading: true, loadError: '', goal: null, note: '', photos: [], saving: false, adding: false, formError: '', today: '', saved: false },
  onLoad() { this.refresh(); },
  refresh() { return P.load(this, async () => {
    const snapshot = P.decorate(await P.api.bootstrap());
    if (!snapshot.goal) throw new Error('你还没有打卡目标，请返回首页创建');
    if (snapshot.summary.finished) throw new Error('这个挑战已经结束，请返回首页开启下个目标');
    const existing = snapshot.records.find(r => r.date === snapshot.today);
    const urls = existing && existing.photoIds.length ? await P.api.call('record.media', { goalId: snapshot.goal.id }) : { files: [] };
    return { goal: snapshot.goal, today: snapshot.today, note: existing ? existing.note : '', photos: existing ? existing.photoIds.map(id => ({ id, url: (urls.files.find(f => f.id === id) || {}).url || (id.startsWith('local:') ? id.slice(6) : '') })) : [], editing: !!existing };
  }); },
  typeNote(event) { this.setData({ note: event.detail.value }); },
  async addPhoto() {
    if (this.data.adding || this.data.saving || this.data.photos.length >= 3) return;
    this.setData({ adding: true, formError: '' });
    try {
      const result = await wx.chooseMedia({ count: 3 - this.data.photos.length, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      for (const file of result.tempFiles) {
        if (file.size > 5 * 1024 * 1024) { this.setData({ formError: '单张图片不能超过 5 MB，请选择小一点的图片' }); continue; }
        let tempPath = file.tempFilePath;
        const compressed = await wx.compressImage({ src: tempPath, quality: 65, compressedWidth: 720 });
        tempPath = compressed.tempFilePath;
        this.setData({ photos: this.data.photos.concat({ id: '', url: tempPath, tempPath }) });
      }
    } catch (error) { if (!/cancel/.test(error.errMsg || '')) this.setData({ formError: '图片选择失败，请重试或检查相册权限' }); }
    finally { this.setData({ adding: false }); }
  },
  removePhoto(event) { if (this.data.saving) return; this.setData({ photos: this.data.photos.filter((_, index) => index !== Number(event.currentTarget.dataset.index)) }); },
  previewPhoto(event) { const item = this.data.photos[Number(event.currentTarget.dataset.index)]; if (item) wx.previewImage({ urls: this.data.photos.map(p => p.url).filter(Boolean), current: item.url }); },
  async save() {
    if (this.data.saving || this.data.adding || !this.data.goal) return;
    this.setData({ saving: true, formError: '' });
    try {
      const snapshot = getApp().globalData.snapshot;
      const photos = this.data.photos.slice();
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index];
        if (photo.id) continue;
        if (P.api.cloudEnabled()) {
          const info = await new Promise((resolve, reject) => wx.getFileSystemManager().getFileInfo({ filePath: photo.tempPath, success: resolve, fail: reject }));
          if (info.size > 1024 * 1024) throw new Error('图片压缩后仍超过 1 MB，请选择较小图片');
          const extension = /\.png(?:$|\?)/i.test(photo.tempPath) ? 'png' : 'jpg';
          const random = await wx.getRandomValues({ length: 16 });
          const suffix = Array.from(new Uint8Array(random.randomValues)).map(n => n.toString(16).padStart(2, '0')).join('');
          const uploaded = await wx.cloud.uploadFile({ cloudPath: 'proofs/' + snapshot.user.id + '/' + suffix + '.' + extension, filePath: photo.tempPath });
          photo.id = uploaded.fileID;
        } else {
          const extension = /\.png(?:$|\?)/i.test(photo.tempPath) ? 'png' : 'jpg';
          const filePath = wx.env.USER_DATA_PATH + '/proof_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + '.' + extension;
          await new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: photo.tempPath, filePath, success: resolve, fail: reject }));
          photo.id = 'local:' + filePath;
          photo.url = filePath;
        }
        this.setData({ photos: photos.slice() });
      }
      const savedRecord = await P.api.call('record.save', { goalId: this.data.goal.id, note: this.data.note, photoIds: photos.map(p => p.id) });
      this.setData({ saved: true, today: savedRecord.date });
      wx.vibrateShort({ type: 'light' });
    } catch (error) { this.setData({ formError: error.message || error.errMsg || '提交失败，内容已保留，请重试' }); }
    finally { this.setData({ saving: false }); }
  },
  goToday() { wx.switchTab({ url: '/pages/today/index' }); },
  share() { wx.redirectTo({ url: '/pages/share/index?mode=progress' }); }
});
