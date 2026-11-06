-- Pouchi-Trainingsplan: Reihenfolge der Tricks mit Voraussetzungen. Der nächste Trick = niedrigster `step`, dessen Trick noch
-- nicht `kann` ist und dessen `requires` alle `kann` sind. Eigene Tabelle (statt Spalten an dog_tricks), damit Claude den Plan
-- per Insert pflegen kann.
create table public.dog_trick_plan (
  trick_id uuid primary key references public.dog_tricks (id) on delete cascade,
  step int not null,                           -- Reihenfolge im Plan
  requires uuid[] not null default '{}',       -- Tricks, die er vorher können sollte
  why text,                                    -- warum dieser Trick jetzt dran ist / worauf er aufbaut
  created_at timestamptz not null default now()
);

alter table public.dog_trick_plan enable row level security;
create policy "owner full access" on public.dog_trick_plan for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.dog_trick_plan;
