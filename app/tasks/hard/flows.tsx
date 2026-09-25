/**
 * Hard suite, multi-screen flows: several in-app views, facts looked up on one view and used on
 * another, server-side validation that must be read and corrected, results that arrive later,
 * drafts lost when navigating away, and undo toasts.
 */
import { useState, type ReactNode } from "react";
import { useReport } from "../../report.ts";
import type { TaskPage } from "../index.ts";

/** "Today" for every page in this module. */
const TODAY = "2026-09-25";

function SideNav({ label, items, current, go }: { label: string; items: string[]; current: string; go: (v: string) => void }) {
  return (
    <nav aria-label={label} className="flows-nav">
      {items.map((i) => (
        <button key={i} aria-current={current === i ? "page" : undefined} className={current === i ? "active" : ""} onClick={() => go(i)}>
          {i}
        </button>
      ))}
    </nav>
  );
}

function Layout({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flows-layout">
      {nav}
      <section className="card flows-main">{children}</section>
    </div>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;

/* ------------------------------------------------------------------------------------------------
 * support-refund: read a ticket, find the right order among look-alikes (async search), refund
 * exactly what was asked, then answer and solve the ticket. A reply typed before leaving is lost.
 * ---------------------------------------------------------------------------------------------- */

type Item = { name: string; qty: number; price: number };
type Order = { id: string; customer: string; email: string; date: string; items: Item[] };

const ORDERS: Order[] = [
  { id: "ORD-58302", customer: "Priya Nair", email: "priya@nair.dev", date: "2026-09-24", items: [{ name: "Linen Napkins (set of 6)", qty: 1, price: 26 }] },
  { id: "ORD-58297", customer: "Lena Fischer", email: "lena.fischer@fabrikam.de", date: "2026-09-23", items: [{ name: "Bamboo Tray", qty: 2, price: 18 }] },
  { id: "ORD-58288", customer: "Omar Haddad", email: "omar@haddad.me", date: "2026-09-22", items: [{ name: "Glass Kettle", qty: 1, price: 48 }] },
  { id: "ORD-58270", customer: "Tomás Rivera", email: "tomas.rivera@tailspin.com", date: "2026-09-19", items: [{ name: "Ceramic Teapot", qty: 1, price: 34 }] },
  { id: "ORD-58251", customer: "Hanako Yamada", email: "hanako@yamada.jp", date: "2026-09-16", items: [{ name: "Matcha Whisk", qty: 3, price: 12 }] },
  {
    id: "ORD-58231",
    customer: "Mei Chen",
    email: "mei.chen@northwind.io",
    date: "2026-09-12",
    items: [
      { name: "Ceramic Teapot", qty: 2, price: 34 },
      { name: "Ceramic Teapot Lid", qty: 1, price: 6 },
      { name: "Tea Cups (set of 4)", qty: 1, price: 22 },
    ],
  },
  {
    id: "ORD-58213",
    customer: "Mei Chen",
    email: "mei.chen@contoso.com",
    date: "2026-09-12",
    items: [
      { name: "Ceramic Teapot", qty: 2, price: 34 },
      { name: "Tea Cups (set of 4)", qty: 1, price: 22 },
    ],
  },
  { id: "ORD-58140", customer: "Ada Brooks", email: "ada@brooks.io", date: "2026-09-08", items: [{ name: "Tea Tin", qty: 2, price: 9 }] },
  { id: "ORD-57980", customer: "Mei Chen", email: "mei.chen@northwind.io", date: "2026-09-03", items: [{ name: "Ceramic Teapot", qty: 1, price: 34 }] },
];

type Ticket = { id: string; subject: string; name: string; email: string; received: string; body: string };
const TICKETS: Ticket[] = [
  {
    id: "T-4175",
    subject: "Kettle lid is loose",
    name: "Omar Haddad",
    email: "omar@haddad.me",
    received: "2026-09-24 16:02",
    body: "The lid of my new glass kettle does not close properly. Is this normal?",
  },
  {
    id: "T-4172",
    subject: "Broken teapot",
    name: "Mei Chen",
    email: "mei.chen@northwind.io",
    received: "2026-09-24 09:41",
    body:
      "Hi! My order from September 12 arrived this morning. One of the two ceramic teapots was smashed in the box; the other teapot, the spare lid and the cups are all fine. Could you refund just the broken teapot back to my card? I'd rather not get store credit. Thanks, Mei",
  },
  {
    id: "T-4170",
    subject: "Teapot on induction?",
    name: "Mei Chen",
    email: "mei.chen@contoso.com",
    received: "2026-09-23 18:27",
    body: "Hello, does the ceramic teapot from my September 12 order work on an induction hob? Best, Mei",
  },
];

const REASONS = ["Damaged on arrival", "Wrong item sent", "Not as described", "Changed mind", "Late delivery"];
const METHODS = ["Store credit", "Original payment method"];

type Refund = { order: string; items: Record<string, number>; reason: string; method: string; amount: number };
type TicketState = { status: string; replies: string[] };

function SupportRefund() {
  const [view, setView] = useState("Tickets");
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [tickets, setTickets] = useState<Record<string, TicketState>>(() => Object.fromEntries(TICKETS.map((t) => [t.id, { status: "Open", replies: [] }])));
  useReport({ refunds, tickets });

  return (
    <Layout nav={<SideNav label="Helpdesk" items={["Tickets", "Orders"]} current={view} go={setView} />}>
      {view === "Tickets" ? (
        <TicketsView tickets={tickets} send={(id, reply, status) => setTickets((ts) => ({ ...ts, [id]: { status, replies: reply ? [...ts[id]!.replies, reply] : ts[id]!.replies } }))} />
      ) : (
        <OrdersView refunds={refunds} addRefund={(r) => setRefunds((rs) => [...rs, r])} />
      )}
    </Layout>
  );
}

function TicketsView({ tickets, send }: { tickets: Record<string, TicketState>; send: (id: string, reply: string | null, status: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("Open");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const t = TICKETS.find((x) => x.id === open);
  if (!t) {
    return (
      <>
        <h1>Tickets</h1>
        <table className="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Subject</th>
              <th>Requester</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TICKETS.map((x) => (
              <tr key={x.id}>
                <td>{x.id}</td>
                <td>
                  <button className="link" onClick={() => setOpen(x.id)}>
                    {x.subject}
                  </button>
                </td>
                <td>{x.name}</td>
                <td>
                  <span className="badge">{tickets[x.id]!.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  const st = tickets[t.id]!;
  return (
    <>
      <button className="link" onClick={() => setOpen(null)}>
        ← All tickets
      </button>
      <h1>
        {t.id} · {t.subject}
      </h1>
      <p className="muted">
        From {t.name} &lt;{t.email}&gt; · received {t.received} · status {st.status}
      </p>
      <blockquote className="flows-quote">{t.body}</blockquote>
      {st.replies.map((r, i) => (
        <p key={i} className="flows-reply">
          <strong>You:</strong> {r}
        </p>
      ))}
      <label className="field">
        <span>Reply</span>
        <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      <div className="actions">
        <label className="inline">
          Status after sending
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["Open", "Pending", "Solved"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          onClick={() => {
            if (!reply.trim()) return setError("Write a reply before sending.");
            setError("");
            send(t.id, reply, status);
            setReply("");
            setSent(`Reply sent. Ticket is now ${status}.`);
          }}
        >
          Send reply
        </button>
        <button
          onClick={() => {
            setError("");
            send(t.id, null, status);
            setSent(`Ticket is now ${status}.`);
          }}
        >
          Update status
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {sent && <p role="status">{sent}</p>}
    </>
  );
}

function OrdersView({ refunds, addRefund }: { refunds: Refund[]; addRefund: (r: Refund) => void }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const search = () => {
    const q = query.trim().toLowerCase();
    setSearching(true);
    setResults(null);
    setTimeout(() => {
      setResults(q ? ORDERS.filter((o) => [o.id, o.customer, o.email].some((f) => f.toLowerCase().includes(q))) : ORDERS);
      setSearching(false);
    }, 1200);
  };

  const order = ORDERS.find((o) => o.id === open);
  if (order) return <OrderDetail order={order} refunds={refunds.filter((r) => r.order === order.id)} addRefund={addRefund} back={() => setOpen(null)} />;

  const shown = results ?? ORDERS.slice(0, 4);
  return (
    <>
      <h1>Orders</h1>
      <form
        className="row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input aria-label="Search orders" className="search grow" placeholder="Order number, name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit">Search</button>
      </form>
      {searching ? (
        <p role="status" className="muted">
          Searching orders…
        </p>
      ) : (
        <>
          <h2 className="flows-sub">{results ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Recent orders"}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="link" onClick={() => setOpen(o.id)}>
                      {o.id}
                    </button>
                  </td>
                  <td>{o.customer}</td>
                  <td>{o.date}</td>
                  <td>{money(o.items.reduce((s, i) => s + i.qty * i.price, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function OrderDetail({ order, refunds, addRefund, back }: { order: Order; refunds: Refund[]; addRefund: (r: Refund) => void; back: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("Store credit");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const refunded = (name: string) => refunds.reduce((s, r) => s + (r.items[name] ?? 0), 0);

  const issue = () => {
    const errs: string[] = [];
    const items: Record<string, number> = {};
    for (const i of order.items) {
      const raw = (qty[i.name] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) errs.push(`Enter a whole number for ${i.name}.`);
      else if (n > i.qty - refunded(i.name)) errs.push(`You can refund at most ${i.qty - refunded(i.name)} × ${i.name}.`);
      else if (n > 0) items[i.name] = n;
    }
    if (!errs.length && !Object.keys(items).length) errs.push("Enter a refund quantity for at least one item.");
    if (!reason) errs.push("Choose a refund reason.");
    setErrors(errs);
    setDone("");
    if (errs.length) return;
    const amount = order.items.reduce((s, i) => s + (items[i.name] ?? 0) * i.price, 0);
    setBusy(true);
    setTimeout(() => {
      addRefund({ order: order.id, items, reason, method, amount });
      setBusy(false);
      setQty({});
      setReason("");
      setDone(`Refund of ${money(amount)} issued to ${method.toLowerCase()}.`);
    }, 1000);
  };

  return (
    <>
      <button className="link" onClick={back}>
        ← Back to orders
      </button>
      <h1>Order {order.id}</h1>
      <p className="muted">
        {order.customer} · {order.email} · placed {order.date}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Ordered</th>
            <th>Refunded</th>
            <th>Refund now</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.name}>
              <td>{i.name}</td>
              <td>{money(i.price)}</td>
              <td>{i.qty}</td>
              <td>{refunded(i.name)}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={i.qty}
                  className="flows-qty"
                  aria-label={`Refund quantity for ${i.name}`}
                  value={qty[i.name] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [i.name]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row flows-gap">
        <fieldset className="field">
          <legend>Refund to</legend>
          {METHODS.map((m) => (
            <label key={m} className="inline">
              <input type="radio" name="refund-method" checked={method === m} onChange={() => setMethod(m)} /> {m}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        {busy && (
          <span role="status" className="muted">
            Processing refund…
          </span>
        )}
        {done && (
          <span role="status" className="muted">
            {done}
          </span>
        )}
        <button className="primary" disabled={busy} onClick={issue}>
          Issue refund
        </button>
      </div>
      {refunds.length > 0 && (
        <>
          <h2 className="flows-sub">Refund history</h2>
          <ul className="list">
            {refunds.map((r, i) => (
              <li key={i}>
                {money(r.amount)} · {Object.entries(r.items).map(([n, q]) => `${q} × ${n}`).join(", ")} · {r.reason} · {r.method}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * payout-setup: copy facts from the right documents into a form prefilled with stale values,
 * survive the unsaved-changes guard, and fix what the server rejects after a delay.
 * ---------------------------------------------------------------------------------------------- */

type Payout = { holder: string; iban: string; bic: string; vat: string; currency: string; threshold: string };
const STALE: Payout = { holder: "Brightwave GmbH", iban: "DE44 5001 0517 5407 3249 31", bic: "INGDDEFFXXX", vat: "", currency: "USD", threshold: "50" };
const LEGAL_NAME = "Brightwave Solutions GmbH";
const CURRENT = { iban: "DE89370400440532013000", bic: "COBADEFFXXX", vat: "DE318442907" };
const compact = (s: string) => s.replace(/\s+/g, "").toUpperCase();

function PayoutSetup() {
  const [view, setView] = useState("Overview");
  const [saved, setSaved] = useState<Payout>(STALE);
  const [draft, setDraft] = useState<Payout>(STALE);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [discards, setDiscards] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [accepted, setAccepted] = useState<null | { holder: string; iban: string; bic: string; vat: string; currency: string; threshold: number }>(null);
  const [acceptedSubmissions, setAcceptedSubmissions] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const status = accepted ? "Pending verification" : "Incomplete";
  useReport({ status, submitted: accepted, acceptedSubmissions, attempts, discards, savedDraft: saved });

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const go = (v: string) => {
    if (v === view) return;
    if (view === "Payout details" && dirty) return setLeaving(v);
    setView(v);
  };
  const set = (k: keyof Payout) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = () => {
    const errs: string[] = [];
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact(draft.iban))) errs.push("Enter a valid IBAN.");
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(compact(draft.bic))) errs.push("Enter a valid BIC (8 or 11 characters).");
    if (!/^\d+$/.test(draft.threshold.trim())) errs.push("Payout threshold must be a whole number.");
    setErrors(errs);
    setNote("");
    if (errs.length) return;
    setSaved(draft);
    setAttempts((n) => n + 1);
    setBusy(true);
    const d = draft;
    setTimeout(() => {
      const server: string[] = [];
      if (d.holder.trim() !== LEGAL_NAME) server.push("Account holder must exactly match the legal name on your certificate of registration.");
      if (compact(d.iban) !== CURRENT.iban || compact(d.bic) !== CURRENT.bic) server.push("The IBAN and BIC are not confirmed by a current bank confirmation letter.");
      if (!compact(d.vat)) server.push("VAT ID is required for companies registered in the EU.");
      else if (compact(d.vat) !== CURRENT.vat) server.push("VAT ID does not match the registration records.");
      if (d.currency !== "EUR") server.push(`Payout currency ${d.currency} is not supported for accounts in Germany.`);
      const min = d.currency === "EUR" ? 100 : 50;
      if (Number(d.threshold) < min) server.push(`Payout threshold must be at least ${min} ${d.currency}.`);
      if (Number(d.threshold) > 10000) server.push(`Payout threshold must be at most 10000 ${d.currency}.`);
      setBusy(false);
      setErrors(server);
      if (server.length) return;
      setAccepted({ holder: d.holder.trim(), iban: compact(d.iban), bic: compact(d.bic), vat: compact(d.vat), currency: d.currency, threshold: Number(d.threshold) });
      setAcceptedSubmissions((n) => n + 1);
      setNote("Submitted. Your payout details are pending verification.");
    }, 1500);
  };

  return (
    <Layout nav={<SideNav label="Supplier portal" items={["Overview", "Company documents", "Payout details"]} current={view} go={go} />}>
      {view === "Overview" && (
        <>
          <h1>Brightwave supplier account</h1>
          <p>
            Payout details: <strong>{status}</strong>
          </p>
          <p className="muted">Before your first payout, submit payout details that match your company documents. Payouts to accounts in Germany are made in euros.</p>
        </>
      )}
      {view === "Company documents" && (
        <>
          <h1>Company documents</h1>
          <article className="flows-doc">
            <h2>Bank confirmation letter</h2>
            <p className="muted">Issued 2024-11-15 · Superseded on 2026-06-02</p>
            <dl>
              <dt>Account holder</dt>
              <dd>Brightwave GmbH</dd>
              <dt>IBAN</dt>
              <dd>DE44 5001 0517 5407 3249 31</dd>
              <dt>BIC</dt>
              <dd>INGDDEFFXXX</dd>
            </dl>
          </article>
          <article className="flows-doc">
            <h2>Certificate of registration</h2>
            <p className="muted">Issued 2023-03-01 · Valid</p>
            <dl>
              <dt>Legal name</dt>
              <dd>{LEGAL_NAME}</dd>
              <dt>Trading as</dt>
              <dd>Brightwave</dd>
              <dt>Registration number</dt>
              <dd>HRB 204871</dd>
              <dt>VAT ID</dt>
              <dd>DE 318 442 907</dd>
              <dt>Registered office</dt>
              <dd>Speicherstraße 12, 20457 Hamburg, Germany</dd>
            </dl>
          </article>
          <article className="flows-doc">
            <h2>Bank confirmation letter</h2>
            <p className="muted">Issued 2026-06-02 · Current</p>
            <dl>
              <dt>Account holder</dt>
              <dd>{LEGAL_NAME}</dd>
              <dt>IBAN</dt>
              <dd>DE89 3704 0044 0532 0130 00</dd>
              <dt>BIC</dt>
              <dd>COBADEFFXXX</dd>
              <dt>Bank</dt>
              <dd>Commerzbank, Hamburg</dd>
            </dl>
          </article>
        </>
      )}
      {view === "Payout details" && (
        <>
          <h1>Payout details</h1>
          <p className="muted">Status: {status}</p>
          <label className="field">
            <span>Account holder</span>
            <input value={draft.holder} onChange={set("holder")} />
          </label>
          <label className="field">
            <span>IBAN</span>
            <input value={draft.iban} onChange={set("iban")} />
          </label>
          <label className="field">
            <span>BIC</span>
            <input value={draft.bic} onChange={set("bic")} />
          </label>
          <label className="field">
            <span>VAT ID</span>
            <input value={draft.vat} onChange={set("vat")} />
          </label>
          <label className="field">
            <span>Payout currency</span>
            <select value={draft.currency} onChange={set("currency")}>
              {["USD", "EUR", "GBP"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Payout threshold</span>
            <input value={draft.threshold} onChange={set("threshold")} inputMode="numeric" aria-describedby="flows-threshold-hint" />
          </label>
          <p id="flows-threshold-hint" className="muted">
            Payouts are sent once your balance reaches this amount. The minimum depends on the currency.
          </p>
          {errors.length > 0 && (
            <ul role="alert" className="error">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            <span className="muted">{busy ? "Verifying…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
            {note && <span role="status">{note}</span>}
            <button onClick={() => setSaved(draft)} disabled={busy}>
              Save draft
            </button>
            <button className="primary" onClick={submit} disabled={busy}>
              Submit for verification
            </button>
          </div>
        </>
      )}
      {leaving && (
        <div className="backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="flows-leave" onKeyDown={(e) => e.key === "Escape" && setLeaving(null)}>
            <h2 id="flows-leave">Leave without saving?</h2>
            <p>Your changes to the payout details have not been saved.</p>
            <div className="actions">
              <button autoFocus onClick={() => setLeaving(null)}>Stay on this page</button>
              <button
                className="danger-fill"
                onClick={() => {
                  setDraft(saved);
                  setDiscards((n) => n + 1);
                  setErrors([]);
                  setView(leaving);
                  setLeaving(null);
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ------------------------------------------------------------------------------------------------
 * drive-cleanup: facts only in an async details pane, a folder picker that loads each level, a
 * look-alike destination, a delete with an undo toast, and restoring the right trashed copy.
 * ---------------------------------------------------------------------------------------------- */

const SEP = " / ";
const DRIVE_FOLDERS = [
  "My Drive",
  "My Drive / Inbox uploads",
  "My Drive / Finance",
  "My Drive / Finance / 2025",
  "My Drive / Finance / 2025 / Q3",
  "My Drive / Finance / 2025 / Q4",
  "My Drive / Finance / 2026",
  "My Drive / Finance / 2026 / Q2",
  "My Drive / Finance / 2026 / Q3",
  "My Drive / Marketing",
  "My Drive / Marketing / Archive",
];
const INITIAL_FILES: Record<string, string[]> = {
  "My Drive": ["Welcome.pdf"],
  "My Drive / Inbox uploads": ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932 (1).pdf", "Invoice-0932.pdf", "Invoice-0935.pdf", "Team photo.jpg"],
  "My Drive / Finance": ["Budget 2026.xlsx"],
  "My Drive / Finance / 2025": [],
  "My Drive / Finance / 2025 / Q3": ["Invoice-0612.pdf"],
  "My Drive / Finance / 2025 / Q4": [],
  "My Drive / Finance / 2026": [],
  "My Drive / Finance / 2026 / Q2": ["Invoice-0788.pdf"],
  "My Drive / Finance / 2026 / Q3": ["Invoice-0901.pdf"],
  "My Drive / Marketing": ["Brand guidelines v4.pdf"],
  "My Drive / Marketing / Archive": ["Logo pack.zip"],
};
type Meta = { type: string; size: string; modified: string; owner: string; invoiceDate?: string; vendor?: string };
const META: Record<string, Meta> = {
  "Welcome.pdf": { type: "PDF", size: "88 KB", modified: "2026-01-05", owner: "Workspace" },
  "Invoice-0829.pdf": { type: "PDF", size: "142 KB", modified: "2026-09-21", owner: "Ops mailbox", invoiceDate: "2026-09-03", vendor: "Litware" },
  "Invoice-0931.pdf": { type: "PDF", size: "131 KB", modified: "2026-09-22", owner: "Ops mailbox", invoiceDate: "2026-07-14", vendor: "Contoso" },
  "Invoice-0932.pdf": { type: "PDF", size: "127 KB", modified: "2026-09-22", owner: "Ops mailbox", invoiceDate: "2026-08-02", vendor: "Fabrikam" },
  "Invoice-0932 (1).pdf": { type: "PDF", size: "127 KB", modified: "2026-09-23", owner: "Ops mailbox", invoiceDate: "2026-08-02", vendor: "Fabrikam" },
  "Invoice-0935.pdf": { type: "PDF", size: "118 KB", modified: "2026-09-23", owner: "Ops mailbox", invoiceDate: "2026-06-30", vendor: "Tailspin" },
  "Team photo.jpg": { type: "JPEG image", size: "2.4 MB", modified: "2026-09-24", owner: "Hanako Yamada" },
  "Budget 2026.xlsx": { type: "Spreadsheet", size: "56 KB", modified: "2026-08-30", owner: "Finance" },
  "Invoice-0612.pdf": { type: "PDF", size: "120 KB", modified: "2025-08-11", owner: "Ops mailbox", invoiceDate: "2025-08-04", vendor: "Northwind" },
  "Invoice-0788.pdf": { type: "PDF", size: "133 KB", modified: "2026-05-20", owner: "Ops mailbox", invoiceDate: "2026-05-18", vendor: "Adatum" },
  "Invoice-0901.pdf": { type: "PDF", size: "129 KB", modified: "2026-07-09", owner: "Ops mailbox", invoiceDate: "2026-07-06", vendor: "Wingtip" },
  "Brand guidelines v4.pdf": { type: "PDF", size: "4.1 MB", modified: "2026-09-01", owner: "Marketing" },
  "Brand guidelines v3.pdf": { type: "PDF", size: "3.8 MB", modified: "2026-02-14", owner: "Marketing" },
  "Brand guidelines v2.pdf": { type: "PDF", size: "3.2 MB", modified: "2025-06-02", owner: "Marketing" },
  "Logo pack.zip": { type: "ZIP archive", size: "12 MB", modified: "2025-11-30", owner: "Marketing" },
};
type Trashed = { id: number; name: string; from: string; deletedOn: string; origin?: string };
/** Folder each file was in when the page loaded; the report describes trashed files by it, whatever route they took. */
const ORIGIN: Record<string, string> = Object.fromEntries(Object.entries(INITIAL_FILES).flatMap(([folder, names]) => names.map((n) => [n, folder])));
const INITIAL_TRASH: Trashed[] = [
  { id: 1, name: "Brand guidelines v3.pdf", from: "My Drive / Marketing / Archive", deletedOn: "2026-09-02" },
  { id: 2, name: "Brand guidelines v2.pdf", from: "My Drive / Marketing / Archive", deletedOn: "2026-08-20" },
  { id: 3, name: "Brand guidelines v3.pdf", from: "My Drive / Marketing", deletedOn: "2026-09-24" },
];
type DriveModel = { files: Record<string, string[]>; trash: Trashed[] };

const subfolders = (path: string) => DRIVE_FOLDERS.filter((f) => f.startsWith(path + SEP) && !f.slice(path.length + SEP.length).includes(SEP));
const leaf = (path: string) => path.split(SEP).at(-1)!;
const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));

function DriveCleanup() {
  const [model, setModel] = useState<DriveModel>({ files: INITIAL_FILES, trash: INITIAL_TRASH });
  const [history, setHistory] = useState<DriveModel[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState("My Drive");
  const [path, setPath] = useState("My Drive");
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<{ name: string; loading: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const [nextId, setNextId] = useState(10);
  useReport({
    folders: Object.fromEntries(DRIVE_FOLDERS.map((f) => [f, sorted(model.files[f] ?? [])])),
    trash: model.trash.map(({ name, from, deletedOn, origin }) => ({ name, from: origin ?? from, deletedOn })).sort((a, b) => a.name.localeCompare(b.name) || a.from.localeCompare(b.from)),
  });

  const commit = (next: DriveModel, message: string) => {
    setHistory((h) => [...h, model]);
    setModel(next);
    setToast(message);
    setSelected([]);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setModel(prev);
    setHistory((h) => h.slice(0, -1));
    setToast(null);
  };
  const openFolder = (p: string) => {
    setPath(p);
    setSelected([]);
    setDetails(null);
  };
  const showDetails = (name: string) => {
    setDetails({ name, loading: true });
    setTimeout(() => setDetails((d) => (d && d.name === name ? { name, loading: false } : d)), 700);
  };
  const plural = (n: number) => `${n} item${n === 1 ? "" : "s"}`;

  const moveHere = (dest: string) => {
    const files = { ...model.files, [path]: model.files[path]!.filter((f) => !selected.includes(f)), [dest]: [...model.files[dest]!, ...selected] };
    commit({ ...model, files }, `Moved ${plural(selected.length)} to ${leaf(dest)}`);
    setMoving(false);
    setDetails(null);
  };
  const del = () => {
    const files = { ...model.files, [path]: model.files[path]!.filter((f) => !selected.includes(f)) };
    const trash = [...model.trash, ...selected.map((name, i) => ({ id: nextId + i, name, from: path, deletedOn: TODAY, origin: ORIGIN[name] ?? path }))];
    setNextId((n) => n + selected.length);
    commit({ files, trash }, `${plural(selected.length)} moved to Trash`);
    setDetails(null);
  };
  const restore = (t: Trashed) =>
    commit({ files: { ...model.files, [t.from]: [...model.files[t.from]!, t.name] }, trash: model.trash.filter((x) => x.id !== t.id) }, `Restored ${t.name} to ${leaf(t.from)}`);
  const purge = (t: Trashed) => commit({ ...model, trash: model.trash.filter((x) => x.id !== t.id) }, `Deleted ${t.name} forever`);

  const files = sorted(model.files[path] ?? []);
  const meta = details && META[details.name];
  return (
    <Layout
      nav={
        <SideNav
          label="Drive"
          items={["My Drive", "Trash"]}
          current={view}
          go={(v) => {
            setView(v);
            openFolder("My Drive");
          }}
        />
      }
    >
      {view === "Trash" ? (
        <>
          <h1>Trash</h1>
          <p className="muted">Today is {TODAY}. Items in Trash are deleted forever after 30 days.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Deleted from</th>
                <th>Deleted on</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {model.trash.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.from}</td>
                  <td>{t.deletedOn}</td>
                  <td>
                    <button className="small" onClick={() => restore(t)}>
                      Restore
                    </button>{" "}
                    <button className="link danger" onClick={() => purge(t)}>
                      Delete forever
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="flows-split">
          <div className="grow">
            <nav aria-label="Breadcrumb" className="row flows-crumbs">
              {path.split(SEP).map((part, i, all) => {
                const p = all.slice(0, i + 1).join(SEP);
                return i === all.length - 1 ? (
                  <strong key={p} aria-current="location">
                    {part}
                  </strong>
                ) : (
                  <span key={p}>
                    <button className="link" onClick={() => openFolder(p)}>
                      {part}
                    </button>
                    ›
                  </span>
                );
              })}
            </nav>
            <div className="row flows-toolbar">
              <span className="muted grow">{selected.length ? `${selected.length} selected` : `${files.length} files`}</span>
              <button disabled={!selected.length} onClick={() => setMoving(true)}>
                Move to…
              </button>
              <button disabled={!selected.length} className="danger-fill" onClick={del}>
                Delete
              </button>
            </div>
            <ul className="list">
              {subfolders(path).map((f) => (
                <li key={f}>
                  <button className="link" onClick={() => openFolder(f)}>
                    📁 {leaf(f)}
                  </button>
                </li>
              ))}
            </ul>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Modified</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${f}`}
                        checked={selected.includes(f)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f] : s.filter((x) => x !== f)))}
                      />
                    </td>
                    <td>
                      <button className="link" onClick={() => showDetails(f)}>
                        {f}
                      </button>
                    </td>
                    <td>{META[f]?.modified}</td>
                    <td>{META[f]?.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {details && (
            <aside aria-label="Details" className="flows-aside">
              <div className="row between">
                <h2>{details.name}</h2>
                <button className="icon" aria-label="Close details" onClick={() => setDetails(null)}>
                  ×
                </button>
              </div>
              {details.loading || !meta ? (
                <p role="status" className="muted">
                  Loading details…
                </p>
              ) : (
                <dl>
                  <dt>Type</dt>
                  <dd>{meta.type}</dd>
                  <dt>Size</dt>
                  <dd>{meta.size}</dd>
                  <dt>Modified</dt>
                  <dd>{meta.modified}</dd>
                  <dt>Owner</dt>
                  <dd>{meta.owner}</dd>
                  {meta.vendor && (
                    <>
                      <dt>Vendor</dt>
                      <dd>{meta.vendor}</dd>
                    </>
                  )}
                  {meta.invoiceDate && (
                    <>
                      <dt>Invoice date</dt>
                      <dd>{meta.invoiceDate}</dd>
                    </>
                  )}
                </dl>
              )}
            </aside>
          )}
        </div>
      )}
      {moving && <MoveDialog count={selected.length} source={path} cancel={() => setMoving(false)} move={moveHere} />}
      {toast && (
        <div className="flows-toast" role="status">
          <span>{toast}</span>
          {history.length > 0 && (
            <button className="link" onClick={undo}>
              Undo
            </button>
          )}
          <button className="icon" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Layout>
  );
}

function MoveDialog({ count, source, cancel, move }: { count: number; source: string; cancel: () => void; move: (dest: string) => void }) {
  const [at, setAt] = useState("My Drive");
  const [loading, setLoading] = useState(false);
  const enter = (p: string) => {
    setAt(p);
    setLoading(true);
    setTimeout(() => setLoading(false), 600);
  };
  const parent = at.includes(SEP) ? at.slice(0, at.lastIndexOf(SEP)) : null;
  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="flows-move" onKeyDown={(e) => e.key === "Escape" && cancel()}>
        <h2 id="flows-move">Move {count === 1 ? "1 item" : `${count} items`}</h2>
        <p className="muted">Destination: {at}</p>
        {parent && (
          <button className="link" onClick={() => enter(parent)}>
            ← Up to {leaf(parent)}
          </button>
        )}
        {loading ? (
          <p role="status" className="muted">
            Loading folders…
          </p>
        ) : (
          <ul className="list">
            {subfolders(at).map((f) => (
              <li key={f}>
                <button className="link" onClick={() => enter(f)}>
                  📁 {leaf(f)}
                </button>
              </li>
            ))}
            {subfolders(at).length === 0 && <li className="muted">No folders</li>}
          </ul>
        )}
        <div className="actions">
          <button autoFocus onClick={cancel}>Cancel</button>
          <button className="primary" disabled={loading || at === source} onClick={() => move(at)}>
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * event-update: look up a room on another view (async), per-tab saves where switching tabs
 * discards the draft (with a Restore toast), an order dependency enforced by validation, and a
 * schedule whose overlaps are rejected.
 * ---------------------------------------------------------------------------------------------- */

type Room = { label: string; venue: string; room: string; seats: number; projector: boolean };
const ROOMS: Room[] = [
  { label: "Main Street Loft", venue: "Main Street Loft", room: "Loft", seats: 150, projector: true },
  { label: "Harbor Hall — Room A", venue: "Harbor Hall", room: "Room A", seats: 180, projector: false },
  { label: "Harbor Hall — Room B", venue: "Harbor Hall", room: "Room B", seats: 240, projector: true },
  { label: "Harbor Hall — Room C", venue: "Harbor Hall", room: "Room C", seats: 120, projector: true },
  { label: "Harbor Hall — Room D", venue: "Harbor Hall", room: "Room D", seats: 260, projector: false },
  { label: "Harbor Hall Annex — Room B", venue: "Harbor Hall Annex", room: "Room B", seats: 300, projector: true },
  { label: "Harbor Hall Annex — Room E", venue: "Harbor Hall Annex", room: "Room E", seats: 90, projector: false },
];
const VENUES = ["Main Street Loft", "Harbor Hall", "Harbor Hall Annex"];

type Session = { name: string; start: string; minutes: number };
type EventModel = { name: string; date: string; venue: string; ga: number; vip: number; sessions: Session[] };
const EVENTS0: Record<string, EventModel> = {
  "ev-ads": {
    name: "Autumn Dev Summit",
    date: "2026-10-15",
    venue: "Main Street Loft",
    ga: 120,
    vip: 30,
    sessions: [
      { name: "Registration", start: "08:30", minutes: 60 },
      { name: "Keynote", start: "09:30", minutes: 45 },
      { name: "Keynote Q&A", start: "10:15", minutes: 30 },
      { name: "Lunch", start: "12:00", minutes: 60 },
    ],
  },
  "ev-adw": {
    name: "Autumn Dev Summit — Workshop Day",
    date: "2026-10-16",
    venue: "Harbor Hall — Room C",
    ga: 80,
    vip: 0,
    sessions: [
      { name: "Keynote", start: "09:00", minutes: 30 },
      { name: "Workshops", start: "09:30", minutes: 180 },
    ],
  },
  "ev-wk": {
    name: "Winter Kickoff",
    date: "2026-12-03",
    venue: "Main Street Loft",
    ga: 100,
    vip: 10,
    sessions: [
      { name: "Welcome", start: "17:00", minutes: 30 },
      { name: "Keynote", start: "17:30", minutes: 40 },
    ],
  },
};
type Tab = "Details" | "Tickets" | "Schedule";
type Draft = { venue: string; ga: string; vip: string; starts: Record<string, string> };
const toDraft = (e: EventModel): Draft => ({ venue: e.venue, ga: String(e.ga), vip: String(e.vip), starts: Object.fromEntries(e.sessions.map((s) => [s.name, s.start])) });
const tabDirty = (tab: Tab, d: Draft, e: EventModel) => {
  const s = toDraft(e);
  if (tab === "Details") return d.venue !== s.venue;
  if (tab === "Tickets") return d.ga !== s.ga || d.vip !== s.vip;
  return JSON.stringify(d.starts) !== JSON.stringify(s.starts);
};
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function EventUpdate() {
  const [events, setEvents] = useState(EVENTS0);
  const [view, setView] = useState("Events");
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Details");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<null | { event: string; tab: Tab; draft: Draft }>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [venueOpen, setVenueOpen] = useState<string | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  useReport({ events });

  /** Leaves the current tab; an unsaved draft is dropped, with a toast that can bring it back. */
  const leave = () => {
    if (open && draft && tabDirty(tab, draft, events[open]!)) setToast({ event: open, tab, draft });
    setErrors([]);
    setSaved("");
  };
  const openTab = (id: string, t: Tab, d?: Draft) => {
    setOpen(id);
    setTab(t);
    setDraft(d ?? toDraft(events[id]!));
    setView("Events");
  };

  const save = () => {
    if (!open || !draft) return;
    const ev = events[open]!;
    const errs: string[] = [];
    let next = ev;
    if (tab === "Details") next = { ...ev, venue: draft.venue };
    if (tab === "Tickets") {
      const ga = draft.ga.trim();
      const vip = draft.vip.trim();
      if (!/^\d+$/.test(ga) || !/^\d+$/.test(vip)) errs.push("Ticket quantities must be whole numbers.");
      else {
        const cap = ROOMS.find((r) => r.label === ev.venue)!.seats;
        const total = Number(ga) + Number(vip);
        if (total > cap) errs.push(`Total tickets (${total}) exceed the capacity of ${ev.venue} (${cap} seats).`);
        next = { ...ev, ga: Number(ga), vip: Number(vip) };
      }
    }
    if (tab === "Schedule") {
      const bad = ev.sessions.filter((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test((draft.starts[s.name] ?? "").trim()));
      if (bad.length) errs.push(`Enter start times as HH:MM (24-hour): ${bad.map((s) => s.name).join(", ")}.`);
      else {
        const sessions = ev.sessions.map((s) => ({ ...s, start: draft.starts[s.name]!.trim() }));
        const byStart = [...sessions].sort((a, b) => mins(a.start) - mins(b.start));
        for (let i = 0; i + 1 < byStart.length; i++) {
          const a = byStart[i]!;
          const b = byStart[i + 1]!;
          if (mins(a.start) + a.minutes > mins(b.start))
            errs.push(`${a.name} (${a.start}–${hhmm(mins(a.start) + a.minutes)}) overlaps ${b.name} (${b.start}–${hhmm(mins(b.start) + b.minutes)}).`);
        }
        next = { ...ev, sessions };
      }
    }
    setErrors(errs);
    setSaved("");
    if (errs.length) return;
    setEvents((es) => ({ ...es, [open]: next }));
    setDraft(toDraft(next));
    setSaved(`${tab} saved.`);
  };

  const ev = open ? events[open] : null;
  return (
    <Layout
      nav={
        <SideNav
          label="Planner"
          items={["Events", "Venues"]}
          current={view}
          go={(v) => {
            leave();
            setView(v);
            setOpen(null);
            setDraft(null);
            setVenueOpen(null);
          }}
        />
      }
    >
      {view === "Venues" && (
        <>
          <h1>Venues</h1>
          <ul className="list">
            {VENUES.map((v) => (
              <li key={v} className="row between">
                <span>{v}</span>
                <button
                  className="small"
                  aria-label={`View rooms at ${v}`}
                  onClick={() => {
                    setVenueOpen(v);
                    setVenueLoading(true);
                    setTimeout(() => setVenueLoading(false), 1000);
                  }}
                >
                  View rooms
                </button>
              </li>
            ))}
          </ul>
          {venueOpen && (
            <section aria-label={`Rooms at ${venueOpen}`} className="flows-doc">
              <h2>Rooms at {venueOpen}</h2>
              {venueLoading ? (
                <p role="status" className="muted">
                  Loading rooms…
                </p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Seats</th>
                      <th>Projector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROOMS.filter((r) => r.venue === venueOpen).map((r) => (
                      <tr key={r.label}>
                        <td>{r.room}</td>
                        <td>{r.seats}</td>
                        <td>{r.projector ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </>
      )}
      {view === "Events" && !ev && (
        <>
          <h1>Events</h1>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Venue</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(events).map(([id, e]) => (
                <tr key={id}>
                  <td>
                    <button className="link" onClick={() => openTab(id, "Details")}>
                      {e.name}
                    </button>
                  </td>
                  <td>{e.date}</td>
                  <td>{e.venue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {view === "Events" && ev && draft && (
        <>
          <button
            className="link"
            onClick={() => {
              leave();
              setOpen(null);
              setDraft(null);
            }}
          >
            ← All events
          </button>
          <h1>{ev.name}</h1>
          <p className="muted">
            {ev.date} · {ev.venue}
          </p>
          <div role="tablist" className="tabs">
            {(["Details", "Tickets", "Schedule"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  if (t === tab) return;
                  leave();
                  openTab(open!, t);
                }}
              >
                {t}
                {tab === t && tabDirty(tab, draft, ev) ? " •" : ""}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tab}>
            {tab === "Details" && (
              <label className="field">
                <span>Venue</span>
                <select value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })}>
                  {ROOMS.map((r) => (
                    <option key={r.label}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}
            {tab === "Tickets" && (
              <>
                <label className="field">
                  <span>General admission</span>
                  <input inputMode="numeric" value={draft.ga} onChange={(e) => setDraft({ ...draft, ga: e.target.value })} />
                </label>
                <label className="field">
                  <span>VIP</span>
                  <input inputMode="numeric" value={draft.vip} onChange={(e) => setDraft({ ...draft, vip: e.target.value })} />
                </label>
              </>
            )}
            {tab === "Schedule" && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Start</th>
                    <th>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.sessions.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>
                        <input
                          aria-label={`Start time for ${s.name}`}
                          className="flows-qty"
                          value={draft.starts[s.name] ?? ""}
                          onChange={(e) => setDraft({ ...draft, starts: { ...draft.starts, [s.name]: e.target.value } })}
                        />
                      </td>
                      <td>{s.minutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {errors.length > 0 && (
            <ul role="alert" className="error">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            <span className="muted">{tabDirty(tab, draft, ev) ? "Unsaved changes" : "No unsaved changes"}</span>
            {saved && <span role="status">{saved}</span>}
            <button className="primary" onClick={save}>
              Save {tab.toLowerCase()}
            </button>
          </div>
        </>
      )}
      {toast && (
        <div className="flows-toast" role="status">
          <span>
            Unsaved changes to {toast.tab} of {events[toast.event]!.name} were discarded.
          </span>
          <button
            className="link"
            onClick={() => {
              const back = toast;
              setToast(null);
              leave();
              openTab(back.event, back.tab, back.draft);
            }}
          >
            Restore
          </button>
          <button className="icon" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Layout>
  );
}

export const TASKS: Record<string, TaskPage> = {
  "support-refund": { title: "Helpdesk Console", component: SupportRefund },
  "payout-setup": { title: "Payout Setup", component: PayoutSetup },
  "drive-cleanup": { title: "Northwind Drive", component: DriveCleanup },
  "event-update": { title: "Event Planner", component: EventUpdate },
};
