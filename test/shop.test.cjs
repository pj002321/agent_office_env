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
  assert.ok(shop.buy(s, 'aquarium', 'f1').ok);
  assert.deepStrictEqual(s.rooms.f1.furniture, ['aquarium']);
  shop.equip(s, 'aquarium', false, 'f1');
  assert.deepStrictEqual(s.rooms.f1.furniture, []);
});

test('interior is per floor; untouched floors keep the old building-wide look', () => {
  const s = shop.load({ points: 1000, owned: ['wall-night', 'floor-tile', 'arcade'], equip: { wall: 'wall-night' }, furniture: ['arcade'] });
  assert.deepStrictEqual(shop.room(s, 'a'), { wall: 'wall-night', floor: 'floor-wood', furniture: ['arcade'] });   // old save, untouched
  assert.ok(shop.equip(s, 'floor-tile', true, 'a').ok);
  assert.ok(shop.equip(s, 'arcade', false, 'a').ok);
  assert.deepStrictEqual(shop.room(s, 'a'), { wall: 'wall-night', floor: 'floor-tile', furniture: [] });
  assert.deepStrictEqual(shop.room(s, 'b'), { wall: 'wall-night', floor: 'floor-wood', furniture: ['arcade'] });  // other floor unchanged
  assert.strictEqual(shop.equip(s, 'floor-tile', true).ok, false);                  // interior needs a floor
  assert.ok(shop.buy(s, 'wall-stripe', 'b').ok);                                    // bought on b → worn on b only
  assert.strictEqual(shop.room(s, 'b').wall, 'wall-stripe');
  assert.strictEqual(shop.room(s, 'a').wall, 'wall-night');
  assert.ok(shop.equip(s, 'wall-stripe', true, 'a').ok);                            // owned once, usable on every floor
  assert.strictEqual(s.points, 1000 - 80);
});

test('load sanitizes rooms', () => {
  const s = shop.load({ owned: ['wall-stripe'], rooms: { ok: { wall: 'wall-stripe', floor: 'floor-carpet', furniture: ['arcade', 'x'] },
    '../bad': { wall: 'wall-stripe' }, n: null } });
  assert.deepStrictEqual(s.rooms, { ok: { wall: 'wall-stripe', floor: 'floor-wood', furniture: [] } });
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
