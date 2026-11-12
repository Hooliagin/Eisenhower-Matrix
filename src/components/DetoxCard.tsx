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

  const dots = answered.length > 0 && (
    <div className="flex gap-1">
      {answered.map((s) => (
        <span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.result === "success" ? "bg-emerald-400" : "bg-red-400/70"}`} />
      ))}
    </div>
  );

  // Idle: one quiet row. It only grows while a window is running or waiting for its answer.
  if (!running && !pending)
    return (
      <button className="flex flex-1 flex-col gap-1.5 rounded-xl bg-white/[0.05] px-2.5 py-2 text-left transition active:scale-[0.97]" onClick={start} title={w.rule}>
        <span className="flex items-center justify-between gap-1">
          <span className="whitespace-nowrap text-xs font-medium">
            {w.icon} {w.label} <span className="font-normal text-slate-500">{w.minutes}′</span>
          </span>
          <span className="whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-200">▶ Start</span>
        </span>
        {dots || <span className="text-[10px] leading-tight text-slate-500">{kind === "morning" ? "ohne Handy in den Tag" : "ohne Bildschirm ins Bett"}</span>}
      </button>
    );

  return (
    <div className={`flex flex-1 flex-col gap-1.5 rounded-xl p-2.5 ${running ? "bg-indigo-500/20" : "bg-white/[0.07]"}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">
          {w.icon} {w.label} · {w.minutes} min
        </span>
        {answered.length > 0 && <span className="text-[10px] text-slate-500">{wins}/{answered.length}</span>}
      </div>

      {running ? (
        <>
          <span className="font-pixel text-3xl tabular-nums">{fmt(endsAt - now)}</span>
          <span className="text-[10px] leading-tight text-slate-300">{w.rule}</span>
          <button className="text-left text-[10px] text-red-300/80" onClick={() => answer("fail")}>
            abbrechen – nicht geschafft
          </button>
        </>
      ) : (
        <>
          <span className="text-xs leading-tight">{w.ask}</span>
          <div className="flex gap-1.5">
            <button className="btn flex-1 bg-emerald-500 py-1.5 text-xs text-slate-950" onClick={() => answer("success")}>✓ Ja</button>
            <button className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => answer("fail")}>✗ Nein</button>
          </div>
        </>
      )}
      {dots}
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
    <section className="card flex items-start gap-2 p-2">
      {order.map((k) => (
        <Window key={k} kind={k} sessions={data} now={now} onChange={setData} />
      ))}
    </section>
  );
}
