import { useEffect, useState } from "react";
import { ask } from "./ui/Sheet";
import { addDrink, removeLastDrink, useNutrition, type DrinkKind, type Meal, type NutritionWeekDay } from "../lib/data";
import { addDays, isoDate, parseDate, WEEKDAY_SHORT, weekStart } from "../lib/dates";
import { CAFFEINE_CUTOFF_HOUR, hydrationNudge } from "../lib/hydration";
import { supabase } from "../lib/supabase";

const DRINKS: { kind: DrinkKind; icon: string; label: string }[] = [
  { kind: "water_glass", icon: "🥛", label: "Glas" },
  { kind: "water_bottle", icon: "🍶", label: "Flasche" },
  { kind: "coffee", icon: "☕", label: "Kaffee" },
];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: color }} />
    </div>
  );
}

const kcalTarget = (d: NutritionWeekDay) => d.burn_base + d.burn_activity + (d.kcal_surplus ?? 0);
const shortDate = (day: string) => {
  const d = parseDate(day);
  return `${WEEKDAY_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}.`;
};

/** Mon–Sun strip: kcal reached (orange bar) and protein goal (✓) per day; tap a day to open it, plus week averages. */
function WeekStrip({ week, day, today, onPick }: { week: NutritionWeekDay[]; day: string; today: string; onPick: (d: string) => void }) {
  if (!week.length) return null;
  const monday = weekStart(parseDate(day));
  const cells = Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)));
  const byDay = new Map(week.map((w) => [w.day, w]));
  const past = week.filter((w) => w.day <= today && w.kcal_in > 0);
  const avg = (f: (w: NutritionWeekDay) => number) => Math.round(past.reduce((s, w) => s + f(w), 0) / Math.max(1, past.length));
  const proteinDays = past.filter((w) => w.protein_effective_g >= w.protein_target_g).length;
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          const w = byDay.get(c);
          const future = c > today;
          const pct = w ? Math.min(1, w.kcal_in / Math.max(1, kcalTarget(w))) : 0;
          return (
            <button
              key={c}
              disabled={future || !w}
              onClick={() => onPick(c)}
              className={`flex flex-col items-center gap-0.5 rounded-md py-1 text-[10px] ${c === day ? "bg-slate-700 text-slate-100" : "text-slate-500"} ${future ? "opacity-30" : ""}`}
            >
              {WEEKDAY_SHORT[i]}
              <span className="flex h-6 w-2.5 items-end overflow-hidden rounded-sm bg-slate-800">
                <span className="w-full rounded-sm bg-orange-500" style={{ height: `${pct * 100}%` }} />
              </span>
              <span className={w && w.protein_effective_g >= w.protein_target_g ? "text-emerald-400" : "text-slate-700"}>●</span>
            </button>
          );
        })}
      </div>
      {past.length > 1 && (
        <p className="text-[10px] text-slate-500">
          Woche Ø {avg((w) => w.kcal_in)} / {avg(kcalTarget)} kcal · Ø {avg((w) => w.protein_effective_g)} g Protein · Protein-Ziel an {proteinDays}/{past.length} Tagen
        </p>
      )}
    </div>
  );
}

/** Drinks with one tap, plus Claude-estimated calories & protein vs. estimated burn. Days can be flipped back (‹ ›). */
export default function NutritionCard() {
  const today = isoDate();
  const [day, setDay] = useState(today);
  const isToday = day === today;
  const { data, setData, refresh } = useNutrition(day);
  useEffect(() => {
    void refresh();
  }, [day, refresh]);
  const oldest = isoDate(addDays(new Date(), -29)); // nutrition_daily keeps 30 days
  const shiftDay = (n: number) => setDay((d) => {
    const next = isoDate(addDays(parseDate(d), n));
    return next > today ? today : next < oldest ? oldest : next;
  });
  const [showMeals, setShowMeals] = useState(false);
  const n = data.today;
  // Re-check the drink reminder every minute while the app is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function add(kind: DrinkKind) {
    const ml = data.sizes[kind];
    if (n)
      setData({
        ...data,
        lastDrinkAt: new Date().toISOString(),
        today: {
          ...n,
          fluid_ml: n.fluid_ml + ml,
          water_ml: n.water_ml + (kind === "coffee" ? 0 : ml),
          coffees: n.coffees + (kind === "coffee" ? 1 : 0),
        },
      });
    await addDrink(kind, ml, day);
    void refresh();
  }

  async function undo() {
    await removeLastDrink(day);
    void refresh();
  }

  async function logShift(hours: number) {
    if (n?.shift_event_id) await supabase.from("events").delete().eq("id", n.shift_event_id);
    await supabase
      .from("events")
      .insert({ title: "Dienst", event_date: day, kind: "dienst", shift_hours: hours, ride_km_each_way: 13, source: "app" });
    void refresh();
  }

  async function toggleBike() {
    if (!n?.shift_event_id) return;
    await supabase.from("events").update({ ride_km_each_way: n.shift_by_bike ? null : 13 }).eq("id", n.shift_event_id);
    void refresh();
  }

  async function clearShift() {
    if (!n?.shift_event_id) return;
    await supabase.from("events").delete().eq("id", n.shift_event_id);
    void refresh();
  }

  const [editing, setEditing] = useState<string | null>(null);

  async function toggleWalk(id: string, walked: boolean) {
    await supabase.from("meals").update({ walk_minutes: walked ? null : 10 }).eq("id", id);
    void refresh();
  }

  if (!n) return null;
  const mainMeals = data.meals.filter((m) => m.kcal >= 250);
  const walked = mainMeals.filter((m) => m.walk_minutes).length;
  const burn = n.burn_base + n.burn_activity;
  const surplus = n.kcal_surplus ?? 0;
  const target = burn + surplus;
  const toGo = target - n.kcal_in;
  const afterCutoff = isToday && now.getHours() >= CAFFEINE_CUTOFF_HOUR;
  const nudge = isToday && hydrationNudge(now, data.lastDrinkAt ? new Date(data.lastDrinkAt) : null, n.fluid_ml, n.fluid_target_ml);

  return (
    <section className="card flex flex-col gap-2.5 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <button className="px-1 text-base leading-none text-slate-400 disabled:opacity-30" disabled={day <= oldest} onClick={() => shiftDay(-1)} aria-label="Tag zurück">‹</button>
          🍽️ {isToday ? "Körper heute" : shortDate(day)}
          <button className="px-1 text-base leading-none text-slate-400 disabled:opacity-30" disabled={isToday} onClick={() => shiftDay(1)} aria-label="Tag vor">›</button>
          {!isToday && (
            <button className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 normal-case tracking-normal text-slate-300" onClick={() => setDay(today)}>
              Heute
            </button>
          )}
        </span>
        <button className="text-[10px] text-slate-600" onClick={undo}>letztes Getränk ↶</button>
      </div>
      <WeekStrip week={data.week} day={day} today={today} onPick={setDay} />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="flex items-baseline justify-between text-xs">
            <span>
              💧 <b>{(n.fluid_ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} L</b>
              <span className="text-slate-500"> / {n.fluid_target_ml / 1000} L</span>
            </span>
            <span className="text-[10px] text-slate-500">
              Wasser {(n.water_ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} L · ☕ {n.coffees}
            </span>
          </div>
          <Bar value={n.fluid_ml} max={n.fluid_target_ml} color="#38bdf8" />
          {/* EFSA 2015: up to 400 mg caffeine/day is safe for adults, up to 200 mg at once */}
          <div className="mt-1.5 flex items-baseline justify-between text-xs">
            <span>
              ⚡ <b>~{n.caffeine_mg} mg</b> <span className="text-slate-500">/ 400 mg Koffein</span>
            </span>
            <span className={`text-[10px] ${n.caffeine_mg >= 400 || afterCutoff ? "text-amber-400" : "text-slate-500"}`}>
              {n.caffeine_mg >= 400
                ? "Tagesgrenze erreicht"
                : !isToday
                  ? ""
                  : afterCutoff
                  ? `🌙 ab ${CAFFEINE_CUTOFF_HOUR} Uhr kein Kaffee mehr (Schlaf)`
                  : `noch ~${400 - n.caffeine_mg} mg · letzter bis ${CAFFEINE_CUTOFF_HOUR} Uhr`}
            </span>
          </div>
          <Bar value={n.caffeine_mg} max={400} color={n.caffeine_mg >= 400 ? "#f59e0b" : "#a16207"} />
        </div>
      </div>
      {nudge && (
        <p className={`rounded-lg px-2 py-1.5 text-[11px] ${nudge.level === "urgent" ? "bg-sky-500/25 text-sky-100" : "bg-sky-500/10 text-sky-300"}`}>
          {nudge.text}
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {DRINKS.map((d) => (
          <button key={d.kind} onClick={() => add(d.kind)} className="btn-ghost flex-col gap-0 py-1.5 text-[11px]">
            <span className="text-lg leading-none">{d.icon}</span>+ {d.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-slate-500">👟 Dienst{isToday ? " heute" : ""}:</span>
        {n.shift_hours ? (
          <>
            <span className="rounded-full bg-violet-600/30 px-2 py-0.5 text-violet-200">{Number(n.shift_hours).toLocaleString("de-DE")} h</span>
            <button onClick={toggleBike} className={`rounded-full px-2 py-0.5 ${n.shift_by_bike ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-800 text-slate-500 line-through"}`}>
              🚲 26 km
            </button>
            <button onClick={clearShift} className="ml-auto text-slate-600">✕</button>
          </>
        ) : (
          [6, 12].map((h) => (
            <button key={h} onClick={() => logShift(h)} className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-300">
              + {h} h
            </button>
          ))
        )}
      </div>

      <button className="flex flex-col gap-1.5 text-left" onClick={() => setShowMeals(!showMeals)}>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span>
              🔥 <b>{n.kcal_in}</b> <span className="text-slate-500">/ {target} kcal</span>
            </span>
            <span className={`text-[10px] ${toGo < -300 ? "text-amber-400" : toGo <= 0 ? "text-emerald-400" : "text-slate-400"}`}>
              {toGo > 0 ? `noch ~${toGo} kcal` : toGo >= -300 ? "Ziel erreicht ✓" : `${-toGo} kcal über Ziel`}
            </span>
          </div>
          <Bar value={n.kcal_in} max={target} color="#f97316" />
          <p className="mt-0.5 text-[10px] text-slate-500">
            ~{burn} verbraucht{surplus > 0 ? ` + ${surplus} Aufbau` : surplus < 0 ? ` − ${-surplus} Defizit` : ""}
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span>
              🥩 <b>{Math.round(n.protein_effective_g)} g</b> <span className="text-slate-500">verwertbares Protein / {n.protein_target_g} g</span>
            </span>
            <span className="text-[10px] text-slate-500">roh {Math.round(n.protein_g)} g</span>
          </div>
          <Bar value={n.protein_effective_g} max={n.protein_target_g} color="#f87171" />
        </div>
        {mainMeals.length > 0 && (
          <div className="text-[11px] text-slate-400">
            🚶 Nach dem Essen gegangen: <b className={walked === mainMeals.length ? "text-emerald-400" : "text-slate-200"}>{walked}/{mainMeals.length}</b>
            <span className="text-slate-600"> · antippen zum Abhaken</span>
          </div>
        )}
      </button>

      {showMeals && (
        <ul className="flex flex-col gap-1 border-t border-slate-800 pt-2 text-xs">
          {data.meals.map((m) => (
            <li key={m.id}>
              <div className="flex justify-between gap-2">
                <button className="text-left text-slate-300" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                  {m.meal && <span className="text-slate-500">{m.meal}: </span>}
                  {m.description} <span className="text-slate-600">✎</span>
                </button>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-400">
                  {m.kcal} kcal · {Math.round(m.protein_g)} g P
                  <button
                    onClick={() => void toggleWalk(m.id, !!m.walk_minutes)}
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${m.walk_minutes ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-800 text-slate-500"}`}
                    aria-label="Nach dem Essen gegangen"
                  >
                    🚶{m.walk_minutes ? ` ${m.walk_minutes}′` : ""}
                  </button>
                </span>
              </div>
              {m.notes && <p className="text-[10px] text-slate-600">{m.notes}</p>}
              {editing === m.id && (
                <MealEditor
                  meal={m}
                  onDone={() => {
                    setEditing(null);
                    void refresh();
                  }}
                />
              )}
            </li>
          ))}
          {!data.meals.length && <li className="text-slate-500">Noch nichts eingetragen.</li>}
          <li className="text-[10px] text-slate-600">
            Essen sagst du Claude im Chat – er schätzt Kalorien & Protein. Verbrauch ≈ Grundumsatz × Alltag + Training, Rad, Boxen.
          </li>
        </ul>
      )}
    </section>
  );
}

/** Fix a meal yourself: text, kcal, protein, walk after it – or delete it. */
function MealEditor({ meal, onDone }: { meal: Meal; onDone: () => void }) {
  const [description, setDescription] = useState(meal.description);
  const [kcal, setKcal] = useState(String(meal.kcal));
  const [protein, setProtein] = useState(String(meal.protein_g));
  const [walk, setWalk] = useState(meal.walk_minutes ? String(meal.walk_minutes) : "");
  const num = (v: string) => Number(v.replace(",", "."));

  async function save() {
    const { error } = await supabase
      .from("meals")
      .update({ description, kcal: Math.round(num(kcal)), protein_g: num(protein), walk_minutes: walk ? Math.round(num(walk)) : null })
      .eq("id", meal.id);
    if (error) return void ask.show("Speichern hat nicht geklappt", error.message);
    onDone();
  }

  async function remove() {
    if (!(await ask.confirm(`„${meal.description}“ löschen?`, { ok: "Löschen", danger: true }))) return;
    await supabase.from("meals").delete().eq("id", meal.id);
    onDone();
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-lg bg-slate-950/70 p-2">
      <input value={description} onChange={(e) => setDescription(e.target.value)} className="py-1.5 text-xs" />
      <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-500">
        <label>
          kcal
          <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className="w-full py-1.5 text-xs" />
        </label>
        <label>
          Protein g
          <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} className="w-full py-1.5 text-xs" />
        </label>
        <label>
          🚶 min
          <input inputMode="numeric" value={walk} placeholder="–" onChange={(e) => setWalk(e.target.value)} className="w-full py-1.5 text-xs" />
        </label>
      </div>
      <div className="flex gap-1.5">
        <button className="btn-primary flex-1 py-1.5 text-xs" onClick={() => void save()}>Speichern</button>
        <button className="btn-ghost py-1.5 text-xs" onClick={onDone}>Abbrechen</button>
        <button className="btn bg-red-900/60 py-1.5 text-xs text-red-200" onClick={() => void remove()}>Löschen</button>
      </div>
    </div>
  );
}
