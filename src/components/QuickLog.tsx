import { useState } from "react";
import { addDrink, logReading, logWeight, useBooks, type DrinkKind } from "../lib/data";
import { FavoriteMeals } from "./NutritionCard";
import { toast } from "./Rewards";
import Icon from "./ui/Icon";
import { ask } from "./ui/Sheet";

const DRINKS: { kind: DrinkKind; icon: string; label: string; ml: number }[] = [
  { kind: "water_glass", icon: "🥛", label: "Glas", ml: 250 },
  { kind: "water_bottle", icon: "🍶", label: "Flasche", ml: 1000 },
  { kind: "coffee", icon: "☕", label: "Kaffee", ml: 300 },
];

/**
 * Schnell-Log: everything that should take under five seconds, in one sheet –
 * reading minutes, a drink, a meal he has eaten before, today's weight. Stays open for several entries.
 */
export default function QuickLog({ onClose }: { onClose: () => void }) {
  const { data: reading } = useBooks();
  const current = reading.books.filter((b) => b.status === "reading");
  const [bookId, setBookId] = useState<string | null>(null);
  const book = current.find((b) => b.id === bookId) ?? current[0] ?? null;
  const [busy, setBusy] = useState(false);

  async function run(job: () => Promise<void>, done: () => void) {
    if (busy) return;
    setBusy(true);
    try {
      await job();
      done();
    } catch (e) {
      void ask.show("Eintragen hat nicht geklappt", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const read = (min: number) => run(() => logReading(min, book?.id ?? null), () => undefined); // the XP toast announces it
  const drink = (d: (typeof DRINKS)[number]) => run(() => addDrink(d.kind, d.ml), () => toast({ icon: d.icon, title: `+${d.ml} ml`, sub: d.label, color: "#38bdf8" }));
  async function weight() {
    const kg = await ask.number({ title: "Gewicht heute", text: "Am besten morgens, nach dem Aufstehen.", unit: "kg" });
    if (kg && kg > 30 && kg < 250) void run(() => logWeight(kg), () => toast({ icon: "⚖️", title: `${kg.toLocaleString("de-DE")} kg`, sub: "Gewicht eingetragen", color: "#a78bfa" }));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Schnell-Log">
      <div className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-md animate-sheet flex-col gap-4 overflow-y-auto rounded-t-3xl border border-b-0 border-white/10 bg-slate-900 p-4 shadow-lift" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Schnell eintragen</h2>
          <button className="btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Schließen">
            <Icon name="close" size={16} />
          </button>
        </div>

        <section>
          <p className="label mb-1.5">📚 Gelesen{book ? ` · ${book.title_de ?? book.title}` : ""}</p>
          {current.length > 1 && (
            <div className="mb-1.5 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {current.map((b) => (
                <button key={b.id} onClick={() => setBookId(b.id)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${book?.id === b.id ? "bg-sky-400 text-slate-950" : "bg-white/[0.07] text-slate-300"}`}>
                  {b.title_de ?? b.title}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-6 gap-1.5">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <button key={m} disabled={busy} onClick={() => void read(m)} className="btn bg-white/[0.07] py-2.5 font-pixel text-base text-slate-100">
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Minuten antippen</p>
        </section>

        <section>
          <p className="label mb-1.5">💧 Getrunken</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DRINKS.map((d) => (
              <button key={d.kind} disabled={busy} onClick={() => void drink(d)} className="btn-ghost flex-col gap-0 py-2 text-[11px]">
                <span className="text-xl leading-none">{d.icon}</span>+ {d.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="label mb-1.5">🍽️ Gegessen</p>
          <FavoriteMeals />
          <p className="mt-1 text-[10px] text-slate-500">Neues Essen sagst du weiter Claude im Chat – danach taucht es hier auf.</p>
        </section>

        <button className="btn-ghost justify-start py-3" onClick={() => void weight()}>
          ⚖️ Gewicht eintragen
        </button>
      </div>
    </div>
  );
}
