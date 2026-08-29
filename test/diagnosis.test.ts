import { describe, expect, it, vi } from "vitest";
import type { RunDiagnosis } from "../packages/contracts/diagnosis.js";
import { parseModelDiagnosis } from "../services/lib/diagnosis.js";
import {
  buildDiagnosisEvidence,
  diagnoseRun,
  RunNotReadyError,
  type DiagnosisGenerator,
} from "../services/lib/diagnosis-service.js";
import { deriveRun } from "../services/lib/run-view.js";
import type { DiagnosisStore } from "../services/lib/store.js";

const terminalRunItems: readonly Record<string, unknown>[] = [
  {
    pk: "RUN#00000000-0000-4000-8000-000000000100",
    sk: "META",
    kind: "run",
    runId: "00000000-0000-4000-8000-000000000100",
    scenario: "retry-then-success",
    expectedEvents: 1,
    deliveredCount: 1,
    failedCount: 0,
    validationStatus: "accepted",
  },
  {
    kind: "attempt",
    eventId: "event-1",
    attempt: 1,
    responseStatus: 503,
    status: "retrying",
  },
  {
    kind: "attempt",
    eventId: "event-1",
    attempt: 2,
    responseStatus: 503,
    status: "retrying",
  },
  {
    kind: "attempt",
    eventId: "event-1",
    attempt: 3,
    responseStatus: 204,
    status: "delivered",
  },
  {
    kind: "delivery",
    eventId: "event-1",
    status: "delivered",
    attempts: 3,
  },
];

function dependencies(items = terminalRunItems) {
  const store: DiagnosisStore = {
    getRun: vi.fn().mockResolvedValue(items),
    claimDiagnosisAllowance: vi.fn().mockResolvedValue(undefined),
    saveDiagnosis: vi.fn().mockResolvedValue(undefined),
  };
  const generator: DiagnosisGenerator = {
    promptVersion: "incident-triage-v1",
    generate: vi.fn().mockResolvedValue({
      diagnosis: {
        diagnosisCode: "transient-failure-recovered",
        headline: "Delivery recovered after transient failures",
        summary: "Two retryable responses were followed by a successful delivery.",
        confidence: "high",
        recommendedAction: "Monitor the receiver and keep the current retry policy.",
        evidenceIds: ["A1", "A3", "D1"],
      },
      model: {
        id: "amazon.nova-micro-v1:0",
        promptVersion: "incident-triage-v1",
        inputTokens: 200,
        outputTokens: 80,
        latencyMs: 150,
      },
    }),
  };
  return { store, generator };
}

describe("AI diagnosis", () => {
  it("validates model JSON and rejects evidence that was not supplied", () => {
    const run = deriveRun(terminalRunItems);
    if (!run) {
      throw new Error("Expected a run");
    }
    const evidence = buildDiagnosisEvidence(run);
    const modelText = JSON.stringify({
      diagnosisCode: "transient-failure-recovered",
      headline: "Recovered",
      summary: "The delivery recovered.",
      confidence: "high",
      recommendedAction: "Monitor retries.",
      evidenceIds: ["NOT-PROVIDED"],
    });

    expect(() => parseModelDiagnosis(modelText, evidence)).toThrow(
      "Evidence ID NOT-PROVIDED was not provided to the model",
    );
  });

  it("generates, evaluates, and stores a grounded diagnosis", async () => {
    const { store, generator } = dependencies();

    const result = await diagnoseRun(
      "00000000-0000-4000-8000-000000000100",
      200,
      store,
      generator,
    );

    expect(result.cached).toBe(false);
    expect(result.diagnosis.evaluation).toEqual({
      expectedDiagnosisCode: "transient-failure-recovered",
      matchesExpectedDiagnosis: true,
    });
    expect(result.diagnosis.evidence.map((item) => item.id)).toEqual(["A1", "A3", "D1"]);
    expect(store.claimDiagnosisAllowance).toHaveBeenCalledWith(200);
    expect(store.saveDiagnosis).toHaveBeenCalledWith(result.diagnosis);
  });

  it("returns a stored diagnosis without consuming the monthly allowance", async () => {
    const cached: RunDiagnosis = {
      schemaVersion: "1",
      runId: "00000000-0000-4000-8000-000000000100",
      diagnosisCode: "transient-failure-recovered",
      headline: "Cached",
      summary: "Cached diagnosis",
      confidence: "high",
      recommendedAction: "No action.",
      evidence: [],
      evaluation: {
        expectedDiagnosisCode: "transient-failure-recovered",
        matchesExpectedDiagnosis: true,
      },
      model: {
        id: "amazon.nova-micro-v1:0",
        promptVersion: "incident-triage-v1",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
      },
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const { store, generator } = dependencies([
      ...terminalRunItems,
      { kind: "diagnosis", ...cached },
    ]);

    const result = await diagnoseRun(cached.runId, 200, store, generator);

    expect(result).toEqual({ diagnosis: cached, cached: true });
    expect(store.claimDiagnosisAllowance).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("does not diagnose a run before delivery reaches a terminal state", async () => {
    const { store, generator } = dependencies([
      {
        kind: "run",
        runId: "00000000-0000-4000-8000-000000000101",
        scenario: "happy-path",
        expectedEvents: 3,
        deliveredCount: 1,
        failedCount: 0,
        validationStatus: "accepted",
      },
    ]);

    await expect(
      diagnoseRun("00000000-0000-4000-8000-000000000101", 200, store, generator),
    ).rejects.toBeInstanceOf(RunNotReadyError);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("keeps a partially failed multi-event run in processing", () => {
    const run = deriveRun([
      {
        kind: "run",
        runId: "00000000-0000-4000-8000-000000000102",
        scenario: "permanent-failure",
        expectedEvents: 3,
        deliveredCount: 0,
        failedCount: 1,
        validationStatus: "accepted",
      },
    ]);

    expect(run?.status).toBe("processing");
  });
});
