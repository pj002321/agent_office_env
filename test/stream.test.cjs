// Shapes below are trimmed from a real `claude -p --output-format stream-json --verbose` run (CLI, 2026-11).
const test = require('node:test');
const assert = require('node:assert');
const { parse } = require('../app/stream.cjs');

test('lead work, subagent hire → work → leave, done', () => {
  const subs = new Set();
  const lines = [
    { type: 'system', subtype: 'init', session_id: 's1' },
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'Read', id: 't1', input: { file_path: 'C:\\x\\notes.md' } }] } },
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'Agent', id: 'a1', input: { description: 'count files', subagent_type: 'general-purpose' } }] } },
    { type: 'assistant', parent_tool_use_id: 'a1', message: { content: [{ type: 'tool_use', name: 'Glob', id: 't2', input: { pattern: '*' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a1' }] } },
    { type: 'result', is_error: false, result: '2 files' },
  ];
  const ev = lines.flatMap(m => parse(m, subs)).map(e => `${e.agent}:${e.kind}:${e.icon ? e.icon + ' ' : ''}${e.text || ''}`);
  assert.deepStrictEqual(ev, [
    'lead:start:',
    'lead:work:read notes.md 읽는 중',
    'a1:hire:count files',
    'a1:work:search * 찾는 중',
    'a1:leave:',
    'lead:done:2 files',
  ]);
  assert.strictEqual(subs.size, 0);
});
