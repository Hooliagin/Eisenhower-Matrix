-- Referenzfoto zu einem Checklisten-Punkt (z. B. „So soll der Tisch aussehen“). Privat in der Datenbank (data-URL, verkleinert),
-- nicht im Code oder in einem öffentlichen Ordner. Die App lädt das Bild erst beim Antippen.
create table public.checklist_item_photos (
  item_id uuid primary key references public.checklist_items (id) on delete cascade,
  data text not null,
  created_at timestamptz not null default now()
);
alter table public.checklist_item_photos enable row level security;
create policy "owner full access" on public.checklist_item_photos for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
alter publication supabase_realtime add table public.checklist_item_photos;

-- Neuer Punkt am Ende der Arbeits-Liste.
insert into public.checklist_items (checklist_id, text, position)
select c.id, 'Tisch richtig anordnen (Flaschen & Co. wie auf dem Foto)', 11
from public.checklists c
where c.project_id is null and c.title = 'Zur Arbeit fahren'
  and not exists (select 1 from public.checklist_items x where x.checklist_id = c.id and x.text like 'Tisch richtig anordnen%');
