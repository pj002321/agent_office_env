const test = require('node:test');
const assert = require('node:assert');
const { frontmatter } = require('../app/skills.cjs');

test('SKILL.md frontmatter: plain, quoted, folded', () => {
  assert.deepStrictEqual(frontmatter('---\nname: animate\ndescription: "Build an animation"\n---\nbody'),
    { name: 'animate', description: 'Build an animation' });
  assert.deepStrictEqual(frontmatter('---\r\nname: x\r\ndescription: >\r\n  first line\r\n  second line\r\nother: 1\r\n---\r\n'),
    { name: 'x', description: 'first line second line', other: '1' });
  assert.deepStrictEqual(frontmatter('no frontmatter'), {});
});
