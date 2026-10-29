-- Pouchi (Pomeranian): tricks he knows / is learning / ideas, and enrichment games. Practice and games are logged as done
-- tasks "Pouchi: …" (attribute verbunden, element wasser) so XP, elements and the balance mechanic pick them up unchanged.
create table public.dog_tricks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cue text,                                  -- spoken command
  status text not null default 'idee' check (status in ('kann', 'lernt', 'idee')),
  difficulty int not null default 1 check (difficulty between 1 and 3),
  how_to text,                               -- short training steps
  mastered_on date,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.dog_games (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  kind text not null check (kind in ('nase', 'puzzle', 'kopf', 'bewegung')),
  minutes int not null default 10,
  how_to text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['dog_tricks', 'dog_games'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner full access" on public.%I for all to authenticated
                    using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.dog_tricks, public.dog_games;
