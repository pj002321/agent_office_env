// 꾸미기 상점 rules: points, XP/levels, items, attendance, paid packs. Pure functions on a wallet state object.
// The source of truth runs on the server (supabase/functions/wallet) so a wallet follows the account across
// computers and can't be edited locally; tests import this file directly.
export const ITEMS = [
  // building: the whole tower's exterior. Each tier needs the one before it and a level.
  { id: 'house', slot: 'building', name: '아담한 하우스', desc: '빨간 박공지붕과 굴뚝이 있는 첫 사무실', price: 0, level: 1 },
  { id: 'small', slot: 'building', name: '작은 빌딩', desc: '벽돌 외벽, 평평한 옥상에 물탱크', price: 300, level: 3, requires: 'house' },
  { id: 'tower', slot: 'building', name: '대형 빌딩', desc: '유리 외벽, 옥상 헬리패드와 안테나', price: 1200, level: 7, requires: 'small' },
  { id: 'neon', slot: 'building', name: '네온 타워', desc: '빛나는 모서리 라인과 옥상 네온 전광판', price: 2500, level: 12, requires: 'tower' },
  { id: 'crystal', slot: 'building', name: '크리스털 타워', desc: '유리 피라미드 지붕 속에서 빛나는 수정', price: 4000, level: 16, requires: 'neon' },
  { id: 'gold', slot: 'building', name: '황금 펜트하우스', desc: '기둥 위 황금 돔과 네 귀퉁이의 오벨리스크', price: 6500, level: 20, requires: 'crystal' },
  { id: 'sky', slot: 'building', name: '스카이 팰리스', desc: '돌아가는 빛의 고리와 하늘까지 닿는 빛기둥', price: 10000, level: 25, requires: 'gold' },
  // wall: wallpaper inside each floor ('theme' = each floor's own pastel)
  { id: 'wall-theme', slot: 'wall', name: '건물 기본 벽지', desc: '건물 외관에 맞춰 바뀌는 물방울 벽지', price: 0, level: 1 },
  { id: 'wall-stripe', slot: 'wall', name: '민트 스트라이프', desc: '산뜻한 세로 줄무늬', price: 80, level: 1 },
  { id: 'wall-brick', slot: 'wall', name: '붉은 벽돌', desc: '카페 같은 벽돌 벽', price: 120, level: 3 },
  { id: 'wall-wood', slot: 'wall', name: '원목 패널', desc: '따뜻한 나무 판자 벽', price: 150, level: 4 },
  { id: 'wall-sakura', slot: 'wall', name: '벚꽃 벽지', desc: '분홍 꽃잎이 흩날리는 봄', price: 180, level: 6 },
  { id: 'wall-night', slot: 'wall', name: '별밤 벽지', desc: '남색 바탕에 노란 별', price: 220, level: 8 },
  { id: 'wall-ocean', slot: 'wall', name: '바다 물결', desc: '하늘색에서 파랑으로 번지는 파도', price: 280, level: 10 },
  { id: 'wall-neon', slot: 'wall', name: '네온 그리드', desc: '어두운 벽에 분홍·하늘색 네온 선', price: 400, level: 13 },
  { id: 'wall-gold', slot: 'wall', name: '황금 다마스크', desc: '짙은 갈색 위 금빛 무늬', price: 600, level: 17 },
  // floor
  { id: 'floor-wood', slot: 'floor', name: '원목 마루', desc: '기본 나무 바닥', price: 0, level: 1 },
  { id: 'floor-tile', slot: 'floor', name: '체크 타일', desc: '크림과 민트 체크무늬', price: 100, level: 2 },
  { id: 'floor-herring', slot: 'floor', name: '헤링본 마루', desc: '지그재그로 짠 고급 나무 바닥', price: 160, level: 4 },
  { id: 'floor-carpet', slot: 'floor', name: '폭신 카펫', desc: '라벤더 카펫 바닥', price: 180, level: 5 },
  { id: 'floor-marble', slot: 'floor', name: '대리석', desc: '은은한 결이 흐르는 하얀 대리석', price: 320, level: 9 },
  { id: 'floor-neon', slot: 'floor', name: '네온 플로어', desc: '하늘색 빛줄기가 흐르는 검은 바닥', price: 450, level: 13 },
  { id: 'floor-gold', slot: 'floor', name: '황금 체커', desc: '금과 흑단의 체크무늬', price: 650, level: 18 },
  // desk / sofa / pc: the room's built-in furniture, restyled per floor
  { id: 'desk-wood', slot: 'desk', name: '원목 책상', desc: '기본 나무 책상과 코랄 의자', price: 0, level: 1 },
  { id: 'desk-white', slot: 'desk', name: '화이트 모던 책상', desc: '하얀 상판, 은색 다리, 민트 의자', price: 150, level: 3 },
  { id: 'desk-gaming', slot: 'desk', name: '게이밍 책상', desc: '검은 상판 아래로 RGB 조명이 흘러요', price: 400, level: 10 },
  { id: 'desk-gold', slot: 'desk', name: '황금 대표 책상', desc: '흑단 상판과 금빛 다리, 와인색 의자', price: 900, level: 18 },
  { id: 'sofa-coral', slot: 'sofa', name: '코랄 소파', desc: '기본 코랄 소파와 노란 안락의자', price: 0, level: 1 },
  { id: 'sofa-mint', slot: 'sofa', name: '민트 소파', desc: '산뜻한 민트 소파와 크림 의자', price: 100, level: 2 },
  { id: 'sofa-leather', slot: 'sofa', name: '가죽 소파', desc: '중후한 갈색 가죽 라운지', price: 250, level: 6 },
  { id: 'sofa-velvet', slot: 'sofa', name: '벨벳 소파', desc: '보랏빛 벨벳과 분홍 의자', price: 350, level: 11 },
  { id: 'sofa-gold', slot: 'sofa', name: '로열 소파', desc: '크림 쿠션에 금빛 팔걸이', price: 700, level: 17 },
  { id: 'pc-basic', slot: 'pc', name: '기본 모니터', desc: '책상마다 하나씩 놓인 모니터', price: 0, level: 1 },
  { id: 'pc-laptop', slot: 'pc', name: '노트북', desc: '가볍게 열어 둔 은색 노트북', price: 120, level: 3 },
  { id: 'pc-dual', slot: 'pc', name: '듀얼 모니터', desc: '양쪽으로 기울인 모니터 두 대', price: 300, level: 8 },
  { id: 'pc-holo', slot: 'pc', name: '홀로그램 화면', desc: '받침대 위에 떠 있는 빛 화면', price: 800, level: 15 },
  // 기본 가구: every room starts with these; 대표 can take them out (per floor) and put them back
  { id: 'lounge', slot: 'furniture', builtin: true, name: '라운지 소파 세트', desc: '소파, 안락의자 둘, 둥근 탁자', price: 0, level: 1 },
  { id: 'shelf', slot: 'furniture', builtin: true, name: '책장', desc: '알록달록 책이 꽂힌 책장', price: 0, level: 1 },
  { id: 'coffee', slot: 'furniture', builtin: true, name: '커피 카운터', desc: '팀장이 커피 마시러 가는 곳', price: 0, level: 1 },
  { id: 'plants', slot: 'furniture', builtin: true, name: '큰 화분들', desc: '방 구석구석 둥근 화분 셋', price: 0, level: 1 },
  { id: 'lamp', slot: 'furniture', builtin: true, name: '스탠드 조명', desc: '소파 옆 키 큰 스탠드', price: 0, level: 1 },
  { id: 'rug', slot: 'furniture', builtin: true, name: '러그', desc: '라운지 아래 둥근 러그', price: 0, level: 1 },
  { id: 'clock', slot: 'furniture', builtin: true, name: '벽시계', desc: '컴퓨터 시간을 따라 도는 시계', price: 0, level: 1 },
  // furniture: owned items toggle on/off per floor
  { id: 'cactus', slot: 'furniture', name: '선인장 화분', desc: '꽃 한 송이 핀 작은 선인장', price: 80, level: 1 },
  { id: 'lights', slot: 'furniture', name: '꼬마전구', desc: '뒷벽을 따라 반짝이는 전구 줄', price: 120, level: 2 },
  { id: 'aquarium', slot: 'furniture', name: '수족관', desc: '오른쪽 벽의 작은 어항', price: 150, level: 3 },
  { id: 'tv', slot: 'furniture', name: '벽걸이 TV', desc: '커피 머신 위에서 색이 바뀌는 화면', price: 180, level: 4 },
  { id: 'vending', slot: 'furniture', name: '자판기', desc: '왼쪽 벽의 음료 자판기', price: 200, level: 5 },
  { id: 'ceo-sign', slot: 'furniture', name: '대표실 네온', desc: '대표 책상 위에 빛나는 CEO 간판', price: 220, level: 6 },
  { id: 'arcade', slot: 'furniture', name: '오락기', desc: '쉬는 시간용 레트로 게임기', price: 250, level: 7 },
  { id: 'jukebox', slot: 'furniture', name: '주크박스', desc: '구석에서 빛나는 레트로 음악 상자', price: 350, level: 9 },
  { id: 'fireplace', slot: 'furniture', name: '벽난로', desc: '타닥타닥 불꽃이 일렁이는 벽난로', price: 450, level: 11 },
  { id: 'disco', slot: 'furniture', name: '미러볼', desc: '천장에서 돌며 바닥에 색 조명을 뿌려요', price: 550, level: 14 },
  { id: 'chandelier', slot: 'furniture', name: '크리스털 샹들리에', desc: '금빛 고리에 매달린 촛불과 수정', price: 800, level: 16 },
  { id: 'statue', slot: 'furniture', name: '황금 복고양이', desc: '앞발을 흔드는 행운의 황금 고양이', price: 1200, level: 19 },
];
export const PACKS = [
  { id: 'p800', points: 800, usd: 2.99 },
  { id: 'p1500', points: 1500, usd: 4.99 },
  { id: 'p3500', points: 3500, usd: 9.99 },
];
export const EARN = 10;                 // points per order
export const XP = 10;                   // experience per order
export const REWARDS = [20, 20, 30, 30, 50, 50, 100];   // 출석체크 day 1..7, then the board starts over
// Orders are reported by the app, so the server caps them: an open-source client can be scripted.
export const EARN_GAP_MS = 20e3, EARN_DAILY = 60;
export const IMPORT_POINT_CAP = 2000;   // points carried over from a pre-account local wallet, once
const STYLES = ['wall', 'floor', 'desk', 'sofa', 'pc'];   // one pick per floor
const SLOTS = ['building', ...STYLES];
const FLOOR_ID = /^[\w-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Level L → L+1 costs 50 + 25·(L−1) XP: 5 orders for Lv.2, ~135 for Lv.10, ~520 for Lv.20.
export const need = level => 50 + 25 * (level - 1);
export function levelOf(xp) {
  let level = 1;
  while (xp >= need(level)) { xp -= need(level); level++; }
  return { level, into: xp, next: need(level) };
}
export const levelBonus = level => 10 * level;   // points given on reaching `level`

export const fresh = () => ({ points: 0, xp: 0, owned: ITEMS.filter(i => !i.price).map(i => i.id),
  equip: { building: 'house', wall: 'wall-theme', floor: 'floor-wood', desk: 'desk-wood', sofa: 'sofa-coral', pc: 'pc-basic' }, furniture: [], rooms: {},
  attend: { day: 0, last: null }, claimed: [], earned: { day: null, count: 0, at: 0 } });
export const room = (s, fid) => ({ ...Object.fromEntries(STYLES.map(k => [k, s.equip[k]])), furniture: [...s.furniture], hidden: [], ...s.rooms[fid] });
const BUILTIN = ITEMS.filter(i => i.builtin).map(i => i.id);

export function load(raw) {   // fills gaps in an older or partial save, drops anything unknown
  const s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  const nat = n => Number.isInteger(n) && n >= 0;
  if (nat(raw.points)) s.points = raw.points;
  if (nat(raw.xp)) s.xp = raw.xp;
  const known = id => ITEMS.some(i => i.id === id);
  if (Array.isArray(raw.owned)) s.owned = [...new Set([...s.owned, ...raw.owned.filter(known)])];
  for (const slot of SLOTS) {
    const id = raw.equip?.[slot];
    if (s.owned.includes(id) && ITEMS.find(i => i.id === id).slot === slot) s.equip[slot] = id;
  }
  if (Array.isArray(raw.furniture)) s.furniture = raw.furniture.filter(id => s.owned.includes(id));
  for (const [fid, r] of Object.entries(raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {})) {
    if (!FLOOR_ID.test(fid) || !r || typeof r !== 'object') continue;
    const fit = (id, slot) => s.owned.includes(id) && ITEMS.find(i => i.id === id).slot === slot;
    s.rooms[fid] = { ...Object.fromEntries(STYLES.map(k => [k, fit(r[k], k) ? r[k] : s.equip[k]])),
                     furniture: Array.isArray(r.furniture) ? r.furniture.filter(id => fit(id, 'furniture') && !BUILTIN.includes(id)) : [],
                     hidden: Array.isArray(r.hidden) ? [...new Set(r.hidden.filter(id => BUILTIN.includes(id)))] : [] };
  }
  const a = raw.attend;
  if (a && Number.isInteger(a.day) && a.day >= 0 && a.day <= REWARDS.length && (a.last === null || DATE.test(a.last)))
    s.attend = { day: a.day, last: a.last };
  if (Array.isArray(raw.claimed)) s.claimed = raw.claimed.filter(id => typeof id === 'string');
  const e = raw.earned;
  if (e && (e.day === null || DATE.test(e.day)) && nat(e.count) && nat(e.at)) s.earned = { day: e.day, count: e.count, at: e.at };
  return s;
}

// A local wallet from before accounts existed: keep its look and items, cap its points, start XP at 0.
export function adopt(local) {
  const s = load(local);
  s.points = Math.min(s.points, IMPORT_POINT_CAP);
  s.xp = 0; s.claimed = []; s.earned = fresh().earned;
  return s;
}

function gain(s, xp) {   // adds XP; every level crossed pays its bonus
  const before = levelOf(s.xp).level;
  s.xp += xp;
  const after = levelOf(s.xp).level;
  let bonus = 0;
  for (let l = before + 1; l <= after; l++) bonus += levelBonus(l);
  s.points += bonus;
  return after > before ? { level: after, bonus } : null;
}

// One finished order. `now` = server ms, `day` = server UTC date.
export function earn(s, now, day) {
  if (s.earned.day !== day) s.earned = { day, count: 0, at: s.earned.at };
  if (now - s.earned.at < EARN_GAP_MS || s.earned.count >= EARN_DAILY) return { ok: false, message: '오늘 받을 수 있는 보상을 다 받았어요.' };
  s.earned = { day, count: s.earned.count + 1, at: now };
  s.points += EARN;
  return { ok: true, points: EARN, xp: XP, levelUp: gain(s, XP) };
}

export function buy(s, id, fid) {
  const it = ITEMS.find(i => i.id === id);
  if (!it) return { ok: false, message: '없는 물건이에요.' };
  if (s.owned.includes(id)) return { ok: false, message: '이미 가지고 있어요.' };
  if (levelOf(s.xp).level < it.level) return { ok: false, message: `Lv.${it.level}이 되면 살 수 있어요.` };
  if (it.requires && !s.owned.includes(it.requires)) return { ok: false, message: `${ITEMS.find(i => i.id === it.requires).name}을(를) 먼저 사야 해요.` };
  if (s.points < it.price) return { ok: false, message: `포인트가 ${it.price - s.points}P 모자라요.` };
  s.points -= it.price;
  s.owned.push(id);
  if (it.slot === 'building' || fid) equip(s, id, true, fid);   // bought it → wear it (on the floor being decorated)
  return { ok: true };
}

// owned items work on every floor; interior slots need the floor id
export function equip(s, id, on = true, fid) {
  const it = ITEMS.find(i => i.id === id);
  if (!it || !s.owned.includes(id)) return { ok: false, message: '먼저 사야 해요.' };
  if (it.slot === 'building') { s.equip.building = id; return { ok: true }; }
  if (!FLOOR_ID.test(fid || '')) return { ok: false, message: '꾸밀 층을 먼저 골라 주세요.' };
  const r = s.rooms[fid] = room(s, fid);
  if (it.builtin) r.hidden = on ? r.hidden.filter(x => x !== id) : [...new Set([...r.hidden, id])];
  else if (it.slot === 'furniture') r.furniture = on ? [...new Set([...r.furniture, id])] : r.furniture.filter(x => x !== id);
  else r[it.slot] = id;
  return { ok: true };
}

// 관리자 tools (the server only lets ADMIN_IDS call these): jump to a level, add points, own everything, start over
export const xpFor = level => { let xp = 0; for (let l = 1; l < level; l++) xp += need(l); return xp; };
export function admin(s, act, n) {
  const int = Number.isInteger(n) ? n : 0;
  if (act === 'level' && int >= 1 && int <= 99) s.xp = xpFor(int);
  else if (act === 'points' && Math.abs(int) <= 1e6) s.points = Math.max(0, s.points + int);
  else if (act === 'unlock') s.owned = ITEMS.map(i => i.id);
  else if (act === 'reset') Object.assign(s, fresh(), { claimed: s.claimed });   // keep paid orders claimed
  else return { ok: false, message: '없는 관리 기능이에요.' };
  return { ok: true };
}

export function dropRoom(s, fid) { delete s.rooms[fid]; return { ok: true }; }

// Grants each paid server order once per account (purchases come from the server's own table).
export function claim(s, purchases) {
  let points = 0;
  for (const p of purchases) {
    if (p.status !== 'paid' || typeof p.id !== 'string' || !Number.isInteger(p.points) || p.points <= 0 || s.claimed.includes(p.id)) continue;
    s.claimed.push(p.id);
    points += p.points;
  }
  s.points += points;
  return { ok: points > 0, points };
}

// One claim per local day. `today` comes from the user's computer, so the server only accepts dates
// within a day of its own UTC date (time zones) and never one at or before the last claim.
export function attend(s, today, serverDay) {
  if (!DATE.test(today) || Math.abs(Date.parse(today) - Date.parse(serverDay)) > 864e5) return { ok: false, message: '컴퓨터 날짜를 확인해 주세요.' };
  if (s.attend.last && today <= s.attend.last) return { ok: false, message: '오늘은 이미 출석했어요.' };
  const day = s.attend.day % REWARDS.length + 1;
  const points = REWARDS[day - 1];
  s.attend = { day, last: today };
  s.points += points;
  return { ok: true, day, points };
}

// What the app renders: state + catalog + level progress.
export const view = (s, today, isAdmin = false) => ({ isAdmin, points: s.points, xp: s.xp, ...levelOf(s.xp), owned: s.owned, equip: s.equip,
  furniture: s.furniture, rooms: s.rooms, attend: s.attend, attendedToday: s.attend.last === today,
  items: ITEMS, packs: PACKS, earn: EARN, xpPerOrder: XP, rewards: REWARDS });
