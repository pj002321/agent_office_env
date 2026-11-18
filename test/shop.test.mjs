import test from 'node:test';
import assert from 'node:assert';
import * as shop from '../supabase/functions/_shared/shop.js';

const DAY = '2026-11-18';
const earnN = (s, n, t0 = 1e6) => { for (let i = 0; i < n; i++) shop.earn(s, t0 + i * shop.EARN_GAP_MS, DAY); };

test('levels: curve, bonus points on level up', () => {
  assert.deepStrictEqual(shop.levelOf(0), { level: 1, into: 0, next: 50 });
  assert.deepStrictEqual(shop.levelOf(50), { level: 2, into: 0, next: 75 });
  assert.strictEqual(shop.levelOf(124).level, 2);
  assert.strictEqual(shop.levelOf(125).level, 3);
  const s = shop.fresh();
  earnN(s, 4);
  assert.deepStrictEqual([s.xp, s.points], [40, 40]);
  const r = shop.earn(s, 1e6 + 4 * shop.EARN_GAP_MS, DAY);   // 5th order → Lv.2
  assert.deepStrictEqual(r.levelUp, { level: 2, bonus: 20 });
  assert.strictEqual(s.points, 50 + 20);
});

test('earn is throttled by gap and daily cap', () => {
  const s = shop.fresh();
  assert.ok(shop.earn(s, 1e6, DAY).ok);
  assert.strictEqual(shop.earn(s, 1e6 + 1000, DAY).ok, false);   // too soon
  earnN(s, shop.EARN_DAILY + 5, 2e6);
  assert.strictEqual(s.earned.count, shop.EARN_DAILY);
  assert.ok(shop.earn(s, 9e9, '2026-11-19').ok);   // new day resets the cap
});

test('buy needs level, tier order and points; equip and furniture per floor', () => {
  const s = shop.fresh();
  s.points = 10000;
  assert.match(shop.buy(s, 'small').message, /Lv\.3/);
  s.xp = shop.need(1) + shop.need(2);   // Lv.3
  assert.ok(shop.buy(s, 'small').ok);
  assert.strictEqual(s.equip.building, 'small');
  assert.match(shop.buy(s, 'tower').message, /Lv\.7/);
  assert.strictEqual(shop.buy(s, 'small').ok, false);   // no double buy
  assert.ok(shop.buy(s, 'aquarium', 'f1').ok);
  assert.deepStrictEqual(s.rooms.f1.furniture, ['aquarium']);
  shop.equip(s, 'aquarium', false, 'f1');
  assert.deepStrictEqual(s.rooms.f1.furniture, []);
  assert.strictEqual(shop.equip(s, 'arcade', true, 'f1').ok, false);   // not owned
  s.points = 0;
  assert.match(shop.buy(s, 'lights').message, /모자라요/);
});

test('load sanitizes; adopt caps imported points and resets XP', () => {
  const s = shop.load({ points: -5, xp: 1.5, owned: ['nope', 'arcade'], rooms: { '../bad': {}, a: { wall: 'wall-night' } }, earned: 'x' });
  assert.deepStrictEqual([s.points, s.xp], [0, 0]);
  assert.ok(s.owned.includes('arcade') && !s.owned.includes('nope'));
  assert.deepStrictEqual(Object.keys(s.rooms), ['a']);
  assert.strictEqual(s.rooms.a.wall, 'wall-theme');   // not owned → default
  assert.deepStrictEqual(shop.load(null), shop.fresh());
  const a = shop.adopt({ points: 99999, xp: 500, owned: ['tower'], claimed: ['x'] });
  assert.deepStrictEqual([a.points, a.xp, a.claimed], [shop.IMPORT_POINT_CAP, 0, []]);
  assert.ok(a.owned.includes('tower'));
});

test('attendance: one per day, board cycles, date must be near server date', () => {
  const s = shop.fresh();
  assert.deepStrictEqual(shop.attend(s, '2026-11-18', DAY), { ok: true, day: 1, points: 20 });
  assert.strictEqual(shop.attend(s, '2026-11-18', DAY).ok, false);
  assert.strictEqual(shop.attend(s, '2026-11-17', DAY).ok, false);   // back in time
  assert.strictEqual(shop.attend(s, '2026-12-30', DAY).ok, false);   // clock far ahead
  assert.strictEqual(shop.attend(s, '2026-11-19', DAY).day, 2);      // a time zone ahead is fine
});

test('claim grants each paid order once and skips refunds and junk', () => {
  const s = shop.fresh();
  const list = [{ id: '1', points: 800, status: 'paid' }, { id: '2', points: 1500, status: 'refunded' }, { id: '3', points: -5, status: 'paid' }];
  assert.deepStrictEqual(shop.claim(s, list), { ok: true, points: 800 });
  assert.deepStrictEqual(shop.claim(s, list), { ok: false, points: 0 });
  assert.strictEqual(s.points, 800);
  assert.deepStrictEqual(shop.load(JSON.parse(JSON.stringify(s))).claimed, ['1']);
});

test('view carries level progress and catalog', () => {
  const s = shop.fresh(); s.xp = 60;
  const v = shop.view(s, DAY);
  assert.deepStrictEqual([v.level, v.into, v.next], [2, 10, 75]);
  assert.ok(v.items.every(i => Number.isInteger(i.level) && i.level >= 1));
});

test('catalog: unique ids, building tiers chain upward in level', () => {
  const ids = shop.ITEMS.map(i => i.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const it of shop.ITEMS.filter(i => i.requires)) {
    const prev = shop.ITEMS.find(i => i.id === it.requires);
    assert.ok(prev && prev.level <= it.level, it.id);
  }
});

test('desk, sofa and pc styles are per floor; old rooms get the defaults', () => {
  const s = shop.load({ owned: ['wall-stripe'], rooms: { a: { wall: 'wall-stripe', furniture: [] } } });
  assert.deepStrictEqual(shop.room(s, 'a'), { wall: 'wall-stripe', floor: 'floor-wood', desk: 'desk-wood', sofa: 'sofa-coral', pc: 'pc-basic', furniture: [], hidden: [] });
  s.xp = 99999; s.points = 5000;
  assert.ok(shop.buy(s, 'desk-gaming', 'a').ok);
  assert.ok(shop.buy(s, 'pc-dual', 'b').ok);
  assert.strictEqual(shop.room(s, 'a').desk, 'desk-gaming');
  assert.strictEqual(shop.room(s, 'a').pc, 'pc-basic');
  assert.strictEqual(shop.room(s, 'b').pc, 'pc-dual');
  assert.strictEqual(shop.room(s, 'c').desk, 'desk-wood');   // untouched floor
  assert.ok(shop.equip(s, 'desk-gaming', true, 'c').ok);
  assert.strictEqual(shop.load(JSON.parse(JSON.stringify(s))).rooms.c.desk, 'desk-gaming');
});

test('admin tools: level jump, points, unlock all, reset keeps paid orders', () => {
  const s = shop.fresh(); s.claimed = ['pay_1'];
  assert.ok(shop.admin(s, 'level', 10).ok);
  assert.strictEqual(shop.levelOf(s.xp).level, 10);
  assert.ok(shop.admin(s, 'points', 1000).ok);
  assert.ok(shop.admin(s, 'points', -5000).ok);
  assert.strictEqual(s.points, 0);
  assert.strictEqual(shop.admin(s, 'level', 500).ok, false);
  assert.ok(shop.admin(s, 'unlock').ok);
  assert.strictEqual(s.owned.length, shop.ITEMS.length);
  assert.ok(shop.admin(s, 'reset').ok);
  assert.deepStrictEqual([s.xp, s.points, s.claimed], [0, 0, ['pay_1']]);
  assert.strictEqual(shop.admin(s, 'nope').ok, false);
});

test('built-in furniture is owned, shown by default, and can be taken out per floor', () => {
  const s = shop.fresh();
  assert.ok(s.owned.includes('lounge') && s.owned.includes('clock'));
  assert.deepStrictEqual(shop.room(s, 'a').hidden, []);
  assert.ok(shop.equip(s, 'lounge', false, 'a').ok);
  assert.ok(shop.equip(s, 'rug', false, 'a').ok);
  assert.deepStrictEqual(shop.room(s, 'a').hidden, ['lounge', 'rug']);
  assert.deepStrictEqual(shop.room(s, 'b').hidden, []);   // other floors keep theirs
  assert.ok(shop.equip(s, 'lounge', true, 'a').ok);
  assert.deepStrictEqual(shop.load(JSON.parse(JSON.stringify(s))).rooms.a.hidden, ['rug']);
  assert.deepStrictEqual(shop.load({ rooms: { a: { hidden: ['rug', 'bogus', 'rug'] } } }).rooms.a.hidden, ['rug']);
});
