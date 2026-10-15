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
                                        Lambda
                                       /      \
                              DynamoDB        SNS --> confirmed email
```

## Design decisions

- CloudFront is the only public entry point for frontend assets; the S3 bucket blocks public access.
- API Gateway provides CORS and request throttling before invoking Lambda.
- Lambda validates all input, ignores bot honeypot submissions, and has least-privilege access to DynamoDB and SNS.
- DynamoDB uses on-demand billing, encryption, point-in-time recovery, and a 90-day TTL for contact data.
- CloudWatch retains Lambda logs for 30 days and creates an alarm when an invocation fails.
- GitHub Actions authenticates with short-lived AWS credentials through OIDC.

## Contact acceptance

- A contact submission is accepted when DynamoDB storage succeeds. HTTP 202
  acknowledges storage, not notification delivery.
- Invalid input returns HTTP 400 without storage or notification.
- Storage failure returns HTTP 503 and skips notification.
- After storage, SNS publication is attempted with a two-second client deadline.
  Publication failure logs `contact.notification_failed` and the submission ID,
  without logging contact details, and still returns HTTP 202.
- Notifications are currently best effort. There is no durable retry queue;
  failed notifications require operational follow-up using the stored submission.
- Submissions are not idempotent yet. A lost HTTP response, Lambda timeout, or
  manual resubmission can still produce duplicate records. The notification
  deadline reduces timeout exposure but does not guarantee a response before
  the Lambda timeout if storage has already consumed most of the time budget.

## Production follow-ups

- Replace the initial `AllowedOrigin=*` with the final HTTPS domain.
- Add durable notification retries and idempotent submission handling.
- Add Route 53 and ACM resources when a custom domain is selected.
- Route the CloudWatch alarm to a dedicated operational notification topic.
- Add AWS WAF or CAPTCHA if automated submissions become a problem.
