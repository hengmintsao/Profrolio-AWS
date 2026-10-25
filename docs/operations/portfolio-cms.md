# Portfolio CMS operations

## Status and ownership

`infrastructure/cms-template.yaml` proposes a separate CMS stack. It does not
modify the existing `portfolio-aws` website stack, contact endpoint, CloudFront,
DNS or production deployment workflow. No new cloud resources have been created.
The primary ran cfn-lint 1.58.0 successfully on both templates. This is static
evidence; SAM/container builds, IAM execution and live integration remain untested.

## Runtime configuration

Map these public stack outputs to `window.PORTFOLIO_CONFIG` in `web/public/config.js`
before a separately authorized production build/deployment:

| Configuration key | Source |
| --- | --- |
| `apiBase` | `ApiBaseUrl` |
| `authDomain` | `AuthDomain`, including HTTPS |
| `clientId` | `CognitoClientId` |
| `redirectUri` | `RedirectUri` |
| `contactUrl` | Existing website stack `ApiEndpoint` |
| `localDevelopment` | `false` in production |

No AWS credentials, passwords, client secrets or tokens belong in these files.
`TableName`, `MediaBucketName`, `CognitoIssuer` and `CognitoUserPoolId` are operator
identifiers. Lambda uses `CMS_TABLE_NAME`, `CMS_MEDIA_BUCKET`, `COGNITO_CLIENT_ID`
and `ALLOWED_ORIGIN`. Keep contact configuration and data ownership separate.

## Release prerequisites

1. Obtain authorization for the reviewed PR scope, then independently authorize
   merge/deployment as applicable. Existing production automation is not a CMS release.
2. Pass backend, web, HTTP integration, cfn-lint and `sam validate --lint` checks.
3. Build with `sam build --use-container --build-dir .aws-sam-cms/build --template-file infrastructure/cms-template.yaml`.
   Inspect Linux ARM64 `sharp` binaries; a successful Windows host test cannot
   establish Lambda compatibility. A separate build directory preserves old artifacts.
4. Review the generated change set, exact account/region, stack name and narrowly
   scoped deployment IAM changes. Do not reuse a production stack name accidentally.
5. Exercise actual DynamoDB transactions/index visibility and S3 signed PUT/GET,
   image decoding, oversized payloads and unavailable dependencies in isolation.
6. Validate real Cognito tokens, missing/expired tokens, wrong audience/group,
   owner isolation, MFA and recovery. API Gateway checks JWT signatures/claims;
   Lambda additionally checks access-token type, client, group and object ownership.
   Do not grant public direct Lambda invocation or create a function URL.

## Owner enrollment and recovery

The template creates the `portfolio-admin` group, but no user. After authorized
deployment an AWS operator creates the owner using a controlled email address,
adds the account to that group, and has the owner replace the temporary password
and enroll a TOTP authenticator. No public sign-up or client secret is enabled.
The browser uses authorization code PKCE S256 and state verification. Tokens are
memory-only; reloading may require sign-in. The Cognito logout endpoint clears
the hosted login session; already issued access tokens expire independently.

Recovery is administrator-managed. Document an authorized lost-authenticator
recovery procedure and test it with a disposable account before production use.
Do not work around recovery by disabling MFA or adding a shared emergency password.

## Media and retention

The separate media bucket blocks public access, encrypts objects and retains
versions. Upload grants last 120 seconds and target only `incoming/` objects.
Completion checks actual size, MIME/signature consistency, image decoding and
pixel limits, then conditionally writes immutable verified bytes. Only verified
objects are served. The SDK upload presigner avoids signing an empty CRC32 for a
later browser payload; this has an offline regression check, not a live S3 check.

Public image delivery checks the current published snapshot before signing a
60-second GET. Unpublishing denies newly initiated origin requests, but cannot
recall a previously issued signed URL or downloaded file. Draft media requires
owner authorization. Original raster bytes may retain EXIF/GPS metadata; metadata
stripping is not implemented. Avoid uploading sensitive metadata.

There is no permanent-delete endpoint, orphan cleanup or purge lifecycle. Do not
add cleanup without an explicit retention decision. Media must never enter the
website artifact bucket or its `aws s3 sync --delete` ownership scope.

## Frontend cutover and recovery

The current deployment still publishes legacy `frontend/`. Before switching:

1. Review `web/dist`, production config and compatible rollback artifact together.
2. Configure explicit CloudFront route rewriting for application routes, including
   `/admin/callback`, `/admin/login` and project details. Preserve canonical-host
   redirect/query behavior; do not rewrite missing assets or API errors to HTML.
3. Inspect CSP using exact CMS/token origins and signed S3 image origins. Permit
   only necessary `connect-src`/`img-src` origins; no arbitrary script origins or
   unsafe HTML. Fonts are system fonts, with no external font request required.
4. Keep the existing contact API/CORS functional. Verify navigation, direct links,
   callback/logout, images, mobile/keyboard behavior and missing-asset responses.
5. Use isolated content to verify create/save/private preview/publish/unpublish,
   revision conflicts, trash/restore and failed-request recovery.
6. Release and invalidate caches only after authorization. Restore the previous
   frontend artifact and matching config if rollback is authorized. Do not delete
   the CMS stack/data as a recovery technique.

The public detail path uses strongly consistent reads. Discovery uses a GSI and
has eventual visibility without an AWS guaranteed time bound. Stale index rows
are reread before returning content; this prevents trashed content resurrection.

## Cost and deployment effects

On-demand DynamoDB, PITR, S3 historical versions, Lambda/API requests, Cognito,
logs and transfer all contribute costs. Logs retain 30 days; durable resources
are retained. Retention can continue to incur charges after stack operations.
No spending cap, cleanup or automatic budget is configured. Earlier planning
estimates are not measured bills or guaranteed prices. Review current regional
pricing and actual usage before release; no charges were created by this task.

The shared backend package now includes CMS dependencies. The existing contact
handler does not import CMS/native image modules, but its packaging footprint
can increase. Validate both functions' artifacts in CI before deployment.

## Official documentation checked by the primary

The cloud role supplied a proposal without successful direct tool reads. The
primary fetched the following references and checked JWT audience/expiry behavior,
PKCE, Cognito MFA properties and container build options. This is not live IAM
or application acceptance evidence.

- [API Gateway JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Cognito UserPool properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html)
- [Cognito PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html)
- [SAM build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html)
- [SDK S3 checksums](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html)
