-- Paid point-pack orders. Written only by the dodo-webhook function (service role); users can read their own.
create table public.purchases (
  id text primary key,                                  -- Dodo payment id
  user_id uuid not null references auth.users on delete cascade,
  points int not null check (points > 0),
  total int not null,                                   -- smallest currency unit
  currency text not null,
  status text not null,                                 -- paid | refunded | ...
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
create policy "read own purchases" on public.purchases for select to authenticated using (user_id = (select auth.uid()));
