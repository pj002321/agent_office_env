// 꾸미기 상점: points earned per order, spent on the building tier and interior items.
// Pure state functions; main.cjs owns the file. Prices are in points only — cash buys point packs (PACKS),
// so a payment provider plugs in at exactly one place.
const ITEMS = [
  // building: the whole tower's exterior. Tiers unlock in order.
  { id: 'house', slot: 'building', name: '아담한 하우스', desc: '빨간 박공지붕과 굴뚝이 있는 첫 사무실', price: 0, swatch: '#ff8f7a' },
  { id: 'small', slot: 'building', name: '작은 빌딩', desc: '벽돌 외벽, 평평한 옥상에 물탱크', price: 300, requires: 'house', swatch: '#d98b6a' },
  { id: 'tower', slot: 'building', name: '대형 빌딩', desc: '유리 외벽, 옥상 헬리패드와 안테나', price: 1500, requires: 'small', swatch: '#8fb8dc' },
  // wall: wallpaper inside every floor ('theme' = each floor's own pastel)
  { id: 'wall-theme', slot: 'wall', name: '층별 파스텔', desc: '층마다 다른 기본 물방울 벽지', price: 0, swatch: 'linear-gradient(90deg,#bfe9d6,#ffe9ad,#ffd8c6)' },
  { id: 'wall-stripe', slot: 'wall', name: '민트 스트라이프', desc: '산뜻한 세로 줄무늬', price: 80, swatch: 'repeating-linear-gradient(90deg,#d6f2e6 0 8px,#bfe6d4 8px 16px)' },
  { id: 'wall-wood', slot: 'wall', name: '원목 패널', desc: '따뜻한 나무 판자 벽', price: 150, swatch: 'repeating-linear-gradient(90deg,#d9b48a 0 10px,#c99e6e 10px 12px)' },
  { id: 'wall-night', slot: 'wall', name: '별밤 벽지', desc: '남색 바탕에 노란 별', price: 200, swatch: 'radial-gradient(#ffe27a 15%,transparent 20%) 0 0/12px 12px,#3b4a8a' },
  // floor
  { id: 'floor-wood', slot: 'floor', name: '원목 마루', desc: '기본 나무 바닥', price: 0, swatch: '#e7c193' },
  { id: 'floor-tile', slot: 'floor', name: '체크 타일', desc: '크림과 민트 체크무늬', price: 100, swatch: 'conic-gradient(#fff3dc 25%,#bfe6d4 0 50%,#fff3dc 0 75%,#bfe6d4 0) 0 0/16px 16px' },
  { id: 'floor-carpet', slot: 'floor', name: '폭신 카펫', desc: '라벤더 카펫 바닥', price: 180, swatch: '#d9c9f0' },
  // furniture: owned items toggle on/off independently
  { id: 'aquarium', slot: 'furniture', name: '수족관', desc: '오른쪽 벽의 작은 어항', price: 150, swatch: '#8fd0f0' },
  { id: 'arcade', slot: 'furniture', name: '오락기', desc: '쉬는 시간용 레트로 게임기', price: 250, swatch: '#b48ae8' },
  { id: 'vending', slot: 'furniture', name: '자판기', desc: '왼쪽 벽의 음료 자판기', price: 200, swatch: '#ff8f7a' },
  { id: 'lights', slot: 'furniture', name: '꼬마전구', desc: '뒷벽을 따라 반짝이는 전구 줄', price: 120, swatch: '#ffd45e' },
];
// TEMPORARY: packs are free while testing. Set false (or replace charge() with real payment
// verification via Stripe / Toss / app store) before release.
const FREE_CHARGE = true;
const PACKS = [
  { id: 'p500', points: 500, won: 1100 },
  { id: 'p1500', points: 1500, won: 3300 },
  { id: 'p5000', points: 5000, won: 9900 },
];
const EARN = 10;   // points per order
const REWARDS = [20, 20, 30, 30, 50, 50, 100];   // 출석체크 day 1..7, then the board starts over
const SLOTS = ['building', 'wall', 'floor'];

const fresh = () => ({ points: 0, owned: ITEMS.filter(i => !i.price).map(i => i.id),
  equip: { building: 'house', wall: 'wall-theme', floor: 'floor-wood' }, furniture: [], attend: { day: 0, last: null } });
function load(raw) {   // fills gaps in an older or partial save
  const s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  if (Number.isInteger(raw.points) && raw.points >= 0) s.points = raw.points;
  const known = id => ITEMS.some(i => i.id === id);
  if (Array.isArray(raw.owned)) s.owned = [...new Set([...s.owned, ...raw.owned.filter(known)])];
  for (const slot of SLOTS) {
    const id = raw.equip?.[slot];
    if (s.owned.includes(id) && ITEMS.find(i => i.id === id).slot === slot) s.equip[slot] = id;
  }
  if (Array.isArray(raw.furniture)) s.furniture = raw.furniture.filter(id => s.owned.includes(id));
  const a = raw.attend;
  if (a && Number.isInteger(a.day) && a.day >= 0 && a.day <= REWARDS.length && (a.last === null || /^\d{4}-\d{2}-\d{2}$/.test(a.last)))
    s.attend = { day: a.day, last: a.last };
  return s;
}
const earn = s => { s.points += EARN; return s; };
function buy(s, id) {
  const it = ITEMS.find(i => i.id === id);
  if (!it) return { ok: false, message: '없는 물건이에요.' };
  if (s.owned.includes(id)) return { ok: false, message: '이미 가지고 있어요.' };
  if (it.requires && !s.owned.includes(it.requires)) return { ok: false, message: `${ITEMS.find(i => i.id === it.requires).name}을(를) 먼저 사야 해요.` };
  if (s.points < it.price) return { ok: false, message: `포인트가 ${it.price - s.points}P 모자라요.` };
  s.points -= it.price;
  s.owned.push(id);
  equip(s, id, true);   // bought it → wear it
  return { ok: true };
}
function equip(s, id, on = true) {
  const it = ITEMS.find(i => i.id === id);
  if (!it || !s.owned.includes(id)) return { ok: false, message: '먼저 사야 해요.' };
  if (it.slot === 'furniture') s.furniture = on ? [...new Set([...s.furniture, id])] : s.furniture.filter(x => x !== id);
  else s.equip[it.slot] = id;
  return { ok: true };
}

function charge(s, id) {
  const p = PACKS.find(x => x.id === id);
  if (!p) return { ok: false, message: '없는 충전 상품이에요.' };
  if (!FREE_CHARGE) return { ok: false, message: '결제 연결 준비 중이에요.' };
  s.points += p.points;
  return { ok: true, points: p.points };
}

// One claim per local day (today = 'YYYY-MM-DD' from the caller). Skipped days don't reset the board.
function attend(s, today) {
  if (s.attend.last === today) return { ok: false, message: '오늘은 이미 출석했어요.' };
  const day = s.attend.day % REWARDS.length + 1;
  const points = REWARDS[day - 1];
  s.attend = { day, last: today };
  s.points += points;
  return { ok: true, day, points };
}

module.exports = { ITEMS, PACKS, EARN, REWARDS, FREE_CHARGE, fresh, load, earn, buy, equip, charge, attend };
