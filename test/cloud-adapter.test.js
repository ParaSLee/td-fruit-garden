const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveMediaFiles } = require('../cloudfunctions/checkin/media');
const { createCloudStore } = require('../cloudfunctions/checkin/store');
test('long challenge photo history resolves in bounded batches with private expiring URLs', async () => {
  const counts = [];
  const cloud = { async getTempFileURL({ fileList }) { counts.push(fileList.length); assert.ok(fileList.every(file => file.maxAge === 600)); return { fileList: fileList.map(file => ({ fileID: file.fileID, status: 0, tempFileURL: 'https://files.invalid/' + file.fileID })) }; } };
  const ids = Array.from({ length: 270 }, (_, i) => 'proof_' + i);
  const result = await resolveMediaFiles(cloud, ids);
  assert.equal(result.length, 270); assert.deepEqual(counts, [50, 50, 50, 50, 50, 20]); assert.deepEqual(result.map(file => file.id), ids);
});
test('cloud adapter treats missing documents as absent, while preserving genuine service failures', async () => {
  const make = error => createCloudStore({ collection() { return { doc() { return { async get() { throw error; } }; } }; } });
  assert.equal(await make(new Error('document with _id a does not exist')).get('users', 'alice'), null);
  await assert.rejects(make(new Error('permission denied')).get('users', 'alice'), /permission denied/);
  await assert.rejects(make(new Error('network timeout')).get('users', 'alice'), /network timeout/);
});
test('cloud adapter preserves transaction callback return data', async () => {
  const store = createCloudStore({ runTransaction(callback) { return callback({ collection() { return { doc() { return { async get() { return { data: { _id: 'alice', id: 'alice', nickname: '行动派' } }; } }; } }; } }); } });
  assert.deepEqual(await store.transact(tx => tx.get('users', 'alice')), { id: 'alice', nickname: '行动派' });
});
