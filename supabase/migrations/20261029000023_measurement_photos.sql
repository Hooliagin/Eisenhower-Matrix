-- Original check-up photos (Kieser reports / app screenshots). The images live AES-GCM-encrypted as static files
-- (public/m/*.bin, useless on their own); the per-photo key + iv are only readable by the owner via RLS.
create table public.measurement_photos (
  id uuid primary key default gen_random_uuid(),
  measured_on date not null,
  title text not null,
  path text not null,      -- e.g. 'm/<random>.bin', served by Vercel
  key text not null,       -- base64 AES-256 key
  iv text not null,        -- base64 12-byte GCM nonce
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.measurement_photos enable row level security;
create policy "owner full access" on public.measurement_photos for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
