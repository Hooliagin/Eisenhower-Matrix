import { useState } from "react";
import { useShopping } from "../lib/data";
import { supabase } from "../lib/supabase";
import type { ShoppingItem } from "../lib/types";

export default function ShoppingList() {
  const { data: items, setData, refresh } = useShopping();
  const [name, setName] = useState("");
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    await supabase.from("shopping_items").insert({ name: n, position: Date.now() / 1000 });
    void refresh();
  }

  function toggle(item: ShoppingItem) {
    setData(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    void supabase.from("shopping_items").update({ done: !item.done }).eq("id", item.id);
  }

  async function clearDone() {
    setData(open);
    await supabase.from("shopping_items").delete().eq("done", true);
  }

  return (
    <section className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">🛒 Einkaufsliste · {open.length}</h2>
        {done.length > 0 && (
          <button className="text-xs text-slate-500" onClick={clearDone}>
            Erledigte entfernen
          </button>
        )}
      </div>
      <ul className="flex flex-col">
        {[...open, ...done].map((i) => (
          <li key={i.id}>
            <button onClick={() => toggle(i)} className="flex w-full items-center gap-3 py-1.5 text-left text-sm">
              <span className={`h-4 w-4 shrink-0 rounded border ${i.done ? "border-emerald-500 bg-emerald-500" : "border-slate-500"}`} />
              <span className={i.done ? "text-slate-500 line-through" : ""}>{i.name}</span>
            </button>
          </li>
        ))}
        {!items.length && <li className="text-sm text-slate-500">Liste ist leer.</li>}
      </ul>
      <div className="mt-2 flex gap-2">
        <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Artikel hinzufügen…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn-ghost" onClick={add}>+</button>
      </div>
    </section>
  );
}
