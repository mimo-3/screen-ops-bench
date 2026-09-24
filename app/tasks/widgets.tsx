/** Custom widgets: tabs and switches, a multi-step wizard, a date picker, sliders, a nested menu. */
import { useState } from "react";
import { useReport } from "../report.ts";

function Switch({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="row between setting">
      <span id={`sw-${label}`}>{label}</span>
      <button role="switch" aria-checked={on} aria-labelledby={`sw-${label}`} className={`switch ${on ? "on" : ""}`} onClick={() => set(!on)}>
        <span className="knob" />
      </button>
    </div>
  );
}

type Prefs = { emailDigest: boolean; push: boolean; sms: boolean; darkMode: boolean; shareUsage: boolean };

export function SettingsTabs() {
  const initial: Prefs = { emailDigest: true, push: false, sms: false, darkMode: false, shareUsage: true };
  const [tab, setTab] = useState("General");
  const [draft, setDraft] = useState<Prefs>(initial);
  const [saved, setSaved] = useState<Prefs>(initial);
  useReport({ saved, unsaved: JSON.stringify(draft) !== JSON.stringify(saved) });
  const set = (k: keyof Prefs) => (v: boolean) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <section className="card narrow">
      <h1>Settings</h1>
      <div role="tablist" className="tabs">
        {["General", "Notifications", "Privacy"].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {tab === "General" && <Switch label="Dark mode" on={draft.darkMode} set={set("darkMode")} />}
        {tab === "Notifications" && (
          <>
            <Switch label="Email digest" on={draft.emailDigest} set={set("emailDigest")} />
            <Switch label="Push notifications" on={draft.push} set={set("push")} />
            <Switch label="SMS alerts" on={draft.sms} set={set("sms")} />
          </>
        )}
        {tab === "Privacy" && <Switch label="Share usage data" on={draft.shareUsage} set={set("shareUsage")} />}
      </div>
      <div className="actions">
        <span className="muted">{JSON.stringify(draft) === JSON.stringify(saved) ? "Saved" : "Unsaved changes"}</span>
        <button className="primary" onClick={() => setSaved(draft)}>
          Save settings
        </button>
      </div>
    </section>
  );
}

export function WizardTeam() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const [billing, setBilling] = useState("monthly");
  const [orders, setOrders] = useState<Array<{ plan: string; seats: number; billing: string }>>([]);
  useReport({ orders, step });
  const PRICE: Record<string, number> = { Starter: 0, Team: 12, Enterprise: 40 };
  return (
    <section className="card">
      <h1>Upgrade your workspace</h1>
      <p className="muted">Step {step} of 3</p>
      {step === 1 && (
        <div className="plans" role="radiogroup" aria-label="Plan">
          {["Starter", "Team", "Enterprise"].map((p) => (
            <button key={p} role="radio" aria-checked={plan === p} className={`plan ${plan === p ? "chosen" : ""}`} onClick={() => setPlan(p)}>
              <strong>{p}</strong>
              <span>${PRICE[p]} / seat / month</span>
            </button>
          ))}
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="row">
            <span>Seats</span>
            <div className="stepper">
              <button aria-label="Remove a seat" onClick={() => setSeats((s) => Math.max(1, s - 1))}>
                −
              </button>
              <output aria-label="Seats">{seats}</output>
              <button aria-label="Add a seat" onClick={() => setSeats((s) => Math.min(50, s + 1))}>
                +
              </button>
            </div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Billing">
            {["monthly", "annual"].map((b) => (
              <button key={b} role="radio" aria-checked={billing === b} className={billing === b ? "active" : ""} onClick={() => setBilling(b)}>
                {b === "monthly" ? "Billed monthly" : "Billed annually"}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="review">
          <p>
            {plan} plan, {seats} seat{seats === 1 ? "" : "s"}, billed {billing === "annual" ? "annually" : "monthly"}.
          </p>
          {orders.length > 0 && <p role="status">Order confirmed. Thank you!</p>}
        </div>
      )}
      <div className="actions">
        {step > 1 && <button onClick={() => setStep((s) => s - 1)}>Back</button>}
        {step < 3 && (
          <button className="primary" disabled={step === 1 && !plan} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        )}
        {step === 3 && (
          <button className="primary" onClick={() => setOrders((o) => [...o, { plan: plan!, seats, billing }])}>
            Confirm order
          </button>
        )}
      </div>
    </section>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function DatePicker() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 2026, m: 8 });
  const [picked, setPicked] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  useReport({ applied, open });
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const lead = new Date(view.y, view.m, 1).getDay();
  const shift = (d: number) => setView((v) => ({ y: v.y + Math.floor((v.m + d) / 12), m: (v.m + d + 12) % 12 }));
  return (
    <section className="card narrow">
      <h1>Schedule delivery</h1>
      <div className="field">
        <span>Delivery date</span>
        <button className="datefield" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {applied ?? "Choose a date"}
        </button>
      </div>
      {open && (
        <div role="dialog" aria-label="Choose delivery date" className="calendar">
          <div className="row between">
            <button className="icon" aria-label="Previous month" onClick={() => shift(-1)}>
              ‹
            </button>
            <strong aria-live="polite">
              {MONTHS[view.m]} {view.y}
            </strong>
            <button className="icon" aria-label="Next month" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className="grid7">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="muted">
                {d}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = iso(view.y, view.m, i + 1);
              return (
                <button key={d} aria-label={`${MONTHS[view.m]} ${i + 1}, ${view.y}`} aria-pressed={picked === d} className={`day ${picked === d ? "chosen" : ""}`} onClick={() => setPicked(d)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="actions">
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="primary"
              disabled={!picked}
              onClick={() => {
                setApplied(picked);
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function VolumeSlider() {
  const [volume, setVolume] = useState(70);
  const [bass, setBass] = useState(50);
  useReport({ volume, bass });
  return (
    <section className="card narrow">
      <h1>Sound</h1>
      <label className="field">
        <span>
          Volume <output>{volume}</output>
        </span>
        <input type="range" min={0} max={100} step={5} value={volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>
          Bass <output>{bass}</output>
        </span>
        <input type="range" min={0} max={100} step={5} value={bass} aria-label="Bass" onChange={(e) => setBass(Number(e.target.value))} />
      </label>
    </section>
  );
}

export function NestedMenu() {
  const [open, setOpen] = useState<null | "root" | "export">(null);
  const [exports, setExports] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  useReport({ exports, archived, menuOpen: open !== null });
  const pick = (f: () => void) => () => {
    f();
    setOpen(null);
  };
  return (
    <section className="card narrow">
      <div className="row between">
        <h1>Quarterly report</h1>
        <div className="menuwrap">
          <button aria-haspopup="menu" aria-expanded={open !== null} onClick={() => setOpen(open ? null : "root")}>
            More actions ▾
          </button>
          {open && (
            <div role="menu" aria-label="More actions" className="menu">
              <button role="menuitem" onClick={pick(() => undefined)}>
                Rename
              </button>
              <button role="menuitem" aria-haspopup="menu" aria-expanded={open === "export"} onClick={() => setOpen("export")}>
                Export ▸
              </button>
              <button role="menuitem" onClick={pick(() => setArchived(true))}>
                Archive
              </button>
              {open === "export" && (
                <div role="menu" aria-label="Export" className="menu sub">
                  {["PDF", "CSV", "Excel"].map((f) => (
                    <button key={f} role="menuitem" onClick={pick(() => setExports((x) => [...x, f]))}>
                      Export as {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <p>Revenue grew 12% quarter over quarter.</p>
      {exports.length > 0 && <p role="status">Exported as {exports.at(-1)}.</p>}
    </section>
  );
}
