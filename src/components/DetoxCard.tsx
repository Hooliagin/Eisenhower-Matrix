import { useEffect, useState } from "react";
import { useDetox, type DetoxSession } from "../lib/data";
import { fire, supabase } from "../lib/supabase";

const WINDOWS = {
  morning: { icon: "☀️", label: "Morgen", minutes: 30, rule: "kein Handy, kein Social Media, kein YouTube", ask: "Heute Morgen ohne Handy geschafft?" },
  evening: { icon: "🌙", label: "Abend", minutes: 60, rule: "1 h vor dem Schlafen kein Bildschirm & kein helles Licht", ask: "Gestern Abend ohne Bildschirm geschafft?" },
} as const;

type Kind = keyof typeof WINDOWS;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function Window({ kind, sessions, now, onChange }: { kind: Kind; sessions: DetoxSession[]; now: number; onChange: (s: DetoxSession[]) => void }) {
  const w = WINDOWS[kind];
  const mine = sessions.filter((s) => s.kind === kind);
  const latest = mine[0];
  const endsAt = latest ? new Date(latest.started_at).getTime() + latest.duration_min * 60_000 : 0;
  const running = latest && !latest.result && now < endsAt;
  const pending = latest && !latest.result && now >= endsAt;
  const answered = mine.filter((s) => s.result).slice(0, 7).reverse();
  const wins = answered.filter((s) => s.result === "success").length;

  async function start() {
    const { data } = await supabase.from("detox_sessions").insert({ kind, duration_min: w.minutes, started_at: new Date().toISOString() }).select("id, kind, started_at, duration_min, result").single();
    if (data) onChange([data as DetoxSession, ...sessions]);
  }

  function answer(result: "success" | "fail") {
    if (!latest) return;
    onChange(sessions.map((s) => (s.id === latest.id ? { ...s, result } : s)));
    fire(supabase.from("detox_sessions").update({ result, answered_at: new Date().toISOString() }).eq("id", latest.id));
  }

  return (
    <div className={`flex flex-1 flex-col gap-1.5 rounded-lg p-2 ${running ? "bg-indigo-950/60" : "bg-slate-900"}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">
          {w.icon} {w.label} · {w.minutes} min
        </span>
        {answered.length > 0 && <span className="text-[10px] text-slate-500">{wins}/{answered.length}</span>}
      </div>

      {running ? (
        <>
          <span className="font-mono text-2xl font-semibold tabular-nums">{fmt(endsAt - now)}</span>
          <span className="text-[10px] leading-tight text-slate-400">{w.rule}</span>
          <button className="text-left text-[10px] text-red-400/80" onClick={() => answer("fail")}>
            abbrechen – nicht geschafft
          </button>
        </>
      ) : pending ? (
        <>
          <span className="text-xs leading-tight">{w.ask}</span>
          <div className="flex gap-1.5">
            <button className="btn flex-1 bg-emerald-600 py-1.5 text-xs" onClick={() => answer("success")}>✓ Ja</button>
            <button className="btn flex-1 bg-slate-700 py-1.5 text-xs" onClick={() => answer("fail")}>✗ Nein</button>
          </div>
        </>
      ) : (
        <>
          <span className="text-[10px] leading-tight text-slate-500">{w.rule}</span>
          <button className="btn-ghost py-1.5 text-xs" onClick={start}>▶ Jetzt starten</button>
        </>
      )}

      {answered.length > 0 && (
        <div className="flex gap-1">
          {answered.map((s) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.result === "success" ? "bg-emerald-500" : "bg-red-500/70"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Morning & evening screen-free windows to keep yourself accountable (the app can't lock the phone). */
export default function DetoxCard() {
  const { data, setData } = useDetox();
  const [now, setNow] = useState(Date.now());
  const anyRunning = data.some((s) => !s.result && Date.now() < new Date(s.started_at).getTime() + s.duration_min * 60_000);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), anyRunning ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [anyRunning]);

  // Morning first until noon, evening first afterwards
  const order: Kind[] = new Date(now).getHours() < 12 ? ["morning", "evening"] : ["evening", "morning"];

  return (
    <section className="card flex gap-2 p-2">
      {order.map((k) => (
        <Window key={k} kind={k} sessions={data} now={now} onChange={setData} />
      ))}
    </section>
  );
}
