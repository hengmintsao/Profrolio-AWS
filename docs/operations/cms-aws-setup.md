# CMS AWS prerequisites and operator handoff

This is a proposed setup checklist, not evidence that any AWS setting exists.
Do not create resources, attach IAM policies, dispatch a deployment, or cut over
the public site without separate authorization. The delivery change prepares
the workflow; it does not perform these operator steps.

## Targets and separation

The intended target is account `412381749585`, Region `us-east-1`, and public
origin `https://henry-tsao.com`. Verify these against the authenticated identity
and actual stack outputs before execution. Keep the existing website/contact
stack and its retained frontend bucket. Create the CMS in a separate stack;
never substitute a new website stack name to recover a failed update.

The CMS template provisions its own private, encrypted, versioned media bucket,
on-demand DynamoDB table with point-in-time recovery, retained Cognito pool,
Lambda, HTTP API, and 30-day logs. These incur usage and storage charges when
deployed. CMS authentication and content are not established by a successful
CloudFormation deployment alone.

## GitHub production environment

Verify the `production` environment's required reviewer and main-branch policy.
Its OIDC trust must require both audience `sts.amazonaws.com` and subject
`repo:hengmintsao/Profrolio-AWS:environment:production`. Do not change an existing
trust policy or grant a role automatically from this document.

Configure the proposed CMS delivery's `CMS_AWS_ROLE_ARN` environment secret
separately from the legacy `AWS_ROLE_ARN`. The role ARN is an identifier, not an
AWS access key; never add persistent AWS credentials to repository files.

Review these nonsecret variables against the final workflow before dispatch:

| Variable | Intended value or requirement |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `412381749585`; fail closed if identity differs |
| `SAM_STACK_NAME` | Actual existing website/contact stack name |
| `CMS_STACK_NAME` | Distinct, fixed CMS stack name |
| `SAM_ARTIFACT_BUCKET` | Existing private encrypted release-artifact bucket in the target account/Region; distinct from frontend and CMS media buckets |
| `COGNITO_DOMAIN_PREFIX` | Unique, stable hosted-domain prefix; validate availability before first authorized bootstrap |

The release-artifact bucket must block public access, use encryption, and retain
the selected release objects for the recovery window. Enable versioning and
review lifecycle expiry before use. The workflow should use this explicit bucket,
not `--resolve-s3` provisioning. Do not point release uploads at user-media paths.
Exact workflow inputs and version gates are owned by
[`releases.md`](releases.md); this checklist does not override them.

## IAM review matrix

An AWS administrator must review the actual transformed SAM template and change
set, then prepare an approved, scoped policy. This matrix describes required
operation families, not an attachable policy or proof of live least privilege.
Resource names must come from the selected stacks and outputs, not a broad
account-wide wildcard. CloudFormation orchestration needs underlying service
permissions too; its API permissions alone cannot create the CMS.

| Operation | Required actions / resource scope |
| --- | --- |
| Identity check | `sts:GetCallerIdentity` verifies the assumed account; it does not authorize target writes |
| Stack inspection and change sets | `cloudformation:DescribeStacks`, `DescribeStackEvents`, `GetTemplate`, `CreateChangeSet`, `DescribeChangeSet`, `ExecuteChangeSet` on the exact website/CMS stack ARN patterns; change-set and SAM transform ARNs must be included where the operation requires them |
| Packaging and template access | `s3:GetBucketLocation`, `ListBucket` on the artifact bucket; `GetObject`, `PutObject` on the approved release prefix only; no `DeleteObject` or bucket creation |
| Frontend preflight and publication | `s3:GetBucketVersioning`, `ListBucket` on the existing frontend bucket; `GetObject`, `GetObjectVersion`, `PutObject` on approved frontend objects; no synchronization deletion |
| CDN refresh | `cloudfront:GetDistribution`, `GetDistributionConfig`, `CreateInvalidation`, `GetInvalidation` on the existing distribution ARN |
| Website infrastructure update | CloudFront distribution/function/security-header/cache-policy read/update/create operations required by the actual change set; exact existing distribution, canonical function and stack-named policy ARNs; existing S3 bucket policy updates only where the template requires them |
| CMS provisioning through CloudFormation | Necessary DynamoDB table/index/PITR, private S3 bucket/configuration/policy, Lambda/code/permission, HTTP API routes/authorizer/CORS, Cognito pool/client/domain/group, and CloudWatch Logs operations, scoped to the named CMS stack's resources |
| Runtime role provisioning | Only stack-owned Lambda execution-role create/read/update and inline-policy actions required by the change set; `iam:PassRole` restricted to that role with `iam:PassedToService = lambda.amazonaws.com`; never AdministratorAccess |

Some create or list APIs do not support resource-level IAM restriction. Confirm
each action's resource types and condition keys in the official service
authorization reference; use the narrowest supported account/Region, request-tag,
and name conditions. Do not replace a failed scoped permission with `service:*`.
If a separate CloudFormation service role is introduced, it requires its own
reviewed trust and permissions, plus narrowly scoped `iam:PassRole`; it is not
silently configured by the current templates. Missing permissions remain a
predeployment blocker until an administrator approves the exact proposal.

## Required runtime permissions boundary

`RuntimePermissionsBoundaryArn` is a required CMS template parameter with no
default. The delivery workflow derives it from the validated `AWS_ACCOUNT_ID` as
`arn:aws:iam::<account>:policy/PortfolioCmsRuntimeBoundary`; no additional GitHub
variable is needed. Before planning or applying, its managed-policy metadata
must exist in that exact account and report `IsAttachable=true`. A metadata check
does not verify the policy document, its current version, or the effective
permissions of a created role. Review the actual default policy version too.

[`cms-runtime-boundary-policy.json`](../../infrastructure/cms-runtime-boundary-policy.json)
is the reviewed example for account `412381749585`, Region `us-east-1`, stack
`portfolio-cms-prod`. It is an independently administered maximum-permissions
policy, not a grant: runtime access is the intersection with the role's existing
inline policy. The DynamoDB table-name wildcard also covers indexes below those
table ARNs; an explicit ListingIndex ARN would be redundant. Tighten generated
resource IDs after bootstrap through a separately reviewed policy update.

An authorized administrator must create the approved managed policy before the
CMS stack is deployed. This template references the policy; it does not create
or edit it. The GitHub deployment identity may read that exact policy's metadata
with `iam:GetPolicy`, but must not create policy versions, alter/remove the
boundary, or grant itself wider runtime rights. Its `iam:CreateRole` and
`iam:PutRolePolicy` permissions must require the same `iam:PermissionsBoundary`
ARN. `iam:PassRole` stays restricted to the CMS runtime role and Lambda service.
Do not remove the boundary condition to work around an AccessDenied failure.

The example fixes an IAM policy-escalation limit without changing application
permissions, retention, data, MFA, or resource identities. It grants no deployment
rights or permission to delete resources. Provider permission completeness,
CloudFormation forwarding-context compatibility, and automatic-rollback cleanup
remain separate prerequisites; withheld deletion rights can block cleanup and
require an explicitly reviewed recovery plan. No AWS policy or role has been
created merely by adding these source files.

## Bootstrap, owner enrollment, and cutover

1. Verify the annotated release tag, source SHA, green exact-source CI, approved
   artifact and previous known-good frontend recovery material.
2. Authorize the CMS bootstrap separately. Review the change set for unexpected
   replacement/deletion, account/Region, resource retention, and public exposure.
   Keep the public site in `FrontendMode=legacy` during bootstrap.
3. Verify the deployed CMS `ReleaseSourceSha` output matches the selected release
   and collect `ApiBaseUrl`, `AuthDomain`, `CognitoClientId`, `RedirectUri`,
   `CognitoUserPoolId`, `MediaBucketName`, and `TableName`. Outputs do not establish
   that the data plane or owner account works.
4. An authorized human creates the owner user in that pool, verifies the email,
   and adds the user to `portfolio-admin`. Complete the temporary-password flow
   and authenticator TOTP enrollment through Cognito login. Do not put passwords,
   authenticator seeds, recovery details, or tokens in CI, screenshots, or reports.
   Verify a nonmember cannot perform admin requests and an expired token fails.
5. Verify callback `https://henry-tsao.com/admin/callback`, logout
   `https://henry-tsao.com/admin/login`, code flow with PKCE, no client secret,
   mandatory software-token MFA, and disabled public signup. Do not weaken MFA to
   bypass enrollment errors.
6. Verify the existing frontend bucket already has versioning enabled and current
   index/runtime-config objects have non-null version IDs. Planning refuses to
   proceed without these recovery prerequisites; it does not enable versioning
   or invent missing historical backups. Only after separate cutover authorization, publish the reviewed frontend and
   configure the existing website stack with `FrontendMode=cms`, the exact
   `CmsApiOrigin`, `CmsAuthOrigin`, and regional virtual-hosted `CmsMediaOrigin`.
   All three origins must be nonempty AWS HTTPS origins; no wildcard CSP/CORS.
   The frontend remains private behind the existing CloudFront distribution.
7. This initial delivery sets published files, HTML and runtime configuration to
   `Cache-Control: no-store`; immutable caching is a future optimization. The CMS cache
   policy has minimum/default TTL zero so origin no-store is respected. Preserve
   older content-addressed assets during publication. Invalidate both SPA paths
   and rewritten `/index.html`, or `/*`, then wait for completion.
8. Observe primary/www redirect with query preservation, callback/deep links,
   missing assets remaining errors, real owner login/MFA, draft privacy, image
   upload/verification, publish/unpublish/restore, and contact storage/notification.
   Use only explicitly authorized test content; do not delete real user data.

## Recovery boundaries

The named CMS cache policy is created by the updated website template even in
legacy mode and remains present across mode changes. Legacy mode still selects
its existing managed cache policy. Keeping the unused CMS policy avoids a
resource-removal change during an authorized restore to legacy mode; do not
delete it as part of recovery.

CloudFormation rollback does not restore published S3 objects or invalidate
CloudFront. Preserve previous index/runtime-config bytes and their version IDs,
release manifest, exact infrastructure parameters, and compatible asset versions.
Switching routing back to legacy also needs an authorized website-stack update
and restoration of the legacy frontend/configuration. Retain the CMS table,
media, user pool and backups; frontend rollback is not permission to delete them.
If a change set replaces retained resources, stop and obtain a migration/recovery
decision instead of executing it. Real change sets and live recovery remain
unverified until an authorized AWS run occurs.

## Primary AWS references

- [SAM packaging and explicit artifact buckets](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-package.html)
- [CloudFront cache-policy TTL behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html)
- [CloudFront Function request URI and query structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
- [CloudFront invalidation after URI rewriting](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/invalidation-specifying-objects.html)
- [Cognito TOTP enrollment](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html)
- [AWS service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/)
