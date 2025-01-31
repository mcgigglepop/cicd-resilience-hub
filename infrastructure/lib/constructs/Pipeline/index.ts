import { SecretValue, Tags } from 'aws-cdk-lib';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import {
  CodeBuildAction,
  GitHubSourceAction,
  GitHubTrigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import {
  BuildSpec,
  ComputeType,
  LinuxBuildImage,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';

import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { pipelineConfig } from '../../../utils/pipelineConfig';

interface Props {
  environment: string;
}

export class PipelineStack extends Construct {
  readonly backEndTestProject: PipelineProject;
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

    // build and deploy backend
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
                // `echo "${dockerhubPassword}" | docker login --username "${dockerhubUsername}" --password-stdin`,
                `${deployCommand}`,
              ],
            },
            post_build: {
              'on-failure': 'ABORT',
              commands: [''],
            },
          },
        }),
      },
    );

    // adding permissions to the codebuild deploy project
    this.deployProject.addToRolePolicy(codeBuildPolicy);

    // new pipeline 
    this.pipeline = new Pipeline(scope, `Resilience-Pipeline`, {
      pipelineName: `Resilience-Pipeline`,
    });

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

    this.pipeline.addStage({
      stageName: 'Build-and-Deploy',
      actions: [
        new CodeBuildAction({
          actionName: 'Build-and-Deploy',
          project: this.deployProject,
          input: outputSource,
          outputs: undefined,
        }),
      ],
    });

    Tags.of(this).add('Context', `${tag}`);
  }
}