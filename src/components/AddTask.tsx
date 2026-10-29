import { useRef, useState } from "react";
import { createTasks } from "../lib/data";
import { createRecognition, extractDuration, guessQuadrant, parseDictation, speechSupported, type ParsedTask } from "../lib/speech";
import { QUADRANTS, type Quadrant } from "../lib/types";

const Q_OPTIONS: { id: Quadrant; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  ...(Object.keys(QUADRANTS) as (keyof typeof QUADRANTS)[]).map((q) => ({ id: q as Quadrant, label: QUADRANTS[q].label })),
];

export default function AddTask({ defaultQuadrant = "inbox", compact = false }: { defaultQuadrant?: Quadrant; compact?: boolean }) {
  const [text, setText] = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [preview, setPreview] = useState<ParsedTask[] | null>(null);
  const rec = useRef<ReturnType<typeof createRecognition>>(null);
  const finalText = useRef("");

  async function addTyped() {
    const t = text.trim();
    if (!t) return;
    setText("");
    const { rest, minutes } = extractDuration(t);
    await createTasks([{ title: rest || t, quadrant: quadrant === "inbox" ? guessQuadrant(t) : quadrant, estimate_minutes: minutes }]);
  }

  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = createRecognition();
    if (!r) return;
    finalText.current = "";
    r.onresult = (e) => {
      let fin = "";
      let tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript + ". ";
        else tmp += res[0].transcript;
      }
      finalText.current = fin;
      setInterim(fin + tmp);
    };
    r.onerror = () => setListening(false);
    r.onend = () => {
      setListening(false);
      setInterim("");
      const parsed = parseDictation(finalText.current);
      if (parsed.length) setPreview(parsed);
    };
    rec.current = r;
    r.start();
    setListening(true);
  }

  async function savePreview() {
    if (!preview) return;
    await createTasks(preview.filter((p) => p.title.trim()).map((p) => ({ ...p, source: "voice" as const })));
    setPreview(null);
  }

  return (
    <div className={compact ? "" : "card p-3"}>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1"
          placeholder="Neue Aufgabe… (z. B. „Aufräumen 1 h“)"
          value={listening ? interim : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTyped()}
          readOnly={listening}
        />
        {speechSupported() && (
          <button
            onClick={toggleMic}
            className={`btn w-11 text-lg ${listening ? "animate-pulse bg-red-600" : "bg-slate-800"}`}
            aria-label="Sprachaufnahme"
          >
            🎙
          </button>
        )}
        <button className="btn-primary w-11 text-lg" onClick={addTyped} aria-label="Hinzufügen">
          +
        </button>
      </div>
      <div className={`mt-2 flex gap-1 overflow-x-auto ${compact ? "hidden" : ""}`}>
        {Q_OPTIONS.map((q) => (
          <button
            key={q.id}
            onClick={() => setQuadrant(q.id)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${quadrant === q.id ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400"}`}
          >
            {q.label}
          </button>
        ))}
      </div>
      {listening && <p className="mt-2 text-xs text-slate-400">Sprich los – z. B. „Steuererklärung machen, wichtig, außerdem Paket abholen, dringend“. Tippe 🎙 zum Beenden.</p>}
      {preview && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-400">Erkannt – prüfen & speichern:</p>
          {preview.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="min-w-0 flex-1 py-1 text-sm"
                value={p.title}
                onChange={(e) => setPreview(preview.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              <input
                className="w-16 py-1 text-center text-xs"
                inputMode="numeric"
                placeholder="min"
                value={p.estimate_minutes ?? ""}
                onChange={(e) => setPreview(preview.map((x, j) => (j === i ? { ...x, estimate_minutes: Number(e.target.value) || null } : x)))}
              />
              <select
                className="py-1 text-xs"
                value={p.quadrant}
                onChange={(e) => setPreview(preview.map((x, j) => (j === i ? { ...x, quadrant: e.target.value as Quadrant } : x)))}
              >
                {Q_OPTIONS.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPreview(null)}>
              Verwerfen
            </button>
            <button className="btn-primary" onClick={savePreview}>
              {preview.length} speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
