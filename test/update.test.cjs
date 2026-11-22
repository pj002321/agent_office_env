const test = require('node:test');
const assert = require('node:assert');
const { newer } = require('../app/update.cjs');

test('newer compares release tags numerically', () => {
  assert.ok(newer('v0.2.0', '0.1.2'));
  assert.ok(newer('v0.1.10', '0.1.9'));
  assert.ok(newer('1.0', '0.9.9'));
  assert.ok(!newer('v0.1.2', '0.1.2'));
  assert.ok(!newer('v0.1.1', '0.1.2'));
});
