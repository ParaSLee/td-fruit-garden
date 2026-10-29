const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.git', 'artifacts'].includes(entry.name) || entry.name.startsWith('draft_')) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else files.push(full); } }
walk(root);
let checked = 0;
for (const file of files) {
  if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); checked++; }
  if (file.endsWith('.js')) { const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (run.status) throw new Error(run.stderr); checked++; }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json')));
for (const page of app.pages) for (const ext of ['js', 'json', 'wxml', 'wxss']) {
  if (!fs.existsSync(path.join(root, 'miniprogram', page + '.' + ext))) throw new Error('Missing page asset: ' + page + '.' + ext);
}
for (const target of ['miniprogram/lib', 'cloudfunctions/checkin/lib']) for (const file of ['domain.js', 'service.js', 'memory-store.js']) {
  if (!fs.readFileSync(path.join(root, 'shared', file)).equals(fs.readFileSync(path.join(root, target, file)))) throw new Error('Generated module out of date: ' + target + '/' + file);
}
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
const appid = project.appid;
if (appid !== 'wx0efd96316ff696fd') throw new Error('Unexpected AppID');
if (!fs.existsSync(path.join(root, project.miniprogramRoot, 'app.json'))) throw new Error('project.config.json miniprogramRoot does not contain app.json');
console.log('Checked ' + checked + ' JavaScript/JSON files, all page assets and shared module synchronization.');
