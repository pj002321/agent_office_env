// Cozy Office promo site: KO/EN switch, OS-aware download buttons, cinematic scene reel, elevator stops.
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const REL = 'https://github.com/pj002321/agent_office_env/releases/latest/download/';
const OS = {
  win: { name: 'Windows', file: 'AgentOffice-Setup.exe' },
  mac: { name: 'macOS', file: null },   // no mac build published yet
};

// ---------- language: Korean lives in the markup, English in data-en / data-en-<attr> next to it ----------
let lang = localStorage.getItem('lang') || (/^ko\b/i.test(navigator.language) ? 'ko' : 'en');
const t = (ko, en) => lang === 'en' ? en : ko;
const HEAD = {
  ko: ['Cozy Office · AI 직원들이 출근하는 작은 사무실', '내 컴퓨터의 Claude Code를 귀여운 3D 사무실로. 지시는 한 줄로, 결재는 대표님이. Windows 무료 다운로드, macOS는 준비 중.'],
  en: ['Cozy Office · A tiny office where AI staff clock in', 'Turn the Claude Code CLI on your computer into a cozy 3D office. One line to give an order, you approve every change. Free for Windows; macOS coming soon.'],
};
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of $$('[data-en]')) {
    el.dataset.ko ??= el.innerHTML;
    el.innerHTML = lang === 'en' ? el.dataset.en : el.dataset.ko;
  }
  for (const el of $$('*')) for (const { name, value } of [...el.attributes]) {
    if (!name.startsWith('data-en-')) continue;
    const attr = name.slice(8), keep = 'data-ko-' + attr;
    if (!el.hasAttribute(keep)) el.setAttribute(keep, el.getAttribute(attr) ?? '');
    el.setAttribute(attr, lang === 'en' ? value : el.getAttribute(keep));
  }
  [document.title] = HEAD[lang];
  document.querySelector('meta[name="description"]').content = HEAD[lang][1];
  const btn = document.querySelector('[data-lang-toggle]');
  btn.textContent = lang === 'en' ? '한국어' : 'EN';
  btn.setAttribute('aria-label', lang === 'en' ? '한국어로 보기' : 'Switch to English');
  applyDownloads();
  caption.textContent = CAPTION[current][lang];
}
document.querySelector('[data-lang-toggle]').addEventListener('click', () => {
  lang = lang === 'en' ? 'ko' : 'en';
  localStorage.setItem('lang', lang);
  applyLang();
});

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
function applyDownloads() {
  for (const a of $$('[data-dl="primary"]')) {
    if (!mine || !OS[mine].file) continue;
    a.href = REL + OS[mine].file;
    const label = a.querySelector('[data-dl-label]');
    if (label) label.textContent = t(`${OS[mine].name}용 무료 다운로드`, `Download for ${OS[mine].name}`);
  }
  for (const a of $$('[data-dl="other"]')) {
    if (mine && OS[other].file) { a.href = REL + OS[other].file; a.textContent = t(`${OS[other].name}용`, `For ${OS[other].name}`); }
    else if (mine) a.textContent = t(`${OS[other].name}는 준비 중`, `${OS[other].name} coming soon`);
    else a.textContent = t('Windows · macOS 고르기', 'Choose Windows or macOS');
  }
  const note = document.querySelector('[data-dl-note]');
  if (note && !mine) note.textContent = t('컴퓨터(Windows)에서 쓰는 데스크톱 앱이에요 · 무료 · 오픈소스', 'A desktop app for Windows computers · Free · Open source');
}
for (const card of $$('.os')) card.classList.toggle('is-mine', card.dataset.os === mine);

// ---------- scene reel: each clip plays once, then the next tab takes over ----------
const CAPTION = {
  order: { ko: '층에 들어가 한 줄로 일을 맡기면, 팀장이 바로 답해요.', en: 'Step onto a floor, type one line, and the team lead answers right away.' },
  crew: { ko: '일이 커지면 직원이 출근해 각자 맡은 파일을 고쳐요.', en: 'When the job grows, staff clock in and each takes a file.' },
  approve: { ko: '고치기 전에는 직원이 대표 책상까지 와서 결재를 받아요.', en: 'Before changing anything, staff walk over to your desk for approval.' },
  deco: { ko: '모은 포인트로 사무실을 바꾸고, 가구는 끌어서 옮겨요.', en: 'Spend earned points to restyle the office, and drag furniture around.' },
  night: { ko: '건물은 커지고, 밤이 되면 일하는 층에 불이 켜져요.', en: 'The building grows, and at night the working floors light up.' },
};
const tabs = $$('.scenes [role="tab"]');
const clips = $$('.shot');
const caption = document.querySelector('[data-caption]');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let current = 'order', auto = !calm, visible = true;
function play(clip) {
  if (calm || !visible) return;
  clip.play().catch(() => {});   // autoplay can still be refused (e.g. data saver): the poster stays up
}
function show(scene) {
  current = scene;
  for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.scene === scene));
  for (const c of clips) {
    const on = c.dataset.scene === scene;
    c.classList.toggle('is-on', on);
    if (on) { c.preload = 'auto'; c.currentTime = 0; c.loop = !auto; play(c); } else c.pause();
  }
  caption.textContent = CAPTION[scene][lang];
}
for (const c of clips) c.addEventListener('ended', () => {
  if (!auto) return;
  const i = tabs.findIndex(tab => tab.dataset.scene === current);
  show(tabs[(i + 1) % tabs.length].dataset.scene);
});
// the next clip starts buffering while this one plays, so the hand-off doesn't stall
clips[0].addEventListener('playing', () => clips.slice(1).forEach(c => c.preload = 'auto'), { once: true });
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  const c = clips.find(x => x.dataset.scene === current);
  visible ? play(c) : c.pause();
}).observe(document.querySelector('.showcase'));
for (const tab of tabs) tab.addEventListener('click', () => { auto = false; caption.ariaLive = 'polite'; show(tab.dataset.scene); });   // only announce scenes the visitor picked
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

applyLang();
