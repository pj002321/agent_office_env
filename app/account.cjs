// Cozy Office account: GitHub login through Supabase (PKCE over a loopback redirect) so paid point packs
// are recorded server-side per user. This is the app's own account — never the user's Claude credentials.
// Payment itself happens on Dodo Payments' checkout page; its webhook (supabase/functions/dodo-webhook)
// writes the order to `purchases`; the wallet function grants it to the account's points (claim).
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { shell, safeStorage } = require('electron');

// Public values. Dodo live-mode products; the webhook only trusts the live signing key. All are public values.
const SUPABASE_URL = 'https://pexrwjevofmebyxxvasz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBleHJ3amV2b2ZtZWJ5eHh2YXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4Mzk5MjIsImV4cCI6MjExMDQxNTkyMn0.E65M-l9JBHwxhIQDgdXLuHKaF3x4xblBq4SpHaWQJe8';   // public anon key
const CHECKOUT_HOST = 'https://checkout.dodopayments.com/buy/';
const CHECKOUT = { p800: 'pdt_0Ns9G1wMA61WsnOVJlUaF', p1500: 'pdt_0Ns9G91ZtNtLTgInVYmq4', p3500: 'pdt_0Ns9GCcJ8EpQJilDi5Kdi' };
const PORT = 47615;   // Supabase → Auth → URL Configuration → Redirect URLs must list http://127.0.0.1:47615/callback
const ready = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

module.exports = file => {
  let session;   // loaded on first use: safeStorage only works once the app is ready
  const cur = () => {
    if (session === undefined) try { session = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); } catch { session = null; }
    return session;
  };
  const save = () => session ? fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(session))) : fs.rmSync(file, { force: true });
  const view = () => ({ ready: ready(), user: cur() && { email: session.email } });
  const auth = (grant, body) => fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.msg || `로그인 서버 오류 (${r.status})`); return j; });
  const keep = j => {
    session = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000, id: j.user.id, email: j.user.email };
    save();
    return view();
  };
  async function token() {
    if (!cur()) throw new Error('먼저 로그인해 주세요.');
    if (session.exp - Date.now() < 60e3) {
      try { keep(await auth('refresh_token', { refresh_token: session.refresh })); }
      catch { session = null; save(); throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.'); }
    }
    return session.access;
  }

  let cancel = () => {};   // a retry replaces a login still waiting in the browser (e.g. abandoned on an error page)
  function login(provider = 'github') {
    if (!ready()) return Promise.reject(new Error('결제 연결 준비 중이에요.'));
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    cancel();
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
        if (u.pathname !== '/callback') return res.writeHead(404).end();
        const code = u.searchParams.get('code');
        const why = (u.searchParams.get('error_description') || u.searchParams.get('error') || '').slice(0, 200);
        const msg = code ? '로그인됐어요. 이 창을 닫고 Cozy Office로 돌아가 주세요.' : `로그인하지 못했어요${why ? `: ${why}` : '.'}`;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(`<p style="font:16px sans-serif;margin:3em;text-align:center">${msg.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</p>`);
        done();
        if (!code) return reject(new Error(msg));
        auth('pkce', { auth_code: code, code_verifier: verifier }).then(keep).then(resolve, reject);
      });
      const done = () => { srv.close(); srv.closeAllConnections(); clearTimeout(timer); cancel = () => {}; };
      cancel = () => { done(); reject(new Error('새 로그인 창을 열었어요.')); };
      srv.on('error', () => { done(); reject(new Error('로그인 포트(47615)를 다른 프로그램이 쓰고 있어요.')); });
      const timer = setTimeout(() => { done(); reject(new Error('로그인 시간이 지났어요. 다시 시도해 주세요.')); }, 5 * 60e3);
      srv.listen(PORT, '127.0.0.1', () => shell.openExternal(`${SUPABASE_URL}/auth/v1/authorize?` + new URLSearchParams({
        provider, redirect_to: `http://127.0.0.1:${PORT}/callback`, code_challenge: challenge, code_challenge_method: 's256',
      })));
    });
  }
  function logout() { session = null; save(); return view(); }

  // The user id rides along as metadata_user_id (lands in payment metadata); points are decided server-side by product.
  async function checkout(pack) {
    if (!CHECKOUT[pack]) throw new Error('없는 충전 상품이에요.');
    await token();
    shell.openExternal(CHECKOUT_HOST + CHECKOUT[pack] + '?' + new URLSearchParams({
      quantity: '1', redirect_url: 'https://cozyagentoffice.com/', metadata_user_id: session.id, ...session.email && { email: session.email } }));
  }
  async function wallet(body) {   // supabase/functions/wallet: the account's points, XP and items
    const r = await fetch(`${SUPABASE_URL}/functions/v1/wallet`, { method: 'POST', body: JSON.stringify(body),
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${await token()}`, 'content-type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.message) throw new Error(`사무실 서버 오류 (${r.status})`);
    if (r.status >= 500 || r.status === 401) throw new Error(j.message);
    return j;
  }
  return { view, login, logout, checkout, wallet };
};
