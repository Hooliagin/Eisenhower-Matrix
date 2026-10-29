-- What the user dictated for a message (kept so drafts can be checked against it).
alter table public.followups add column dictation text;

-- Raw dictations: the corpus Claude learns the user's voice from.
create table public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  context text,
  followup_id uuid references public.followups(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Single-row, Claude-maintained description of how the user writes.
create table public.style_profile (
  id int primary key default 1 check (id = 1),
  profile text not null,
  updated_at timestamptz not null default now()
);
create trigger style_profile_updated_at before update on public.style_profile
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['voice_samples', 'style_profile'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
