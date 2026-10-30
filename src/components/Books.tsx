import { useState } from "react";
import { logReading, minutesThisWeek, updateBook, useBooks } from "../lib/data";
import { isoDate, weekDays, WEEKDAY_SHORT } from "../lib/dates";
import { fmtMinutes } from "../lib/schedule";
import { fire, supabase } from "../lib/supabase";
import type { Book, BookStatus } from "../lib/types";

const SECTIONS: { status: BookStatus; label: string }[] = [
  { status: "reading", label: "📖 Lese ich gerade" },
  { status: "to_buy", label: "🛍️ Muss ich besorgen" },
  { status: "want", label: "⭐ Habe ich, will ich lesen" },
  { status: "idea", label: "💡 Vorschläge" },
  { status: "done", label: "✓ Gelesen" },
];

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Lese ich",
  to_buy: "Besorgen",
  want: "Will lesen",
  idea: "Vorschlag",
  done: "Gelesen",
};

/** eBay.de search in "Bücher" – from there "Suche speichern" notifies when a copy is listed. */
function ebayUrl(book: Book) {
  const lastName = book.author?.split(" ").pop() ?? "";
  const q = `${book.title_de ?? book.title} ${lastName}`.trim();
  return `https://www.ebay.de/sch/267/i.html?_nkw=${encodeURIComponent(q)}`;
}

/** German title with copy + eBay buttons (or a note that there is none). */
function GermanTitle({ book }: { book: Book }) {
  const [copied, setCopied] = useState(false);
  if (!book.title_de && !book.no_de_edition) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(book.title_de ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Zum Kopieren:", book.title_de ?? "");
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
      {book.title_de ? (
        <>
          <span className="min-w-0 flex-1 truncate text-slate-300">🇩🇪 {book.title_de}</span>
          <button className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300" onClick={() => void copy()}>
            {copied ? "✓ kopiert" : "📋 Kopieren"}
          </button>
        </>
      ) : (
        <span className="flex-1 text-slate-500">🇩🇪 keine deutsche Ausgabe</span>
      )}
      <a className="rounded-full bg-sky-900/50 px-2 py-0.5 text-sky-200" href={ebayUrl(book)} target="_blank" rel="noreferrer">
        🔎 eBay
      </a>
    </div>
  );
}

function BookCard({ book, onPatch, onLog }: { book: Book; onPatch: (b: Book, p: Partial<Book>) => void; onLog: (b: Book) => void }) {
  const [open, setOpen] = useState(false);
  const showDe = open || book.status === "to_buy"; // to buy: copy / eBay right away

  function setProgress() {
    const raw = prompt(`Fortschritt für „${book.title}“ in % (0–100):`, String(book.progress_pct ?? ""));
    if (raw === null) return;
    const n = Math.max(0, Math.min(100, Math.round(Number(raw.replace("%", "")))));
    if (!Number.isNaN(n)) onPatch(book, n === 100 ? { status: "done" } : { progress_pct: n });
  }

  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="text-sm font-medium leading-snug">{book.title}</div>
          <div className="text-[11px] text-slate-500">
            {book.author && `${book.author} · `}
            {book.field}
          </div>
          {!showDe && book.title_de && book.title_de !== book.title && <div className="text-[11px] text-slate-400">🇩🇪 {book.title_de}</div>}
        </button>
        {book.status === "reading" && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onLog(book)}>
            + Zeit
          </button>
        )}
      </div>
      {showDe && <GermanTitle book={book} />}
      {book.status === "reading" && (
        <button onClick={setProgress} className="mt-2 flex w-full items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${book.progress_pct ?? 0}%` }} />
          </div>
          <span className="w-10 text-right text-[11px] text-slate-400">{book.progress_pct != null ? `${book.progress_pct} %` : "– %"}</span>
        </button>
      )}
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {book.notes && <p className="text-xs text-slate-400">{book.notes}</p>}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(STATUS_LABEL) as BookStatus[]).map((s) => (
              <button
                key={s}
                disabled={s === book.status}
                onClick={() => onPatch(book, { status: s })}
                className={`rounded-full px-2.5 py-1 text-[11px] ${s === book.status ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400"}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            <button
              className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-red-400"
              onClick={() => confirm(`„${book.title}“ entfernen?`) && fire(supabase.from("books").delete().eq("id", book.id))}
            >
              Entfernen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BooksPanel() {
  const { data, setData, refresh } = useBooks();
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [field, setField] = useState("");
  const [status, setStatus] = useState<BookStatus>("to_buy");

  const week = minutesThisWeek(data.log);
  const days = weekDays();
  const perDay = days.map((d) => data.log.filter((l) => l.log_date === isoDate(d)).reduce((s, l) => s + l.minutes, 0));
  const maxDay = Math.max(30, ...perDay);
  const fields = [...new Set(data.books.map((b) => b.field))];

  const patch = (b: Book, p: Partial<Book>) => {
    const next = { ...p };
    if (p.status === "done") Object.assign(next, { progress_pct: 100 });
    setData({ ...data, books: data.books.map((x) => (x.id === b.id ? { ...x, ...next } : x)) });
    void updateBook(b.id, p);
  };

  async function log(book: Book | null) {
    const raw = prompt(book ? `Wie viele Minuten hast du heute „${book.title}“ gelesen?` : "Wie viele Minuten hast du heute gelesen?", "30");
    const n = raw ? Math.round(Number(raw.replace(",", "."))) : 0;
    if (n > 0) {
      await logReading(n, book?.id ?? null);
      void refresh();
    }
  }

  async function addBook() {
    if (!title.trim()) return;
    await supabase.from("books").insert({ title: title.trim(), author: author.trim() || null, field: field.trim() || "Sonstiges", status });
    setTitle("");
    setAuthor("");
    void refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-300">⏱ Diese Woche gelesen</h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => log(null)}>+ Lesezeit</button>
        </div>
        <p className="text-2xl font-semibold">{week ? fmtMinutes(week) : "0 min"}</p>
        <div className="mt-2 flex h-14 items-end gap-1">
          {perDay.map((m, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-sm bg-emerald-500" style={{ height: `${Math.max(2, (m / maxDay) * 40)}px`, opacity: m ? 1 : 0.15 }} title={`${m} min`} />
              <span className={`text-[10px] ${isoDate(days[i]) === isoDate() ? "text-white" : "text-slate-500"}`}>{WEEKDAY_SHORT[i]}</span>
            </div>
          ))}
        </div>
      </section>

      {SECTIONS.map(({ status: st, label }) => {
        const books = data.books.filter((b) => b.status === st);
        if (!books.length) return null;
        if (st === "done" && !showDone)
          return (
            <button key={st} className="text-left text-sm text-slate-500" onClick={() => setShowDone(true)}>
              ▸ {label}: {books.length}
            </button>
          );
        return (
          <section key={st} className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-slate-300">
              {label} · {books.length}
            </h2>
            {books.map((b) => (
              <BookCard key={b.id} book={b} onPatch={patch} onLog={log} />
            ))}
          </section>
        );
      })}

      <section className="card flex flex-col gap-2 p-3">
        <h2 className="text-sm font-semibold text-slate-300">Buch hinzufügen</h2>
        <input className="py-1.5 text-sm" placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Autor" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <input className="min-w-0 flex-1 py-1.5 text-sm" placeholder="Feld" list="book-fields" value={field} onChange={(e) => setField(e.target.value)} />
          <datalist id="book-fields">{fields.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <div className="flex gap-2">
          <select className="flex-1 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
            {(Object.keys(STATUS_LABEL) as BookStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={addBook}>Hinzufügen</button>
        </div>
      </section>
    </div>
  );
}
