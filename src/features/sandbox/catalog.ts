import type { AwsResource, AwsService, JsonValue, LabConfiguration, LabResource } from '../../types';

export type SandboxService = AwsService | 'lambda';

export type CatalogEntry = {
    service: SandboxService;
    label: string;
    description: string;
    category: string;
    glyph: string;
    resourceType: string;
    tone: 'compute' | 'networking' | 'storage' | 'database' | 'security' | 'management';
};

export const serviceCatalog: CatalogEntry[] = [
    {
        service: 'lambda',
        label: 'AWS Lambda',
        description: 'Run event-driven code without managing servers.',
        category: 'Compute',
        glyph: 'λ',
        resourceType: 'AWS::Lambda::Function',
        tone: 'compute',
    },
    {
        service: 'ec2',
        label: 'Amazon EC2',
        description: 'Run virtual machines with explicit instance sizing.',
        category: 'Compute',
        glyph: 'EC2',
        resourceType: 'AWS::EC2::Instance',
        tone: 'compute',
    },
    {
        service: 'ecs',
        label: 'Amazon ECS · Fargate',
        description: 'Run containers on serverless compute.',
        category: 'Compute',
        glyph: 'ECS',
        resourceType: 'AWS::ECS::Cluster',
        tone: 'compute',
    },
    {
        service: 'cloudfront',
        label: 'Amazon CloudFront',
        description: 'Cache and deliver content at edge locations.',
        category: 'Networking & delivery',
        glyph: 'CF',
        resourceType: 'AWS::CloudFront::Distribution',
        tone: 'networking',
    },
    {
        service: 'apiGateway',
        label: 'Amazon API Gateway',
        description: 'Expose and route application API requests.',
        category: 'Networking & delivery',
        glyph: 'API',
        resourceType: 'AWS::ApiGatewayV2::Api',
        tone: 'networking',
    },
    {
        service: 'vpc',
        label: 'Amazon VPC',
        description: 'Define network boundaries and address space.',
        category: 'Networking & delivery',
        glyph: 'VPC',
        resourceType: 'AWS::EC2::VPC',
        tone: 'networking',
    },
    {
        service: 'loadBalancer',
        label: 'Elastic Load Balancing',
        description: 'Distribute incoming traffic across targets.',
        category: 'Networking & delivery',
        glyph: 'LB',
        resourceType: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
        tone: 'networking',
    },
    {
        service: 'route53',
        label: 'Amazon Route 53',
        description: 'Route DNS queries to application endpoints.',
        category: 'Networking & delivery',
        glyph: '53',
        resourceType: 'AWS::Route53::RecordSet',
        tone: 'networking',
    },
    {
        service: 's3',
        label: 'Amazon S3',
        description: 'Store static files, backups, and application data.',
        category: 'Storage & data',
        glyph: 'S3',
        resourceType: 'AWS::S3::Bucket',
        tone: 'storage',
    },
    {
        service: 'dynamodb',
        label: 'Amazon DynamoDB',
        description: 'Use managed key-value and document storage.',
        category: 'Storage & data',
        glyph: 'D',
        resourceType: 'AWS::DynamoDB::Table',
        tone: 'database',
    },
    {
        service: 'efs',
        label: 'Amazon EFS',
        description: 'Share file storage across compute resources.',
        category: 'Storage & data',
        glyph: 'EFS',
        resourceType: 'AWS::EFS::FileSystem',
        tone: 'storage',
    },
    {
        service: 'aurora',
        label: 'Amazon Aurora',
        description: 'Use a managed relational database.',
        category: 'Storage & data',
        glyph: 'DB',
        resourceType: 'AWS::RDS::DBCluster',
        tone: 'database',
    },
    {
        service: 'iam',
        label: 'AWS IAM',
        description: 'Grant workloads only the permissions they require.',
        category: 'Security & operations',
        glyph: 'IAM',
        resourceType: 'AWS::IAM::Role',
        tone: 'security',
    },
    {
        service: 'kms',
        label: 'AWS KMS',
        description: 'Manage encryption keys and rotation.',
        category: 'Security & operations',
        glyph: 'K',
        resourceType: 'AWS::KMS::Key',
        tone: 'security',
    },
    {
        service: 'secretsManager',
        label: 'AWS Secrets Manager',
        description: 'Store and rotate application credentials.',
        category: 'Security & operations',
        glyph: 'SM',
        resourceType: 'AWS::SecretsManager::Secret',
        tone: 'security',
    },
    {
        service: 'cloudwatch',
        label: 'CloudWatch Logs',
        description: 'Retain application logs for troubleshooting.',
        category: 'Security & operations',
        glyph: 'CW',
        resourceType: 'AWS::Logs::LogGroup',
        tone: 'management',
    },
    {
        service: 'cloudwatchAlarm',
        label: 'CloudWatch Alarm',
        description: 'Alert on errors or operational thresholds.',
        category: 'Security & operations',
        glyph: 'AL',
        resourceType: 'AWS::CloudWatch::Alarm',
        tone: 'management',
    },
    {
        service: 'cloudTrail',
        label: 'AWS CloudTrail',
        description: 'Record account activity for audit and investigation.',
        category: 'Security & operations',
        glyph: 'CT',
        resourceType: 'AWS::CloudTrail::Trail',
        tone: 'management',
    },
];

const defaults: Record<SandboxService, Record<string, JsonValue>> = {
    lambda: { runtime: 'nodejs22.x', handler: 'index.handler', memorySize: 512, timeout: 30 },
    ec2: { instanceType: 't3.micro', instanceCount: 1, operatingSystem: 'Linux', multiAz: false },
    ecs: { launchType: 'FARGATE', taskCount: 1, cpu: '256', memory: '512' },
    efs: { performanceMode: 'generalPurpose', encrypted: true },
    aurora: {
        engine: 'aurora-postgresql',
        engineMode: 'provisioned',
        publiclyAccessible: false,
        storageEncrypted: true,
        multiAz: false,
    },
    vpc: { cidrBlock: '10.0.0.0/16', enableDnsSupport: true, enableDnsHostnames: true },
    loadBalancer: { scheme: 'internet-facing', type: 'application', ipAddressType: 'ipv4', targetCount: 2 },
    route53: { recordType: 'A', routingPolicy: 'simple' },
    kms: { enableKeyRotation: true, keySpec: 'SYMMETRIC_DEFAULT' },
    secretsManager: { recoveryWindowInDays: 30, automaticRotation: false },
    cloudTrail: { isMultiRegionTrail: true, enableLogFileValidation: true },
    s3: { blockPublicAccess: true, versioning: false, encryption: 'AES256' },
    cloudfront: { enabled: true, originAccessControl: true, defaultRootObject: 'index.html' },
    apiGateway: { protocolType: 'HTTP', corsEnabled: false },
    dynamodb: { billingMode: 'PAY_PER_REQUEST', partitionKey: 'id', pointInTimeRecovery: false },
    iam: { trustedService: 'lambda.amazonaws.com', leastPrivilege: true },
    cloudwatch: { retentionInDays: 14 },
    cloudwatchAlarm: { metricName: 'Errors', namespace: 'AWS/Lambda', threshold: 1, evaluationPeriods: 1 },
};

export function serviceForResource(resource: LabResource): SandboxService {
    if (resource.type === 'awsResource') return resource.service;
    return {
        s3Bucket: 's3',
        cloudFrontDistribution: 'cloudfront',
        lambdaFunction: 'lambda',
        apiRoute: 'apiGateway',
        dynamoTable: 'dynamodb',
        iamPolicy: 'iam',
        cloudWatchLogGroup: 'cloudwatch',
        cloudWatchAlarm: 'cloudwatchAlarm',
    }[resource.type] as SandboxService;
}

export function serviceEntry(service: SandboxService): CatalogEntry {
    const entry = serviceCatalog.find((item) => item.service === service);
    if (!entry) throw new Error(`Unsupported AWS service: ${service}`);
    return entry;
}

export function createResource(service: SandboxService, configuration: LabConfiguration): AwsResource {
    const entry = serviceEntry(service);
    const count =
        configuration.resources.filter((item) => item.type === 'awsResource' && item.service === service)
            .length + 1;
    return {
        id: globalThis.crypto?.randomUUID?.() ?? `${service}-${Date.now()}-${count}`,
        type: 'awsResource',
        schemaVersion: 1,
        service,
        name: `${entry.label.replace(/^(Amazon |AWS )/, '')} ${count}`,
        settings: structuredClone(defaults[service]),
        resourceType: entry.resourceType,
    };
}

export function serviceIconClass(service: SandboxService): string {
    return `service-icon service-icon--${serviceEntry(service).tone}`;
}

export function titleCaseSetting(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/^./, (character) => character.toUpperCase());
}
