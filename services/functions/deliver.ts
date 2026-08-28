import type { SQSBatchResponse, SQSHandler, SQSRecord } from "aws-lambda";
import type { RelayBenchCloudEvent } from "../../packages/contracts/types.js";
import { validateCloudEvent } from "../../packages/contracts/validator.js";
import { logger } from "../lib/logger.js";
import { deliveryStore, type DeliveryStore } from "../lib/store.js";

interface EventBridgeEnvelope {
  readonly detail?: unknown;
}

function receiveCount(record: SQSRecord): number {
  const value = Number(record.attributes.ApproximateReceiveCount ?? "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function parseEvent(record: SQSRecord): RelayBenchCloudEvent {
  const envelope = JSON.parse(record.body) as EventBridgeEnvelope;
  const validation = validateCloudEvent(envelope.detail);
  if (!validation.valid) {
    throw new Error(
      `Queue event failed validation: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
  }
  return envelope.detail as RelayBenchCloudEvent;
}

export async function processRecord(record: SQSRecord, store: DeliveryStore): Promise<void> {
  const event = parseEvent(record);
  const attempt = receiveCount(record);
  const occurredAt = new Date().toISOString();
  const shouldRetry = event.relaybenchbehavior === "retry-twice" && attempt < 3;
  const shouldFail = event.relaybenchbehavior === "always-fail";

  if (shouldRetry || shouldFail) {
    const finalFailure = shouldFail && attempt >= 3;
    await store.recordAttempt({
      runId: event.relaybenchrunid,
      eventId: event.id,
      messageId: record.messageId,
      attempt,
      status: finalFailure ? "failed" : "retrying",
      responseStatus: 503,
      occurredAt,
    });

    if (finalFailure) {
      await store.completeDelivery({
        event,
        runId: event.relaybenchrunid,
        eventId: event.id,
        messageId: record.messageId,
        attempt,
        status: "failed",
        responseStatus: 503,
        occurredAt,
      });
    }
    throw new Error(`Built-in receiver returned 503 on attempt ${attempt}`);
  }

  await store.recordAttempt({
    runId: event.relaybenchrunid,
    eventId: event.id,
    messageId: record.messageId,
    attempt,
    status: "delivered",
    responseStatus: 204,
    occurredAt,
  });
  const result = await store.completeDelivery({
    event,
    runId: event.relaybenchrunid,
    eventId: event.id,
    messageId: record.messageId,
    attempt,
    status: "delivered",
    responseStatus: 204,
    occurredAt,
  });
  logger.info(result.duplicate ? "Duplicate delivery suppressed" : "Webhook delivered", {
    eventId: event.id,
    runId: event.relaybenchrunid,
    attempt,
  });
}

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  const results = await Promise.allSettled(
    event.Records.map((record) => processRecord(record, deliveryStore)),
  );
  const batchItemFailures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [];
    }
    const record = event.Records[index];
    if (!record) {
      return [];
    }
    logger.warn("Webhook delivery will be retried", {
      messageId: record.messageId,
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return [{ itemIdentifier: record.messageId }];
  });
  return { batchItemFailures };
};
