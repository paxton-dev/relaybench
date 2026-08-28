# RelayBench

RelayBench is a public, bounded webhook-delivery lab. It validates versioned CloudEvents, routes accepted events through Amazon EventBridge, buffers delivery with Amazon SQS, demonstrates controlled retries and duplicate suppression, and builds queryable DynamoDB projections.

The public interface accepts only named server-generated scenarios. The raw event producer route is protected with AWS IAM authorization.

## Current status

The initial implementation includes:

- Three JSON Schema 2020-12 event contracts
- CloudEvents-compatible envelopes and contract validation
- Five bounded scenarios
- EventBridge publication and content-based routing
- SQS partial-batch failure handling and a dead-letter queue
- DynamoDB run, attempt, delivery, and deduplication records
- A React/Vite observer interface
- Terraform for all application infrastructure
- Application unit tests and CI validation

The built-in webhook receiver is currently a deterministic delivery adapter. It records 204 and 503 outcomes without making an external HTTP request. A signed, internal HTTP receiver is the next delivery milestone; visitor-controlled URLs will remain unsupported.

## Architecture

```text
CloudFront
├── React demo → private S3 bucket
└── /api/* → API Gateway HTTP API
                  │
          scenario / producer Lambda
                  │
          dedicated EventBridge bus
                  │
          encrypted SQS delivery queue
                  │
             delivery Lambda
                  │
        DynamoDB projections and TTL
                  │
            read API Lambda

Failed delivery → SQS dead-letter queue
```

## Scenarios

| Scenario | Expected behavior |
| --- | --- |
| `happy-path` | Three events are delivered on the first attempt. |
| `retry-then-success` | Each event receives two controlled 503 responses, then succeeds. |
| `duplicate-delivery` | A duplicate `source + id` pair is published and suppressed by the projection. |
| `invalid-schema` | A missing required property returns 422 before publication. |
| `permanent-failure` | Delivery exhausts three attempts and moves to the DLQ. |

## Development

Requirements:

- Node.js 24 or newer
- npm
- Terraform 1.10 or newer for infrastructure validation

Install and verify:

```bash
npm ci
npm run check
```

Run the static interface locally:

```bash
npm run dev
```

The local interface needs a deployed API or a local API proxy before its scenario buttons can complete requests.

## Contracts

Contracts live in `packages/contracts/schemas`. Released contract files are immutable. Additive optional properties may be introduced within a major event version; removing fields, changing meaning, or tightening validation requires a new event type version.

- `docs/asyncapi.yaml` describes asynchronous messages.
- `docs/openapi.yaml` describes HTTP endpoints.
- Valid and invalid scenario fixtures are exercised by the test suite.

## Terraform

Bootstrap the versioned S3 state bucket once:

```bash
terraform -chdir=infrastructure/bootstrap init
terraform -chdir=infrastructure/bootstrap apply
```

Copy `infrastructure/backend.hcl.example` to the ignored `infrastructure/backend.hcl`, replace `ACCOUNT_ID`, then initialize:

```bash
terraform -chdir=infrastructure init -backend-config=backend.hcl
terraform -chdir=infrastructure plan -var-file=production.tfvars
```

Do not apply the production configuration until its plan, IAM policies, domain strategy, and cost controls have been reviewed.

## Cost posture

RelayBench has no VPC, NAT Gateway, WAF, provisioned concurrency, EventBridge archive, or customer-managed KMS key. At portfolio traffic, expected AWS usage is approximately $0 to $0.10 per month, depending on the account's remaining free-tier allowances.

Public scenarios are API-throttled, retain records for seven days, and cannot accept arbitrary webhook destinations.

## License

MIT
