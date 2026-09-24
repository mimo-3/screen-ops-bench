/** Forms: text fields, a native select, radios, a checkbox, a text area and a stepper. */
import { useState } from "react";
import { useReport } from "../report.ts";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("Japan");
  const [plan, setPlan] = useState("Free");
  const [agreed, setAgreed] = useState(false);
  const [submissions, setSubmissions] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  useReport({ name, email, country, plan, agreed, submissions });

  const submit = () => {
    if (!agreed) return setError("Please agree to the terms first.");
    setError("");
    setSubmissions((s) => [...s, { name, email, country, plan, agreed }]);
  };

  return (
    <section className="card narrow">
      <h1>Create your account</h1>
      <label className="field">
        <span>Full name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="field">
        <span>Country</span>
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {["Japan", "United States", "Germany", "France", "Brazil"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <fieldset className="field">
        <legend>Plan</legend>
        {["Free", "Pro", "Business"].map((p) => (
          <label key={p} className="inline">
            <input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} /> {p}
          </label>
        ))}
      </fieldset>
      <label className="inline">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I agree to the terms of service
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        <button className="primary" onClick={submit}>
          Create account
        </button>
      </div>
      {submissions.length > 0 && <p role="status">Account created for {String(submissions.at(-1)!.email)}.</p>}
    </section>
  );
}

export function NotesAppend() {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("Agenda:\n1. Budget");
  const [saved, setSaved] = useState("Agenda:\n1. Budget");
  const [saves, setSaves] = useState(0);
  useReport({ search, draft, saved, saves });
  return (
    <section className="card">
      <div className="row between">
        <h1>Meeting notes</h1>
        <input aria-label="Search notes" className="search" placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <div className="actions">
        <span className="muted">{draft === saved ? "All changes saved" : "Unsaved changes"}</span>
        <button
          className="primary"
          onClick={() => {
            setSaved(draft);
            setSaves((n) => n + 1);
          }}
        >
          Save notes
        </button>
      </div>
    </section>
  );
}

export function CartCoupon() {
  const PRICES: Record<string, number> = { "Blue Mug": 12, "Paper Notebook": 8, "Desk Lamp": 45 };
  const [items, setItems] = useState<Array<{ name: string; qty: number }>>([
    { name: "Blue Mug", qty: 1 },
    { name: "Paper Notebook", qty: 2 },
    { name: "Desk Lamp", qty: 1 },
  ]);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const subtotal = items.reduce((s, i) => s + PRICES[i.name]! * i.qty, 0);
  const total = coupon === "SAVE10" ? Math.round(subtotal * 0.9 * 100) / 100 : subtotal;
  useReport({ items, coupon, total });

  const setQty = (name: string, qty: number) => setItems((xs) => xs.map((x) => (x.name === name ? { ...x, qty: Math.max(1, Math.min(9, qty)) } : x)));
  return (
    <section className="card">
      <h1>Your cart</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Quantity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td>{i.name}</td>
              <td>${PRICES[i.name]}</td>
              <td>
                <div className="stepper">
                  <button aria-label={`Decrease quantity of ${i.name}`} onClick={() => setQty(i.name, i.qty - 1)}>
                    −
                  </button>
                  <output aria-label={`Quantity of ${i.name}`}>{i.qty}</output>
                  <button aria-label={`Increase quantity of ${i.name}`} onClick={() => setQty(i.name, i.qty + 1)}>
                    +
                  </button>
                </div>
              </td>
              <td>
                <button className="link danger" aria-label={`Remove ${i.name}`} onClick={() => setItems((xs) => xs.filter((x) => x.name !== i.name))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <input aria-label="Coupon code" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button
          onClick={() => {
            if (code.trim().toUpperCase() === "SAVE10") {
              setCoupon("SAVE10");
              setMessage("Coupon SAVE10 applied: 10% off.");
            } else setMessage("That coupon code is not valid.");
          }}
        >
          Apply coupon
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <p className="total">Total: ${total.toFixed(2)}</p>
    </section>
  );
}
