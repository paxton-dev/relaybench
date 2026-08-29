# RelayBench

RelayBench is a public, bounded webhook-delivery lab. It validates versioned CloudEvents, routes accepted events through Amazon EventBridge, buffers delivery with Amazon SQS, demonstrates controlled retries and duplicate suppression, and builds queryable DynamoDB projections.

Terminal runs can be investigated by a grounded AI analyst backed by Amazon Bedrock. The analyst receives only server-generated delivery evidence, returns runtime-validated JSON with checked evidence citations, and is scored against the scenario's known diagnosis.

The public interface accepts only named server-generated scenarios. The raw event producer route is protected with AWS IAM authorization.

The production demo is designed to run at `relaybench.jamespaxton.io` and can be embedded by the
case-study page at `jamespaxton.io/projects/relaybench`. CloudFront allows only the portfolio apex
and `www` hostname as frame ancestors; the application also supports `?embed=1` for a more compact
header inside that frame. API Gateway permits the portfolio apex as an explicit browser origin.

## Current status

The initial implementation includes:

- Three JSON Schema 2020-12 event contracts
- CloudEvents-compatible envelopes and contract validation
- Five bounded scenarios
- EventBridge publication and content-based routing
- SQS partial-batch failure handling and a dead-letter queue
- DynamoDB run, attempt, delivery, and deduplication records
- A React/Vite observer interface
- A bounded Nova Micro diagnosis endpoint with evidence citations and golden-case evaluation
- A DynamoDB-backed monthly inference ceiling and per-run response cache
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

Terminal run → diagnosis Lambda → Amazon Bedrock Nova Micro
                   │
          validated, evidence-linked result
                   │
          DynamoDB cache and usage counter

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

The AI diagnosis requires Bedrock model access for `amazon.nova-micro-v1:0` in `us-east-1`. The Lambda uses the Converse API with a 500-token output limit. Terraform grants access only to that regional foundation-model ARN.

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

### Custom domain

The default deployment uses its generated CloudFront hostname. To publish the lab at `relaybench.jamespaxton.io`, first issue and validate a separate ACM certificate in `us-east-1`; the existing portfolio certificate covers only `jamespaxton.io` and `www.jamespaxton.io`. Set `demo_domain_name` and `demo_certificate_arn` together, apply the reviewed plan, then point the externally managed DNS record to the `cloudfront_domain_name` output.

Once the hostname is live, add its URL to the public-project card in the `jamespaxton.io` frontend. Keeping that link out of the portfolio deployment until DNS resolves avoids publishing a broken demo.

## Production deployment

RelayBench deploys to AWS with Terraform from GitHub Actions. Vercel is not part of the
deployment path. Pull requests run validation only. Every commit or merge to `main` triggers
`.github/workflows/deploy.yml`; the workflow can also be started manually.

The workflow builds the Lambda bundles and Vite application, creates a Terraform plan, applies
that exact plan, and writes the demo and CloudFront URLs to the GitHub Actions job summary.
Deployments are serialized so two production applies cannot run at the same time.

### One-time AWS bootstrap

The bootstrap module creates the versioned Terraform state bucket, a GitHub Actions OIDC provider
when one is not supplied, and the `relaybench-github-deploy` role. The role trusts only this
repository's `production` GitHub environment and uses short-lived credentials; no AWS access keys
are stored in GitHub. Its permissions are limited to the AWS services in this stack, and IAM role
management is restricted to names beginning with `relaybench-`.

```bash
terraform -chdir=infrastructure/bootstrap init
terraform -chdir=infrastructure/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infrastructure/bootstrap apply bootstrap.tfplan
```

An AWS account can have only one GitHub Actions OIDC provider. If the account already has one,
pass its ARN instead of creating another:

```bash
terraform -chdir=infrastructure/bootstrap plan \
  -var='github_oidc_provider_arn=arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com' \
  -out=bootstrap.tfplan
```

After applying the bootstrap module, copy its outputs into GitHub repository variables:

| GitHub variable | Bootstrap value |
| --- | --- |
| `AWS_ACCOUNT_ID` | `terraform -chdir=infrastructure/bootstrap output -raw aws_account_id` |
| `AWS_ROLE_ARN` | `terraform -chdir=infrastructure/bootstrap output -raw github_deploy_role_arn` |
| `TF_STATE_BUCKET` | `terraform -chdir=infrastructure/bootstrap output -raw state_bucket` |
| `AWS_REGION` | `us-east-1` |

Create a GitHub environment named `production`. The deployment job references this environment,
and the AWS trust policy checks it in the OIDC token. Environment reviewers may be added if manual
approval is desired; without a reviewer, a successful push to `main` deploys automatically.

For the optional custom hostname, also configure both repository variables below. Leave both
unset to use the generated CloudFront URL.

| Optional GitHub variable | Value |
| --- | --- |
| `DEMO_DOMAIN_NAME` | `relaybench.jamespaxton.io` |
| `DEMO_CERTIFICATE_ARN` | ARN of its issued `us-east-1` ACM certificate |

The workflow uses `aws-actions/configure-aws-credentials` with GitHub OIDC, initializes the S3
backend at `relaybench/production/terraform.tfstate`, runs the full application checks, and applies
only the saved production plan. A failed check or plan prevents deployment.

## Cost posture

RelayBench has no VPC, NAT Gateway, WAF, provisioned concurrency, EventBridge archive, or customer-managed KMS key. At portfolio traffic, expected AWS usage is approximately $0 to $0.10 per month, depending on the account's remaining free-tier allowances.

Public scenarios are API-throttled, retain records for seven days, and cannot accept arbitrary webhook destinations.

AI inference is additionally constrained to one concurrent diagnosis, one stored diagnosis per run, and 200 new diagnoses per UTC month by default. Cached diagnoses do not consume the monthly allowance. The limit can be lowered with `ai_monthly_diagnosis_limit`; raising it above 1,000 is intentionally rejected by Terraform validation.

## License

MIT
