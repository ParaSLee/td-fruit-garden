async function resolveMediaFiles(cloud, ids) {
  const batches = [];
  for (let offset = 0; offset < ids.length; offset += 50) batches.push(ids.slice(offset, offset + 50));
  const results = await Promise.all(batches.map(fileIDs => cloud.getTempFileURL({ fileList: fileIDs.map(fileID => ({ fileID, maxAge: 600 })) })));
  return results.flatMap(result => result.fileList.filter(file => file.status === 0).map(file => ({ id: file.fileID, url: file.tempFileURL })));
}
module.exports = { resolveMediaFiles };
