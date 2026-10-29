import { useEffect, useState } from "react";
import Matrix from "./Matrix";
import PlanView from "./PlanView";
import ShoppingList from "./ShoppingList";

export type Segment = "plan" | "matrix" | "shopping";
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "plan", label: "Tagesplan" },
  { id: "matrix", label: "Matrix" },
  { id: "shopping", label: "Einkauf" },
];

function readSegment(): Segment {
  const s = location.hash.replace("#", "").split("/")[1] as Segment;
  return SEGMENTS.some((x) => x.id === s) ? s : "plan";
}

export default function Tasks() {
  const [seg, setSeg] = useState<Segment>(readSegment);
  useEffect(() => {
    const on = () => setSeg(readSegment());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (s: Segment) => (location.hash = `tasks/${s}`);

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex rounded-xl bg-slate-900 p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => go(s.id)}
            className={`flex-1 rounded-lg py-1.5 text-sm ${seg === s.id ? "bg-slate-100 font-medium text-slate-900" : "text-slate-400"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {seg === "plan" && <PlanView openMatrix={() => go("matrix")} />}
      {seg === "matrix" && <Matrix />}
      {seg === "shopping" && <ShoppingList />}
    </div>
  );
}
