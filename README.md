# Gather — serverless event planner

Gather is an event planning website that keeps events and their checklists in one place. You can create an event, add tasks, mark them complete and see your progress. In the live version, events and tasks are stored in AWS, so they remain available when you refresh or open the app in another browser.

**[Try the live website](https://d15225beqmqes.cloudfront.net)**

## Why I built it

I created Gather to gain practical experience with AWS by deploying a complete website and connecting it to a serverless backend. With AI assistance, I developed the project, deployed its infrastructure using AWS SAM and tested that event and task changes persisted across browsers. The project helped me explore how a frontend, API, serverless function and cloud database work together.

## Features

- Create an event with a name, date and optional location.
- Add tasks to each event and mark them as complete.
- See checklist progress update as tasks are completed.
- Access the same saved events and tasks across browsers in the AWS-hosted version.
- Try a local browser demo without an AWS account.

The live site is a shared demo with no sign-in. Anyone with its link can view and edit its events and tasks, so please use sample information only.

## Try the browser demo

Open `frontend/index.html` in a modern browser. The sample event is illustrative; edits are saved in that browser's local storage. This mode does not use AWS and does not synchronise between devices. Clear the browser's site data to reset it.

## Architecture

```text
Browser ── HTTPS ── CloudFront ── private S3 bucket (website files)
   │
   └── HTTPS ── API Gateway HTTP API ── Lambda (Python) ── DynamoDB
```

The project uses:

- **Amazon S3** to store the website files in a bucket that blocks direct public access.
- **Amazon CloudFront** to serve the website over HTTPS, using origin access control to read from S3.
- **Amazon API Gateway** to expose HTTP endpoints for events and tasks.
- **AWS Lambda** to run the Python backend and handle requests.
- **Amazon DynamoDB** to store events and checklist tasks.
- **AWS SAM and CloudFormation** to define and deploy the infrastructure.

API Gateway throttling limits requests, and the function role is scoped to the table. The website is an educational demo rather than a production-ready multi-user application; throttling is not authentication and does not guarantee a cost ceiling.

The list shows up to 50 events; an event shows up to 100 tasks. The API validates input lengths and dates, and uses conditional updates so a missing task is not accidentally created. Items are saved in DynamoDB, so separate browsers see the same deployed data.

## Deploy to AWS

Prerequisites: an AWS account with appropriate IAM permissions, [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), and credentials configured through an appropriate sign-in method. Review the current AWS pricing and free-tier eligibility before deployment; usage can incur charges. Set a billing budget and review account access before deploying. Never commit credentials or tokens.

From the project directory:

1. Build and deploy the stack. Pick a unique stack name and your preferred region, and accept creation of the IAM role when prompted:

   ```sh
   sam build
   sam deploy --guided
   ```

2. In AWS CloudFormation, open the stack's **Outputs**. Copy `ApiUrl`, `SiteBucketName`, `DistributionId` and `WebsiteUrl`.
3. Edit `frontend/config.js`, inserting the HTTPS `ApiUrl` between the quotes. Do not include credentials. This URL is public configuration. Keep the file as the empty-string version in Git unless you deliberately want to publish your API URL.
4. Upload the frontend, replacing the placeholder with your `SiteBucketName`:

   ```sh
   aws s3 sync frontend/ s3://YOUR-BUCKET-NAME/
   ```

5. Wait for CloudFront deployment, then visit `WebsiteUrl`. Create a test event and task, reload in another browser, and check the task persists. This is the end-to-end verification that the AWS-backed mode works. For subsequent frontend updates, sync again and invalidate the cache:

   ```sh
   aws cloudfront create-invalidation --distribution-id YOUR-DISTRIBUTION-ID --paths '/*'
   ```

If the page remains in browser demo mode, confirm that the uploaded `config.js` contains the correct API URL and invalidate CloudFront's cache. If requests fail, check CloudFormation outputs and Lambda logs; do not put credentials in the page.

## Test the API locally

Run `python3 -m unittest discover -s tests -v` from this directory. The tests use an in-memory fake DynamoDB and do not require AWS credentials. They do not replace a live AWS deployment test.

## Clean up

Empty the website S3 bucket, then delete the stack through CloudFormation or with `sam delete`. Deleting the stack deletes the DynamoDB table and its events and tasks. Check the console afterward for any retained resources and charges.
