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

The live site is a shared demo with no sign-in. Anyone with its link can view and edit its events and tasks, so please use sample information only.

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
