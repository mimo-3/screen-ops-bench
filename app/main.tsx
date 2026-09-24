import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { followControl, TASK } from "./report.ts";
import { TASKS } from "./tasks/index.ts";
import "./styles.css";

function Idle() {
  return (
    <main className="idle">
      <p>Waiting for the next task…</p>
    </main>
  );
}

function App() {
  const entry = TASKS[TASK];
  if (!entry) return <Idle />;
  document.title = entry.title;
  const Task = entry.component;
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Acme Workspace</span>
        <span className="crumb">{entry.title}</span>
      </header>
      <main className="page">
        <Task />
      </main>
    </div>
  );
}

followControl();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
