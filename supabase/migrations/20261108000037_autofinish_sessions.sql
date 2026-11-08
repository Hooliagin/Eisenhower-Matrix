-- Vergessenes „Training abschließen“: Sätze sind sofort gespeichert, aber ohne finished_at zählt die Session nicht (XP, Feuer, kcal).
-- autofinish_sessions() schließt offene Sessions mit Sätzen ab, wenn der letzte Satz > 90 min her ist oder der Tag vorbei ist –
-- finished_at = Zeit des letzten Satzes. Übersprungen wird eine offene Session, wenn es für denselben Plan am selben Tag schon eine
-- abgeschlossene gibt (Doppelstart → nicht doppelt zählen). Die App ruft das beim Start und im Fitness-Reiter auf.
create or replace function public.autofinish_sessions() returns int
language sql security invoker set search_path = public as $$
  with c as (
    select s.id, max(l.created_at) as last_set
    from workout_sessions s join set_logs l on l.session_id = s.id
    where s.finished_at is null
      and not exists (select 1 from workout_sessions o where o.id <> s.id and o.template_id = s.template_id
                      and o.session_date = s.session_date and o.finished_at is not null)
    group by s.id, s.session_date
    having max(l.created_at) < now() - interval '90 minutes'
        or s.session_date < (now() at time zone 'Europe/Berlin')::date
  ), u as (
    update workout_sessions s set finished_at = c.last_set,
      notes = concat_ws(' · ', nullif(s.notes, ''), 'automatisch abgeschlossen')
    from c where s.id = c.id returning 1
  )
  select count(*)::int from u;
$$;

-- Doppelstart verhindern: pro Plan und Tag höchstens eine offene Session.
create unique index if not exists workout_sessions_one_open
  on public.workout_sessions (template_id, session_date) where finished_at is null;
