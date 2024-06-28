# Shared Timer Design Notes

The Shared Timer project is an AWS Cloud-Native deployment of Cisco's "WebEx Shared Timer" by the Cisco GVE DevNet Team.

Major features include:
- CI/CD pipeline based on CDK Pipelines (leveraging high level CDK constructs for CodeCommit/CodeBuild/CodePipeline)
- App deployment IaC defined in CDK using high level CDK constructs for building an ECS Fargate app with an ALB

The following changes have been made to the original WebEx Shared Timer code for technical reasons:
- Timer App customizations to support ALB Health Check behavior - this was required to make the CDK-based deployment of the ECS cluster succeed.
- Rewrote server side into JavaScript app based on Bun
- Upgraded Dockerfile to use AL2023 and Bun, and to pull from AWS ECR instead of DockerHub.
- Using the latest Cisco WebEx Embedded SDK.

Also responded to various user requests with enhancements:
- Make the alarm softer
- Yellow background at 5 minutes left and red background at 2 minutes left
- Implement hours in addition to minutes/seconds
- Let the timer run into the negative
- Add buttons for +15, +20 and +60 minutes
- Implement a PIN functionality for the lock
- UI controls are able to be hidden to make the window smaller


## Development Process

1. First I created the CI/CD stack using CDK Pipelines, which maintains itself and updates the app CDK stack as needed.
2. Then I created the app stack and integrated it with the CI/CD stack so the CI/CD deploys it.
3. Along the way I updated/enhanced the Timer App with the above changes.
4. I had to iterate numerous times on the app stack CDK code to get it right. Especially the ALB Health Check was difficult to diagnose and then solve.
5. Spent a lot of time writing/fixing app code to make it simpler, more performant, fewer dependencies and adding user requested features.

