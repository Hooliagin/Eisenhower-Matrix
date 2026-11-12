import { useEffect, useRef, useState } from "react";

/**
 * In-app replacements for the browser's `confirm()` / `prompt()` / `alert()`: a bottom sheet in the app's own look,
 * thumb-reachable, with quick-pick chips for numbers. Used like the originals, just awaited:
 *
 *   if (await ask.confirm("Training löschen?")) …
 *   const minutes = await ask.number({ title: "Wie lange?", value: 30, unit: "min", chips: [10, 20, 30, 45, 60] });
 */

type Request =
  | { kind: "confirm"; title: string; text?: string; ok?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: "number"; title: string; text?: string; value?: number | null; unit?: string; chips?: number[]; ok?: string; resolve: (v: number | null) => void }
  | { kind: "text"; title: string; text?: string; value?: string; placeholder?: string; ok?: string; resolve: (v: string | null) => void }
  | { kind: "show"; title: string; text: string; resolve: (v: void) => void };

type Without<T> = T extends unknown ? Omit<T, "kind" | "resolve"> : never;

let push: ((r: Request) => void) | null = null;

function open<R extends Request>(kind: R["kind"], opts: object, fallback: () => unknown): Promise<never> {
  return new Promise((resolve) => {
    if (!push) return resolve(fallback() as never); // host not mounted (should not happen) → native dialog
    push({ kind, ...opts, resolve } as unknown as Request);
  });
}

export const ask = {
  confirm: (title: string, opts: { text?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> =>
    open("confirm", { title, ...opts }, () => window.confirm(title)),
  number: (opts: Without<Extract<Request, { kind: "number" }>>): Promise<number | null> =>
    open("number", opts, () => {
      const raw = window.prompt(opts.title, opts.value != null ? String(opts.value) : "");
      const n = raw === null ? NaN : Number(raw.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }),
  text: (opts: Without<Extract<Request, { kind: "text" }>>): Promise<string | null> => open("text", opts, () => window.prompt(opts.title, opts.value ?? "")),
  /** Show a (selectable) text, e.g. a message to copy by hand or an error. */
  show: (title: string, text: string): Promise<void> => open("show", { title, text }, () => window.alert(`${title}\n\n${text}`)),
};

export function SheetHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const req = queue[0];

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    return () => void (push = null);
  }, []);

  useEffect(() => {
    if (!req) return;
    setValue(req.kind === "number" ? (req.value != null ? String(req.value) : "") : req.kind === "text" ? (req.value ?? "") : "");
    // Focus after the slide-in so iOS brings up the keyboard without the sheet jumping.
    const id = setTimeout(() => {
      input.current?.focus();
      if (input.current instanceof HTMLInputElement) input.current.select();
    }, 200);
    return () => clearTimeout(id);
  }, [req]);

  if (!req) return null;

  const close = (result: unknown) => {
    (req.resolve as (v: unknown) => void)(result);
    setQueue((q) => q.slice(1));
  };
  const cancel = () => close(req.kind === "confirm" ? false : req.kind === "show" ? undefined : null);
  const submit = () => {
    if (req.kind === "confirm") return close(true);
    if (req.kind === "show") return close(undefined);
    if (req.kind === "text") return close(value.trim());
    const n = Number(value.replace(",", "."));
    close(value.trim() !== "" && Number.isFinite(n) ? n : null);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={req.title}>
      <div className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]" onClick={cancel} />
      <form
        className="relative w-full max-w-md animate-sheet rounded-t-3xl border border-b-0 border-white/10 bg-slate-900 p-4 shadow-lift"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        <h2 className="text-lg leading-snug">{req.title}</h2>
        {"text" in req && req.text && req.kind !== "show" && <p className="mt-1 text-sm text-slate-400">{req.text}</p>}

        {req.kind === "show" && (
          <textarea ref={(el) => void (input.current = el)} readOnly value={req.text} rows={Math.min(10, Math.max(3, Math.ceil(req.text.length / 38)))} className="mt-3 w-full text-sm" />
        )}

        {req.kind === "number" && (
          <>
            <div className="mt-3 flex items-center gap-2">
              <input
                ref={(el) => void (input.current = el)}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full py-3 text-center font-pixel text-3xl"
                placeholder="–"
              />
              {req.unit && <span className="w-12 text-sm text-slate-400">{req.unit}</span>}
            </div>
            {req.chips && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {req.chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => close(c)}
                    className={`btn flex-1 py-2 font-pixel text-base ${Number(value) === c ? "bg-amber-400 text-slate-950" : "bg-white/[0.08] text-slate-200"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {req.kind === "text" && (
          <input ref={(el) => void (input.current = el)} value={value} onChange={(e) => setValue(e.target.value)} placeholder={req.placeholder} className="mt-3 w-full py-3" />
        )}

        <div className="mt-4 flex gap-2">
          {req.kind !== "show" && (
            <button type="button" className="btn-ghost flex-1 py-3" onClick={cancel}>
              Abbrechen
            </button>
          )}
          <button type="submit" className={`btn flex-1 py-3 ${req.kind === "confirm" && req.danger ? "bg-red-500 text-white" : "btn-primary"}`}>
            {("ok" in req && req.ok) || (req.kind === "confirm" ? "Ja" : req.kind === "show" ? "Schließen" : "Speichern")}
          </button>
        </div>
      </form>
    </div>
  );
}
