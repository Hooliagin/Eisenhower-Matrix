import { useEffect, useState } from "react";
import { suggestTemplate, useSessions, useTemplates } from "../../lib/data";
import { formatLong, isoDate, parseDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import Plan from "./Plan";
import Progress from "./Progress";
import SessionView from "./SessionView";

type View = { kind: "home" } | { kind: "session"; id: string } | { kind: "progress" } | { kind: "plan" };

function readView(): View {
  const [, kind, id] = location.hash.replace("#", "").split("/");
  if (kind === "session" && id) return { kind: "session", id };
  if (kind === "progress") return { kind: "progress" };
  if (kind === "plan") return { kind: "plan" };
  return { kind: "home" };
}

export default function Fitness() {
  const [view, setView] = useState<View>(readView);
  const { data: templates } = useTemplates();
  const { data: sessions, refresh } = useSessions();

  useEffect(() => {
    const on = () => setView(readView());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const nav = (v: View) => {
    location.hash = v.kind === "home" ? "fitness" : v.kind === "session" ? `fitness/session/${v.id}` : `fitness/${v.kind}`;
  };

  async function start(templateId: string) {
    const { data, error } = await supabase.from("workout_sessions").insert({ template_id: templateId, session_date: isoDate() }).select().single();
    if (error) return alert(error.message);
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    await refresh();
    nav({ kind: "session", id: data.id });
  }

  if (view.kind === "session") return <SessionView id={view.id} templates={templates} back={() => nav({ kind: "home" })} />;
  if (view.kind === "progress") return <Progress back={() => nav({ kind: "home" })} />;
  if (view.kind === "plan") return <Plan templates={templates} back={() => nav({ kind: "home" })} />;

  const { next, weekly } = suggestTemplate(templates, sessions);
  const active = sessions.find((s) => !s.finished_at);
  const tName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? "Training";

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fitness</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => nav({ kind: "plan" })}>Plan</button>
          <button className="btn-ghost" onClick={() => nav({ kind: "progress" })}>Fortschritt</button>
        </div>
      </header>

      {active && (
        <button className="card border-emerald-600 bg-emerald-600/15 p-4 text-left" onClick={() => nav({ kind: "session", id: active.id })}>
          <div className="text-xs text-emerald-300">Läuft gerade</div>
          <div className="text-lg font-semibold">{tName(active.template_id)} fortsetzen →</div>
        </button>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Diese Woche</h2>
        {weekly.map(({ t, thisWeek }) => {
          const isNext = next?.id === t.id;
          return (
            <div key={t.id} className={`card flex items-center gap-3 p-3 ${isNext ? "border-slate-400" : ""}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold">{t.code}</div>
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-slate-500">
                  {t.template_exercises.filter((e) => !e.optional).length} Übungen · {thisWeek}/{t.times_per_week} diese Woche
                  {isNext && <span className="ml-1 text-sky-400">· empfohlen</span>}
                </div>
              </div>
              <button className={isNext ? "btn-primary" : "btn-ghost"} onClick={() => start(t.id)} disabled={!!active}>
                Start
              </button>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Verlauf</h2>
        <div className="flex flex-col gap-1">
          {sessions.slice(0, 20).map((s) => (
            <button key={s.id} onClick={() => nav({ kind: "session", id: s.id })} className="flex justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-900">
              <span>{tName(s.template_id)}</span>
              <span className="text-slate-500">{formatLong(parseDate(s.session_date))}{!s.finished_at && " · offen"}</span>
            </button>
          ))}
          {!sessions.length && <p className="text-sm text-slate-500">Noch keine Trainings geloggt.</p>}
        </div>
      </section>
    </div>
  );
}
