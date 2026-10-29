// Set cloudEnv after creating a CloudBase environment. No AppSecret is needed.
let local = {};
try { local = require('./config.local'); } catch (_) { /* Optional developer-only override. */ }
module.exports = { cloudEnv: '', ...local };
