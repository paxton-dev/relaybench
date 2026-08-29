import { describe, expect, it, vi } from "vitest";
import type { EventPublisher } from "../services/lib/events.js";
import {
  runScenario,
  ScenarioPublishError,
} from "../services/lib/scenario-service.js";
import type { DeliveryStore } from "../services/lib/store.js";

function dependencies() {
  const publisher: EventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
  };
  const store: DeliveryStore = {
    createRun: vi.fn().mockResolvedValue(undefined),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    completeDelivery: vi.fn().mockResolvedValue({ duplicate: false }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue([]),
  };
  return { publisher, store };
}

describe("scenario service", () => {
  it("creates and publishes a valid run", async () => {
    const { publisher, store } = dependencies();

    const result = await runScenario("happy-path", publisher, store);

    expect(result.accepted).toBe(true);
    expect(result.eventIds).toHaveLength(3);
    expect(store.createRun).toHaveBeenCalledWith(result.runId, "happy-path", 3);
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it("does not publish an invalid event", async () => {
    const { publisher, store } = dependencies();

    const result = await runScenario("invalid-schema", publisher, store);

    expect(result.accepted).toBe(false);
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(store.createRun).toHaveBeenCalledWith(
      result.runId,
      "invalid-schema",
      0,
      result.issues,
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("counts unique source and id pairs for duplicate scenarios", async () => {
    const { publisher, store } = dependencies();

    const result = await runScenario("duplicate-delivery", publisher, store);

    expect(result.eventIds).toHaveLength(4);
    expect(store.createRun).toHaveBeenCalledWith(result.runId, "duplicate-delivery", 3);
  });

  it("preserves the run id when publishing fails", async () => {
    const { publisher, store } = dependencies();
    vi.mocked(publisher.publish).mockRejectedValueOnce(new Error("EventBridge unavailable"));

    const result = runScenario("happy-path", publisher, store);

    await expect(result).rejects.toBeInstanceOf(ScenarioPublishError);
    await expect(result).rejects.toMatchObject({
      message: "Scenario events could not be published",
      runId: expect.any(String),
    });
    expect(store.createRun).toHaveBeenCalledOnce();
  });
});
