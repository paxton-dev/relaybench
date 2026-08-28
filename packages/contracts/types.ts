export const eventTypes = [
  "com.relaybench.customer.created.v1",
  "com.relaybench.subscription.activated.v1",
  "com.relaybench.invoice.payment-failed.v1",
] as const;

export type RelayBenchEventType = (typeof eventTypes)[number];

export const scenarioNames = [
  "happy-path",
  "retry-then-success",
  "duplicate-delivery",
  "invalid-schema",
  "permanent-failure",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export type DemoBehavior = "deliver" | "retry-twice" | "always-fail";

export interface RelayBenchCloudEvent<TData = unknown> {
  readonly specversion: "1.0";
  readonly id: string;
  readonly source: "relaybench.demo" | "relaybench.producer";
  readonly type: RelayBenchEventType;
  readonly subject: string;
  readonly time: string;
  readonly datacontenttype: "application/json";
  readonly dataschema: string;
  readonly relaybenchrunid: string;
  readonly relaybenchbehavior: DemoBehavior;
  readonly relaybenchtarget: "builtin://demo-receiver";
  readonly data: TData;
}

export interface CustomerCreatedData {
  readonly customerId: string;
  readonly plan: "starter" | "growth" | "scale";
  readonly region: "na" | "eu" | "apac";
}

export interface SubscriptionActivatedData {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly plan: "starter" | "growth" | "scale";
  readonly billingInterval: "month" | "year";
}

export interface InvoicePaymentFailedData {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly amountMinor: number;
  readonly currency: "USD" | "EUR" | "GBP";
  readonly failureCode: "insufficient_funds" | "expired_method" | "processing_error";
}

export type RelayBenchEventData =
  | CustomerCreatedData
  | SubscriptionActivatedData
  | InvoicePaymentFailedData;

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };
