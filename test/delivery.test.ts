import type { SQSRecord } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createScenario } from "../packages/contracts/scenarios.js";
import { processRecord } from "../services/functions/deliver.js";
import type { DeliveryStore } from "../services/lib/store.js";

function recordFor(
  event: ReturnType<typeof createScenario>["events"][number],
  receiveCount = 1,
): SQSRecord {
  return {
    messageId: `message-${event.id}`,
    receiptHandle: "receipt",
    body: JSON.stringify({ detail: event }),
    attributes: {
      ApproximateReceiveCount: String(receiveCount),
      SentTimestamp: "0",
      SenderId: "sender",
      ApproximateFirstReceiveTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "checksum",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:relaybench-test",
    awsRegion: "us-east-1",
  };
}

function store(duplicate = false): DeliveryStore {
  return {
    createRun: vi.fn().mockResolvedValue(undefined),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    completeDelivery: vi.fn().mockResolvedValue({ duplicate }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue([]),
  };
}

function firstEvent(scenario: ReturnType<typeof createScenario>) {
  const event = scenario.events[0];
  if (!event) {
    throw new Error("Scenario did not generate an event");
  }
  return event;
}

describe("delivery consumer", () => {
  it("records a successful built-in receiver response", async () => {
    const deliveryStore = store();
    const event = firstEvent(
      createScenario("happy-path", "00000000-0000-4000-8000-000000000010"),
    );

    await processRecord(recordFor(event), deliveryStore);

    expect(deliveryStore.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", responseStatus: 204, attempt: 1 }),
    );
    expect(deliveryStore.completeDelivery).toHaveBeenCalledOnce();
  });

  it("requests a retry for the first two controlled attempts", async () => {
    const deliveryStore = store();
    const event = firstEvent(
      createScenario("retry-then-success", "00000000-0000-4000-8000-000000000011"),
    );

    await expect(processRecord(recordFor(event, 2), deliveryStore)).rejects.toThrow(
      "returned 503 on attempt 2",
    );
    expect(deliveryStore.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retrying", responseStatus: 503, attempt: 2 }),
    );
    expect(deliveryStore.completeDelivery).not.toHaveBeenCalled();
  });

  it("delivers a controlled retry scenario on its third attempt", async () => {
    const deliveryStore = store();
    const event = firstEvent(
      createScenario("retry-then-success", "00000000-0000-4000-8000-000000000012"),
    );

    await processRecord(recordFor(event, 3), deliveryStore);

    expect(deliveryStore.completeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", attempt: 3 }),
    );
  });
});
