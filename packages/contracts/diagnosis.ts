import type { ScenarioName } from "./types.js";

export const diagnosisCodes = [
  "healthy-delivery",
  "transient-failure-recovered",
  "duplicate-suppressed",
  "schema-rejected",
  "terminal-delivery-failure",
  "inconclusive",
] as const;

export type DiagnosisCode = (typeof diagnosisCodes)[number];

export const confidenceLevels = ["low", "medium", "high"] as const;

export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const expectedDiagnosisByScenario: Readonly<Record<ScenarioName, DiagnosisCode>> = {
  "happy-path": "healthy-delivery",
  "retry-then-success": "transient-failure-recovered",
  "duplicate-delivery": "duplicate-suppressed",
  "invalid-schema": "schema-rejected",
  "permanent-failure": "terminal-delivery-failure",
};

export interface DiagnosisEvidence {
  readonly id: string;
  readonly category: "run" | "validation" | "attempt" | "delivery";
  readonly observation: string;
}

export interface DiagnosisEvaluation {
  readonly expectedDiagnosisCode: DiagnosisCode;
  readonly matchesExpectedDiagnosis: boolean;
}

export interface DiagnosisModelMetadata {
  readonly id: string;
  readonly promptVersion: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
}

export interface RunDiagnosis {
  readonly schemaVersion: "1";
  readonly runId: string;
  readonly diagnosisCode: DiagnosisCode;
  readonly headline: string;
  readonly summary: string;
  readonly confidence: ConfidenceLevel;
  readonly recommendedAction: string;
  readonly evidence: readonly DiagnosisEvidence[];
  readonly evaluation: DiagnosisEvaluation;
  readonly model: DiagnosisModelMetadata;
  readonly createdAt: string;
}
