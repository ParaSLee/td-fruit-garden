const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const localConfig = path.join(root, 'miniprogram/config.local.js');
if (!fs.existsSync(localConfig)) fs.writeFileSync(localConfig, "module.exports = { cloudEnv: '' };\n");
for (const target of ['miniprogram/lib', 'cloudfunctions/checkin/lib']) {
  fs.mkdirSync(path.join(root, target), { recursive: true });
  for (const file of ['domain.js', 'service.js', 'memory-store.js']) {
    const source = fs.readFileSync(path.join(root, 'shared', file));
    const output = path.join(root, target, file);
    if (!fs.existsSync(output) || !fs.readFileSync(output).equals(source)) fs.writeFileSync(output, source);
  }
}
console.log('Shared domain and service synchronized.');
