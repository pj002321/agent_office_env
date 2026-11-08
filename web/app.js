// UI around the building: elevator panel (floors), order bar, approvals, journal.
import * as world from './world.js';
import { ICON } from './icons.js';
import * as shop from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', ICON[el.dataset.icon]));
for (const [id, icon] of [['bag-close', 'x'], ['store-close', 'x'], ['store-refresh', 'refresh']]) document.getElementById(id).innerHTML = ICON[icon];

let floors = [];
const logs = [];
const asks = new Map();      // ask id → { floor, who, rank, text }

async function loadFloors(list) {
  floors = list || await office.floors();
  world.setFloors(floors);
  for (const f of floors) if (f.busy) world.handle({ floor: f.id, kind: 'busy' });
  await Promise.all(floors.filter(f => !pastLoaded.has(f.id)).map(f => loadPast(f.id)));
  renderPanel();
  renderOrder();
}

// ---------- elevator panel ----------
let armedDelete = null;
function renderPanel() {
  const cur = world.currentFloor();
  const btns = floors.map((f, i) => {
    const st = world.floorState(f.id) || {};
    const state = st.asks ? 'ask' : st.busy ? 'busy' : 'idle';
    return `<li><button class="floor-btn ${cur === f.id ? 'on' : ''}" data-id="${f.id}" title="${esc(f.path)}">
      <span class="num">${i + 2}F</span><span class="nm">${esc(f.name)}</span><span class="lamp" data-state="${state}"></span>
    </button><button class="del ${armedDelete === f.id ? 'armed' : ''}" data-del="${f.id}" aria-label="${esc(f.name)} 층 없애기">${armedDelete === f.id ? '정말?' : ICON.trash}</button></li>`;
  }).reverse().join('');
  $('#floor-list').innerHTML = btns + `<li><button class="floor-btn lobby ${cur ? '' : 'on'}" data-id=""><span class="num">1F</span><span class="nm">로비 · 건물 전체</span></button></li>`;
  $('#empty').hidden = floors.length > 0;
}
$('#floor-list').onclick = async e => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const id = del.dataset.del;
    if (armedDelete !== id) { armedDelete = id; renderPanel(); return; }
    armedDelete = null;
    if (world.currentFloor() === id) await world.enter(null);
    return loadFloors(await office.removeFloor(id));
  }
  const b = e.target.closest('.floor-btn');
  if (b) { armedDelete = null; world.enter(b.dataset.id || null); }
};
const addFloor = async () => {
  const before = new Set(floors.map(f => f.id));
  await loadFloors(await office.addFloor());
  const added = floors.find(f => !before.has(f.id));
  if (added) world.enter(added.id);
};
$('#add-floor').onclick = addFloor;
$('#open-bag').onclick = () => shop.openBag();
$('#open-store').onclick = () => shop.openStore();
$('#empty-add').onclick = addFloor;

world.onFloorChange(() => { $('#talks').hidden = true; renderPanel(); renderOrder(); renderLog(); renderAsks(); });

// ---------- OS clock ----------
const PART = h => h < 5 ? '한밤' : h < 7 ? '새벽' : h < 11 ? '아침' : h < 13 ? '점심' : h < 17.5 ? '오후' : h < 19.8 ? '저녁' : '밤';
let night = false;
world.onSkyChange(sky => { night = sky.night > 0.5; tickClock(sky.hour); });
function tickClock(hour) {
  const d = new Date();
  $('#clock-time').textContent = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  $('#clock-date').textContent = `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · ${PART(hour ?? d.getHours() + d.getMinutes() / 60)}`;
  const icon = night ? 'moon' : 'sun';
  if ($('#clock').dataset.icon !== icon) { $('#clock').dataset.icon = icon; $('#clock-icon').innerHTML = ICON[icon]; }
}
setInterval(() => tickClock(), 1000);

// ---------- order bar ----------
function renderOrder() {
  const id = world.currentFloor();
  const f = floors.find(x => x.id === id);
  const st = id && world.floorState(id);
  $('#order').dataset.mode = !f ? 'outside' : st.busy ? 'busy' : 'ready';
  $('#plaque').hidden = !f;
  $('#hint').hidden = !!f || !floors.length;
  if (!f) {
    $('#task').placeholder = '층을 골라 들어가면 팀장에게 일을 맡길 수 있어요';
    return;
  }
  $('#plaque-name').textContent = `${floors.indexOf(f) + 2}F · ${f.name}`;
  for (const b of document.querySelectorAll('#approve-mode button')) b.setAttribute('aria-pressed', String((b.dataset.auto === '1') === f.auto));
  $('#plaque-path').textContent = f.path;
  $('#to').textContent = `${st.lead} 팀장에게`;
  $('#task').placeholder = st.busy ? `${st.lead} 팀장이 일하는 중이에요. 끝나면 이어서 맡길 수 있어요` : '무엇을 맡길까요? 예: README에 설치 방법을 정리해줘  ·  /resume 지난 대화  ·  /new 새 대화';
}
// skills picked from the bag ride in front of the order as `/skill` (Claude runs them as slash commands)
let picked = [];
function renderPicked() {
  $('#picked').innerHTML = picked.map((s, i) => `<span class="pick">${ICON.spark}<code>${esc(s)}</code><button type="button" data-unpick="${i}" aria-label="${esc(s)} 빼기">${ICON.x}</button></span>`).join('');
  $('#picked').hidden = !picked.length;
}
$('#picked').onclick = e => { const b = e.target.closest('[data-unpick]'); if (b) { picked.splice(+b.dataset.unpick, 1); renderPicked(); } };
$('#use-skill').onclick = () => shop.openBag(inv => { if (!picked.includes(inv)) picked.push(inv); renderPicked(); $('#task').focus(); });
$('#order').onsubmit = e => {
  e.preventDefault();
  const id = world.currentFloor(), t = $('#task').value.trim();
  if (!id || (!t && !picked.length) || world.floorState(id).busy) return;
  // claude's own /resume and /clear only exist in its interactive mode, so the app handles them
  if (!picked.length && /^\/(resume|continue)$/i.test(t)) { $('#task').value = ''; return openTalks(); }
  if (!picked.length && /^\/(new|clear)$/i.test(t)) { $('#task').value = ''; return switchTalk(null); }
  // ponytail: one slash skill per order reaches Claude as a command; extra picks are named in the text
  const order = picked.length ? `${picked[0]} ${picked.length > 1 ? `(${picked.slice(1).join(', ')} 스킬도 활용해줘) ` : ''}${t}`.trim() : t;
  $('#task').value = '';
  picked = []; renderPicked();
  log({ floor: id, who: '나', rank: '대표', text: `지시: ${order}`, tone: 'order' });
  office.run(id, order);
};
$('#task').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#order').requestSubmit(); }
});
$('#stop').onclick = () => world.currentFloor() && office.stop(world.currentFloor());
$('#leave').onclick = () => world.enter(null);
$('#approve-mode').onclick = async e => {
  const b = e.target.closest('button[data-auto]'), id = world.currentFloor();
  if (!b || !id) return;
  const auto = b.dataset.auto === '1';
  floors = await office.setAuto(id, auto);
  renderOrder();
  const f = floors.find(x => x.id === id);
  log({ floor: id, who: '나', rank: '대표', text: auto ? '이 층은 이제 자동 승인이에요' : '이 층은 이제 직접 승인해요', tone: 'order' });
  if (auto) toast({ id: 'auto-' + id, icon: 'bolt', tone: 'info', title: `${f.name}: 자동 승인 켜짐`,
    body: '파일 수정과 명령 실행을 묻지 않고 허락해요. 믿을 수 있는 프로젝트에서만 켜 두세요.', ttl: 5000 });
};

// ---------- approvals ----------
function renderAsks() {
  const cur = world.currentFloor();
  $('#asks').innerHTML = [...asks].map(([id, a]) => {
    const fi = floors.findIndex(f => f.id === a.floor);
    return `<article class="ask" data-id="${id}">
      <header><span class="chip">${fi + 2}F ${esc(floors[fi]?.name)}</span><span><b>${esc(a.who)} ${esc(a.rank)}</b>의 승인 요청</span></header>
      <p>${ICON[a.icon] || ''}${esc(a.text)}</p>
      <footer><button class="yes" data-ok="1">승인</button><button class="no" data-ok="0">거절</button>
      ${cur === a.floor ? '' : `<button class="visit" data-visit="${a.floor}">가 보기 ${ICON.go}</button>`}</footer>
    </article>`;
  }).join('');
}
$('#asks').onclick = e => {
  const card = e.target.closest('.ask');
  if (!card) return;
  const a = asks.get(card.dataset.id);
  if (e.target.closest('[data-visit]')) return world.enter(a.floor);
  const b = e.target.closest('[data-ok]');
  if (b) office.answer(a.floor, card.dataset.id, b.dataset.ok === '1');
};

// ---------- journal ----------
function log(entry) {
  logs.push({ ...entry, at: new Date() });
  if (logs.length > 400) logs.shift();
  renderLog();
}
function renderLog() {
  const cur = world.currentFloor();
  const rows = logs.filter(l => !cur || l.floor === cur).slice(-80).reverse();
  $('#journal-title').textContent = cur ? '이 층의 일지' : '건물 전체 일지';
  $('#talks-btn').hidden = !cur;
  const today = new Date().toDateString();
  $('#journal ol').innerHTML = rows.length ? rows.map(l => {
    const fi = floors.findIndex(f => f.id === l.floor);
    return `<li data-tone="${l.tone}"><time>${l.at.toDateString() === today ? l.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : `${l.at.getMonth() + 1}/${l.at.getDate()}`}</time>
      <span class="who">${cur ? '' : `<span class="chip">${fi + 2}F</span>`}${esc(l.who)}</span><span class="txt">${ICON[l.icon] || ''}${esc(l.text)}</span></li>`;
  }).join('') : `<li class="none">${cur ? '아직 조용해요. 아래에서 팀장에게 일을 맡겨 보세요.' : '층에 들어가 일을 맡기면 여기에 기록돼요.'}</li>`;
}

// ---------- past conversations (from claude's own transcripts) ----------
const pastLoaded = new Set();
async function loadPast(id) {
  pastLoaded.add(id);
  const lead = world.floorState(id)?.lead || '팀장';
  for (const m of await office.history(id)) logs.push({ floor: id, at: new Date(m.at), tone: m.me ? 'order' : 'past',
    who: m.me ? '나' : lead, rank: m.me ? '대표' : '팀장', text: (m.me ? '지시: ' : '') + (m.text.length > 300 ? m.text.slice(0, 300) + '…' : m.text) });
  logs.sort((a, b) => a.at - b.at);
}
async function openTalks() {
  const id = world.currentFloor();
  if (!id) return;
  const list = await office.sessions(id);
  const day = s => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  $('#talks').innerHTML = `<li><button data-session="">${ICON.plus}<b>새 대화 시작</b></button></li>` + list.map(s =>
    `<li><button data-session="${s.id}" class="${s.current ? 'on' : ''}"><b>${esc(s.title)}</b><small>${day(s.at)} · 메시지 ${s.count}${s.current ? ' · 지금 이어가는 중' : ''}</small></button></li>`).join('');
  $('#talks').hidden = false;
}
async function switchTalk(session) {
  const id = world.currentFloor();
  if (!id || !await office.setSession(id, session)) return;
  $('#talks').hidden = true;
  for (let i = logs.length; i--;) if (logs[i].floor === id) logs.splice(i, 1);
  if (session) await loadPast(id);
  log({ floor: id, who: '나', rank: '대표', text: session ? '지난 대화를 이어서 해요' : '새 대화를 시작해요. 팀장이 이전 내용은 기억하지 않아요', tone: 'order' });
}
$('#talks-btn').onclick = () => $('#talks').hidden ? openTalks() : ($('#talks').hidden = true);
$('#talks').onclick = e => { const b = e.target.closest('[data-session]'); if (b) switchTalk(b.dataset.session || null); };

// ---------- events ----------
office.on(e => {
  const line = world.handle(e);
  if (line) log({ floor: e.floor, who: line.who.name, rank: line.who.rank, text: line.text, tone: line.tone, icon: line.icon });
  if (e.kind === 'ask' && line) asks.set(e.id, { floor: e.floor, who: line.who.name, rank: line.who.rank, text: e.text, icon: e.icon });
  if (e.kind === 'answer') asks.delete(e.id);
  if (['ask', 'answer'].includes(e.kind)) renderAsks();
  if (['busy', 'exit', 'ask', 'answer'].includes(e.kind)) { renderPanel(); renderOrder(); }
  if (e.kind === 'auth') loginQuest(e.cli, 'login');
});

await world.ready();
await loadFloors();
renderLog();
tickClock();
office.authCheck().then(st => { for (const [cli, s] of Object.entries(st)) if (s !== 'ok') loginQuest(cli, s); });

// ---------- toasts: login "quests" and notices ----------
const NAME = { claude: 'Claude', codex: 'Codex' };
function toast({ id, icon, tone = 'quest', title, body, actions = [], ttl = 0 }) {
  let el = document.getElementById('toast-' + id);
  if (!el) {
    el = document.createElement('section');
    el.id = 'toast-' + id;
    el.setAttribute('role', 'status');
    $('#toasts').append(el);
  }
  el.className = `toast ${tone}`;
  el.innerHTML = `<span class="badge">${ICON[icon] || ''}</span><div><h3></h3><p></p><footer></footer></div>`;
  el.querySelector('h3').textContent = title;
  el.querySelector('p').textContent = body;
  for (const [label, cls, fn] of actions) {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label; b.onclick = fn;
    el.querySelector('footer').append(b);
  }
  clearTimeout(el.ttl);
  if (ttl) el.ttl = setTimeout(() => closeToast(id), ttl);
}
shop.setNotify(t => toast({ id: 'store-' + Date.now(), ttl: 5000, ...t }));
function closeToast(id) {
  const el = document.getElementById('toast-' + id);
  if (!el) return;
  el.classList.add('bye');
  setTimeout(() => el.remove(), 260);
}

const quests = new Map();   // cli → polling timer
function loginQuest(cli, state) {
  const name = NAME[cli] || cli;
  if (state === 'missing') return toast({ id: cli, icon: 'key', tone: 'quest', title: `${name}가 아직 입사 전이에요`,
    body: `이 컴퓨터에서 ${cli} 명령을 찾지 못했어요. ${name} CLI를 설치하면 ${name} 직원이 출근할 수 있어요.`,
    actions: [['알겠어요', 'no', () => closeToast(cli)]] });
  toast({ id: cli, icon: 'key', title: `${name} 권한 받아와!`,
    body: `${name} 직원이 출근하려면 출입증이 필요해요. 터미널에서 ${name}에 로그인하면 바로 받아올게요.`,
    actions: [['출입증 받으러 가기', 'yes', () => startQuest(cli)], ['나중에', 'no', () => closeToast(cli)]] });
}
async function startQuest(cli) {
  const name = NAME[cli] || cli;
  const cmd = await office.authLogin(cli);
  toast({ id: cli, icon: 'key', tone: 'quest waiting', title: `${name} 출입증 받는 중…`,
    body: `새로 열린 터미널 창에서 로그인을 마쳐 주세요. 끝나면 알아서 확인할게요. (명령: ${cmd})`,
    actions: [['그만두기', 'no', () => { clearInterval(quests.get(cli)); closeToast(cli); }]] });
  clearInterval(quests.get(cli));
  const started = Date.now();
  quests.set(cli, setInterval(async () => {
    const st = (await office.authCheck([cli]))[cli];
    if (st === 'ok') {
      clearInterval(quests.get(cli));
      toast({ id: cli, icon: 'check', tone: 'done', title: `${name} 출입증 획득!`, body: `이제 ${name} 직원이 출근할 수 있어요.`, ttl: 5000 });
    } else if (Date.now() - started > 5 * 60 * 1000) {
      clearInterval(quests.get(cli));
      loginQuest(cli, st);
    }
  }, 4000));
}
