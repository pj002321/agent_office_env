const test = require('node:test');
const assert = require('node:assert');
const shop = require('../app/shop.cjs');

test('earn, buy in tier order, equip, furniture toggle', () => {
  const s = shop.fresh();
  assert.strictEqual(shop.buy(s, 'small').ok, false);               // 0P
  for (let i = 0; i < 30; i++) shop.earn(s);
  assert.strictEqual(s.points, 300);
  assert.match(shop.buy(s, 'tower').message, /작은 빌딩/);          // tier locked
  assert.ok(shop.buy(s, 'small').ok);
  assert.strictEqual(s.points, 0);
  assert.strictEqual(s.equip.building, 'small');                    // bought → equipped
  assert.strictEqual(shop.buy(s, 'small').ok, false);               // no double buy
  assert.ok(shop.equip(s, 'house').ok);
  assert.strictEqual(s.equip.building, 'house');
  assert.strictEqual(shop.equip(s, 'aquarium').ok, false);          // not owned
  s.points = 500;
  assert.ok(shop.buy(s, 'aquarium').ok);
  assert.deepStrictEqual(s.furniture, ['aquarium']);
  shop.equip(s, 'aquarium', false);
  assert.deepStrictEqual(s.furniture, []);
});

test('load sanitizes a tampered or old save', () => {
  const s = shop.load({ points: -5, owned: ['tower', 'bogus'], equip: { building: 'tower', wall: 'floor-tile' }, furniture: ['arcade'] });
  assert.strictEqual(s.points, 0);
  assert.deepStrictEqual(s.equip, { building: 'tower', wall: 'wall-theme', floor: 'floor-wood' });
  assert.deepStrictEqual(s.furniture, []);
  assert.deepStrictEqual(shop.load(null), shop.fresh());
});

test('attendance: one claim per day, skips keep progress, cycles after day 7', () => {
  const s = shop.fresh();
  assert.deepStrictEqual(shop.attend(s, '2026-11-01'), { ok: true, day: 1, points: 20 });
  assert.strictEqual(s.points, 20);
  assert.strictEqual(shop.attend(s, '2026-11-01').ok, false);           // same day refused
  assert.strictEqual(s.points, 20);
  assert.strictEqual(shop.attend(s, '2026-11-02').day, 2);
  assert.strictEqual(shop.attend(s, '2026-11-09').day, 3);              // skipped days don't reset
  for (const d of ['10', '11', '12', '13']) shop.attend(s, `2026-11-${d}`);
  assert.deepStrictEqual(s.attend, { day: 7, last: '2026-11-13' });
  assert.strictEqual(s.points, shop.REWARDS.reduce((a, b) => a + b));
  assert.deepStrictEqual(shop.attend(s, '2026-11-14'), { ok: true, day: 1, points: 20 });
});

test('load fills or sanitizes attendance', () => {
  assert.deepStrictEqual(shop.load({ points: 5 }).attend, { day: 0, last: null });   // old save
  assert.deepStrictEqual(shop.load({ attend: { day: 3, last: '2026-11-01' } }).attend, { day: 3, last: '2026-11-01' });
  for (const attend of [{ day: 9, last: null }, { day: 2, last: 'yesterday' }, { day: 1.5, last: null }, 'x'])
    assert.deepStrictEqual(shop.load({ attend }).attend, { day: 0, last: null });
});

test('temporary free charge adds pack points', () => {
  const s = shop.fresh();
  assert.deepStrictEqual(shop.charge(s, 'p500'), { ok: true, points: 500 });
  assert.strictEqual(s.points, 500);
  assert.strictEqual(shop.charge(s, 'nope').ok, false);
  assert.strictEqual(s.points, 500);
});
