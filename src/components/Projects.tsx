import { useEffect, useState } from "react";
import { createTasks, isDue, resolvedPatch, sentPatch, updateFollowup, useProjects } from "../lib/data";
import { isoDate, parseDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import type { Followup, Project } from "../lib/types";
import { countdown } from "./Calendar";
import { UndoToast, useTaskActions } from "./Matrix";
import TaskCard from "./TaskCard";

const fmtDay = (s: string) => parseDate(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });

function statusLine(f: Followup): { text: string; tone: string } {
  const today = isoDate();
  if (f.status === "done") return { text: "erledigt", tone: "text-slate-500" };
  if (f.status === "waiting") {
    const since = f.last_contact ? `wartet seit ${fmtDay(f.last_contact)}` : "wartet auf Antwort";
    if (f.follow_up_on && f.follow_up_on <= today) return { text: `${since} · jetzt nachhaken`, tone: "text-amber-400" };
    return { text: `${since} · nachhaken ${f.follow_up_on ? fmtDay(f.follow_up_on) : ""}`, tone: "text-slate-400" };
  }
  const label = f.draft ? "schreiben" : "Erinnerung";
  if (f.follow_up_on && f.follow_up_on > today) return { text: `${label} ${fmtDay(f.follow_up_on)}${f.repeat_days ? ` · alle ${f.repeat_days} T` : ""}`, tone: "text-slate-400" };
  return { text: `${label} – fällig${f.repeat_days ? ` · alle ${f.repeat_days} T` : ""}`, tone: "text-amber-400" };
}

export function FollowupCard({ f, project, onPatch }: { f: Followup; project?: Project; onPatch: (f: Followup, p: Partial<Followup>) => void }) {
  const [draft, setDraft] = useState(f.draft ?? "");
  const [copied, setCopied] = useState(false);
  useEffect(() => setDraft(f.draft ?? ""), [f.draft]);
  const st = statusLine(f);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      prompt("Zum Kopieren markieren:", draft);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold">{f.person}</span>
          {project && <span className="ml-1.5 text-xs text-slate-500">{project.emoji} {project.name}</span>}
        </div>
        <span className={`whitespace-nowrap text-[11px] ${st.tone}`}>{st.text}</span>
      </div>
      <p className="text-sm text-slate-300">{f.topic}</p>
      {f.notes && <p className="mt-0.5 text-[11px] text-slate-500">{f.notes}</p>}

      {f.status !== "done" && draft && (
        <textarea
          className="mt-2 w-full text-sm leading-snug"
          rows={Math.min(8, Math.ceil(draft.length / 38) + 1)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== (f.draft ?? "") && onPatch(f, { draft })}
        />
      )}

      {f.status !== "done" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {draft && (
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={copy}>
              {copied ? "✓ Kopiert" : "📋 Kopieren"}
            </button>
          )}
          {(draft || (f.status === "todo" && !f.repeat_days)) && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onPatch(f, sentPatch(f))}>
              Gesendet → wartet {f.wait_days} T
            </button>
          )}
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onPatch(f, resolvedPatch(f))}>
            {f.status === "waiting" ? "Antwort da ✓" : f.repeat_days ? "Erledigt ✓ (nächste Runde)" : "Erledigt ✓"}
          </button>
          {f.status === "waiting" && !draft && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onPatch(f, { status: "todo", follow_up_on: isoDate() })}>
              Jetzt nachhaken
            </button>
          )}
        </div>
      )}
      {f.status === "todo" && !draft && !f.repeat_days && (
        <p className="mt-1 text-[11px] text-slate-500">Text gewünscht? Sag Claude im Chat Bescheid.</p>
      )}
    </div>
  );
}

type ProjectData = ReturnType<typeof useProjects>["data"];

/** The project and all its subfolders (any depth). */
function subtreeIds(projects: Project[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of projects) if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) (ids.add(p.id), (grew = true));
  }
  return ids;
}

function FolderCard({ p, data }: { p: Project; data: ProjectData }) {
  const today = isoDate();
  const ids = subtreeIds(data.projects, p.id);
  const fu = data.followups.filter((f) => f.project_id && ids.has(f.project_id) && f.status !== "done");
  const ts = data.tasks.filter((t) => t.project_id && ids.has(t.project_id) && !t.done);
  const next = ts.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  const dueCount = fu.filter((f) => isDue(f, today)).length;
  const subCount = ids.size - 1;
  const parts = [subCount && `${subCount} Ordner`, fu.length && `${fu.length} Leute`, `${ts.length} Einträge`].filter(Boolean);
  return (
    <button onClick={() => (location.hash = `projects/${p.id}`)} className="card p-3 text-left">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{p.emoji} {p.name}</span>
        {dueCount > 0 && <span className="rounded-full bg-amber-500/20 px-2 text-[11px] text-amber-300">{dueCount} fällig</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {parts.join(" · ")}
        {next && <span className="text-red-300"> · Deadline {countdown(next.due_date!)}</span>}
      </p>
    </button>
  );
}

function ProjectDetail({ project, back }: { project: Project; back: () => void }) {
  const { data, setData, refresh } = useProjects();
  const children = data.projects.filter((p) => p.parent_id === project.id);
  const parent = data.projects.find((p) => p.id === project.parent_id);
  const [folder, setFolder] = useState("");
  const tasks = data.tasks.filter((t) => t.project_id === project.id);
  const followups = data.followups.filter((f) => f.project_id === project.id);
  const actions = useTaskActions(tasks, (next) => setData({ ...data, tasks: [...data.tasks.filter((t) => t.project_id !== project.id), ...next] }));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [person, setPerson] = useState("");
  const [topic, setTopic] = useState("");
  const [showDone, setShowDone] = useState(false);

  const patch = (f: Followup, p: Partial<Followup>) => {
    setData({ ...data, followups: data.followups.map((x) => (x.id === f.id ? { ...x, ...p } : x)) });
    void updateFollowup(f.id, p);
  };

  async function addTask() {
    if (!title.trim()) return;
    await createTasks([{ title: title.trim(), quadrant: "schedule", project_id: project.id, due_date: due || null }]);
    setTitle("");
    setDue("");
    void refresh();
  }

  async function addFollowup() {
    if (!person.trim() || !topic.trim()) return;
    await supabase.from("followups").insert({ project_id: project.id, person: person.trim(), topic: topic.trim(), follow_up_on: isoDate() });
    setPerson("");
    setTopic("");
    void refresh();
  }

  async function addFolder() {
    if (!folder.trim()) return;
    await supabase.from("projects").insert({ name: folder.trim(), parent_id: project.id, position: children.length + 1 });
    setFolder("");
    void refresh();
  }

  const open = followups.filter((f) => f.status !== "done");
  const done = followups.filter((f) => f.status === "done");
  const openTasks = tasks.filter((t) => !t.done).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={back}>‹</button>
        <div>
          {parent && <p className="text-xs text-slate-500">{parent.emoji} {parent.name} /</p>}
          <h1 className="text-xl font-semibold">{project.emoji} {project.name}</h1>
          {project.description && <p className="text-xs text-slate-500">{project.description}</p>}
        </div>
      </header>

      {(children.length > 0 || !project.parent_id) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Unterordner</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {children.map((c) => <FolderCard key={c.id} p={c} data={data} />)}
          </div>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Neuer Unterordner…" value={folder} onChange={(e) => setFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} />
            <button className="btn-ghost" onClick={addFolder}>+</button>
          </div>
        </section>
      )}

      {(!project.parent_id || followups.length > 0) && (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Leute & Nachfassen · {open.length}</h2>
        {open.map((f) => <FollowupCard key={f.id} f={f} onPatch={patch} />)}
        {!open.length && <p className="text-sm text-slate-500">Niemandem hinterher – gut so.</p>}
        <div className="flex gap-2">
          <input className="w-28 py-1.5 text-sm" placeholder="Person" value={person} onChange={(e) => setPerson(e.target.value)} />
          <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Worum geht's?" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFollowup()} />
          <button className="btn-ghost" onClick={addFollowup}>+</button>
        </div>
        {done.length > 0 && (
          <button className="text-left text-xs text-slate-500" onClick={() => setShowDone(!showDone)}>
            {showDone ? "▾" : "▸"} Erledigt: {done.length}
          </button>
        )}
        {showDone && done.map((f) => <FollowupCard key={f.id} f={f} onPatch={patch} />)}
      </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h2 className="text-sm font-semibold text-slate-300">Einträge · {openTasks.length}</h2>
        {openTasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <div className="flex-1"><TaskCard task={t} {...actions} draggable={false} /></div>
            {t.due_date && <span className="w-16 text-right text-[11px] text-red-300">{countdown(t.due_date)}</span>}
          </div>
        ))}
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Neuer Eintrag…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
          <input type="date" className="w-36 py-1.5 text-sm" value={due} onChange={(e) => setDue(e.target.value)} title="Deadline (optional)" />
          <button className="btn-ghost" onClick={addTask}>+</button>
        </div>
      </section>
      <UndoToast task={actions.undo} onUndo={actions.restore} />
    </div>
  );
}

function readProjectId(): string | null {
  const [tab, id] = location.hash.replace("#", "").split("/");
  return tab === "projects" && id ? id : null;
}

export default function Projects() {
  const { data, setData, refresh } = useProjects();
  const [openId, setOpenId] = useState<string | null>(readProjectId);
  const [name, setName] = useState("");
  const today = isoDate();

  useEffect(() => {
    const on = () => setOpenId(readProjectId());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const project = data.projects.find((p) => p.id === openId);
  if (openId && project)
    return <ProjectDetail key={project.id} project={project} back={() => (location.hash = project.parent_id ? `projects/${project.parent_id}` : "projects")} />;

  const patch = (f: Followup, p: Partial<Followup>) => {
    setData({ ...data, followups: data.followups.map((x) => (x.id === f.id ? { ...x, ...p } : x)) });
    void updateFollowup(f.id, p);
  };

  async function addProject() {
    if (!name.trim()) return;
    await supabase.from("projects").insert({ name: name.trim(), position: data.projects.length + 1 });
    setName("");
    void refresh();
  }

  const due = data.followups.filter((f) => isDue(f, today));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="text-2xl font-semibold">Projekte</h1>

      {due.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-amber-400">Jetzt dran · {due.length}</h2>
          {due.map((f) => (
            <FollowupCard key={f.id} f={f} project={data.projects.find((p) => p.id === f.project_id)} onPatch={patch} />
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.projects.filter((p) => !p.parent_id).map((p) => <FolderCard key={p.id} p={p} data={data} />)}
      </section>

      <div className="flex gap-2">
        <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Neuer Projekt-Ordner…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProject()} />
        <button className="btn-ghost" onClick={addProject}>+</button>
      </div>
    </div>
  );
}
