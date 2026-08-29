import type { RunDiagnosis } from "../../packages/contracts/diagnosis.js";

export type RunStatus = "processing" | "delivered" | "failed" | "rejected";

export interface RunView extends Record<string, unknown> {
  readonly runId: string;
  readonly scenario: string;
  readonly status: RunStatus;
  readonly expectedEvents: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly deliveries: readonly Record<string, unknown>[];
  readonly attempts: readonly Record<string, unknown>[];
  readonly diagnosis?: RunDiagnosis;
}

export function diagnosisFromItem(
  item: Record<string, unknown> | undefined,
): RunDiagnosis | undefined {
  if (item?.kind !== "diagnosis" || item.schemaVersion !== "1") {
    return undefined;
  }
  const {
    pk: _pk,
    sk: _sk,
    kind: _kind,
    expiresAt: _expiresAt,
    ...diagnosis
  } = item;
  return diagnosis as unknown as RunDiagnosis;
}

export function deriveRun(
  items: readonly Record<string, unknown>[],
): RunView | undefined {
  const meta = items.find((item) => item.kind === "run");
  if (!meta || typeof meta.runId !== "string" || typeof meta.scenario !== "string") {
    return undefined;
  }

  const expected = Number(meta.expectedEvents ?? 0);
  const delivered = Number(meta.deliveredCount ?? 0);
  const failed = Number(meta.failedCount ?? 0);
  const terminalEvents = delivered + failed;
  let status: RunStatus = "processing";
  if (meta.validationStatus === "rejected") {
    status = "rejected";
  } else if (terminalEvents >= expected) {
    status = failed > 0 ? "failed" : "delivered";
  }
  const diagnosis = diagnosisFromItem(items.find((item) => item.kind === "diagnosis"));

  return {
    ...meta,
    runId: meta.runId,
    scenario: meta.scenario,
    expectedEvents: expected,
    deliveredCount: delivered,
    failedCount: failed,
    status,
    deliveries: items.filter((item) => item.kind === "delivery"),
    attempts: items.filter((item) => item.kind === "attempt"),
    diagnosis,
  };
}

export function isTerminalRun(run: RunView): boolean {
  return run.status !== "processing";
}
