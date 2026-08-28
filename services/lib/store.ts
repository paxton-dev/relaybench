import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { RelayBenchCloudEvent } from "../../packages/contracts/types.js";
import { requiredEnvironment, retentionEpoch } from "./config.js";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  maxAttempts: 3,
});

const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
    convertClassInstanceToMap: false,
    allowImpreciseNumbers: false,
  },
});

function tableName(): string {
  return requiredEnvironment("TABLE_NAME");
}

export interface RunRecord {
  readonly pk: string;
  readonly sk: "META";
  readonly kind: "run";
  readonly runId: string;
  readonly scenario: string;
  readonly expectedEvents: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: number;
  readonly gsi1pk: "RUNS";
  readonly gsi1sk: string;
}

export interface DeliveryAttempt {
  readonly runId: string;
  readonly eventId: string;
  readonly messageId: string;
  readonly attempt: number;
  readonly status: "delivered" | "retrying" | "failed";
  readonly responseStatus: number;
  readonly occurredAt: string;
}

export interface CompleteDeliveryInput extends DeliveryAttempt {
  readonly event: RelayBenchCloudEvent;
}

export interface DeliveryStore {
  createRun(runId: string, scenario: string, expectedEvents: number): Promise<void>;
  recordAttempt(attempt: DeliveryAttempt): Promise<void>;
  completeDelivery(input: CompleteDeliveryInput): Promise<{ duplicate: boolean }>;
  listRuns(limit?: number): Promise<readonly Record<string, unknown>[]>;
  getRun(runId: string): Promise<readonly Record<string, unknown>[]>;
}

export const deliveryStore: DeliveryStore = {
  async createRun(runId, scenario, expectedEvents) {
    const now = new Date().toISOString();
    const record: RunRecord = {
      pk: `RUN#${runId}`,
      sk: "META",
      kind: "run",
      runId,
      scenario,
      expectedEvents,
      deliveredCount: 0,
      failedCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: retentionEpoch(),
      gsi1pk: "RUNS",
      gsi1sk: `${now}#${runId}`,
    };

    await documentClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: record,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  },

  async recordAttempt(attempt) {
    await documentClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          pk: `RUN#${attempt.runId}`,
          sk: `EVENT#${attempt.eventId}#ATTEMPT#${attempt.attempt.toString().padStart(4, "0")}#${attempt.messageId}`,
          kind: "attempt",
          ...attempt,
          expiresAt: retentionEpoch(),
        },
      }),
    );
  },

  async completeDelivery(input) {
    const now = input.occurredAt;
    const countField = input.status === "failed" ? "failedCount" : "deliveredCount";
    try {
      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName(),
                Item: {
                  pk: `DEDUP#${input.event.source}#${input.event.id}`,
                  sk: "META",
                  kind: "deduplication",
                  runId: input.runId,
                  eventId: input.eventId,
                  expiresAt: retentionEpoch(),
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: {
                  pk: `RUN#${input.runId}`,
                  sk: `EVENT#${input.eventId}`,
                  kind: "delivery",
                  runId: input.runId,
                  eventId: input.eventId,
                  eventType: input.event.type,
                  subject: input.event.subject,
                  status: input.status,
                  attempts: input.attempt,
                  responseStatus: input.responseStatus,
                  event: input.event,
                  occurredAt: now,
                  expiresAt: retentionEpoch(),
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Update: {
                TableName: tableName(),
                Key: { pk: `RUN#${input.runId}`, sk: "META" },
                UpdateExpression: `SET ${countField} = if_not_exists(${countField}, :zero) + :one, updatedAt = :now`,
                ConditionExpression: "attribute_exists(pk)",
                ExpressionAttributeValues: {
                  ":zero": 0,
                  ":one": 1,
                  ":now": now,
                },
              },
            },
          ],
        }),
      );
      return { duplicate: false };
    } catch (error) {
      if (error instanceof Error && error.name === "TransactionCanceledException") {
        return { duplicate: true };
      }
      throw error;
    }
  },

  async listRuns(limit = 25) {
    const input: QueryCommandInput = {
      TableName: tableName(),
      IndexName: "RecentRuns",
      KeyConditionExpression: "gsi1pk = :runs",
      ExpressionAttributeValues: { ":runs": "RUNS" },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(limit, 1), 50),
    };
    const result = await documentClient.send(new QueryCommand(input));
    return (result.Items ?? []) as readonly Record<string, unknown>[];
  },

  async getRun(runId) {
    const result = await documentClient.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `RUN#${runId}` },
        ScanIndexForward: true,
      }),
    );
    return (result.Items ?? []) as readonly Record<string, unknown>[];
  },
};

export async function markRunPublishFailure(runId: string, message: string): Promise<void> {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: `RUN#${runId}`, sk: "META" },
      UpdateExpression: "SET publishError = :message, updatedAt = :now",
      ExpressionAttributeValues: {
        ":message": message,
        ":now": new Date().toISOString(),
      },
    }),
  );
}
