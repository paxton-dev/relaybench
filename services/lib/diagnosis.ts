import {
  confidenceLevels,
  diagnosisCodes,
  type ConfidenceLevel,
  type DiagnosisCode,
  type DiagnosisEvidence,
} from "../../packages/contracts/diagnosis.js";

export interface ModelDiagnosis {
  readonly diagnosisCode: DiagnosisCode;
  readonly headline: string;
  readonly summary: string;
  readonly confidence: ConfidenceLevel;
  readonly recommendedAction: string;
  readonly evidenceIds: readonly string[];
}

export class InvalidModelDiagnosisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelDiagnosisError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  record: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new InvalidModelDiagnosisError(
      `${key} must be a non-empty string no longer than ${maximumLength} characters`,
    );
  }
  return value;
}

function jsonObjectFrom(text: string): unknown {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new InvalidModelDiagnosisError("Model response did not contain a JSON object");
  }
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;
  } catch (error) {
    throw new InvalidModelDiagnosisError(
      error instanceof Error ? `Model response was not valid JSON: ${error.message}` : "Model response was not valid JSON",
    );
  }
}

export function parseModelDiagnosis(
  text: string,
  availableEvidence: readonly DiagnosisEvidence[],
): ModelDiagnosis {
  const parsed = jsonObjectFrom(text);
  if (!isRecord(parsed)) {
    throw new InvalidModelDiagnosisError("Model response must be a JSON object");
  }
  const allowedKeys = new Set([
    "diagnosisCode",
    "headline",
    "summary",
    "confidence",
    "recommendedAction",
    "evidenceIds",
  ]);
  const unexpectedKeys = Object.keys(parsed).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new InvalidModelDiagnosisError(
      `Model response contained unexpected fields: ${unexpectedKeys.join(", ")}`,
    );
  }

  const diagnosisCode = parsed.diagnosisCode;
  if (
    typeof diagnosisCode !== "string" ||
    !(diagnosisCodes as readonly string[]).includes(diagnosisCode)
  ) {
    throw new InvalidModelDiagnosisError("diagnosisCode was not recognized");
  }

  const confidence = parsed.confidence;
  if (
    typeof confidence !== "string" ||
    !(confidenceLevels as readonly string[]).includes(confidence)
  ) {
    throw new InvalidModelDiagnosisError("confidence was not recognized");
  }

  const evidenceIds = parsed.evidenceIds;
  if (!Array.isArray(evidenceIds) || evidenceIds.length < 1 || evidenceIds.length > 4) {
    throw new InvalidModelDiagnosisError("evidenceIds must contain between one and four IDs");
  }
  const allowedIds = new Set(availableEvidence.map((evidence) => evidence.id));
  const normalizedEvidenceIds = evidenceIds.map((id) => {
    if (typeof id !== "string" || !allowedIds.has(id)) {
      throw new InvalidModelDiagnosisError(`Evidence ID ${String(id)} was not provided to the model`);
    }
    return id;
  });
  if (new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length) {
    throw new InvalidModelDiagnosisError("evidenceIds must not contain duplicates");
  }

  return {
    diagnosisCode: diagnosisCode as DiagnosisCode,
    headline: boundedString(parsed, "headline", 100),
    summary: boundedString(parsed, "summary", 500),
    confidence: confidence as ConfidenceLevel,
    recommendedAction: boundedString(parsed, "recommendedAction", 300),
    evidenceIds: normalizedEvidenceIds,
  };
}
