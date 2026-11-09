// Electron main: one building, one floor per project folder. Each floor can run the user's own `claude` CLI;
// its stream-json output becomes OfficeEvents tagged with the floor, and tool approvals are routed to 대표.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parse, describe } = require('./stream.cjs');
const skills = require('./skills.cjs');
const history = require('./history.cjs');
const shop = require('./shop.cjs');
const music = require('./music.cjs');

// Tools that change things → 대표 must approve. Read-only tools run freely.
const ASK_TOOLS = 'Bash|Edit|MultiEdit|Write|NotebookEdit|WebFetch|WebSearch';
const token = crypto.randomBytes(16).toString('hex');
const pending = new Map();   // ask id → { res, floor }: http response held open until 대표 decides
const owner = new Map();     // tool_use_id → agent id (who asked)
const runs = new Map();      // floor id → child process
let win, port;

// one office per user: a second window would show floors as idle while the first one runs them.
// A second launch focuses this window instead (and adds its folder as a floor, if it was given one).
if (!app.requestSingleInstanceLock()) { app.exit(0); return; }

// macOS apps opened from Finder/Dock get a bare PATH (/usr/bin:/bin...), so `claude` installed via
// ~/.local/bin, Homebrew or npm isn't found. Borrow the PATH the user's login shell would have.
if (process.platform === 'darwin') {
  try {
    const out = require('child_process').execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__P__%s__P__" "$PATH"'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const p = out.match(/__P__(.*)__P__/)?.[1];
    if (p) process.env.PATH = p;
  } catch {}
}

// ---------- floors (persisted) ----------
const STORE = path.join(app.getPath('userData'), 'floors.json');
let floors = [];
try { floors = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
const save = () => fs.writeFileSync(STORE, JSON.stringify(floors, null, 2));
const view = () => floors.map(({ id, name, path, auto, layout }) => ({ id, name, path, auto: !!auto, layout: layout || {}, busy: runs.has(id) }));
function addFloor(dir) {
  dir = path.resolve(dir);
  const found = floors.find(f => f.path.toLowerCase() === dir.toLowerCase());
  if (found) return found;
  const f = { id: crypto.randomUUID().slice(0, 8), name: path.basename(dir) || dir, path: dir, session: null };
  floors.push(f);
  save();
  return f;
}
// `npm start -- <folder>`; a second launch's argv carries Chromium switches and the app path in its own order
const argDir = (argv, cwd = process.cwd()) => argv.slice(1).filter(a => !a.startsWith('-')).map(a => path.resolve(cwd, a))
  .find(a => a !== app.getAppPath() && fs.existsSync(a) && fs.statSync(a).isDirectory());
const cliDir = argDir(process.argv);
if (cliDir) addFloor(cliDir);
app.on('second-instance', (_, argv, cwd) => {
  const dir = argDir(argv, cwd);
  if (dir) { addFloor(dir); send({ kind: 'floors' }); }
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

const send = e => win?.webContents.send('office', e);

// ---------- wallet (꾸미기 상점) ----------
const WALLET = path.join(app.getPath('userData'), 'wallet.json');
let wallet;
try { wallet = shop.load(JSON.parse(fs.readFileSync(WALLET, 'utf8'))); } catch { wallet = shop.fresh(); }
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const walletView = () => ({ ...wallet, items: shop.ITEMS, packs: shop.PACKS, earn: shop.EARN, freeCharge: shop.FREE_CHARGE,
  rewards: shop.REWARDS, attendedToday: wallet.attend.last === localDate() });
const saveWallet = () => fs.writeFileSync(WALLET, JSON.stringify(wallet, null, 2));

// ---------- headroom: route floors through the user's own `headroom proxy` when it's up ----------
const PREFS = path.join(app.getPath('userData'), 'prefs.json');
let prefs = { headroom: false };
try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(PREFS, 'utf8')) }; } catch {}
const HEADROOM = `http://127.0.0.1:${process.env.HEADROOM_PORT || 8787}`;
const headroomUp = () => new Promise(ok => http.get(HEADROOM + '/health', { timeout: 1000 }, r => { r.resume(); ok(r.statusCode === 200); })
  .on('error', () => ok(false)).on('timeout', function () { this.destroy(); }));
// off, or proxy down → run claude as-is so a dead proxy never stalls a floor
async function headroomEnv() {
  if (!prefs.headroom || process.env.ANTHROPIC_BASE_URL) return { env: {}, down: false };   // already routed by the user's shell
  if (!await headroomUp()) return { env: {}, down: true };
  // like `headroom wrap claude`: a custom base URL otherwise makes claude load every tool schema up front
  return { env: { ANTHROPIC_BASE_URL: HEADROOM, ENABLE_TOOL_SEARCH: process.env.ENABLE_TOOL_SEARCH ?? 'true' }, down: false };
}
ipcMain.handle('headroom', async () => ({ on: prefs.headroom, up: await headroomUp(), url: HEADROOM }));
ipcMain.handle('set-headroom', async (_, on) => {
  prefs.headroom = !!on;
  fs.writeFileSync(PREFS, JSON.stringify(prefs, null, 2));
  return { on: prefs.headroom, up: await headroomUp(), url: HEADROOM };
});

// ---------- approvals: hook.cjs → here (localhost only, token-checked) ----------
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ask' || req.headers['x-office-token'] !== token) return res.writeHead(403).end();
  const floor = String(req.headers['x-office-floor'] || '');
  let body = '';
  req.on('data', d => body += d).on('end', () => {
    let h;
    try { h = JSON.parse(body); } catch { return res.end('deny'); }
    const agent = owner.get(h.tool_use_id) || 'lead';
    if (floors.find(f => f.id === floor)?.auto) {   // 자동 승인 floor: allow now, still show it
      res.end('allow');
      return send({ floor, kind: 'auto', agent, ...describe(h.tool_name, h.tool_input) });
    }
    const id = crypto.randomUUID();
    pending.set(id, { res, floor });
    res.on('close', () => pending.delete(id) && send({ floor, kind: 'answer', id, ok: false }));
    send({ floor, kind: 'ask', id, agent, ...describe(h.tool_name, h.tool_input) });
  });
}).listen(0, '127.0.0.1', () => port = server.address().port);

// ---------- runner: one claude process per floor ----------
// one claude process per floor; orders given while it works wait in line and run in order (same session)
const queues = new Map();    // floor id → [task]
function run(floorId, task) {
  const f = floors.find(x => x.id === floorId);
  if (!f) return;
  if (runs.has(floorId)) {
    const q = queues.get(floorId) || [];
    queues.set(floorId, [...q, task]);
    return send({ floor: f.id, kind: 'queue', count: q.length + 1 });
  }
  // hold the floor while the headroom check runs, so orders arriving meanwhile queue instead of spawning twice
  const hold = { kill() { this.killed = true; } };
  runs.set(floorId, hold);
  send({ floor: f.id, kind: 'busy', busy: true });
  headroomEnv().then(({ env, down }) => {
    if (runs.get(floorId) !== hold) return;
    if (hold.killed || !floors.includes(f)) { runs.delete(floorId); return send({ floor: f.id, kind: 'exit', code: null, text: '' }); }
    if (down) send({ floor: f.id, kind: 'headroom-down' });
    spawnClaude(f, floorId, task, env);
  });
}
function spawnClaude(f, floorId, task, extraEnv) {
  const fwd = p => p.replace(/\\/g, '/');
  const settings = { hooks: { PreToolUse: [{ matcher: ASK_TOOLS, hooks: [{
    type: 'command', command: `"${fwd(process.execPath)}" "${fwd(path.join(__dirname, 'hook.cjs'))}"`, timeout: 3600,
  }] }] } };
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--settings', JSON.stringify(settings)];
  if (f.session) args.push('--resume', f.session);
  // ponytail: ELECTRON_RUN_AS_NODE leaks into the agent's Bash env; give hook.cjs its own launcher if a project runs Electron
  const proc = spawn('claude', args, { cwd: f.path,
    env: { ...process.env, ...extraEnv, OFFICE_PORT: port, OFFICE_TOKEN: token, OFFICE_FLOOR: f.id, ELECTRON_RUN_AS_NODE: '1' } });
  runs.set(floorId, proc);
  proc.stdin.end(task);
  shop.earn(wallet); saveWallet();
  send({ kind: 'wallet', earned: shop.EARN, wallet: walletView() });

  const subs = new Set();
  readline.createInterface({ input: proc.stdout }).on('line', line => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'system' && m.subtype === 'init' && f.session !== m.session_id) { f.session = m.session_id; save(); }
    if (m.type === 'result' && m.is_error && AUTH_ERR.test(m.result)) authFail = true;
    for (const e of parse(m, subs)) {
      if (e.toolUseId) owner.set(e.toolUseId, e.agent);
      send({ floor: f.id, ...e });
    }
  });
  let err = '', authFail = false;
  proc.stderr.on('data', d => err += d);
  const end = (code, text) => {
    if (runs.get(floorId) !== proc) return;
    runs.delete(floorId);
    send({ floor: f.id, kind: 'exit', code, text });
    if (authFail || AUTH_ERR.test(err)) send({ floor: f.id, kind: 'auth', cli: 'claude' });
    const [next, ...rest] = queues.get(floorId) || [];
    queues.set(floorId, rest);
    if (next !== undefined && floors.includes(f)) { send({ floor: f.id, kind: 'queue', count: rest.length }); run(floorId, next); }
  };
  proc.on('error', e => end(-1, e.message));
  proc.on('close', code => end(code, err.slice(-300)));
}

ipcMain.handle('floors', () => view());
ipcMain.handle('add-floor', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (!r.canceled) addFloor(r.filePaths[0]);
  return view();
});
ipcMain.handle('remove-floor', (_, id) => {
  runs.get(id)?.kill();
  floors = floors.filter(f => f.id !== id);
  if (wallet.rooms[id]) { delete wallet.rooms[id]; saveWallet(); }
  save();
  return view();
});
// past conversations: the floor resumes f.session; /resume picks another, /new starts fresh
ipcMain.handle('history', (_, id) => { const f = floors.find(x => x.id === id); return f ? history.read(f.path, f.session).slice(-60) : []; });
ipcMain.handle('sessions', (_, id) => {
  const f = floors.find(x => x.id === id);
  return f ? history.list(f.path).map(s => ({ ...s, current: s.id === f.session })) : [];
});
ipcMain.handle('set-session', (_, id, session) => {
  const f = floors.find(x => x.id === id);
  if (!f || runs.has(id) || (session && !history.SESSION_ID.test(session))) return false;
  f.session = session || null;
  save();
  return true;
});
ipcMain.on('run', (_, floorId, task) => run(floorId, task));
ipcMain.on('stop', (_, floorId) => { queues.delete(floorId); send({ floor: floorId, kind: 'queue', count: 0 }); runs.get(floorId)?.kill(); });   // 멈추기 also drops waiting orders
function answer(id, ok) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  p.res.end(ok ? 'allow' : 'deny');
  send({ floor: p.floor, kind: 'answer', id, ok });
}
ipcMain.on('answer', (_, floor, id, ok) => answer(id, ok));
// 배치 mode: { pieceKey: [x, z, rotation] } for decor moved away from its default spot
const cleanLayout = l => Object.fromEntries(Object.entries(l && typeof l === 'object' ? l : {}).slice(0, 40)
  .filter(([k, v]) => /^[a-z0-9]{1,20}$/.test(k) && Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 20)));
ipcMain.handle('set-layout', (_, id, layout) => {
  const f = floors.find(x => x.id === id);
  if (!f) return false;
  f.layout = cleanLayout(layout);
  save();
  return true;
});
ipcMain.handle('set-auto', (_, id, on) => {
  const f = floors.find(x => x.id === id);
  if (!f) return view();
  f.auto = !!on;
  save();
  if (on) for (const [askId, p] of pending) if (p.floor === id) answer(askId, true);
  return view();
});

// ---------- login: check the user's own CLIs, open their official login in a terminal ----------
// The app never sees credentials; it only asks each CLI whether it is signed in.
const AUTH_ERR = /please run \/login|not logged in|invalid api key|oauth token|authentication_error/i;
const CLIS = {
  claude: { args: ['auth', 'status'], login: 'claude auth login', ok: out => /"loggedIn":\s*true/.test(out) },
  codex: { args: ['login', 'status'], login: 'codex login', ok: out => /^logged in/im.test(out) },
};
const run1 = (cmd, args, opts = {}) => new Promise(done =>
  execFile(cmd, args, { timeout: 20000, windowsHide: true, ...opts }, (err, stdout, stderr) => done({ err, out: `${stdout}\n${stderr}` })));
async function checkCli(name) {
  // `where`/`which` instead of parsing "not recognized": that message is localized
  const where = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe') : 'which';
  if ((await run1(where, [name])).err) return 'missing';
  // shell: npm installs codex as a .cmd shim; arguments are fixed, nothing user-typed goes through the shell
  const { out } = await run1(name, CLIS[name].args, { shell: true });
  return CLIS[name].ok(out) ? 'ok' : 'login';
}
ipcMain.handle('auth-check', async (_, names = Object.keys(CLIS)) =>
  Object.fromEntries(await Promise.all(names.map(async n => [n, await checkCli(n)]))));
ipcMain.handle('auth-login', (_, name) => {
  if (!CLIS[name]) return null;
  // the command is a fixed CLIS entry, never user text
  if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', 'cmd', '/k', CLIS[name].login], { detached: true, stdio: 'ignore' }).unref();
  else if (process.platform === 'darwin') execFile('osascript', ['-e', `tell application "Terminal" to do script "${CLIS[name].login}"`, '-e', 'tell application "Terminal" to activate']);
  return CLIS[name].login;
});

// ---------- skills & store ----------
ipcMain.handle('skills', () => skills.installed(floors.map(f => f.path)));
ipcMain.handle('store', () => skills.catalog());
ipcMain.handle('store-install', (_, cli, id, sha) => skills.install(cli, id, sha));
ipcMain.handle('store-remove', (_, cli, id) => skills.remove(cli, id));
const MUSIC = path.join(app.getPath('userData'), 'music');
ipcMain.handle('music', () => music.list(MUSIC));
ipcMain.handle('music-add', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: '음악', extensions: music.EXT }] });
  return r.canceled ? music.list(MUSIC) : music.add(MUSIC, r.filePaths);
});
ipcMain.handle('music-remove', (_, id) => music.remove(MUSIC, id));
ipcMain.handle('wallet', () => walletView());
// fid: the floor being decorated (interior items); only floors that exist
const fidOf = fid => floors.some(f => f.id === fid) ? fid : undefined;
const shopCall = r => { if (r.ok) saveWallet(); return { ...r, wallet: walletView() }; };
ipcMain.handle('shop-buy', (_, id, fid) => shopCall(shop.buy(wallet, String(id), fidOf(fid))));
ipcMain.handle('shop-equip', (_, id, on, fid) => shopCall(shop.equip(wallet, String(id), on !== false, fidOf(fid))));
ipcMain.handle('shop-charge', (_, id) => shopCall(shop.charge(wallet, String(id))));
ipcMain.handle('attend', () => { const r = shop.attend(wallet, localDate()); if (r.ok) saveWallet(); return { ...r, wallet: walletView() }; });
ipcMain.handle('open-url', (_, url) => /^https:\/\//.test(url) && shell.openExternal(url));

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: 'Agent Office',
                            backgroundColor: '#bfe6f5', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
});
app.on('window-all-closed', () => { for (const p of runs.values()) p.kill(); app.quit(); });
