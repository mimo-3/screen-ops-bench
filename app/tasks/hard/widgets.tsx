/**
 * Hard widgets: a reviewer combobox with delayed suggestions and tokens, a kanban board moved by
 * drag and drop or its keyboard alternative, a lazily loaded file tree with a context menu, and a
 * booking form built from custom listboxes and a date range picker.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { TaskPage } from "../index.ts";
import { useReport } from "../../report.ts";

/* ------------------------------------------------------------------ reviewers (combobox + tokens) */

type Person = { handle: string; name: string; team: string };

const DIRECTORY: Person[] = [
  { handle: "akim", name: "Alex Kim", team: "Platform" },
  { handle: "akimura", name: "Alex Kimura", team: "Design" },
  { handle: "dwu", name: "Dana Wu", team: "Platform" },
  { handle: "srivera", name: "Sam Rivera", team: "Design" },
  { handle: "sam-rivera", name: "Sam Rivera", team: "Platform" },
  { handle: "samantha.r", name: "Samantha Rivera", team: "Platform" },
  { handle: "jordanlee", name: "Jordan Lee", team: "Mobile" },
  { handle: "jleeds", name: "Jordan Leeds", team: "Security" },
  { handle: "jlee", name: "Jordan Lee", team: "Security" },
  { handle: "pnatarajan", name: "Priya Natarajan", team: "Platform" },
  { handle: "mchen", name: "Mei Chen", team: "Security" },
  { handle: "tokafor", name: "Tobi Okafor", team: "Mobile" },
];
const AUTHOR = "pnatarajan";
const person = (h: string) => DIRECTORY.find((p) => p.handle === h)!;

function PullRequestReviewers() {
  const [reviewers, setReviewers] = useState<string[]>(["akim", "akimura", "dwu"]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [requests, setRequests] = useState<string[][]>([]);
  const listId = useId();
  useReport({ reviewers: [...reviewers].sort(), requests });

  useEffect(() => {
    const q = query.trim().toLowerCase();
    setResults(null);
    if (q.length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      setResults(DIRECTORY.filter((p) => p.name.toLowerCase().includes(q) || p.handle.includes(q)));
      setActive(0);
      setLoading(false);
    }, 800);
    return () => clearTimeout(t);
  }, [query]);

  const shown = (results ?? []).filter((p) => !reviewers.includes(p.handle));
  const open = results !== null;
  const pick = (p: Person) => {
    if (p.handle === AUTHOR) return;
    setReviewers((r) => (r.includes(p.handle) ? r : [...r, p.handle]));
    setQuery("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && shown.length) {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && shown.length) {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = shown[active];
      if (open && p) pick(p);
    } else if (e.key === "Escape") {
      setQuery("");
    } else if (e.key === "Backspace" && query === "" && reviewers.length) {
      // Like most token inputs: Backspace in the empty field removes the last token.
      setReviewers((r) => r.slice(0, -1));
    }
  };

  return (
    <section className="card">
      <h1>Fix race in session refresh #482</h1>
      <p className="muted">
        Opened by Priya Natarajan (@pnatarajan) · 6 files changed · targets <code>main</code>
      </p>
      <div className="field">
        <span id="rv-label">Reviewers</span>
        <ul className="tokens" aria-label="Selected reviewers">
          {reviewers.map((h) => {
            const p = person(h);
            return (
              <li key={h} className="token">
                {p.name} <span className="muted">@{h}</span>
                <button className="link" aria-label={`Remove ${p.name} (@${h})`} onClick={() => setReviewers((r) => r.filter((x) => x !== h))}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <div className="combo">
          <input
            role="combobox"
            aria-labelledby="rv-label"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].handle}` : undefined}
            placeholder="Search people by name or handle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          {loading && (
            <p role="status" className="muted">
              Searching…
            </p>
          )}
          {open && (
            <ul role="listbox" id={listId} aria-label="Suggested reviewers" className="popup">
              {shown.length === 0 && <li className="muted">No matching people</li>}
              {shown.map((p, i) => (
                <li
                  key={p.handle}
                  id={`${listId}-${p.handle}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={p.handle === AUTHOR}
                  aria-label={`${p.name} · ${p.team} · @${p.handle}${p.handle === AUTHOR ? " (author)" : ""}`}
                  className={`opt ${i === active ? "active" : ""} ${p.handle === AUTHOR ? "off" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                >
                  <strong>{p.name}</strong> <span className="muted">
                    {p.team} · @{p.handle}
                    {p.handle === AUTHOR ? " · author" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="actions">
        {requests.length > 0 && (
          <span role="status" className="muted">
            Review requested from {requests.at(-1)!.length} people.
          </span>
        )}
        <button className="primary" disabled={reviewers.length === 0} onClick={() => setRequests((q) => [...q, [...reviewers].sort()])}>
          Request review
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ roadmap board (drag and drop) */

type ColId = "backlog" | "progress" | "review" | "done";
type Board = Record<ColId, string[]>;
const COLUMNS: { id: ColId; name: string; limit?: number }[] = [
  { id: "backlog", name: "Backlog" },
  { id: "progress", name: "In progress", limit: 3 },
  { id: "review", name: "Review" },
  { id: "done", name: "Done" },
];
const colOf = (b: Board, title: string) => COLUMNS.findIndex((c) => b[c.id].includes(title));

function RoadmapBoard() {
  const [board, setBoard] = useState<Board>({
    backlog: ["SSO login", "Billing export", "Dark mode polish", "Webhook retries"],
    progress: ["Audit log search", "Billing export v2", "Mobile push"],
    review: ["Onboarding checklist"],
    done: ["Usage dashboard", "CSV import"],
  });
  const [grab, setGrab] = useState<{ title: string; snapshot: Board } | null>(null);
  const [mouseDrag, setMouseDrag] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const handles = useRef(new Map<string, HTMLButtonElement>());
  useReport({ columns: board, grabbed: grab?.title ?? null });

  useEffect(() => {
    if (grab) handles.current.get(grab.title)?.focus();
  }, [board, grab]);

  const full = (b: Board, to: number, title: string) => {
    const c = COLUMNS[to]!;
    return c.limit !== undefined && !b[c.id].includes(title) && b[c.id].length >= c.limit;
  };
  const limitNote = (to: number) => `${COLUMNS[to]!.name} is at its limit of ${COLUMNS[to]!.limit}. Move a card out first.`;

  /** Moves `title` into column `to`, before `before` (or last). Returns null when the column is full. */
  const place = (b: Board, title: string, to: number, index: number): Board | null => {
    if (full(b, to, title)) return null;
    const next = Object.fromEntries(COLUMNS.map((c) => [c.id, b[c.id].filter((t) => t !== title)])) as Board;
    const col = next[COLUMNS[to]!.id];
    col.splice(Math.max(0, Math.min(index, col.length)), 0, title);
    return next;
  };

  const onHandleKey = (title: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const from = colOf(board, title);
    const idx = board[COLUMNS[from]!.id].indexOf(title);
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!grab) {
        setGrab({ title, snapshot: board });
        setNote(`Picked up ${title}. Use the arrow keys to move it, Space to drop, Escape to cancel.`);
      } else if (grab.title === title) {
        setGrab(null);
        setNote(`Dropped ${title} in ${COLUMNS[from]!.name}, position ${idx + 1} of ${board[COLUMNS[from]!.id].length}.`);
      }
      return;
    }
    if (!grab || grab.title !== title) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setBoard(grab.snapshot);
      setGrab(null);
      setNote(`Cancelled. ${title} is back where it was.`);
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const to = from + m[0];
    if (to < 0 || to >= COLUMNS.length) return;
    const next = place(board, title, to, m[0] === 0 ? idx + m[1] : idx);
    if (!next) return setNote(limitNote(to));
    setBoard(next);
    setNote(`${title}: ${COLUMNS[to]!.name}, position ${next[COLUMNS[to]!.id].indexOf(title) + 1} of ${next[COLUMNS[to]!.id].length}.`);
  };

  const dropMouse = (to: number, before: string | null) => {
    const title = mouseDrag;
    setMouseDrag(null);
    if (!title || title === before) return;
    const without = board[COLUMNS[to]!.id].filter((t) => t !== title);
    const next = place(board, title, to, before === null ? without.length : without.indexOf(before));
    if (!next) return setNote(limitNote(to));
    setBoard(next);
    setNote(`Moved ${title} to ${COLUMNS[to]!.name}.`);
  };

  return (
    <section className="card wide">
      <h1>Q4 roadmap</h1>
      <p className="muted" id="board-help">
        Drag a card by its handle, or focus the handle and press Space to pick it up, the arrow keys to move it, Space to drop and Escape to cancel.
      </p>
      <div className="board">
        {COLUMNS.map((c, ci) => (
          <section key={c.id} className="column" aria-label={c.name}>
            <h2>
              {c.name}{" "}
              <span className="muted">
                {board[c.id].length}
                {c.limit !== undefined ? ` / ${c.limit}` : ""}
              </span>
            </h2>
            <ul
              className="list cards"
              aria-label={`${c.name} cards`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropMouse(ci, null);
              }}
            >
              {board[c.id].map((t) => (
                <li
                  key={t}
                  className={`kcard ${grab?.title === t ? "grabbed" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer?.setData("text/plain", t);
                    setMouseDrag(t);
                  }}
                  onDragEnd={() => setMouseDrag(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropMouse(ci, t);
                  }}
                >
                  <button
                    ref={(el) => {
                      if (el) handles.current.set(t, el);
                      else handles.current.delete(t);
                    }}
                    className="handle"
                    aria-label={`Drag ${t}`}
                    aria-roledescription="draggable card"
                    aria-describedby="board-help"
                    aria-pressed={grab?.title === t}
                    onKeyDown={onHandleKey(t)}
                  >
                    ⠿
                  </button>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p role="status" className="muted">
        {note}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ team drive (tree + context menu) */

type DriveFile = { path: string; starred: boolean };
const FOLDERS = [
  "Clients",
  "Clients/Northwind",
  "Clients/Northwind/2025",
  "Clients/Northwind/2025/Contracts",
  "Clients/Northwind/2026",
  "Clients/Northwind/2026/Contracts",
  "Clients/Northwind/2026/Invoices",
  "Clients/Northwind Traders",
  "Clients/Northwind Traders/2026",
  "Clients/Northwind Traders/2026/Contracts",
  "Internal",
  "Internal/Templates",
];
const INITIAL_FILES: DriveFile[] = [
  "Clients/Northwind/2025/Contracts/MSA-signed.pdf",
  "Clients/Northwind/2025/Contracts/SOW-01.pdf",
  "Clients/Northwind/2025/Contracts/SOW-02.pdf",
  "Clients/Northwind/2026/Contracts/Draft SOW.docx",
  "Clients/Northwind/2026/Contracts/MSA-signed.pdf",
  "Clients/Northwind/2026/Contracts/SOW-03.pdf",
  "Clients/Northwind/2026/Invoices/INV-2026-001.pdf",
  "Clients/Northwind Traders/2026/Contracts/Draft SOW.docx",
  "Clients/Northwind Traders/2026/Contracts/MSA-signed.pdf",
  "Clients/Northwind Traders/2026/Contracts/SOW-03.pdf",
  "Internal/Handbook.pdf",
  "Internal/Templates/SOW template.docx",
].map((path) => ({ path, starred: path === "Clients/Northwind/2025/Contracts/SOW-02.pdf" }));

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const isFolder = (p: string) => FOLDERS.includes(p);

function TeamDrive() {
  const [files, setFiles] = useState<DriveFile[]>(INITIAL_FILES);
  const [trash, setTrash] = useState<DriveFile[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [focused, setFocused] = useState("Clients");
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const focusTree = useRef(false);
  useReport({
    files: files.map((f) => f.path).sort(),
    starred: files.filter((f) => f.starred).map((f) => f.path).sort(),
    trash: trash.map((f) => f.path).sort(),
    deletedForever: [...deleted].sort(),
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (focusTree.current) {
      focusTree.current = false;
      items.current.get(focused)?.focus();
    }
  });
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);
  useEffect(() => {
    const el = renameRef.current;
    if (!renaming || !el) return;
    el.focus();
    const dot = el.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, [renaming]);

  const children = (dir: string) => [
    ...FOLDERS.filter((f) => parentOf(f) === dir),
    ...files
      .filter((f) => parentOf(f.path) === dir)
      .map((f) => f.path)
      .sort((a, b) => baseName(a).localeCompare(baseName(b))),
  ];
  const isOpen = (p: string) => expanded.includes(p) && loaded.includes(p);
  const visible: string[] = [];
  const walk = (dir: string) =>
    children(dir).forEach((p) => {
      visible.push(p);
      if (isFolder(p) && isOpen(p)) walk(p);
    });
  walk("");

  const moveFocus = (p: string) => {
    focusTree.current = true;
    setFocused(p);
  };
  const toggle = (p: string) => {
    if (expanded.includes(p)) return setExpanded((x) => x.filter((y) => y !== p));
    setExpanded((x) => [...x, p]);
    if (!loaded.includes(p)) timers.current.push(setTimeout(() => setLoaded((x) => [...x, p]), 700));
  };
  const openMenu = (p: string, x: number, y: number) => {
    setFocused(p);
    if (!isFolder(p)) setMenu({ path: p, x, y });
  };
  const closeMenu = () => {
    setMenu(null);
    focusTree.current = true;
  };
  const act = (f: () => void) => () => {
    f();
    closeMenu();
  };

  const onTreeKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = visible.indexOf(focused);
    const folder = isFolder(focused);
    const go = (p: string | undefined) => {
      if (p) moveFocus(p);
    };
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      const r = items.current.get(focused)?.getBoundingClientRect();
      openMenu(focused, (r?.left ?? 0) + 40, (r?.top ?? 0) + 24);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      go(visible[i + 1]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(visible[i - 1]);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(visible[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      go(visible.at(-1));
    } else if (e.key === "ArrowRight" && folder) {
      e.preventDefault();
      if (!expanded.includes(focused)) toggle(focused);
      else if (isOpen(focused)) go(children(focused)[0]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (folder && expanded.includes(focused)) toggle(focused);
      else go(parentOf(focused) || undefined);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (folder) toggle(focused);
      else setViewing(focused);
    } else if (e.key === "F2" && !folder) {
      e.preventDefault();
      setRenaming(focused);
    }
  };

  const commitRename = (value: string) => {
    if (!renaming) return;
    const name = value.trim();
    const dir = parentOf(renaming);
    if (!name || name === baseName(renaming)) {
      setRenaming(null);
      setRenameError("");
      return moveFocus(renaming);
    }
    if (name.includes("/")) return setRenameError("A name can't contain “/”.");
    const target = `${dir}/${name}`;
    if (files.some((f) => f.path === target)) return setRenameError(`A file named “${name}” already exists in this folder.`);
    setFiles((fs) => fs.map((f) => (f.path === renaming ? { ...f, path: target } : f)));
    setRenaming(null);
    setRenameError("");
    moveFocus(target);
  };

  const copyOf = (p: string) => {
    let name = `Copy of ${baseName(p)}`;
    while (files.some((f) => f.path === `${parentOf(p)}/${name}`)) name = `Copy of ${name}`;
    setFiles((fs) => [...fs, { path: `${parentOf(p)}/${name}`, starred: false }]);
  };

  // Handlers live on the treeitem itself (so AX press / show-menu work); ignore events that
  // bubbled up from a nested treeitem or from the rename input.
  const ownEvent = (e: MouseEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    return t.closest('[role="treeitem"]') === e.currentTarget && t.tagName !== "INPUT";
  };

  const renderNode = (p: string, level: number) => {
    const folder = isFolder(p);
    const file = files.find((f) => f.path === p);
    const name = baseName(p);
    const open = expanded.includes(p);
    return (
      <li
        key={p}
        ref={(el) => {
          if (el) items.current.set(p, el);
          else items.current.delete(p);
        }}
        role="treeitem"
        aria-level={level}
        aria-expanded={folder ? open : undefined}
        aria-selected={focused === p}
        aria-label={`${name}${file?.starred ? " (starred)" : ""}`}
        tabIndex={focused === p ? 0 : -1}
        className="tnode"
        onFocus={(e) => {
          if (e.target === e.currentTarget) setFocused(p);
        }}
        onClick={(e) => {
          if (!ownEvent(e)) return;
          e.stopPropagation();
          moveFocus(p);
          if (folder) toggle(p);
        }}
        onDoubleClick={(e) => {
          if (!ownEvent(e)) return;
          e.stopPropagation();
          if (!folder) setViewing(p);
        }}
        onContextMenu={(e) => {
          if (!ownEvent(e)) return;
          e.preventDefault();
          e.stopPropagation();
          moveFocus(p);
          openMenu(p, e.clientX, e.clientY);
        }}
      >
        <div className={`trow ${focused === p ? "focused" : ""}`} style={{ paddingLeft: 8 + (level - 1) * 18 }}>
          <span className="twisty" aria-hidden="true">
            {folder ? (open ? "▾" : "▸") : ""}
          </span>
          <span aria-hidden="true">{folder ? "📁" : "📄"}</span>
          {renaming === p ? (
            <input
              ref={renameRef}
              aria-label={`Rename ${name}`}
              defaultValue={name}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename(e.currentTarget.value);
                if (e.key === "Escape") {
                  setRenaming(null);
                  setRenameError("");
                  moveFocus(p);
                }
              }}
              onBlur={(e) => commitRename(e.currentTarget.value)}
            />
          ) : (
            <span>{name}</span>
          )}
          {file?.starred && (
            <span className="staron" aria-hidden="true">
              ★
            </span>
          )}
        </div>
        {folder && open && (
          <ul role="group">
            {!loaded.includes(p) ? (
              <li role="none" className="muted tload" style={{ paddingLeft: 26 + level * 18 }}>
                Loading…
              </li>
            ) : children(p).length === 0 ? (
              <li role="none" className="muted tload" style={{ paddingLeft: 26 + level * 18 }}>
                Empty folder
              </li>
            ) : (
              children(p).map((c) => renderNode(c, level + 1))
            )}
          </ul>
        )}
      </li>
    );
  };

  const mfile = menu && files.find((f) => f.path === menu.path);
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      all[(i + 1) % all.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      all.at(-1)?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      closeMenu();
    }
  };

  return (
    <section className="card">
      <h1>Team drive</h1>
      <p className="muted">Right-click a file (or press Shift+F10) for more actions.</p>
      <ul role="tree" aria-label="Folders" className="tree" onKeyDown={onTreeKey}>
        {children("").map((p) => renderNode(p, 1))}
      </ul>
      {renameError && (
        <p role="alert" className="error">
          {renameError}
        </p>
      )}
      {viewing && <p className="muted">Previewing {viewing}</p>}
      <h2 className="spaced">Trash</h2>
      {trash.length === 0 ? (
        <p className="muted">Trash is empty.</p>
      ) : (
        <ul className="list" aria-label="Trash">
          {trash.map((f) => (
            <li key={f.path} className="row between">
              <span>{f.path}</span>
              <button
                className="small"
                aria-label={`Restore ${f.path}`}
                onClick={() => {
                  setTrash((t) => t.filter((x) => x.path !== f.path));
                  setFiles((fs) => [...fs, f]);
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {menu && mfile && (
        <>
          <div className="ctx-overlay" onMouseDown={closeMenu} onContextMenu={(e) => (e.preventDefault(), closeMenu())} />
          <div ref={menuRef} role="menu" aria-label={`Actions for ${baseName(menu.path)}`} className="ctxmenu" style={{ left: menu.x, top: menu.y }} onKeyDown={onMenuKey}>
            <button role="menuitem" tabIndex={-1} onClick={act(() => setViewing(menu.path))}>
              Open
            </button>
            <button role="menuitem" tabIndex={-1} onClick={act(() => setFiles((fs) => fs.map((f) => (f.path === menu.path ? { ...f, starred: !f.starred } : f))))}>
              {mfile.starred ? "Remove star" : "Add star"}
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setMenu(null);
                setRenaming(menu.path);
              }}
            >
              Rename…
            </button>
            <button role="menuitem" tabIndex={-1} onClick={act(() => copyOf(menu.path))}>
              Make a copy
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={act(() => {
                setFiles((fs) => fs.filter((f) => f.path !== menu.path));
                setTrash((t) => [...t, mfile]);
                moveFocus(parentOf(menu.path));
              })}
            >
              Move to trash
            </button>
            <hr />
            <button
              role="menuitem"
              tabIndex={-1}
              className="danger"
              onClick={act(() => {
                setFiles((fs) => fs.filter((f) => f.path !== menu.path));
                setDeleted((d) => [...d, menu.path]);
                moveFocus(parentOf(menu.path));
              })}
            >
              Delete forever
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ studio booking (listboxes + range) */

type Opt = { value: string; label: string };

function ListboxPicker({ label, value, options, onChange }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-o${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 };
    if (e.key in step) {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(options.length - 1, a + step[e.key]!)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };
  const current = options.find((o) => o.value === value);
  return (
    <div className="field combo">
      <span id={`${id}-l`}>{label}</span>
      <button
        ref={btn}
        id={`${id}-b`}
        className="selectbtn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-l ${id}-b`}
        onClick={() => {
          if (open) return close();
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen(true);
        }}
      >
        {current?.label ?? "Choose…"}
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-l`}
          aria-activedescendant={`${id}-o${active}`}
          className="popup scroll"
          onKeyDown={onKey}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget !== btn.current) setOpen(false);
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`opt ${i === active ? "active" : ""} ${o.value === value ? "chosen" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TODAY = "2026-09-25";
const isoDate = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]!.slice(0, 3)} ${d}, ${y}`;
};
const TIMES: Opt[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const mm = i % 2 ? "30" : "00";
  return { value: `${String(h).padStart(2, "0")}:${mm}`, label: `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}` };
});
const ROOMS: Opt[] = [
  { value: "Studio B Annex", label: "Studio B Annex — floor 1, seats 6" },
  { value: "Studio A", label: "Studio A — floor 2, seats 4" },
  { value: "Studio B", label: "Studio B — floor 3, seats 8" },
  { value: "Studio C", label: "Studio C — floor 3, seats 12" },
];

function RangeDialog({ start, end, onApply, onCancel }: { start: string; end: string; onApply: (s: string, e: string) => void; onCancel: () => void }) {
  const [view, setView] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const [s, setS] = useState<string | null>(start);
  const [e, setE] = useState<string | null>(end);
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // weeks start on Monday
  const shift = (d: number) => setView((v) => ({ y: v.y + Math.floor((v.m + d) / 12), m: (v.m + d + 12) % 12 }));
  const pick = (d: string) => {
    if (!s || e || d < s) {
      setS(d);
      setE(null);
    } else setE(d);
  };
  return (
    <div role="dialog" aria-label="Choose dates" className="calendar">
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
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d} className="muted">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = isoDate(view.y, view.m, i + 1);
          const wd = new Date(view.y, view.m, i + 1).getDay();
          const closed = wd === 0 || wd === 6;
          const inRange = s !== null && e !== null && d >= s && d <= e;
          return (
            <button
              key={d}
              aria-label={`${WEEKDAYS[wd]}, ${MONTHS[view.m]} ${i + 1}, ${view.y}${closed ? " (closed)" : ""}`}
              aria-pressed={d === s || d === e}
              disabled={d < TODAY || closed}
              className={`day ${d === s || d === e ? "chosen" : inRange ? "inrange" : ""}`}
              onClick={() => pick(d)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="muted">
        Start: {s ? shortDate(s) : "—"} · End: {e ? shortDate(e) : "—"}
      </p>
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!s || !e} onClick={() => s && e && onApply(s, e)}>
          Apply
        </button>
      </div>
    </div>
  );
}

function StudioBooking() {
  const [room, setRoom] = useState("Studio B Annex");
  const [dates, setDates] = useState({ start: "2026-09-28", end: "2026-09-30" });
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState<Array<{ room: string; start: string; end: string; from: string; to: string }>>([]);
  useReport({ room, dates, from, to, bookings });
  const book = () => {
    if (to <= from) return setError("End time must be after start time.");
    setError("");
    setBookings((b) => [...b, { room, start: dates.start, end: dates.end, from, to }]);
  };
  return (
    <section className="card narrow">
      <h1>Book a studio</h1>
      <p className="muted">Studios are closed on weekends. Times are local studio time.</p>
      <ListboxPicker label="Room" value={room} options={ROOMS} onChange={setRoom} />
      <div className="field">
        <span id="dates-l">Dates</span>
        <button id="dates-b" className="datefield" aria-haspopup="dialog" aria-expanded={picking} aria-labelledby="dates-l dates-b" onClick={() => setPicking((p) => !p)}>
          {shortDate(dates.start)} – {shortDate(dates.end)}
        </button>
      </div>
      {picking && (
        <RangeDialog
          start={dates.start}
          end={dates.end}
          onCancel={() => setPicking(false)}
          onApply={(start, end) => {
            setDates({ start, end });
            setPicking(false);
          }}
        />
      )}
      <div className="row">
        <ListboxPicker label="Start time" value={from} options={TIMES} onChange={setFrom} />
        <ListboxPicker label="End time" value={to} options={TIMES} onChange={setTo} />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        {bookings.length > 0 && (
          <span role="status" className="muted">
            Booked {bookings.at(-1)!.room}.
          </span>
        )}
        <button className="primary" onClick={book}>
          Book studio
        </button>
      </div>
    </section>
  );
}

export const TASKS: Record<string, TaskPage> = {
  "pr-reviewers": { title: "Pull request #482", component: PullRequestReviewers },
  "roadmap-board": { title: "Q4 roadmap", component: RoadmapBoard },
  "contract-files": { title: "Team drive", component: TeamDrive },
  "studio-booking": { title: "Studio booking", component: StudioBooking },
};
