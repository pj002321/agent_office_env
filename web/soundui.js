// 소리 설정 팝오버: BGM/효과음 스위치·볼륨, 트랙 고르기, 내 음악 추가/삭제. Engine: sound.js.
import { ICON } from './icons.js';
import * as sound from './sound.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const pop = $('#sound'), btn = $('#sound-btn');
let armedRm = null;

// headroom: route floors through the user's `headroom proxy`; checked again on every order
function renderHr(h) {
  $('#hr-on').setAttribute('aria-checked', String(h.on));
  $('#hr-state').textContent = !h.on ? '켜면 일을 맡길 때 Headroom 프록시를 거쳐요' :
    h.up ? `프록시 연결됨 · ${h.url}` : `프록시가 꺼져 있어요. 켜질 때까지 그냥 실행해요 (터미널에서 headroom proxy)`;
}
$('#hr-on').onclick = async () => renderHr(await office.setHeadroom($('#hr-on').getAttribute('aria-checked') !== 'true'));

export function openSound() {
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  render();
  office.headroom().then(renderHr);
  $('#bgm-on').focus();
}
function closeSound() {
  if (pop.hidden) return;
  pop.hidden = true;
  armedRm = null;
  btn.setAttribute('aria-expanded', 'false');
}

function setSlider(el, v) {
  if (document.activeElement !== el) el.value = Math.round(v * 100);   // don't fight the slider being dragged
  el.style.setProperty('--v', `${el.value}%`);
}

function render() {
  const s = sound.state;
  btn.dataset.on = s.bgm || s.sfx ? '1' : '0';
  btn.dataset.playing = s.playing ? '1' : '0';
  btn.innerHTML = s.bgm || s.sfx ? ICON.speaker : ICON.mute;
  if (pop.hidden) return;
  $('#bgm-on').setAttribute('aria-checked', String(!!s.bgm));
  $('#sfx-on').setAttribute('aria-checked', String(!!s.sfx));
  setSlider($('#bgm-vol'), s.vol);
  setSlider($('#sfx-vol'), s.sfxVol);
  const row = (id, name, user) => {
    const on = s.track === id;
    return `<li><button class="trk ${on ? 'on' : ''}" data-track="${esc(id)}" aria-pressed="${on}">${ICON.music}<span class="nm" title="${esc(name)}">${esc(name)}</span>${on && s.playing ? '<span class="playing">지금 재생 중</span>' : ''}</button>${
      user ? `<button class="del ${armedRm === id ? 'armed' : ''}" data-rm="${esc(id)}" aria-label="${esc(name)} 지우기">${armedRm === id ? '정말?' : ICON.trash}</button>` : ''}</li>`;
  };
  $('#tracks').innerHTML = row('builtin', '기본 힐링곡 · 오르골') + (s.tracks || []).map(t => row(t.id, t.name, true)).join('');
  const err = $('#sound-err');
  err.hidden = !s.error;
  err.textContent = s.error || '';
}

btn.onclick = () => (pop.hidden ? openSound() : closeSound());
$('#bgm-on').onclick = () => sound.setBgm(!sound.state.bgm);
$('#sfx-on').onclick = () => { const on = !sound.state.sfx; sound.setSfx(on); if (on) sound.sfx('click'); };
$('#bgm-vol').oninput = e => sound.setVolume(e.target.value / 100);
$('#sfx-vol').oninput = e => sound.setSfxVolume(e.target.value / 100);
$('#sfx-vol').onchange = () => sound.sfx('click');   // let the user hear the new level on release
$('#music-add').onclick = async e => {
  const b = e.currentTarget;
  b.disabled = true;
  try { sound.setTracks(await office.musicAdd()); } finally { b.disabled = false; }
};
$('#tracks').onclick = async e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    const id = rm.dataset.rm;
    if (armedRm !== id) { armedRm = id; return render(); }
    armedRm = null;
    return sound.setTracks(await office.musicRemove(id));
  }
  const t = e.target.closest('[data-track]');
  if (t) { armedRm = null; sound.setTrack(t.dataset.track); }
};
// pointerdown, not click: re-rendered rows are detached by click time and would look "outside"
document.addEventListener('pointerdown', e => { if (!pop.contains(e.target) && !btn.contains(e.target)) closeSound(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { closeSound(); btn.focus(); } });

sound.onChange(render);
render();
office.music().then(sound.setTracks);
