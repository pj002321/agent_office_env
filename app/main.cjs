// Electron main: opens the office window, runs the user's own `claude` CLI on a project folder,
// turns its stream-json output into OfficeEvents, and routes tool approvals to 대표 (the user).
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');
const { parse, describe } = require('./stream.cjs');

// Tools that change things → 대표 must approve. Read-only tools run freely.
const ASK_TOOLS = 'Bash|Edit|MultiEdit|Write|NotebookEdit|WebFetch|WebSearch';
const token = crypto.randomBytes(16).toString('hex');
const pending = new Map();   // ask id → http response held open until 대표 decides
const owner = new Map();     // tool_use_id → agent id (who asked)
let win, proc, port, sessionId = null;
let cwd = process.argv.slice(app.isPackaged ? 1 : 2).find(a => !a.startsWith('-')) || null;   // `npm start -- <folder>`

const send = e => win?.webContents.send('office', e);

// Approval endpoint for hook.cjs — localhost only, token-checked.
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ask' || req.headers['x-office-token'] !== token) return res.writeHead(403).end();
  let body = '';
  req.on('data', d => body += d).on('end', () => {
    let h;
    try { h = JSON.parse(body); } catch { return res.end('deny'); }
    const id = crypto.randomUUID();
    pending.set(id, res);
    res.on('close', () => pending.delete(id) && send({ kind: 'answer', id, ok: false }));
    send({ kind: 'ask', id, agent: owner.get(h.tool_use_id) || 'lead', text: describe(h.tool_name, h.tool_input) });
  });
}).listen(0, '127.0.0.1', () => port = server.address().port);

// ponytail: one task at a time per office; queue tasks if users want to stack orders
function run(task) {
  if (proc || !cwd) return;
  const fwd = p => p.replace(/\\/g, '/');
  const settings = { hooks: { PreToolUse: [{ matcher: ASK_TOOLS, hooks: [{
    type: 'command', command: `"${fwd(process.execPath)}" "${fwd(path.join(__dirname, 'hook.cjs'))}"`, timeout: 3600,
  }] }] } };
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--settings', JSON.stringify(settings)];
  if (sessionId) args.push('--resume', sessionId);
  proc = spawn('claude', args, { cwd, env: { ...process.env, OFFICE_PORT: port, OFFICE_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' } });
  proc.stdin.end(task);

  const subs = new Set();
  readline.createInterface({ input: proc.stdout }).on('line', line => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'system' && m.subtype === 'init') sessionId = m.session_id;
    for (const e of parse(m, subs)) {
      if (e.toolUseId) owner.set(e.toolUseId, e.agent);
      send(e);
    }
  });
  let err = '';
  proc.stderr.on('data', d => err += d);
  proc.on('error', e => { proc = null; send({ kind: 'exit', code: -1, text: e.message }); });
  proc.on('close', code => { proc = null; send({ kind: 'exit', code, text: err.slice(-300) }); });
}

ipcMain.handle('pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (!r.canceled) { cwd = r.filePaths[0]; sessionId = null; }
  return cwd;
});
ipcMain.on('run', (_, task) => run(task));
ipcMain.on('stop', () => proc?.kill());
ipcMain.on('answer', (_, id, ok) => {
  const res = pending.get(id);
  if (!res) return;
  pending.delete(id);
  res.end(ok ? 'allow' : 'deny');
  send({ kind: 'answer', id, ok });
});

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1400, height: 860, title: 'Agent Office',
                            webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  win.webContents.on('did-finish-load', () => cwd && send({ kind: 'project', path: cwd }));
});
app.on('window-all-closed', () => { proc?.kill(); app.quit(); });
