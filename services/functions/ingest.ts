import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import type { RelayBenchCloudEvent } from "../../packages/contracts/types.js";
import { validateCloudEvent } from "../../packages/contracts/validator.js";
import { awsEventPublisher } from "../lib/events.js";
import { jsonResponse, parseJsonBody } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { deliveryStore } from "../lib/store.js";

export const handler: APIGatewayProxyHandlerV2 = async (request) => {
  try {
    const value = parseJsonBody(request.body, request.isBase64Encoded);
    const result = validateCloudEvent(value);
    if (!result.valid) {
      return jsonResponse(422, { error: "Event failed contract validation", issues: result.issues });
    }

    const event = value as RelayBenchCloudEvent;
    if (event.source !== "relaybench.producer") {
      return jsonResponse(422, {
        error: "Producer events must use the relaybench.producer source",
        issues: [{ path: "/source", message: "must equal relaybench.producer" }],
      });
    }
    await deliveryStore.createRun(event.relaybenchrunid, "producer", 1);
    await awsEventPublisher.publish([event]);
    logger.info("Producer event accepted", {
      eventId: event.id,
      eventType: event.type,
      runId: event.relaybenchrunid,
    });
    return jsonResponse(202, {
      accepted: true,
      eventId: event.id,
      runId: event.relaybenchrunid,
      statusUrl: `/api/v1/runs/${event.relaybenchrunid}`,
    });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.includes("Request body"))) {
      return jsonResponse(400, { error: error.message });
    }
    logger.error("Producer event ingestion failed", { error });
    return jsonResponse(503, { error: "Event could not be accepted" });
  }
};
