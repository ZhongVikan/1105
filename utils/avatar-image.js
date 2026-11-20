const Online = require('./online');

let fileSequence = 0;

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const image = wx.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function loadAvatar(fileID, roomId) {
  if (!fileID.startsWith('cloud://')) return decodeImage(fileID);
  try {
    const { tempFilePath } = await wx.cloud.downloadFile({ fileID });
    if (!tempFilePath) throw new Error('头像下载失败');
    return await decodeImage(tempFilePath);
  } catch (error) {
    if (!roomId) {
      const { fileList } = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const url = fileList[0] && fileList[0].tempFileURL;
      if (!url) throw error;
      return decodeImage(url);
    }
  }

  // The room member can still see the avatar when cloud storage is owner-only.
  const { base64, format } = await Online.call('roomAvatar', { roomId, fileID });
  if (!base64 || !['png', 'jpg', 'webp', 'gif'].includes(format)) throw new Error('头像格式不受支持');
  const fs = wx.getFileSystemManager();
  const filePath = `${wx.env.USER_DATA_PATH}/chess-avatar-${Date.now()}-${++fileSequence}.${format}`;
  try {
    await new Promise((resolve, reject) => {
      fs.writeFile({ filePath, data: base64, encoding: 'base64', success: resolve, fail: reject });
    });
    return await decodeImage(filePath);
  } finally {
    fs.unlink({ filePath, fail() {} });
  }
}

module.exports = { decodeImage, loadAvatar };
