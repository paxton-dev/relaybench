import { randomUUID } from "node:crypto";
import type {
  DemoBehavior,
  RelayBenchCloudEvent,
  RelayBenchEventType,
  ScenarioName,
} from "./types.js";

const schemaBase = "https://relaybench.example/schemas";

function makeEvent(
  runId: string,
  type: RelayBenchEventType,
  subject: string,
  data: Record<string, unknown>,
  behavior: DemoBehavior,
  id = randomUUID(),
): RelayBenchCloudEvent {
  return {
    specversion: "1.0",
    id,
    source: "relaybench.demo",
    type,
    subject,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema: `${schemaBase}/${type}.json`,
    relaybenchrunid: runId,
    relaybenchbehavior: behavior,
    relaybenchtarget: "builtin://demo-receiver",
    data,
  };
}

export interface ScenarioDefinition {
  readonly runId: string;
  readonly name: ScenarioName;
  readonly events: readonly RelayBenchCloudEvent[];
}

export function createScenario(name: ScenarioName, runId = randomUUID()): ScenarioDefinition {
  const customerId = `cus_${runId.replaceAll("-", "").slice(0, 12)}`;
  const behavior: DemoBehavior =
    name === "retry-then-success"
      ? "retry-twice"
      : name === "permanent-failure"
        ? "always-fail"
        : "deliver";

  if (name === "invalid-schema") {
    return {
      runId,
      name,
      events: [
        makeEvent(
          runId,
          "com.relaybench.customer.created.v1",
          `customer/${customerId}`,
          { plan: "growth", region: "na" },
          behavior,
        ),
      ],
    };
  }

  const events: RelayBenchCloudEvent[] = [
    makeEvent(
      runId,
      "com.relaybench.customer.created.v1",
      `customer/${customerId}`,
      { customerId, plan: "growth", region: "na" },
      behavior,
    ),
    makeEvent(
      runId,
      "com.relaybench.subscription.activated.v1",
      `customer/${customerId}`,
      {
        subscriptionId: `sub_${runId.replaceAll("-", "").slice(0, 12)}`,
        customerId,
        plan: "growth",
        billingInterval: "month",
      },
      behavior,
    ),
    makeEvent(
      runId,
      "com.relaybench.invoice.payment-failed.v1",
      `customer/${customerId}`,
      {
        invoiceId: `inv_${runId.replaceAll("-", "").slice(0, 12)}`,
        customerId,
        amountMinor: 4900,
        currency: "USD",
        failureCode: "insufficient_funds",
      },
      behavior,
    ),
  ];

  if (name === "duplicate-delivery") {
    events.push(events[0] as RelayBenchCloudEvent);
  }

  return { runId, name, events };
}
