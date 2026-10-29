function createMemoryStore(initial = {}, onCommit = () => {}) {
  let state = JSON.parse(JSON.stringify(initial));
  let queue = Promise.resolve();
  const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
  function apiFor(target) {
    return {
      async get(kind, id) { return clone((target[kind] || {})[id]); },
      async set(kind, id, value) { if (!target[kind]) target[kind] = {}; target[kind][id] = clone(value); },
      async list(kind, filter = {}, options = {}) {
        let rows = Object.values(target[kind] || {}).filter(row => Object.keys(filter).every(key => row[key] === filter[key]));
        const key = options.orderBy || 'id'; const direction = options.direction === 'desc' ? -1 : 1;
        rows.sort((a, b) => a[key] === b[key] ? 0 : a[key] > b[key] ? direction : -direction);
        if (options.after) rows = rows.filter(row => direction === -1 ? row[key] < options.after : row[key] > options.after);
        return clone(rows.slice(0, options.limit || 100));
      }
    };
  }
  const store = {
    async get(...args) { return apiFor(state).get(...args); },
    async list(...args) { return apiFor(state).list(...args); },
    async set(...args) { return store.transact(tx => tx.set(...args)); },
    transact(fn) {
      const pending = queue.then(async () => {
        const next = clone(state); const result = await fn(apiFor(next));
        state = next; onCommit(clone(state)); return result;
      });
      queue = pending.catch(() => {});
      return pending;
    },
    snapshot() { return clone(state); }
  };
  return store;
}
module.exports = { createMemoryStore };
