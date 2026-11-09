// Skills & plugin store, backed by the user's own CLIs and files on disk.
// Installed skills: SKILL.md folders (user / project / plugin) for Claude and Codex.
// Store: `claude plugin list --available --json` and Codex's marketplace snapshot.
// Install / remove: the CLIs' own plugin commands; nothing is downloaded by this app.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CODEX_DIR = process.env.CODEX_HOME || path.join(HOME, '.codex');

// shell: codex is an npm .cmd shim on Windows. Every argument comes from the CLI's own catalog and is
// checked against SAFE_ID before it gets here, so nothing user-typed reaches the shell.
const SAFE_ID = /^[A-Za-z0-9._-]+(@[A-Za-z0-9._-]+)?$/;
const SAFE_SHA = /^[a-f0-9]{64}$/;
const exec = (cmd, args, opts = {}) => new Promise(done =>
  execFile(cmd, args, { shell: true, windowsHide: true, timeout: 180000, maxBuffer: 64 << 20, ...opts },
    (err, stdout, stderr) => done({ err, stdout: String(stdout), stderr: String(stderr) })));

// ---------- SKILL.md ----------
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const out = {};
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v)) {   // folded / literal block
      const block = [];
      while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1])) block.push(lines[++i].trim());
      v = block.join(' ').trim();
    }
    out[kv[1]] = v.replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return out;
}
function readSkills(dir, extra) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() || d.isSymbolicLink()).map(d => d.name); } catch { return []; }
  const out = [];
  for (const n of names) {
    const file = path.join(dir, n, 'SKILL.md');
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const fm = frontmatter(text);
    out.push({ name: fm.name || n, description: fm.description || '', file, ...extra(fm.name || n) });
  }
  return out;
}

async function claudePlugins() {
  const r = await exec('claude', ['plugin', 'list', '--available', '--json']);
  try { return JSON.parse(r.stdout); } catch { return { installed: [], available: [], error: (r.stderr || r.stdout).slice(-300) }; }
}
function codexMarketplaces(stdout) {   // "openai-curated  C:\\...\\plugins" rows after the header
  return stdout.split(/\r?\n/).slice(1).map(l => /^(\S+)\s{2,}(.+)$/.exec(l.trim())).filter(Boolean).map(m => ({ name: m[1], root: m[2].trim() }));
}
async function codexState() {
  const [mk, list] = await Promise.all([exec('codex', ['plugin', 'marketplace', 'list']), exec('codex', ['plugin', 'list'])]);
  const installed = new Map();
  for (const l of list.stdout.split(/\r?\n/)) {
    const m = /^(\S+@\S+)\s{2,}(.+?)\s{2,}(\S*)\s{2,}(.+)$/.exec(l.trim()) || /^(\S+@\S+)\s{2,}(.+?)\s{2,}(.+)$/.exec(l.trim());
    if (m && !/^not/i.test(m[2])) installed.set(m[1], { status: m[2].trim(), path: (m[4] || m[3]).trim() });
  }
  return { markets: mk.err ? [] : codexMarketplaces(mk.stdout), installed, error: mk.err && (mk.stderr || String(mk.err)).slice(-300) };
}

// ---------- installed skills ----------
async function installed(projectDirs = []) {
  const [cp, cx] = await Promise.all([claudePlugins(), codexState()]);
  const skills = [
    ...readSkills(path.join(CLAUDE_DIR, 'skills'), n => ({ cli: 'claude', source: 'user', invoke: `/${n}` })),
    ...projectDirs.flatMap(p => readSkills(path.join(p, '.claude', 'skills'), n => ({ cli: 'claude', source: 'project', project: p, invoke: `/${n}` }))),
    ...(cp.installed || []).filter(p => p.enabled !== false && p.installPath).flatMap(p => {
      const plugin = p.id.split('@')[0];
      return readSkills(path.join(p.installPath, 'skills'), n => ({ cli: 'claude', source: 'plugin', plugin: p.id, invoke: `/${plugin}:${n}` }));
    }),
    ...readSkills(path.join(HOME, '.agents', 'skills'), n => ({ cli: 'codex', source: 'user', invoke: `$${n}` })),
    ...readSkills(path.join(CODEX_DIR, 'skills'), n => ({ cli: 'codex', source: 'user', invoke: `$${n}` })),
    ...readSkills(path.join(CODEX_DIR, 'skills', '.system'), n => ({ cli: 'codex', source: 'system', invoke: `$${n}` })),
    ...[...cx.installed].flatMap(([id, p]) => readSkills(path.join(p.path, 'skills'), n => ({ cli: 'codex', source: 'plugin', plugin: id, invoke: `$${n}` }))),
  ];
  const seen = new Set();   // the same folder can be reached twice (e.g. project = home)
  return skills.filter(s => !seen.has(s.file) && seen.add(s.file));
}

// ---------- store ----------
function claudeCategories() {
  const map = new Map();
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(CLAUDE_DIR, 'plugins', 'marketplaces')); } catch {}
  for (const d of dirs) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'plugins', 'marketplaces', d, '.claude-plugin', 'marketplace.json'), 'utf8'));
      for (const p of m.plugins || []) map.set(`${p.name}@${m.name || d}`, { category: p.category, author: p.author?.name, homepage: p.homepage, displayName: p.displayName });
    } catch {}
  }
  return map;
}
const fileUrl = (root, rel) => {
  if (!rel) return null;
  const abs = path.resolve(root, rel);
  return fs.existsSync(abs) ? pathToFileURL(abs).href : null;
};
async function catalog() {
  const [cp, cx] = await Promise.all([claudePlugins(), codexState()]);
  const cats = claudeCategories();
  const installedIds = new Set((cp.installed || []).map(p => p.id));
  // the same plugin is often listed by several marketplaces; keep the one with the most installs
  const byName = new Map();
  for (const p of cp.available || []) {
    const prev = byName.get(p.name);
    if (!prev || (p.installCount || 0) > (prev.installCount || 0)) byName.set(p.name, p);
  }
  for (const p of cp.installed || []) {
    const name = p.id.split('@')[0];
    if (!byName.has(name)) byName.set(name, { pluginId: p.id, name, marketplaceName: p.id.split('@')[1], version: p.version });
  }
  const claude = [...byName.values()].map(p => {
    const meta = cats.get(p.pluginId) || {};
    const ids = [p.pluginId, ...(cp.available || []).filter(x => x.name === p.name).map(x => x.pluginId)];
    return {
      cli: 'claude', id: p.pluginId, name: meta.displayName || p.name, slug: p.name, description: p.description || '',
      installs: p.installCount || 0, market: p.marketplaceName, version: p.version || '', category: meta.category || '',
      author: meta.author || (typeof p.source === 'object' ? (p.source.url || '').split('/')[3] : '') || '',
      homepage: meta.homepage || (typeof p.source === 'object' ? p.source.url : '') || '',
      installed: ids.some(id => installedIds.has(id)), installedId: ids.find(id => installedIds.has(id)) || null,
    };
  });

  const codex = [];
  for (const mk of cx.markets) {
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(mk.root, '.agents', 'plugins', 'marketplace.json'), 'utf8')); } catch { continue; }
    for (const p of m.plugins || []) {
      const dir = path.resolve(mk.root, p.source?.path || `plugins/${p.name}`);
      let man = {};
      try { man = JSON.parse(fs.readFileSync(path.join(dir, '.codex-plugin', 'plugin.json'), 'utf8')); } catch {}
      const ui = man.interface || {};
      const id = `${p.name}@${m.name || mk.name}`;
      codex.push({
        cli: 'codex', id, name: ui.displayName || p.name, slug: p.name, description: ui.shortDescription || man.description || '',
        long: ui.longDescription || '', prompts: ui.defaultPrompt || [], capabilities: ui.capabilities || [],
        category: ui.category || p.category || '', author: ui.developerName || man.author?.name || '', homepage: ui.websiteURL || man.homepage || '',
        version: man.version || '', market: m.name || mk.name, color: ui.brandColor || null, logo: fileUrl(dir, ui.logo || ui.composerIcon),
        license: man.license || '', needsAuth: p.policy?.authentication === 'ON_INSTALL', installed: cx.installed.has(id), installedId: cx.installed.has(id) ? id : null,
      });
    }
  }
  return { claude, codex, errors: { claude: cp.error || null, codex: cx.error || null } };
}

// ---------- install / remove ----------
async function install(cli, id, acceptSha) {
  if (!SAFE_ID.test(id) || (acceptSha && !SAFE_SHA.test(acceptSha))) return { ok: false, message: '알 수 없는 플러그인이에요' };
  if (cli === 'codex') {
    const r = await exec('codex', ['plugin', 'add', id]);
    return { ok: !r.err, message: (r.err ? r.stderr || r.stdout : r.stdout).trim().slice(-400) };
  }
  const args = ['plugin', 'install', id, '--json', '-s', 'user'];
  if (acceptSha) args.push('--accept-command', acceptSha);
  const r = await exec('claude', args);
  const line = r.stdout.trim().split(/\r?\n/).filter(l => l.startsWith('{')).pop();
  let j = {};
  try { j = JSON.parse(line); } catch {}
  // a plugin installed by running a marketplace-declared command must be shown to 대표 first
  if (j.shownCommand?.sha256 && j.outcome !== 'ok') return { ok: false, confirm: { command: j.shownCommand.command || j.shownCommand.text || JSON.stringify(j.shownCommand), sha: j.shownCommand.sha256 } };
  return { ok: j.outcome === 'ok', message: j.message || (r.stderr || r.stdout).trim().slice(-400) };
}
async function remove(cli, id) {
  if (!SAFE_ID.test(id)) return { ok: false, message: '알 수 없는 플러그인이에요' };
  const r = cli === 'codex'
    ? await exec('codex', ['plugin', 'remove', id])
    : await exec('claude', ['plugin', 'uninstall', id, '--json', '-s', 'user']);
  let j = {};
  try { j = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()); } catch {}
  return { ok: cli === 'codex' ? !r.err : j.outcome === 'ok', message: (j.message || r.stderr || r.stdout).trim().slice(-400) };
}

module.exports = { installed, catalog, install, remove, frontmatter };
