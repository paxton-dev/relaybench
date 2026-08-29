import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";
import { isDuplicateDeliveryCancellation } from "../services/lib/store.js";

function canceled(...codes: string[]): TransactionCanceledException {
  return new TransactionCanceledException({
    $metadata: {},
    message: "Transaction cancelled",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe("delivery transaction cancellation", () => {
  it("recognizes a failed deduplication condition as a duplicate", () => {
    expect(
      isDuplicateDeliveryCancellation(canceled("ConditionalCheckFailed", "None", "None")),
    ).toBe(true);
  });

  it("recognizes an existing delivery projection as a duplicate", () => {
    expect(
      isDuplicateDeliveryCancellation(canceled("None", "ConditionalCheckFailed", "None")),
    ).toBe(true);
  });

  it("does not suppress transaction contention", () => {
    expect(
      isDuplicateDeliveryCancellation(canceled("None", "None", "TransactionConflict")),
    ).toBe(false);
  });

  it("does not suppress unrelated errors", () => {
    expect(isDuplicateDeliveryCancellation(new Error("unavailable"))).toBe(false);
  });
});
