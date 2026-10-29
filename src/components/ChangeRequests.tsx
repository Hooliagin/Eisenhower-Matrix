import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface ChangeRequest {
  id: string;
  table_name: string;
  row_id: string;
  action: "update" | "delete";
  patch: Record<string, unknown> | null;
  summary: string;
}

/**
 * Edits Claude prepared for existing entries ("Änderungsvorschläge"). Claude can only add rows without a confirmation,
 * so changes wait here until Joshua taps "Übernehmen" – the app then applies them with his own session.
 */
export default function ChangeRequests() {
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("change_requests").select("id, table_name, row_id, action, patch, summary").eq("status", "pending").order("created_at");
    setItems((data ?? []) as ChangeRequest[]);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`change-requests-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "change_requests" }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, []);

  async function decide(r: ChangeRequest, apply: boolean) {
    if (apply) {
      const q = supabase.from(r.table_name);
      const { error } = r.action === "delete" ? await q.delete().eq("id", r.row_id) : await q.update(r.patch ?? {}).eq("id", r.row_id);
      if (error) return alert(`Konnte nicht übernommen werden: ${error.message}`);
    }
    await supabase.from("change_requests").update({ status: apply ? "applied" : "rejected", decided_at: new Date().toISOString() }).eq("id", r.id);
    setItems((xs) => xs.filter((x) => x.id !== r.id));
  }

  async function applyAll() {
    setBusy(true);
    for (const r of items) await decide(r, true);
    setBusy(false);
  }

  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-sky-700/60 bg-sky-950/40 p-2.5">
      <button className="flex w-full items-center justify-between text-left text-sm" onClick={() => setOpen(!open)}>
        <span>
          ✏️ Claude schlägt <b>{items.length}</b> Änderung{items.length > 1 ? "en" : ""} vor
        </span>
        <span className="text-xs text-sky-300">{open ? "▾" : "ansehen ▸"}</span>
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-2 py-1.5 text-xs">
              <span className="flex-1">
                {r.action === "delete" && <span className="text-red-300">Löschen: </span>}
                {r.summary}
              </span>
              <button className="rounded-md bg-emerald-600 px-2 py-1 text-white" onClick={() => void decide(r, true)} aria-label="Übernehmen">
                ✓
              </button>
              <button className="rounded-md bg-slate-700 px-2 py-1" onClick={() => void decide(r, false)} aria-label="Verwerfen">
                ✕
              </button>
            </li>
          ))}
          {items.length > 1 && (
            <button className="btn-primary mt-1 py-2" disabled={busy} onClick={() => void applyAll()}>
              ✓ Alle übernehmen
            </button>
          )}
        </ul>
      )}
    </section>
  );
}
