import { useEffect, useRef, useState } from "react";
import { isoDate } from "../lib/dates";
import { cloze, compare, stanzas, type DiffOp } from "../lib/poem";
import { createRecognition, speechSupported } from "../lib/speech";
import { fire, supabase } from "../lib/supabase";
import { fmtSeconds, useRestTimer } from "../lib/timer";

interface Poem {
  id: string;
  title: string;
  author: string | null;
  text: string;
  status: "learning" | "mastered" | "paused";
  learned_stanzas: number;
  mastered_on: string | null;
}

interface Attempt {
  id: string;
  poem_id: string;
  stanza_from: number;
  stanza_to: number;
  accuracy: number | null;
  feedback: string | null;
  created_at: string;
}

type Mode = "read" | "cloze" | "recite";
type Scope = "stanza" | "learned" | "all";

/**
 * Memorize poems stanza by stanza: read → cloze (first letters) → recite with speech recognition.
 * The app compares the recitation word by word; every attempt (with transcript) is saved so Claude can check it
 * on request and leave feedback. Opens from the ⚡ Daily card and from the rest timer between sets.
 */
export default function PoemTrainer({ onClose }: { onClose: () => void }) {
  const [poems, setPoems] = useState<Poem[]>([]);
  const [poemId, setPoemId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("read");
  const [scope, setScope] = useState<Scope>("stanza");
  const [clozeLevel, setClozeLevel] = useState<1 | 2>(1);
  const [recording, setRecording] = useState(false);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ ops: DiffOp[]; accuracy: number } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<ReturnType<typeof createRecognition>>(null);
  const finalText = useRef("");
  const lastSave = useRef(Date.now());
  const rest = useRestTimer();

  async function load() {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("poems").select("*").neq("status", "paused").order("position"),
      supabase.from("poem_attempts").select("id, poem_id, stanza_from, stanza_to, accuracy, feedback, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const list = (p ?? []) as Poem[];
    setPoems(list);
    setAttempts((a ?? []) as Attempt[]);
    setPoemId((cur) => {
      const chosen = list.find((x) => x.id === cur) ?? list.find((x) => x.status === "learning") ?? list[0];
      if (chosen && chosen.id !== cur) setIdx(Math.min(chosen.learned_stanzas, stanzas(chosen.text).length - 1));
      return chosen?.id ?? null;
    });
  }

  useEffect(() => {
    void load();
    return () => {
      rec.current?.stop();
      // Practice without a saved recitation still counts (≥ 30 s).
      const secs = Math.round((Date.now() - lastSave.current) / 1000);
      if (secs >= 30 && poemRef.current) {
        fire(
          supabase.from("poem_attempts").insert({
            poem_id: poemRef.current.id,
            stanza_from: idxRef.current,
            stanza_to: idxRef.current,
            mode: "read",
            seconds: Math.min(secs, 1800),
          }),
        );
      }
    };
  }, []);

  const poem = poems.find((p) => p.id === poemId) ?? null;
  const poemRef = useRef<Poem | null>(null);
  poemRef.current = poem;
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const heardRef = useRef("");
  heardRef.current = heard;

  if (!poem)
    return (
      <Shell onClose={onClose} rest={rest}>
        <p className="text-center text-sm text-slate-400">{poems.length ? "" : "Noch kein Gedicht. Sag Claude, welches du lernen willst."}</p>
      </Shell>
    );

  const all = stanzas(poem.text);
  const from = scope === "stanza" ? idx : 0;
  const to = scope === "all" ? all.length - 1 : idx;
  const target = all.slice(from, to + 1).join("\n\n");
  const feedback = attempts.find((a) => a.poem_id === poem.id && a.feedback);

  function startRec() {
    const r = createRecognition();
    if (!r) return;
    finalText.current = "";
    setHeard("");
    setResult(null);
    r.onresult = (e) => {
      let interim = "";
      let fin = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      finalText.current = fin;
      setHeard(fin + interim);
    };
    r.onend = () => {
      setRecording(false);
      check(finalText.current || heardRef.current);
    };
    r.onerror = (e) => setMsg(e.error === "not-allowed" ? "Mikrofon nicht erlaubt" : `Spracherkennung: ${e.error}`);
    rec.current = r;
    r.start();
    setRecording(true);
  }
  async function check(spoken: string) {
    if (!spoken.trim()) return;
    const r = compare(target, spoken);
    setResult(r);
    const now = Date.now();
    const seconds = Math.min(1800, Math.round((now - lastSave.current) / 1000));
    lastSave.current = now;
    await supabase.from("poem_attempts").insert({
      poem_id: poem!.id,
      stanza_from: from,
      stanza_to: to,
      mode: "recite",
      transcript: spoken.trim(),
      accuracy: Math.round(r.accuracy * 1000) / 1000,
      seconds,
    });
  }

  async function stanzaLearned() {
    const p = poem!;
    const learned = Math.max(p.learned_stanzas, idx + 1);
    const done = learned >= all.length;
    await supabase
      .from("poems")
      .update({ learned_stanzas: learned, ...(done ? { status: "mastered", mastered_on: isoDate() } : {}) })
      .eq("id", p.id);
    setMsg(done ? `🏆 ${p.title} komplett gelernt!` : `✓ Strophe ${idx + 1} sitzt`);
    setTimeout(() => setMsg(null), 2500);
    if (!done) {
      setIdx(Math.min(idx + 1, all.length - 1));
      setMode("read");
    }
    setResult(null);
    void load();
  }

  const canAdvance = result && scope === "stanza" && result.accuracy >= 0.9 && idx >= poem.learned_stanzas;

  return (
    <Shell onClose={onClose} rest={rest}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-pixel text-lg">{poem.title}</h2>
          <p className="text-xs text-slate-400">
            {poem.author} · {poem.learned_stanzas}/{all.length} Strophen sitzen
          </p>
        </div>
        {poems.length > 1 && (
          <select value={poem.id} onChange={(e) => setPoemId(e.target.value)} className="max-w-[40%] py-1 text-xs">
            {poems.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-amber-400" style={{ width: `${(poem.learned_stanzas / all.length) * 100}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <button className="btn-ghost px-3" disabled={idx === 0} onClick={() => (setIdx(idx - 1), setResult(null))}>‹</button>
        <span className="text-sm text-slate-300">
          Strophe {idx + 1}/{all.length} {idx < poem.learned_stanzas ? "✓" : idx === poem.learned_stanzas ? "· lernen" : ""}
        </span>
        <button className="btn-ghost px-3" disabled={idx >= all.length - 1} onClick={() => (setIdx(idx + 1), setResult(null))}>›</button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-xs">
        {(
          [
            ["read", "📖 Lesen"],
            ["cloze", "🧩 Lücken"],
            ["recite", "🎤 Aufsagen"],
          ] as const
        ).map(([m, l]) => (
          <button key={m} onClick={() => (setMode(m), setResult(null))} className={`rounded-lg py-2 ${mode === m ? "bg-amber-400 font-semibold text-slate-900" : "bg-slate-800"}`}>
            {l}
          </button>
        ))}
      </div>

      {mode === "recite" && (
        <div className="flex gap-1.5 text-[11px]">
          {(
            [
              ["stanza", "Diese Strophe"],
              ["learned", `Strophe 1–${idx + 1}`],
              ["all", "Ganzes Gedicht"],
            ] as const
          ).map(([s, l]) => (
            <button key={s} onClick={() => (setScope(s), setResult(null))} className={`flex-1 rounded-full py-1 ${scope === s ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-400"}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-[7rem] whitespace-pre-line rounded-xl bg-slate-950/70 p-3 font-serif text-lg leading-relaxed">
        {mode === "read" && all[idx]}
        {mode === "cloze" && (
          <button className="w-full whitespace-pre-line text-left" onClick={() => setClozeLevel(clozeLevel === 1 ? 2 : 1)}>
            {cloze(all[idx], clozeLevel, idx + 1)}
            <span className="mt-2 block font-sans text-[11px] text-slate-500">Antippen: {clozeLevel === 1 ? "nur Anfangsbuchstaben" : "mehr Hilfe"}</span>
          </button>
        )}
        {mode === "recite" && !result && (
          <span className="font-sans text-base text-slate-400">{heard || (recording ? "Ich höre zu …" : "Auswendig aufsagen – der Text bleibt verdeckt.")}</span>
        )}
        {mode === "recite" && result && <DiffView ops={result.ops} />}
      </div>

      {mode === "recite" && (
        <>
          {result && (
            <p className={`text-center text-sm ${result.accuracy >= 0.9 ? "text-emerald-400" : result.accuracy >= 0.7 ? "text-amber-300" : "text-red-400"}`}>
              {Math.round(result.accuracy * 100)} % richtig · <span className="text-slate-500">rot = fehlt, gelb = anders gesagt</span>
            </p>
          )}
          {speechSupported() ? (
            <button className={`py-4 text-lg ${recording ? "btn bg-red-600 text-white" : "btn-primary"}`} onClick={() => (recording ? rec.current?.stop() : startRec())}>
              {recording ? "■ Fertig" : result ? "🎤 Nochmal" : "🎤 Aufsagen"}
            </button>
          ) : (
            <div className="flex gap-2">
              <textarea rows={3} className="flex-1" placeholder="Spracherkennung fehlt – hier aus dem Kopf tippen" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button className="btn-primary" onClick={() => void check(typed)}>Prüfen</button>
            </div>
          )}
          {canAdvance && (
            <button className="btn bg-emerald-600 py-3 text-white" onClick={stanzaLearned}>
              ✓ Sitzt – {idx + 1 >= all.length ? "Gedicht abschließen" : "nächste Strophe"}
            </button>
          )}
        </>
      )}

      {msg && <p className="text-center text-sm text-amber-300">{msg}</p>}
      {feedback && (
        <p className="rounded-lg border border-sky-900 bg-sky-950/40 p-2 text-xs text-sky-200">
          💬 Claude ({new Date(feedback.created_at).toLocaleDateString("de-DE")}): {feedback.feedback}
        </p>
      )}
      <p className="text-center text-[10px] text-slate-600">Deine Versuche werden gespeichert – sag Claude „prüf mal mein Gedicht“ für eine genaue Rückmeldung.</p>
    </Shell>
  );
}

function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <span className="font-sans text-base leading-loose">
      {ops.map((o, i) =>
        o.kind === "ok" ? (
          <span key={i}>{o.word} </span>
        ) : o.kind === "missing" ? (
          <span key={i} className="rounded bg-red-900/60 px-0.5 text-red-200 line-through decoration-red-400">
            {o.word}{" "}
          </span>
        ) : o.kind === "wrong" ? (
          <span key={i} className="rounded bg-amber-900/60 px-0.5 text-amber-200" title={`gesagt: ${o.said}`}>
            {o.word} <span className="text-[10px] text-amber-400">({o.said})</span>{" "}
          </span>
        ) : (
          <span key={i} className="text-[11px] text-slate-500">+{o.said} </span>
        ),
      )}
    </span>
  );
}

function Shell({ children, onClose, rest }: { children: React.ReactNode; onClose: () => void; rest: ReturnType<typeof useRestTimer> }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "2rem" }}>
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-pixel text-sm text-amber-300">📜 Gedicht-Training</span>
          <div className="flex items-center gap-2">
            {rest.endsAt && (
              <span className={`rounded-full px-2.5 py-1 font-mono text-sm tabular-nums ${rest.remaining === 0 ? "animate-pulse bg-emerald-600" : "bg-slate-800"}`}>
                {rest.remaining === 0 ? "Satz! 💪" : `Pause ${fmtSeconds(rest.remaining)}`}
              </span>
            )}
            <button className="btn-ghost h-11 w-11 text-lg" onClick={onClose} aria-label="Schließen">✕</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
