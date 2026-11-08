// Electron main: one building, one floor per project folder. Each floor can run the user's own `claude` CLI;
// its stream-json output becomes OfficeEvents tagged with the floor, and tool approvals are routed to 대표.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parse, describe } = require('./stream.cjs');

// Tools that change things → 대표 must approve. Read-only tools run freely.
const ASK_TOOLS = 'Bash|Edit|MultiEdit|Write|NotebookEdit|WebFetch|WebSearch';
const token = crypto.randomBytes(16).toString('hex');
const pending = new Map();   // ask id → http response held open until 대표 decides
const owner = new Map();     // tool_use_id → agent id (who asked)
const runs = new Map();      // floor id → child process
let win, port;

// ---------- floors (persisted) ----------
const STORE = path.join(app.getPath('userData'), 'floors.json');
let floors = [];
try { floors = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
const save = () => fs.writeFileSync(STORE, JSON.stringify(floors, null, 2));
const view = () => floors.map(({ id, name, path }) => ({ id, name, path, busy: runs.has(id) }));
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
    const id = crypto.randomUUID();
    pending.set(id, res);
    res.on('close', () => pending.delete(id) && send({ floor, kind: 'answer', id, ok: false }));
    send({ floor, kind: 'ask', id, agent: owner.get(h.tool_use_id) || 'lead', ...describe(h.tool_name, h.tool_input) });
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
    for (const e of parse(m, subs)) {
      if (e.toolUseId) owner.set(e.toolUseId, e.agent);
      send({ floor: f.id, ...e });
    }
  });
  let err = '';
  proc.stderr.on('data', d => err += d);
  const end = (code, text) => {
    if (runs.get(floorId) !== proc) return;
    runs.delete(floorId);
    send({ floor: f.id, kind: 'exit', code, text });
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
ipcMain.on('answer', (_, floor, id, ok) => {
  const res = pending.get(id);
  if (!res) return;
  pending.delete(id);
  res.end(ok ? 'allow' : 'deny');
  send({ floor, kind: 'answer', id, ok });
});

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: 'Agent Office',
                            backgroundColor: '#bfe6f5', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
});
app.on('window-all-closed', () => { for (const p of runs.values()) p.kill(); app.quit(); });
