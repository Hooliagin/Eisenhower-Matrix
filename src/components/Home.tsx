import { useEffect, useState, type ReactNode } from "react";
import { isDue, minutesThisWeek, suggestTemplate, useBooks, useCalendar, useProjects, useSessions, useShopping, useTasks, useTemplates } from "../lib/data";
import { addDays, formatLong, isoDate, parseDate } from "../lib/dates";
import { buildSchedule, fmtMinutes, hhmm, todayTasks } from "../lib/schedule";
import { supabase } from "../lib/supabase";
import AddTask from "./AddTask";
import { CharacterCard, CharacterView } from "./Character";
import DetoxCard from "./DetoxCard";
import NutritionCard from "./NutritionCard";
import QuickHabits from "./QuickHabits";
import { countdown } from "./Calendar";

function Tile({ icon, title, onClick, children, wide }: { icon: string; title: string; onClick: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <button onClick={onClick} className={`card flex flex-col gap-1 p-3 text-left active:scale-[0.98] ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {icon} {title}
      </span>
      {children}
    </button>
  );
}

export default function Home() {
  const { data: tasks, setData: setTasks } = useTasks();
  const calendar = useCalendar(isoDate(addDays(new Date(), -31)));
  const { data: shopping } = useShopping();
  const { data: proj } = useProjects();
  const { data: templates } = useTemplates();
  const { data: sessions } = useSessions();
  const { data: reading } = useBooks();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = isoDate(now);
  const plan = todayTasks(tasks, today);
  const slots = buildSchedule(plan, now);
  const current = slots[0];
  const end = slots[slots.length - 1]?.end;
  const doneToday = tasks.filter((t) => t.done && t.done_at && isoDate(new Date(t.done_at)) === today).length;

  const upcoming = [
    ...calendar.data.events.filter((e) => e.event_date >= today).map((e) => ({ date: e.event_date, label: e.title, time: e.start_time, deadline: false })),
    ...calendar.data.deadlines.filter((t) => !t.done && t.due_date! > today).map((t) => ({ date: t.due_date!, label: t.title, time: null, deadline: true })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .slice(0, 2);

  const dueFollowups = proj.followups.filter((f) => isDue(f, today));
  const nextFollowup = proj.followups
    .filter((f) => f.status !== "done" && f.follow_up_on && f.follow_up_on > today)
    .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!))[0];
  const openShopping = shopping.filter((i) => !i.done);
  const { next: nextWorkout, weekly } = suggestTemplate(templates, sessions);
  const trainedToday = sessions.find((s) => s.session_date === today);

  const readMin = minutesThisWeek(reading.log);
  const currentBooks = reading.books.filter((b) => b.status === "reading");
  const readingProject = proj.projects.find((p) => p.kind === "books");

  const go = (hash: string) => (location.hash = hash);
  const [sub, setSub] = useState(() => location.hash.replace("#", "").split("/")[1]);
  useEffect(() => {
    const on = () => setSub(location.hash.replace("#", "").split("/")[1]);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const hour = now.getHours();
  const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Hi" : "Guten Abend";

  if (sub === "character") return <CharacterView />;

  return (
    <div className="flex flex-col gap-3 pt-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{formatLong(now)}</p>
          <h1 className="text-2xl font-semibold">{greeting} 👋</h1>
        </div>
        <button className="text-xs text-slate-600" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </header>

      <CharacterCard />

      <DetoxCard />

      <QuickHabits tasks={tasks} patch={(id, p) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)))} />

      <AddTask defaultQuadrant="do" compact />

      <div className="grid grid-cols-2 gap-2">
        <Tile icon="☀️" title={`Heute · ${plan.length} offen`} onClick={() => go("tasks/plan")} wide>
          {current ? (
            <>
              <span className="text-base font-medium leading-snug">
                {current.running ? "Läuft: " : "Jetzt: "}
                {current.task.title}
              </span>
              <span className="text-xs text-slate-400">
                bis {hhmm(current.end)}
                {slots[1] && <> · danach {slots[1].task.title}</>}
              </span>
              <span className="text-xs text-slate-500">
                fertig ca. {end && hhmm(end)}
                {doneToday > 0 && <span className="text-emerald-400"> · ✓ {doneToday} erledigt</span>}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-400">Nichts mehr geplant 🎉{doneToday > 0 && ` · ✓ ${doneToday} erledigt`}</span>
          )}
        </Tile>

        <Tile icon="👥" title="Leute" onClick={() => go("projects")}>
          {dueFollowups.length ? (
            <>
              <span className="text-lg font-semibold text-amber-300">{dueFollowups.length} fällig</span>
              <span className="truncate text-xs text-slate-400">{dueFollowups.map((f) => f.person).join(", ")}</span>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-300">Alles im Griff</span>
              {nextFollowup && <span className="truncate text-xs text-slate-500">{nextFollowup.person} {countdown(nextFollowup.follow_up_on!)}</span>}
            </>
          )}
        </Tile>

        <Tile icon="📅" title="Kalender" onClick={() => go("calendar")}>
          {upcoming.length ? (
            upcoming.map((u) => (
              <span key={u.label + u.date} className="truncate text-xs">
                <span className={u.deadline ? "text-red-300" : "text-sky-300"}>{countdown(u.date)}</span>{" "}
                <span className="text-slate-300">{u.label}</span>
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">Nichts Anstehendes</span>
          )}
        </Tile>

        <Tile icon="🛒" title="Einkauf" onClick={() => go("tasks/shopping")}>
          <span className="text-lg font-semibold">{openShopping.length || "–"}</span>
          <span className="truncate text-xs text-slate-500">{openShopping.length ? openShopping.map((i) => i.name).join(", ") : "Liste leer"}</span>
        </Tile>

        <Tile icon="🏋️" title="Training" onClick={() => go("fitness")}>
          {trainedToday?.finished_at ? (
            <span className="text-sm text-emerald-400">✓ Heute erledigt</span>
          ) : (
            <span className="truncate text-sm">{trainedToday ? "Läuft gerade" : nextWorkout?.name}</span>
          )}
          <span className="text-xs text-slate-500">{weekly.filter((w) => w.t.times_per_week || w.thisWeek).map((w) => (w.t.times_per_week ? `${w.t.code} ${w.thisWeek}/${w.t.times_per_week}` : `${w.t.code} ${w.thisWeek}×`)).join(" · ")}</span>
        </Tile>

        <Tile icon="📚" title="Lesen" onClick={() => go(readingProject ? `projects/${readingProject.id}` : "projects")}>
          <span className="text-lg font-semibold">{readMin ? fmtMinutes(readMin) : "0 min"}</span>
          <span className="truncate text-xs text-slate-500">
            diese Woche{currentBooks[0] && ` · ${currentBooks[0].title}${currentBooks[0].progress_pct != null ? ` ${currentBooks[0].progress_pct} %` : ""}`}
          </span>
        </Tile>
      </div>

      <NutritionCard />

      <p className="text-center text-[11px] text-slate-600">
        {parseDate(today).toLocaleDateString("de-DE", { day: "numeric", month: "long" })} · alles Weitere in den Reitern unten
      </p>
    </div>
  );
}
