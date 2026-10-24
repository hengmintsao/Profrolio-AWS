# Portfolio AWS

A serverless portfolio website that demonstrates frontend development, infrastructure as code, automated delivery, and AWS security practices.

## Architecture

The frontend is delivered through CloudFront from a private S3 bucket. Contact requests pass through an API Gateway HTTP API to Lambda, which validates and stores the submission in DynamoDB and publishes an SNS notification.

See [the architecture notes](docs/architecture.md) for the data flow and design decisions.

## Repository structure

```text
frontend/        Static website and runtime configuration
backend/         Contact Lambda, validation, and unit tests
infrastructure/  AWS SAM / CloudFormation template
docs/            Architecture documentation
.github/         CI and AWS deployment workflows
```

## AWS services

- Amazon CloudFront
- Amazon S3 with Block Public Access and Origin Access Control
- Amazon API Gateway HTTP API
- AWS Lambda
- Amazon DynamoDB
- Amazon SNS
- Amazon CloudWatch
- AWS CloudFormation through AWS SAM

## Local development

Serve `frontend/` with any static HTTP server. The checked-in `frontend/js/config.js` intentionally contains an empty API URL, so local development does not send messages to production by accident.

Run the backend checks:

```bash
cd backend
npm install
npm run check
npm test
```

To test the form against an already deployed API, temporarily set `API_URL` in `frontend/js/config.js`. Do not commit environment-specific URLs.

## Deploy with AWS SAM

Prerequisites:

- AWS CLI configured for the target account
- AWS SAM CLI
- Node.js 22

```bash
cd backend
npm install
cd ..
sam build --template-file infrastructure/template.yaml
sam deploy --guided
```

Use the generated `ApiEndpoint` stack output to update `frontend/js/config.js`, then upload `frontend/` to the `FrontendBucketName` output and invalidate the `DistributionId` output. The GitHub deployment workflow performs these steps automatically.

If `NotificationEmail` is supplied, AWS sends a subscription confirmation message. Notifications do not begin until that link is confirmed.

The production URL is https://henry-tsao.com. https://www.henry-tsao.com redirects
to the primary hostname, preserving the path and query parameters. The SAM
`PrimaryDomainName` parameter controls both hostnames and the exact HTTPS origin
allowed by the contact form. `CertificateArn` references the existing issued ACM
certificate in us-east-1; it must cover both hostnames. DNS aliases and ACM
validation records remain managed in the existing Route 53 hosted zone.

The deployment role needs CloudFront Function create/read/update/publish/delete
permissions for `portfolio-aws-canonical-domain` in addition to distribution
permissions. See `infrastructure/custom-domain-function-policy.json` for the
additional inline policy. This does not grant Lambda function permissions.

## GitHub Actions deployment

Configure these repository settings:

| Type | Name | Purpose |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | IAM role trusted by GitHub OIDC |
| Secret | `NOTIFICATION_EMAIL` | SNS notification recipient |
| Variable | `AWS_REGION` | Deployment region, defaults to `us-east-1` |
| Variable | `SAM_STACK_NAME` | CloudFormation stack name, defaults to `portfolio-aws` |
| SAM parameter | `PrimaryDomainName` | Primary hostname; defaults to `henry-tsao.com` |
| SAM parameter | `CertificateArn` | Existing ACM certificate covering the primary hostname and www |

`ALLOWED_ORIGIN` is derived from `PrimaryDomainName` in SAM. The deployment
workflow no longer reads the old GitHub `ALLOWED_ORIGIN` variable.

The deployment role should be restricted to this repository and production environment. Do not store AWS access keys in GitHub.

## Data and security

- Contact records expire after 90 days through DynamoDB TTL.
- DynamoDB point-in-time recovery and encryption are enabled.
- S3 public access is blocked; CloudFront reads through signed Origin Access Control requests.
- API throttling and a honeypot reduce basic abuse. Add CAPTCHA or AWS WAF if traffic warrants it.
- CloudWatch logs expire after 30 days.
- The stack retains the S3 bucket and DynamoDB table when the stack is deleted to prevent accidental data loss.

## Cost

The system uses usage-based serverless services and should remain inexpensive at portfolio traffic levels. It is not strictly zero-cost: CloudFront requests and transfer, S3 storage, API calls, logs, and other usage can incur charges.
