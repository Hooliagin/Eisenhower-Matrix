import type { WorkoutTemplate } from "../../lib/types";

/** Read-only view of the split. Changes go through Claude (see CLAUDE.md). */
export default function Plan({ templates, back }: { templates: WorkoutTemplate[]; back: () => void }) {
  return (
    <div className="flex flex-col gap-3 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={back}>‹</button>
        <h1 className="flex-1 text-xl font-semibold">Trainingsplan</h1>
      </header>
      <p className="text-xs text-slate-500">Plan ändern? Einfach Claude im Chat sagen, was anders sein soll.</p>
      {templates.map((t) => (
        <div key={t.id} className="card p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">
              {t.code} · {t.name}
            </h2>
            <span className="text-xs text-slate-500">{t.times_per_week ? `${t.times_per_week}×/Woche` : "bei Bedarf"}</span>
          </div>
          <ol className="flex flex-col gap-1 text-sm">
            {t.template_exercises.map((te, i) => (
              <li key={te.id} className="flex justify-between gap-2">
                <span className={te.optional ? "text-slate-500" : ""}>
                  {i + 1}. {te.exercise.name}
                  {te.superset_group && <span className="ml-1 text-[10px] text-sky-400">Supersatz {te.superset_group}</span>}
                  {te.optional && <span className="ml-1 text-[10px]">(optional)</span>}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {te.target_sets} × {te.target_reps} · {te.rest_seconds / 60} min
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
