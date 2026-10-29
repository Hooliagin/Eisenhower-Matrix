import type { Tab } from "../App";
import { suggestTemplate, useSessions, useTasks, useTemplates } from "../lib/data";
import { formatLong, isoDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import AddTask from "./AddTask";
import DayPlan from "./DayPlan";
import { HabitToday, useHabitToggle } from "./Habits";
import ShoppingList from "./ShoppingList";
import { UndoToast, useTaskActions } from "./Matrix";
import TaskCard from "./TaskCard";

export default function Today({ go }: { go: (t: Tab) => void }) {
  const { data: tasks, setData: setTasks } = useTasks();
  const actions = useTaskActions(tasks, setTasks);
  const habits = useHabitToggle();
  const { data: templates } = useTemplates();
  const { data: sessions } = useSessions();

  const today = isoDate();
  const focus = tasks.filter((t) => !t.done && (t.quadrant === "do" || (t.due_date && t.due_date <= today)));
  const planned = tasks.filter((t) => !t.done && t.quadrant === "schedule" && !(t.due_date && t.due_date <= today)).slice(0, 5);
  const inbox = tasks.filter((t) => !t.done && t.quadrant === "inbox");
  const doneToday = tasks.filter((t) => t.done && t.done_at && isoDate(new Date(t.done_at)) === today);
  const { next, weekly } = suggestTemplate(templates, sessions);
  const trainedToday = sessions.find((s) => s.session_date === today);
  const card = (t: (typeof tasks)[number]) => <TaskCard key={t.id} task={t} {...actions} draggable={false} />;


  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{formatLong()}</p>
          <h1 className="text-2xl font-semibold">Dein Tag</h1>
        </div>
        <button className="text-xs text-slate-600" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </header>

      <AddTask defaultQuadrant="do" />

      <DayPlan tasks={focus} doneToday={doneToday} patch={(id, p) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)))} />

      <ShoppingList />

      {inbox.length > 0 && (
        <button onClick={() => go("matrix")} className="card border-dashed px-3 py-2 text-left text-sm text-violet-300">
          📥 {inbox.length} Aufgabe{inbox.length > 1 ? "n" : ""} in der Inbox einsortieren →
        </button>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Habits</h2>
        <HabitToday habits={habits.data.habits} logs={habits.data.logs} onToggle={habits.toggle} />
      </section>

      <section className="card p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Training</h2>
          <div className="flex gap-2 text-xs text-slate-500">
            {weekly.map((w) => (
              <span key={w.t.id} className={w.thisWeek >= w.t.times_per_week ? "text-emerald-400" : ""}>
                {w.t.code} {w.thisWeek}/{w.t.times_per_week}
              </span>
            ))}
          </div>
        </div>
        {trainedToday?.finished_at ? (
          <p className="mt-2 text-sm text-emerald-400">✓ Heute schon trainiert.</p>
        ) : trainedToday ? (
          <button className="btn-primary mt-3 w-full py-3" onClick={() => go("fitness")}>Training fortsetzen →</button>
        ) : next ? (
          <button className="btn-primary mt-3 w-full py-3" onClick={() => go("fitness")}>
            Als Nächstes: {next.name} →
          </button>
        ) : null}
      </section>

      {planned.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-blue-400">Einplanen (wichtig)</h2>
          <div className="flex flex-col gap-1.5">{planned.map(card)}</div>
        </section>
      )}
      <UndoToast task={actions.undo} onUndo={actions.restore} />
    </div>
  );
}
