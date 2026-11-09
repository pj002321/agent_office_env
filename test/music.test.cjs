const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const music = require('../app/music.cjs');

test('add copies audio only, renames clashes, remove stays inside the folder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-music-'));
  const dir = path.join(tmp, 'music'), src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  for (const f of ['비 오는 날.mp3', 'notes.txt']) fs.writeFileSync(path.join(src, f), 'x');
  const files = ['비 오는 날.mp3', 'notes.txt'].map(f => path.join(src, f));
  assert.deepStrictEqual(music.add(dir, files).map(t => t.id), ['비 오는 날.mp3']);
  const list = music.add(dir, files);
  assert.deepStrictEqual(list.map(t => t.id), ['비 오는 날 (2).mp3', '비 오는 날.mp3']);
  assert.match(list[1].url, /^file:\/\//);
  assert.strictEqual(list[1].name, '비 오는 날');
  fs.writeFileSync(path.join(tmp, 'keep.mp3'), 'x');
  music.remove(dir, '../keep.mp3');                                   // path escape ignored
  assert.ok(fs.existsSync(path.join(tmp, 'keep.mp3')));
  assert.deepStrictEqual(music.remove(dir, '비 오는 날.mp3').map(t => t.id), ['비 오는 날 (2).mp3']);
  assert.deepStrictEqual(music.list(path.join(tmp, 'none')), []);
  fs.rmSync(tmp, { recursive: true });
});
