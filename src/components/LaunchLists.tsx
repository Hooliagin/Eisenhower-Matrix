import { useState } from "react";
import { logCommuteToWork, setCheck, useLaunchLists, type LaunchList } from "../lib/data";
import { SOUNDS } from "../lib/sound";
import { toast } from "./Rewards";
import Icon from "./ui/Icon";
import { ask } from "./ui/Sheet";

const LOOK = {
  work: { icon: "🚲", verb: "Zur Arbeit", color: "#a78bfa" },
  sport: { icon: "🏋️", verb: "Zum Sport", color: "#f87171" },
} as const;

/** Two buttons at the top of the start page: tap, tick the things you need, go. Ticking everything on the work list logs the bike ride. */
export default function LaunchLists() {
  const { data: lists, setData } = useLaunchLists();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!lists.length) return null;
  const open = lists.find((l) => l.id === openId) ?? null;

  async function toggle(list: LaunchList, itemId: string) {
    const item = list.items.find((i) => i.id === itemId)!;
    const on = !item.checked;
    setData((prev) => prev.map((l) => (l.id === list.id ? { ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, checked: on } : i)) } : l)));
    navigator.vibrate?.(8);
    try {
      await setCheck(itemId, on);
    } catch (e) {
      void ask.show("Abhaken hat nicht geklappt", e instanceof Error ? e.message : String(e));
      return;
    }
    const complete = on && list.items.every((i) => (i.id === itemId ? true : i.checked));
    if (!complete) return;
    SOUNDS.complete();
    if (list.kind === "work") {
      try {
        const r = await logCommuteToWork();
        toast({ icon: "🚲", title: "Los geht's – ab zur Arbeit", sub: r === "already" ? "Radfahrt war schon eingetragen" : "Radfahrt (26 km) eingetragen", color: LOOK.work.color });
      } catch {
        toast({ icon: "🚲", title: "Alles dabei", sub: "Radfahrt konnte nicht eingetragen werden", color: LOOK.work.color });
      }
    } else {
      toast({ icon: "🏋️", title: "Alles dabei – viel Spaß beim Training", color: LOOK.sport.color });
    }
    setTimeout(() => setOpenId(null), 700);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {lists.map((l) => {
          const look = LOOK[l.kind];
          const done = l.items.filter((i) => i.checked).length;
          const all = l.items.length > 0 && done === l.items.length;
          return (
            <button
              key={l.id}
              onClick={() => setOpenId(l.id)}
              className={`card flex items-center gap-2.5 p-3 text-left transition active:scale-[0.97] ${all ? "border-emerald-400/40 bg-emerald-500/10" : ""}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: `${look.color}26` }}>
                {all ? "✓" : look.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{look.verb}</span>
                <span className={`block text-[11px] ${all ? "text-emerald-300" : "text-slate-500"}`}>{all ? "alles dabei" : done ? `${done}/${l.items.length} eingepackt` : "Abfahrt-Checkliste"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]" onClick={() => setOpenId(null)} />
          <div className="relative w-full max-w-md animate-sheet rounded-t-3xl border border-b-0 border-white/10 bg-slate-900 p-4 shadow-lift" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">
                {LOOK[open.kind].icon} {open.title}
              </h2>
              <button className="btn-ghost h-9 w-9 p-0" onClick={() => setOpenId(null)} aria-label="Schließen">
                <Icon name="close" size={16} />
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {open.items.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => void toggle(open, i.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition active:scale-[0.98] ${i.checked ? "bg-emerald-500/10" : "bg-white/[0.06]"}`}
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs transition ${i.checked ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-500"}`}>{i.checked && "✓"}</span>
                    <span className={`text-[15px] ${i.checked ? "text-slate-500 line-through" : ""}`}>{i.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            {open.kind === "work" && <p className="mt-3 text-[11px] text-slate-500">Sobald alles abgehakt ist, trägt die App die Radfahrt zum Dienst für heute ein (26 km hin und zurück).</p>}
          </div>
        </div>
      )}
    </>
  );
}
