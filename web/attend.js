// 출석체크: 7-day points board, one claim per local day. Rules + state: app/shop.cjs attend(); main.cjs owns the date.
import { ICON } from './icons.js';
import { sfx } from './sound.js';
import { setWallet, bump } from './deco.js';

const $ = s => document.querySelector(s);
const P = n => `${(n || 0).toLocaleString('ko-KR')}P`;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let notify = () => {};
let w = null;

function render() {
  const { rewards, attend, attendedToday } = w;
  const from = attend.day % rewards.length;   // slots already claimed this cycle are hidden
  $('#attend-dot').hidden = attendedToday;
  $('#attend-sub').textContent = attendedToday ? '오늘은 출석 완료! 내일 또 와요' : '하루 한 번, 오늘의 출석 보상을 받아 가세요';
  $('#attend-grid').innerHTML = rewards.map((p, i) => i < from ? '' : `
    <li class="slot${i === rewards.length - 1 ? ' gift' : ''}${i === from ? (attendedToday ? ' next' : ' today') : ''}">
      <b>${i + 1}일차</b><span class="coin-pill">${P(p)}</span>
      ${i !== from ? '' : attendedToday ? '<em>내일 받아요</em>' : '<button class="act get" data-claim>받기</button>'}
    </li>`).join('');
}

function open() {
  $('#attend').hidden = false;
  render();
  $('#attend-close').focus();   // not the claim button: the launch popup steals focus, a stray Enter would claim
}
const close = () => { $('#attend').hidden = true; };

async function claim(btn) {
  btn.disabled = true;
  const r = await office.attend();
  w = r.wallet; setWallet(w);
  if (!r.ok) { render(); return notify({ icon: 'key', tone: 'quest', title: '출석체크', body: r.message }); }
  sfx('coin'); bump(r.points);
  notify({ icon: 'check', tone: 'done', title: `${r.day}일차 출석! +${P(r.points)}`,
    body: r.day === w.rewards.length ? '7일 개근 완주! 내일부터 새 출석판이 열려요.' : `지금 ${P(w.points)}` });
  btn.closest('.slot').classList.add('gone');   // shrink out, then drop it from the board
  setTimeout(() => { render(); $('#attend-close').focus(); }, calm.matches ? 0 : 300);
}

$('#attend-close').innerHTML = ICON.x;
$('#attend-close').onclick = close;
$('#open-attend').onclick = open;
$('#attend').onclick = e => {
  if (e.target === e.currentTarget) return close();
  const b = e.target.closest('[data-claim]'); if (b) claim(b);
};
$('#attend').onkeydown = e => { if (e.key === 'Escape') close(); };

export const setNotify = fn => notify = fn;

office.wallet().then(x => { w = x; render(); if (!w.attendedToday) open(); });   // daily popup on launch
