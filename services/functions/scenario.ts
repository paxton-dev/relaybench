import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { awsEventPublisher } from "../lib/events.js";
import { jsonResponse } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import {
  isScenarioName,
  runScenario,
  ScenarioPublishError,
} from "../lib/scenario-service.js";
import { deliveryStore, markRunPublishFailure } from "../lib/store.js";

export const handler: APIGatewayProxyHandlerV2 = async (request) => {
  const scenario = request.pathParameters?.scenario;
  if (!isScenarioName(scenario)) {
    return jsonResponse(404, { error: "Unknown scenario", scenario });
  }

  try {
    const result = await runScenario(scenario, awsEventPublisher, deliveryStore);
    logger.info("Scenario evaluated", {
      scenario,
      runId: result.runId,
      accepted: result.accepted,
      eventCount: result.eventIds.length,
    });
    return jsonResponse(result.accepted ? 202 : 422, result);
  } catch (error) {
    logger.error("Scenario failed", { error, scenario });
    if (error instanceof ScenarioPublishError) {
      try {
        await markRunPublishFailure(error.runId, error.message);
      } catch (markError) {
        logger.error("Scenario publish failure could not be recorded", {
          error: markError,
          runId: error.runId,
        });
      }
    }
    return jsonResponse(503, { error: "Scenario could not be published" });
  }
};
