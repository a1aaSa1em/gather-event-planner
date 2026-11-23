# Gather — an AWS learning project

Gather is a serverless event planning website that brings events and their checklists together. I created it as a personal project to experiment with AWS and gain practical experience of how cloud services connect to support a working web application.

**[Visit Gather](https://d15225beqmqes.cloudfront.net/)**

## The idea

I wanted to go beyond reading about cloud computing and explore what it takes to host and operate an application on AWS. An event planner gave me a practical way to work with a frontend, an API, a database, authentication and monitoring as parts of the same project.

With AI assistance, I developed Gather, deployed its infrastructure through AWS SAM and explored the AWS console while testing the application. The project is an ongoing learning exercise and a demonstration of my experience with AWS services.

## What the website does

Gather provides a workspace for organising events and the tasks associated with them. Users can:

- Create an account and sign in to their workspace.
- Create events with details such as a name, date, category and location.
- Add checklist tasks, set optional deadlines and mark tasks as complete.
- View event progress, upcoming events and overdue tasks.
- Return to saved events and tasks after refreshing the website.

## How it works

```text
                         Amazon Cognito
                         (user sign-in)
                               │
Browser ── HTTPS ── CloudFront ── S3 (website files)
   │
   └── HTTPS ── API Gateway ── Lambda (Python) ── DynamoDB
                     │
                 CloudWatch
              (error monitoring)
```

The browser loads the website through CloudFront. After signing in with Cognito, the frontend sends requests to API Gateway, which checks the user's token before passing requests to a Lambda function. The function handles events and tasks and stores data in DynamoDB. CloudWatch monitors the API for server errors.

## AWS services explored

- **Amazon S3:** stores the frontend files in a private bucket.
- **Amazon CloudFront:** delivers the website over HTTPS and accesses the files in S3.
- **Amazon Cognito:** manages user accounts and sign-in.
- **Amazon API Gateway:** provides the API endpoints used by the frontend and validates access tokens.
- **AWS Lambda:** runs the Python backend that handles event and task requests.
- **Amazon DynamoDB:** stores events and tasks, organised by user.
- **Amazon CloudWatch:** monitors API Gateway server errors using an alarm. The alarm is visible in the CloudWatch console; email notifications have not been configured for it.
- **AWS SAM and AWS CloudFormation:** define and deploy the application's cloud infrastructure.
- **AWS Identity and Access Management (IAM):** controls the permissions used by the application's AWS resources.
- **AWS Budgets:** provides a separate account-level cost alert, helping me explore cloud cost monitoring. Budget alerts do not automatically stop spending.

## What I explored and tested

Deploying Gather helped me understand how a static website can communicate with a serverless backend, how authentication fits into an API, and how application data can persist in a cloud database. I also explored infrastructure as code, AWS permissions, monitoring and cost awareness.

I tested the deployed application by creating an event and checklist task, refreshing the page and checking that the data remained available. I also checked that signing out hid the workspace, that a second account did not display the first account's events, and that an unauthenticated API request returned a `401` response.

Gather is a learning project rather than a production service. These checks are useful demonstrations of its behaviour, but they are not a comprehensive security assessment, so please use sample information.
