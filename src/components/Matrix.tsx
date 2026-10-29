import { useState } from "react";
import { DndContext, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { deleteTask, updateTask, useTasks } from "../lib/data";
import { supabase } from "../lib/supabase";
import { QUADRANTS, type Quadrant, type Task } from "../lib/types";
import AddTask from "./AddTask";
import TaskCard from "./TaskCard";

function Zone({ id, children, className }: { id: Quadrant; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isOver ? "ring-2 ring-slate-300" : ""}`}>
      {children}
    </div>
  );
}

export function useTaskActions(tasks: Task[], setTasks: (t: Task[]) => void) {
  const [undo, setUndo] = useState<Task | null>(null);

  const patch = (id: string, p: Partial<Task>) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)));

  return {
    undo,
    onDone: (t: Task) => {
      patch(t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });
      void updateTask(t.id, { done: !t.done });
    },
    onMove: (t: Task, q: Quadrant) => {
      patch(t.id, { quadrant: q, position: Date.now() / 1000 });
      void updateTask(t.id, { quadrant: q, position: Date.now() / 1000 });
    },
    onRename: (t: Task, title: string) => {
      patch(t.id, { title });
      void updateTask(t.id, { title });
    },
    onDelete: (t: Task) => {
      setTasks(tasks.filter((x) => x.id !== t.id));
      setUndo(t);
      void deleteTask(t.id);
      setTimeout(() => setUndo((u) => (u?.id === t.id ? null : u)), 5000);
    },
    restore: async () => {
      if (!undo) return;
      const { id, title, notes, quadrant, position, due_date, done, done_at, source, created_at } = undo;
      setUndo(null);
      await supabase.from("tasks").insert({ id, title, notes, quadrant, position, due_date, done, done_at, source, created_at });
    },
  };
}

export function UndoToast({ task, onUndo }: { task: Task | null; onUndo: () => void }) {
  if (!task) return null;
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl bg-slate-800 px-4 py-2 text-sm shadow-xl">
        „{task.title.slice(0, 30)}“ gelöscht
        <button className="font-semibold text-sky-400" onClick={onUndo}>
          Rückgängig
        </button>
      </div>
    </div>
  );
}

export default function Matrix() {
  const { data: tasks, setData: setTasks } = useTasks();
  const actions = useTaskActions(tasks, setTasks);
  const [showDone, setShowDone] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const inbox = open.filter((t) => t.quadrant === "inbox");

  function onDragEnd(e: DragEndEvent) {
    const task = tasks.find((t) => t.id === e.active.id);
    const q = e.over?.id as Quadrant | undefined;
    if (task && q && q !== task.quadrant) actions.onMove(task, q);
  }

  const card = (t: Task) => <TaskCard key={t.id} task={t} {...actions} />;

  return (
    <div className="flex flex-col gap-3 pt-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Eisenhower-Matrix</h1>
        <span className="text-xs text-slate-500">{open.length} offen</span>
      </header>
      <AddTask />
      <p className="text-[11px] text-slate-500">→ wischen: erledigt · ← wischen: löschen · gedrückt halten & ziehen: verschieben · tippen: Details</p>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {inbox.length > 0 && (
          <Zone id="inbox" className="card border-dashed p-3">
            <h2 className="mb-2 text-sm font-semibold text-violet-300">Inbox · einsortieren</h2>
            <div className="flex flex-col gap-1.5">{inbox.map(card)}</div>
          </Zone>
        )}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {(Object.keys(QUADRANTS) as (keyof typeof QUADRANTS)[]).map((q) => {
            const items = open.filter((t) => t.quadrant === q);
            return (
              <Zone key={q} id={q} className={`card min-h-[9rem] border p-2 sm:p-3 ${QUADRANTS[q].ring}`}>
                <h2 className={`text-sm font-semibold ${QUADRANTS[q].color}`}>{QUADRANTS[q].label}</h2>
                <p className="mb-2 text-[10px] text-slate-500">{QUADRANTS[q].hint}</p>
                <div className="flex flex-col gap-1.5">{items.map(card)}</div>
              </Zone>
            );
          })}
        </div>
      </DndContext>

      {done.length > 0 && (
        <div>
          <button className="text-sm text-slate-500" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "▾" : "▸"} Erledigt (letzte 7 Tage): {done.length}
          </button>
          {showDone && <div className="mt-2 flex flex-col gap-1.5">{done.map((t) => <TaskCard key={t.id} task={t} {...actions} draggable={false} />)}</div>}
        </div>
      )}
      <UndoToast task={actions.undo} onUndo={actions.restore} />
    </div>
  );
}

