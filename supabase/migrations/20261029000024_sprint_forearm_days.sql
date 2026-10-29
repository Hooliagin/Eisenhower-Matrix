-- D: weekly sprint session (min. 1×/week). E: forearm day, optional (times_per_week = 0 → "bei Bedarf", never recommended).
insert into public.exercises (name, metric, notes) values
  ('Sprints', 'weight_time', 'Zeit pro Sprint in Sekunden (Gewicht leer lassen); Strecke gleich halten, z. B. 60 m'),
  ('Handgelenk-Curls', 'weight_reps', null),
  ('Reverse Handgelenk-Curls', 'weight_reps', null),
  ('Reverse Curls', 'weight_reps', 'Obergriff, SZ-Stange oder Kabel'),
  ('Dead Hang', 'weight_time', 'Gewicht = Zusatzgewicht (leer = Körpergewicht)')
on conflict (name) do nothing;

insert into public.workout_templates (code, name, focus, times_per_week, position) values
  ('D', 'Sprint', 'Schnelligkeit, Explosivkraft', 1, 4),
  ('E', 'Unterarme', 'Griffkraft, Unterarme', 0, 5)
on conflict (code) do nothing;

insert into public.template_exercises (template_id, exercise_id, position, target_sets, target_reps, rest_seconds)
select t.id, e.id, x.pos, x.sets, x.reps, x.rest
from (values
  ('D', 'Sprints',                  1, 6, 'max', 150),
  ('E', 'Handgelenk-Curls',         1, 3, '12-15', 90),
  ('E', 'Reverse Handgelenk-Curls', 2, 3, '12-15', 90),
  ('E', 'Reverse Curls',            3, 3, '10-12', 90),
  ('E', 'Dead Hang',                4, 3, 'max', 90)
) as x(code, ex, pos, sets, reps, rest)
join public.workout_templates t on t.code = x.code
join public.exercises e on e.name = x.ex;

-- Forearm day done yesterday (28.10.2026), sets not reported
insert into public.workout_sessions (template_id, session_date, started_at, finished_at, notes)
select id, '2026-10-28', '2026-10-28 17:00+01', '2026-10-28 17:45+01', 'Nachgetragen via Claude, Sätze nicht genannt'
from public.workout_templates where code = 'E';
