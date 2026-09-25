/**
 * Hard suite, theme "traps": the small details real apps get wrong-footed on. Prefilled values that
 * are stale, opt-ins that start switched on, a dialog that interrupts after a delay, look-alike
 * destructive neighbours, exact text, a Save that saves only the current tab, buttons disabled until
 * the form is valid, and settings that silently reset when something else changes.
 */
import { useEffect, useState } from "react";
import type { TaskPage } from "../index.ts";
import { useReport } from "../../report.ts";

function Toggle({ id, label, on, set }: { id: string; label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="row between setting">
      <span id={id}>{label}</span>
      <button role="switch" aria-checked={on} aria-labelledby={id} className={`switch ${on ? "on" : ""}`} onClick={() => set(!on)}>
        <span className="knob" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* profile-tabs-save: a Save that saves only the tab you are on, over stale prefilled values.        */

type Personal = { displayName: string; jobTitle: string; pronouns: string };
type Contact = { workEmail: string; secondaryEmail: string; phone: string };
type Notify = { mentions: boolean; weeklyDigest: boolean; productAnnouncements: boolean; partnerOffers: boolean };
type Profile = { personal: Personal; contact: Contact; notifications: Notify };
type ProfileTab = keyof Profile;

const PROFILE0: Profile = {
  personal: { displayName: "JR Okafor", jobTitle: "Senior Engineer", pronouns: "they/them" },
  contact: { workEmail: "jr.okafor@acme.test", secondaryEmail: "jrokafor@oldmail.test", phone: "415-555-0199" },
  notifications: { mentions: true, weeklyDigest: false, productAnnouncements: true, partnerOffers: true },
};
const TAB_LABEL: Record<ProfileTab, string> = { personal: "Personal", contact: "Contact", notifications: "Notifications" };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ProfileTabsSave() {
  const [tab, setTab] = useState<ProfileTab>("personal");
  const [draft, setDraft] = useState<Profile>(PROFILE0);
  const [saved, setSaved] = useState<Profile>(PROFILE0);
  const [saves, setSaves] = useState(0);
  const unsavedTabs = (Object.keys(TAB_LABEL) as ProfileTab[]).filter((t) => !same(draft[t], saved[t]));
  useReport({ saved, draft, unsavedTabs, saves });

  const edit = <K extends ProfileTab>(t: K, key: keyof Profile[K], value: unknown) => setDraft((d) => ({ ...d, [t]: { ...d[t], [key]: value } }));
  const text = <K extends ProfileTab>(t: K, key: keyof Profile[K] & string, label: string, type = "text") => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={String(draft[t][key])} onChange={(e) => edit(t, key, e.target.value)} />
    </label>
  );
  const n = draft.notifications;
  return (
    <section className="card narrow">
      <h1>Member profile</h1>
      <div role="tablist" aria-label="Profile sections" className="tabs">
        {(Object.keys(TAB_LABEL) as ProfileTab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="muted">Each section is saved separately.</p>
      <div role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {tab === "personal" && (
          <>
            {text("personal", "displayName", "Display name")}
            {text("personal", "jobTitle", "Job title")}
            {text("personal", "pronouns", "Pronouns")}
          </>
        )}
        {tab === "contact" && (
          <>
            {text("contact", "workEmail", "Work email", "email")}
            {text("contact", "secondaryEmail", "Secondary email", "email")}
            {text("contact", "phone", "Phone number", "tel")}
          </>
        )}
        {tab === "notifications" && (
          <>
            <Toggle id="pf-mentions" label="Mentions" on={n.mentions} set={(v) => edit("notifications", "mentions", v)} />
            <Toggle id="pf-digest" label="Weekly digest" on={n.weeklyDigest} set={(v) => edit("notifications", "weeklyDigest", v)} />
            <Toggle id="pf-product" label="Product announcements" on={n.productAnnouncements} set={(v) => edit("notifications", "productAnnouncements", v)} />
            <Toggle id="pf-partner" label="Partner offers" on={n.partnerOffers} set={(v) => edit("notifications", "partnerOffers", v)} />
          </>
        )}
      </div>
      <div className="actions">
        <span className="muted">{same(draft[tab], saved[tab]) ? `${TAB_LABEL[tab]} saved` : `Unsaved changes in ${TAB_LABEL[tab]}`}</span>
        <button onClick={() => setDraft((d) => ({ ...d, [tab]: saved[tab] }))}>Discard changes</button>
        <button
          className="primary"
          onClick={() => {
            setSaved((s) => ({ ...s, [tab]: draft[tab] }));
            setSaves((x) => x + 1);
          }}
        >
          Save changes
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* project-delete-confirm: look-alike rows, a type-to-confirm dialog with a default-on extra delete, */
/* and a session dialog that interrupts it after a delay.                                             */

const PROJECTS = [
  { name: "web-dashboard", owner: "Sofia", updated: "Sep 24" },
  { name: "mobile-app", owner: "Kenji", updated: "Sep 24" },
  { name: "auth-service", owner: "Amara", updated: "Sep 23" },
  { name: "mobile-app-legacy-v2", owner: "Kenji", updated: "Sep 21" },
  { name: "billing-api", owner: "Lukas", updated: "Sep 19" },
  { name: "web-dashboard-old-2", owner: "Sofia", updated: "Sep 12" },
  { name: "data-pipeline", owner: "Priya", updated: "Sep 10" },
  { name: "marketing-site", owner: "Nora", updated: "Sep 02" },
  { name: "mobile-api-legacy", owner: "Kenji", updated: "Aug 28" },
  { name: "docs-site", owner: "Nora", updated: "Aug 20" },
  { name: "mobile-app-legacy", owner: "Kenji", updated: "Aug 11" },
  { name: "search-indexer", owner: "Priya", updated: "Jul 30" },
  { name: "web-dashboard-old", owner: "Sofia", updated: "Jul 02" },
  { name: "status-page", owner: "Amara", updated: "Jun 15" },
];
type ProjectStatus = "active" | "archived" | "deleted";

function ProjectDeleteConfirm() {
  const [status, setStatus] = useState<Record<string, ProjectStatus>>(() => Object.fromEntries(PROJECTS.map((p) => [p.name, "active"])));
  const [reposDeleted, setReposDeleted] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [alsoRepo, setAlsoRepo] = useState(true);
  const [session, setSession] = useState<"idle" | "waiting" | "shown" | "done">("idle");
  const [signedOut, setSignedOut] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  useReport({ projects: status, repositoriesDeleted: reposDeleted, deleteDialog: pending, sessionPrompt: session, signedOut });

  useEffect(() => {
    if (session !== "waiting") return;
    const t = setTimeout(() => setSession("shown"), 1500);
    return () => clearTimeout(t);
  }, [session]);

  const openDelete = (name: string) => {
    setPending(name);
    setTyped("");
    setAlsoRepo(true);
    if (session === "idle") setSession("waiting");
  };
  const set = (name: string, s: ProjectStatus) => setStatus((m) => ({ ...m, [name]: s }));

  if (signedOut)
    return (
      <section className="card narrow">
        <h1>Signed out</h1>
        <p>You have been signed out of Acme Workspace.</p>
      </section>
    );

  return (
    <section className="card">
      <h1>Projects</h1>
      <p className="muted">Deleting a project cannot be undone. Archived projects can be restored at any time.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Owner</th>
            <th>Updated</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {PROJECTS.filter((p) => status[p.name] !== "deleted").map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>{p.owner}</td>
              <td>{p.updated}</td>
              <td>
                <span className="badge">{status[p.name] === "archived" ? "Archived" : "Active"}</span>
              </td>
              <td className="row">
                {status[p.name] === "archived" ? (
                  <button className="small" aria-label={`Unarchive ${p.name}`} onClick={() => set(p.name, "active")}>
                    Unarchive
                  </button>
                ) : (
                  <button
                    className="small"
                    aria-label={`Archive ${p.name}`}
                    onClick={() => {
                      set(p.name, "archived");
                      setToast({ text: `Archived ${p.name}.`, undo: () => set(p.name, "active") });
                    }}
                  >
                    Archive
                  </button>
                )}
                <button className="small link danger" aria-label={`Delete ${p.name}`} onClick={() => openDelete(p.name)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toast && (
        <div role="status" className="row">
          <span>{toast.text}</span>
          <button
            className="link"
            onClick={() => {
              toast.undo();
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
      {pending !== null && (
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="pd-title" className="dialog">
            <h2 id="pd-title">Delete {pending}?</h2>
            <p>
              This permanently deletes the project <strong>{pending}</strong>, its deployments and its environment variables.
            </p>
            <label className="field">
              <span>Type the project name to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            <label className="inline">
              <input type="checkbox" checked={alsoRepo} onChange={(e) => setAlsoRepo(e.target.checked)} /> Also delete the GitHub repository acme/{pending}
            </label>
            <div className="actions">
              <button onClick={() => setPending(null)}>Cancel</button>
              <button
                className="danger-fill"
                disabled={typed !== pending}
                onClick={() => {
                  set(pending, "deleted");
                  if (alsoRepo) setReposDeleted((r) => [...r, `acme/${pending}`]);
                  setToast(null);
                  setPending(null);
                }}
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
      {session === "shown" && (
        <div className="backdrop traps-top">
          <div role="alertdialog" aria-modal="true" aria-labelledby="ss-title" aria-describedby="ss-body" className="dialog">
            <h2 id="ss-title">Your session is about to expire</h2>
            <p id="ss-body">For your security you will be signed out soon. Do you want to stay signed in?</p>
            <div className="actions">
              <button
                onClick={() => {
                  setSignedOut(true);
                  setSession("done");
                }}
              >
                Sign out
              </button>
              <button className="primary" autoFocus onClick={() => setSession("done")}>
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* checkout-country-reset: changing the country silently resets shipping speed and protection.      */

type Country = "United States" | "Canada" | "United Kingdom";
const REGIONS: Record<Country, { label: string; options: string[] }> = {
  "United States": { label: "State", options: ["California", "New York", "Texas", "Washington"] },
  Canada: { label: "Province", options: ["Alberta", "British Columbia", "Ontario", "Quebec"] },
  "United Kingdom": { label: "Nation", options: ["England", "Northern Ireland", "Scotland", "Wales"] },
};
const POSTAL: Record<Country, RegExp> = {
  "United States": /^\d{5}$/,
  Canada: /^[A-Z]\d[A-Z] \d[A-Z]\d$/,
  "United Kingdom": /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/,
};
const SPEEDS: Record<Country, Record<string, number>> = {
  "United States": { Standard: 0, Express: 12, Overnight: 29 },
  Canada: { Standard: 9, Express: 18 },
  "United Kingdom": { Standard: 14, Express: 25 },
};
const ITEMS = [
  { name: "Trail running shoes", price: 89 },
  { name: "Merino socks (2-pack)", price: 24 },
];
const money = (n: number) => `$${n.toFixed(2)}`;

type Checkout = {
  name: string;
  street: string;
  country: Country;
  region: string;
  postalCode: string;
  speed: string;
  protection: boolean;
  saveAddress: boolean;
  marketing: boolean;
};

function CheckoutCountryReset() {
  const [f, setF] = useState<Checkout>({
    name: "Maya Chen",
    street: "500 Howard St",
    country: "United States",
    region: "California",
    postalCode: "94107",
    speed: "Express",
    protection: true,
    saveAddress: true,
    marketing: true,
  });
  const [orders, setOrders] = useState<Checkout[]>([]);
  useReport({ form: f, orders });
  const set = <K extends keyof Checkout>(k: K, v: Checkout[K]) => setF((x) => ({ ...x, [k]: v }));

  const postalOk = POSTAL[f.country].test(f.postalCode);
  const valid = f.name.trim() !== "" && f.street.trim() !== "" && f.region !== "" && postalOk;
  const speeds = SPEEDS[f.country];
  const subtotal = ITEMS.reduce((s, i) => s + i.price, 0);
  const shipping = speeds[f.speed] ?? 0;
  const total = subtotal + shipping + (f.protection ? 4.99 : 0);
  const region = REGIONS[f.country];
  return (
    <section className="card">
      <h1>Checkout</h1>
      <div className="traps-cols">
        <div>
          <h2>Shipping address</h2>
          <label className="field">
            <span>Full name</span>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="field">
            <span>Street address</span>
            <input value={f.street} onChange={(e) => set("street", e.target.value)} />
          </label>
          <label className="field">
            <span>Country</span>
            <select
              value={f.country}
              onChange={(e) => {
                const country = e.target.value as Country;
                // Rates and add-ons depend on the destination, so they go back to their defaults.
                setF((x) => ({ ...x, country, region: "", speed: "Standard", protection: true }));
              }}
            >
              {(Object.keys(REGIONS) as Country[]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{region.label}</span>
            <select value={f.region} onChange={(e) => set("region", e.target.value)}>
              <option value="">Select a {region.label.toLowerCase()}</option>
              {region.options.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{f.country === "United States" ? "ZIP code" : "Postal code"}</span>
            <input value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} aria-invalid={!postalOk} aria-describedby="co-postal-err" />
          </label>
          {!postalOk && (
            <p id="co-postal-err" className="error">
              Enter a valid postal code for {f.country}.
            </p>
          )}
          <fieldset className="field">
            <legend>Shipping speed</legend>
            {Object.entries(speeds).map(([s, price]) => (
              <label key={s} className="inline">
                <input type="radio" name="speed" checked={f.speed === s} onChange={() => set("speed", s)} /> {s} ({price === 0 ? "free" : money(price)})
              </label>
            ))}
          </fieldset>
          <label className="inline">
            <input type="checkbox" checked={f.protection} onChange={(e) => set("protection", e.target.checked)} /> Add shipping protection ($4.99)
          </label>
          <br />
          <label className="inline">
            <input type="checkbox" checked={f.saveAddress} onChange={(e) => set("saveAddress", e.target.checked)} /> Save this address for next time
          </label>
          <br />
          <label className="inline">
            <input type="checkbox" checked={f.marketing} onChange={(e) => set("marketing", e.target.checked)} /> Email me deals and product news
          </label>
        </div>
        <aside aria-label="Order summary">
          <h2>Order summary</h2>
          <ul className="list">
            {ITEMS.map((i) => (
              <li key={i.name} className="row between">
                <span>{i.name}</span>
                <span>{money(i.price)}</span>
              </li>
            ))}
            <li className="row between">
              <span>Shipping ({f.speed})</span>
              <span>{money(shipping)}</span>
            </li>
            {f.protection && (
              <li className="row between">
                <span>Shipping protection</span>
                <span>{money(4.99)}</span>
              </li>
            )}
          </ul>
          <p className="total">Total {money(total)}</p>
        </aside>
      </div>
      <div className="actions">
        <button className="primary" disabled={!valid} onClick={() => setOrders((o) => [...o, f])}>
          Place order
        </button>
      </div>
      {orders.length > 0 && (
        <p role="status">
          Order placed ({orders.length}). Shipping to {orders.at(-1)!.country} by {orders.at(-1)!.speed}.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* vacation-responder: stale prefilled dates and text, smart punctuation that rewrites what you     */
/* typed, a default-on audience, a disabled Save until the dates make sense, and a delayed upsell.   */

const TODAY = "2026-09-25";
const focusOnMount = (el: HTMLElement | null) => {
  el?.focus();
};
type Responder = { enabled: boolean; firstDay: string; lastDay: string; subject: string; message: string; replyOutside: boolean };
const RESPONDER0: Responder = {
  enabled: false,
  firstDay: "2026-08-03",
  lastDay: "2026-08-14",
  subject: "Out of Office",
  message: "I am out of the office until August 14 with limited access to email.",
  replyOutside: true,
};
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const smarten = (s: string) =>
  s
    .replace(/(^|[\s(])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/'/g, "’");

function VacationResponder() {
  const [draft, setDraft] = useState<Responder>(RESPONDER0);
  const [saved, setSaved] = useState<Responder>(RESPONDER0);
  const [smart, setSmart] = useState(true);
  const [touched, setTouched] = useState(false);
  const [upsell, setUpsell] = useState<"idle" | "shown" | "done">("idle");
  const [aiReplies, setAiReplies] = useState(false);
  const unsaved = !same(draft, saved);
  useReport({ saved, draft, unsaved, aiReplies, smartPunctuation: smart });

  useEffect(() => {
    if (!touched || upsell !== "idle") return;
    const t = setTimeout(() => setUpsell("shown"), 1500);
    return () => clearTimeout(t);
  }, [touched, upsell]);

  const set = <K extends keyof Responder>(k: K, v: Responder[K]) => {
    setTouched(true);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const error = !isDate(draft.firstDay)
    ? "Enter the first day as YYYY-MM-DD."
    : !isDate(draft.lastDay)
      ? "Enter the last day as YYYY-MM-DD."
      : draft.firstDay < TODAY
        ? "The first day can't be in the past."
        : draft.lastDay < draft.firstDay
          ? "The last day must be on or after the first day."
          : draft.subject.trim() === ""
            ? "Enter a subject."
            : "";

  return (
    <section className="card narrow">
      <h1>Vacation responder</h1>
      <Toggle id="vr-enabled" label="Automatic replies" on={draft.enabled} set={(v) => set("enabled", v)} />
      <div className="row">
        <label className="field grow">
          <span>First day (YYYY-MM-DD)</span>
          <input value={draft.firstDay} onChange={(e) => set("firstDay", e.target.value)} />
        </label>
        <label className="field grow">
          <span>Last day (YYYY-MM-DD)</span>
          <input value={draft.lastDay} onChange={(e) => set("lastDay", e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Subject</span>
        <input value={draft.subject} onChange={(e) => set("subject", smart ? smarten(e.target.value) : e.target.value)} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={5} value={draft.message} onChange={(e) => set("message", smart ? smarten(e.target.value) : e.target.value)} />
      </label>
      <Toggle id="vr-smart" label="Smart punctuation (curly quotes and apostrophes)" on={smart} set={setSmart} />
      <label className="inline setting">
        <input type="checkbox" checked={draft.replyOutside} onChange={(e) => set("replyOutside", e.target.checked)} /> Also reply to senders outside Acme
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <span className="muted">{unsaved ? "Unsaved changes" : "All changes saved"}</span>
        <button onClick={() => setDraft(saved)}>Discard</button>
        <button className="primary" disabled={error !== "" || !unsaved} onClick={() => setSaved(draft)}>
          Save
        </button>
      </div>
      {upsell === "shown" && (
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="ai-title" className="dialog" tabIndex={-1} ref={focusOnMount}>
            <h2 id="ai-title">Let AI write your replies?</h2>
            <p>While you are away, AI replies answer each sender with a personalised message drafted from your inbox.</p>
            <div className="actions">
              <button onClick={() => setUpsell("done")}>Not now</button>
              <button
                className="primary"
                onClick={() => {
                  setAiReplies(true);
                  setUpsell("done");
                }}
              >
                Turn on AI replies
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export const TASKS: Record<string, TaskPage> = {
  "profile-tabs-save": { title: "Member profile", component: ProfileTabsSave },
  "project-delete-confirm": { title: "Project admin", component: ProjectDeleteConfirm },
  "checkout-country-reset": { title: "Order checkout", component: CheckoutCountryReset },
  "vacation-responder": { title: "Vacation responder", component: VacationResponder },
};
