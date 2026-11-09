// Permission papers: anything 대표 must agree to (first-run terms, auto approval, plugin licenses and
// install commands) flies in as a stack of paper in the middle of the screen and waits for a stamp.
import { ICON } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let line = Promise.resolve();   // one paper at a time

// paper({ kind, title, intro, items: [[label, text]], code, agree, yes, no }) → Promise<boolean>
// no: null makes it impossible to wave away (Esc and the backdrop do nothing).
export function paper(opts) {
  const p = line.then(() => show(opts));
  line = p.catch(() => {});
  return p;
}

function show({ kind = '허가 요청서', title, intro = '', items = [], code = '', agree = '', yes = '도장 찍기', no = '그만두기' }) {
  return new Promise(done => {
    const prev = document.activeElement;
    const el = document.createElement('div');
    el.id = 'paper';
    el.innerHTML = `
      <div class="sheets">
        <div class="sheet back" style="--i:0"></div><div class="sheet back" style="--i:1"></div>
        <article class="sheet top" style="--i:2" role="dialog" aria-modal="true" aria-labelledby="paper-title">
          <header><span class="kind">${esc(kind)}</span><span class="docno">No. ${String(Date.now()).slice(-5)}</span></header>
          <h2 id="paper-title">${esc(title)}</h2>
          ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
          ${items.length ? `<ol>${items.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ol>` : ''}
          ${code ? `<pre>${esc(code)}</pre>` : ''}
          ${agree ? `<button type="button" class="agree" role="checkbox" aria-checked="false"><span class="box">${ICON.check}</span>${esc(agree)}</button>` : ''}
          <footer>
            ${no ? `<button type="button" class="no">${esc(no)}</button>` : ''}
            <button type="button" class="yes" ${agree ? 'disabled' : ''}>${ICON.check}${esc(yes)}</button>
          </footer>
          <div class="stamp" aria-hidden="true">허가</div>
        </article>
      </div>`;
    document.body.append(el);
    const $ = s => el.querySelector(s);
    // a button, not <input type=checkbox>: Chromium restores a stale tick into inputs after a reload
    const box = $('.agree');
    if (box) box.onclick = () => { const on = box.getAttribute('aria-checked') !== 'true'; box.setAttribute('aria-checked', on); $('.yes').disabled = !on; };
    (box || $('.yes')).focus();

    let closed = false;
    const close = ok => {
      if (closed) return;
      closed = true;
      el.classList.add(ok ? 'stamped' : 'away');
      setTimeout(() => { el.classList.add('leave'); }, ok ? 900 : 0);
      setTimeout(() => { el.remove(); prev?.focus?.(); done(ok); }, ok ? 1250 : 320);
    };
    $('.yes').onclick = () => close(true);
    if (no) $('.no').onclick = () => close(false);
    el.onclick = e => { if (e.target === el && no) close(false); };
    el.onkeydown = e => {
      if (e.key === 'Escape' && no) close(false);
      if (e.key === 'Tab') {   // keep focus on the paper
        const f = [...el.querySelectorAll('button:not(:disabled)')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey ? i <= 0 : i === f.length - 1) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
      }
    };
  });
}
