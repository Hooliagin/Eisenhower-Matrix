import { useEffect, useState } from "react";
import { isoDate } from "../lib/dates";
import { supabase } from "../lib/supabase";

interface Trick {
  id: string;
  name: string;
  cue: string | null;
  status: "kann" | "lernt" | "idee";
  difficulty: number;
  how_to: string | null;
  mastered_on: string | null;
}

interface Game {
  id: string;
  title: string;
  kind: "nase" | "puzzle" | "kopf" | "bewegung";
  minutes: number;
  how_to: string;
}

const KIND = { nase: "👃 Nase", puzzle: "🧩 Puzzle", kopf: "🧠 Kopf", bewegung: "🐾 Bewegung" } as const;

function usePouchi() {
  const [tricks, setTricks] = useState<Trick[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  async function load() {
    const [t, g] = await Promise.all([
      supabase.from("dog_tricks").select("*").order("position"),
      supabase.from("dog_games").select("*").order("position"),
    ]);
    setTricks((t.data ?? []) as Trick[]);
    setGames((g.data ?? []) as Game[]);
  }
  useEffect(() => {
    void load();
  }, []);
  return { tricks, games, reload: load };
}

/** Practice and games count like other Pouchi time: a done task (Verbundenheit XP, Wasser). */
async function logDone(title: string, minutes: number) {
  const now = new Date().toISOString();
  await supabase.from("tasks").insert({
    title,
    quadrant: "do",
    due_date: isoDate(),
    done: true,
    done_at: now,
    actual_minutes: minutes,
    attribute: "verbunden",
    element: "wasser",
    source: "app",
  });
}

const dayIndex = () => Math.floor(Date.now() / 86_400_000);
const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

/** Fullscreen sheet: tricks Pouchi knows / is learning / could learn next, and enrichment games to tick off. */
export function PouchiPanel({ onClose }: { onClose: () => void }) {
  const { tricks, games, reload } = usePouchi();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const known = tricks.filter((t) => t.status === "kann");
  const learning = tricks.filter((t) => t.status === "lernt");
  const ideas = tricks.filter((t) => t.status === "idee");
  const gameOfDay = games.length ? games[dayIndex() % games.length] : null;
  const review = known.length ? [0, 1, 2].map((i) => known[(dayIndex() * 3 + i) % known.length]).filter((t, i, a) => a.indexOf(t) === i) : [];

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  }

  async function setStatus(t: Trick, status: Trick["status"]) {
    await supabase.from("dog_tricks").update({ status, mastered_on: status === "kann" ? isoDate() : null }).eq("id", t.id);
    if (status === "kann") {
      await supabase.from("achievements").insert({
        title: `Pouchi kann: ${t.name}`,
        icon: "🐕",
        attribute: "verbunden",
        kind: "milestone",
        earned_on: isoDate(),
      });
      flash(`🎉 Pouchi kann jetzt „${t.name}“!`);
    }
    void reload();
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "2rem" }}>
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PixelPouchi size={44} />
            <div>
              <h1 className="text-xl">Pouchi</h1>
              <p className="text-[11px] text-slate-400">
                Pomeranian · {known.length} Tricks · lernt {learning.map((t) => t.name).join(", ") || "–"}
              </p>
            </div>
          </div>
          <button className="btn-ghost h-11 w-11 text-lg" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        {msg && <p className="rounded-lg bg-amber-500/20 p-2 text-center text-sm text-amber-200">{msg}</p>}

        {learning.map((t) => (
          <section key={t.id} className="pixel-frame bg-slate-900/80 p-3" style={{ ["--glow" as string]: "#fb923c55" }}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-base">🎯 Lernt gerade: {t.name}</h2>
              <span className="text-xs text-amber-300">{stars(t.difficulty)}</span>
            </div>
            {t.cue && <p className="text-xs text-slate-400">Kommando: „{t.cue}“</p>}
            {t.how_to && <p className="mt-1 text-xs leading-relaxed text-slate-300">{t.how_to}</p>}
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost flex-1 py-2 text-xs" onClick={() => void logDone(`Pouchi: ${t.name} üben`, 5).then(() => flash("✓ 5 min Training eingetragen"))}>
                ✓ 5 min geübt
              </button>
              <button className="btn bg-emerald-600 flex-1 py-2 text-xs text-white" onClick={() => void setStatus(t, "kann")}>
                🎉 Kann er!
              </button>
            </div>
          </section>
        ))}

        {gameOfDay && (
          <section className="card p-3">
            <h2 className="text-sm">🎲 Spiel des Tages</h2>
            <GameRow g={gameOfDay} open onDone={() => void logDone(`Pouchi: ${gameOfDay.title}`, gameOfDay.minutes).then(() => flash(`✓ ${gameOfDay.title} eingetragen`))} />
          </section>
        )}

        {review.length > 0 && (
          <section className="card p-3">
            <h2 className="text-sm">🔁 Heute wiederholen</h2>
            <p className="text-[11px] text-slate-500">Bekannte Tricks frisch halten – jeden 2–3× mit Belohnung.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {review.map((t) => (
                <span key={t.id} className="rounded-full bg-teal-900/50 px-2.5 py-1 text-xs text-teal-100">
                  {t.name}
                </span>
              ))}
            </div>
            <button className="btn-ghost mt-2 w-full py-2 text-xs" onClick={() => void logDone("Pouchi: Tricks wiederholen", 5).then(() => flash("✓ Wiederholung eingetragen"))}>
              ✓ Wiederholt
            </button>
          </section>
        )}

        <section className="card p-3">
          <h2 className="text-sm">✨ Als Nächstes lernen</h2>
          <ul className="mt-1 flex flex-col">
            {ideas.map((t) => (
              <li key={t.id} className="border-t border-slate-800 py-2 first:border-0">
                <button className="flex w-full items-baseline justify-between text-left text-sm" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <span>{t.name}</span>
                  <span className="text-xs text-amber-300">{stars(t.difficulty)}</span>
                </button>
                {open === t.id && (
                  <>
                    {t.how_to && <p className="mt-1 text-xs leading-relaxed text-slate-400">{t.how_to}</p>}
                    <button className="btn-primary mt-2 w-full py-2 text-xs" onClick={() => void setStatus(t, "lernt")}>
                      🎯 Jetzt lernen
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-3">
          <h2 className="text-sm">🧸 Beschäftigung & Spiele</h2>
          <ul className="mt-1 flex flex-col">
            {games.map((g) => (
              <li key={g.id} className="border-t border-slate-800 py-2 first:border-0">
                <GameRow g={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} onDone={() => void logDone(`Pouchi: ${g.title}`, g.minutes).then(() => flash(`✓ ${g.title} eingetragen`))} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-3">
          <h2 className="text-sm">✅ Kann er schon ({known.length})</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {known.map((t) => (
              <span key={t.id} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs">
                {t.name}
              </span>
            ))}
          </div>
        </section>

        <p className="text-[10px] leading-snug text-slate-600">
          Pomeranian-Tipps: kurze Einheiten (5–10 min), winzige Leckerlis und von der Tagesration abziehen, Geschirr statt Halsband (empfindliche
          Luftröhre), keine hohen Sprünge oder Treppen-Hüpfen (Kniescheiben). Spielzeug klein genug fürs Maul, aber ohne verschluckbare Teile.
          Spiele alle paar Tage wechseln, damit sie spannend bleiben.
        </p>
      </div>
    </div>
  );
}

function GameRow({ g, open, onToggle, onDone }: { g: Game; open: boolean; onToggle?: () => void; onDone: () => void }) {
  return (
    <div>
      <button className="flex w-full items-baseline justify-between text-left text-sm" onClick={onToggle}>
        <span>{g.title}</span>
        <span className="text-[11px] text-slate-500">
          {KIND[g.kind]} · {g.minutes} min
        </span>
      </button>
      {open && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{g.how_to}</p>
          <button className="btn-ghost mt-2 w-full py-2 text-xs" onClick={onDone}>
            ✓ Gespielt
          </button>
        </>
      )}
    </div>
  );
}

/** Compact hint inside the "Tricks mit Pouchi" timer: what to work on right now. */
export function PouchiTimerHint() {
  const { tricks, games } = usePouchi();
  const [panel, setPanel] = useState(false);
  const learning = tricks.filter((t) => t.status === "lernt");
  const known = tricks.filter((t) => t.status === "kann");
  const review = known.length ? [0, 1, 2].map((i) => known[(dayIndex() * 3 + i) % known.length].name) : [];
  const game = games.length ? games[dayIndex() % games.length] : null;
  if (!tricks.length) return null;
  return (
    <div className="w-full max-w-sm rounded-xl bg-slate-900/80 p-3 text-left text-xs" onClick={(e) => e.stopPropagation()}>
      {learning.length > 0 && (
        <p>
          🎯 <b>Neu:</b> {learning.map((t) => t.name).join(", ")}
        </p>
      )}
      {review.length > 0 && (
        <p className="mt-1 text-slate-300">
          🔁 <b>Wiederholen:</b> {[...new Set(review)].join(" · ")}
        </p>
      )}
      {game && (
        <p className="mt-1 text-slate-400">
          🎲 Danach: {game.title} ({game.minutes} min)
        </p>
      )}
      <button className="btn-ghost mt-2 w-full py-1.5 text-xs" onClick={() => setPanel(true)}>
        🐕 Alle Tricks & Spiele
      </button>
      {panel && <PouchiPanel onClose={() => setPanel(false)} />}
    </div>
  );
}

/** Pixel Pomeranian: fluffy orange fur, ruff, curled tail, tiny legs. */
const SPRITE = [
  ".oO.......Oo...",
  "OOOO.....OOOO..",
  "OOOOOOOOOOOOO..",
  "OOcOOOOOOOcOO.T",
  "OOEcOOOOOcEOOTT",
  ".OccccNccccOOTT",
  ".OccmmmmmccOTTT",
  "OOcccccccccOTT.",
  "OOOOOOOOOOOOOT.",
  "OOOOOOOOOOOOO..",
  ".OOOOOOOOOOO...",
  "..OO..O..OO....",
  "..OO.....OO....",
];
const PAL: Record<string, string> = { O: "#f59e0b", o: "#b45309", c: "#fde68a", E: "#1f2937", N: "#111827", m: "#fbcfe8", T: "#fbbf24" };

export function PixelPouchi({ size = 40 }: { size?: number }) {
  const h = SPRITE.length;
  const w = SPRITE[0].length;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && SPRITE[y][x] !== ".";
  const outline: [number, number][] = [];
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++)
      if (!filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) outline.push([x, y]);
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${h + 2}`} width={(size * (w + 2)) / (h + 2)} height={size} className="pixelated animate-[bob_1.8s_ease-in-out_infinite]" aria-label="Pouchi">
      {outline.map(([x, y]) => (
        <rect key={`o${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill="#05070c" />
      ))}
      {SPRITE.flatMap((row, y) => [...row].map((c, x) => (c === "." ? null : <rect key={`${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={PAL[c]} />)))}
    </svg>
  );
}
