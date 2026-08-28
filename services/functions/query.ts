import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listSchemas } from "../../packages/contracts/validator.js";
import { jsonResponse } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { deliveryStore } from "../lib/store.js";

function deriveRun(items: readonly Record<string, unknown>[]): Record<string, unknown> | undefined {
  const meta = items.find((item) => item.kind === "run");
  if (!meta) {
    return undefined;
  }
  const expected = Number(meta.expectedEvents ?? 0);
  const delivered = Number(meta.deliveredCount ?? 0);
  const failed = Number(meta.failedCount ?? 0);
  const status = failed > 0 ? "failed" : delivered >= expected ? "delivered" : "processing";
  return {
    ...meta,
    status,
    deliveries: items.filter((item) => item.kind === "delivery"),
    attempts: items.filter((item) => item.kind === "attempt"),
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (request) => {
  try {
    if (request.rawPath === "/api/v1/schemas") {
      return jsonResponse(200, { schemas: listSchemas() });
    }

    const runId = request.pathParameters?.runId;
    if (runId) {
      const run = deriveRun(await deliveryStore.getRun(runId));
      return run ? jsonResponse(200, run) : jsonResponse(404, { error: "Run not found" });
    }

    const limit = Number(request.queryStringParameters?.limit ?? "25");
    const runs = await deliveryStore.listRuns(Number.isFinite(limit) ? limit : 25);
    return jsonResponse(200, {
      runs: runs.map((run) => deriveRun([run])).filter(Boolean),
    });
  } catch (error) {
    logger.error("Query failed", { error, path: request.rawPath });
    return jsonResponse(500, { error: "Query failed" });
  }
};
