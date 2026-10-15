# Architecture

```text
GitHub Actions (OIDC)
       |
       +--> AWS SAM / CloudFormation
       |
       +--> private S3 bucket --> CloudFront --> Browser
                                           |
                                           v
                                    API Gateway HTTP API
                                           |
                                           v
                                     Contact Lambda
                                           |
                                       DynamoDB
                                           |
                                     DynamoDB Streams
                                           |
                                    Notification Lambda
                                       /      \
                           failure metadata   SNS --> confirmed email
                                  |
                             SQS failure queue
```

## Design decisions

- CloudFront is the only public entry point for frontend assets; the S3 bucket blocks public access.
- API Gateway provides CORS and request throttling before invoking Lambda.
- Contact Lambda validates all input, rejects bot honeypot submissions, and stores accepted contacts. A separate notification Lambda publishes to SNS.
- DynamoDB uses on-demand billing, encryption, point-in-time recovery, and a 90-day TTL for contact data.
- CloudWatch retains Lambda logs for 30 days and creates an alarm when an invocation fails.
- GitHub Actions authenticates with short-lived AWS credentials through OIDC.

## Contact acceptance

- A contact submission is accepted when DynamoDB storage succeeds. HTTP 202
  acknowledges storage, not notification delivery.
- Invalid input returns HTTP 400 without storage or notification.
- Storage failure returns HTTP 503. The caller can retry with the same key,
  including when storage succeeded but the response was lost.
- The browser sends a UUID v4 `Idempotency-Key` header. It retains the key and
  a SHA-256 payload fingerprint in session storage after uncertain failures,
  clears them after success, and generates a new key when input changes.
  Contact details are not persisted in session storage. Browsers must use HTTPS
  or localhost for Web Crypto. If session storage is unavailable, retries work
  within the current page only.
- Conditional writes atomically insert a contact with `notificationStatus=pending`.
  A repeated key with the same normalized payload returns 202 without another
  insert; different input returns 409. An omitted key remains supported for old
  clients but offers no deduplication. Deduplication lasts while the contact
  record exists (90-day TTL; eventual deletion).
- DynamoDB Streams INSERT events invoke the notification worker. It reads the
  current record, publishes pending notifications with a three-second client
  deadline, and sets status to `sent` after SNS accepts publication.
- The worker reports failures by stream sequence number. Lambda retries at most
  ten times or until the record is one hour old, then sends failure metadata to
  SQS (14-day retention). The queue has a CloudWatch alarm without an outbound
  alarm action; configure an operational recipient separately.
- Notification delivery is at least once. A crash after SNS accepts publication
  but before the sent status is saved can produce a duplicate notification.
  Already-sent records are skipped on replay. SNS acceptance is not proof that
  an email was delivered, and the email subscription must be confirmed.
- See `docs/contact-operations.md` for recovery and deployment verification.

## Production follow-ups

- Replace the initial `AllowedOrigin=*` with the final HTTPS domain.
- Add Route 53 and ACM resources when a custom domain is selected.
- Route the CloudWatch alarm to a dedicated operational notification topic.
- Add AWS WAF or CAPTCHA if automated submissions become a problem.
