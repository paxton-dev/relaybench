# ADR 0001: Route events through EventBridge and buffer delivery with SQS

Status: accepted

RelayBench uses a dedicated EventBridge bus for contract-aware routing and an SQS standard queue for delivery buffering. EventBridge rules select only supported event types. SQS absorbs bursts, provides retry timing, and moves exhausted messages to a dead-letter queue.

The system accepts at-least-once delivery. Consumers conditionally write a `source + id` deduplication record before updating the DynamoDB projection. Native replay and strict ordering are deliberately out of scope for the first release.
