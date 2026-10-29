insert into public.exercises (name, metric, notes) values
  ('Shoulder Press', 'weight_reps', null),
  ('Seated Shoulder Press', 'weight_reps', null),
  ('Seitheben', 'weight_reps', null),
  ('Latzug', 'weight_reps', null),
  ('T-Bar Rows', 'weight_reps', null),
  ('Shrugs', 'weight_reps', null),
  ('Jefferson Curl', 'weight_reps', 'Langsam, Wirbel für Wirbel'),
  ('Bizeps-Curls (Kabel)', 'weight_reps', null),
  ('Trizeps-Pushdowns (Kabel)', 'weight_reps', null),
  ('Dips', 'weight_reps', 'Gewicht = Zusatzgewicht (leer = Körpergewicht)'),
  ('Preacher Curls', 'weight_reps', null),
  ('Hammer Curls', 'weight_reps', null),
  ('Sissy Squats', 'weight_reps', 'Gewicht = Zusatzgewicht (leer = Körpergewicht)'),
  ('Back Squats', 'weight_reps', null),
  ('Farmers Walks', 'weight_distance', 'Gewicht pro Hand'),
  ('Donkey Calf Raises', 'weight_reps', null),
  ('GHD Sit-Ups', 'weight_reps', 'Gewicht = Zusatzgewicht (leer = Körpergewicht)'),
  ('Side Bends', 'weight_reps', null);

insert into public.workout_templates (code, name, focus, times_per_week, position) values
  ('A', 'Schulter & Rücken', 'Schulter, Lat, Nacken', 2, 1),
  ('B', 'Brust & Arme', 'Bizeps, Trizeps, Brust', 2, 2),
  ('C', 'Beine & Bauch', 'Quads, Waden, Core', 1, 3);

insert into public.template_exercises (template_id, exercise_id, position, target_reps, superset_group, optional)
select t.id, e.id, x.pos, x.reps, x.ss, x.opt
from (values
  ('A', 'Shoulder Press',            1, '6-10',  null, false),
  ('A', 'Seated Shoulder Press',     2, '8-12',  null, false),
  ('A', 'Seitheben',                 3, '12-15', null, false),
  ('A', 'Latzug',                    4, '8-12',  null, false),
  ('A', 'T-Bar Rows',                5, '8-12',  null, false),
  ('A', 'Shrugs',                    6, '10-15', null, false),
  ('A', 'Jefferson Curl',            7, '8-10',  null, true),
  ('B', 'Bizeps-Curls (Kabel)',      1, '10-12', 'S1', false),
  ('B', 'Trizeps-Pushdowns (Kabel)', 2, '10-12', 'S1', false),
  ('B', 'Dips',                      3, '8-12',  null, false),
  ('B', 'Preacher Curls',            4, '8-12',  null, false),
  ('B', 'Hammer Curls',              5, '10-12', null, false),
  ('C', 'Sissy Squats',              1, '10-15', null, false),
  ('C', 'Back Squats',               2, '5-8',   null, false),
  ('C', 'Farmers Walks',             3, '30-40 m', null, false),
  ('C', 'Donkey Calf Raises',        4, '12-20', null, false),
  ('C', 'GHD Sit-Ups',               5, '10-15', null, false),
  ('C', 'Side Bends',                6, '12-15', null, false)
) as x(code, ex, pos, reps, ss, opt)
join public.workout_templates t on t.code = x.code
join public.exercises e on e.name = x.ex;

insert into public.habits (name, emoji, target_per_week, position) values
  ('Training', '🏋️', 5, 1),
  ('2 L Wasser', '💧', 7, 2),
  ('7+ h Schlaf', '😴', 7, 3),
  ('Tagesplanung', '🗂️', 7, 4);
