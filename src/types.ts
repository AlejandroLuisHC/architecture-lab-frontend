export type S3Bucket = { id: string; type: 's3Bucket'; name: string; blockPublicAccess: boolean };
export type CloudFrontDistribution = { id: string; type: 'cloudFrontDistribution'; name: string; originBucketId: string; enabled: boolean; originAccessControl: boolean };
export type LambdaFunction = { id: string; type: 'lambdaFunction'; name: string };
export type ApiRoute = { id: string; type: 'apiRoute'; name: string; path: string; method: 'GET' | 'POST' | 'ANY'; lambdaId: string };
export type DynamoTable = { id: string; type: 'dynamoTable'; name: string; partitionKey: string };
export type IamPolicy = { id: string; type: 'iamPolicy'; name: string; lambdaId: string; tableId: string; accessLevel: 'none' | 'read' | 'read-write' | 'admin' };
export type CloudWatchLogGroup = { id: string; type: 'cloudWatchLogGroup'; name: string; lambdaId: string; retentionDays: number };
export type CloudWatchAlarm = { id: string; type: 'cloudWatchAlarm'; name: string; lambdaId: string; metric: 'Errors' | 'Invocations' };
export type LabResource = S3Bucket | CloudFrontDistribution | LambdaFunction | ApiRoute | DynamoTable | IamPolicy | CloudWatchLogGroup | CloudWatchAlarm;

export type LabConfiguration = { resources: LabResource[] };

export type LabStep = {
  id: 'delivery' | 'api' | 'data' | 'observe';
  number: string;
  title: string;
  services: readonly string[];
  goal: string;
  concept: string;
  instructions: readonly string[];
};

export type LabService = { id: string; name: string; stepIndex: number | null };
export type Lab = {
  id: string;
  version: number;
  title: string;
  description: string;
  duration: string;
  level: string;
  initialConfiguration: LabConfiguration;
  serviceCatalog: Array<{ category: string; services: LabService[] }>;
  steps: LabStep[];
};

export type Check = { id: string; label: string; passed: boolean; hint: string };
export type StepEvaluation = { stepId: LabStep['id']; passed: boolean; checks: Check[] };
export type Evaluation = {
  steps: StepEvaluation[];
  complete: boolean;
  passedChecks: number;
  totalChecks: number;
};

export type Progress = {
  version: number;
  configuration: LabConfiguration;
  currentStep: number;
  unlockedThroughStep: number;
  updatedAt: string;
  completedAt: string | null;
};
