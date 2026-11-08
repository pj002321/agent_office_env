// Claude CLI `--output-format stream-json` line → OfficeEvent[].
// OfficeEvent = { agent: 'lead' | <Agent tool_use id>, kind, text, ... } — the only thing the office renderer knows.
const SUB_TOOLS = new Set(['Agent', 'Task']);

const oneLine = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const base = p => String(p || '').split(/[\\/]/).pop();

// → { icon, text }: icon is a kind the renderer draws (read/edit/run/search/web/todo/tool)
function describe(name, input = {}) {
  switch (name) {
    case 'Read': return { icon: 'read', text: `${base(input.file_path)} 읽는 중` };
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return { icon: 'edit', text: `${base(input.file_path || input.notebook_path)} 고치는 중` };
    case 'Bash': return { icon: 'run', text: oneLine(input.description || input.command, 40) };
    case 'Glob': case 'Grep': return { icon: 'search', text: `${oneLine(input.pattern, 30)} 찾는 중` };
    case 'WebFetch': case 'WebSearch': return { icon: 'web', text: oneLine(input.url || input.query, 30) };
    case 'TodoWrite': return { icon: 'todo', text: '할 일 정리 중' };
    default: return { icon: 'tool', text: name };
  }
}

// subs: Set of live subagent ids, shared across lines of one run
function parse(m, subs) {
  const out = [];
  if (m.type === 'system' && m.subtype === 'init') out.push({ agent: 'lead', kind: 'start', session: m.session_id });
  if (m.type === 'assistant') {
    const who = m.parent_tool_use_id || 'lead';
    for (const b of m.message?.content || []) {
      if (b.type === 'text' && b.text.trim()) out.push({ agent: who, kind: 'say', text: oneLine(b.text, 60) });
      if (b.type !== 'tool_use' || b.name === 'ToolSearch') continue;
      if (SUB_TOOLS.has(b.name)) {
        subs.add(b.id);
        out.push({ agent: b.id, kind: 'hire', boss: who, text: oneLine(b.input?.description, 30), role: b.input?.subagent_type || 'agent' });
      } else {
        out.push({ agent: who, kind: 'work', ...describe(b.name, b.input), toolUseId: b.id });
      }
    }
  }
  if (m.type === 'user') {
    for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
      if (b.type === 'tool_result' && subs.delete(b.tool_use_id)) out.push({ agent: b.tool_use_id, kind: 'leave' });
    }
  }
  if (m.type === 'result') out.push({ agent: 'lead', kind: 'done', ok: !m.is_error, text: oneLine(m.result, 80) });
  return out;
}

module.exports = { parse, describe };
