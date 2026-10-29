import { useEffect, useMemo, useState } from "react";
import { parseDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";

export interface Measurement {
  measured_on: string;
  metric: string;
  value: number;
  unit: string | null;
  note: string | null;
}

// For these a falling value is the good direction.
const LOWER_IS_BETTER = new Set(["Körperfett", "Viszerales Fett", "Taillenumfang", "BMI", "ECW/TBW", "Ruhepuls", "5 km Zeit"]);
// Direction depends on the goal – shown without judgement.
const NEUTRAL = new Set(["Körpergewicht", "Größe", "Ruheumsatz", "Radfahren pro Woche"]);

const GROUPS: { title: string; match: (m: string) => boolean }[] = [
  { title: "🏋️ Kraft", match: (m) => /1RM|Zusatzgewicht|Kraft/i.test(m) },
  { title: "💪 Muskelverteilung", match: (m) => m.startsWith("Muskel ") },
  { title: "🫀 Ausdauer & Beweglichkeit", match: (m) => /Ruhepuls|km|Rad|Lauf|Vorbeuge|Spagat|Beweglich|VO2/i.test(m) },
  { title: "⚖️ Körperzusammensetzung", match: () => true },
];
const ORDER = ["Körpergewicht", "Körperfett", "Skelettmuskelmasse", "Fettfreie Masse", "Phasenwinkel", "TRU Body Score", "BMI", "Viszerales Fett", "Taillenumfang", "ECW/TBW", "Ruheumsatz", "Größe"];

const fmtDate = (d: string, long = false) =>
  parseDate(d).toLocaleDateString("de-DE", long ? { day: "numeric", month: "short", year: "numeric" } : { month: "short", year: "2-digit" });
const num = (v: number) => Number(Number(v).toFixed(2)).toLocaleString("de-DE");

export function useMeasurements() {
  const [rows, setRows] = useState<Measurement[]>([]);
  useEffect(() => {
    supabase
      .from("measurements")
      .select("measured_on, metric, value, unit, note")
      .order("measured_on", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Measurement[]));
  }, []);
  return rows;
}

/** Latest value per metric with its history (newest first). */
export function byMetric(rows: Measurement[]) {
  const map = new Map<string, Measurement[]>();
  for (const r of rows) map.set(r.metric, [...(map.get(r.metric) ?? []), r]);
  return map;
}

function Delta({ metric, from, to, unit, label }: { metric: string; from: number; to: number; unit: string | null; label?: string }) {
  const d = Number(to) - Number(from);
  if (Math.abs(d) < 1e-9) return <span className="text-slate-500">±0{label ? ` ${label}` : ""}</span>;
  const good = LOWER_IS_BETTER.has(metric) ? d < 0 : d > 0;
  return (
    <span className={NEUTRAL.has(metric) ? "text-slate-400" : good ? "text-emerald-400" : "text-amber-400"}>
      {d > 0 ? "+" : "−"}
      {num(Math.abs(d))}
      {unit && unit !== "ja" ? ` ${unit}` : ""}
      {label ? ` ${label}` : ""}
    </span>
  );
}

function Spark({ hist }: { hist: Measurement[] }) {
  const pts = [...hist].reverse();
  if (pts.length < 2) return null;
  const t0 = parseDate(pts[0].measured_on).getTime();
  const t1 = parseDate(pts[pts.length - 1].measured_on).getTime();
  const vs = pts.map((p) => Number(p.value));
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const xy = pts.map((p) => {
    const x = t1 > t0 ? ((parseDate(p.measured_on).getTime() - t0) / (t1 - t0)) * 96 + 2 : 50;
    const y = hi > lo ? 18 - ((Number(p.value) - lo) / (hi - lo)) * 14 : 11;
    return [x, y] as const;
  });
  return (
    <svg viewBox="0 0 100 22" className="h-6 w-full">
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="#34d399" strokeWidth="1.2" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#34d399" />
      ))}
    </svg>
  );
}

function MetricRow({ metric, hist }: { metric: string; hist: Measurement[] }) {
  const [open, setOpen] = useState(false);
  const [latest, prev] = hist;
  const first = hist[hist.length - 1];
  const yes = latest.unit === "ja";
  return (
    <li className="border-t border-slate-800 py-1.5">
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="min-w-0">
          <span className="text-slate-200">{metric}</span>
          <span className="block text-[10px] text-slate-500">
            {fmtDate(latest.measured_on, true)}
            {hist.length > 1 && ` · ${hist.length} Messungen`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="font-medium">{yes ? (Number(latest.value) ? "✓" : "✗") : `${num(latest.value)} ${latest.unit ?? ""}`}</span>
          {prev && !yes && (
            <span className="block text-[10px]">
              <Delta metric={metric} from={prev.value} to={latest.value} unit={latest.unit} label={`seit ${fmtDate(prev.measured_on)}`} />
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 rounded-lg bg-slate-900/60 p-2 text-[11px]">
          {!yes && <Spark hist={hist} />}
          {hist.length > 2 && (
            <span className="text-slate-400">
              Gesamt seit {fmtDate(first.measured_on, true)}: <Delta metric={metric} from={first.value} to={latest.value} unit={latest.unit} />
            </span>
          )}
          {hist.map((h) => (
            <div key={h.measured_on} className="flex justify-between gap-2">
              <span className="text-slate-500">{fmtDate(h.measured_on, true)}</span>
              <span className="text-right">
                {yes ? "" : `${num(h.value)} ${h.unit ?? ""}`}
                {h.note && <span className="block text-[10px] text-slate-500">{h.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/** Side-by-side comparison of two check-up dates. */
function Compare({ rows }: { rows: Measurement[] }) {
  // Check-ups = days with a body weight measurement; otherwise any measurement day.
  const dates = useMemo(() => {
    const all = [...new Set(rows.map((r) => r.measured_on))].sort();
    const checkups = [...new Set(rows.filter((r) => r.metric === "Körpergewicht").map((r) => r.measured_on))].sort();
    return checkups.length >= 2 ? checkups : all;
  }, [rows]);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const A = a || dates[0];
  const B = b || dates[dates.length - 1];
  if (dates.length < 2) return null;
  const at = (d: string) => new Map(rows.filter((r) => r.measured_on === d).map((r) => [r.metric, r]));
  const ra = at(A);
  const rb = at(B);
  const metrics = [...ra.keys()].filter((m) => rb.has(m) && ra.get(m)!.unit !== "ja");
  metrics.sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99) || x.localeCompare(y));
  const sel = (v: string, set: (v: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)} className="rounded-md bg-slate-800 px-1.5 py-1 text-xs">
      {dates.map((d) => (
        <option key={d} value={d}>
          {fmtDate(d, true)}
        </option>
      ))}
    </select>
  );
  return (
    <section className="card p-3">
      <h2 className="text-sm font-semibold text-slate-300">🔍 Check-ups vergleichen</h2>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {sel(A, setA)} <span className="text-slate-500">→</span> {sel(B, setB)}
      </div>
      {metrics.length ? (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {metrics.map((m) => (
              <tr key={m} className="border-t border-slate-800">
                <td className="py-1.5 pr-2 text-slate-300">{m}</td>
                <td className="whitespace-nowrap text-right text-slate-400">{num(ra.get(m)!.value)}</td>
                <td className="whitespace-nowrap px-1 text-right font-medium">{num(rb.get(m)!.value)}</td>
                <td className="whitespace-nowrap pl-1 text-right text-[11px]">
                  <Delta metric={m} from={ra.get(m)!.value} to={rb.get(m)!.value} unit={rb.get(m)!.unit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-xs text-slate-500">An diesen beiden Tagen wurden keine gleichen Werte gemessen.</p>
      )}
    </section>
  );
}

/** Fitness → 📏 Werte: all measurements (Kieser check-ups, best lifts, mobility …) with history and comparison. */
export default function BodyValues({ back }: { back: () => void }) {
  const rows = useMeasurements();
  const groups = useMemo(() => {
    const map = byMetric(rows);
    const left = new Set(map.keys());
    return GROUPS.map((g) => {
      const ms = [...left].filter(g.match);
      ms.forEach((m) => left.delete(m));
      ms.sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99) || x.localeCompare(y));
      return { title: g.title, items: ms.map((m) => ({ metric: m, hist: map.get(m)! })) };
    }).filter((g) => g.items.length);
  }, [rows]);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={back}>‹</button>
        <h1 className="text-xl font-semibold">📏 Deine Werte</h1>
      </header>
      <p className="text-xs text-slate-500">
        Check-ups, Bestwerte und Tests. Tippe auf einen Wert für Verlauf und alle Messungen. Neue Werte einfach Claude schicken.
      </p>
      {!rows.length && <p className="text-sm text-slate-500">Noch keine Messwerte.</p>}
      {groups.map((g) => (
        <section key={g.title} className="card p-3">
          <h2 className="text-sm font-semibold text-slate-300">{g.title}</h2>
          <ul className="mt-1 text-xs">
            {g.items.map((it) => (
              <MetricRow key={it.metric} metric={it.metric} hist={it.hist} />
            ))}
          </ul>
        </section>
      ))}
      <Compare rows={rows} />
      <CheckupPhotos />
    </div>
  );
}

interface Photo {
  id: string;
  measured_on: string;
  title: string;
  path: string;
  key: string;
  iv: string;
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const photoCache = new Map<string, Promise<string>>();

/** The photo files are AES-GCM-encrypted static assets; the key comes from the owner-only table. */
function decryptPhoto(p: Photo): Promise<string> {
  if (!photoCache.has(p.id))
    photoCache.set(
      p.id,
      (async () => {
        const res = await fetch(`/${p.path}`);
        if (!res.ok) throw new Error(`Foto ${res.status}`);
        const key = await crypto.subtle.importKey("raw", b64(p.key), "AES-GCM", false, ["decrypt"]);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(p.iv) }, key, await res.arrayBuffer());
        return URL.createObjectURL(new Blob([plain], { type: "image/jpeg" }));
      })(),
    );
  return photoCache.get(p.id)!;
}

function PhotoThumb({ p, onOpen }: { p: Photo; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    decryptPhoto(p).then(setUrl, () => setFailed(true));
  }, [p]);
  return (
    <button className="flex flex-col gap-1 text-left" onClick={() => url && onOpen(url)}>
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-slate-800">
        {url ? <img src={url} alt={p.title} className="h-full w-full object-cover object-top" /> : <span className="block p-2 text-[10px] text-slate-500">{failed ? "Fehler" : "lädt …"}</span>}
      </div>
      <span className="line-clamp-2 text-[10px] leading-tight text-slate-400">{p.title}</span>
    </button>
  );
}

/** Original check-up photos (Kieser report / app screenshots), grouped by date. */
function CheckupPhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("measurement_photos")
      .select("id, measured_on, title, path, key, iv")
      .order("measured_on", { ascending: false })
      .order("position")
      .then(({ data }) => setPhotos((data ?? []) as Photo[]));
  }, []);
  if (!photos.length) return null;
  const days = [...new Set(photos.map((p) => p.measured_on))];
  const shown = day ?? days[0];
  return (
    <section className="card p-3">
      <h2 className="text-sm font-semibold text-slate-300">📸 Original-Check-ups</h2>
      <div className="mt-2 flex gap-1.5">
        {days.map((d) => (
          <button key={d} onClick={() => setDay(d)} className={`rounded-full px-2.5 py-1 text-xs ${d === shown ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300"}`}>
            {fmtDate(d, true)} · {photos.filter((p) => p.measured_on === d).length}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {photos
          .filter((p) => p.measured_on === shown)
          .map((p) => (
            <PhotoThumb key={p.id} p={p} onOpen={setBig} />
          ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black" onClick={() => setBig(null)}>
          <img src={big} alt="" className="mx-auto w-full max-w-3xl" />
          <button className="fixed right-3 top-3 h-11 w-11 rounded-full bg-slate-800/90 text-lg" style={{ marginTop: "env(safe-area-inset-top)" }} aria-label="Schließen">
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
