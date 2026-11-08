// Past conversations, read from the claude CLI's own transcripts (~/.claude/projects/<folder>/<session>.jsonl).
// Headless `claude -p` has no /resume picker, so the app lists and reopens sessions itself.
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
const SESSION_ID = /^[0-9a-f-]{36}$/;
const folder = dir => path.join(PROJECTS, path.resolve(dir).replace(/[^A-Za-z0-9]/g, '-'));
const textOf = c => typeof c === 'string' ? c : (c || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

// user orders and the lead's replies, oldest first; tool calls, subagents and injected context are skipped
function messages(jsonl) {
  const out = [];
  for (const l of jsonl.split('\n')) {
    let m;
    try { m = JSON.parse(l); } catch { continue; }
    if ((m.type !== 'user' && m.type !== 'assistant') || m.isMeta || m.isSidechain) continue;
    const text = textOf(m.message?.content).trim();
    if (text && !text.startsWith('<')) out.push({ me: m.type === 'user', text, at: m.timestamp });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));   // lines are not written in time order
}
function read(dir, id) {
  if (!SESSION_ID.test(id || '')) return [];
  try { return messages(fs.readFileSync(path.join(folder(dir), `${id}.jsonl`), 'utf8')); } catch { return []; }
}
// ponytail: reads every transcript in full for titles; cache by mtime if folders grow to hundreds of sessions
function list(dir, limit = 20) {
  let files = [];
  try { files = fs.readdirSync(folder(dir)).filter(f => f.endsWith('.jsonl') && SESSION_ID.test(f.slice(0, -6))); } catch { return []; }
  return files.map(f => ({ id: f.slice(0, -6), mtime: fs.statSync(path.join(folder(dir), f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime).slice(0, limit)
    .map(s => {
      const msgs = read(dir, s.id);
      const first = msgs.find(m => m.me);
      return first && { id: s.id, title: first.text.slice(0, 80), at: new Date(s.mtime).toISOString(), count: msgs.length };
    }).filter(Boolean);
}

module.exports = { messages, read, list, SESSION_ID };
