from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elb,
    aws_ecs as ecs,
    aws_ecr_assets as ecr_assets,
    aws_ecs_patterns as ecsp,
    aws_ssm as ssm,
    aws_certificatemanager as acm,
    aws_wafv2 as waf,
    aws_elasticache as elasticache,
)
import aws_cdk as cdk
from os import path
from constructs import Construct

class TimerAppStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, 
                 is_lab: bool = True, app_port: int = 9001, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        self.is_lab = is_lab
        self.app_port = app_port
        self.target_group_name = "TimerTargetGroup"
        vpc_name = "lab-vpc" if self.is_lab else "prod-vpc"
        self.vpc = ec2.Vpc.from_lookup(self, "vpc", region="us-east-1", vpc_name=vpc_name)
        self.vpce2 = ec2.Vpc.from_lookup(self, "vpce2", region="us-east-2", vpc_name=vpc_name)
        self.ssm_prefix = f"/timer_app/{'lab' if self.is_lab else 'prod'}/"
        self.public_url = ssm.StringParameter.from_string_parameter_name(self, "public_url", 
            f"{self.ssm_prefix}public_url")
        
        #TLS Cert
        self.cert = acm.Certificate.from_certificate_arn(self, "TimerCert", 
            "placeholder" if self.is_lab \
                else "placeholder")

        #TODO: I'd prefer to not have to hardcode subnet IDs in IaC. Make it dynamic with boto3
        #Public Subnets
        self.public_subnet1_id = "subnet-redacted" if self.is_lab else "placeholder"
        self.public_subnet2_id = "subnet-redacted" if self.is_lab else "placeholder"

        #Private Subnets
        self.private_subnet1_id = "subnet-redacted" if self.is_lab else "placeholder"
        self.private_subnet2_id = "subnet-redacted" if self.is_lab else "placeholder"

        self.public_subnet_list = [subnet for subnet in [*self.vpc.private_subnets, *self.vpc.public_subnets, *self.vpc.isolated_subnets]
                                 if subnet.subnet_id in [self.public_subnet1_id, self.public_subnet2_id]]
        self.private_subnet_list = [subnet for subnet in [*self.vpc.private_subnets, *self.vpc.public_subnets, *self.vpc.isolated_subnets]
                                 if subnet.subnet_id in [self.private_subnet1_id, self.private_subnet2_id]]
        if len(self.public_subnet_list) <= 0 or len(self.private_subnet_list) <= 0:
            raise Exception("No selected public or private subnets!")
        self.public_subnet_selection = ec2.SubnetSelection(subnets=self.public_subnet_list)
        self.private_subnet_selection = ec2.SubnetSelection(subnets=self.private_subnet_list)

        wacl_id = "redacted-arn" \
            if self.is_lab else "placeholder"
        timer_app_dir = path.join(path.curdir, "..", "timer_app")
        self.asset = ecr_assets.DockerImageAsset(self, "TimerImage", 
                                                 directory=timer_app_dir)
        
        self.svc = ecsp.ApplicationLoadBalancedFargateService(self, "TimerAlbFgSvc", 
            assign_public_ip=False,
            task_subnets=self.private_subnet_selection,
            desired_count=1,
            min_healthy_percent=0,
            certificate=self.cert,
            enable_ecs_managed_tags=True,
            enable_execute_command=self.is_lab,
            listener_port=443,
            open_listener=True,
            protocol=elb.ApplicationProtocol.HTTPS,
            public_load_balancer=True,
            target_protocol=elb.ApplicationProtocol.HTTP,
            vpc=self.vpc,
            cpu=4096,
            memory_limit_mib=8192,
            platform_version=ecs.FargatePlatformVersion.LATEST,
            runtime_platform=ecs.RuntimePlatform(cpu_architecture=ecs.CpuArchitecture.ARM64,
                                                 operating_system_family=ecs.OperatingSystemFamily.LINUX),
            task_image_options=ecsp.ApplicationLoadBalancedTaskImageOptions(
                image=ecs.ContainerImage.from_docker_image_asset(self.asset),
                container_port=self.app_port,
                enable_logging=True
            ))
        
        self.waf_assoc = waf.CfnWebACLAssociation(self, "WafAssoc", 
            resource_arn=self.svc.load_balancer.load_balancer_arn,
            web_acl_arn=wacl_id)        
        self.svc.target_group.configure_health_check(enabled=True,
            healthy_http_codes="200-403",
            path="/healthcheck.txt",
            timeout=cdk.Duration.seconds(120),
            unhealthy_threshold_count=5,
            interval=cdk.Duration.seconds(300))
