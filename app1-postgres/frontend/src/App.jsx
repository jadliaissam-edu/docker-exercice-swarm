import { useEffect, useState } from 'react';

const APP_TITLE = 'App 1 — PostgreSQL stack';
const DB_LABEL = 'Database (PostgreSQL)';
const REFRESH_MS = 3000;

function Indicator({ label, up, detail }) {
  return (
    <li className={`indicator ${up ? 'up' : 'down'}`}>
      <span className="dot" />
      <span className="label">{label}</span>
      <span className="state">{up ? 'connected' : 'disconnected'}</span>
      {detail && <small className="detail">{detail}</small>}
    </li>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [backendUp, setBackendUp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/status', { signal: AbortSignal.timeout(2500) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setStatus(data);
          setBackendUp(true);
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setBackendUp(false);
        }
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="card">
      <h1>Hello, students! 👋</h1>
      <p className="subtitle">
        Welcome to <strong>{APP_TITLE}</strong>, running on Docker Swarm.
      </p>

      <ul className="indicators">
        <Indicator label="Backend (Node.js)" up={backendUp} />
        <Indicator label={DB_LABEL} up={status?.db === 'up'} detail={status?.dbError} />
        <Indicator label="Cache (Redis)" up={status?.redis === 'up'} detail={status?.redisError} />
      </ul>

      <dl className="meta">
        <dt>Served by backend replica</dt>
        <dd>{status?.hostname ?? '—'}</dd>
        <dt>Visits (stored in Redis)</dt>
        <dd>{status?.visits ?? '—'}</dd>
      </dl>

      <p className="hint">Auto-refresh every {REFRESH_MS / 1000}s — watch the replica name change.</p>
    </main>
  );
}
