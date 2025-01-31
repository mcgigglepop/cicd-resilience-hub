#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from 'dotenv';
import { InfrastructurePipelineStack } from '../lib/infrastructure-pipeline-stack';
import { InfrastructureStack } from '../lib/infrastructure-stack';

config({ path: process.env.DOTENV_CONFIG_PATH });

const app = new cdk.App();

if (['ONLY_STACK'].includes(process.env.CDK_MODE || '')) {
  new InfrastructureStack(app, `ResilienceInfrastructureStack`, {
    env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT },
  });
}

if (['ONLY_PIPELINE'].includes(process.env.CDK_MODE || '')) {
  new InfrastructurePipelineStack(app, 'ResiliencePipelineStack', {
    env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT },
  });
}