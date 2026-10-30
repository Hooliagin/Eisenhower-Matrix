# Daily Tracker – Arbeitsanleitung für Claude

Persönliche App (nur ein Nutzer: Joshua; sein Hund heißt **Pouchi** – genau so geschrieben) für Tagesplanung, Projekte & Nachfassen, Kalender, Fitness, Ernährung und
einen gamifizierten Charakter. **Joshua steuert alles per Chat mit Claude**; die Website ist zum Anschauen, Abhaken,
Timer-Starten und Workout-Loggen.

- Frontend: Vite + React + TypeScript + Tailwind, gehostet auf Vercel (Projekt `eisenhower-matrix`, Team `hooliagins-projects`):
  https://eisenhower-matrix-bay.vercel.app/ – Deploy automatisch bei Push auf den Branch.
- Backend: Supabase-Projekt **`daily-tracker`**, ID **`mnwjojtntgihfwotvshl`** (eu-central-1).
- Schema: `supabase/migrations/` (jede Schemaänderung dort als Datei mitschreiben). Alle Tabellen: RLS „nur Owner“ (`allowed_users`).

## Wie Claude Daten ändert

Immer über das Supabase-MCP (`execute_sql` für Daten, `apply_migration` für Schemaänderungen), `project_id = mnwjojtntgihfwotvshl`.
Der Cloud-Container erreicht `*.supabase.co` per HTTP nicht – das MCP schon. Die App aktualisiert sich per Realtime, kein Deploy nötig.
Sprache: **Deutsch**. Datum immer Europe/Berlin: `(now() at time zone 'Europe/Berlin')::date` statt `current_date`.
Vor Änderungen per Titel-Match erst `select`, bei Mehrdeutigkeit nachfragen.

**⚠️ Ändern/Löschen bestehender Zeilen:** Das Supabase-MCP verlangt bei `update`/`delete` (und destruktivem DDL) eine Bestätigung,
die Joshua nicht erreicht (Timeout nach 60 s). **Neue Zeilen (`insert`) und nicht-destruktive Migrationen gehen direkt.** Darum:
Änderungen an bestehenden Zeilen als **Änderungsvorschlag** in `change_requests` eintragen (`table_name`, `row_id` = id als Text,
`action` 'update'/'delete', `patch` jsonb, `summary` = kurzer deutscher Satz mit Emoji). Die Startseite zeigt oben „✏️ Claude schlägt
N Änderungen vor“ → Joshua tippt ✓ / „Alle übernehmen“, die App führt sie mit seiner Sitzung aus. Im Chat kurz sagen, dass Vorschläge
warten. Selbst korrigieren kann er Mahlzeiten auch direkt (Antippen → ✎ Editor mit kcal/Protein/🚶/Löschen).
```sql
insert into change_requests (table_name, row_id, action, patch, summary)
values ('meals', '<id>', 'update', '{"walk_minutes": 10}', '🚶 Frühstück: 10 min gegangen');
insert into change_requests (table_name, row_id, action, summary) select 'tasks', id::text, 'delete', '🗑️ Aufgabe „…“ löschen' from tasks where …;
```

---

## App-Aufbau (Reiter)

| Reiter | Inhalt |
|---|---|
| **Heute** | Nur kompakte Übersicht – **bewusst nicht überfrachten**. Von oben: **RPG-Charakterbogen** (Pixel-Avatar, Charakter-LV, 6 Werte mit Rang, XP- & ₵-Credits-Leiste, Quest des Tages) · Detox-Fenster (☀️ Morgen / 🌙 Abend) · ⚡ Daily-Quickbuttons (+ 📜 Gedicht, 🫁 Atem) · Schnell-Eingabe · Kacheln (Heute-Plan, Leute, Kalender, Einkauf, Training, Lesen) · Karte „Körper heute“ (Getränke, Dienst, kcal, Protein). Tipp auf Avatar → Charakter-Detail mit Messungen. |
| **Aufgaben** | Tagesplan (mit Uhrzeiten) · Eisenhower-Matrix · Einkaufsliste |
| **Projekte** | Ordner (mit Unterordnern), Leute & Nachfassen mit Nachrichtenentwürfen, Bücherliste (Projekt „Lesen“), „✍️ Mein Schreibstil“ |
| **Kalender** | Monat mit Deadlines (rot), Terminen (blau), Diensten (lila), Trainings (grün); „Demnächst“-Liste |
| **Fitness** | Trainingsplan A–E, Sätze loggen mit 2-min-Pausentimer, Fortschritt, 📏 Werte (Messungen, Verlauf, Vergleich), 🥊 Timer |
| **Elemente** | Wochenverteilung Feuer/Wasser/Erde/Luft gegen 4-Wochen-Schnitt |

## Querverbindungen – was wohin zählt (WICHTIG beim Eintragen)

Jede Aktivität kann gleichzeitig **XP** (Charakterwert), **Element-Minuten** und **Energieverbrauch** erzeugen.
Diese Tabelle entspricht den Views `xp_events`, `element_events` und `nutrition_daily` (dort im Zweifel nachsehen).

| Eingabe | Charakter-XP (`xp_events`) | Element (`element_events`) | kcal-Verbrauch (`nutrition_daily`) |
|---|---|---|---|
| Training-Session abgeschlossen (`workout_sessions.finished_at`) | Körper +75 | 🔥 Feuer 75 min | +300 kcal |
| Dienst mit Rad (`events.kind='dienst'`, `ride_km_each_way=13`) | Körper +78 (26 km × 3) | 🔥 Feuer 78 min | Rad 26 km × 25 = +650 kcal |
| Dienst-Stunden (`shift_hours` oder Ende − Beginn) | – | – | +120 kcal pro Stunde |
| Lesezeit (`reading_log`) | Intellekt (Min.) – Bücher mit Feld **Religion** → Spiritualität | 💨 Luft – Religion → 💧 Wasser | – |
| Erledigte Aufgabe mit `attribute` | jeweiliger Wert, Dauer = `actual_minutes` → Schätzung → 20 | `tasks.element`, sonst aus `attribute` abgeleitet | nur `attribute='koerper'`: +8 kcal/min |
| Erledigte Aufgabe nur mit `element` | – | jeweiliges Element | – |
| **Unterbrochene** Timer-Aufgabe (`progress_seconds ≥ 30`, noch nicht erledigt) | bisherige Minuten, am Tag des Speicherns | ebenso | Körper-Aufgaben: 8 kcal/min |
| Atemübung gespeichert (Aufgabe „Atemübung: …“) | 🕊️ Spiritualität (Minuten) | 💧 Wasser | – |
| Gedicht geübt (`poem_attempts.seconds`) | 🧠 Intellekt (Minuten) · gemeistert (`poems.mastered_on`) +60 | 💨 Luft | – |
| Gehen nach dem Essen (`meals.walk_minutes`) | 💪 Körper (Minuten) | 🌍 Erde | +4 kcal/min |
| Detox-Fenster geschafft (`detox_sessions.result='success'`) | – | 🌍 Erde (30/60 min) | – |
| Cappuccino (`drink_log.kind='coffee'`) | – | – | Aufnahme: +100 kcal, +5 g Protein, 75 mg Koffein |
| Mahlzeit (`meals`) | – | – | Aufnahme: kcal, Protein × `protein_quality` |

`element_of(attribute)`: koerper/kreativ → feuer · spirit/verbunden → wasser · intellekt/charisma → luft.
Grundverbrauch zusätzlich immer: Grundumsatz 1834 × PAL 1,4 ≈ 2568 kcal/Tag.

**Regeln beim Anlegen:**
- **Jede neue Aufgabe bekommt ein `element`** und ein `attribute`, wenn sie einen Charakterwert trainiert
  (Sport außerhalb der Sessions → koerper · Recherche/Lernen → intellekt · Impro/Gespräche → charisma · Beten/Meditation →
  spirit · Videos/Websites/Schreiben → kreativ · Freunde/Familie/Pouchi → verbunden). Haushalt/Finanzen/Behörden → nur `element='erde'`.
- **Nicht doppelt zählen:** Plan-Erinnerungen „Training: …“ bekommen weder `element` noch `attribute` (die Session zählt).
  Radfahrten zum Dienst nicht zusätzlich als Aufgabe eintragen (zählen über das Dienst-Event).
- **Weitere Radfahrten** (nicht zum Dienst) → erledigte Aufgabe, `attribute='koerper'`, `element='feuer'`, `actual_minutes` ≈ 3 min/km.

---

## Aufgaben & Tagesplan (`tasks`, View `tasks_planned`)

Quadranten: `do` (dringend & wichtig), `schedule` (wichtig), `delegate` (dringend), `eliminate`, `inbox` (unsortiert).
Von Claude angelegte Einträge bekommen `source = 'claude'`. Lesen immer über **`tasks_planned`** (liefert gelernte Dauer).

**Tagesplan** (Aufgaben → Tagesplan; Kachel „Heute“ zeigt jetzt/danach): alle offenen Aufgaben mit `due_date <= heute` oder
Quadrant `do`, **außer** `anytime`-Routinen und verpassten Routinen, in Reihenfolge `position`, ab jetzt hintereinander gelegt.
- Termine/Dienste **mit Uhrzeit** sind feste, unverschiebbare Blöcke; Aufgaben werden drumherum geplant, kurze spätere Aufgaben
  füllen Lücken vor einem Block. Feste Uhrzeit einer Aufgabe (`planned_start`) kollidiert → wird orange („zu spät“) markiert.
- Nennt Joshua eine Reihenfolge: `position = extract(epoch from now()) + rang`.

Felder: `estimate_minutes` (Schätzung) · `planned_start` (feste Uhrzeit) · `started_at` (läuft, ▶) · `actual_minutes` (echte Dauer,
Stoppuhr oder „hat 80 min gedauert“) · `project_id` · `routine_id` · `attribute` · `element` · `timer` · `anytime`.

**Zeit-Lernen** (`planned_minutes`): 1. gleicher Titel (`title_key()`) schon erledigt → Median der letzten 5 echten Dauern,
2. sonst Schätzung × persönlicher Faktor (`estimate_factor`, Median echt/geschätzt, ab 3 Werten, 0,5–3), 3. sonst 30 min.
Wiederkehrende Aufgaben **immer gleich benennen**; genannte Dauern als `actual_minutes`/`estimate_minutes` speichern.
```sql
insert into tasks (title, quadrant, due_date, estimate_minutes, element, attribute, source)
values ('Steuererklärung abgeben', 'schedule', '2026-11-15', 90, 'erde', null, 'claude');
update tasks set done = true, done_at = now(), actual_minutes = 80 where title = 'Wohnung aufräumen' and not done;
select title, planned_minutes, planned_start from tasks_planned
where not done and not anytime and (due_date <= (now() at time zone 'Europe/Berlin')::date or quadrant = 'do') order by position;
```
In der **Matrix** erscheinen keine Routinen und Projekt-Einträge nur mit `due_date`.

## Routinen (`routines`) & ⚡ Daily-Quickbuttons

Jede aktive Routine wird pro Tag zu einer Aufgabe (`tasks.routine_id`, eindeutig pro Tag), erzeugt beim App-Start per
`spawn_routine_tasks(datum)` (Claude kann die Funktion selbst aufrufen). Vererbt werden `attribute`, `element`, `timer`, `anytime`.
- `weekdays` (ISO 1 = Mo … 7 = So), `null` = täglich. Verpasste Routine bleibt, bis eine neuere derselben Routine existiert
  (gestrige tägliche verschwindet, das Blumengießen vom Sonntag wartet).
- `anytime = true` → nicht im Tagesplan, sondern als **⚡ Daily**-Button auf der Startseite (zwischendurch abhaken).
- `timer` (jsonb, Sekunden): `{"rounds":3,"work":180,"rest":30,"prep":10}` → 🥊 Vollbild-Rundentimer (Ringglocke „Ding ×5“ = Rundenstart
  und Rundenende – laute, helle Glocke mit Limiter, damit sie über Musik hörbar ist; 2 Klicks = 10 s übrig, Ticken = Pause endet). `"style":"calm"` → Meditationstimer mit Gong, optionalem **🫁 Atem-Guide** (Kreis + leises Atemgeräusch im
Resonanz-Tempo 5,5 s ein / 5,5 s aus ≈ 5,5 Atemzüge/min) und **Hintergrundrauschen** (Stille/Weiß/Rosa/Braun/Regen/Brummen +
Lautstärke, im Browser erzeugt – keine Audiodateien; Wahl wird pro Gerät gemerkt, Standard Braun; läuft nur während der
Meditation, stoppt bei Pause/Ende; Schleife 30 s mit Equal-Power-Überblendung, damit es nicht periodisch leiser wird).
**🌑 Bildschirm dunkel** (alle Timer, pro Gerät gemerkt): Bildschirm wird schwarz, bleibt technisch an (Wake Lock), damit
Ton/Rauschen weiterlaufen – schaltet iOS den Bildschirm wirklich aus, stoppt der Browser den Ton. Tipp irgendwo → Bedienung für
6 s sichtbar. Unten „Beenden & später weitermachen“ (bzw. „Beenden“), oben großes ✕ unter der Statusleiste. Abschluss speichert
  die Aufgabe als erledigt mit Dauer (ohne Vorlauf). `"style":"plain"` → einfacher Countdown (Startton, Endsignal,
Pause/Weiter), z. B. Pouchi-Tricks. Freier Boxtimer auch unter Fitness → „🥊 Timer“.
- **Später weitermachen:** Bricht Joshua einen Timer ab (Button „💾 Später weitermachen“ oder ✕ nach ≥ 30 s), wird der Stand in
  `tasks.progress_seconds` gespeichert (Sekunden nach dem Vorlauf). Der Daily-Button zeigt dann z. B. „6/10 min“; beim nächsten Öffnen
  geht es dort weiter („▶ Weitermachen“). Sagt er im Chat „hab 6 min mit Pouchi gemacht, abgebrochen“:
  `update tasks set progress_seconds = 360 where title = 'Tricks mit Pouchi (10 min)' and due_date = <heute> and not done;`

| Routine | Wann | Wo | attribute / element |
|---|---|---|---|
| Morgenlicht: 10 min Tageslicht in die Augen | täglich, direkt nach dem Aufstehen (Rhythmus), Position 0 | Tagesplan | – / erde |
| Tageslichtlampe: 10 min helles Licht | täglich, Anfang des Tages (gegen Winterdepression) – **zusätzlich**, nicht statt Morgenlicht | ⚡ Daily 💡 → öffnet die Atemübungs-Auswahl, gewählte Übung läuft 10 min (`timer.style='breath'`, `work`=600) | – / erde |
| Starke Mitte: 10 min Reels anderer Parteien schauen & gute an Michael schicken | täglich | Tagesplan | intellekt / luft |
| Wohnung 10 min lüften | täglich | ⚡ Daily | – / erde |
| Schattenboxen (3 × 3 min, 30 s Pause) | täglich | ⚡ Daily, Rundentimer | koerper / feuer |
| Meditieren (10 min) | täglich | ⚡ Daily, Gong-Timer | spirit / wasser |
| Tricks mit Pouchi (10 min) | täglich | ⚡ Daily, einfacher Timer mit Pause | verbunden / wasser |
| Pouchi: Wasserschüssel abwaschen & frisches Wasser | täglich | ⚡ Daily (abhaken) | – / erde |
| Tagebuch schreiben (über Gefühle) | täglich | ⚡ Daily (abhaken) | spirit / wasser |
| Blumen gießen | sonntags (zuletzt So 25.10.2026) | Tagesplan | – / erde |
```sql
insert into routines (title, estimate_minutes, position, attribute, element, anytime) values ('Beten', 10, 7, 'spirit', 'wasser', true);
select public.spawn_routine_tasks((now() at time zone 'Europe/Berlin')::date);
```

## 🫁 Atemübungen (Button in der ⚡-Daily-Karte, `src/lib/breath.ts`)

Geführte Übungen mit wachsendem/schrumpfendem Kreis, Ansage und synthetischem Atemgeräusch. Nach dem Ende „Speichern“ →
erledigte Aufgabe „Atemübung: <Name>“ (`attribute='spirit'`, `element='wasser'`, Dauer; bei Wim Hof die Haltezeiten in `notes`).

| Übung | Ablauf | Wofür |
|---|---|---|
| Resonanz-Atmung | 5,5 s ein / 5,5 s aus, 5 min | Ruhe, HRV (häufigste Resonanzrate 5,5/min) |
| Zyklisches Seufzen | 2 s ein + 1 s nachziehen, 6 s aus, 5 min | Stimmung (Balban et al. 2023: besser als Meditation) |
| Box Breathing | 4-4-4-4, 5 min | Fokus, Stress |
| 4-7-8 | 4 ein, 7 halten, 8 aus, 4 Durchgänge | Einschlafen |
| Wim Hof | 3 Runden: 30 tiefe Atemzüge → aus & halten (offen, Tippen) → ein & 15 s halten | Energie (⚠️ nur sitzend/liegend, nie im Wasser/beim Fahren) |
| Feueratem (Kapalabhati) | 3 × 30 s aktive Ausstöße (~1/s), dazwischen 30 s ruhig | Wach werden (⚠️ nicht bei Schwangerschaft, Bluthochdruck, Herz, Epilepsie) |

**Feste Länge** (`timer.style='breath'` an einer Routine, z. B. Tageslichtlampe): Auswahl zeigt oben den Anlass, `stepsFor(übung, min)`
streckt Dauer-Übungen auf die Länge bzw. wiederholt Runden-Übungen; „Speichern“ legt die Atemübung an **und** hakt die Routine mit echter Dauer ab.
Neue Übungen: Eintrag in `EXERCISES` (Schritte `in`/`out`/`hold`/`free`, `open` = endet per Tippen, `targetRate` = Ziel-Atemzüge/min).

**📱 Atem über das Handy erkennen** (Schalter in der Übungsauswahl, pro Gerät gemerkt, `src/lib/breathSensor.ts`): Handy flach
auf den Bauch, Ton über Kopfhörer. Der Beschleunigungssensor (iPhone fragt einmal nach „Bewegung & Ausrichtung“) misst das
Heben/Senken: Live-Kurve der letzten 20 s, **Dein Tempo X/min · Ziel Y/min** (ab 3 Atemzügen, Fenster 60 s) und bei offenem
Luftanhalten (Wim Hof) automatisch weiter, sobald er wieder einatmet (frühestens nach 5 s, Hinweis „Atmung erkannt ✓“; Tippen
geht weiterhin). Nur lokal im Browser, nichts wird gespeichert. Mit simulierten Sensordaten (10–100 Hz, mit Rauschen,
Herzschlag/Schlucken) getestet, auf einem echten Handy noch nicht – Schwellen ggf. in `BreathSensor` nachjustieren.

Jede gespeicherte Übung landet zusätzlich in **`breath_sessions`** (`exercise` = id aus `breath.ts`, `holds` = Haltezeiten in s,
`avg_rate` = gemessenes Tempo mit Sensor). Auswahl zeigt je Übung „N× gemacht · 🏆 Bestwert · Ø letzte 5“, Endbildschirm
„🏆 Neuer Rekord!“ bzw. Vergleich mit Ø. Erzählt Joshua Haltezeiten im Chat:
`insert into breath_sessions (exercise, name, duration_s, holds) values ('wimhof', 'Wim Hof', 660, array[102,108,76]);`

## 📜 Gedichte auswendig lernen (`poems`, `poem_attempts`, `src/lib/poem.ts`, `PoemTrainer.tsx`)

Öffnen: ⚡ Daily → „📜 Gedicht“ oder in jeder **Satzpause** über den 📜-Knopf im Pausen-Timer (Countdown läuft oben weiter,
„Satz! 💪“ wenn vorbei). Strophenweise: 📖 Lesen → 🧩 Lücken (Anfangsbuchstaben) → 🎤 Aufsagen per Spracherkennung (de-DE) für
„Diese Strophe“, „Strophe 1–n“ oder „Ganzes Gedicht“. Die App vergleicht Wort für Wort (rot = fehlt, gelb = anders gesagt;
kleine Erkennungsfehler zählen als richtig) und speichert **jeden Versuch mit Transkript** in `poem_attempts`. ≥ 90 % bei der
aktuellen Strophe → „✓ Sitzt“ (`poems.learned_stanzas` +1; letzte Strophe → `status='mastered'`, `mastered_on`).
Text: Strophen durch Leerzeile getrennt. Aktuell: **Belsazar** (Heine, 21 Strophen).
**„Prüf mal mein Gedicht“** → Claude ist Kontrollinstanz: neueste Versuche lesen, Transkript gegen Text vergleichen (Spracherkennung
verhört sich bei Eigennamen/alten Formen – „Belsazar“, „Jehovah“, „störrigen“ – nicht als Fehler werten), wiederkehrende Fehler und
vertauschte/ausgelassene Zeilen benennen, kurzes Feedback in `poem_attempts.feedback` schreiben (App zeigt das neueste). Neues Gedicht:
`insert into poems (title, author, text, position) …` (gemeinfreie Texte vollständig, sonst Joshua den Text schicken lassen).
```sql
select a.created_at, a.stanza_from + 1 as von, a.stanza_to + 1 as bis, a.accuracy, a.transcript
from poem_attempts a join poems p on p.id = a.poem_id where p.title = 'Belsazar' and a.mode = 'recite' order by a.created_at desc limit 10;
update poem_attempts set feedback = '…', checked_at = now() where id = '<neuester Versuch>';
```

## 🐕 Pouchi (`dog_tricks`, `dog_games`, `src/components/Pouchi.tsx`)

Pouchi ist ein **Pomeranian**. Öffnen: ⚡ Daily → „🐕“, und im Timer „Tricks mit Pouchi“ steht ein Hinweis (Neu lernen · Heute
wiederholen · Spiel danach) mit Knopf zu allen Tricks & Spielen. Pixel-Pouchi (orange) sitzt neben dem Avatar.
- `dog_tricks.status`: `kann` · `lernt` · `idee`; `difficulty` 1–3 (★); `how_to` = kurze Trainingsschritte. App: „✓ 5 min geübt“,
  „🎉 Kann er!“ (→ `kann`, `mastered_on`, Erfolg „Pouchi kann: …“), „🎯 Jetzt lernen“ bei Ideen. Wiederholen: täglich 3 bekannte Tricks.
- Kann (Stand 29.10.2026): Sitz, Platz, Dreh dich, Komm hoch, Sitz schön (Männchen), High Five links/rechts, Pfötchen, anderes Pfötchen,
  Gib zehn. Lernt: Touch. Ideen: Andersrum drehen, Winken, Verbeugen, Bleib, Rolle, Peng, Rückwärts, Acht, Schäm dich, Aufräumen, Decke.
- `dog_games` (Nase/Puzzle/Kopf/Bewegung): Spiel des Tages rotiert täglich; „✓ Gespielt“.
- Alles Geübte/Gespielte = erledigte Aufgabe „Pouchi: …“ (`attribute='verbunden'`, `element='wasser'`) → zählt wie Aufgaben.
- Erzählt Joshua „Pouchi kann jetzt X“ → `insert`/Änderungsvorschlag (`dog_tricks` ist in `change_requests` nicht erlaubt → als
  neue Zeile nur bei neuem Trick; Statuswechsel macht die App, sonst Skill/Erfolg per Vorschlag bzw. Insert). Skill „Pouchi-Training“
  mitziehen (10 Tricks = Fortgeschritten).
- Pomeranian-Hinweise (in der App): kurze Einheiten, winzige Leckerlis, Geschirr statt Halsband (Luftröhre), keine hohen Sprünge
  (Kniescheiben), Spielzeug ohne verschluckbare Teile, Spiele rotieren.

## 📈 Fortschritt & Rekorde (Views `metric_daily`, `metric_progress`)

`metric_daily` = ein Wert pro Kennzahl und Tag: längstes Wim-Hof-Halten, e1RM je Übung (Epley, ≤ 12 Wdh.), Lesen-Minuten,
Meditieren & Atmen (Minuten), XP gesamt, verwertbares Protein, Getrunkenes. `metric_progress` = letzter Wert je Kennzahl
gegen Ø der 28 Tage davor (`avg_prev`), Bestwert davor (`best_prev`), `is_record`, `above_avg`. Anzeige: Charakter-Detail
„📈 Fortschritt & Rekorde“; auf der Startseite nur eine Zeile „🏆 Neue Bestleistung …“, wenn es heute einen Rekord gibt.
**Claude meldet Fortschritt aktiv:** Nach jedem Eintrag (und wenn Joshua fragt) `select * from metric_progress where latest_day =
<heute>` prüfen und Rekorde bzw. „besser als dein Schnitt“ kurz erwähnen, konkret mit Zahlen (z. B. „Luft anhalten 2:10, Rekord,
bisher 1:48“). Ehrlich, auch wenn etwas unter dem Schnitt liegt, aber ohne Moralpredigt.
Neue Kennzahl: weiteren `union all`-Block in `metric_daily` (Spalten metric, label, unit, higher_better, day, value).

## Detox-Fenster (`detox_sessions`) – Selbst-Accountability, keine Sperre

Startseite: ☀️ **Morgen 30 min** (nach dem Aufstehen kein Handy/Social Media/YouTube), 🌙 **Abend 60 min** (1 h vor dem Schlafen
kein Bildschirm/helles Licht). Start → Countdown → „Geschafft? Ja/Nein“ (Abend meist am nächsten Morgen). Leiste = letzte 7.
Erfolge → 🌍 Erde. Die App sperrt nichts. Sagt Joshua es im Chat, Ergebnis setzen:
```sql
update detox_sessions set result = 'success', answered_at = now()
where id = (select id from detox_sessions where kind = 'evening' and result is null order by started_at desc limit 1);
```

## Projekte & Nachfassen (`projects`, `followups`, `tasks.project_id`)

Ordner: **Starke Mitte** (= die Partei: Recruiting, Event-Reihe „Wein & Brezel“, Social Media) · **Pluma Media** (Content,
Werbekampagnen, Konzept über Dienstleistung hinaus; Kim) · **Baumklettern** (AS1-Schein) · **Lesen** (`kind='books'`) ·
**Michael Rentsch Consulting Website**. Unterordner über `projects.parent_id`. Einträge = `tasks` mit `project_id`
(Quadrant `schedule`, `due_date` = Projekt-Deadline).
**Michael Rentsch** (gesprochen mit Ä, Anrede immer „Hey Michael“) gibt es in zwei Projekten – nicht verwechseln:
Partei-Videos/Instagram-Reels → **Starke Mitte**; seine Consulting-Website (Link, Prototyp, Fotos, Brainstorming) → **Website-Projekt**.

`followups` = Leute, denen Joshua hinterher sein muss:
- `status='todo'`: muss schreiben → `draft` = vorformulierte Nachricht (Kopieren-Button in der App)
- `status='waiting'`: Nachricht ist raus (`last_contact`), ab `follow_up_on` nachhaken (`wait_days`, Standard 2)
- ohne `draft` = reine Erinnerung (Kim: „keine Texte, nur erinnern“, `repeat_days = 7`)
- App: „Gesendet“ → waiting + `follow_up_on = heute + wait_days` + Draft leeren; „Antwort da/Erledigt“ → done (bzw. neu planen)
```sql
select p.name, f.person, f.topic, f.status, f.follow_up_on, f.draft is not null as hat_text
from followups f left join projects p on p.id = f.project_id
where f.status <> 'done' and (f.follow_up_on is null or f.follow_up_on <= (now() at time zone 'Europe/Berlin')::date);
```

### Nachrichten in Joshuas Stil (`style_profile`, `voice_samples`) – PFLICHT-ABLAUF
Empfänger dürfen nicht merken, dass KI mitschreibt. **Vor jedem Entwurf**:
1. `select profile from style_profile;` lesen und befolgen (u. a. keine Gedankenstriche, keine KI-Floskeln, „Hey <Name>,“).
2. Die 3–5 neuesten `voice_samples` als Stilvorlage lesen.

Wenn Joshua **diktiert**: Inhalt in *seinen* Worten ausformulieren (Füllwörter dosiert behalten, nichts erfinden), Weggelassenes
weglassen, meist endet die Nachricht mit seiner Frage. Rohdiktat → `voice_samples` (`context`, `followup_id`) und
`followups.dictation`, Text → `followups.draft`. Neue Stilmerkmale oder Korrekturen („so würde ich das nicht sagen“) → `style_profile`.
Ohne Diktat (z. B. Nachhaken): streng nach Profil, 2–3 Sätze, Bezug auf vorige Nachricht, konkrete Frage. Fälliger
`waiting`-Eintrag ohne Draft → beim nächsten Chat Nachhak-Text hinterlegen. Profil ist in der App editierbar → immer frisch lesen.
```sql
insert into followups (project_id, person, topic, status, last_contact, follow_up_on, draft, dictation, source)
select id, 'Benjamin', 'Event Wein & Brezel', 'waiting', '2026-10-29', '2026-10-31', 'Hey Benjamin, …', null, 'claude'
from projects where name = 'Starke Mitte';
insert into voice_samples (text, context, followup_id) values ('<Rohdiktat>', 'Nachricht an X, Thema Y', '<followup id>');
```

## Lesen (`books`, `reading_log`) – Projekt „Lesen“

- `field`: Fiction · „Non-Fiction: Elitentheorie“ · Life Skills · Religion (frei erweiterbar)
- `status`: `reading` · `to_buy` · `want` (habe ich) · `idea` (Vorschlag von Claude) · `done`; `progress_pct` 0–100 (Seiten → %)
- **Deutscher Titel** (`title_de`; `no_de_edition = true` = keine (gute) deutsche Ausgabe) – App zeigt ihn als Haupttitel
  („Original: …“ darunter). Bei **jedem neuen Buch** prüfen, ob es eine gute deutsche Ausgabe gibt (Verlag/DNB, nicht raten); sonst
  englischer Titel (Joshua ist mit Englisch okay). `author` immer mit **vollem Namen** (Joshua filtert auf booklooker selbst nach Autor).
- **Kauf-Tipp** (`buy_tip`): Joshua kauft neu, wenn gebraucht kaum billiger ist; sonst gebraucht. Kleinanzeigen bringt nichts (meist nicht
  verfügbar). Neupreise sind wegen Buchpreisbindung überall gleich → nur Neupreis vs. Gebrauchtpreis (booklooker, ZVAB, medimops)
  vergleichen, Ergebnis kurz mit 🆕/♻️/⚖️ in `buy_tip`. App zeigt Tipp + 📋 Titel + 📋 Autor + ♻️ booklooker + 📚 ZVAB
  (Suche **nur nach dem Titel**, ohne Autor, Untertitel nach „.“/„:“ abgeschnitten) (bei „Besorgen“
  und „Vorschläge“ immer sichtbar, sonst nach Antippen).
- Lesezeit „heute 40 min“ → `reading_log` (Startseiten-Kachel zeigt Wochensumme). Religion-Bücher zählen für Spiritualität/Wasser.
- Übungen aus Büchern (Impro: Statustransaktionen) als `tasks` im Projekt Lesen mit `attribute='charisma'`.
```sql
insert into reading_log (minutes, book_id) select 40, id from books where title = 'Neuromancer';
update books set progress_pct = 60 where title = 'Enemies of the Leviathan';
```

## Kalender (`events`, `tasks.due_date`)

- **Deadline** = Aufgabe mit `due_date` (*bis* dahin). Ab dem Tag im Tagesplan.
- **Termin** = `events` (`kind='termin'`), optional `start_time`/`end_time` (ohne Ende = 2 h); mit Uhrzeit fester Block im Plan.
- **Dienst** = `events` (`kind='dienst'`). Joshua ist **Pflegehelfer, 30 h/Woche**, fährt mit dem Rad (je Weg 13 km).
  **Normalfall: kein Dienstplan-Upload.** Er tippt in „Körper heute“ **„+ 6 h“ / „+ 12 h“** (🚲 an/aus, ✕ löschen) oder sagt
  „heute 6 Stunden Dienst, mit dem Rad“ → Event ohne Uhrzeit mit `shift_hours`. Nennt er Uhrzeiten: `start_time`/`end_time`
  → App plant Hin-/Rückfahrt (~39 min) als feste Blöcke. Ohne Rad (Bahn, krank): `ride_km_each_way = null`; fällt aus: löschen.
```sql
insert into events (title, event_date, kind, shift_hours, ride_km_each_way, source)
values ('Dienst', (now() at time zone 'Europe/Berlin')::date, 'dienst', 6, 13, 'claude');
insert into events (title, event_date, start_time, source) values ('Ricks Geburtstag', '2026-10-31', '19:00', 'claude');
```

## Einkaufsliste (`shopping_items`)

Aufgaben → Einkauf; Startseiten-Kachel zeigt Anzahl offener Artikel. Abgehakte bleiben durchgestrichen bis „Erledigte entfernen“.
```sql
insert into shopping_items (name) values ('Milch'), ('Brot');
update shopping_items set done = true where name ilike '%milch%';
```

## Ernährung & Getränke (`meals`, `drink_log`, `nutrition_settings`, View `nutrition_daily`)

Startseite, Karte „Körper heute“: Getränke per Tipp – 🥛 Glas 250 ml, 🍶 Flasche 1 L, ☕ Kaffee = **Cappuccino** (1 Espresso
≈ 75 mg Koffein + ~150 ml Vollmilch ≈ 100 kcal & 5 g Protein, automatisch mitgezählt, 200 ml). Trinkziel 2,5 L (Kaffee zählt mit),
Warnung ab 400 mg Koffein (EFSA). Dazu Dienst-Buttons, gegessene vs. verbrauchte kcal und **verwertbares** Protein.
**💧 Trink-Erinnerung** (`src/lib/hydration.ts`, nur in der Karte, solange die App offen ist, 7–22 Uhr): noch nichts getrunken →
„großes Glas nach der Nacht“; ≥ 90 min seit dem letzten Getränk → Hinweis, ≥ 150 min → kräftiger; dazu „~X ml hinter dem
Tagesziel“ (Ziel linear über 7–22 Uhr verteilt). Keine Push-Nachrichten bei geschlossener App.

**Essen trägt Claude ein**, wenn Joshua es erzählt (kein Scannen):
1. Portionen realistisch schätzen; Annahmen in `notes`. **Joshuas Portionen:** Teller Nudeln ≈ **150 g trocken** (isst 500 g in 2 Tagen),
   **Quark = immer Magerquark** (100 g ≈ 67 kcal, 12 g P), Löffel Pesto ≈ 20 g.
2. kcal/Makros aus Standard-Nährwerten (BLS/USDA-Größenordnung) je Zutat summieren.
3. `protein_quality` = proteingewichteter DIAAS-Mittelwert, **max. 1,0**. Richtwerte: Ei 1,13 · Milch/Quark/Käse ~1,1 · Whey ~1,0 ·
   Rind ~1,1 · Huhn ~1,08 · Schwein ~1,1 · Soja ~0,9 · Erbse ~0,6–0,8 · Linsen ~0,6 · Hafer ~0,55 · Weizen/Nudeln/Brot ~0,45 ·
   Reis ~0,4 · Nüsse ~0,4–0,5 · Gemüse/Sprossen ~0,6. Getreide + Hülsenfrüchte ergänzen sich → ~+0,1.
```sql
insert into meals (meal, description, kcal, protein_g, protein_quality, carbs_g, fat_g, fiber_g, notes)
values ('Mittag', '3 Rühreier mit Brot', 520, 27, 0.85, 30, 30, 3, '3 Eier (19 g P, DIAAS 1), 2 Scheiben Brot (8 g P, ~0,45)');
insert into drink_log (kind, ml) values ('water_bottle', 1000);
select * from nutrition_daily where day = (now() at time zone 'Europe/Berlin')::date;
```
**🚶 Gehen nach dem Essen** (Joshua will das trainieren, am liebsten mit Pouchi): pro Mahlzeit `meals.walk_minutes` (Standard 10).
Sagt er „bin nach dem Essen gegangen“ → bei der passenden Hauptmahlzeit setzen (Dauer, falls genannt); in der App per 🚶 an der
Mahlzeit abhakbar, Karte zeigt „🚶 x/y“ (Mahlzeiten ab 250 kcal). Zählt laut „Querverbindungen“; Kennzahl `post_meal_walks` in
`metric_daily`. Nutzen ehrlich: 10–15 min Gehen nach dem Essen senkt den Blutzuckeranstieg und hilft der Verdauung; „bessere
Nährstoffaufnahme“ ist nicht belegt.
**🌅 Morgenlicht** und **Tageslichtlampe** sind zwei getrennte Routinen (beide täglich); sagt er „Morgenlicht gehabt“ / „Lampe gemacht“ →
die jeweilige heutige Aufgabe als erledigt markieren.

**Verbrauch** (Schätzung, Werte in `nutrition_settings`, bei neuen Messungen aktualisieren): Grundumsatz Katch-McArdle
370 + 21,6 × fettfreie Masse (67,8 kg → 1834 kcal) × Alltags-PAL 1,4 + Aktivitäten laut Tabelle „Querverbindungen“.
**Kalorienziel** = Verbrauch + `nutrition_settings.kcal_surplus`. **Aktuell Muskelaufbau: +300 kcal** (lean bulk ≈ +10 %,
Ziel ≈ 0,25–0,5 kg Zunahme/Monat; bei mehr Fettzunahme senken, Erhalt = 0, Diät negativ). Karte zeigt „noch ~X kcal“ bzw. „Ziel erreicht“.
**Protein-Ziel** 1,8 g/kg = 144 g verwertbar (ISSN 2017: 1,4–2,0 g/kg; in Diät 2,3–3,1 g/kg).
Quellen: ISSN Position Stand 2017 (PMC5477153), DIAAS-Übersicht (PMC6445816).

## Charakter (`character_summary`, `character_stats`, `measurements`)

Sechs Werte: 💪 Körper · 🧠 Intellekt · ✨ Charisma · 🕊️ Spiritualität (`spirit`) · 🎨 Kreativität (`kreativ`) · 🤝 Verbundenheit (`verbunden`).
**Level** = Lebenszeit-XP (fällt nie, Level n ab 30·(n−1)² XP). **Form** = XP der letzten 14 Tage gegen 2× Wochenziel (sinkt bei
Vernachlässigung). Wochenziele (`src/lib/character.ts`): Körper 300 · Intellekt 210 · Charisma 60 · Spiritualität 70 ·
Kreativität 180 · Verbundenheit 180. Trend = 14 Tage vs. 14 davor. XP-Quellen: siehe „Querverbindungen“.

### 🎮 RPG-Schicht (`skills`, `achievements`, `character_meta`) – Joshua will Spielgefühl, Zwischenstufen und „Next Steps“
- **Charakter-LV** aus allen XP (Schritt 90: LV n ab 90·(n−1)²). **Attribut-LV** = Aktivitäts-XP + **Vorgeschichte-XP** aus Skills
  (Stufe 1–5 = 60/240/600/1200/2000 XP, `TIER_XP` in `character.ts`) – Lebenslauf zählt, nichts startet bei null.
  **Ränge** alle 5 Level (z. B. Körper: Rekrut → Kämpfer → Veteran → Champion → Titan → Legende). Level-ups zeigt die Karte als „⬆ LEVEL UP!“.
- **Skills** (`skills`): `tier` 0–5 (Gesperrt · Novize · Lehrling · Fortgeschritten · Experte · Meister), `note` = ehrliche Begründung,
  `next_step` = konkrete Quest zur nächsten Stufe (Karte zeigt täglich eine als „▶ QUEST“). **Claude pflegt das aktiv:** Quest geschafft
  oder neue Info (Messwert, Erfolg, Kurs, Kampf, Umsatz) → `tier` hochsetzen, neue `next_step` setzen, ggf. Erfolg eintragen.
  Nicht schönrechnen. Joshuas Selbsteinschätzung: Kampfsport Intermediate (~10 J., Amateurboxkämpfe; aktuell mehr MMA als Boxen), Schießen Anfänger.
  Beruf: Pflegehelfer/Alltagsbegleiter (30 h/Woche).
- **Erfolge** (`achievements`): `kind='background'` = Lebenslauf (Master Politikwissenschaft, 10 J. Kampfsport, Mitgründer Pluma Media,
  KI-Startup MPU – vorerst gescheitert, Kreuzheben 210), `kind='milestone'` = neue Meilensteine mit `earned_on` (Rekorde, Check-ups,
  gelernte Gedichte, Events …) – bei echten Meilensteinen eintragen.
- **₵ Credits** (`character_meta.credits` 0–100: Pleite/Knapp/Stabil/Polster/Wohlhabend/Frei, `credits_note`, `credits_next`) = Finanzen;
  aktuell 20 „Knapp“. Bei Infos zu Einkommen/Rücklagen anpassen. `class_title` = Klasse unter dem Namen („Kämpfer · Stratege“).
- **Pixel-Avatar** (`PixelAvatar.tsx`): blond, athletisch, **grüner Pulli** (trägt er oft); Ausrüstung = Lebenslauf: **MMA-Handschuhe** (macht aktuell
  eher MMA als Boxen), **Doktorhut mit Quaste** (Master Politikwissenschaft), **Geschirrtuch über der Schulter + Namensschild** (Alltagsbegleiter in der Pflege);
  Leuchtfarbe = stärkster Wert. Neue Lebensabschnitte/Erfolge können als Ausrüstung dazukommen.
- **☯ Balance-Mechanik (Elemente ↔ Spiel):** aus den Element-Minuten der **letzten 7 Tage** (`element_events`):
  **Harmonie** 0–100 (normierte Entropie der vier Anteile, 100 = gleich verteilt). Anteil ≥ 22 % → **Buff**, < 10 % → **Debuff**
  (erst ab 60 min gesamt). Wirkung auf die **Form**: eigenes Element ±15 % auf die verknüpften Werte (🔥 Körper & Kreativität,
  💧 Spiritualität & Verbundenheit, 💨 Intellekt & Charisma), 🌍 Erde = Fundament: alle Werte +5 % / −10 %. Effekt-Namen: Entfacht /
  Glut erlischt · Im Fluss / Ausgetrocknet · Fester Stand / Wackliger Boden · Klarer Kopf / Dicke Luft. Ein Debuff ersetzt die Quest des
  Tages durch eine **Element-Quest**. View **`harmony_weeks`** (pro Kalenderwoche Minuten, `harmony`, `bonus_xp`): abgeschlossene Woche
  ab 300 min und Harmonie ≥ 70 → +50, ≥ 85 → +100 **Harmonie-Bonus-XP** auf das Charakter-Level. Anzeige: Element-Kugeln unter dem
  Avatar, ☯-Leiste auf der Karte, „☯ Balance“-Panel im Charakter (Werte) und im Reiter Elemente. Logik: `balance()`/`formMultiplier()`
  in `character.ts`. Claude erwähnt im Chat aktive Debuffs mit einer konkreten Idee, wenn es passt.
- Ausdauer-Skill vorläufig (Ruhepuls/5 km folgen).
```sql
update skills set tier = 4, note = '…', next_step = '…', updated_at = now() where name = 'Kraft';
insert into achievements (title, description, icon, attribute, kind, earned_on) values ('Schulterdrücken 80 kg', '…', '🏋️', 'koerper', 'milestone', '2026-12-01');
update character_meta set credits = 30, credits_note = '…', credits_next = '…', updated_at = now();
```

**Messwerte ansehen:** Fitness → **📏 Werte** (`src/components/fitness/BodyValues.tsx`): gruppiert (Kraft · Muskelverteilung ·
Ausdauer & Beweglichkeit · Körperzusammensetzung), je Wert letzte Messung + Änderung seit der vorigen (grün = gut, gelb = schlechter,
grau = neutral wie Gewicht), Tipp → Verlauf mit Kurve und allen Messungen; unten **Check-ups vergleichen** (zwei Tage mit Körpergewicht
nebeneinander). Charakter-Detail zeigt nur Kernwerte + Link. Damit Verläufe funktionieren: **immer dieselben `metric`-Namen**
(z. B. „Körpergewicht“, „Körperfett“, „Skelettmuskelmasse“, „Schulterdrücken 1RM“, „Ruhepuls“, „5 km Zeit“) und `measured_on` =
Messdatum. Bessere Richtung „niedriger“ steht in `LOWER_IS_BETTER` (BodyValues.tsx) – neue solche Werte dort ergänzen.
**Check-up-Fotos:** Joshua schickt Fotos/Screenshots (Kieser seca mBCA) → **alle Werte ablesen und in `measurements` eintragen**
(Fotos selbst nicht ablegen). Auch Verlaufsgrafiken auswerten (frühere Messtage, als „aus Grafik abgelesen (± …)“ in `note`).
Check-ups bisher: 31.12.2023 (Papierbericht), 27.07.2026 (nur aus Grafiken), 19.09.2026 (App), 29.10.2026 (App).

**Messwerte** (Joshua schickt Check-ups, Kieser/seca): roh in `measurements`, daraus ehrliche Teilwerte 0–100 in `character_stats`
mit Begründung in `note` (Untrainiert ≈ 15, Anfänger ≈ 30, Fortgeschritten ≈ 50, Erfahren ≈ 70, Sehr stark ≈ 85, Elite ≈ 95+).
Nicht schönrechnen. Stand 29.10.2026: 80,05 kg, 182,3 cm, 15,3 % Fett, Skelettmuskelmasse 34,22 kg, Phasenwinkel 7,0°, TRU 115.
Teilwerte: Muskelmasse, Körperfett, Zellqualität, Rumpf, Arme, Beine, Kraft Unterkörper, Kraft Oberkörper, Beweglichkeit,
Ausdauer (vorläufig – Ruhepuls und 5-km-Zeit liefert Joshua noch nach).
```sql
insert into measurements (metric, value, unit, note) values ('Körpergewicht', 80.1, 'kg', 'Kieser Check-up');
insert into character_stats (attribute, name, rating, note, position) values ('koerper', 'Ausdauer', 70, '…', 10)
on conflict (attribute, name) do update set rating = excluded.rating, note = excluded.note;
```

## Elemente (Reiter „Elemente“, View `element_events`)

🔥 **Feuer** = Antrieb (Training, Rad, Projekte vorantreiben, Erschaffen) · 💧 **Wasser** = Gefühl & Verbindung (Freunde, Familie,
Gebet, Meditation, Natur mit Pouchi, religiöse Lektüre) · 🌍 **Erde** = Basis & Ordnung (Haushalt, Finanzen, Behörden, Routinen,
Schlaf, Detox) · 💨 **Luft** = Geist & Kommunikation (Lesen, Lernen, Recherche, Gespräche, Impro).
Anzeige: Minuten dieser Woche vs. Schnitt der 4 Wochen davor, schwächstes Element mit Ideen, oben das ☯-Balance-Panel (Spielwirkung,
siehe RPG-Schicht). Quellen: siehe „Querverbindungen“.

## Fitness (`exercises`, `workout_templates`, `template_exercises`, `workout_sessions`, `set_logs`)

Split: **A** Schulter & Rücken (2×/Woche) · **B** Brust & Arme (2×/Woche: Curls+Pushdowns als Supersatz · Dips · Overhead Trizepsdrücken (Kabel) · Preacher · Hammer ·
Einarmige Trizeps-Extensions · Butterflies am Ende) · **C** Beine & Bauch (1×/Woche) ·
**D** Sprint (**mindestens 1×/Woche**; Übung `Sprints`, `metric='sprint'`: `seconds` (2 Nachkommastellen) + `meters`) · **E** Unterarme (**bei Bedarf**,
`times_per_week = 0` → wird nie „empfohlen“, zählt aber normal; zuletzt Mi 28.10.2026). Übungen in D/E sind Vorschläge – Joshua passt sie an.
Festgelegt von Joshua:
- **Kein zusätzliches Beintraining vorschlagen** (~80 km Rad pro Woche; Beine kraftmäßig stark: Squat 160, Kreuzheben 210).
- **Kreuzheben** nur Orientierungswert, **nicht** in den Plan (unterer Rücken bereits sehr stark).
- **Trainingsfokus: Schulterdrücken** (Bestwert 60 kg, nächstes Ziel ≈ 80 kg).

**⏱️ Sprint-Timer** (`SprintTimer.tsx`, `src/lib/sprint.ts`; im Training bei „Sprints“): Strecke 30/40/60/100 m. Start entweder
🔊 **Startsignal** (Sprachansage „Auf die Plätze … Fertig“, Piep nach 1–3 s Zufall; Uhr läuft ab Piep, Bewegungssensor misst
Reaktionszeit und erkennt Fehlstart) oder 🏃 **Selbststart** (Uhr startet beim ersten Schritt, Sensor lernt vorher die Ruhe).
Stopp: Tipp irgendwo im Ziel oder automatisch per **GPS** bei der Zielstrecke (zwischen GPS-Punkten interpoliert, ± ein paar
Zehntel; zeigt auch Spitzen-km/h). Jeder gespeicherte Lauf = Satz (`seconds`, `meters`), danach 2:30 Pause-Anzeige.
Fortschritt: Fitness → Fortschritt (beste Zeit pro Woche über die häufigste Strecke) und `metric_daily` „Sprint N m“ (niedriger = besser).
Nennt Joshua Zeiten im Chat: `set_logs` mit `seconds = 8.12, meters = 60` in einer D-Session.

**Laufendes Training** (heute begonnen, nicht abgeschlossen): Fitness-Reiter und Startseiten-Kachel springen direkt hinein;
nach „‹“ bleibt man in der Übersicht (bis zum nächsten Öffnen). „Start“ beim selben Plan öffnet das laufende statt ein zweites.

Pause 120 s (`rest_seconds`); `superset_group` = Supersatz (Timer erst nach der letzten Übung der Gruppe); `optional` = eingeklappt.
`exercises.metric`: `weight_reps` · `weight_distance` (Farmers Walk) · `weight_time`.
```sql
insert into exercises (name) values ('Cable Flys') on conflict (name) do nothing;
insert into template_exercises (template_id, exercise_id, position, target_sets, target_reps)
select t.id, e.id, coalesce((select max(position) from template_exercises where template_id = t.id), 0) + 1, 3, '10-12'
from workout_templates t, exercises e where t.code = 'B' and e.name = 'Cable Flys';
```
Übungen nie aus `exercises` löschen, wenn es `set_logs` gibt. Normalerweise loggt Joshua selbst; bei „heute wie letztes Mal“:
```sql
with last as (
  select s.id from workout_sessions s join workout_templates t on t.id = s.template_id
  where t.code = 'A' order by s.session_date desc, s.started_at desc limit 1
), new_session as (
  insert into workout_sessions (template_id, session_date, finished_at, notes)
  select id, (now() at time zone 'Europe/Berlin')::date, now(), 'Wie letztes Mal (via Claude)'
  from workout_templates where code = 'A' returning id
)
insert into set_logs (session_id, exercise_id, set_number, weight, reps, seconds, meters)
select n.id, l.exercise_id, l.set_number, l.weight, l.reps, l.seconds, l.meters
from set_logs l, new_session n where l.session_id = (select id from last);
```
Abweichungen danach per `update set_logs …`. Fortschritt: Fitness → Fortschritt (Top-Satz & e1RM pro Woche).

## Nicht mehr verwendet
Habits (`habits`, `habit_logs`) – Joshua trackt Habits in anderen Apps; Tabellen existieren noch (`active = false`), keine Anzeige.

## Zugang
Login per E-Mail + Passwort. Neue Konten sehen nichts, bis ihre `user_id` in `allowed_users` steht:
```sql
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = '…';
insert into allowed_users (user_id) select id from auth.users where email = '…';
```

## Entwicklung
- `npm install`, `npm run dev`, `npm run build` (Typecheck + Build). Env in `.env.production` (nur URL + öffentlicher Key, Schutz über RLS).
- **Supabase-Queries sind lazy**: ohne `await`/`.then` wird nichts gesendet. Fire-and-forget immer mit `fire(query)` aus
  `src/lib/supabase.ts`, nie `void supabase.from(...)`.
- Reine Logik (testbar ohne Supabase): `src/lib/schedule.ts` (Tagesplan), `src/lib/interval.ts` (Timer-Phasen),
  `src/lib/character.ts` (Level/Form), `src/lib/speech.ts` (Diktat-Parsing).
- Neue Spalten an `tasks` müssen auch an den View `tasks_planned` **angehängt** werden (Spalten nur am Ende ergänzbar).
- Neue Aktivitätsquellen in **allen drei Views** berücksichtigen: `xp_events`, `element_events`, `nutrition_daily` – und die
  Tabelle „Querverbindungen“ hier aktualisieren.
