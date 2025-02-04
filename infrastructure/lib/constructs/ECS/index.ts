import * as ecs from 'aws-cdk-lib/aws-ecs';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { InstanceType, IVpc, Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  Protocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { resolve } from 'path';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

import * as ec2 from 'aws-cdk-lib/aws-ec2';  // Add this import if missing


interface Props {
  vpcId: string;
}

export class ECS extends Construct {
  public readonly cluster: ecs.Cluster;

  public readonly task_definition: ecs.Ec2TaskDefinition;

  public readonly container: ecs.ContainerDefinition;

  public readonly service: ecs.Ec2Service;

  public readonly load_balancer: ApplicationLoadBalancer;

  public readonly listener: ApplicationListener;

  public readonly log_group: LogGroup;

  public readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    // Use an existing VPC
    this.vpc = Vpc.fromLookup(scope, `Resilience-ExistingVPC`, {
      vpcId: props.vpcId,
    });

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
      { vpc: this.vpc },
    );

    this.cluster.addCapacity('Resilience-DefaultAutoScalingGroup', {
      instanceType: new InstanceType('t2.micro'),
      desiredCapacity: 2,  // Ensure at least 2 instances
      minCapacity: 1,
      maxCapacity: 5,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,  // Automatically select all public subnets across AZs
      },
    });
    
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

    this.service = new ecs.Ec2Service(this, `Resilience-Service`, {
      cluster: this.cluster,
      taskDefinition: this.task_definition,
      desiredCount: 2,  // Ensure at least 2 running tasks across AZs
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances(),  // Spread tasks across instances in different AZs
      ],
    });
    
    

    this.load_balancer = new ApplicationLoadBalancer(scope, `Resilience-LB`, {
      vpc: this.vpc,
      internetFacing: true,
      loadBalancerName: `resilience-lb`,
    });
    
    this.listener = this.load_balancer.addListener(`Resilience-PublicListener`, {
      port: 80,  // Ensure it listens only on port 80
      open: true, // Allow incoming traffic
    });
    
    this.listener.addTargets(`Resilience-ECS`, {
      protocol: ApplicationProtocol.HTTP,
      targets: [this.service],
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