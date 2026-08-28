import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import customerCreatedSchema from "./schemas/customer-created-v1.schema.json" with { type: "json" };
import invoicePaymentFailedSchema from "./schemas/invoice-payment-failed-v1.schema.json" with { type: "json" };
import subscriptionActivatedSchema from "./schemas/subscription-activated-v1.schema.json" with { type: "json" };
import {
  eventTypes,
  type RelayBenchCloudEvent,
  type RelayBenchEventType,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });

const schemas: Readonly<Record<RelayBenchEventType, object>> = {
  "com.relaybench.customer.created.v1": customerCreatedSchema,
  "com.relaybench.subscription.activated.v1": subscriptionActivatedSchema,
  "com.relaybench.invoice.payment-failed.v1": invoicePaymentFailedSchema,
};

const validators = Object.fromEntries(
  Object.entries(schemas).map(([type, schema]) => [type, ajv.compile(schema)]),
) as Record<RelayBenchEventType, ValidateFunction>;

const eventSources = ["relaybench.demo", "relaybench.producer"] as const;
const deliveryBehaviors = ["deliver", "retry-twice", "always-fail"] as const;
const deliveryTargets = ["builtin://demo-receiver"] as const;

function includesValue(values: readonly string[], value: unknown): boolean {
  return typeof value === "string" && values.includes(value);
}

function issuesFrom(errors: ErrorObject[] | null | undefined): readonly ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "failed validation",
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEventType(value: unknown): value is RelayBenchEventType {
  return typeof value === "string" && (eventTypes as readonly string[]).includes(value);
}

export function validateCloudEvent(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: "/", message: "must be an object" }] };
  }

  const envelopeIssues: ValidationIssue[] = [];
  const requiredStrings = [
    "id",
    "source",
    "type",
    "subject",
    "time",
    "dataschema",
    "relaybenchrunid",
    "relaybenchbehavior",
    "relaybenchtarget",
  ] as const;

  if (value.specversion !== "1.0") {
    envelopeIssues.push({ path: "/specversion", message: "must equal 1.0" });
  }
  if (value.datacontenttype !== "application/json") {
    envelopeIssues.push({ path: "/datacontenttype", message: "must equal application/json" });
  }
  for (const field of requiredStrings) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      envelopeIssues.push({ path: `/${field}`, message: "must be a non-empty string" });
    }
  }
  if (!includesValue(eventSources, value.source)) {
    envelopeIssues.push({ path: "/source", message: "is not an allowed event source" });
  }
  if (!isEventType(value.type)) {
    envelopeIssues.push({ path: "/type", message: "is not a supported event type" });
  }
  if (!includesValue(deliveryBehaviors, value.relaybenchbehavior)) {
    envelopeIssues.push({
      path: "/relaybenchbehavior",
      message: "is not a supported delivery behavior",
    });
  }
  if (!includesValue(deliveryTargets, value.relaybenchtarget)) {
    envelopeIssues.push({ path: "/relaybenchtarget", message: "is not an allowed target" });
  }
  if (typeof value.time === "string" && Number.isNaN(Date.parse(value.time))) {
    envelopeIssues.push({ path: "/time", message: "must be an ISO 8601 timestamp" });
  }
  if (!isRecord(value.data)) {
    envelopeIssues.push({ path: "/data", message: "must be an object" });
  }
  if (envelopeIssues.length > 0 || !isEventType(value.type)) {
    return { valid: false, issues: envelopeIssues };
  }

  const validate = validators[value.type];
  if (!validate(value.data)) {
    return {
      valid: false,
      issues: issuesFrom(validate.errors).map((issue) => ({
        ...issue,
        path: `/data${issue.path === "/" ? "" : issue.path}`,
      })),
    };
  }

  return { valid: true };
}

export function assertCloudEvent(value: unknown): asserts value is RelayBenchCloudEvent {
  const result = validateCloudEvent(value);
  if (!result.valid) {
    throw new Error(result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; "));
  }
}

export function listSchemas(): readonly { type: RelayBenchEventType; schema: object }[] {
  return eventTypes.map((type) => ({ type, schema: schemas[type] }));
}
