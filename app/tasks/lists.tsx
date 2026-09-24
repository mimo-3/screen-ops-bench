/** Lists and tables: a row action among look-alike rows, search and star, a confirm dialog, ordering. */
import { useState } from "react";
import { useReport } from "../report.ts";

export function InvoicePaid() {
  const [rows, setRows] = useState([
    { id: "INV-1031", customer: "Northwind", amount: 1200, status: "Paid" },
    { id: "INV-1034", customer: "Contoso", amount: 860, status: "Unpaid" },
    { id: "INV-1038", customer: "Fabrikam", amount: 430, status: "Unpaid" },
    { id: "INV-1040", customer: "Tailspin", amount: 2210, status: "Paid" },
    { id: "INV-1043", customer: "Litware", amount: 975, status: "Unpaid" },
    { id: "INV-1044", customer: "Adatum", amount: 640, status: "Unpaid" },
    { id: "INV-1047", customer: "Wingtip", amount: 1580, status: "Overdue" },
    { id: "INV-1049", customer: "Proseware", amount: 300, status: "Unpaid" },
  ]);
  useReport({ statuses: Object.fromEntries(rows.map((r) => [r.id, r.status])) });
  const mark = (id: string) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, status: "Paid" } : x)));
  return (
    <section className="card">
      <h1>Invoices</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.customer}</td>
              <td>${r.amount.toLocaleString("en-US")}</td>
              <td>
                <span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span>
              </td>
              <td>
                {r.status !== "Paid" && (
                  <button className="small" onClick={() => mark(r.id)}>
                    Mark paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const PEOPLE = [
  "Ada Lovelace", "Alan Turing", "Barbara Liskov", "Claude Shannon", "Donald Knuth", "Edsger Dijkstra", "Frances Allen",
  "Grace Hopper", "Hanako Yamada", "Ivan Sutherland", "John McCarthy", "Ken Thompson", "Leslie Lamport", "Margaret Hamilton",
  "Niklaus Wirth", "Radia Perlman", "Taro Yamada", "Tim Berners-Lee", "Yukihiro Matsumoto", "Shafi Goldwasser",
];

export function ContactStar() {
  const [query, setQuery] = useState("");
  const [starred, setStarred] = useState<string[]>(["Grace Hopper"]);
  useReport({ search: query, starred: [...starred].sort() });
  const shown = PEOPLE.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (p: string) => setStarred((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  return (
    <section className="card narrow">
      <h1>Contacts</h1>
      <div className="row">
        <input aria-label="Search contacts" className="search grow" placeholder="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="link" onClick={() => setQuery("")} aria-label="Clear search">
          Clear
        </button>
      </div>
      <ul className="list">
        {shown.map((p) => (
          <li key={p} className="row between">
            <span>{p}</span>
            <button className={`star ${starred.includes(p) ? "on" : ""}`} aria-pressed={starred.includes(p)} aria-label={`${starred.includes(p) ? "Unstar" : "Star"} ${p}`} onClick={() => toggle(p)}>
              {starred.includes(p) ? "★" : "☆"}
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">
        {shown.length} of {PEOPLE.length} contacts
      </p>
    </section>
  );
}

export function DeleteDraftModal() {
  const [drafts, setDrafts] = useState(["Q3 plan (old)", "Hiring memo", "Q3 plan", "Offsite agenda", "Q4 plan"]);
  const [pending, setPending] = useState<string | null>(null);
  useReport({ drafts, dialogOpen: pending !== null });
  return (
    <section className="card narrow">
      <h1>Drafts</h1>
      <ul className="list">
        {drafts.map((d) => (
          <li key={d} className="row between">
            <span>{d}</span>
            <button className="icon" aria-label={`Delete draft ${d}`} title={`Delete draft ${d}`} onClick={() => setPending(d)}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      {pending !== null && (
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="dialog">
            <h2 id="dlg-title">Delete “{pending}”?</h2>
            <p>This draft will be removed from your drafts.</p>
            <div className="actions">
              <button onClick={() => setPending(null)}>Cancel</button>
              <button
                className="danger-fill"
                onClick={() => {
                  setDrafts((xs) => xs.filter((x) => x !== pending));
                  setPending(null);
                }}
              >
                Delete draft
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function TodoReorder() {
  const [todos, setTodos] = useState(["Buy milk", "Call Alice", "Book flights", "Write report", "Water plants"]);
  useReport({ todos });
  const move = (i: number, d: number) =>
    setTodos((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  return (
    <section className="card narrow">
      <h1>Today</h1>
      <ol className="list">
        {todos.map((t, i) => (
          <li key={t} className="row between">
            <span>{t}</span>
            <span className="row">
              <button className="icon" aria-label={`Move ${t} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="icon" aria-label={`Move ${t} down`} disabled={i === todos.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
