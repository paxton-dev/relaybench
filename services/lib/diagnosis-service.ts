import {
  expectedDiagnosisByScenario,
  type DiagnosisEvidence,
  type DiagnosisModelMetadata,
  type RunDiagnosis,
} from "../../packages/contracts/diagnosis.js";
import { scenarioNames, type ScenarioName } from "../../packages/contracts/types.js";
import type { ModelDiagnosis } from "./diagnosis.js";
import { deriveRun, isTerminalRun, type RunView } from "./run-view.js";
import type { DiagnosisStore } from "./store.js";

export interface DiagnosisGeneration {
  readonly diagnosis: ModelDiagnosis;
  readonly model: DiagnosisModelMetadata;
}

export interface DiagnosisGenerator {
  generate(evidence: readonly DiagnosisEvidence[]): Promise<DiagnosisGeneration>;
}

export interface DiagnosisResult {
  readonly diagnosis: RunDiagnosis;
  readonly cached: boolean;
}

export class RunNotFoundError extends Error {
  constructor() {
    super("Run not found");
    this.name = "RunNotFoundError";
  }
}

export class RunNotReadyError extends Error {
  constructor() {
    super("Run is still processing");
    this.name = "RunNotReadyError";
  }
}

function scenarioName(value: string): ScenarioName {
  if (!(scenarioNames as readonly string[]).includes(value)) {
    throw new Error(`Run contains an unsupported scenario: ${value}`);
  }
  return value as ScenarioName;
}

function value(record: Record<string, unknown>, key: string): string {
  const field = record[key];
  return typeof field === "string" || typeof field === "number"
    ? String(field)
    : "unknown";
}

export function buildDiagnosisEvidence(run: RunView): readonly DiagnosisEvidence[] {
  const evidence: DiagnosisEvidence[] = [
    {
      id: "R1",
      category: "run",
      observation: `Validation ${String(run.validationStatus ?? "accepted")}; expected ${run.expectedEvents} unique deliveries; observed ${run.deliveredCount} delivered and ${run.failedCount} failed; terminal status ${run.status}.`,
    },
  ];

  const validationIssues = Array.isArray(run.validationIssues) ? run.validationIssues : [];
  validationIssues.slice(0, 4).forEach((issue, index) => {
    const record = typeof issue === "object" && issue !== null ? issue as Record<string, unknown> : {};
    evidence.push({
      id: `V${index + 1}`,
      category: "validation",
      observation: `Contract validation issue at ${value(record, "path")}: ${value(record, "message")}.`,
    });
  });

  run.attempts.slice(0, 16).forEach((attempt, index) => {
    evidence.push({
      id: `A${index + 1}`,
      category: "attempt",
      observation: `Event ${value(attempt, "eventId")} attempt ${value(attempt, "attempt")} returned HTTP ${value(attempt, "responseStatus")} with status ${value(attempt, "status")}.`,
    });
  });

  run.deliveries.slice(0, 8).forEach((delivery, index) => {
    evidence.push({
      id: `D${index + 1}`,
      category: "delivery",
      observation: `Event ${value(delivery, "eventId")} reached terminal delivery status ${value(delivery, "status")} after ${value(delivery, "attempts")} attempt(s).`,
    });
  });

  return evidence;
}

function storedDiagnosis(
  items: readonly Record<string, unknown>[],
): RunDiagnosis | undefined {
  const item = items.find((candidate) => candidate.kind === "diagnosis");
  return item?.schemaVersion === "1" ? item as unknown as RunDiagnosis : undefined;
}

export async function diagnoseRun(
  runId: string,
  monthlyLimit: number,
  store: DiagnosisStore,
  generator: DiagnosisGenerator,
): Promise<DiagnosisResult> {
  const items = await store.getRun(runId);
  const existing = storedDiagnosis(items);
  if (existing) {
    return { diagnosis: existing, cached: true };
  }

  const run = deriveRun(items);
  if (!run) {
    throw new RunNotFoundError();
  }
  if (!isTerminalRun(run)) {
    throw new RunNotReadyError();
  }

  await store.claimDiagnosisAllowance(monthlyLimit);
  const evidence = buildDiagnosisEvidence(run);
  const generated = await generator.generate(evidence);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const selectedEvidence = generated.diagnosis.evidenceIds.map((id) => {
    const item = evidenceById.get(id);
    if (!item) {
      throw new Error(`Validated evidence ID ${id} is unavailable`);
    }
    return item;
  });
  const expectedDiagnosisCode = expectedDiagnosisByScenario[scenarioName(run.scenario)];
  const diagnosis: RunDiagnosis = {
    schemaVersion: "1",
    runId,
    diagnosisCode: generated.diagnosis.diagnosisCode,
    headline: generated.diagnosis.headline,
    summary: generated.diagnosis.summary,
    confidence: generated.diagnosis.confidence,
    recommendedAction: generated.diagnosis.recommendedAction,
    evidence: selectedEvidence,
    evaluation: {
      expectedDiagnosisCode,
      matchesExpectedDiagnosis:
        generated.diagnosis.diagnosisCode === expectedDiagnosisCode,
    },
    model: generated.model,
    createdAt: new Date().toISOString(),
  };

  await store.saveDiagnosis(diagnosis);
  return { diagnosis, cached: false };
}
