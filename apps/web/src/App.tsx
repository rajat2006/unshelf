import { useEffect, useState } from "react";
import type { HealthResponse } from "@unshelf/shared";

/**
 * The walking skeleton's one screen: fetch `/api/health` (web → api → Postgres →
 * back) and render what came out the far end, using the same `HealthResponse`
 * type the API produces — proving there is no client/server drift.
 */
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Unshelf</h1>
      {error && <p>Failed to reach the API: {error}</p>}
      {!health && !error && <p>Checking the stack…</p>}
      {health && (
        <ul>
          <li>API status: {health.status}</li>
          <li>Database: {health.db}</li>
          <li>Message: {health.message}</li>
          <li>Server time: {health.time}</li>
        </ul>
      )}
    </main>
  );
}
