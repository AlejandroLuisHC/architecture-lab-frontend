export type S3Bucket = { id: string; type: 's3Bucket'; name: string; blockPublicAccess: boolean };
export type CloudFrontDistribution = {
    id: string;
    type: 'cloudFrontDistribution';
    name: string;
    originBucketId: string;
    enabled: boolean;
    originAccessControl: boolean;
};
export type LambdaFunction = {
    id: string;
    type: 'lambdaFunction';
    name: string;
    runtime?: string;
    memoryMiB?: number;
    timeoutSeconds?: number;
};
export type ApiRoute = {
    id: string;
    type: 'apiRoute';
    name: string;
    path: string;
    method: 'GET' | 'POST' | 'ANY';
    lambdaId: string;
};
export type DynamoTable = { id: string; type: 'dynamoTable'; name: string; partitionKey: string };
export type IamPolicy = {
    id: string;
    type: 'iamPolicy';
    name: string;
    lambdaId: string;
    tableId: string;
    accessLevel: 'none' | 'read' | 'read-write' | 'admin';
};
export type CloudWatchLogGroup = {
    id: string;
    type: 'cloudWatchLogGroup';
    name: string;
    lambdaId: string;
    retentionDays: number;
};
export type CloudWatchAlarm = {
    id: string;
    type: 'cloudWatchAlarm';
    name: string;
    lambdaId: string;
    metric: 'Errors' | 'Invocations';
};
export type AwsService =
    | 'ec2'
    | 'ecs'
    | 'efs'
    | 'aurora'
    | 'vpc'
    | 'loadBalancer'
    | 'route53'
    | 'kms'
    | 'secretsManager'
    | 'cloudTrail'
    | 's3'
    | 'cloudfront'
    | 'apiGateway'
    | 'dynamodb'
    | 'iam'
    | 'cloudwatch'
    | 'cloudwatchAlarm'
    | 'lambda';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type AwsResource = {
    id: string;
    type: 'awsResource';
    schemaVersion: 1;
    service: AwsService;
    name: string;
    settings: Record<string, JsonValue>;
    logicalId?: string;
    resourceType?: string;
};
export type LabResource =
    | S3Bucket
    | CloudFrontDistribution
    | LambdaFunction
    | ApiRoute
    | DynamoTable
    | IamPolicy
    | CloudWatchLogGroup
    | CloudWatchAlarm
    | AwsResource;

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

export type WorkloadAssumptions = {
    requestsPerMonth: number;
    averageDurationMs: number;
    storageGb: number;
    availabilityTarget: number;
};
export type ScenarioSummary = {
    id: string;
    title: string;
    mode: 'guided' | 'freeform';
    region: string;
    currentRevision: number;
    updatedAt: string;
};
export type Scenario = ScenarioSummary & {
    workloadAssumptions: WorkloadAssumptions;
    snapshot: {
        configuration: LabConfiguration;
        relationships: Array<{ sourceId: string; targetId: string; kind: string }>;
        cloudFormationSource?: string;
    };
};
export type AnalysisFinding = {
    id: string;
    category: 'security' | 'compatibility' | 'reliability' | 'performance';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    explanation: string;
    recommendation: string;
    resourceIds: string[];
};
export type ArchitectureAnalysis = {
    findings: AnalysisFinding[];
    estimate: {
        currency: string;
        monthlyLow: number | null;
        monthlyHigh: number | null;
        source: string;
        effectiveAt: string | null;
        coverage: string;
        assumptions: string[];
    };
    performance: { summary: string; assumptions: string[] };
};
