#!/usr/bin/env python3
import boto3
from boto3 import session
import aws_cdk as cdk
from timer_iac_app.timer_app_stack import TimerAppStack
from timer_iac_app.timer_pipeline_stack import TimerPipelineStack

lab_acct_id = "redacted"
prod_acct_id = "redacted"
session = session.Session()
reg = session.region_name
acct = boto3.client('sts').get_caller_identity()['Account']
print(f"Deploying to {acct} / {reg}")

app = cdk.App()

TimerPipelineStack(app, "TimerPipelineStack", is_lab = (acct == lab_acct_id), env=cdk.Environment(account=acct, region=reg))

app.synth()
