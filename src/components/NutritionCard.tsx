import { useState } from "react";
import { addDrink, removeLastDrink, useNutrition, type DrinkKind } from "../lib/data";

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

  if (!n) return null;
  const burn = n.burn_base + n.burn_activity;
  const balance = n.kcal_in - burn;

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

      <button className="flex flex-col gap-1.5 text-left" onClick={() => setShowMeals(!showMeals)}>
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span>
              🔥 <b>{n.kcal_in}</b> <span className="text-slate-500">gegessen · ~{burn} verbraucht</span>
            </span>
            <span className={`text-[10px] ${balance > 300 ? "text-amber-400" : "text-slate-400"}`}>
              {balance > 0 ? `+${balance} kcal über Verbrauch` : `noch ~${-balance} kcal Spielraum`}
            </span>
          </div>
          <Bar value={n.kcal_in} max={burn} color="#f97316" />
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
                <span className="whitespace-nowrap text-slate-400">
                  {m.kcal} kcal · {Math.round(m.protein_g)} g P
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
