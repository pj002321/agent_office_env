// 팀 설정: a room is either a plain space or an AI team = a Claude Code project subagent (.claude/agents/<id>.md).
// What's written here is what that agent actually works by; the lead is told to hand matching work to it.
import { ICON } from './icons.js';
import * as world from './world.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const READ = 'Read, Grep, Glob, WebFetch, WebSearch';
const TOOLS = { all: '', read: READ, edit: 'Read, Grep, Glob, Edit, Write, MultiEdit, TodoWrite, WebFetch, WebSearch' };
// starting points; 대표 edits them freely
const TEMPLATES = [
  { label: '기획', room: '기획팀', id: 'planner', tools: 'read', description: '요구사항을 정리하고 작업을 단계별 계획으로 나눈다',
    prompt: '코드를 고치지 말고 조사와 계획만 한다.\n- 관련 파일을 먼저 읽고 현재 구조를 파악한다\n- 할 일을 작은 단계로 나누고, 각 단계의 완료 기준을 적는다\n- 모르는 점과 위험한 점을 따로 적는다' },
  { label: '디자인', room: '디자인팀', id: 'designer', tools: 'edit', description: '화면 구성, 스타일, 문구를 다듬는다',
    prompt: '- 이미 있는 색, 글꼴, 간격 규칙을 먼저 찾아 그대로 따른다\n- 접근성(대비, 키보드, 라벨)을 지킨다\n- 바꾼 화면과 이유를 짧게 보고한다' },
  { label: '개발', room: '개발팀', id: 'developer', tools: 'all', description: '기능을 구현하고 버그를 고친다',
    prompt: '- 필요한 만큼만 고치고 관련 없는 코드는 건드리지 않는다\n- 고친 뒤 테스트나 실행으로 확인한다\n- 확인하지 못한 것은 못 했다고 보고한다' },
  { label: 'QA', room: 'QA팀', id: 'qa-tester', tools: 'all', description: '테스트를 돌리고 버그와 빠진 경우를 찾는다',
    prompt: '코드는 고치지 말고 문제를 찾아 보고만 한다.\n- 테스트를 실행하고 실패를 그대로 옮겨 적는다\n- 경계값, 빈 값, 오류 상황을 직접 시험한다\n- 재현 방법과 함께 보고한다' },
  { label: '리뷰', room: '리뷰팀', id: 'reviewer', tools: 'read', description: '바뀐 코드를 읽고 버그와 위험을 지적한다',
    prompt: '코드를 고치지 않는다.\n- 정확성 > 보안 > 단순함 순서로 본다\n- 지적마다 파일:줄과 고치는 방법을 적는다' },
];

let ctx = null;   // { fid, i, room, defs, taken }
const el = () => $('#team');

export async function openTeam(fid, i, room) {
  const defs = await office.teams(fid);
  const floor = (await office.floors()).find(f => f.id === fid);
  const taken = new Set((floor?.rooms?.agents || []).filter((a, k) => a && k !== i));   // other rooms' teams
  ctx = { fid, i, room, defs, taken };
  const cur = defs.find(d => d.name === room.agent);
  fill(cur ? { ...cur, room: room.name } : { room: room.name, id: '', description: '', prompt: '', tools: '' }, !!room.agent || !room.name);
  $('#team-err').textContent = '';
  $('#team-del').hidden = !cur; $('#team-del').dataset.sure = ''; $('#team-del').textContent = '이 팀 지우기';
  el().hidden = false;
  $('#team-name').focus();
}
const close = () => { el().hidden = true; ctx = null; };

function fill(a, ai) {
  $('#team-name').value = a.room || '';
  $('#team-ai').setAttribute('aria-checked', String(ai));
  $('#team-body').hidden = !ai;
  const pick = ctx.defs.filter(d => !ctx.taken.has(d.name));
  $('#team-pick').innerHTML = `<option value="">새 팀 만들기</option>` +
    pick.map(d => `<option value="${esc(d.name)}">불러오기 · ${esc(d.name)}</option>`).join('');
  $('#team-pick').value = pick.some(d => d.name === (a.name || a.id)) ? a.name || a.id : '';
  $('#team-id').value = a.name || a.id || '';
  $('#team-desc').value = a.description || '';
  $('#team-prompt').value = a.prompt || '';
  const t = typeof a.tools === 'string' && a.tools in TOOLS ? a.tools : Object.keys(TOOLS).find(k => TOOLS[k] === (a.tools || ''));
  $('#team-keep').hidden = !!t;
  $('#team-keep').dataset.tools = t ? '' : a.tools;
  $('#team-keep').querySelector('span').textContent = t ? '' : a.tools;
  for (const r of document.querySelectorAll('[name="team-tools"]')) r.checked = r.value === (t || 'keep');
}

function draft() {
  const v = document.querySelector('[name="team-tools"]:checked')?.value || 'all';
  return { name: $('#team-id').value.trim(), description: $('#team-desc').value, prompt: $('#team-prompt').value,
           tools: v === 'keep' ? $('#team-keep').dataset.tools : TOOLS[v] };
}

async function save() {
  const { fid, i, room } = ctx, name = $('#team-name').value.trim();
  const ai = $('#team-ai').getAttribute('aria-checked') === 'true';
  if (ai) {
    if (!name) return $('#team-err').textContent = '방 이름을 지어 주세요.';
    const a = draft();
    if (ctx.taken.has(a.name)) return $('#team-err').textContent = `'${a.name}' 팀은 다른 방이 쓰고 있어요.`;
    const old = room.agent || ($('#team-pick').value === a.name ? a.name : undefined);
    const r = await office.teamSave(fid, a, old);
    if (!r.ok) return $('#team-err').textContent = r.message;
    world.setRoom(fid, i, { name, agent: a.name });
  } else world.setRoom(fid, i, { name, agent: '' });
  close();
}

$('#team-close').innerHTML = ICON.x;
$('#team-close').onclick = close;
$('#team-cancel').onclick = close;
$('#team-save').onclick = save;
$('#team').onclick = e => { if (e.target === el()) close(); };
$('#team').onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') save(); };
$('#team-ai').onclick = () => {
  const on = $('#team-ai').getAttribute('aria-checked') !== 'true';
  $('#team-ai').setAttribute('aria-checked', String(on));
  $('#team-body').hidden = !on;
};
$('#team-pick').onchange = e => {
  const d = ctx.defs.find(x => x.name === e.target.value);
  fill(d ? { ...d, room: $('#team-name').value || d.name } : { room: $('#team-name').value, id: '', tools: '' }, true);
};
$('#team-tpl').innerHTML = TEMPLATES.map((t, k) => `<button type="button" class="chip" data-tpl="${k}">${esc(t.label)}</button>`).join('');
$('#team-tpl').onclick = e => {
  const t = TEMPLATES[e.target.closest('[data-tpl]')?.dataset.tpl];
  if (!t) return;
  const id = ctx.defs.some(d => d.name === t.id) && !ctx.taken.has(t.id) ? t.id : ctx.taken.has(t.id) ? `${t.id}-2` : t.id;
  fill({ room: $('#team-name').value || t.room, id, description: t.description, prompt: t.prompt, tools: t.tools }, true);
};
$('#team-del').onclick = async () => {   // two clicks: the file is the agent itself
  const b = $('#team-del');
  if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '정말 지울까요? 한 번 더 누르세요'; return; }
  await office.teamRemove(ctx.fid, ctx.room.agent);
  world.setRoom(ctx.fid, ctx.i, { name: $('#team-name').value.trim(), agent: '' });
  close();
};
