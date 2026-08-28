import { useEffect, useRef, useState } from "react";

const scenarios = [
  {
    id: "happy-path",
    title: "Happy path",
    description: "Three contract-valid events reach the built-in receiver on their first attempt.",
  },
  {
    id: "retry-then-success",
    title: "Retry then succeed",
    description: "The receiver returns 503 twice, then accepts the third attempt.",
  },
  {
    id: "duplicate-delivery",
    title: "Duplicate delivery",
    description: "The same source and event ID are published twice; the projection changes once.",
  },
  {
    id: "invalid-schema",
    title: "Invalid schema",
    description: "A missing required field is rejected before the event reaches EventBridge.",
  },
  {
    id: "permanent-failure",
    title: "Permanent failure",
    description: "Delivery exhausts its retries and records a terminal failure before the DLQ.",
  },
] as const;

type ScenarioId = (typeof scenarios)[number]["id"];

interface ScenarioResponse {
  readonly accepted: boolean;
  readonly runId: string;
  readonly scenario: ScenarioId;
  readonly eventIds: readonly string[];
  readonly issues?: readonly { path: string; message: string }[];
}

interface RunResponse {
  readonly runId: string;
  readonly scenario: string;
  readonly status: string;
  readonly expectedEvents: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly deliveries: readonly Record<string, unknown>[];
  readonly attempts: readonly Record<string, unknown>[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T;
  if (!response.ok && response.status !== 422) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return body;
}

export function App() {
  const [selected, setSelected] = useState<ScenarioId>("happy-path");
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse>();
  const [run, setRun] = useState<RunResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const polling = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(polling.current), []);

  async function pollRun(runId: string) {
    const next = await requestJson<RunResponse>(`/api/v1/runs/${runId}`);
    setRun(next);
    if (next.status === "delivered" || next.status === "failed") {
      window.clearInterval(polling.current);
      setBusy(false);
    }
  }

  async function execute() {
    window.clearInterval(polling.current);
    setBusy(true);
    setError(undefined);
    setRun(undefined);
    try {
      const result = await requestJson<ScenarioResponse>(`/api/v1/scenarios/${selected}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setScenarioResult(result);
      if (!result.accepted) {
        setBusy(false);
        return;
      }
      await pollRun(result.runId);
      polling.current = window.setInterval(() => {
        void pollRun(result.runId).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : String(reason));
          setBusy(false);
          window.clearInterval(polling.current);
        });
      }, 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">EVENT CONTRACT AND DELIVERY LAB</p>
        <h1>RelayBench</h1>
        <p className="lede">
          Run a bounded scenario through JSON Schema validation, EventBridge routing, SQS retry
          semantics, and an idempotent DynamoDB projection.
        </p>
      </header>

      <section className="workspace" aria-labelledby="scenario-heading">
        <div>
          <p className="step">01 / CHOOSE A SCENARIO</p>
          <h2 id="scenario-heading">Make the failure mode visible.</h2>
          <div className="scenario-list">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={scenario.id === selected ? "scenario selected" : "scenario"}
                onClick={() => setSelected(scenario.id)}
              >
                <span>{scenario.title}</span>
                <small>{scenario.description}</small>
              </button>
            ))}
          </div>
          <button className="run" type="button" disabled={busy} onClick={() => void execute()}>
            {busy ? "Processing" : "Run scenario"}
          </button>
        </div>

        <div className="output" aria-live="polite">
          <p className="step">02 / OBSERVE THE RESULT</p>
          {error ? <p className="error">{error}</p> : null}
          {!scenarioResult ? (
            <p className="placeholder">The accepted event, attempts, and final projection appear here.</p>
          ) : (
            <>
              <div className="status-row">
                <span>Scenario</span>
                <strong>{scenarioResult.scenario}</strong>
              </div>
              <div className="status-row">
                <span>Validation</span>
                <strong>{scenarioResult.accepted ? "accepted" : "rejected"}</strong>
              </div>
              {run ? (
                <>
                  <div className="status-row">
                    <span>Delivery</span>
                    <strong>{run.status}</strong>
                  </div>
                  <div className="metrics">
                    <div><span>Expected</span><strong>{run.expectedEvents}</strong></div>
                    <div><span>Delivered</span><strong>{run.deliveredCount}</strong></div>
                    <div><span>Attempts</span><strong>{run.attempts.length}</strong></div>
                  </div>
                </>
              ) : null}
              <pre>{JSON.stringify(run ?? scenarioResult, null, 2)}</pre>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
