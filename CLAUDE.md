# Daily Tracker – Arbeitsanleitung für Claude

Persönliche App (nur ein Nutzer) für **Eisenhower-Matrix**, **Habits** und **Fitness-Tracking**.
Der Nutzer steuert alles per Chat mit Claude; die Website ist zum Anschauen, Abhaken und Workout-Loggen.

- Frontend: Vite + React + TypeScript + Tailwind, gehostet auf Vercel (Projekt `eisenhower-matrix`, Team `hooliagins-projects`): https://eisenhower-matrix-bay.vercel.app/
- Backend: Supabase-Projekt **`daily-tracker`**, ID **`mnwjojtntgihfwotvshl`** (eu-central-1).
- Schema: `supabase/migrations/`. Alle Tabellen haben RLS „nur Owner“ (`public.allowed_users`).

## Wie Claude Daten ändert

Immer über das Supabase-MCP (`execute_sql` für Daten, `apply_migration` für Schemaänderungen) mit
`project_id = mnwjojtntgihfwotvshl`. Der Cloud-Container erreicht `*.supabase.co` per HTTP nicht – das MCP schon.
Die App aktualisiert sich per Realtime sofort, kein Deploy nötig.

Sprache in der App und in Einträgen: **Deutsch**. Datumslogik: Zeitzone Europe/Berlin
(`(now() at time zone 'Europe/Berlin')::date` statt `current_date`).

### Aufgaben (`tasks`)
Quadranten: `do` (dringend & wichtig), `schedule` (wichtig), `delegate` (dringend), `eliminate`, `inbox` (unsortiert).
Von Claude angelegte Aufgaben bekommen `source = 'claude'`.

```sql
-- anlegen
insert into tasks (title, quadrant, due_date, notes, source)
values ('Steuererklärung abgeben', 'schedule', '2026-11-15', null, 'claude');
-- verschieben / erledigen / löschen
update tasks set quadrant = 'do' where title ilike '%steuer%' and not done;
update tasks set done = true, done_at = now() where id = '…';
delete from tasks where id = '…';
-- Tagesüberblick
select quadrant, title, due_date from tasks where not done order by quadrant, position;
select title from tasks where done and done_at::date = (now() at time zone 'Europe/Berlin')::date;
```
Vor Änderungen per Titel-Match erst `select` ausführen und bei Mehrdeutigkeit nachfragen.

### Habits (`habits`, `habit_logs`)
```sql
insert into habits (name, emoji, target_per_week, position) values ('Lesen', '📖', 5, 5);
update habits set active = false where name = 'Lesen';          -- archivieren
insert into habit_logs (habit_id, log_date)
  select id, (now() at time zone 'Europe/Berlin')::date from habits where name = '2 L Wasser'
  on conflict do nothing;                                          -- abhaken
```

### Trainingsplan (`exercises`, `workout_templates`, `template_exercises`)
Split: **A** Schulter & Rücken (2×/Woche), **B** Brust & Arme (2×/Woche), **C** Beine & Bauch (1×/Woche).
Standardpause 120 s (`rest_seconds`). `superset_group` gleicher Wert = Supersatz (Timer startet erst nach der letzten Übung der Gruppe).
`optional = true` = wird eingeklappt angezeigt (z. B. Jefferson Curl).
`exercises.metric`: `weight_reps` (kg × Wdh), `weight_distance` (kg × Meter, z. B. Farmers Walk), `weight_time` (kg × Sek.).

```sql
-- Übung hinzufügen (ans Ende von Tag B)
insert into exercises (name) values ('Cable Flys') on conflict (name) do nothing;
insert into template_exercises (template_id, exercise_id, position, target_sets, target_reps)
select t.id, e.id, coalesce((select max(position) from template_exercises where template_id = t.id), 0) + 1, 3, '10-12'
from workout_templates t, exercises e where t.code = 'B' and e.name = 'Cable Flys';
-- Übung entfernen (Historie bleibt erhalten)
delete from template_exercises te using workout_templates t, exercises e
where te.template_id = t.id and te.exercise_id = e.id and t.code = 'B' and e.name = 'Cable Flys';
-- Satz-/Wdh-Ziel ändern
update template_exercises te set target_sets = 4, target_reps = '6-8'
from exercises e where te.exercise_id = e.id and e.name = 'Back Squats';
```
Übungen nie aus `exercises` löschen, wenn es `set_logs` dafür gibt (sonst ist die Historie weg).

### Workouts loggen (`workout_sessions`, `set_logs`)
Normalerweise loggt der Nutzer selbst in der App. Wenn er im Chat sagt **„heute alles wie geplant / wie letztes Mal“**:
letzte Session desselben Tages kopieren.

```sql
with last as (
  select s.id from workout_sessions s join workout_templates t on t.id = s.template_id
  where t.code = 'A' order by s.session_date desc, s.started_at desc limit 1
), new_session as (
  insert into workout_sessions (template_id, session_date, finished_at, notes)
  select id, (now() at time zone 'Europe/Berlin')::date, now(), 'Wie letztes Mal (via Claude)'
  from workout_templates where code = 'A'
  returning id
)
insert into set_logs (session_id, exercise_id, set_number, weight, reps, seconds, meters)
select n.id, l.exercise_id, l.set_number, l.weight, l.reps, l.seconds, l.meters
from set_logs l, new_session n where l.session_id = (select id from last);
```
Abweichungen („Squats heute 5 kg mehr“) danach per `update set_logs …` anpassen. Habit „Training“ dann auch abhaken.

Fortschritt abfragen:
```sql
select s.session_date, e.name, l.set_number, l.weight, l.reps
from set_logs l join workout_sessions s on s.id = l.session_id join exercises e on e.id = l.exercise_id
where e.name = 'Shoulder Press' order by s.session_date desc, l.set_number limit 30;
```

## Zugang
Login per E-Mail + Passwort. Neue Konten sehen nichts, bis ihre `user_id` in `allowed_users` steht:
```sql
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = '…';
insert into allowed_users (user_id) select id from auth.users where email = '…';
```

## Entwicklung
`npm install`, `npm run dev`, `npm run build` (Typecheck + Build). Env-Variablen stehen in `.env.production`
(nur URL + öffentlicher Publishable Key – Sicherheit kommt über RLS), daher braucht Vercel keine eigenen Env-Vars.
