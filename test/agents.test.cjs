const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const agents = require('../app/agents.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-agents-'));

test('save, list, rename and remove project subagents', () => {
  const p = tmp();
  assert.deepStrictEqual(agents.list(p), []);
  assert.ok(agents.save(p, { name: 'design-team', description: '화면 디자인', tools: 'Read, Grep', prompt: '색은 파스텔로.' }).ok);
  const text = fs.readFileSync(path.join(p, '.claude/agents/design-team.md'), 'utf8');
  assert.match(text, /^---\nname: design-team\ndescription: 화면 디자인\ntools: Read, Grep\n---\n\n색은 파스텔로.\n$/);
  assert.deepStrictEqual(agents.list(p).map(a => [a.name, a.tools, a.prompt]), [['design-team', 'Read, Grep', '색은 파스텔로.']]);
  // keys we don't edit survive; empty tools = every tool; rename moves the file
  fs.writeFileSync(path.join(p, '.claude/agents/design-team.md'), text.replace('tools:', 'model: sonnet\ntools:'));
  assert.ok(agents.save(p, { name: 'ui-team', description: 'UI', tools: '', prompt: '' }, 'design-team').ok);
  assert.deepStrictEqual(fs.readdirSync(path.join(p, '.claude/agents')), ['ui-team.md']);
  assert.match(fs.readFileSync(path.join(p, '.claude/agents/ui-team.md'), 'utf8'), /^---\nname: ui-team\ndescription: UI\nmodel: sonnet\n---/);
  assert.ok(agents.remove(p, 'ui-team').ok);
  assert.deepStrictEqual(agents.list(p), []);
});

test('rejects bad names, path tricks, duplicates and missing descriptions', () => {
  const p = tmp();
  for (const name of ['../x', 'Design', '디자인', '', 'a'.repeat(41)]) assert.strictEqual(agents.save(p, { name, description: 'x' }).ok, false, name);
  assert.strictEqual(agents.save(p, { name: 'qa', description: '  ' }).ok, false);
  assert.strictEqual(agents.save(p, { name: 'qa', description: 'x', tools: 'Bash; rm' }).ok, false);
  assert.ok(agents.save(p, { name: 'qa', description: 'x' }).ok);
  assert.ok(agents.save(p, { name: 'dev', description: 'y' }).ok);
  assert.strictEqual(agents.save(p, { name: 'qa', description: 'y' }, 'dev').ok, false);   // rename onto another team
  assert.strictEqual(agents.remove(p, '../qa').ok, false);
});

test('lead note lists the teams, or nothing', () => {
  assert.strictEqual(agents.leadNote([]), '');
  assert.match(agents.leadNote([{ name: 'qa', room: 'QA팀', description: '테스트' }]), /subagent_type[\s\S]*- qa \(QA팀\): 테스트/);
});
