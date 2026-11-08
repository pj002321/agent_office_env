const test = require('node:test');
const assert = require('node:assert');
const { messages } = require('../app/history.cjs');

test('transcript keeps orders and replies in time order, skips noise', () => {
  const lines = [
    { type: 'assistant', timestamp: '2026-01-01T00:00:02Z', message: { content: [{ type: 'text', text: 'OK' }, { type: 'tool_use', name: 'Read' }] } },
    { type: 'user', timestamp: '2026-01-01T00:00:01Z', message: { content: 'Remember PAPAYA\n' } },
    { type: 'user', timestamp: '2026-01-01T00:00:03Z', message: { content: [{ type: 'tool_result', content: 'x' }] } },
    { type: 'user', isMeta: true, timestamp: '2026-01-01T00:00:04Z', message: { content: 'meta' } },
    { type: 'user', timestamp: '2026-01-01T00:00:05Z', message: { content: '<command-name>/x</command-name>' } },
    { type: 'assistant', isSidechain: true, timestamp: '2026-01-01T00:00:06Z', message: { content: [{ type: 'text', text: 'sub' }] } },
    { type: 'summary', summary: 's' },
  ].map(l => JSON.stringify(l)).join('\n') + '\nnot json';
  assert.deepStrictEqual(messages(lines).map(m => [m.me, m.text]), [[true, 'Remember PAPAYA'], [false, 'OK']]);
});
