import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ECS } from './constructs/ECS';

export class InfrastructureStack extends Stack {
  public readonly ecs: ECS;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.ecs = new ECS(this, `ECS`, {
      vpcId: 'vpc-015932faad06cf85b',
    });

    // 🔹 Add CloudFormation Output for Stack ARN
    new CfnOutput(this, 'StackArn', {
      value: this.stackId, // This automatically retrieves the Stack ARN
      description: 'ARN of the deployed CloudFormation Stack',
      exportName: `${this.stackName}-StackArn`, // Allows cross-stack references
    });
  }
}
