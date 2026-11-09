// 꾸미기 상점: spend points earned per order on the building tier and interior items. Data spec: app/shop.cjs.
import { ICON } from './icons.js';
import * as world from './world.js';
import { sfx } from './sound.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const P = n => `${(n || 0).toLocaleString('ko-KR')}P`;
let notify = () => {};
let wallet = null;
let tab = 'building';
let floors = [], fid = null;   // fid: the floor being decorated (wallpaper / floor / furniture are per floor)

export async function openDeco() {
  $('#deco').hidden = false;
  if (!wallet) setWallet(await office.wallet());
  floors = await office.floors();
  const cur = world.currentFloor();
  if (cur || !floors.some(f => f.id === fid)) fid = cur || floors[0]?.id || null;
  $('#deco-floor').innerHTML = floors.map((f, i) => `<option value="${esc(f.id)}">${i + 2}F · ${esc(f.name)}</option>`).join('');
  $('#deco-floor').value = fid || '';
  render();
  $('#deco-close').focus();
}
const closeDeco = () => { $('#deco').hidden = true; };

export function setWallet(w) {
  wallet = w;
  $('#points').textContent = P(w.points);
  world.setLook({ building: w.equip.building, base: { wall: w.equip.wall, floor: w.equip.floor, furniture: w.furniture }, rooms: w.rooms });
  if (!$('#deco').hidden) render();
}

export function bump(n = wallet?.earn || 10) {
  const c = $('#points');
  c.dataset.plus = `+${n}P`;
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');   // reflow restarts the animation
}

const INTERIOR = ['wall', 'floor', 'furniture'];
const room = () => wallet.rooms[fid] || { wall: wallet.equip.wall, floor: wallet.equip.floor, furniture: wallet.furniture };
const isOn = it => it.slot === 'building' ? wallet.equip.building === it.id
  : it.slot === 'furniture' ? room().furniture.includes(it.id) : room()[it.slot] === it.id;
function action(it) {
  if (!wallet.owned.includes(it.id)) {
    if (it.requires && !wallet.owned.includes(it.requires)) return `<button class="act busy" disabled>${esc(wallet.items.find(x => x.id === it.requires).name)} 먼저</button>`;
    const short = it.price - wallet.points;
    if (short > 0) return `<button class="act busy" disabled>${P(it.price)} · ${P(short)} 부족</button>`;
    return `<button class="act get" data-buy="${esc(it.id)}">${P(it.price)} 구매</button>`;
  }
  const furn = it.slot === 'furniture';
  if (isOn(it)) return furn
    ? `<button class="act owned" data-off="${esc(it.id)}"><span class="on">${ICON.check}배치됨</span><span class="off">빼기</span></button>`
    : `<button class="act worn" disabled>${ICON.check}장착 중</button>`;
  return `<button class="act wear" data-equip="${esc(it.id)}">${furn ? '배치' : '장착'}</button>`;
}
const card = it => `
  <article class="card">
    <span class="swatch" style="background:${esc(it.swatch)}"></span>
    <div class="body"><h3>${esc(it.name)}</h3><p class="desc">${esc(it.desc)}</p></div>
    <footer>${it.slot === 'building' && isOn(it) ? '<span class="now">지금 건물</span>'
      : wallet.owned.includes(it.id) ? '<span class="pop">가지고 있어요</span>' : '<span></span>'}${action(it)}</footer>
  </article>`;

function render() {
  for (const b of document.querySelectorAll('#deco .tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('#deco-points').textContent = P(wallet.points);
  $('#deco-earn').textContent = `팀장에게 일을 맡길 때마다 ${wallet.earn}P가 쌓여요. 모은 포인트로 건물과 사무실을 꾸며 보세요`;
  const grid = $('#deco-grid');
  grid.dataset.tab = tab;
  $('#deco-floor-pick').hidden = !INTERIOR.includes(tab) || !floors.length;
  if (INTERIOR.includes(tab) && !fid) {
    grid.innerHTML = '<p class="muted">꾸밀 층이 아직 없어요. 왼쪽 아래 "새 층 올리기"로 프로젝트 층을 먼저 만들어 주세요.</p>';
    return;
  }
  if (tab === 'packs') {
    grid.innerHTML = wallet.packs.map(p => `
      <article class="card">
        <span class="swatch coin">P</span>
        <div class="body"><h3>${P(p.points)}</h3><p class="desc">₩${p.won.toLocaleString('ko-KR')}</p></div>
        <footer><span></span><button class="act get" data-pack="${esc(p.id)}">${wallet.freeCharge ? '무료 충전 (테스트)' : `₩${p.won.toLocaleString('ko-KR')} 충전`}</button></footer>
      </article>`).join('');
    return;
  }
  const list = wallet.items.filter(i => i.slot === tab);
  grid.innerHTML = tab === 'building' ? list.map(card).join(`<span class="arrow">${ICON.go}</span>`) : list.map(card).join('');
}

async function act(call, it) {
  // rejects with "No handler registered" when main.cjs changed after launch — renderer reload doesn't reload main
  const r = await call.catch(() => ({ ok: false, message: '앱을 완전히 껐다가 다시 켜 주세요.' }));
  if (r.wallet) setWallet(r.wallet);
  if (!r.ok) return notify({ icon: 'key', tone: 'quest', title: `${it.name}: 할 수 없어요`, body: r.message || '알 수 없는 문제가 생겼어요.' });
  return r;
}
async function buy(it) {
  if (!(await act(office.shopBuy(it.id, fid), it))) return;
  sfx('buy');
  notify(it.slot === 'building'
    ? { icon: 'out', tone: 'done', title: `${it.name}(으)로 이사했어요!`, body: '건물 밖으로 나가서 새 건물을 구경해 보세요.' }
    : { icon: 'check', tone: 'done', title: `${it.name} ${it.slot === 'furniture' ? '배치' : '장착'}!`,
        body: `${$('#deco-floor').selectedOptions[0]?.textContent || '이 층'}에 적용했어요. 다른 층에서도 바로 쓸 수 있어요. 남은 포인트 ${P(wallet.points)}` });
}

$('#deco .tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } };
$('#deco-close').innerHTML = ICON.x;
$('#deco-close').onclick = closeDeco;
$('#open-deco').onclick = openDeco;
$('#deco').onclick = e => {
  const t = e.target;
  if (t === $('#deco')) return closeDeco();
  const item = (el, k) => wallet.items.find(i => i.id === el.dataset[k]);
  const b = t.closest('[data-buy]'); if (b) { b.disabled = true; return buy(item(b, 'buy')); }
  const on = t.closest('[data-equip]'); if (on) return act(office.shopEquip(on.dataset.equip, true, fid), item(on, 'equip'));
  const off = t.closest('[data-off]'); if (off) return act(office.shopEquip(off.dataset.off, false, fid), item(off, 'off'));
  const pack = t.closest('[data-pack]');
  if (pack) return act(office.shopCharge(pack.dataset.pack), { name: '포인트 충전' }).then(r => {
    if (!r) return;
    sfx('coin'); bump(r.points);
    notify({ icon: 'check', tone: 'done', title: `${P(r.points)} 충전!`, body: `테스트용 무료 충전이에요. 지금 ${P(wallet.points)}` });
  });
};
$('#deco-floor').onchange = e => { fid = e.target.value; render(); };
$('#deco').onkeydown = e => { if (e.key === 'Escape') closeDeco(); };

export const setNotify = fn => notify = fn;

office.wallet().then(setWallet);
