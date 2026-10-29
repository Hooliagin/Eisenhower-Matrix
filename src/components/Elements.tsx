import { useState } from "react";
import { ELEMENT_ORDER, ELEMENTS, type Element } from "../lib/character";
import { useElements } from "../lib/data";
import { isoDate, weekStart } from "../lib/dates";
import { fmtMinutes } from "../lib/schedule";

function Diamond({ values, avg }: { values: Record<Element, number>; avg: Record<Element, number> }) {
  const max = Math.max(60, ...ELEMENT_ORDER.map((e) => Math.max(values[e], avg[e])));
  // Feuer oben, Wasser rechts, Erde unten, Luft links
  const dir: Record<Element, [number, number]> = { feuer: [0, -1], wasser: [1, 0], erde: [0, 1], luft: [-1, 0] };
  const pts = (v: Record<Element, number>) =>
    ELEMENT_ORDER.map((e) => {
      const r = 6 + (v[e] / max) * 36;
      return `${50 + dir[e][0] * r},${50 + dir[e][1] * r}`;
    }).join(" ");
  return (
    <svg viewBox="-12 0 124 100" className="mx-auto h-60 w-full max-w-xs">
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={ELEMENT_ORDER.map((e) => `${50 + dir[e][0] * (6 + f * 36)},${50 + dir[e][1] * (6 + f * 36)}`).join(" ")} fill="none" stroke="#1f2937" strokeWidth="0.5" />
      ))}
      <polygon points={pts(avg)} fill="none" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2 1.5" />
      <polygon points={pts(values)} fill="rgba(250,204,21,0.18)" stroke="#facc15" strokeWidth="1.2" />
      {ELEMENT_ORDER.map((e) => (
        <text key={e} x={50 + dir[e][0] * 47} y={50 + dir[e][1] * 46} fontSize="5" textAnchor="middle" dominantBaseline="middle" fill={ELEMENTS[e].color}>
          {ELEMENTS[e].emoji} {ELEMENTS[e].label}
        </text>
      ))}
    </svg>
  );
}

export default function Elements() {
  const { data: events } = useElements();
  const [open, setOpen] = useState<Element | null>(null);
  const ws = isoDate(weekStart());

  const zero = (): Record<Element, number> => ({ feuer: 0, wasser: 0, erde: 0, luft: 0 });
  const week = zero();
  const prev = zero();
  for (const ev of events) {
    const el = ev.element as Element;
    if (ev.day >= ws) week[el] += ev.minutes;
    else prev[el] += ev.minutes;
  }
  const avg = zero();
  ELEMENT_ORDER.forEach((e) => (avg[e] = Math.round(prev[e] / 4)));
  const total = ELEMENT_ORDER.reduce((s, e) => s + week[e], 0);

  const ranked = [...ELEMENT_ORDER].sort((a, b) => week[b] - week[a]);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header>
        <h1 className="text-2xl font-semibold">Elemente</h1>
        <p className="text-xs text-slate-500">Wo deine Zeit diese Woche hinfließt – und was gerade zu kurz kommt.</p>
      </header>

      <section className="card p-3">
        <Diamond values={week} avg={avg} />
        <p className="text-center text-[11px] text-slate-500">
          <span className="text-yellow-300">━</span> diese Woche · <span className="text-slate-400">┅</span> Schnitt der 4 Wochen davor
        </p>
      </section>

      {total > 0 ? (
        <section className="card border-slate-700 p-3 text-sm">
          <p>
            Diese Woche dominiert <b style={{ color: ELEMENTS[strongest].color }}>{ELEMENTS[strongest].emoji} {ELEMENTS[strongest].label}</b>
            {week[weakest] < week[strongest] && (
              <>
                , am wenigsten <b style={{ color: ELEMENTS[weakest].color }}>{ELEMENTS[weakest].emoji} {ELEMENTS[weakest].label}</b>
              </>
            )}
            .
          </p>
          {week[weakest] < total * 0.15 && (
            <p className="mt-1 text-xs text-slate-400">
              {ELEMENTS[weakest].label} stärken: {ELEMENTS[weakest].ideas}.
            </p>
          )}
        </section>
      ) : (
        <p className="text-sm text-slate-500">Noch nichts erledigt diese Woche – sobald du Aufgaben abhakst, trainierst oder liest, füllt sich das Bild.</p>
      )}

      {ELEMENT_ORDER.map((e) => {
        const share = total ? Math.round((week[e] / total) * 100) : 0;
        const diff = week[e] - avg[e];
        const items = events.filter((ev) => ev.element === e && ev.day >= ws);
        return (
          <section key={e} className="card p-3">
            <button className="w-full text-left" onClick={() => setOpen(open === e ? null : e)}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold" style={{ color: ELEMENTS[e].color }}>
                  {ELEMENTS[e].emoji} {ELEMENTS[e].label}
                </span>
                <span className="text-sm">
                  {fmtMinutes(week[e])} <span className="text-xs text-slate-500">· {share} %</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: ELEMENTS[e].color }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{ELEMENTS[e].stands}</span>
              </div>
              {avg[e] > 0 && (
                <p className={`text-[11px] ${diff >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {diff >= 0 ? "▲" : "▼"} {fmtMinutes(Math.abs(diff))} {diff >= 0 ? "mehr" : "weniger"} als im Schnitt
                </p>
              )}
            </button>
            {open === e && (
              <ul className="mt-2 flex flex-col gap-0.5 border-t border-slate-800 pt-2 text-xs text-slate-400">
                {items.length ? (
                  items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{it.label}</span>
                      <span className="whitespace-nowrap text-slate-500">{fmtMinutes(it.minutes)}</span>
                    </li>
                  ))
                ) : (
                  <li>Diese Woche noch nichts. Ideen: {ELEMENTS[e].ideas}.</li>
                )}
              </ul>
            )}
          </section>
        );
      })}

      <p className="text-[11px] text-slate-600">
        Zuordnung: Training → Feuer, Lesen → Luft, Aufgaben nach ihrem Element (in den Aufgaben-Details änderbar; Claude ordnet neue Aufgaben ein).
      </p>
    </div>
  );
}
