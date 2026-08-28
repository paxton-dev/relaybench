import { createScenario } from "../../packages/contracts/scenarios.js";
import {
  scenarioNames,
  type ScenarioName,
  type ValidationIssue,
} from "../../packages/contracts/types.js";
import { validateCloudEvent } from "../../packages/contracts/validator.js";
import type { EventPublisher } from "./events.js";
import type { DeliveryStore } from "./store.js";

export interface ScenarioResult {
  readonly accepted: boolean;
  readonly runId: string;
  readonly scenario: ScenarioName;
  readonly eventIds: readonly string[];
  readonly issues?: readonly ValidationIssue[];
}

export class ScenarioPublishError extends Error {
  readonly runId: string;

  constructor(runId: string, cause: unknown) {
    super("Scenario events could not be published", { cause });
    this.name = "ScenarioPublishError";
    this.runId = runId;
  }
}

export function isScenarioName(value: string | undefined): value is ScenarioName {
  return typeof value === "string" && (scenarioNames as readonly string[]).includes(value);
}

export async function runScenario(
  name: ScenarioName,
  publisher: EventPublisher,
  store: DeliveryStore,
): Promise<ScenarioResult> {
  const scenario = createScenario(name);
  const issues = scenario.events.flatMap((event) => {
    const result = validateCloudEvent(event);
    return result.valid ? [] : result.issues;
  });

  if (issues.length > 0) {
    return {
      accepted: false,
      runId: scenario.runId,
      scenario: name,
      eventIds: scenario.events.map((event) => event.id),
      issues,
    };
  }

  const uniqueEvents = new Set(scenario.events.map((event) => `${event.source}#${event.id}`));
  await store.createRun(scenario.runId, name, uniqueEvents.size);
  try {
    await publisher.publish(scenario.events);
  } catch (error) {
    throw new ScenarioPublishError(scenario.runId, error);
  }

  return {
    accepted: true,
    runId: scenario.runId,
    scenario: name,
    eventIds: scenario.events.map((event) => event.id),
  };
}
