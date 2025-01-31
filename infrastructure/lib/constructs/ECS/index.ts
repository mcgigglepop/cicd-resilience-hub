import * as ecs from 'aws-cdk-lib/aws-ecs';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { InstanceType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  Protocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { resolve } from 'path';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';


interface Props {
  vpc: Vpc;
  serviceName: string;
  region: string;
}

export class ECS extends Construct {
  public readonly cluster: ecs.Cluster;

  public readonly task_definition: ecs.Ec2TaskDefinition;

  public readonly container: ecs.ContainerDefinition;

  public readonly service: ecs.Ec2Service;

  public readonly load_balancer: ApplicationLoadBalancer;

  public readonly listener: ApplicationListener;

  public readonly log_group: LogGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.log_group = new LogGroup(
      scope,
      `Resilience-ECSLogGroup`,
      {
        logGroupName: `resilience-ecs-logs`,
        retention: RetentionDays.ONE_DAY,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );

    this.cluster = new ecs.Cluster(
      scope,
      `resilience-EcsCluster`,
      { vpc: props.vpc },
    );

    this.cluster.addCapacity(
      `Resilience-DefaultAutoScalingGroup`,
      {
        instanceType: new InstanceType('t2.micro'),
      },
    );

    this.task_definition = new ecs.Ec2TaskDefinition(
      scope,
      `Resilience-TaskDefinition`,
    );

    this.container = this.task_definition.addContainer(
      `Resilience-Express`,
      {
        image: ecs.ContainerImage.fromAsset(
          resolve(__dirname, '..', '..', '..', '..', 'server'),
        ),
        memoryLimitMiB: 256,
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: `resilience-infrastructure`,
          logGroup: this.log_group,
        }),
      },
    );

    this.container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    this.service = new ecs.Ec2Service(
      scope,
      `Resilience-Service`,
      {
        cluster: this.cluster,
        taskDefinition: this.task_definition,
      },
    );

    this.load_balancer = new ApplicationLoadBalancer(scope, `Resilience-LB`, {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: `resilience-lb`,
    });
    
    this.listener = this.load_balancer.addListener(`Resilience-PublicListener`, {
      port: 80,  // Ensure it listens only on port 80
      open: true, // Allow incoming traffic
    });
    

    this.listener.addTargets(`Resilience-ECS`, {
      protocol: ApplicationProtocol.HTTP,
      targets: [
        this.service.loadBalancerTarget({
          containerName: `Resilience-Express`,
          containerPort: 80,
        }),
      ],
      healthCheck: {
        protocol: Protocol.HTTP,
        path: '/health',
        timeout: Duration.seconds(10),
        unhealthyThresholdCount: 5,
        healthyThresholdCount: 5,
        interval: Duration.seconds(60),
      },
    });

    new CfnOutput(scope, 'BackendURL', {
      value: this.load_balancer.loadBalancerDnsName,
    });
  }
}