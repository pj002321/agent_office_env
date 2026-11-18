// Team rooms ↔ Claude Code project subagents: <project>/.claude/agents/<name>.md
// (YAML-ish frontmatter: name, description, tools; the body is the team's instructions).
// Keys we don't edit (model, color, …) are kept as they were.
const fs = require('fs');
const path = require('path');

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const dirOf = project => path.join(project, '.claude', 'agents');
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();

function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, prompt: m[2].trim() };
}

function list(project) {
  let files = [];
  try { files = fs.readdirSync(dirOf(project)).filter(f => f.endsWith('.md')); } catch { return []; }
  return files.flatMap(file => {
    try {
      const a = parse(fs.readFileSync(path.join(dirOf(project), file), 'utf8'));
      if (!a || !NAME.test(a.meta.name || '')) return [];
      return [{ name: a.meta.name, description: a.meta.description || '', tools: a.meta.tools || '', prompt: a.prompt, file }];
    } catch { return []; }
  });
}

// a = { name, description, tools, prompt }; old = the name it had before (rename) → { ok, message? }
function save(project, a, old) {
  const name = String(a?.name || '');
  if (!NAME.test(name)) return { ok: false, message: '팀 ID는 영어 소문자·숫자·하이픈(-)으로 40자까지 써 주세요. 예: design-team' };
  const description = oneLine(a.description).slice(0, 300);
  if (!description) return { ok: false, message: '이 팀이 맡을 일을 한 줄로 적어 주세요. 팀장이 이걸 보고 일을 나눠요.' };
  const tools = oneLine(a.tools).slice(0, 300);
  if (tools && !/^[A-Za-z0-9_*(), :.\-/]+$/.test(tools)) return { ok: false, message: '도구 목록에 쓸 수 없는 글자가 있어요.' };
  const dir = dirOf(project);
  const existing = list(project);
  const prev = existing.find(x => x.name === (old && NAME.test(old) ? old : name));
  if (name !== old && existing.some(x => x.name === name)) return { ok: false, message: `'${name}' 팀이 이미 있어요.` };
  let meta = {};
  if (prev) try { meta = parse(fs.readFileSync(path.join(dir, prev.file), 'utf8')).meta; } catch {}
  meta = { ...meta, name, description };
  if (tools) meta.tools = tools; else delete meta.tools;   // no tools line = every tool
  const head = Object.entries(meta).map(([k, v]) => `${k}: ${String(v).replace(/\r?\n/g, ' ')}`).join('\n');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${head}\n---\n\n${String(a.prompt || '').trim()}\n`);
  if (prev && prev.file !== `${name}.md`) fs.rmSync(path.join(dir, prev.file), { force: true });
  return { ok: true };
}

function remove(project, name) {
  const a = NAME.test(name) && list(project).find(x => x.name === name);
  if (a) fs.rmSync(path.join(dirOf(project), a.file), { force: true });
  return { ok: !!a };
}

// appended to the lead's system prompt so work actually goes to the rooms 대표 set up
function leadNote(teams) {
  if (!teams.length) return '';
  return ['This office has teams. Delegate each part of the work to the matching team with the Agent tool (subagent_type = the team id); do small coordination yourself.',
    ...teams.map(t => `- ${t.name}${t.room ? ` (${t.room})` : ''}: ${t.description}`)].join('\n');
}

module.exports = { list, save, remove, leadNote, parse, NAME };
