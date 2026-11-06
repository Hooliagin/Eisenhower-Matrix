import { useEffect, useState } from "react";
import { isoDate } from "../lib/dates";
import { fire, supabase } from "../lib/supabase";

interface Checklist {
  id: string;
  title: string;
}
interface Item {
  id: string;
  checklist_id: string;
  text: string;
  position: number;
}

/** Tägliche Abhak-Listen eines Projekts: abgehakte Punkte verschwinden, am nächsten Tag ist die Liste wieder voll. */
export default function Checklists({ projectId }: { projectId: string }) {
  const [lists, setLists] = useState<Checklist[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const today = isoDate();

  async function load() {
    const { data: ls } = await supabase.from("checklists").select("id, title").eq("project_id", projectId).order("position");
    const ids = (ls ?? []).map((l) => l.id);
    setLists((ls ?? []) as Checklist[]);
    if (!ids.length) return setItems([]);
    const { data: its } = await supabase.from("checklist_items").select("id, checklist_id, text, position").in("checklist_id", ids).eq("active", true).order("position");
    const itemIds = (its ?? []).map((i) => i.id);
    const { data: cs } = itemIds.length
      ? await supabase.from("checklist_checks").select("item_id").eq("checked_on", today).in("item_id", itemIds)
      : { data: [] };
    setItems((its ?? []) as Item[]);
    setChecked(new Set((cs ?? []).map((c) => c.item_id as string)));
  }

  useEffect(() => {
    void load();
    const onFocus = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onFocus);
    const ch = supabase.channel(`checklists-${projectId}-${Math.random().toString(36).slice(2)}`);
    ["checklists", "checklist_items", "checklist_checks"].forEach((table) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => void load()),
    );
    ch.subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, today]);

  if (!lists.length) return null;
  return (
    <>
      {lists.map((l) => (
        <ChecklistCard
          key={l.id}
          list={l}
          items={items.filter((i) => i.checklist_id === l.id)}
          checked={checked}
          onCheck={(id, on) => {
            setChecked((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            });
            fire(
              on
                ? supabase.from("checklist_checks").upsert({ item_id: id, checked_on: today }, { onConflict: "item_id,checked_on" })
                : supabase.from("checklist_checks").delete().eq("item_id", id).eq("checked_on", today),
            );
          }}
          onAdd={async (text) => {
            const pos = Math.max(0, ...items.filter((i) => i.checklist_id === l.id).map((i) => i.position)) + 1;
            await supabase.from("checklist_items").insert({ checklist_id: l.id, text, position: pos });
            void load();
          }}
        />
      ))}
    </>
  );
}

function ChecklistCard({
  list,
  items,
  checked,
  onCheck,
  onAdd,
}: {
  list: Checklist;
  items: Item[];
  checked: Set<string>;
  onCheck: (id: string, on: boolean) => void;
  onAdd: (text: string) => Promise<void>;
}) {
  const [last, setLast] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [text, setText] = useState("");
  const open = items.filter((i) => !checked.has(i.id));
  const done = items.filter((i) => checked.has(i.id));
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;

  function check(id: string) {
    onCheck(id, true);
    setLast((l) => [...l, id]);
  }
  function undo() {
    const id = last[last.length - 1];
    if (!id) return;
    onCheck(id, false);
    setLast((l) => l.slice(0, -1));
  }

  return (
    <section className="card flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">📋 {list.title}</h2>
        <span className="text-xs text-slate-400">
          heute {done.length}/{items.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {open.length === 0 ? (
        <p className="rounded-lg bg-emerald-900/30 p-3 text-center text-sm text-emerald-200">✅ Alles erledigt – schönen Feierabend 😊</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {open.map((i) => (
            <li key={i.id}>
              <button
                className="flex w-full items-start gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2.5 text-left text-sm active:bg-emerald-900/40"
                onClick={() => check(i.id)}
              >
                <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-slate-500" />
                <span>{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs">
        {done.length > 0 ? (
          <button className="text-slate-500" onClick={() => setShowDone(!showDone)}>
            {showDone ? "▾" : "▸"} Erledigt: {done.length}
          </button>
        ) : (
          <span className="text-[11px] text-slate-600">Abgehakt verschwindet – morgen ist die Liste wieder voll.</span>
        )}
        {last.length > 0 && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={undo}>
            ↶ Rückgängig
          </button>
        )}
      </div>
      {showDone && (
        <ul className="flex flex-col gap-1">
          {done.map((i) => (
            <li key={i.id}>
              <button className="w-full text-left text-xs text-slate-500 line-through" onClick={() => onCheck(i.id, false)} title="Wieder offen">
                ✓ {i.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 py-1.5 text-sm"
          placeholder="Punkt hinzufügen…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && void onAdd(text.trim()).then(() => setText(""))}
        />
        <button className="btn-ghost" onClick={() => text.trim() && void onAdd(text.trim()).then(() => setText(""))}>
          +
        </button>
      </div>
    </section>
  );
}
