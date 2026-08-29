import { useEffect, useRef, useState } from "react";
import type { RunDiagnosis } from "../../../packages/contracts/diagnosis.js";

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
  readonly diagnosis?: RunDiagnosis;
}

interface DiagnosisResponse extends RunDiagnosis {
  readonly cached: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T;
  if (!response.ok && response.status !== 422) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export function App() {
  const embedded = new URLSearchParams(window.location.search).get("embed") === "1";
  const [selected, setSelected] = useState<ScenarioId>("happy-path");
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse>();
  const [run, setRun] = useState<RunResponse>();
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse>();
  const [busy, setBusy] = useState(false);
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [diagnosisError, setDiagnosisError] = useState<string>();
  const polling = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(polling.current), []);

  async function pollRun(runId: string) {
    const next = await requestJson<RunResponse>(`/api/v1/runs/${runId}`);
    setRun(next);
    if (next.diagnosis) {
      setDiagnosis({ ...next.diagnosis, cached: true });
    }
    if (next.status === "delivered" || next.status === "failed" || next.status === "rejected") {
      window.clearInterval(polling.current);
      setBusy(false);
    }
  }

  async function execute() {
    window.clearInterval(polling.current);
    setBusy(true);
    setError(undefined);
    setDiagnosisError(undefined);
    setRun(undefined);
    setDiagnosis(undefined);
    try {
      const result = await requestJson<ScenarioResponse>(`/api/v1/scenarios/${selected}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setScenarioResult(result);
      if (!result.accepted) {
        await pollRun(result.runId);
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

  async function investigate() {
    if (!run) {
      return;
    }
    setDiagnosisBusy(true);
    setDiagnosisError(undefined);
    try {
      const result = await requestJson<DiagnosisResponse>(
        `/api/v1/runs/${run.runId}/diagnosis`,
        { method: "POST" },
      );
      setDiagnosis(result);
    } catch (reason) {
      setDiagnosisError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDiagnosisBusy(false);
    }
  }

  return (
    <main className={embedded ? "embedded" : undefined}>
      <header className="hero">
        <p className="eyebrow">EVENT CONTRACT AND DELIVERY LAB</p>
        <h1>RelayBench</h1>
        <p className="lede">
          Run a bounded scenario through JSON Schema validation, EventBridge routing, SQS retry
          semantics, and an idempotent DynamoDB projection—then ask a grounded AI investigator to
          explain the evidence.
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

      <section className="analysis" aria-labelledby="analysis-heading">
        <div className="analysis-intro">
          <p className="step">03 / AI INVESTIGATION</p>
          <h2 id="analysis-heading">Turn delivery evidence into a diagnosis.</h2>
          <p>
            The model receives only server-generated facts. Its JSON response is schema-checked,
            its citations are matched against supplied evidence IDs, and its diagnosis is scored
            against the scenario&apos;s known outcome.
          </p>
          <button
            className="ai-run"
            type="button"
            disabled={!run || run.status === "processing" || diagnosisBusy}
            onClick={() => void investigate()}
          >
            {diagnosisBusy ? "Investigating" : diagnosis ? "Load cached diagnosis" : "Run AI investigation"}
          </button>
          {!run ? <p className="analysis-hint">Run a scenario first.</p> : null}
          {run?.status === "processing" ? (
            <p className="analysis-hint">The investigation unlocks when delivery is terminal.</p>
          ) : null}
        </div>

        <div className="ai-panel" aria-live="polite">
          {diagnosisError ? <p className="error">{diagnosisError}</p> : null}
          {!diagnosis ? (
            <p className="placeholder">
              Diagnosis, grounded citations, evaluation, and model telemetry appear here.
            </p>
          ) : (
            <>
              <div className="diagnosis-header">
                <div>
                  <p className="diagnosis-code">{diagnosis.diagnosisCode}</p>
                  <h3>{diagnosis.headline}</h3>
                </div>
                <span className="confidence">{diagnosis.confidence} confidence</span>
              </div>
              <p className="diagnosis-summary">{diagnosis.summary}</p>

              <div className="evaluation">
                <span>Golden-case evaluation</span>
                <strong>
                  {diagnosis.evaluation.matchesExpectedDiagnosis ? "matched" : "did not match"}
                </strong>
              </div>

              <div className="evidence-list">
                <p className="step">CITED EVIDENCE</p>
                {diagnosis.evidence.map((item) => (
                  <div className="evidence" key={item.id}>
                    <span>{item.id}</span>
                    <p>{item.observation}</p>
                  </div>
                ))}
              </div>

              <div className="action">
                <span>Recommended action</span>
                <p>{diagnosis.recommendedAction}</p>
              </div>

              <div className="ai-metrics">
                <div><span>Input</span><strong>{diagnosis.model.inputTokens}</strong><small>tokens</small></div>
                <div><span>Output</span><strong>{diagnosis.model.outputTokens}</strong><small>tokens</small></div>
                <div><span>Latency</span><strong>{diagnosis.model.latencyMs}</strong><small>ms</small></div>
                <div><span>Source</span><strong>{diagnosis.cached ? "cache" : "live"}</strong><small>response</small></div>
              </div>
              <p className="model-id">
                {diagnosis.model.id} · {diagnosis.model.promptVersion}
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
