import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listSchemas } from "../../packages/contracts/validator.js";
import { jsonResponse } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { deriveRun } from "../lib/run-view.js";
import { deliveryStore } from "../lib/store.js";

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
