# Daily Tracker – Analyse & Plan

Stand: 13.11.2026. Dieses Dokument hält fest, **was die Analyse ergeben hat**, **was seitdem umgebaut wurde** und
**was als Nächstes sinnvoll ist** – mit Begründung, Aufwand und Voraussetzungen. Claude liest es zu Beginn größerer
Umbau-Sessions und hakt ab, was erledigt ist.

---

## 1. Was die Analyse ergeben hat

### 1.1 Aus deinen Daten (26.10.–12.11.2026)

| Befund | Zahlen | Folgerung |
|---|---|---|
| **Die Nutzung ist nach gut einer Woche eingebrochen.** | XP pro Tag: 195 → 341 → 302 → 227 → 105 → 173 → 146, dann 14 · 75 · 15 · 13 · 112 · 40 · 0 · 0 · 0 | Die App hat viel gemessen, aber wenig zurückgegeben. Sie braucht Momente, die sich lohnen (Belohnung, sichtbarer Fortschritt) und einen Einstieg, der nach einer Pause nicht wie ein Berg aussieht. |
| **Der Tagesplan ist zur Wand geworden.** | 13 Aufgaben seit bis zu 10 Tagen überfällig, „fertig ca. 03:25 Uhr“ | Ein Plan, der um 20 Uhr noch 8 Stunden Arbeit verspricht, wird ignoriert. Er muss zeigen, was heute realistisch ist, und das Aufräumen leicht machen. |
| **Erfassen ist an einzelnen Stellen zu teuer.** | Essen seit 7.11. nicht mehr eingetragen, Detox-Fenster nur 2×, Lesezeit nur 2× | Alles, was nur über den Chat oder mehrere Tipps geht, schläft ein. Häufiges braucht einen Ein-Tipp-Weg. |
| **Zwei Datenthemen.** | „Overhead Trizepsdrücken“ am 29.10. mit 165 / 165 / 125 gegen 22 kg am 1.11. (vermutlich andere Skala am Gerät) → e1RM 220 kg. Und: Die Sprint-Migration (`…027_sprint_metric`) ist in der Datenbank nicht angekommen – der Constraint erlaubt `sprint` nicht, die Übung steht auf `weight_time`, der Sprint-Timer erscheint im Training nicht. | Beim Loggen fehlt eine Plausibilitätsprüfung; Migrationen nach dem Anwenden gegen die Datenbank prüfen. |

### 1.2 Aus dem Code

| Bereich | Vorher | Problem |
|---|---|---|
| Daten laden | jeder Hook eigener Realtime-Kanal, kein Cache | Jeder Reiterwechsel lud alles neu (kurz leere Seite), Kaltstart ohne Inhalt, ~12 Kanäle auf der Startseite |
| Rückmeldung | XP entstehen in Datenbank-Views | Abhaken fühlte sich nach nichts an – kein „+10 XP“, Level-up nur als Textzeile |
| Avatar | statisches Pixelbild | Die Balance-Mechanik (Buffs/Debuffs) war nur als Zahlen und Kreise sichtbar |
| Dialoge | `prompt()` / `confirm()` / `alert()` des Browsers | Fremdkörper auf dem Handy, Zahlen tippen statt antippen |
| Offline | Manifest, aber kein Service Worker; Schrift von Google | Ohne Netz startete nichts |
| Bundle | alles in einer Datei (620 kB) | langsamer erster Start |
| Fehler | keine Fehlergrenze | ein Absturz in einer Karte = weiße Seite |

---

## 2. Umgesetzt (diese Session)

### Fundament
- [x] **Gemeinsame Datenschicht** (`src/lib/live.ts`): ein Cache für alle Abfragen, sofortige Anzeige aus dem letzten
      Stand (auch nach App-Neustart), Aktualisierung im Hintergrund, **ein** Realtime-Kanal für die ganze App,
      jede Änderung der App aktualisiert alle betroffenen Ansichten sofort (auch ohne Realtime).
- [x] **Offline-Start**: Service Worker (`public/sw.js`), App-Hülle und alle Reiter öffnen ohne Netz mit dem letzten Datenstand.
- [x] **Code-Splitting**: Startseite zuerst, Reiter und 3D-Engine werden nachgeladen und im Hintergrund vorgeholt.
- [x] **Fehlergrenze** pro Reiter, Schrift lokal gebündelt, neue App-Icons (PNG, maskable, Apple-Touch).

### Aussehen & Bedienung
- [x] **Design-System „Nachtlager“**: tiefere Nachtfarben, lesbarere Nebentexte, einheitliche Karten/Knöpfe, eigene Icons
      in der schwebenden Navigation, Einblend-Animationen, animierte Balken.
- [x] **Eigene Dialoge** (`ask.confirm / number / text / show`) statt Browser-Popups – Minuten und Prozente per Antippen.
- [x] **Startseite**: Insel-Karte mit HUD, „Jetzt dran“-Karte (Start/Erledigt direkt), Dailies mit Fortschrittsring,
      kompakte Detox-Zeile, Menü (Wochenrückblick, Töne, Abmelden).

### Spielgefühl
- [x] **3D-Insel** (`src/world/`): Joshua (aus dem Pixel-Sprite extrudiert, mit Gelenken) und Pouchi auf einer
      schwebenden Voxel-Insel. Lagerfeuer = Feuer, Teich mit Wasserfall = Wasser, Baum und Wiese = Erde,
      Windrad und Vögel = Luft – jedes zeigt Anteil, Buff und Debuff der letzten 7 Tage. Himmel und Licht folgen
      dem echten Sonnenstand in Berlin. Drehen per Wisch, Antippen öffnet Charakter, Pouchi oder das Element.
- [x] **Belohnungen** (`Rewards.tsx`): „+10 XP“ mit Ton, die Figur jubelt, Level-up als eigener Moment,
      „Seit deinem letzten Besuch“ nach einer Pause, „Alle Dailies geschafft“.
- [x] **Serie** (Tage in Folge mit ≥ 10 XP) im Kopf der Startseite.

### Mehrwert
- [x] **Wochenrückblick**: XP gesamt und pro Wert gegen Vorwoche und Wochenziel, Elemente mit Harmonie,
      größte Brocken, Training/Ernährung/Rekorde, 16-Wochen-Kalender zum Antippen, ehrliches Fazit.
- [x] **Tagesplan mit Tageskapazität**: zeigt, was bis 23:30 passt; der Rest ist eingeklappt und mit einem Tipp auf morgen verschoben.
- [x] **Aufräumen**: Überfälliges in einer Minute entscheiden (Heute · Morgen · Nächste Woche · Irgendwann · Weglassen).
- [x] Kalender zeigt Routinen nicht mehr als Deadlines.

---

## 3. Als Nächstes

Reihenfolge nach Wirkung pro Aufwand. **A** = klein (1 Session-Teil), **B** = mittel, **C** = groß.

### Phase 2 · Erfassen in einem Tipp (größter Hebel gegen das Einschlafen)
| # | Was | Warum | Aufwand |
|---|---|---|---|
| 2.1 ✅ | **Lieblingsmahlzeiten**: häufige Mahlzeiten (z. B. „500 g Magerquark“) aus der Historie als Ein-Tipp-Knöpfe | Essen wurde nach 12 Tagen nicht mehr eingetragen – Wiederholtes darf keinen Chat brauchen | A |
| 2.2 ✅ | **Schnell-Log** (ein „+“ auf der Startseite): Lesen (Minuten-Chips), Getränk, Gewicht, Mahlzeit | ein Ort für alles, was unter 5 Sekunden dauern soll | A |
| 2.3 ✅ | **Plausibilitätsprüfung beim Satz-Loggen** (Gewicht > 150 % vom letzten Mal → Rückfrage) | verhindert Ausreißer wie die 220 kg | A |
| 2.4 | **Essen per Foto oder Sprachnotiz** über eine Edge Function mit Claude | macht den Umweg über den Chat überflüssig. Braucht einen Anthropic-API-Schlüssel als Supabase-Secret | B |
| 2.5 | **Offline schreiben**: Änderungen ohne Netz in eine Warteschlange, später abgleichen | im Studio-Keller geht dann kein Satz verloren | B |

### Phase 3 · Die App meldet sich (Push)
| # | Was | Voraussetzung | Aufwand |
|---|---|---|---|
| 3.1 | **Web-Push** als installierte App (iOS ab 16.4): Edge Function + `pg_cron` | VAPID-Schlüssel als Secret; einmal „Mitteilungen erlauben“ | B |
| 3.2 | Erinnerungen: Serie in Gefahr (20 Uhr, nur wenn heute < 10 XP), Nachfassen fällig, Abend-Detox, Wochenrückblick sonntags | 3.1 | A |
| 3.3 | Ruhezeiten und Schalter pro Erinnerung in der App | 3.1 | A |

### Phase 4 · Die Insel wächst mit dir
| # | Was | Aufwand |
|---|---|---|
| 4.1 | **Die Welt als Menü**: Feuer antippen → Schattenboxen starten, Teich → Meditation, Baum → Detox/Routinen, Windrad → Lesezeit eintragen | A |
| 4.2 | **Erfolge als Gegenstände** auf der Insel (Boxsack am Baum, Bücherstapel wächst mit Lesezeit, Hantel, Hochzeitsbogen ab Januar 2027) | B |
| 4.3 | **Figur passt sich an**: liest nach Lesezeit, meditiert nach einer Meditation, trägt neue Ausrüstung bei neuen Erfolgen | B |
| 4.4 | **Pouchis Tricks als Animationen** – jeder gelernte Trick wird auf der Insel vorgeführt | B |
| 4.5 | **Jahreszeiten und Wetter** (Schnee im Winter, Regen), Insel bekommt ab bestimmten Leveln neue Bereiche | B–C |
| 4.6 | **Tagesquests**: drei kleine Ziele pro Tag (aus Debuffs, Wochenzielen, Nachfassen) mit Bonus-XP – braucht eine View-Erweiterung in `xp_events` | B |

### Phase 5 · Einsichten, die man ohne App nicht hätte
| # | Was | Hinweis | Aufwand |
|---|---|---|---|
| 5.1 | **Trainings-Coach**: Vorschlag fürs nächste Mal je Übung (obere Wiederholungsgrenze in allen Sätzen erreicht → +2,5 kg), Plateau-Erkennung, Volumen pro Muskelgruppe und Woche | rein aus `set_logs` berechenbar | B |
| 5.2 | **Zusammenhänge** (Detox-Abend ↔ XP am Folgetag, Trainingstage ↔ Trinken, Kaffee ↔ Eintragungen) | ehrlich erst ab ~6–8 Wochen Daten; vorher nur beschreibend | B |
| 5.3 | **Monats- und Jahresrückblick** im Stil des Wochenrückblicks | A |
| 5.4 | **„Warum?“-Karten**: die Begründung hinter Routinen (Morgenlicht, Gehen nach dem Essen, Koffein-Grenze) mit Quelle direkt in der App | Quellen stehen schon in `CLAUDE.md` | A |
| 5.5 | **Lese-Fortschritt als Kurve**, Projekt-Fortschritt (erledigte Einträge pro Woche) | A |

### Phase 6 · Technik im Hintergrund
| # | Was | Aufwand |
|---|---|---|
| 6.1 | Tests (vitest) für `schedule`, `character`, `sky`, `streak`, `live`; GitHub Action mit Typecheck + Build | A |
| 6.2 | Datenbank-Typen aus Supabase generieren statt von Hand pflegen | A |
| 6.3 | Restliche Komponenten auf die gemeinsame Datenschicht umstellen (Pouchi, Checklisten, Training-Session, Messwerte, Änderungsvorschläge) | A–B |
| 6.4 | Datenkorrekturen: Trizeps-Sätze vom 29.10. klären (Einheit?), Sprint-Migration `…027` nachholen (ändert einen Constraint → braucht Joshuas Bestätigung im Supabase-Dialog) | A |
| 6.5 | Matrix auf dem Handy: eine Spalte mit Quadranten-Reitern statt 2 × 2 (lange Titel brechen heute stark um) | A |

---

## 4. Leitlinien für alle weiteren Umbauten

1. **Erst zurückgeben, dann messen.** Jede neue Erfassung braucht eine sichtbare Wirkung (XP, Insel, Rückblick).
2. **Ein Tipp für alles Tägliche.** Was öfter als einmal pro Woche passiert, darf keinen Chat und kein Tippen von Zahlen brauchen.
3. **Nach einer Pause kein Berg.** Überfälliges wird angeboten, nicht aufgetürmt; die Serie rechnet den heutigen Tag erst abends an.
4. **Ehrlich bleiben.** Zahlen nicht schönrechnen, Zusammenhänge nur zeigen, wenn die Daten sie tragen.
5. **Die Startseite bleibt kompakt.** Neues kommt in Reiter, Rückblick oder auf die Insel – nicht als weitere Karte auf „Heute“.
