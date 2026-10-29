const prefix = 'mm_';
function createCloudStore(db) {
  function adapter(source) {
    return {
      async get(kind, id) {
        if (typeof id !== 'string' || !id || id.length > 200) return null;
        try {
          const result = await source.collection(prefix + kind).doc(id).get();
          const data = Array.isArray(result.data) ? result.data[0] : result.data;
          if (!data) return null;
          const { _id, ...rest } = data;
          return rest;
        } catch (error) {
          if (/document.*(?:not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST/i.test(error.message || error.errMsg || '')) return null;
          throw error;
        }
      },
      async set(kind, id, data) { await source.collection(prefix + kind).doc(id).set({ data }); },
      async list(kind, filter = {}, options = {}) {
        const orderBy = options.orderBy || 'id';
        const direction = options.direction || 'asc';
        const where = { ...filter };
        if (options.after) where[orderBy] = direction === 'desc' ? db.command.lt(options.after) : db.command.gt(options.after);
        const result = await source.collection(prefix + kind).where(where).orderBy(orderBy, direction).limit(options.limit || 100).get();
        return result.data.map(({ _id, ...rest }) => rest);
      }
    };
  }
  const store = adapter(db);
  store.transact = async fn => {
    const output = await db.runTransaction(transaction => fn(adapter(transaction)));
    return output && typeof output === 'object' && Object.prototype.hasOwnProperty.call(output, 'result') && /runTransaction/.test(output.errMsg || '') ? output.result : output;
  };
  return store;
}
module.exports = { createCloudStore };
