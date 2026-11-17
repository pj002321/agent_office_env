// Dodo Payments webhook → public.purchases. Deploy with --no-verify-jwt (Dodo signs requests, it doesn't log in).
// Secrets: DODO_WEBHOOK_KEY (whsec_…), DODO_PACKS = '{"<product id>":800,"<product id>":1500,...}'.
// Points come from DODO_PACKS by product, never from the checkout URL, so a tampered link can't mint points.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Webhook } from 'npm:standardwebhooks@1';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PACKS: Record<string, number> = JSON.parse(Deno.env.get('DODO_PACKS') ?? '{}');
const wh = new Webhook(Deno.env.get('DODO_WEBHOOK_KEY')!);

Deno.serve(async req => {
  const body = await req.text();   // raw body: re-serialized JSON would break the signature
  let event;
  try { event = wh.verify(body, Object.fromEntries(req.headers)) as { type: string; data: any }; }
  catch (e) { console.error('bad signature', String(e)); return new Response('bad signature', { status: 401 }); }

  const d = event.data;
  console.log(event.type, d.payment_id, JSON.stringify(d.metadata), JSON.stringify(d.product_cart));
  let error;
  if (event.type === 'payment.succeeded') {
    const points = (d.product_cart ?? []).reduce((n: number, i: any) => n + (PACKS[i.product_id] ?? 0) * (i.quantity ?? 1), 0);
    const user_id = d.metadata?.user_id;   // set by the app as metadata_user_id on the checkout link
    if (!points || !user_id) { console.warn('not a point pack', points, user_id); return new Response('not a point pack'); }
    ({ error } = await db.from('purchases').upsert(
      { id: d.payment_id, user_id, points, total: d.total_amount, currency: d.currency, status: 'paid' },
      { onConflict: 'id', ignoreDuplicates: true }));   // Dodo retries: the same payment lands once
  } else if (event.type === 'refund.succeeded') {
    ({ error } = await db.from('purchases').update({ status: 'refunded' }).eq('id', d.payment_id));
  }
  if (error) console.error('db', error.message);
  return error ? new Response(error.message, { status: 500 }) : new Response('ok');
});
