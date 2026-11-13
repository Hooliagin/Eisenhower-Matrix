import { useEffect, useState, type ReactNode } from "react";
import ChangeRequests from "./ChangeRequests";
import { isDue, minutesThisWeek, streak, suggestTemplate, updateTask, useActivity, useBooks, useCalendar, useProjects, useSessions, useShopping, useTasks, useTemplates } from "../lib/data";
import { addDays, countdown, formatLong, isoDate } from "../lib/dates";
import { buildSchedule, fmtMinutes, hhmm, minutesOf, todayTasks, type Slot } from "../lib/schedule";
import { supabase } from "../lib/supabase";
import type { Task } from "../lib/types";
import AddTask from "./AddTask";
import { CharacterView } from "./Character";
import { eventBlocks } from "./DayPlan";
import DetoxCard from "./DetoxCard";
import HeroCard from "./HeroCard";
import NutritionCard from "./NutritionCard";
import LaunchLists from "./LaunchLists";
import QuickHabits from "./QuickHabits";
import QuickLog from "./QuickLog";
import WeekReview from "./WeekReview";
import Icon from "./ui/Icon";
import { ask } from "./ui/Sheet";
import { setSfx, sfxEnabled } from "../lib/sound";

function Tile({ icon, title, onClick, children, accent }: { icon: string; title: string; onClick: () => void; children: ReactNode; accent?: string }) {
  return (
    <button onClick={onClick} className="card relative flex min-h-[5.2rem] flex-col gap-1 overflow-hidden p-3 text-left transition duration-150 active:scale-[0.97]">
      {accent && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: accent }} />}
      <span className="label flex items-center gap-1.5">
        <span className="text-sm leading-none">{icon}</span> {title}
      </span>
      {children}
    </button>
  );
}

/** How late a day's plan may realistically run (he sleeps around 1 am, the last hour is screen-free). */
const DAY_END_HOUR = 23.5;

/** The one thing to do now – startable and tickable right here, without opening the plan. */
function FocusCard({ slots, open, doneToday, patch }: { slots: Slot[]; open: number; doneToday: number; patch: (id: string, p: Partial<Task>) => void }) {
  const real = slots.filter((s) => !s.task.id.startsWith("event-"));
  const current = slots[0];
  const now = new Date();
  const dayEnd = new Date(now);
  dayEnd.setHours(Math.floor(DAY_END_HOUR), (DAY_END_HOUR % 1) * 60, 0, 0);
  const fits = real.filter((s) => s.end <= dayEnd).length;
  const later = real.length - fits;
  const go = () => (location.hash = "tasks/plan");

  if (!current)
    return (
      <button className="card flex items-center gap-3 p-4 text-left" onClick={go}>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-xl">🎉</span>
        <span>
          <span className="block font-pixel text-base">Nichts mehr geplant</span>
          <span className="text-xs text-slate-400">{doneToday > 0 ? `Heute ${doneToday} erledigt. Genieß den Rest des Tages.` : "Freier Tag – oder such dir eine Quest aus."}</span>
        </span>
      </button>
    );

  const t = current.task;
  const isEvent = t.id.startsWith("event-");
  const save = (p: Partial<Task>) => {
    patch(t.id, p);
    void updateTask(t.id, p);
  };
  const finish = () => {
    const measured = t.started_at ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60_000) : 0;
    save({ done: true, done_at: new Date().toISOString(), actual_minutes: measured >= 2 ? measured : null, started_at: null });
  };
  const elapsed = current.running ? Math.max(0, Math.round((now.getTime() - current.start.getTime()) / 60_000)) : 0;

  return (
    <section className={`card relative overflow-hidden p-3.5 ${current.running ? "border-emerald-400/40" : ""}`}>
      {current.running && <span className="absolute inset-x-0 top-0 h-0.5 animate-shimmer bg-[linear-gradient(90deg,transparent,#34d399,transparent)] bg-[length:200%_100%]" />}
      <button className="flex w-full items-baseline justify-between text-left" onClick={go}>
        <span className={`label ${current.running ? "text-emerald-300" : ""}`}>{current.running ? `● Läuft seit ${fmtMinutes(elapsed)}` : isEvent ? "Als Nächstes" : "Jetzt dran"}</span>
        <span className="flex items-center gap-0.5 text-[11px] text-slate-500">
          {open} offen <Icon name="chevron" size={12} />
        </span>
      </button>
      <button className="mt-1 block w-full text-left" onClick={go}>
        <span className="block text-[17px] font-semibold leading-snug">{t.title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">
          {hhmm(current.start)}–{hhmm(current.end)} · {fmtMinutes(minutesOf(t))}
          {slots[1] && <span className="text-slate-500"> · danach {slots[1].task.title}</span>}
        </span>
      </button>
      {!isEvent && (
        <div className="mt-3 flex gap-2">
          {current.running ? (
            <button className="btn-ghost px-4 py-2.5" onClick={() => save({ started_at: null })}>
              Stopp
            </button>
          ) : (
            <button className="btn-ghost px-4 py-2.5" onClick={() => (t.timer ? go() : save({ started_at: new Date().toISOString() }))}>
              <Icon name="play" size={16} /> Start
            </button>
          )}
          <button className="btn-gold flex-1 py-2.5 text-[15px]" onClick={finish}>
            <Icon name="check" size={18} strokeWidth={2.6} /> Erledigt
          </button>
        </div>
      )}
      {(later > 0 || doneToday > 0) && (
        <p className="mt-2.5 text-[11px] text-slate-500">
          {doneToday > 0 && <span className="text-emerald-400">✓ {doneToday} heute erledigt</span>}
          {doneToday > 0 && later > 0 && " · "}
          {later > 0 && (
            <>
              heute realistisch noch <b className="text-slate-300">{fits}</b>, {later} {later === 1 ? "passt" : "passen"} nicht mehr rein
            </>
          )}
        </p>
      )}
    </section>
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
  const { data: activity } = useActivity();
  const [now, setNow] = useState(new Date());
  const [menu, setMenu] = useState(false);
  const [review, setReview] = useState(false);
  const [quick, setQuick] = useState(false);
  const [sfx, setSfxState] = useState(sfxEnabled);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = isoDate(now);
  const plan = todayTasks(tasks, today);
  // Timed appointments and shifts are fixed blocks, exactly like in the day plan.
  const slots = buildSchedule(plan, now, calendar.data.events.filter((e) => e.event_date === today && e.start_time).flatMap(eventBlocks));
  const doneToday = tasks.filter((t) => t.done && t.done_at && isoDate(new Date(t.done_at)) === today).length;
  const patch = (id: string, p: Partial<Task>) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)));

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
  const trainedToday = sessions.find((s) => s.session_date === today && !s.finished_at) ?? sessions.find((s) => s.session_date === today);

  const readMin = minutesThisWeek(reading.log);
  const currentBooks = reading.books.filter((b) => b.status === "reading");
  const readingProject = proj.projects.find((p) => p.kind === "books");
  const st = streak(activity, today);

  const go = (hash: string) => (location.hash = hash);
  const [sub, setSub] = useState(() => location.hash.replace("#", "").split("/")[1]);
  useEffect(() => {
    const on = () => setSub(location.hash.replace("#", "").split("/")[1]);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const hour = now.getHours();
  const greeting = hour < 5 ? "Noch wach" : hour < 11 ? "Guten Morgen" : hour < 17 ? "Hey" : hour < 22 ? "Guten Abend" : "Gute Nacht";

  if (sub === "character") return <CharacterView />;

  return (
    <div className="page flex flex-col gap-3 pt-4">
      <header className="relative flex items-center justify-between px-1">
        <div>
          <p className="text-xs text-slate-400">{formatLong(now)}</p>
          <h1 className="text-[26px] font-semibold leading-tight">{greeting}, Joshua</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setReview(true)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 font-pixel text-sm ${st.todayDone ? "bg-orange-500/20 text-orange-200" : st.days ? "bg-white/[0.07] text-slate-300" : "bg-white/[0.05] text-slate-500"}`}
            aria-label={`Serie: ${st.days} Tage`}
          >
            <Icon name="flame" size={16} style={st.todayDone ? { color: "#fb923c", filter: "drop-shadow(0 0 5px rgba(251,146,60,.8))" } : undefined} />
            {st.days}
          </button>
          <button className="btn-gold h-9 w-9 rounded-full p-0 text-xl leading-none" onClick={() => setQuick(true)} aria-label="Schnell eintragen">
            +
          </button>
          <button className="rounded-full bg-white/[0.07] p-2 text-slate-300" onClick={() => setMenu(!menu)} aria-label="Menü">
            <Icon name="more" size={18} />
          </button>
        </div>
        {menu && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} aria-label="Menü schließen" />
            <div className="absolute right-0 top-12 z-50 flex w-52 animate-pop flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-sm shadow-lift">
              <button className="px-4 py-3 text-left active:bg-white/5" onClick={() => (setMenu(false), setReview(true))}>
                📊 Wochenrückblick
              </button>
              <button
                className="border-t border-white/5 px-4 py-3 text-left active:bg-white/5"
                onClick={() => {
                  setSfx(!sfx);
                  setSfxState(!sfx);
                }}
              >
                {sfx ? "🔔 Belohnungs-Töne an" : "🔕 Belohnungs-Töne aus"}
              </button>
              <button className="border-t border-white/5 px-4 py-3 text-left active:bg-white/5" onClick={() => location.reload()}>
                🔄 Neu laden
              </button>
              <button
                className="border-t border-white/5 px-4 py-3 text-left text-red-300 active:bg-white/5"
                onClick={async () => {
                  setMenu(false);
                  if (await ask.confirm("Abmelden?", { text: "Du brauchst danach wieder E-Mail und Passwort.", ok: "Abmelden", danger: true })) void supabase.auth.signOut();
                }}
              >
                Abmelden
              </button>
            </div>
          </>
        )}
      </header>

      <ChangeRequests />
      <HeroCard />

      <LaunchLists />

      <FocusCard slots={slots} open={plan.length} doneToday={doneToday} patch={patch} />

      <QuickHabits tasks={tasks} patch={patch} />

      <DetoxCard />

      <AddTask defaultQuadrant="do" compact />

      <div className="grid grid-cols-2 gap-2">
        <Tile icon="🏋️" title="Training" accent="#f87171" onClick={() => go(trainedToday && !trainedToday.finished_at ? `fitness/session/${trainedToday.id}` : "fitness")}>
          {trainedToday?.finished_at ? (
            <span className="text-sm font-medium text-emerald-400">✓ Heute erledigt</span>
          ) : (
            <span className="truncate text-sm font-medium">{trainedToday ? "▶ Läuft – weiter" : (nextWorkout?.name ?? "–")}</span>
          )}
          <span className="text-[11px] text-slate-500">{weekly.filter((w) => w.t.times_per_week || w.thisWeek).map((w) => (w.t.times_per_week ? `${w.t.code} ${w.thisWeek}/${w.t.times_per_week}` : `${w.t.code} ${w.thisWeek}×`)).join(" · ")}</span>
        </Tile>

        <Tile icon="👥" title="Leute" accent={dueFollowups.length ? "#fbbf24" : undefined} onClick={() => go("projects")}>
          {dueFollowups.length ? (
            <>
              <span className="text-sm font-semibold text-amber-300">{dueFollowups.length} fällig</span>
              <span className="truncate text-[11px] text-slate-400">{dueFollowups.map((f) => f.person).join(", ")}</span>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-300">Alles im Griff</span>
              {nextFollowup && <span className="truncate text-[11px] text-slate-500">{nextFollowup.person} {countdown(nextFollowup.follow_up_on!)}</span>}
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

        <Tile icon="📚" title="Lesen" accent="#38bdf8" onClick={() => go(readingProject ? `projects/${readingProject.id}` : "projects")}>
          <span className="text-sm font-semibold">
            {readMin ? fmtMinutes(readMin) : "0 min"} <span className="text-[11px] font-normal text-slate-500">diese Woche</span>
          </span>
          <span className="truncate text-[11px] text-slate-500">
            {currentBooks[0] ? `${currentBooks[0].title_de ?? currentBooks[0].title}${currentBooks[0].progress_pct != null ? ` · ${currentBooks[0].progress_pct} %` : ""}` : "Kein Buch angefangen"}
          </span>
        </Tile>

        <button onClick={() => go("tasks/shopping")} className="card col-span-2 flex items-center gap-3 p-3 text-left transition active:scale-[0.98]">
          <span className="text-lg">🛒</span>
          <span className="min-w-0 flex-1">
            <span className="label block">Einkauf · {openShopping.length || "leer"}</span>
            <span className="block truncate text-xs text-slate-300">{openShopping.length ? openShopping.map((i) => i.name).join(", ") : "Nichts auf der Liste"}</span>
          </span>
          <Icon name="chevron" size={16} className="text-slate-600" />
        </button>
      </div>

      <NutritionCard />

      {review && <WeekReview onClose={() => setReview(false)} />}
      {quick && <QuickLog onClose={() => setQuick(false)} />}
    </div>
  );
}
