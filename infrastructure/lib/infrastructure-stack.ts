import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ECS } from './constructs/ECS';

export class InfrastructureStack extends Stack {
  public readonly ecs: ECS;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.ecs = new ECS(this, `ECS`, {
      vpcId: 'vpc-03fc766798ef404e1',
    });
  }
}