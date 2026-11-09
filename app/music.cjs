// 내 음악: audio files the user adds are copied into <userData>/music so BGM survives moved/deleted originals.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const EXT = ['mp3', 'ogg', 'wav', 'm4a', 'flac'];
const isAudio = f => EXT.includes(path.extname(f).slice(1).toLowerCase());

function list(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter(isAudio).sort((a, b) => a.localeCompare(b)); } catch {}
  return names.map(id => ({ id, name: path.parse(id).name, url: pathToFileURL(path.join(dir, id)).href }));
}
function add(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const src of files.filter(isAudio)) {
    const { name, ext } = path.parse(src);
    let id = name + ext, n = 1;
    while (fs.existsSync(path.join(dir, id))) id = `${name} (${++n})${ext}`;   // keep both on name clash
    fs.copyFileSync(src, path.join(dir, id));
  }
  return list(dir);
}
function remove(dir, id) {
  // only a bare file name that list() would show — never a path out of the music folder
  if (typeof id === 'string' && id === path.basename(id) && isAudio(id)) fs.rmSync(path.join(dir, id), { force: true });
  return list(dir);
}

module.exports = { EXT, list, add, remove };
