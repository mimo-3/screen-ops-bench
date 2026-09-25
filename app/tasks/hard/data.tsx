/**
 * Large data: virtualized lists (only the rows in view exist in the DOM), pagination, sorting and
 * filtering, choosing what to act on by reading and comparing values across rows, and bulk
 * selection with exceptions. All data is generated from fixed seeds, so every run sees the same rows.
 */
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { useReport } from "../../report.ts";
import type { TaskPage } from "../index.ts";

/** A small seeded PRNG (mulberry32): the same rows on every load, without Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------
// A virtualized grid: a fixed-height scroll region that renders only the rows in view (plus a
// few above and below), like react-window / TanStack Virtual. It is focusable, so the standard
// keys scroll it (arrows, Page Up/Down, Home/End) as well as the wheel does.

const ROW_H = 36;
const VIEW_ROWS = 10;
const OVERSCAN = 3;

type Sort<K extends string> = { key: K; dir: "ascending" | "descending" };

function Th<K extends string>({ label, sortKey, sort, onSort }: { label: string; sortKey?: K; sort?: Sort<K> | null; onSort?: (k: K) => void }) {
  if (!sortKey || !onSort) return <div role="columnheader">{label}</div>;
  const dir = sort && sort.key === sortKey ? sort.dir : undefined;
  return (
    <div role="columnheader" aria-sort={dir ?? "none"}>
      <button className="link sorter" onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true">{dir === "ascending" ? " ▲" : dir === "descending" ? " ▼" : " ↕"}</span>
      </button>
    </div>
  );
}

function VirtualGrid<T>(props: { label: string; rows: T[]; rowKey: (r: T) => string; head: ReactNode; cells: (r: T) => ReactNode[]; template: string; resetKey: string; empty: string }) {
  const { label, rows, rowKey, head, cells, template, resetKey, empty } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  // The row holding keyboard focus stays mounted even when it scrolls out of view (as real
  // virtualizers do), so focus never falls back to the page when the list moves.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
    setTop(0);
  }, [resetKey]);
  const firstInView = Math.floor(top / ROW_H);
  const first = Math.max(0, firstInView - OVERSCAN);
  const last = Math.min(rows.length, firstInView + VIEW_ROWS + OVERSCAN);
  const indexes = Array.from({ length: Math.max(0, last - first) }, (_, k) => first + k);
  const focusIndex = focusKey === null ? -1 : rows.findIndex((r) => rowKey(r) === focusKey);
  if (focusIndex >= 0 && (focusIndex < first || focusIndex >= last)) indexes.push(focusIndex);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.target !== el) return;
    const max = Math.max(0, rows.length * ROW_H - VIEW_ROWS * ROW_H);
    const steps: Record<string, number> = {
      ArrowDown: el.scrollTop + ROW_H,
      ArrowUp: el.scrollTop - ROW_H,
      PageDown: el.scrollTop + ROW_H * (VIEW_ROWS - 1),
      PageUp: el.scrollTop - ROW_H * (VIEW_ROWS - 1),
      Home: 0,
      End: max,
    };
    const to = steps[e.key];
    if (to === undefined) return;
    e.preventDefault();
    el.scrollTop = Math.max(0, Math.min(max, to));
    setTop(el.scrollTop);
  };
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest("[data-rowkey]");
    setFocusKey(row ? row.getAttribute("data-rowkey") : null);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusKey(null);
  };
  return (
    <div ref={ref} className="vgrid" role="grid" aria-label={label} aria-rowcount={rows.length + 1} tabIndex={0} onScroll={(e) => setTop(e.currentTarget.scrollTop)} onKeyDown={onKey} onFocus={onFocus} onBlur={onBlur}>
      <div role="row" aria-rowindex={1} className="vhead" style={{ gridTemplateColumns: template }}>
        {head}
      </div>
      <div role="rowgroup" className="vbody" style={{ height: Math.max(rows.length, 1) * ROW_H }}>
        {rows.length === 0 && <p className="muted vempty">{empty}</p>}
        {indexes.map((i) => {
          const r = rows[i]!;
          const k = rowKey(r);
          return (
            <div role="row" aria-rowindex={i + 2} key={k} data-rowkey={k} className="vrow" style={{ top: i * ROW_H, gridTemplateColumns: template }}>
              {cells(r).map((c, j) => (
                <div role="gridcell" key={j}>
                  {c}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A modal dialog as dialog libraries build it: focus moves into it (to the control marked
 * autoFocus), Tab stays inside, Escape closes it, and focus returns to the control that opened it.
 */
function Modal({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(
    () => () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    },
    [opener],
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("input, select, button, textarea, [tabindex]")].filter((x) => !x.hasAttribute("disabled") && x.tabIndex >= 0);
    if (all.length === 0) return;
    const firstEl = all[0]!;
    const lastEl = all[all.length - 1]!;
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  return (
    <div className="backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="dialog" onKeyDown={onKey}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Payments ledger: 491 transactions in a virtualized grid. Find one payment by comparing
//    customer, month, method, status and amount across rows; refund it with the right reason.

type Tx = { id: string; date: string; time: string; customer: string; method: "Card" | "Bank transfer" | "PayPal"; amount: number; status: "Settled" | "Refunded" | "Partially refunded" | "Pending" };

const LEDGER_CUSTOMERS = [
  "Northwind Traders", "Contoso Ltd.", "Fabrikam Inc.", "Tailspin Toys", "Litware Inc.", "Adatum Corp.", "Wingtip Toys", "Proseware Inc.",
  "Alpine Ski House", "Blue Yonder Airlines", "Coho Winery", "Fourth Coffee", "Graphic Design Institute", "Humongous Insurance",
  "Lucerne Publishing", "Margie's Travel", "Relecloud", "Southridge Video", "Trey Research", "VanArsdel Ltd.", "Woodgrove Bank",
  "Wide World Importers", "Consolidated Messenger", "City Power & Light",
];

const HF = "Harbor Freight Co.";
const HFC = "Harbor Freight Corp";
/** The rows the task is about; everything else is filler from other customers. */
const LEDGER_PLANTED: Omit<Tx, "id">[] = [
  { date: "2026-06-12", time: "11:05", customer: HF, method: "Card", amount: 640, status: "Settled" },
  { date: "2026-07-09", time: "15:40", customer: HF, method: "Card", amount: 1120, status: "Settled" },
  { date: "2026-07-20", time: "09:12", customer: HFC, method: "Card", amount: 900, status: "Settled" },
  { date: "2026-07-31", time: "18:55", customer: HF, method: "Card", amount: 1875, status: "Settled" },
  { date: "2026-08-03", time: "10:21", customer: HF, method: "Card", amount: 1248.5, status: "Settled" },
  { date: "2026-08-06", time: "13:02", customer: HF, method: "Card", amount: 312.4, status: "Settled" },
  { date: "2026-08-11", time: "16:47", customer: HF, method: "Card", amount: 1540, status: "Refunded" },
  { date: "2026-08-14", time: "12:30", customer: HFC, method: "Card", amount: 3120, status: "Settled" },
  { date: "2026-08-15", time: "08:58", customer: HF, method: "Card", amount: 88, status: "Settled" },
  { date: "2026-08-19", time: "14:16", customer: HF, method: "Card", amount: 1284.5, status: "Settled" },
  // Same day, same amount, but already partly refunded (see PRIOR_REFUND).
  { date: "2026-08-19", time: "16:02", customer: HF, method: "Card", amount: 1284.5, status: "Partially refunded" },
  { date: "2026-08-22", time: "17:33", customer: HF, method: "Card", amount: 1290, status: "Pending" },
  { date: "2026-08-24", time: "10:09", customer: HFC, method: "Card", amount: 1299, status: "Settled" },
  { date: "2026-08-27", time: "11:44", customer: HF, method: "Bank transfer", amount: 1960, status: "Settled" },
  { date: "2026-08-30", time: "09:37", customer: HF, method: "PayPal", amount: 1410, status: "Settled" },
  { date: "2026-09-01", time: "10:03", customer: HF, method: "Card", amount: 2310, status: "Settled" },
  { date: "2026-09-14", time: "15:28", customer: HF, method: "Card", amount: 455, status: "Settled" },
];

function makeLedger(): Tx[] {
  const r = rng(20260925);
  const rows: Omit<Tx, "id">[] = [...LEDGER_PLANTED];
  const months: [number, number][] = [[6, 30], [7, 31], [8, 31], [9, 24]];
  for (const [m, days] of months) {
    for (let d = 1; d <= days; d++) {
      const date = `2026-${pad(m)}-${pad(d)}`;
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const time = `${pad(8 + Math.floor(r() * 12))}:${pad(Math.floor(r() * 60))}`;
        const x = r();
        const method = x < 0.6 ? "Card" : x < 0.85 ? "Bank transfer" : "PayPal";
        const amount = Math.round((20 + r() * r() * 2900) * 100) / 100;
        const s = r();
        const status = m === 9 && d >= 20 && s < 0.4 ? "Pending" : s < 0.08 ? "Refunded" : "Settled";
        rows.push({ date, time, customer: pick(r, LEDGER_CUSTOMERS), method, amount, status });
      }
    }
  }
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return rows.map((t, i) => ({ ...t, id: `TX-${30001 + i}` }));
}

type Refund = { id: string; amount: number; reason: string };
/** A refund issued before the task starts: $200 of the second Aug 19 payment. */
const priorRefund = (txs: Tx[]): Refund => ({ id: txs.find((t) => t.status === "Partially refunded" && t.customer === HF)!.id, amount: 200, reason: "Customer request" });
/** Search ignores case and punctuation, so "Harbor Freight Co." also finds "Harbor Freight Corp". */
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const REASONS = ["Customer request", "Duplicate charge", "Fraudulent", "Product not received"];

function PaymentsLedger() {
  const [txs, setTxs] = useState<Tx[]>(makeLedger);
  const [refunds, setRefunds] = useState<Refund[]>(() => [priorRefund(txs)]);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("All methods");
  const [sort, setSort] = useState<Sort<"date" | "amount">>({ key: "date", dir: "descending" });
  const [dialog, setDialog] = useState<{ tx: Tx; amount: string; reason: string; error: string } | null>(null);
  useReport({ refunds, dialogOpen: dialog !== null });

  const q = norm(query);
  const shown = txs
    .filter((t) => (method === "All methods" || t.method === method) && (!q || norm(t.customer).includes(q) || norm(t.id).includes(q)))
    .sort((a, b) => {
      const d = sort.key === "amount" ? a.amount - b.amount : (a.date + a.time).localeCompare(b.date + b.time);
      return sort.dir === "ascending" ? d : -d;
    });
  const onSort = (key: "date" | "amount") => setSort((s) => (s.key === key ? { key, dir: s.dir === "ascending" ? "descending" : "ascending" } : { key, dir: "ascending" }));

  const refundedSoFar = (id: string) => refunds.filter((x) => x.id === id).reduce((n, x) => n + x.amount, 0);
  const remaining = (t: Tx) => Math.round((t.amount - refundedSoFar(t.id)) * 100) / 100;
  // A repeated activation of the same Refund button keeps what was already typed.
  const open = (t: Tx) => setDialog((d) => d ?? { tx: t, amount: remaining(t).toFixed(2), reason: "", error: "" });
  const confirm = () => {
    if (!dialog) return;
    const amount = Number(dialog.amount.trim());
    const left = remaining(dialog.tx);
    let error = "";
    if (!dialog.reason) error = "Choose a reason for the refund.";
    if (!/^\d+(\.\d{1,2})?$/.test(dialog.amount.trim()) || !(amount > 0)) error = "Enter a refund amount in dollars, like 25.00.";
    else if (amount > left) error = `The refund can't be more than ${money(left)}.`;
    if (error) return setDialog({ ...dialog, error });
    const id = dialog.tx.id;
    const rounded = Math.round(amount * 100) / 100;
    setRefunds((xs) => [...xs, { id, amount: rounded, reason: dialog.reason }]);
    setTxs((xs) => xs.map((t) => (t.id === id ? { ...t, status: rounded >= left ? "Refunded" : "Partially refunded" } : t)));
    setDialog(null);
  };

  return (
    <section className="card data-wide">
      <h1>Payments ledger</h1>
      <div className="row data-filters">
        <input aria-label="Search by customer or ID" className="search grow" placeholder="Search by customer or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {["All methods", "Card", "Bank transfer", "PayPal"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <p className="muted">
        {shown.length} of {txs.length} transactions
      </p>
      <VirtualGrid
        label="Transactions"
        rows={shown}
        rowKey={(t) => t.id}
        resetKey={`${q}|${method}|${sort.key}|${sort.dir}`}
        template="110px 90px 1fr 120px 110px 150px 80px"
        empty="No transactions match."
        head={
          <>
            <Th label="Date" sortKey="date" sort={sort} onSort={onSort} />
            <Th label="ID" />
            <Th label="Customer" />
            <Th label="Method" />
            <Th label="Amount" sortKey="amount" sort={sort} onSort={onSort} />
            <Th label="Status" />
            <Th label="Action" />
          </>
        }
        cells={(t) => [
          t.date,
          t.id,
          t.customer,
          t.method,
          <span className="num">{money(t.amount)}</span>,
          <span className={`badge ${t.status.toLowerCase().replace(/ /g, "-")}`}>{t.status}</span>,
          t.status !== "Refunded" ? (
            <button className="small" aria-label={`Refund ${t.id}`} onClick={() => open(t)}>
              Refund
            </button>
          ) : null,
        ]}
      />
      {dialog && (
        <Modal labelledBy="data-refund-title" onClose={() => setDialog(null)}>
            <h2 id="data-refund-title">Refund {dialog.tx.id}</h2>
            <p className="muted">
              {dialog.tx.customer} · {dialog.tx.method} · {money(dialog.tx.amount)} on {dialog.tx.date} · {dialog.tx.status}
            </p>
            {refundedSoFar(dialog.tx.id) > 0 && <p className="muted">Already refunded: {money(refundedSoFar(dialog.tx.id))}. Up to {money(remaining(dialog.tx))} can still be refunded.</p>}
            {dialog.tx.status === "Pending" && <p className="muted">This payment hasn't settled yet; the refund will be issued when it does.</p>}
            <label className="field">
              <span>Refund amount (USD)</span>
              <input autoFocus value={dialog.amount} onChange={(e) => setDialog({ ...dialog, amount: e.target.value, error: "" })} />
            </label>
            <label className="field">
              <span>Reason</span>
              <select value={dialog.reason} onChange={(e) => setDialog({ ...dialog, reason: e.target.value, error: "" })}>
                <option value="">Choose a reason…</option>
                {REASONS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {dialog.error && (
              <p role="alert" className="error">
                {dialog.error}
              </p>
            )}
            <div className="actions">
              <button onClick={() => setDialog(null)}>Cancel</button>
              <button className="danger-fill" onClick={confirm}>
                Issue refund
              </button>
            </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Help desk: 140 tickets, paginated. Archive every closed Billing ticket except the ones on
//    legal hold. The selection survives paging and filtering, and two stale selections start in it.

type Ticket = { id: number; subject: string; queue: string; status: "Open" | "Pending" | "Closed"; tags: string[]; requester: string };

const QUEUES = ["Billing", "Billing Escalations", "Technical", "Accounts", "Shipping"];
const SUBJECTS = [
  "Charged twice this month", "Invoice shows wrong VAT number", "Refund not received", "Can't download receipt", "Card declined at renewal",
  "Need a copy of my contract", "Plan downgrade question", "Password reset link expired", "App crashes on export", "Order arrived damaged",
  "Tracking number not working", "Update billing address", "Change account owner", "Duplicate account merge", "Discount code rejected",
  "Late fee dispute", "Proration looks wrong", "Two-factor codes not arriving", "API rate limit questions", "Missing items in shipment",
];
const REQUESTERS = ["a.kowalski", "b.nguyen", "c.okafor", "d.silva", "e.tanaka", "f.muller", "g.rossi", "h.kim", "i.haddad", "j.berg"];

/** The closed Billing tickets, newest first: tags decide which of them to keep. */
const BILLING_CLOSED: [number, string[]][] = [
  [4138, ["refund"]], [4131, []], [4126, ["vip"]], [4119, ["refund", "legal-hold"]], [4113, []], [4108, ["follow-up"]], [4102, []],
  [4097, ["legal-review"]], [4090, ["refund"]], [4084, []],
  [4079, ["vip"]], [4071, []], [4066, ["refund"]], [4060, []], [4055, ["legal-hold"]], [4049, ["follow-up"]], [4043, []],
  [4038, ["vip", "legal-review"]], [4032, ["refund"]], [4027, []],
  [4019, []], [4012, ["legal-hold", "vip"]], [4006, ["refund"]],
];
const STALE_SELECTION = [4136, 4124];

function makeTickets(): Ticket[] {
  const r = rng(4140);
  const planted = new Map(BILLING_CLOSED);
  const out: Ticket[] = [];
  for (let id = 4140; id >= 4001; id--) {
    const subject = pick(r, SUBJECTS);
    const requester = pick(r, REQUESTERS);
    let queue = pick(r, QUEUES);
    const x = r();
    let status: Ticket["status"] = x < 0.45 ? "Closed" : x < 0.75 ? "Open" : "Pending";
    const tagPool = ["refund", "vip", "follow-up", "legal-hold", "legal-review", "bug"];
    let tags = r() < 0.55 ? [pick(r, tagPool)] : [];
    if (planted.has(id)) {
      queue = "Billing";
      status = "Closed";
      tags = planted.get(id)!;
    } else if (queue === "Billing" && status === "Closed") {
      status = "Pending";
    }
    if (id === 4136) [queue, status] = ["Technical", "Open"];
    if (id === 4124) [queue, status] = ["Billing", "Open"];
    out.push({ id, subject, queue, status, tags, requester });
  }
  // Make sure the look-alike queue has closed tickets too (with and without legal hold).
  for (const [id, tags] of [[4135, ["refund"]], [4101, []], [4074, ["legal-hold"]], [4058, ["vip"]], [4022, []], [4009, ["refund"]]] as [number, string[]][]) {
    const t = out.find((x) => x.id === id)!;
    Object.assign(t, { queue: "Billing Escalations", status: "Closed", tags });
  }
  return out;
}

function HelpDesk() {
  const [tickets, setTickets] = useState<Ticket[]>(makeTickets);
  const [archived, setArchived] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>(STALE_SELECTION);
  const [queue, setQueue] = useState("All queues");
  const [status, setStatus] = useState("All statuses");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [confirming, setConfirming] = useState(false);
  useReport({ archived: [...archived].sort((a, b) => a - b).map((n) => `#${n}`), dialogOpen: confirming });

  const matching = tickets.filter((t) => (queue === "All queues" || t.queue === queue) && (status === "All statuses" || t.status === status));
  const pages = Math.max(1, Math.ceil(matching.length / size));
  const current = Math.min(page, pages);
  const onPage = matching.slice((current - 1) * size, current * size);
  const isSel = (id: number) => selected.includes(id);
  const allOnPage = onPage.length > 0 && onPage.every((t) => isSel(t.id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const togglePage = () => setSelected((s) => (allOnPage ? s.filter((id) => !onPage.some((t) => t.id === id)) : [...new Set([...s, ...onPage.map((t) => t.id)])]));
  const selectAllMatching = () => setSelected((s) => [...new Set([...s, ...matching.map((t) => t.id)])]);
  const setFilter = (f: (v: string) => void) => (v: string) => {
    f(v);
    setPage(1);
  };
  const archive = () => {
    setArchived((a) => [...a, ...selected]);
    setTickets((ts) => ts.filter((t) => !selected.includes(t.id)));
    setSelected([]);
    setConfirming(false);
  };

  return (
    <section className="card data-wide">
      <h1>Ticket queue</h1>
      <div className="row data-filters">
        <select aria-label="Queue" value={queue} onChange={(e) => setFilter(setQueue)(e.target.value)}>
          {["All queues", ...QUEUES].map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setFilter(setStatus)(e.target.value)}>
          {["All statuses", "Open", "Pending", "Closed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="grow" />
        <label className="inline">
          Rows per page
          <select aria-label="Rows per page" value={size} onChange={(e) => (setSize(Number(e.target.value)), setPage(1))}>
            {[10, 25].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row data-bulk" role="toolbar" aria-label="Bulk actions">
        <span>{selected.length} selected</span>
        <button className="link" disabled={selected.length === 0} onClick={() => setSelected([])}>
          Clear selection
        </button>
        <span className="grow" />
        <button className="danger-fill" disabled={selected.length === 0} onClick={() => setConfirming(true)}>
          Archive selected
        </button>
      </div>
      {allOnPage && matching.length > onPage.length && !matching.every((t) => isSel(t.id)) && (
        <p className="data-banner">
          All {onPage.length} tickets on this page are selected.{" "}
          <button className="link" onClick={selectAllMatching}>
            Select all {matching.length} matching tickets
          </button>
        </p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>
              <input type="checkbox" aria-label="Select all tickets on this page" checked={allOnPage} onChange={togglePage} />
            </th>
            <th>Ticket</th>
            <th>Subject</th>
            <th>Queue</th>
            <th>Status</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {onPage.map((t) => (
            <tr key={t.id}>
              <td>
                <input type="checkbox" aria-label={`Select ticket #${t.id}`} checked={isSel(t.id)} onChange={() => toggle(t.id)} />
              </td>
              <td>#{t.id}</td>
              <td>{t.subject}</td>
              <td>{t.queue}</td>
              <td>
                <span className={`badge ${t.status.toLowerCase()}`}>{t.status}</span>
              </td>
              <td>
                {t.tags.map((g) => (
                  <span key={g} className="badge data-tag">
                    {g}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {matching.length === 0 && <p className="muted">No tickets match these filters.</p>}
      <nav className="row data-pager" aria-label="Pagination">
        <span className="muted">
          {matching.length === 0 ? 0 : (current - 1) * size + 1}–{Math.min(current * size, matching.length)} of {matching.length}
        </span>
        <span className="grow" />
        <button disabled={current === 1} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} aria-label={`Page ${n}`} aria-current={n === current ? "page" : undefined} className={n === current ? "primary" : ""} onClick={() => setPage(n)}>
            {n}
          </button>
        ))}
        <button disabled={current === pages} onClick={() => setPage(current + 1)}>
          Next
        </button>
      </nav>
      {confirming && (
        <Modal labelledBy="data-archive-title" onClose={() => setConfirming(false)}>
            <h2 id="data-archive-title">
              Archive {selected.length} ticket{selected.length === 1 ? "" : "s"}?
            </h2>
            <p>Archived tickets leave every queue. This can't be undone.</p>
            <div className="actions">
              <button autoFocus onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="danger-fill" onClick={archive}>
                Archive
              </button>
            </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Reorder planner: stock for 40 products in 3 warehouses, loaded 15 at a time ("Load more"
//    takes a moment). Order exactly the shortfall of every active Rotterdam product below its
//    reorder point. Sorting only reorders the rows already loaded.

type Stock = { sku: string; product: string; warehouse: string; onHand: number; safety: number; reorder: number; active: boolean };
type Line = { warehouse: string; sku: string; qty: number };

const WAREHOUSES = ["Hamburg", "Lyon", "Rotterdam"];
const PRODUCTS = ["Stretch film", "Packing tape", "Corner board", "Bubble roll", "Mailer box", "Pallet label", "Void fill", "Strapping band"].flatMap((b) =>
  ["S", "M", "L", "XL", "Bulk"].map((s) => `${b} ${s}`),
);
/** Rotterdam rows by their index in SKU order: [onHand, reorder point, active]. */
const ROTTERDAM: Record<number, [number, number, boolean]> = {
  2: [37, 120, true],
  6: [60, 60, true],
  11: [14, 45, true],
  13: [5, 40, false],
  18: [118, 150, true],
  21: [75, 75, true],
  24: [0, 24, true],
  29: [12, 90, false],
  33: [71, 96, true],
  37: [199, 200, true],
};

function makeStock(): Stock[] {
  const r = rng(7001);
  const out: Stock[] = [];
  PRODUCTS.forEach((product, i) => {
    const sku = `PK-${1003 + i * 17}`;
    for (const warehouse of WAREHOUSES) {
      const reorder = 20 + Math.floor(r() * 18) * 10;
      let onHand = reorder + 5 + Math.floor(r() * 160);
      let active = r() > 0.1;
      let rp = reorder;
      // Other warehouses have their own shortfalls (not part of the Rotterdam order).
      if (warehouse !== "Rotterdam" && r() < 0.2) onHand = Math.floor(reorder * r());
      const planted = warehouse === "Rotterdam" ? ROTTERDAM[i] : undefined;
      if (planted) [onHand, rp, active] = planted;
      else if (warehouse === "Rotterdam") active = true;
      out.push({ sku, product, warehouse, onHand, reorder: rp, safety: Math.round(rp * 0.4), active });
    }
  });
  return out;
}

const STOCK_PAGE = 15;

function ReorderPlanner() {
  const [stock] = useState<Stock[]>(makeStock);
  const [warehouse, setWarehouse] = useState("All warehouses");
  const [loaded, setLoaded] = useState(STOCK_PAGE);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<Sort<"onHand"> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<{ number: string; lines: Line[] }[]>([]);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const key = (s: Stock) => `${s.warehouse}|${s.sku}`;
  const draftLines = Object.entries(draft)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => {
      const [w, sku] = k.split("|") as [string, string];
      return { warehouse: w, sku, qty: v.trim() };
    })
    .sort((a, b) => (a.warehouse + a.sku).localeCompare(b.warehouse + b.sku));
  useReport({ purchaseOrders: orders.map((o) => ({ lines: o.lines })), draft: draftLines });

  const matching = stock.filter((s) => warehouse === "All warehouses" || s.warehouse === warehouse);
  const shown = matching.slice(0, loaded);
  if (sort) shown.sort((a, b) => (sort.dir === "ascending" ? a.onHand - b.onHand : b.onHand - a.onHand));
  const invalid = (v: string | undefined) => v !== undefined && v.trim() !== "" && !/^\d+$/.test(v.trim());

  const changeWarehouse = (w: string) => {
    clearTimeout(timer.current);
    setLoading(false);
    setWarehouse(w);
    setLoaded(STOCK_PAGE);
  };
  const loadMore = () => {
    setLoading(true);
    timer.current = setTimeout(() => {
      setLoaded((n) => n + STOCK_PAGE);
      setLoading(false);
    }, 800);
  };
  const create = () => {
    if (Object.values(draft).some(invalid)) return setMessage("Fix the quantities marked as invalid first.");
    const lines = draftLines.map((l) => ({ ...l, qty: Number(l.qty) })).filter((l) => l.qty > 0);
    if (lines.length === 0) return setMessage("Enter a quantity for at least one product.");
    const number = `PO-${7001 + orders.length}`;
    setOrders((o) => [...o, { number, lines }]);
    setDraft({});
    setMessage(`${number} created with ${lines.length} line${lines.length === 1 ? "" : "s"}.`);
  };

  return (
    <section className="card data-wide">
      <h1>Reorder planner</h1>
      <div className="row data-filters">
        <select aria-label="Warehouse" value={warehouse} onChange={(e) => changeWarehouse(e.target.value)}>
          {["All warehouses", ...WAREHOUSES].map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <span className="muted">Quantities are in units. Safety stock is the hard minimum; the reorder point is where replenishment starts.</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Warehouse</th>
            <th aria-sort={sort ? sort.dir : "none"}>
              <button className="link sorter" onClick={() => setSort((s) => (!s ? { key: "onHand", dir: "ascending" } : s.dir === "ascending" ? { key: "onHand", dir: "descending" } : null))}>
                On hand<span aria-hidden="true">{sort?.dir === "ascending" ? " ▲" : sort?.dir === "descending" ? " ▼" : " ↕"}</span>
              </button>
            </th>
            <th>Safety stock</th>
            <th>Reorder point</th>
            <th>Status</th>
            <th>Order qty</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={key(s)}>
              <td>{s.sku}</td>
              <td>{s.product}</td>
              <td>{s.warehouse}</td>
              <td className="num">{s.onHand}</td>
              <td className="num">{s.safety}</td>
              <td className="num">{s.reorder}</td>
              <td>
                <span className={`badge ${s.active ? "" : "overdue"}`}>{s.active ? "Active" : "Discontinued"}</span>
              </td>
              <td>
                <input
                  className="data-qty"
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`Order quantity for ${s.sku} at ${s.warehouse}`}
                  aria-invalid={invalid(draft[key(s)]) || undefined}
                  value={draft[key(s)] ?? ""}
                  onChange={(e) => {
                    setMessage("");
                    setDraft((d) => ({ ...d, [key(s)]: e.target.value }));
                  }}
                />
                {invalid(draft[key(s)]) && <span className="error data-inline-error">Whole units only</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row data-pager">
        <span className="muted">
          Showing {shown.length} of {matching.length} products
        </span>
        <span className="grow" />
        {shown.length < matching.length && (
          <button disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
      <div className="actions">
        <p role="status" className="muted">
          {message}
        </p>
        <button className="primary" onClick={create}>
          Create purchase order
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Incident logs: 3,600 log lines (one every 3 s, 12:00–15:00 UTC) in a virtualized grid,
//    shown in local time (UTC+02:00) until switched to UTC. Link a time window of one service's
//    errors to an incident; shift-click selects a range of the rows currently shown.

type Log = { id: string; utc: number; service: string; level: "INFO" | "WARN" | "ERROR"; message: string };

const SERVICES = ["payments-api", "payments-api-canary", "checkout", "auth", "search", "inventory"];
const INFO_MSGS = ["GET /v1/health 200", "request completed in 84 ms", "cache warmed (1,204 keys)", "POST /v1/sessions 201", "job heartbeat ok", "config reloaded"];
const WARN_MSGS = ["slow query: 1.8 s", "retrying upstream call (attempt 2)", "connection pool at 85%", "deprecated header x-client-ver"];
const ERROR_MSGS = ["POST /v1/charges 500: upstream timeout", "db deadlock detected, rolled back", "unhandled exception in worker", "TLS handshake failed with ledger-db"];
const at = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;
const clock = (t: number) => `${pad(Math.floor(t / 3600) % 24)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;

/** Planted lines at exact times (all on the 3-second grid). */
const LOG_PLANTED: [number, string, Log["level"], string][] = [
  // payments-api errors inside 14:02:00–14:05:59 UTC: the ones to link.
  [at(14, 2, 0), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 2, 33), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 3, 9), "payments-api", "ERROR", "capture failed: idempotency key conflict"],
  [at(14, 3, 42), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 4, 15), "payments-api", "ERROR", "POST /v1/refunds 500: ledger write failed"],
  [at(14, 4, 51), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 5, 24), "payments-api", "ERROR", "capture failed: idempotency key conflict"],
  [at(14, 5, 57), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  // Just outside the window.
  [at(14, 1, 57), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 6, 0), "payments-api", "ERROR", "POST /v1/charges 502: card network unreachable"],
  // Look-alike service, other levels, and messages that mention payments-api from another service.
  [at(14, 2, 48), "payments-api-canary", "ERROR", "POST /v1/charges 502: card network unreachable"],
  [at(14, 4, 30), "payments-api-canary", "ERROR", "capture failed: idempotency key conflict"],
  [at(14, 3, 27), "payments-api", "WARN", "card network latency above 2 s"],
  [at(14, 5, 3), "payments-api", "WARN", "circuit breaker half-open"],
  [at(14, 3, 15), "checkout", "ERROR", "upstream payments-api returned 502"],
  [at(14, 4, 39), "checkout", "ERROR", "upstream payments-api returned 502"],
  // The same wall-clock window two hours earlier (what "14:02–14:05" means in local time).
  [at(12, 2, 12), "payments-api", "ERROR", "db deadlock detected, rolled back"],
  [at(12, 3, 30), "payments-api", "ERROR", "POST /v1/charges 500: upstream timeout"],
  [at(12, 4, 45), "payments-api", "ERROR", "db deadlock detected, rolled back"],
  [at(12, 5, 36), "payments-api", "ERROR", "POST /v1/charges 500: upstream timeout"],
];

function makeLogs(): Log[] {
  const r = rng(2291);
  const planted = new Map(LOG_PLANTED.map((p) => [p[0], p]));
  const quiet = (t: number) => (t >= at(12, 0, 0) && t < at(12, 8, 0)) || (t >= at(14, 0, 0) && t < at(14, 8, 0));
  const out: Log[] = [];
  for (let i = 0; i < 3600; i++) {
    const utc = at(12, 0, 0) + i * 3;
    const service = pick(r, SERVICES);
    const x = r();
    let level: Log["level"] = x < 0.8 ? "INFO" : x < 0.93 ? "WARN" : "ERROR";
    const m = r();
    if (level === "ERROR" && service === "payments-api" && quiet(utc)) level = "WARN";
    let message = (level === "INFO" ? INFO_MSGS : level === "WARN" ? WARN_MSGS : ERROR_MSGS)[Math.floor(m * (level === "INFO" ? 6 : 4))]!;
    let svc = service;
    const p = planted.get(utc);
    if (p) [, svc, level, message] = p;
    out.push({ id: `L-${pad(i + 1, 4)}`, utc, service: svc, level, message });
  }
  return out;
}

const INCIDENTS = [
  { id: "INC-2219", name: "Checkout latency" },
  { id: "INC-2290", name: "Payments canary rollback" },
  { id: "INC-2291", name: "Card payments failing" },
];

function IncidentLogs() {
  const [logs] = useState<Log[]>(makeLogs);
  const [service, setService] = useState("All services");
  const [level, setLevel] = useState("All levels");
  const [text, setText] = useState("");
  const [utc, setUtc] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const [links, setLinks] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState<{ incident: string } | null>(null);
  useReport({ links, dialogOpen: dialog !== null });

  const q = text.trim().toLowerCase();
  const shown = logs.filter((l) => (service === "All services" || l.service === service) && (level === "All levels" || l.level === level) && (!q || l.message.toLowerCase().includes(q)));
  if (newestFirst) shown.reverse();
  const linkOf = (id: string) => Object.keys(links).find((k) => links[k]!.includes(id));
  const refilter = <V,>(set: (v: V) => void) => (v: V) => {
    set(v);
    setSelected([]);
    anchor.current = null;
  };
  const clickBox = (id: string, shift: boolean) => {
    const on = !selected.includes(id);
    const a = anchor.current ? shown.findIndex((l) => l.id === anchor.current) : -1;
    const b = shown.findIndex((l) => l.id === id);
    const ids = shift && a >= 0 ? shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id) : [id];
    setSelected((s) => (on ? [...new Set([...s, ...ids])] : s.filter((x) => !ids.includes(x))));
    anchor.current = id;
  };
  const allShown = shown.length > 0 && shown.every((l) => selected.includes(l.id));
  const link = () => {
    if (!dialog?.incident) return;
    const inc = dialog.incident;
    setLinks((ls) => {
      const next: Record<string, string[]> = {};
      for (const [k, ids] of Object.entries(ls)) {
        const kept = ids.filter((x) => !selected.includes(x));
        if (kept.length) next[k] = kept;
      }
      next[inc] = [...new Set([...(next[inc] ?? []), ...selected])].sort();
      return next;
    });
    setSelected([]);
    setDialog(null);
  };
  const unlink = (id: string) =>
    setLinks((ls) => {
      const next: Record<string, string[]> = {};
      for (const [k, ids] of Object.entries(ls)) {
        const kept = ids.filter((x) => x !== id);
        if (kept.length) next[k] = kept;
      }
      return next;
    });
  const tz = utc ? "UTC" : "UTC+02:00";

  return (
    <section className="card data-wide">
      <h1>Incident logs</h1>
      <p className="muted">Checkout cluster · 2026-09-25 · 12:00–15:00 UTC</p>
      <div className="row data-filters">
        <select aria-label="Service" value={service} onChange={(e) => refilter(setService)(e.target.value)}>
          {["All services", ...SERVICES].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Level" value={level} onChange={(e) => refilter(setLevel)(e.target.value)}>
          {["All levels", "INFO", "WARN", "ERROR"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input aria-label="Search messages" className="search grow" placeholder="Search messages" value={text} onChange={(e) => refilter(setText)(e.target.value)} />
      </div>
      <div className="row data-filters">
        <label className="inline">
          <input type="checkbox" checked={utc} onChange={(e) => setUtc(e.target.checked)} />
          Show times in UTC
        </label>
        <button onClick={() => refilter(setNewestFirst)(!newestFirst)}>{newestFirst ? "Newest first" : "Oldest first"}</button>
        <span className="grow" />
        <span>{selected.length} selected</span>
        <button className="link" disabled={selected.length === 0} onClick={() => setSelected([])}>
          Clear selection
        </button>
        <button className="primary" disabled={selected.length === 0} onClick={() => setDialog((d) => d ?? { incident: "" })}>
          Link to incident…
        </button>
      </div>
      <p className="muted">
        {shown.length} of {logs.length} lines · shift-click a checkbox to select a range of the lines shown
      </p>
      <VirtualGrid
        label="Log lines"
        rows={shown}
        rowKey={(l) => l.id}
        resetKey={`${service}|${level}|${q}|${newestFirst}`}
        template="36px 96px 170px 64px 1fr 150px"
        empty="No log lines match."
        head={
          <>
            <div role="columnheader">
              <input type="checkbox" aria-label={`Select all ${shown.length} lines shown`} checked={allShown} onChange={() => setSelected(allShown ? [] : shown.map((l) => l.id))} />
            </div>
            <Th label={`Time (${tz})`} />
            <Th label="Service" />
            <Th label="Level" />
            <Th label="Message" />
            <Th label="Incident" />
          </>
        }
        cells={(l) => {
          const inc = linkOf(l.id);
          return [
            <input type="checkbox" aria-label={`Select ${l.id}`} checked={selected.includes(l.id)} onChange={() => undefined} onClick={(e) => clickBox(l.id, e.shiftKey)} />,
            <span className="mono">{clock(utc ? l.utc : l.utc + 7200)}</span>,
            l.service,
            <span className={`badge ${l.level === "ERROR" ? "overdue" : ""}`}>{l.level}</span>,
            <span title={l.message}>{l.message}</span>,
            inc ? (
              <span className="row">
                <span className="badge">{inc}</span>
                <button className="link" aria-label={`Unlink ${l.id} from ${inc}`} onClick={() => unlink(l.id)}>
                  ✕
                </button>
              </span>
            ) : null,
          ];
        }}
      />
      {dialog && (
        <Modal labelledBy="data-link-title" onClose={() => setDialog(null)}>
            <h2 id="data-link-title">
              Link {selected.length} line{selected.length === 1 ? "" : "s"} to an incident
            </h2>
            <fieldset className="field">
              <legend>Incident</legend>
              {INCIDENTS.map((i, n) => (
                <label key={i.id} className="inline">
                  <input type="radio" name="data-incident" autoFocus={n === 0} checked={dialog.incident === i.id} onChange={() => setDialog({ incident: i.id })} />
                  {i.id} · {i.name}
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button onClick={() => setDialog(null)}>Cancel</button>
              <button className="primary" disabled={!dialog.incident} onClick={link}>
                Link
              </button>
            </div>
        </Modal>
      )}
    </section>
  );
}

export const TASKS: Record<string, TaskPage> = {
  "ledger-refund": { title: "Payments ledger", component: PaymentsLedger },
  "tickets-bulk-archive": { title: "Ticket queue", component: HelpDesk },
  "stock-reorder": { title: "Reorder planner", component: ReorderPlanner },
  "logs-incident-link": { title: "Incident logs", component: IncidentLogs },
};
