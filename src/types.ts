export type LabConfiguration = {
  storage: {
    bucketName: string;
    blockPublicAccess: boolean;
    cloudFrontEnabled: boolean;
    originAccessControl: boolean;
  };
  api: { route: string; method: 'GET' | 'POST' | 'ANY'; lambdaConnected: boolean };
  data: {
    tableName: string;
    partitionKey: string;
    lambdaTableConnected: boolean;
    permissions: 'none' | 'read' | 'read-write' | 'admin';
  };
  observability: { logsEnabled: boolean; retentionDays: number; errorAlarmEnabled: boolean };
};

export type LabStep = {
  id: 'delivery' | 'api' | 'data' | 'observe';
  number: string;
  title: string;
  services: readonly string[];
  goal: string;
  concept: string;
  instructions: readonly string[];
};

export type Lab = {
  id: string;
  version: number;
  title: string;
  description: string;
  duration: string;
  level: string;
  initialConfiguration: LabConfiguration;
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
  updatedAt: string;
  completedAt: string | null;
};
