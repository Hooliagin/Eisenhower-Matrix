import { useCalendar, useTasks } from "../lib/data";
import { addDays, isoDate } from "../lib/dates";
import { todayTasks } from "../lib/schedule";
import AddTask from "./AddTask";
import DayPlan from "./DayPlan";


export default function PlanView({ openMatrix }: { openMatrix: () => void }) {
  const { data: tasks, setData: setTasks } = useTasks();
  const calendar = useCalendar(isoDate(addDays(new Date(), -1)));
  const today = isoDate();
  const inbox = tasks.filter((t) => !t.done && t.quadrant === "inbox");
  const doneToday = tasks.filter((t) => t.done && t.done_at && isoDate(new Date(t.done_at)) === today);

  return (
    <div className="flex flex-col gap-4">
      <AddTask defaultQuadrant="do" />
      {inbox.length > 0 && (
        <button onClick={openMatrix} className="card border-dashed px-3 py-2 text-left text-sm text-violet-300">
          📥 {inbox.length} Aufgabe{inbox.length > 1 ? "n" : ""} in der Inbox einsortieren →
        </button>
      )}
      <DayPlan
        tasks={todayTasks(tasks, today)}
        doneToday={doneToday}
        events={calendar.data.events.filter((e) => e.event_date === today)}
        patch={(id, p) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)))}
      />
    </div>
  );
}
