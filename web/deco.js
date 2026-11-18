// 꾸미기 상점: spend points earned per order on the building tier and interior items. Rules: supabase/functions/_shared/shop.js (runs on the server).
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
  $('#acct-email').textContent = w.account.user?.email || '내 계정';
  $('#admin').hidden = !w.isAdmin;
  if (w.isAdmin && document.activeElement !== $('#admin-level')) $('#admin-level').value = w.level;
  $('#points').textContent = P(w.points);
  $('#level-num').textContent = `Lv.${w.level}`;
  $('#level-xp').textContent = `${w.into} / ${w.next} XP`;
  $('#level-fill').style.width = `${Math.round(w.into / w.next * 100)}%`;
  const { building, ...styles } = w.equip;
  world.setLook({ building, base: { ...styles, furniture: w.furniture }, rooms: w.rooms });
  world.setLevel(w.level);
  if (!$('#deco').hidden) render();
}

export function bump(n = wallet?.earn || 10) {
  const c = $('#points');
  c.dataset.plus = `+${n}P`;
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');   // reflow restarts the animation
}

const INTERIOR = ['wall', 'floor', 'desk', 'sofa', 'pc', 'furniture'];
const room = () => { const { building, ...styles } = wallet.equip; return { ...styles, furniture: wallet.furniture, hidden: [], ...wallet.rooms[fid] }; };
const isOn = it => it.slot === 'building' ? wallet.equip.building === it.id
  : it.builtin ? !room().hidden.includes(it.id) : it.slot === 'furniture' ? room().furniture.includes(it.id) : room()[it.slot] === it.id;
function action(it) {
  if (!wallet.owned.includes(it.id)) {
    if (wallet.level < it.level) return `<button class="act busy" disabled>Lv.${it.level} 필요</button>`;
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
const card = it => {
  const locked = !wallet.owned.includes(it.id) && wallet.level < it.level;
  const pic = world.thumb(it);
  return `
  <article class="card${locked ? ' locked' : ''}">
    <span class="swatch shot${it.slot === "wall" || it.slot === "floor" ? " tile" : ""}" ${pic ? `style="background-image:url(${pic})"` : ''}>${locked ? `<b class="lock">${ICON.key || ''}Lv.${it.level}</b>` : ''}</span>
    <div class="body"><h3>${esc(it.name)}</h3><p class="desc">${esc(it.desc)}</p></div>
    <footer>${it.slot === 'building' && isOn(it) ? '<span class="now">지금 건물</span>'
      : wallet.owned.includes(it.id) ? '<span class="pop">가지고 있어요</span>' : '<span></span>'}${action(it)}</footer>
  </article>`;
};

function render() {
  for (const b of document.querySelectorAll('#deco .tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('#deco-points').textContent = P(wallet.points);
  $('#deco-earn').textContent = `Lv.${wallet.level} · 다음 레벨까지 ${wallet.next - wallet.into}XP. 일을 맡길 때마다 ${wallet.xpPerOrder}XP와 ${wallet.earn}P가 쌓여요`;
  const grid = $('#deco-grid');
  grid.dataset.tab = tab;
  $('#deco-floor-pick').hidden = !INTERIOR.includes(tab) || !floors.length;
  if (INTERIOR.includes(tab) && !fid) {
    grid.innerHTML = '<p class="muted">꾸밀 층이 아직 없어요. 왼쪽 아래 "새 층 올리기"로 프로젝트 층을 먼저 만들어 주세요.</p>';
    return;
  }
  if (tab === 'packs') {
    const { ready, user } = wallet.account;
    const who = !user ? '' : `<p class="muted" style="grid-column:1/-1">${esc(user.email || 'GitHub 계정')}으로 로그인했어요. 결제가 끝나고 앱으로 돌아오면 포인트가 들어와요. <button class="act wear" data-logout>로그아웃</button></p>`;
    grid.innerHTML = who + wallet.packs.map(p => `
      <article class="card">
        <span class="swatch coin">P</span>
        <div class="body"><h3>${P(p.points)}</h3><p class="desc">$${p.usd}</p></div>
        <footer><span></span>${ready
          ? `<button class="act get" data-pack="${esc(p.id)}">$${p.usd} 결제</button>`
          : '<button class="act get" disabled>준비 중</button>'}</footer>
      </article>`).join('');
    return;
  }
  const list = wallet.items.filter(i => i.slot === tab);
  grid.innerHTML = list.map(card).join('');
}

async function act(call, it) {
  // rejects with "No handler registered" when main.cjs changed after launch — renderer reload doesn't reload main
  const r = await call.catch(() => ({ ok: false, message: '앱을 완전히 껐다가 다시 켜 주세요.' }));
  if (r.wallet) setWallet(r.wallet);
  if (!r.ok) { notify({ icon: 'key', tone: 'quest', title: `${it.name}: 할 수 없어요`, body: r.message || '알 수 없는 문제가 생겼어요.' }); return; }
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
  if (t.closest('[data-logout]')) return office.logout().then(() => location.reload());
  const pack = t.closest('[data-pack]');
  if (pack) return (async () => {
    if (!wallet.account.user && !(await act(office.login(), { name: '로그인' }))) return;
    if (await act(office.checkout(pack.dataset.pack), { name: '포인트 충전' }))
      notify({ icon: 'check', tone: 'quest', title: '브라우저에서 결제해 주세요', body: '결제가 끝나고 앱으로 돌아오면 포인트가 들어와요.' });
  })();
};
$('#deco-floor').onchange = e => { fid = e.target.value; render(); };
$('#deco').onkeydown = e => { if (e.key === 'Escape') closeDeco(); };

export const setNotify = fn => notify = fn;
// 관리자: only shown when the server says this account is an admin; the server checks again on every call
$('#admin').onclick = async e => {
  const b = e.target.closest('[data-admin]');
  if (!b) return;
  const kind = b.dataset.admin;
  if (kind === 'reset' && !confirmReset) { confirmReset = true; b.textContent = '정말 초기화?'; return; }
  confirmReset = false; $('[data-admin="reset"]').textContent = '내 지갑 초기화';
  const r = await act(office.admin(kind, kind === 'level' ? Number($('#admin-level').value) : Number(b.dataset.n || 0)), { name: '관리자' });
  if (r) notify({ icon: 'check', tone: 'done', title: '관리자', body: `적용했어요 · Lv.${wallet.level} · ${P(wallet.points)}` });
};
let confirmReset = false;
$('#admin-stats-btn').onclick = async () => {
  const r = await office.adminStats();
  if (!r.ok) return $('#admin-out').textContent = r.message;
  const s = r.stats;
  $('#admin-out').textContent = [`가입자 ${s.users ?? '?'}명 · 지갑 ${s.wallets}개`, `최고 Lv.${s.topLevel} · 평균 Lv.${s.avgLevel}`,
    `결제 ${s.orders}건 · 환불 ${s.refunds}건`, ...s.revenue.map(x => `매출 ${(x.total / (x.currency === 'KRW' ? 1 : 100)).toLocaleString()} ${x.currency}`),
    ...s.recent.map(p => `· ${p.created_at.slice(0, 10)} ${p.total} ${p.currency} ${p.status}`)].join('\n');
};
$('#acct-out').onclick = () => office.logout().then(() => location.reload());   // reload → the sign-in paper

// paid orders land on the server via webhook; pick them up whenever the user comes back to the app
async function claim() {
  if (!wallet?.account.user) return;
  const r = await office.claim().catch(() => null);
  if (r?.wallet) setWallet(r.wallet);
  if (!r?.ok) return;
  sfx('coin'); bump(r.points);
  notify({ icon: 'check', tone: 'done', title: `${P(r.points)} 충전!`, body: `결제해 주셔서 고마워요. 지금 ${P(wallet.points)}` });
}
addEventListener('focus', claim);

office.wallet().then(setWallet).then(claim);
