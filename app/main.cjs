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

// Tools that change things → 대표 must approve. Read-only tools run freely.
const ASK_TOOLS = 'Bash|Edit|MultiEdit|Write|NotebookEdit|WebFetch|WebSearch';
const token = crypto.randomBytes(16).toString('hex');
const pending = new Map();   // ask id → { res, floor }: http response held open until 대표 decides
const owner = new Map();     // tool_use_id → agent id (who asked)
const runs = new Map();      // floor id → child process
let win, port;

// ---------- floors (persisted) ----------
const STORE = path.join(app.getPath('userData'), 'floors.json');
let floors = [];
try { floors = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
const save = () => fs.writeFileSync(STORE, JSON.stringify(floors, null, 2));
const view = () => floors.map(({ id, name, path, auto }) => ({ id, name, path, auto: !!auto, busy: runs.has(id) }));
function addFloor(dir) {
  dir = path.resolve(dir);
  const found = floors.find(f => f.path.toLowerCase() === dir.toLowerCase());
  if (found) return found;
  const f = { id: crypto.randomUUID().slice(0, 8), name: path.basename(dir) || dir, path: dir, session: null };
  floors.push(f);
  save();
  return f;
}
const cliDir = process.argv.slice(app.isPackaged ? 1 : 2).find(a => !a.startsWith('-'));   // `npm start -- <folder>`
if (cliDir && fs.existsSync(cliDir)) addFloor(cliDir);

const send = e => win?.webContents.send('office', e);

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
// ponytail: one task at a time per floor; queue orders if users want to stack them
function run(floorId, task) {
  const f = floors.find(x => x.id === floorId);
  if (!f || runs.has(floorId)) return;
  const fwd = p => p.replace(/\\/g, '/');
  const settings = { hooks: { PreToolUse: [{ matcher: ASK_TOOLS, hooks: [{
    type: 'command', command: `"${fwd(process.execPath)}" "${fwd(path.join(__dirname, 'hook.cjs'))}"`, timeout: 3600,
  }] }] } };
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--settings', JSON.stringify(settings)];
  if (f.session) args.push('--resume', f.session);
  // ponytail: ELECTRON_RUN_AS_NODE leaks into the agent's Bash env; give hook.cjs its own launcher if a project runs Electron
  const proc = spawn('claude', args, { cwd: f.path,
    env: { ...process.env, OFFICE_PORT: port, OFFICE_TOKEN: token, OFFICE_FLOOR: f.id, ELECTRON_RUN_AS_NODE: '1' } });
  runs.set(floorId, proc);
  send({ floor: f.id, kind: 'busy', busy: true });
  proc.stdin.end(task);

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
  save();
  return view();
});
ipcMain.on('run', (_, floorId, task) => run(floorId, task));
ipcMain.on('stop', (_, floorId) => runs.get(floorId)?.kill());
function answer(id, ok) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  p.res.end(ok ? 'allow' : 'deny');
  send({ floor: p.floor, kind: 'answer', id, ok });
}
ipcMain.on('answer', (_, floor, id, ok) => answer(id, ok));
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
  // ponytail: Windows only; macOS needs `osascript -e 'tell app "Terminal" to do script ...'`
  if (process.platform !== 'win32') return CLIS[name].login;
  spawn('cmd.exe', ['/c', 'start', '', 'cmd', '/k', CLIS[name].login], { detached: true, stdio: 'ignore' }).unref();
  return CLIS[name].login;
});

// ---------- skills & store ----------
ipcMain.handle('skills', () => skills.installed(floors.map(f => f.path)));
ipcMain.handle('store', () => skills.catalog());
ipcMain.handle('store-install', (_, cli, id, sha) => skills.install(cli, id, sha));
ipcMain.handle('store-remove', (_, cli, id) => skills.remove(cli, id));
ipcMain.handle('open-url', (_, url) => /^https:\/\//.test(url) && shell.openExternal(url));

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: 'Agent Office',
                            backgroundColor: '#bfe6f5', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
});
app.on('window-all-closed', () => { for (const p of runs.values()) p.kill(); app.quit(); });
