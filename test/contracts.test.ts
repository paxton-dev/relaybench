import { describe, expect, it } from "vitest";
import { createScenario } from "../packages/contracts/scenarios.js";
import { eventTypes } from "../packages/contracts/types.js";
import { listSchemas, validateCloudEvent } from "../packages/contracts/validator.js";

describe("event contracts", () => {
  it("validates every event in the happy path", () => {
    const scenario = createScenario("happy-path", "00000000-0000-4000-8000-000000000001");

    expect(scenario.events).toHaveLength(3);
    expect(scenario.events.every((event) => validateCloudEvent(event).valid)).toBe(true);
  });

  it("returns a JSON pointer for invalid scenario data", () => {
    const [event] = createScenario(
      "invalid-schema",
      "00000000-0000-4000-8000-000000000002",
    ).events;

    const result = validateCloudEvent(event);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toContainEqual({
        path: "/data",
        message: "must have required property 'customerId'",
      });
    }
  });

  it("publishes one schema for every supported event type", () => {
    expect(listSchemas().map(({ type }) => type)).toEqual(eventTypes);
  });

  it("rejects unsupported event versions", () => {
    const [event] = createScenario(
      "happy-path",
      "00000000-0000-4000-8000-000000000003",
    ).events;

    const result = validateCloudEvent({
      ...event,
      type: "com.relaybench.customer.created.v2",
    });

    expect(result.valid).toBe(false);
  });

  it.each([
    ["source", "untrusted.producer"],
    ["relaybenchbehavior", "skip-delivery"],
    ["relaybenchtarget", "https://example.invalid/hook"],
    ["time", "not-a-timestamp"],
  ])("rejects an invalid %s envelope field", (field, value) => {
    const [event] = createScenario(
      "happy-path",
      "00000000-0000-4000-8000-000000000004",
    ).events;

    const result = validateCloudEvent({ ...event, [field]: value });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some((issue) => issue.path === `/${field}`)).toBe(true);
    }
  });
});
