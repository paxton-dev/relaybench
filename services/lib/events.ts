import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import type { RelayBenchCloudEvent } from "../../packages/contracts/types.js";
import { requiredEnvironment } from "./config.js";

const eventBridge = new EventBridgeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  maxAttempts: 3,
});

export interface EventPublisher {
  publish(events: readonly RelayBenchCloudEvent[]): Promise<void>;
}

export const awsEventPublisher: EventPublisher = {
  async publish(events) {
    if (events.length === 0) {
      return;
    }
    if (events.length > 10) {
      throw new Error("EventBridge PutEvents accepts at most 10 events per request");
    }

    const response = await eventBridge.send(
      new PutEventsCommand({
        Entries: events.map((event) => ({
          EventBusName: requiredEnvironment("EVENT_BUS_NAME"),
          Source: event.source,
          DetailType: event.type,
          Detail: JSON.stringify(event),
          Time: new Date(event.time),
        })),
      }),
    );

    if ((response.FailedEntryCount ?? 0) > 0) {
      const failures = (response.Entries ?? [])
        .filter((entry) => entry.ErrorCode)
        .map((entry) => `${entry.ErrorCode}: ${entry.ErrorMessage ?? "unknown error"}`);
      throw new Error(`EventBridge rejected ${response.FailedEntryCount} event(s): ${failures.join(", ")}`);
    }
  },
};
