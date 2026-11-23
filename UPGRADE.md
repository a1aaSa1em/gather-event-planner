# Gather upgrade notes

This is a proposed upgrade. It has local unit tests, but Cognito, CloudFormation, budget notifications, GitHub deployment, and the live app have not been deployed or verified with an AWS account.

## What changes

- Cognito managed sign-in using authorization-code and PKCE, with API Gateway validating access tokens.
- All events and tasks use a DynamoDB partition derived from the authenticated user's token subject. The API does not accept an owner ID from the browser.
- Event categories, optional task deadlines, upcoming-event counts and overdue-task counts.
- Python API tests, JavaScript sign-in and frontend tests, and GitHub Actions CI. The optional frontend deployment workflow uses GitHub OIDC and requires separate AWS setup. It can be triggered manually; automatic deployments on main-branch frontend changes are opt-in.
- A CloudWatch API 5xx alarm. Email alerts are configured only if an address is supplied in the `AlarmEmail` parameter; the SNS subscription email must be confirmed. An AWS budget can be configured separately in the AWS console; a budget alert does not stop spending.

## Existing data and availability

The existing DynamoDB table is kept and old anonymous demo records are not deleted. Those records have no verified owner, so the new private app does not display or import them. Do not assign them to an account without choosing an owner. A user can still see the old public demo until the update is deployed. The existing site may briefly be unavailable during the API and frontend update. Existing links to the site remain the same if CloudFront is not replaced; review the CloudFormation change set before applying.

The stack now retains the table if the stack is deleted or replaced. This protects data but means the retained table must be managed separately and may continue to cost money.

## Local checks

```sh
python3 -m unittest discover -s tests -v
node --test tests/*.test.js
node --check frontend/app.js
node --check frontend/auth.js
```

Tests use fakes and do not substitute for AWS integration or real multi-account testing. Deployment creates billable AWS resources and may consume credits. Review the change set, costs and your account's free-plan limits before proceeding.

## Upgrade manually (account owner)

From the upgraded project directory, with AWS CLI and SAM installed and signed in to the correct account and region:

1. Back up any existing demo data if you want to retain a separate copy. Record the current CloudFormation outputs and a copy of the current frontend. Do not delete the old DynamoDB table.
2. Run `sam build` and create a change set for the existing `gather-event-planner` stack. Include `CAPABILITY_IAM`; if you want API error notifications, supply `AlarmEmail` as a parameter. Review the change set, especially that the existing DynamoDB table, S3 bucket and CloudFront distribution are not being replaced or deleted. Stop if they are.
3. After the stack update finishes, run `python3 scripts/publish_frontend.py --stack-name gather-event-planner --region eu-north-1`. It reads the public API, Cognito and hosting outputs, writes `frontend/config.js`, syncs the frontend to the website bucket and invalidates CloudFront. The config values are public and contain no AWS credentials.
4. Confirm any SNS subscription email. Create two test accounts with different emails; check each user can create an event, cannot see the other's event, and cannot access the other's event through the API. Test sign-out, reload and expired sign-in. Only use non-sensitive test data until this is verified.

## Optional GitHub Actions deployment

CI runs on pushes and pull requests. `deploy-frontend.yml` deploys only the frontend, not the backend or infrastructure. It can be run manually; setting `GATHER_AUTO_DEPLOY` to `true` also enables deployment after main-branch frontend changes. To use it, the account owner must configure GitHub's AWS OIDC provider and deploy `infra/github-deploy-role.yaml` with the provider ARN, exact repository, website bucket and distribution. Its trust policy is limited to the repository's `main` branch, and its permissions are limited to the site's S3 bucket and CloudFront invalidation. Configure repository variables `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `GATHER_SITE_BUCKET`, `GATHER_DISTRIBUTION_ID`, `GATHER_API_URL`, `GATHER_AUTH_DOMAIN`, and `GATHER_CLIENT_ID`. Values except the role ARN and resource identifiers are public app settings, not credentials. Review the role and workflow before enabling it. This path has not been tested against AWS.
