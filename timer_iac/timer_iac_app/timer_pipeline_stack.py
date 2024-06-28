from aws_cdk import (
    Stack,
    Stage,
    pipelines as pl,
    aws_codecommit as cc,
    aws_codebuild as cb,
    aws_iam as iam,
    RemovalPolicy,
)
from constructs import Construct
from .timer_app_stack import TimerAppStack

class TimerPipelineStage(Stage):
    def __init__(self, scope: Construct, construct_id: str, is_lab: bool = True, app_port: int = 9001, **kwargs):
        super().__init__(scope, construct_id, **kwargs)
        service = TimerAppStack(self, "TimerApp", is_lab=is_lab, app_port=app_port, **kwargs)

class TimerPipelineStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, is_lab: bool = True, app_port: int = 9001, **kwargs):
        super().__init__(scope, construct_id, **kwargs)
        repo = cc.Repository(self, "TimerRepo", repository_name="timer_app")
        repo.apply_removal_policy(RemovalPolicy.RETAIN)
        source = pl.CodePipelineSource.code_commit(repo, "dev" if is_lab else "master")
        pipeline = pl.CodePipeline(self, "TimerPipeline", pipeline_name="timer_pipeline",
                                   self_mutation=True,
                                   synth=pl.ShellStep(
            "Synth", input=source,
            commands=[
                "n stable",
                "npm install -g npm@latest",
                "npm install -g aws-cdk",
                "cd timer_iac",
                "python -m pip install -r requirements.txt",
                "cdk synth"
            ],
            primary_output_directory="timer_iac/cdk.out"
        ),
        code_build_defaults=pl.CodeBuildOptions(
            build_environment=cb.BuildEnvironment(privileged=True, build_image=cb.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0),
            role_policy=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["*"], #TODO: Make more specific - this is just to keep it from erroring during testing
                    resources=["*"]
                )
            ]
        ))

        deploy = TimerPipelineStage(self, "Deploy", is_lab, app_port, **kwargs)
        if is_lab:
            deploy_stage = pipeline.add_stage(deploy)
        else:
            deploy_stage = pipeline.add_stage(deploy,
                                              pre=[pl.ManualApprovalStep("PromoteToProd")])
        
