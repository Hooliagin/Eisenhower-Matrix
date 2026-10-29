import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatLong, parseDate } from "../../lib/dates";
import { useRestTimer } from "../../lib/timer";
import type { Exercise, SetLog, TemplateExercise, WorkoutSession, WorkoutTemplate } from "../../lib/types";
import { fmtSet, SECOND_FIELD } from "./format";

type Prev = { date: string; sets: SetLog[] };

interface Props {
  id: string;
  templates: WorkoutTemplate[];
  back: () => void;
}

export default function SessionView({ id, templates, back }: Props) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [prev, setPrev] = useState<Record<string, Prev>>({});
  const [extra, setExtra] = useState<Exercise[]>([]);
  const [showOptional, setShowOptional] = useState(false);
  const timer = useRestTimer();

  const template = templates.find((t) => t.id === session?.template_id);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from("workout_sessions").select("*").eq("id", id).single(),
        supabase.from("set_logs").select("*").eq("session_id", id).order("created_at"),
      ]);
      setSession(s);
      setLogs(l ?? []);
    })();
  }, [id]);

  const planned: TemplateExercise[] = useMemo(() => template?.template_exercises ?? [], [template]);

  // Exercises logged in this session that are no longer in the plan still show up.
  useEffect(() => {
    const known = new Set(planned.map((p) => p.exercise_id));
    const missing = [...new Set(logs.map((l) => l.exercise_id))].filter((x) => !known.has(x));
    if (!missing.length) return setExtra([]);
    supabase.from("exercises").select("*").in("id", missing).then(({ data }) => setExtra(data ?? []));
  }, [planned, logs]);

  // Most recent earlier session per exercise, for "letztes Mal".
  useEffect(() => {
    if (!session || !planned.length) return;
    (async () => {
      const { data } = await supabase
        .from("set_logs")
        .select("*, workout_sessions!inner(session_date)")
        .in("exercise_id", planned.map((p) => p.exercise_id))
        .neq("session_id", id)
        .lte("workout_sessions.session_date", session.session_date)
        .order("created_at", { ascending: false })
        .limit(400);
      const out: Record<string, Prev> = {};
      const chosen: Record<string, string> = {};
      for (const row of (data ?? []) as (SetLog & { workout_sessions: { session_date: string } })[]) {
        chosen[row.exercise_id] ??= row.session_id;
        if (chosen[row.exercise_id] !== row.session_id) continue;
        out[row.exercise_id] ??= { date: row.workout_sessions.session_date, sets: [] };
        out[row.exercise_id].sets.unshift(row);
      }
      setPrev(out);
    })();
  }, [session, planned, id]);

  async function logSet(te: Pick<TemplateExercise, "exercise_id" | "rest_seconds" | "superset_group">, values: Partial<SetLog>, restAfter: boolean) {
    const setNumber = logs.filter((l) => l.exercise_id === te.exercise_id).length + 1;
    if (restAfter) timer.start(te.rest_seconds);
    const { data, error } = await supabase
      .from("set_logs")
      .insert({ session_id: id, exercise_id: te.exercise_id, set_number: setNumber, ...values })
      .select()
      .single();
    if (error) return alert(error.message);
    setLogs((l) => [...l, data]);
  }

  async function removeSet(log: SetLog) {
    if (!confirm(`Satz ${log.set_number} löschen?`)) return;
    setLogs((l) => l.filter((x) => x.id !== log.id));
    await supabase.from("set_logs").delete().eq("id", log.id);
  }

  async function finish() {
    if (!session) return;
    const finished_at = new Date().toISOString();
    await supabase.from("workout_sessions").update({ finished_at, notes: session.notes }).eq("id", id);
    timer.stop();
    back();
  }

  async function remove() {
    if (!confirm("Dieses Training komplett löschen?")) return;
    await supabase.from("workout_sessions").delete().eq("id", id);
    back();
  }

  if (!session) return null;

  // Group consecutive exercises sharing a superset tag.
  const main = planned.filter((p) => !p.optional);
  const optional = planned.filter((p) => p.optional);
  const groups: TemplateExercise[][] = [];
  for (const te of main) {
    const last = groups[groups.length - 1];
    if (te.superset_group && last?.[0].superset_group === te.superset_group) last.push(te);
    else groups.push([te]);
  }

  const totalSets = logs.length;

  return (
    <div className="flex flex-col gap-3 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={back}>‹</button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{template?.name ?? "Training"}</h1>
          <p className="text-xs text-slate-500">
            {formatLong(parseDate(session.session_date))} · {totalSets} Sätze{session.finished_at ? " · abgeschlossen" : ""}
          </p>
        </div>
      </header>

      {groups.map((g) => (
        <div key={g[0].id} className={g.length > 1 ? "rounded-2xl border border-sky-800/60 p-1.5" : ""}>
          {g.length > 1 && <p className="px-2 pb-1 text-[11px] text-sky-400">Supersatz – abwechselnd, Pause nach dem letzten</p>}
          <div className="flex flex-col gap-1.5">
            {g.map((te, i) => (
              <ExerciseBlock
                key={te.id}
                te={te}
                logs={logs.filter((l) => l.exercise_id === te.exercise_id)}
                prev={prev[te.exercise_id]}
                restAfter={i === g.length - 1}
                onLog={(v, rest) => logSet(te, v, rest)}
                onRemove={removeSet}
              />
            ))}
          </div>
        </div>
      ))}

      {optional.length > 0 && (
        <div>
          <button className="text-sm text-slate-500" onClick={() => setShowOptional((s) => !s)}>
            {showOptional ? "▾" : "▸"} Optional: {optional.map((o) => o.exercise.name).join(", ")}
          </button>
          {showOptional &&
            optional.map((te) => (
              <div key={te.id} className="mt-1.5">
                <ExerciseBlock
                  te={te}
                  logs={logs.filter((l) => l.exercise_id === te.exercise_id)}
                  prev={prev[te.exercise_id]}
                  restAfter
                  onLog={(v, rest) => logSet(te, v, rest)}
                  onRemove={removeSet}
                />
              </div>
            ))}
        </div>
      )}

      {extra.map((ex) => (
        <ExerciseBlock
          key={ex.id}
          te={{ id: ex.id, template_id: "", exercise_id: ex.id, position: 99, target_sets: 0, target_reps: null, rest_seconds: 120, superset_group: null, optional: false, notes: null, exercise: ex }}
          logs={logs.filter((l) => l.exercise_id === ex.id)}
          restAfter
          onLog={(v, rest) => logSet({ exercise_id: ex.id, rest_seconds: 120, superset_group: null }, v, rest)}
          onRemove={removeSet}
        />
      ))}

      <textarea
        placeholder="Notizen (Schlaf, Energie, Schmerzen …)"
        rows={2}
        value={session.notes ?? ""}
        onChange={(e) => setSession({ ...session, notes: e.target.value })}
        onBlur={() => supabase.from("workout_sessions").update({ notes: session.notes }).eq("id", id)}
      />
      <button className="btn-primary py-3" onClick={finish}>
        {session.finished_at ? "Speichern & zurück" : "Training abschließen ✓"}
      </button>
      <button className="text-xs text-red-400/70" onClick={remove}>Training löschen</button>
    </div>
  );
}

interface BlockProps {
  te: TemplateExercise;
  logs: SetLog[];
  prev?: Prev;
  restAfter: boolean;
  onLog: (v: Partial<SetLog>, restAfter: boolean) => void;
  onRemove: (l: SetLog) => void;
}

function ExerciseBlock({ te, logs, prev, restAfter, onLog, onRemove }: BlockProps) {
  const metric = te.exercise.metric;
  const second = SECOND_FIELD[metric];
  const ref = logs[logs.length - 1] ?? prev?.sets[logs.length] ?? prev?.sets[prev.sets.length - 1];
  const [weight, setWeight] = useState<string>(ref?.weight != null ? String(Number(ref.weight)) : "");
  const [value, setValue] = useState<string>(ref?.[second.key] != null ? String(ref[second.key]) : "");
  const complete = te.target_sets > 0 && logs.length >= te.target_sets;

  // Prefill once "letztes Mal" data arrives.
  useEffect(() => {
    if (logs.length || !prev?.sets.length) return;
    const p = prev.sets[0];
    if (p.weight != null) setWeight(String(Number(p.weight)));
    if (p[second.key] != null) setValue(String(p[second.key]));
  }, [prev]);

  function submit() {
    const v = Number(value);
    if (!v) return;
    onLog({ weight: weight === "" ? null : Number(weight.replace(",", ".")), [second.key]: v }, restAfter);
  }

  return (
    <div className={`card p-3 ${complete ? "border-emerald-700/60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {complete && <span className="mr-1 text-emerald-400">✓</span>}
          {te.exercise.name}
        </h3>
        {te.target_sets > 0 && (
          <span className="whitespace-nowrap text-xs text-slate-500">
            {te.target_sets} × {te.target_reps}
          </span>
        )}
      </div>
      {(te.notes || te.exercise.notes) && <p className="text-[11px] text-slate-500">{te.notes ?? te.exercise.notes}</p>}
      {prev && (
        <p className="mt-1 text-xs text-slate-400">
          Letztes Mal ({prev.date.slice(8)}.{prev.date.slice(5, 7)}.): {prev.sets.map((s) => fmtSet(s, metric)).join(" · ")}
        </p>
      )}

      {logs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {logs.map((l) => (
            <button key={l.id} onClick={() => onRemove(l)} className="rounded-md bg-emerald-500/15 px-2 py-1 font-mono text-xs text-emerald-300">
              {l.set_number}: {fmtSet(l, metric)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1">
          <input inputMode="decimal" className="w-full py-2 text-center" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <span className="text-xs text-slate-500">kg</span>
        </label>
        <label className="flex flex-1 items-center gap-1">
          <input inputMode="numeric" className="w-full py-2 text-center" placeholder={second.label} value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-xs text-slate-500">{second.label}</span>
        </label>
        <button className="btn-primary px-4 py-2.5" onClick={submit}>
          ✓ Satz {logs.length + 1}
        </button>
      </div>
    </div>
  );
}
