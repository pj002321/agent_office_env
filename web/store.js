// 스킬 가방 (installed skills) and 스킬 상점 (plugin store for Claude & Codex).
import { ICON } from './icons.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const CLI = { claude: 'Claude', codex: 'Codex' };
const SOURCE = { user: '내 스킬', project: '이 프로젝트', plugin: '플러그인', system: '기본 제공' };
let notify = () => {};
let onPick = null;            // set while the bag is opened from the order bar
let skillsCache = null;

// ---------- 스킬 가방 ----------
const bag = { cli: 'claude', q: '' };
export async function openBag(pick) {
  onPick = pick || null;
  if (pick) bag.cli = 'claude';   // only Claude staff run skills today
  $('#bag').hidden = false;
  $('#bag').dataset.pick = pick ? '1' : '';
  $('#bag-title').textContent = pick ? '불러올 스킬 고르기' : '스킬 가방';
  if (!skillsCache) { renderBag(true); skillsCache = await office.skills(); }
  renderBag();
  $('#bag-q').focus();
}
export const closeBag = () => { $('#bag').hidden = true; onPick = null; };
export const refreshSkills = async () => { skillsCache = await office.skills(); if (!$('#bag').hidden) renderBag(); };

function renderBag(loading) {
  for (const b of document.querySelectorAll('#bag .tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.cli === bag.cli));
    b.querySelector('.n').textContent = skillsCache ? skillsCache.filter(s => s.cli === b.dataset.cli).length : '';
  }
  const list = $('#bag-list');
  if (loading) { list.innerHTML = `<p class="muted">가방을 여는 중…</p>`; return; }
  const q = bag.q.toLowerCase();
  const items = skillsCache.filter(s => s.cli === bag.cli && (!q || `${s.name} ${s.description} ${s.plugin || ''}`.toLowerCase().includes(q)));
  const groups = new Map();
  for (const s of items) {
    const key = s.source === 'plugin' ? `플러그인 · ${s.plugin.split('@')[0]}` : SOURCE[s.source];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const canUse = bag.cli === 'claude';
  list.innerHTML = groups.size ? [...groups].map(([g, arr]) => `
    <details class="group" open><summary><span>${esc(g)}</span><span class="n">${arr.length}</span></summary>
      ${arr.map(s => `<details class="skill"><summary><code>${esc(s.invoke)}</code><span class="d">${esc(s.description)}</span></summary>
        <div class="more"><p>${esc(s.description) || '설명이 없어요.'}</p><p class="path">${esc(s.file)}</p>
        ${onPick ? (canUse ? `<button class="yes" data-invoke="${esc(s.invoke)}">${ICON.plus}불러오기</button>` : `<p class="muted">Codex 직원이 출근하면 쓸 수 있어요.</p>`) : ''}</div>
      </details>`).join('')}
    </details>`).join('') : `<p class="muted">${q ? '찾는 스킬이 가방에 없어요. 상점에서 찾아볼까요?' : `${CLI[bag.cli]} 스킬이 아직 없어요.`}</p>`;
}
$('#bag .tabs').onclick = e => { const b = e.target.closest('[data-cli]'); if (b) { bag.cli = b.dataset.cli; renderBag(); } };
$('#bag-q').oninput = e => { bag.q = e.target.value; renderBag(); };
$('#bag-close').onclick = closeBag;
$('#bag-shop').onclick = () => { closeBag(); openStore(bag.cli); };
$('#bag-list').onclick = e => {
  const b = e.target.closest('[data-invoke]');
  if (b && onPick) { onPick(b.dataset.invoke); closeBag(); }
};

// ---------- 스킬 상점 ----------
const store = { cli: 'claude', q: '', cat: '', sort: 'pop', shown: 48, data: null, sel: null, busy: new Map(), armed: null, confirm: null };
export async function openStore(cli) {
  if (cli) store.cli = cli;
  $('#store').hidden = false;
  if (!store.data) { renderStore(true); store.data = await office.store(); }
  renderStore();
  $('#store-q').focus();
}
const closeStore = () => { $('#store').hidden = true; };
const fmt = n => n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : n.toLocaleString('ko-KR');
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function items() {
  const q = store.q.toLowerCase();
  const all = store.data[store.cli];
  return all.filter(p => (!store.cat || p.category === store.cat)
    && (!q || `${p.name} ${p.slug} ${p.description} ${p.author} ${p.category}`.toLowerCase().includes(q)))
    .sort(store.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.installs - a.installs) || a.name.localeCompare(b.name));
}
function logo(p, big) {
  if (p.logo) return `<span class="logo${big ? ' big' : ''}" style="--c:${esc(p.color || '#fff')}"><img src="${esc(p.logo)}" alt=""></span>`;
  return `<span class="logo gen${big ? ' big' : ''}" style="--h:${hue(p.slug)}">${esc((p.name[0] || '?').toUpperCase())}</span>`;
}
function action(p) {
  const busy = store.busy.get(p.id);
  if (busy) return `<button class="act busy" disabled>${busy}</button>`;
  if (p.installed) return store.armed === p.id
    ? `<button class="act remove armed" data-remove="${esc(p.id)}">정말 뺄까요?</button>`
    : `<button class="act owned" data-remove="${esc(p.id)}"><span class="on">${ICON.check}가방에 있어요</span><span class="off">빼기</span></button>`;
  return `<button class="act get" data-install="${esc(p.id)}">${ICON.plus}담기</button>`;
}
function renderStore(loading) {
  const grid = $('#store-grid');
  for (const b of document.querySelectorAll('#store .tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.cli === store.cli));
    b.querySelector('.n').textContent = store.data ? fmt(store.data[b.dataset.cli].length) : '';
  }
  if (loading) { grid.innerHTML = `<p class="muted">상점 문을 여는 중… (CLI에서 목록을 받아와요)</p>`; $('#store-cats').innerHTML = ''; return; }
  const err = store.data.errors[store.cli];
  const cats = [...new Set(store.data[store.cli].map(p => p.category).filter(Boolean))].sort();
  $('#store-cats').innerHTML = [`<button data-cat="" aria-pressed="${!store.cat}">전체</button>`,
    ...cats.map(c => `<button data-cat="${esc(c)}" aria-pressed="${store.cat === c}">${esc(c)}</button>`)].join('');
  const list = items();
  $('#store-count').textContent = `${fmt(list.length)}개`;
  grid.innerHTML = (err ? `<p class="muted">${CLI[store.cli]} 목록을 가져오지 못했어요: ${esc(err)}</p>` : '') +
    (list.length ? list.slice(0, store.shown).map(p => `
    <article class="card${store.sel === p.id ? ' sel' : ''}" data-id="${esc(p.id)}" tabindex="0">
      ${logo(p)}
      <div class="body"><h3>${esc(p.name)}</h3>
        <p class="by">${esc(p.author || p.market)}${p.category ? ` · ${esc(p.category)}` : ''}</p>
        <p class="desc">${esc(p.description)}</p></div>
      <footer>${p.installs ? `<span class="pop">${ICON.bolt}${fmt(p.installs)}</span>` : p.needsAuth ? '<span class="pop">계정 연결 필요</span>' : '<span></span>'}${action(p)}</footer>
    </article>`).join('') + (list.length > store.shown ? `<button id="more">${fmt(list.length - store.shown)}개 더 보기</button>` : '')
    : `<p class="muted">찾는 스킬이 없어요.</p>`);
  renderDetail();
}
function renderDetail() {
  const p = store.sel && store.data[store.cli].find(x => x.id === store.sel);
  $('#store').dataset.detail = p ? '1' : '';
  if (!p) return;
  const c = store.confirm?.id === p.id ? store.confirm : null;
  $('#store-detail').innerHTML = `
    <button class="x" id="detail-close" aria-label="닫기">${ICON.go}</button>
    ${logo(p, true)}
    <h2>${esc(p.name)}</h2>
    <p class="by">${esc(p.author || p.market)} · ${esc(p.market)}${p.version ? ` · v${esc(p.version)}` : ''}</p>
    ${action(p)}
    ${c ? `<div class="confirm"><b>설치 명령을 확인해 주세요</b><p>이 플러그인은 아래 명령을 실행해서 설치돼요. 믿을 수 있을 때만 승인하세요.</p><pre>${esc(c.command)}</pre>
      <footer><button class="yes" data-accept="${esc(p.id)}">승인하고 담기</button><button class="no" data-cancel="1">그만두기</button></footer></div>` : ''}
    <p class="long">${esc(p.long || p.description)}</p>
    ${p.prompts?.length ? `<h4>이렇게 써 보세요</h4><ul>${p.prompts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <dl>${p.installs ? `<dt>설치</dt><dd>${p.installs.toLocaleString('ko-KR')}회</dd>` : ''}${p.category ? `<dt>분류</dt><dd>${esc(p.category)}</dd>` : ''}
      ${p.needsAuth ? '<dt>계정</dt><dd>설치할 때 서비스 계정 연결이 필요해요</dd>' : ''}<dt>ID</dt><dd><code>${esc(p.id)}</code></dd></dl>
    ${/^https:\/\//.test(p.homepage) ? `<button class="link" data-url="${esc(p.homepage)}">${ICON.web}홈페이지 열기</button>` : ''}`;
}

async function doInstall(id, sha) {
  const p = store.data[store.cli].find(x => x.id === id);
  store.busy.set(id, '담는 중…'); store.confirm = null; renderStore();
  const r = await office.storeInstall(p.cli, id, sha);
  store.busy.delete(id);
  if (r.confirm) { store.confirm = { id, ...r.confirm }; store.sel = id; }
  else if (r.ok) { p.installed = true; p.installedId = id; notify({ icon: 'check', tone: 'done', title: `${p.name} 획득!`, body: `${CLI[p.cli]} 스킬 가방에 담았어요. 다음 지시부터 쓸 수 있어요.` }); refreshSkills(); }
  else notify({ icon: 'key', tone: 'quest', title: `${p.name}을(를) 담지 못했어요`, body: r.message || '알 수 없는 문제가 생겼어요.' });
  renderStore();
}
async function doRemove(id) {
  const p = store.data[store.cli].find(x => x.id === id);
  store.armed = null; store.busy.set(id, '빼는 중…'); renderStore();
  const r = await office.storeRemove(p.cli, p.installedId || id);
  store.busy.delete(id);
  if (r.ok) { p.installed = false; p.installedId = null; refreshSkills(); notify({ icon: 'trash', tone: 'info', title: `${p.name}을(를) 가방에서 뺐어요`, body: '언제든 상점에서 다시 담을 수 있어요.' }); }
  else notify({ icon: 'key', tone: 'quest', title: '빼지 못했어요', body: r.message || '' });
  renderStore();
}

$('#store .tabs').onclick = e => { const b = e.target.closest('[data-cli]'); if (b) { store.cli = b.dataset.cli; store.cat = ''; store.sel = null; store.shown = 48; renderStore(); } };
$('#store-q').oninput = e => { store.q = e.target.value; store.shown = 48; renderStore(); };
$('#store-sort').onchange = e => { store.sort = e.target.value; renderStore(); };
$('#store-cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { store.cat = b.dataset.cat; store.shown = 48; renderStore(); } };
$('#store-close').onclick = closeStore;
$('#store-refresh').onclick = async () => { store.data = null; renderStore(true); store.data = await office.store(); renderStore(); };
$('#store').onclick = e => {
  const t = e.target;
  if (t === $('#store')) return closeStore();
  if (t.closest('#more')) { store.shown += 48; return renderStore(); }
  if (t.closest('#detail-close')) { store.sel = null; return renderStore(); }
  const url = t.closest('[data-url]'); if (url) return office.openUrl(url.dataset.url);
  const ins = t.closest('[data-install]'); if (ins) return doInstall(ins.dataset.install);
  const acc = t.closest('[data-accept]'); if (acc) return doInstall(acc.dataset.accept, store.confirm.sha);
  if (t.closest('[data-cancel]')) { store.confirm = null; return renderStore(); }
  const rem = t.closest('[data-remove]');
  if (rem) { if (store.armed === rem.dataset.remove) return doRemove(rem.dataset.remove); store.armed = rem.dataset.remove; return renderStore(); }
  const card = t.closest('.card'); if (card) { store.sel = card.dataset.id; store.armed = null; renderStore(); }
};
$('#store').onkeydown = e => {
  if (e.key === 'Escape') closeStore();
  if (e.key === 'Enter' && e.target.classList.contains('card')) { store.sel = e.target.dataset.id; renderStore(); }
};
$('#bag').onkeydown = e => { if (e.key === 'Escape') closeBag(); };

export const setNotify = fn => notify = fn;
