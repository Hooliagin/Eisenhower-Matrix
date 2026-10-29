import { useRef, useState, type TouchEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { QUADRANTS, type Quadrant, type Task } from "../lib/types";

const SWIPE = 90;

interface Props {
  task: Task;
  onDone: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMove: (t: Task, q: Quadrant) => void;
  onRename: (t: Task, title: string) => void;
  draggable?: boolean;
}

/** Swipe right = erledigt, swipe left = löschen, long-press = ziehen, tap = Details. */
export default function TaskCard({ task, onDone, onDelete, onMove, onRename, draggable = true }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !draggable || task.done });
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const dxRef = useRef(0);
  const moveX = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };

  const touchStart = (e: TouchEvent) => {
    listeners?.onTouchStart?.(e);
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
  };
  const touchMove = (e: TouchEvent) => {
    const s = start.current;
    if (!s || isDragging) return;
    const mx = e.touches[0].clientX - s.x;
    const my = e.touches[0].clientY - s.y;
    if (s.horizontal === null && Math.hypot(mx, my) > 8) s.horizontal = Math.abs(mx) > Math.abs(my);
    if (s.horizontal) moveX(mx);
  };
  const touchEnd = () => {
    if (dxRef.current > SWIPE) onDone(task);
    else if (dxRef.current < -SWIPE) onDelete(task);
    moveX(0);
    start.current = null;
  };

  const hint = dx > 30 ? "bg-emerald-600" : dx < -30 ? "bg-red-600" : "bg-transparent";

  return (
    <div className={`relative overflow-hidden rounded-lg ${hint}`}>
      {dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between px-3 text-sm font-medium">
          <span>✓ Erledigt</span>
          <span>Löschen ✕</span>
        </div>
      )}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onTouchStart={touchStart}
        onTouchMove={touchMove}
        onTouchEnd={touchEnd}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={`relative select-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm transition-[opacity] ${
          isDragging ? "opacity-30" : ""
        } ${dx ? "" : "transition-transform"}`}
      >
        <div className="flex items-start gap-2">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={() => onDone(task)}
            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${task.done ? "border-emerald-500 bg-emerald-500" : "border-slate-500"}`}
            aria-label="erledigt"
          />
          <span
            className={`flex-1 leading-snug ${task.done ? "text-slate-500 line-through" : ""}`}
            onClick={() => setOpen((o) => !o)}
          >
            {task.title}
            {task.source === "claude" && <span className="ml-1 text-[10px] text-violet-400">✦</span>}
          </span>
          {task.due_date && <span className="text-[10px] text-slate-500">{task.due_date.slice(5).split("-").reverse().join(".")}</span>}
        </div>
        {open && (
          <div className="mt-2 flex flex-col gap-2" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && onRename(task, title.trim())}
              className="py-1 text-sm"
            />
            {task.notes && <p className="text-xs text-slate-400">{task.notes}</p>}
            <div className="flex flex-wrap gap-1">
              {(Object.keys(QUADRANTS) as (keyof typeof QUADRANTS)[]).map((q) => (
                <button
                  key={q}
                  disabled={q === task.quadrant}
                  onClick={() => onMove(task, q)}
                  className={`btn-ghost px-2 py-1 text-xs ${QUADRANTS[q].color}`}
                >
                  {QUADRANTS[q].label}
                </button>
              ))}
              <button onClick={() => onDelete(task)} className="btn-ghost px-2 py-1 text-xs text-red-400">
                Löschen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
