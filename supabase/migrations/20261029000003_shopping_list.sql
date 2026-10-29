create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  done boolean not null default false,
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);
alter table public.shopping_items enable row level security;
create policy "owner full access" on public.shopping_items for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.shopping_items;
