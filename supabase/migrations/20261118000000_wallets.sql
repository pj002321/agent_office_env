-- One wallet per account (points, XP, items, decorations). Only the wallet function (service role) reads or
-- writes it: RLS is on with no policies, so the app can't touch the row directly.
create table public.wallets (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
