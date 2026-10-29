-- Day B: add cable overhead triceps extension (rope behind the head, leaning forward) and one-arm triceps extensions.
-- Order: Curls+Pushdowns (S1) · Dips · Overhead · Preacher · Hammer · Einarmig · Butterflies (stay last).
insert into public.exercises (name, metric, notes) values
  ('Overhead Trizepsdrücken (Kabel)', 'weight_reps', 'Seil hinter dem Kopf, leicht nach vorn gebeugt, nach vorne-oben strecken'),
  ('Einarmige Trizeps-Extensions', 'weight_reps', 'Gewicht pro Arm, Wdh. pro Arm')
on conflict (name) do nothing;

update public.template_exercises te set position = case e.name
    when 'Preacher Curls' then 5 when 'Hammer Curls' then 6 when 'Butterflies' then 8 else te.position end
from public.exercises e, public.workout_templates t
where e.id = te.exercise_id and t.id = te.template_id and t.code = 'B';

insert into public.template_exercises (template_id, exercise_id, position, target_sets, target_reps)
select t.id, e.id, x.pos, 3, x.reps
from (values ('Overhead Trizepsdrücken (Kabel)', 4, '10-12'), ('Einarmige Trizeps-Extensions', 7, '10-12')) as x(ex, pos, reps)
join public.workout_templates t on t.code = 'B'
join public.exercises e on e.name = x.ex;
