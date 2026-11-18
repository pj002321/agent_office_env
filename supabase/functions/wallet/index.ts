// The account's wallet: every point, XP and item change happens here, so it follows the user across computers
// and a local edit can't mint points. POST { op, ...args } with the user's Supabase access token.
// Ops: get { local?, today } · earn · buy { id, fid } · equip { id, on, fid } · drop-room { fid } · attend { today } · claim
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as shop from '../_shared/shop.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const str = (v: unknown, max = 64) => typeof v === 'string' && v.length <= max ? v : '';
const ADMINS = (Deno.env.get('ADMIN_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

Deno.serve(async req => {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ ok: false, message: '로그인이 만료됐어요. 다시 로그인해 주세요.' }, 401);
  let a: any;
  try { a = await req.json(); } catch { return json({ ok: false, message: '잘못된 요청이에요.' }, 400); }
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(a.today) ? a.today : day;
  const isAdmin = ADMINS.includes(user.id);
  if (a.op?.startsWith?.('admin') && !isAdmin) return json({ ok: false, message: '관리자만 쓸 수 있어요.' }, 403);
  if (a.op === 'admin-stats') {   // read-only service overview
    const [users, wallets, paid] = await Promise.all([
      db.auth.admin.listUsers({ perPage: 1 }),
      db.from('wallets').select('state->xp', { count: 'exact' }),
      db.from('purchases').select('total, currency, status, created_at').order('created_at', { ascending: false }),
    ]);
    const rows = paid.data ?? [], ok = rows.filter(p => p.status === 'paid');
    const levels = (wallets.data ?? []).map((w: any) => shop.levelOf(Number(w.xp) || 0).level);
    return json({ ok: true, stats: {
      users: (users.data as any)?.total ?? null, wallets: wallets.count ?? 0,
      topLevel: Math.max(0, ...levels), avgLevel: levels.length ? Math.round(levels.reduce((x, y) => x + y, 0) / levels.length * 10) / 10 : 0,
      orders: ok.length, refunds: rows.length - ok.length,
      revenue: Object.entries(ok.reduce((m: any, p: any) => (m[p.currency] = (m[p.currency] ?? 0) + p.total, m), {})).map(([c, t]) => ({ currency: c, total: t })),
      recent: rows.slice(0, 5),
    } });
  }

  // read-modify-write with a version check, so two computers acting at once can't overwrite each other
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await db.from('wallets').select('state, version').eq('user_id', user.id).maybeSingle();
    if (error) return json({ ok: false, message: error.message }, 500);
    const s = row ? shop.load(row.state) : a.op === 'get' && a.local ? shop.adopt(a.local) : shop.fresh();

    let r: any;
    switch (a.op) {
      case 'get': r = { ok: true, adopted: !row && Boolean(a.local) }; break;
      case 'earn': r = shop.earn(s, now, day); break;
      case 'buy': r = shop.buy(s, str(a.id), str(a.fid) || undefined); break;
      case 'equip': r = shop.equip(s, str(a.id), a.on !== false, str(a.fid) || undefined); break;
      case 'drop-room': r = shop.dropRoom(s, str(a.fid)); break;
      case 'attend': r = shop.attend(s, str(a.today, 10), day); break;
      case 'claim': {
        const { data, error } = await db.from('purchases').select('id, points, status').eq('user_id', user.id);
        if (error) return json({ ok: false, message: error.message }, 500);
        r = shop.claim(s, data);
        break;
      }
      case 'admin': r = shop.admin(s, str(a.act, 16), a.n); break;
      default: return json({ ok: false, message: '없는 기능이에요.' }, 400);
    }

    const write = row ? (r.ok || a.op === 'earn') : true;   // earn's throttle clock is state too
    if (write) {
      const next = (row?.version ?? 0) + 1;
      const q = row
        ? db.from('wallets').update({ state: s, version: next, updated_at: new Date(now).toISOString() }).eq('user_id', user.id).eq('version', row.version).select('version')
        : db.from('wallets').insert({ user_id: user.id, state: s, version: next }).select('version');
      const { data: done, error: werr } = await q;
      if (werr && werr.code !== '23505') return json({ ok: false, message: werr.message }, 500);   // 23505: another computer created it first
      if (werr || !done?.length) continue;   // lost the race: reload and redo
    }
    return json({ ...r, wallet: shop.view(s, today, isAdmin) });
  }
  return json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, 409);
});
