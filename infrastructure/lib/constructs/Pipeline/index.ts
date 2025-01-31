import { SecretValue, Tags } from 'aws-cdk-lib';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import {
  CodeBuildAction,
  GitHubSourceAction,
  GitHubTrigger,
  StepFunctionInvokeAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import {
  BuildSpec,
  ComputeType,
  LinuxBuildImage,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { StateMachine, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { pipelineConfig } from '../../../utils/pipelineConfig';

interface Props {
  environment: string;
}

export class PipelineStack extends Construct {
  readonly deployProject: PipelineProject;
  readonly pipeline: Pipeline;
  
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);
    const {
      deployCommand,
      owner, 
      repo,
      branch,
      tag,
      githubToken,
      dockerhubUsername,
      dockerhubPassword,
    } = pipelineConfig(props.environment);

    const secretToken = new SecretValue(githubToken);
    const outputSource = new Artifact();

    const codeBuildPolicy = new PolicyStatement({
      sid: 'AssumeRole',
      effect: Effect.ALLOW,
      actions: ['sts:AssumeRole', 'iam:PassRole'],
      resources: [
        'arn:aws:iam::*:role/cdk-readOnlyRole',
        'arn:aws:iam::*:role/cdk-hnb659fds-lookup-role-*',
        'arn:aws:iam::*:role/cdk-hnb659fds-deploy-role-*',
        'arn:aws:iam::*:role/cdk-hnb659fds-file-publishing-*',
        'arn:aws:iam::*:role/cdk-hnb659fds-image-publishing-role-*',
      ],
    });

    // Define the deploy project
    this.deployProject = new PipelineProject(
      this,
      `Resilience-PipelineProject-BuildAndDeploy`,
      {
        projectName: `Resilience-PipelineProject-BuildAndDeploy`,
        environment: {
          privileged: true,
          buildImage: LinuxBuildImage.fromCodeBuildImageId(
            'aws/codebuild/amazonlinux2-x86_64-standard:4.0',
          ),
          computeType: ComputeType.MEDIUM,
        },
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '16',
              },
            },
            pre_build: {
              'on-failure': 'ABORT',
              commands: [
                'cd infrastructure',
                'npm install',
              ],
            },
            build: {
              'on-failure': 'ABORT',
              commands: [
                'cd ../infrastructure',
                `echo "${dockerhubPassword}" | docker login --username "${dockerhubUsername}" --password-stdin`,
                `${deployCommand}`,
              ],
            },
            post_build: {
              'on-failure': 'ABORT',
              commands: [
                'export STACK_ARN=$(aws cloudformation describe-stacks --stack-name InfrastructureStack --query "Stacks[0].StackId" --output text)',
                'echo "Exporting Stack ARN: $STACK_ARN"',
              ],
            }
          },
        }),
      },
    );

    // Grant permissions to deploy project
    this.deployProject.addToRolePolicy(codeBuildPolicy);

    // Create pipeline
    this.pipeline = new Pipeline(scope, `Resilience-Pipeline`, {
      pipelineName: `Resilience-Pipeline`,
    });

    // Add source stage
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new GitHubSourceAction({
          actionName: 'Source',
          owner: `${owner}`,
          repo: `${repo}`,
          branch: `${branch}`,
          oauthToken: secretToken,
          output: outputSource,
          trigger: GitHubTrigger.WEBHOOK,
        }),
      ],
    });

    // Add build and deploy stage
    this.pipeline.addStage({
      stageName: 'Build-and-Deploy',
      actions: [
        new CodeBuildAction({
          actionName: 'Build-and-Deploy',
          project: this.deployProject,
          input: outputSource,
        }),
      ],
    });

    // IAM policy for Step Functions execution
    const stepFunctionsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: [
        'arn:aws:states:us-east-1:412791426734:stateMachine:AppAssessement',
      ],
    });

    this.deployProject.addToRolePolicy(stepFunctionsPolicy);

    // Reference the Step Functions state machine
    const resilienceAssessmentStateMachine = StateMachine.fromStateMachineArn(
      this,
      'ResilienceAssessmentStateMachine',
      'arn:aws:states:us-east-1:412791426734:stateMachine:AppAssessement'
    );

    // Add resilience assessment stage
    this.pipeline.addStage({
      stageName: 'Run-Resilience-Assessment',
      actions: [
        new StepFunctionInvokeAction({
          actionName: 'Run-Resilience-Assessment',
          stateMachine: resilienceAssessmentStateMachine,
          executionNamePrefix: 'codepipeline',
          stateMachineInput: {
            input: TaskInput.fromObject({
              StackArn: "arn:aws:cloudformation:us-east-1:412791426734:stack/ResilienceInfrastructureStack/e7dd7160-dfec-11ef-bd71-1274fecdafe9",
              AppArn: "arn:aws:resiliencehub:us-east-1:412791426734:app/e0297334-f5c0-474b-a227-89f8f78230a0"
            }),
          },
        }),
      ],
    });
    

    Tags.of(this).add('Context', `${tag}`);
  }
}
