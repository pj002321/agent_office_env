// Agent Office promo site: OS-aware download buttons, scene tabs on the app window, elevator stops.
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const REL = 'https://github.com/pj002321/agent_office_env/releases/latest/download/';
const OS = {
  win: { name: 'Windows', file: 'AgentOffice-Setup.exe' },
  mac: { name: 'macOS', file: 'AgentOffice-mac.dmg' },
};

// ---------- which computer is this? ----------
function detectOS() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return null;   // phones: no desktop installer to hand out
  const p = (navigator.userAgentData?.platform || navigator.platform || ua).toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'win';
  return null;
}
const mine = detectOS();
const other = mine === 'mac' ? 'win' : 'mac';
for (const a of $$('[data-dl="primary"]')) {
  if (!mine) continue;
  a.href = REL + OS[mine].file;
  const label = a.querySelector('[data-dl-label]');
  if (label) label.textContent = `${OS[mine].name}용 무료 다운로드`;
}
for (const a of $$('[data-dl="other"]')) {
  if (mine) { a.href = REL + OS[other].file; a.textContent = `${OS[other].name}용`; }
  else a.textContent = 'Windows · macOS 고르기';
}
const note = document.querySelector('[data-dl-note]');
if (note && !mine) note.textContent = '컴퓨터(Windows · macOS)에서 쓰는 데스크톱 앱이에요 · 무료 · 오픈소스';
for (const card of $$('.os')) card.classList.toggle('is-mine', card.dataset.os === mine);

// ---------- scene tabs ----------
const CAPTION = {
  order: '층에 들어가 한 줄로 일을 맡기면, 팀장이 바로 답해요.',
  crew: '일이 커지면 직원이 출근해 각자 맡은 파일을 고쳐요.',
  approve: '고치기 전에는 직원이 대표 책상까지 와서 결재를 받아요.',
  deco: '모은 포인트로 꾸미고, 가구는 끌어서 옮겨요.',
  night: '밤이 되면 일하는 층에 불이 켜져요.',
};
const tabs = $$('.scenes [role="tab"]');
const shots = $$('.shot');
const caption = document.querySelector('[data-caption]');
function show(scene) {
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.scene === scene));
  for (const s of shots) s.classList.toggle('is-on', s.dataset.scene === scene);
  caption.textContent = CAPTION[scene];
}
// the tour plays itself until the visitor picks a scene, and holds still while hovered or off-screen
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let auto = !calm, hovering = false, visible = true;
const showcase = document.querySelector('.showcase');
showcase.addEventListener('pointerenter', () => hovering = true);
showcase.addEventListener('pointerleave', () => hovering = false);
new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(showcase);
setInterval(() => {
  if (!auto || hovering || !visible || document.hidden) return;
  const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
  show(tabs[(i + 1) % tabs.length].dataset.scene);
}, 5200);
for (const t of tabs) t.addEventListener('click', () => { auto = false; show(t.dataset.scene); });
document.querySelector('.scenes').addEventListener('keydown', e => {
  const i = tabs.indexOf(document.activeElement);
  if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus(); next.click();
});

// ---------- elevator: the car rides the shaft; each floor it reaches lights its stop ----------
const car = document.querySelector('.car');
const carFloor = document.querySelector('[data-car]');
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const f of $$('.floor')) f.classList.toggle('is-here', f === e.target);
    if (carFloor.textContent !== e.target.dataset.floor) {
      carFloor.textContent = e.target.dataset.floor;
      car.classList.remove('ding'); void car.offsetWidth; car.classList.add('ding');   // reflow restarts the bump
    }
  }
}, { rootMargin: '-45% 0px -45% 0px' });
for (const f of $$('.floor')) io.observe(f);
