import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { bedrockDiagnosisGenerator } from "../lib/bedrock-diagnosis.js";
import { requiredEnvironment } from "../lib/config.js";
import {
  diagnoseRun,
  RunNotFoundError,
  RunNotReadyError,
} from "../lib/diagnosis-service.js";
import { InvalidModelDiagnosisError } from "../lib/diagnosis.js";
import { jsonResponse } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import {
  deliveryStore,
  MonthlyDiagnosisLimitReachedError,
} from "../lib/store.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function monthlyLimit(): number {
  const limit = Number(requiredEnvironment("AI_MONTHLY_LIMIT"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("AI_MONTHLY_LIMIT must be an integer between 1 and 1000");
  }
  return limit;
}

export const handler: APIGatewayProxyHandlerV2 = async (request) => {
  const runId = request.pathParameters?.runId;
  if (!runId || !uuidPattern.test(runId)) {
    return jsonResponse(400, { error: "A valid run ID is required" });
  }

  try {
    const result = await diagnoseRun(
      runId,
      monthlyLimit(),
      deliveryStore,
      bedrockDiagnosisGenerator,
    );
    logger.info("AI diagnosis returned", {
      runId,
      cached: result.cached,
      diagnosisCode: result.diagnosis.diagnosisCode,
      matchesExpectedDiagnosis: result.diagnosis.evaluation.matchesExpectedDiagnosis,
      inputTokens: result.diagnosis.model.inputTokens,
      outputTokens: result.diagnosis.model.outputTokens,
    });
    return jsonResponse(200, { ...result.diagnosis, cached: result.cached });
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return jsonResponse(404, { error: error.message });
    }
    if (error instanceof RunNotReadyError) {
      return jsonResponse(409, { error: error.message });
    }
    if (error instanceof MonthlyDiagnosisLimitReachedError) {
      return jsonResponse(429, { error: error.message });
    }
    if (error instanceof InvalidModelDiagnosisError) {
      logger.warn("Bedrock returned an invalid diagnosis", { runId, reason: error.message });
      return jsonResponse(502, { error: "The AI response failed validation" });
    }
    logger.error("AI diagnosis failed", { error, runId });
    return jsonResponse(503, { error: "AI diagnosis is temporarily unavailable" });
  }
};
