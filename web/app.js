// UI around the building: elevator panel (floors), order bar, approvals, journal.
import * as world from './world.js';
import { ICON } from './icons.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', ICON[el.dataset.icon]));

let floors = [];
const logs = [];
const asks = new Map();      // ask id → { floor, who, rank, text }

async function loadFloors(list) {
  floors = list || await office.floors();
  world.setFloors(floors);
  for (const f of floors) if (f.busy) world.handle({ floor: f.id, kind: 'busy' });
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
$('#empty-add').onclick = addFloor;

world.onFloorChange(() => { renderPanel(); renderOrder(); renderLog(); renderAsks(); });

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
  $('#plaque-path').textContent = f.path;
  $('#to').textContent = `${st.lead} 팀장에게`;
  $('#task').placeholder = st.busy ? `${st.lead} 팀장이 일하는 중이에요. 끝나면 이어서 맡길 수 있어요` : '무엇을 맡길까요? 예: README에 설치 방법을 정리해줘';
}
$('#order').onsubmit = e => {
  e.preventDefault();
  const id = world.currentFloor(), t = $('#task').value.trim();
  if (!id || !t || world.floorState(id).busy) return;
  $('#task').value = '';
  log({ floor: id, who: '나', rank: '대표', text: `지시: ${t}`, tone: 'order' });
  office.run(id, t);
};
$('#task').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#order').requestSubmit(); }
});
$('#stop').onclick = () => world.currentFloor() && office.stop(world.currentFloor());
$('#leave').onclick = () => world.enter(null);

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
  $('#journal ol').innerHTML = rows.length ? rows.map(l => {
    const fi = floors.findIndex(f => f.id === l.floor);
    return `<li data-tone="${l.tone}"><time>${l.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
      <span class="who">${cur ? '' : `<span class="chip">${fi + 2}F</span>`}${esc(l.who)}</span><span class="txt">${ICON[l.icon] || ''}${esc(l.text)}</span></li>`;
  }).join('') : `<li class="none">${cur ? '아직 조용해요. 아래에서 팀장에게 일을 맡겨 보세요.' : '층에 들어가 일을 맡기면 여기에 기록돼요.'}</li>`;
}

// ---------- events ----------
office.on(e => {
  const line = world.handle(e);
  if (line) log({ floor: e.floor, who: line.who.name, rank: line.who.rank, text: line.text, tone: line.tone, icon: line.icon });
  if (e.kind === 'ask' && line) asks.set(e.id, { floor: e.floor, who: line.who.name, rank: line.who.rank, text: e.text, icon: e.icon });
  if (e.kind === 'answer') asks.delete(e.id);
  if (['ask', 'answer'].includes(e.kind)) renderAsks();
  if (['busy', 'exit', 'ask', 'answer'].includes(e.kind)) { renderPanel(); renderOrder(); }
});

await world.ready();
await loadFloors();
renderLog();
