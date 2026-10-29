async function saveAvatar(path, uid, cloudEnabled) {
  const file = await wx.compressImage({ src: path, quality: 80, compressedWidth: 320 });
  const tempPath = file.tempFilePath;
  const info = await new Promise((resolve, reject) => wx.getFileSystemManager().getFileInfo({ filePath: tempPath, success: resolve, fail: reject }));
  if (info.size > 1024 * 1024) throw new Error('头像压缩后仍超过 1 MB，请选择较小图片');
  const extension = /\.png(?:$|\?)/i.test(tempPath) ? 'png' : 'jpg';
  if (cloudEnabled) {
    const random = await wx.getRandomValues({ length: 16 });
    const suffix = Array.from(new Uint8Array(random.randomValues)).map(n => n.toString(16).padStart(2, '0')).join('');
    const result = await wx.cloud.uploadFile({ cloudPath: 'avatars/' + uid + '/' + suffix + '.' + extension, filePath: tempPath });
    return result.fileID;
  }
  const filePath = wx.env.USER_DATA_PATH + '/avatar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) + '.' + extension;
  await new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: tempPath, filePath, success: resolve, fail: reject }));
  return 'local:' + filePath;
}
module.exports = { saveAvatar };
