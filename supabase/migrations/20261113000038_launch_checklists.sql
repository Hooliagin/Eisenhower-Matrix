-- Abfahrts-Checklisten für die Startseite (kein Projekt, project_id = null): „Zur Arbeit fahren“ und „Zum Sport fahren“.
-- Gleiche Tabellen wie die Projekt-Checklisten; abgehakt gilt nur für den Tag. Die App erkennt sie am Titel.
insert into public.checklists (project_id, title, position)
select null, t.title, t.pos
from (values ('Zur Arbeit fahren', 100), ('Zum Sport fahren', 101)) as t(title, pos)
where not exists (select 1 from public.checklists c where c.project_id is null and c.title = t.title);

insert into public.checklist_items (checklist_id, text, position)
select c.id, i.text, i.pos
from public.checklists c
join (values
  ('Zur Arbeit fahren', 'Lichter', 1),
  ('Zur Arbeit fahren', 'Schloss', 2),
  ('Zur Arbeit fahren', 'Regensachen prüfen', 3),
  ('Zur Arbeit fahren', 'Portemonnaie', 4),
  ('Zur Arbeit fahren', 'Schlüssel', 5),
  ('Zur Arbeit fahren', 'Handy', 6),
  ('Zur Arbeit fahren', 'Kopfhörer', 7),
  ('Zur Arbeit fahren', 'Wasserflasche', 8),
  ('Zur Arbeit fahren', 'Sportsachen (falls Sport nach der Arbeit)', 9),
  ('Zum Sport fahren', 'Kopfhörer', 1),
  ('Zum Sport fahren', 'Karte', 2),
  ('Zum Sport fahren', 'Sportsachen', 3)
) as i(list, text, pos) on i.list = c.title
where c.project_id is null
  and not exists (select 1 from public.checklist_items x where x.checklist_id = c.id and x.text = i.text);
