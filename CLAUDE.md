# Daily Tracker – Arbeitsanleitung für Claude

Persönliche App (nur ein Nutzer) für **Tagesplan/Eisenhower-Matrix**, **Projekte & Nachfassen**, **Kalender** und **Fitness-Tracking**.
Der Nutzer steuert alles per Chat mit Claude; die Website ist zum Anschauen, Abhaken und Workout-Loggen.

Reiter: **Heute** (nur kompakte Übersichts-Kacheln – bewusst nicht überfrachten!), **Aufgaben** (Tagesplan | Matrix | Einkauf),
**Projekte**, **Kalender**, **Fitness**.

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

### Projekte & Nachfassen (`projects`, `followups`, `tasks.project_id`)
Projekt-Ordner (aktuell: Partei, Pluma Media, Baumklettern, Lesen). Unterordner über `projects.parent_id`
(Lesen → „Lese ich gerade“, „Will ich lesen“, „Muss ich besorgen“; Buch = Eintrag im passenden Unterordner, verschieben = `project_id` ändern).
Einträge sind normale `tasks` mit `project_id` (Quadrant `schedule`; mit `due_date` = Projekt-Deadline).
In der Matrix erscheinen Projekt-Einträge nur, wenn sie ein `due_date` haben.
```sql
insert into tasks (title, quadrant, project_id, source)
select 'Der Prozess – Kafka', 'schedule', id, 'claude' from projects where name = 'Will ich lesen';
```

`followups` = Leute, denen der Nutzer hinterher sein muss:
- `status = 'todo'`: Nutzer muss schreiben → `draft` = von Claude vorformulierte Nachricht zum Kopieren
- `status = 'waiting'`: Nachricht ist raus, `last_contact` = wann; ab `follow_up_on` nachhaken (Standard `wait_days` = 2)
- ohne `draft` = reine Erinnerung (z. B. Kim: „keine Texte, nur erinnern“); `repeat_days` = wiederkehrend
- In der App: „Gesendet“ → waiting + `follow_up_on = heute + wait_days` + Draft leeren; „Antwort da/Erledigt“ → done
  (bzw. bei `repeat_days` neu planen).

**Entwürfe schreiben:** Deutsch, locker, per „du“, kurz (2–4 Sätze), wie eine private Chat-Nachricht, gern ein Emoji am Ende.
Beim Nachhaken freundlich auf die vorige Nachricht Bezug nehmen, konkrete Frage stellen.
Wenn ein `waiting`-Eintrag fällig wird und kein Draft da ist, beim nächsten Chat eine Nachhak-Nachricht als `draft` hinterlegen.
```sql
insert into followups (project_id, person, topic, status, last_contact, follow_up_on, draft, source)
select id, 'Benjamin', 'Event Wein & Brezeln', 'waiting', '2026-10-29', '2026-10-31', 'Hey Benjamin, …', 'claude'
from projects where name = 'Partei';
-- Was ist fällig?
select p.name, f.person, f.topic, f.status, f.follow_up_on, f.draft is not null as hat_text
from followups f left join projects p on p.id = f.project_id
where f.status <> 'done' and (f.follow_up_on is null or f.follow_up_on <= (now() at time zone 'Europe/Berlin')::date);
```

### Kalender: Deadlines & Termine
- **Deadline** = Aufgabe mit `tasks.due_date` (etwas muss *bis* dahin erledigt sein). Erscheint ab dem Tag im Tagesplan.
- **Termin** = Eintrag in `events` (etwas findet *an* dem Tag statt), optional mit `start_time`/`end_time`.
  Termine mit Uhrzeit werden am Tag als feste Blöcke in den Tagesplan eingeplant (ohne `end_time` = 2 h).
```sql
insert into tasks (title, quadrant, due_date, source) values ('Rückzahlung Bürgergeld', 'schedule', '2026-11-14', 'claude');
insert into events (title, event_date, start_time, end_time, source) values ('Ricks Geburtstag', '2026-10-31', '19:00', null, 'claude');
-- Was steht an?
select 'deadline' art, due_date tag, null zeit, title from tasks where not done and due_date >= (now() at time zone 'Europe/Berlin')::date
union all select 'termin', event_date, start_time, title from events where event_date >= (now() at time zone 'Europe/Berlin')::date
order by 2, 3;
```

Habits (`habits`, `habit_logs`) sind aus der App entfernt – der Nutzer trackt Habits in anderen Apps.
Die Tabellen existieren noch (alle Habits `active = false`), werden aber nicht mehr angezeigt.

### Einkaufsliste (`shopping_items`)
Erscheint auf der Startseite „Heute“. Abgehakte Einträge bleiben durchgestrichen, bis sie entfernt werden.
```sql
insert into shopping_items (name) values ('Milch'), ('Brot');
update shopping_items set done = true where name ilike '%milch%';
delete from shopping_items where done;
```

### Tagesplan & Zeit-Lernen
Die Startseite zeigt einen **Tagesplan**: alle offenen Aufgaben mit `due_date <= heute` oder Quadrant `do`,
in Reihenfolge von `tasks.position`, ab der aktuellen Uhrzeit hintereinander gelegt.
Wenn der Nutzer eine Reihenfolge nennt, `position` durchnummerieren (`extract(epoch from now()) + rang`).

Felder auf `tasks`:
- `estimate_minutes`: Schätzung (vom Nutzer genannt oder von Claude vorgeschlagen und so benannt)
- `planned_start`: feste Uhrzeit (z. B. `'18:00'` für Training am Abend), sonst `null` = flexibel
- `started_at`: läuft gerade (▶ in der App)
- `actual_minutes`: tatsächliche Dauer; per Stoppuhr in der App oder wenn der Nutzer im Chat sagt „hat 80 min gedauert“

Lesen immer über den View **`tasks_planned`**. Er liefert `planned_minutes` (gelernte Dauer):
1. dieselbe Aufgabe (gleicher normalisierter Titel, `title_key()`) schon erledigt → Median der letzten 5 echten Dauern
2. sonst Schätzung × persönlicher Korrekturfaktor (`estimate_factor` = Median echt/geschätzt, ab 3 Datenpunkten, 0,5–3)
3. sonst 30 min

Damit das Lernen funktioniert: wiederkehrende Aufgaben **immer gleich benennen** (z. B. „Wohnung aufräumen“),
und wenn der Nutzer Dauern nennt, `actual_minutes` bzw. `estimate_minutes` setzen.
```sql
update tasks set done = true, done_at = now(), actual_minutes = 80 where title = 'Wohnung aufräumen' and not done;
select title, estimate_minutes, planned_minutes, history_samples, estimate_factor, planned_start
from tasks_planned where not done and (due_date <= (now() at time zone 'Europe/Berlin')::date or quadrant = 'do')
order by position;
-- Lernstand: wie gut sind die Schätzungen?
select title, estimate_minutes, actual_minutes from tasks where done and actual_minutes is not null order by done_at desc limit 20;
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
