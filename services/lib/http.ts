import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

export function parseJsonBody(body: string | undefined, isBase64Encoded = false): unknown {
  if (!body) {
    throw new Error("Request body is required");
  }
  const decoded = isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  if (Buffer.byteLength(decoded, "utf8") > 32 * 1024) {
    throw new Error("Request body exceeds the 32 KiB limit");
  }
  return JSON.parse(decoded) as unknown;
}
