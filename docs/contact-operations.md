# Contact operations

## Deployment prerequisite

Create an AWS IAM role for GitHub OIDC with the permissions required to deploy
this SAM application and publish its frontend. Its trust should restrict
`token.actions.githubusercontent.com:aud` to `sts.amazonaws.com` and `sub` to
`repo:hengmintsao/Profrolio-AWS:environment:production`.
Store its ARN as the GitHub `AWS_ROLE_ARN` secret (repository or production
environment). Set `AWS_REGION`, `SAM_STACK_NAME`, `ALLOWED_ORIGIN` and optional
`NOTIFICATION_EMAIL` as described in README.md. Never commit AWS credentials.

## Verify after deployment

1. Read the stack's `WebsiteUrl` and `ApiEndpoint` outputs.
2. Open the website over HTTPS; verify its images, styles and runtime config.
3. Submit a clearly identified test message with a unique UUID v4
   `Idempotency-Key`. Expect 202 and the same ID in the response.
4. Repeat the request with the same key and input. Expect 202 and one DynamoDB
   record. Reuse the key with different input and expect 409.
5. Verify the record transitions from `pending` to `sent`. Confirm the SNS email
   subscription and check for the test notification. `sent` means SNS accepted
   publication; it does not establish email delivery.
6. Check the notification worker logs and the notification failure queue alarm.

## Recover an exhausted notification

The SQS stream failure destination contains invocation metadata, not the original
contact payload. Keep the failed message until recovery is verified. Worker logs
record `contact.notification_failed` with the submission ID but no contact details.

1. Resolve the SNS, KMS or DynamoDB error before replaying.
2. Use worker logs to identify the submission ID. If necessary, scan the contact
   table for `notificationStatus=pending`; scans incur read cost.
3. Read the retained contact. If it is already `sent`, skip replay. If it expired
   or was deleted, the original payload may no longer be recoverable.
4. Invoke the notification Lambda with a synthetic stream event for that ID:

   ```json
   {
     "Records": [{
       "eventName": "INSERT",
       "dynamodb": {
         "Keys": {"id": {"S": "<submission UUID>"}},
         "SequenceNumber": "1"
       }
     }]
   }
   ```

5. Inspect the invocation result: `batchItemFailures` must be empty, and the
   contact must be marked `sent`. Direct invocations do not automatically retry
   partial batch failures. Delete the SQS failure message only after verification.

Automatic stream retries are bounded. Contacts remain retained for 90 days;
stream records expire after 24 hours and failure metadata after 14 days.
Manual replay can duplicate an email if the previous publication succeeded but
the status update failed. Existing pre-migration contacts are not backfilled:
enabling Streams emits new writes, not historical table contents.
