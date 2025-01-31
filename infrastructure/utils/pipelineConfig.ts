import * as dotenv from 'dotenv';

export const pipelineConfig = (env: string) => {
  const { parsed } = dotenv.config({ path: '.env.production' });

  return {
    deployCommand: 'npm run cdk:prod:build',
    owner: 'mcgigglepop',
    repo: 'cicd-resilience-hub',
    branch: 'main',
    tag: 'infrastructure-production-pipeline',
    githubToken: parsed?.GITHUB_TOKEN,
    dockerhubUsername: parsed?.DOCKERHUB_USERNAME,
    dockerhubPassword: parsed?.DOCKERHUB_PASSWORD,
  };
};