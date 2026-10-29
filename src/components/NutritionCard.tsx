import { useState } from "react";
import { addDrink, removeLastDrink, useNutrition, type DrinkKind } from "../lib/data";
import { isoDate } from "../lib/dates";
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

/** Drinks with one tap, plus Claude-estimated calories & protein vs. estimated burn. */
export default function NutritionCard() {
  const { data, setData, refresh } = useNutrition();
  const [showMeals, setShowMeals] = useState(false);
  const n = data.today;

  async function add(kind: DrinkKind) {
    const ml = data.sizes[kind];
    if (n)
      setData({
        ...data,
        today: {
          ...n,
          fluid_ml: n.fluid_ml + ml,
          water_ml: n.water_ml + (kind === "coffee" ? 0 : ml),
          coffees: n.coffees + (kind === "coffee" ? 1 : 0),
        },
      });
    await addDrink(kind, ml);
    void refresh();
  }

  async function undo() {
    await removeLastDrink();
    void refresh();
  }

  async function logShift(hours: number) {
    if (n?.shift_event_id) await supabase.from("events").delete().eq("id", n.shift_event_id);
    await supabase
      .from("events")
      .insert({ title: "Dienst", event_date: isoDate(), kind: "dienst", shift_hours: hours, ride_km_each_way: 13, source: "app" });
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

  return (
    <section className="card flex flex-col gap-2.5 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">🍽️ Körper heute</span>
        <button className="text-[10px] text-slate-600" onClick={undo}>letztes Getränk ↶</button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="flex items-baseline justify-between text-xs">
            <span>
              💧 <b>{(n.fluid_ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} L</b>
              <span className="text-slate-500"> / {n.fluid_target_ml / 1000} L</span>
            </span>
            <span className="text-[10px] text-slate-500">
              Wasser {(n.water_ml / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} L · ☕ {n.coffees}
              {n.caffeine_mg >= 400 && <span className="text-amber-400"> · ~{n.caffeine_mg} mg Koffein</span>}
            </span>
          </div>
          <Bar value={n.fluid_ml} max={n.fluid_target_ml} color="#38bdf8" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {DRINKS.map((d) => (
          <button key={d.kind} onClick={() => add(d.kind)} className="btn-ghost flex-col gap-0 py-1.5 text-[11px]">
            <span className="text-lg leading-none">{d.icon}</span>+ {d.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-slate-500">👟 Dienst heute:</span>
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
                <span className="text-slate-300">
                  {m.meal && <span className="text-slate-500">{m.meal}: </span>}
                  {m.description}
                </span>
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
