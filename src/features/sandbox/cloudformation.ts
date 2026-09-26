import { parseDocument, type Document, type Tags, type YAMLMap, type YAMLSeq } from 'yaml';
import type { AwsResource, JsonValue, LabConfiguration, LabResource } from '../../types';
import { serviceCatalog, type SandboxService } from './catalog';

export type TemplateDiagnostic = {
    severity: 'error' | 'warning' | 'info';
    message: string;
    logicalId?: string;
    line?: number;
    column?: number;
};

export type CloudFormationImport = {
    configuration: LabConfiguration;
    relationships: Array<{ sourceId: string; targetId: string; kind: string }>;
    diagnostics: TemplateDiagnostic[];
    cloudFormationSource: string;
};

const maximumTemplateSize = 1_048_576;
const resourceTypes = new Map(serviceCatalog.map((entry) => [entry.resourceType, entry.service]));
const knownIntrinsics = [
    'Ref',
    'GetAtt',
    'Sub',
    'Join',
    'FindInMap',
    'ImportValue',
    'Select',
    'Split',
    'Base64',
    'If',
    'Equals',
    'And',
    'Or',
    'Not',
    'Condition',
    'Cidr',
    'Transform',
    'Length',
    'ToJsonString',
    'ForEach',
    'ValueOf',
    'ValueOfAll',
];

function intrinsicKey(tag: string): string {
    return tag === '!Ref' ? 'Ref' : `Fn::${tag.slice(1)}`;
}

function cloudFormationTags(tags: Tags): Tags {
    const localTags: Tags = [];
    for (const name of knownIntrinsics) {
        const tag = `!${name}`;
        const key = intrinsicKey(tag);
        localTags.push({ tag, resolve: (value: string) => ({ [key]: value }) });
        const resolveCollection = (value: YAMLSeq.Parsed | YAMLMap.Parsed) => ({ [key]: value });
        localTags.push({ tag, collection: 'seq', resolve: resolveCollection });
        localTags.push({ tag, collection: 'map', resolve: resolveCollection });
    }
    return [...tags, ...localTags];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function diagnosticFromYamlError(error: {
    message: string;
    linePos?: Array<{ line: number; col: number }>;
}): TemplateDiagnostic {
    const position = error.linePos?.[0];
    return {
        severity: 'error',
        message: error.message,
        ...(position ? { line: position.line, column: position.col } : {}),
    };
}

function readableYamlError(error: {
    message: string;
    linePos?: Array<{ line: number; col: number }>;
}): string {
    const diagnostic = diagnosticFromYamlError(error);
    const location = diagnostic.line
        ? `Line ${diagnostic.line}${diagnostic.column ? `, column ${diagnostic.column}` : ''}: `
        : '';
    return `${location}${diagnostic.message}`;
}

function resourceId(logicalId: string): string {
    let hash = 0;
    for (const character of logicalId) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    const safe = logicalId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 55);
    return `cfn-${safe}-${Math.abs(hash).toString(36)}`;
}

function lowerFirst(value: string): string {
    return value.length ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function upperFirst(value: string): string {
    return value.length ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function containsIntrinsic(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsIntrinsic);
    if (!isRecord(value)) return false;
    return Object.entries(value).some(
        ([key, child]) => key === 'Ref' || key.startsWith('Fn::') || containsIntrinsic(child),
    );
}

function toJsonValue(value: unknown): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(toJsonValue);
    if (isRecord(value))
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toJsonValue(child)]));
    return String(value);
}

function toSettings(properties: unknown, metadataSettings: unknown): Record<string, JsonValue> {
    const settings = isRecord(metadataSettings) ? { ...metadataSettings } : {};
    if (!isRecord(properties)) return toJsonValue(settings) as Record<string, JsonValue>;
    for (const [key, value] of Object.entries(properties)) settings[lowerFirst(key)] = value;
    const publicAccess = properties.PublicAccessBlockConfiguration;
    if (isRecord(publicAccess)) {
        if (containsIntrinsic(publicAccess)) delete settings.blockPublicAccess;
        else
            settings.blockPublicAccess = [
                'BlockPublicAcls',
                'BlockPublicPolicy',
                'IgnorePublicAcls',
                'RestrictPublicBuckets',
            ].every((key) => publicAccess[key] === true);
    } else settings.blockPublicAccess = false;
    return toJsonValue(settings) as Record<string, JsonValue>;
}

function collectReference(
    logicalId: string,
    logicalIds: Set<string>,
    output: Set<string>,
    unresolved: Set<string>,
): void {
    if (logicalIds.has(logicalId)) output.add(logicalId);
    else unresolved.add(logicalId);
}

function getAttributeId(value: unknown): string | undefined {
    if (typeof value === 'string') return value.split('.')[0];
    return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

function collectSubReferences(
    value: unknown,
    logicalIds: Set<string>,
    output: Set<string>,
    unresolved: Set<string>,
): void {
    const text =
        typeof value === 'string'
            ? value
            : Array.isArray(value) && typeof value[0] === 'string'
              ? value[0]
              : '';
    const overrides =
        Array.isArray(value) && isRecord(value[1]) ? new Set(Object.keys(value[1])) : new Set<string>();
    for (const match of text.matchAll(/\$\{([^}]+)\}/g)) {
        const variable = match[1];
        const logicalId = variable.split('.')[0];
        if (variable.startsWith('!') || overrides.has(variable) || logicalId.startsWith('AWS::')) continue;
        collectReference(logicalId, logicalIds, output, unresolved);
    }
}

function collectNestedReferences(
    value: Record<string, unknown>,
    logicalIds: Set<string>,
    output: Set<string>,
    unresolved: Set<string>,
): void {
    for (const [key, child] of Object.entries(value)) {
        if (key === 'Ref' || key === 'Fn::GetAtt' || key === 'Fn::Sub') continue;
        collectReferences(child, logicalIds, output, unresolved);
    }
}

function collectReferences(
    value: unknown,
    logicalIds: Set<string>,
    output: Set<string>,
    unresolved: Set<string>,
): void {
    if (Array.isArray(value)) {
        for (const item of value) collectReferences(item, logicalIds, output, unresolved);
        return;
    }
    if (!isRecord(value)) return;
    if (typeof value.Ref === 'string') collectReference(value.Ref, logicalIds, output, unresolved);
    const getAttId = getAttributeId(value['Fn::GetAtt']);
    if (getAttId) collectReference(getAttId, logicalIds, output, unresolved);
    if (Object.hasOwn(value, 'Fn::Sub'))
        collectSubReferences(value['Fn::Sub'], logicalIds, output, unresolved);
    collectNestedReferences(value, logicalIds, output, unresolved);
}

function resourceSettingsGroupOne(
    resource: Exclude<LabResource, AwsResource>,
): Record<string, JsonValue> | undefined {
    switch (resource.type) {
        case 's3Bucket':
            return { blockPublicAccess: resource.blockPublicAccess };
        case 'cloudFrontDistribution':
            return {
                originBucketId: resource.originBucketId,
                enabled: resource.enabled,
                originAccessControl: resource.originAccessControl,
            };
        case 'lambdaFunction':
            return {
                runtime: resource.runtime ?? 'nodejs22.x',
                memorySize: resource.memoryMiB ?? 512,
                timeout: resource.timeoutSeconds ?? 30,
            };
        case 'apiRoute':
            return { path: resource.path, method: resource.method, lambdaId: resource.lambdaId };
        default:
            return undefined;
    }
}

function resourceSettingsGroupTwo(resource: Exclude<LabResource, AwsResource>): Record<string, JsonValue> {
    switch (resource.type) {
        case 'dynamoTable':
            return { partitionKey: resource.partitionKey };
        case 'iamPolicy':
            return {
                lambdaId: resource.lambdaId,
                tableId: resource.tableId,
                accessLevel: resource.accessLevel,
            };
        case 'cloudWatchLogGroup':
            return { retentionInDays: resource.retentionDays };
        case 'cloudWatchAlarm':
            return { metricName: resource.metric, lambdaId: resource.lambdaId };
        default:
            return {};
    }
}

function resourceSettings(resource: LabResource): Record<string, JsonValue> {
    if (resource.type === 'awsResource') return resource.settings;
    return resourceSettingsGroupOne(resource) ?? resourceSettingsGroupTwo(resource);
}

function logicalIdFor(resource: LabResource, index: number): string {
    if (resource.type === 'awsResource' && resource.logicalId) return resource.logicalId;
    const base = resource.name.replace(/[^A-Za-z0-9]/g, '');
    const safeBase = /^[A-Za-z]/.test(base) ? base : `Resource${base}`;
    return safeBase.slice(0, 220) || `Resource${index + 1}`;
}

function importedCloudFormationProperties(
    resource: AwsResource,
    originalProperties?: Record<string, unknown>,
): Record<string, JsonValue> {
    const properties = originalProperties ? { ...originalProperties } : {};
    for (const [key, value] of Object.entries(resource.settings)) {
        const property = upperFirst(key);
        if (Object.hasOwn(properties, property)) properties[property] = value;
    }
    if (resource.service === 's3' && typeof resource.settings.blockPublicAccess === 'boolean') {
        const blockPublicAccess = resource.settings.blockPublicAccess;
        properties.PublicAccessBlockConfiguration = {
            ...(isRecord(properties.PublicAccessBlockConfiguration)
                ? properties.PublicAccessBlockConfiguration
                : {}),
            BlockPublicAcls: blockPublicAccess,
            BlockPublicPolicy: blockPublicAccess,
            IgnorePublicAcls: blockPublicAccess,
            RestrictPublicBuckets: blockPublicAccess,
        };
    }
    return toJsonValue(properties) as Record<string, JsonValue>;
}

function legacyCloudFormationProperties(
    resource: Exclude<LabResource, AwsResource>,
): Record<string, JsonValue> {
    const settings = resourceSettings(resource);
    if (resource.type === 's3Bucket') {
        return {
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: resource.blockPublicAccess,
                BlockPublicPolicy: resource.blockPublicAccess,
                IgnorePublicAcls: resource.blockPublicAccess,
                RestrictPublicBuckets: resource.blockPublicAccess,
            },
            BucketEncryption: {
                ServerSideEncryptionConfiguration: [
                    { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
                ],
            },
        };
    }
    if (resource.type === 'lambdaFunction')
        return defaultAwsProperties({
            id: resource.id,
            type: 'awsResource',
            schemaVersion: 1,
            service: 'lambda',
            name: resource.name,
            settings: resourceSettings(resource),
        });
    if (resource.type === 'dynamoTable') {
        return {
            AttributeDefinitions: [{ AttributeName: resource.partitionKey, AttributeType: 'S' }],
            KeySchema: [{ AttributeName: resource.partitionKey, KeyType: 'HASH' }],
            BillingMode: 'PAY_PER_REQUEST',
        };
    }
    if (resource.type === 'cloudWatchLogGroup')
        return { LogGroupName: resource.name, RetentionInDays: resource.retentionDays };
    if (resource.type === 'cloudWatchAlarm') {
        return {
            AlarmName: resource.name,
            MetricName: resource.metric,
            Namespace: 'AWS/Lambda',
            Statistic: 'Sum',
            Period: 60,
            EvaluationPeriods: 1,
            Threshold: 1,
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        };
    }
    return Object.fromEntries(Object.entries(settings).map(([key, value]) => [upperFirst(key), value]));
}

function cloudFormationProperties(
    resource: LabResource,
    originalProperties?: Record<string, unknown>,
): Record<string, JsonValue> {
    if (resource.type === 'awsResource') {
        return resource.logicalId
            ? importedCloudFormationProperties(resource, originalProperties)
            : defaultAwsProperties(resource);
    }
    return legacyCloudFormationProperties(resource);
}

type AwsPropertyBuilder = (resource: AwsResource) => Record<string, JsonValue>;

const awsPropertyBuilders: Record<SandboxService, AwsPropertyBuilder> = {
    lambda: (resource) => ({
        Runtime: resource.settings.runtime ?? 'nodejs22.x',
        Handler: resource.settings.handler ?? 'index.handler',
        Role: { Ref: 'LambdaExecutionRoleArn' },
        MemorySize: resource.settings.memorySize ?? 512,
        Timeout: resource.settings.timeout ?? 30,
        Code: { ZipFile: 'exports.handler = async () => ({ statusCode: 200, body: "ok" });' },
    }),
    ec2: (resource) => ({
        ImageId: { Ref: 'Ec2ImageId' },
        InstanceType: resource.settings.instanceType ?? 't3.micro',
    }),
    ecs: (resource) => ({ ClusterName: resource.name, CapacityProviders: ['FARGATE', 'FARGATE_SPOT'] }),
    efs: (resource) => ({
        Encrypted: resource.settings.encrypted !== false,
        PerformanceMode: resource.settings.performanceMode ?? 'generalPurpose',
    }),
    aurora: (resource) => ({
        Engine: resource.settings.engine ?? 'aurora-postgresql',
        EngineMode: resource.settings.engineMode ?? 'provisioned',
        StorageEncrypted: resource.settings.storageEncrypted !== false,
        ManageMasterUserPassword: true,
        MasterUsername: 'sandbox_admin',
    }),
    vpc: (resource) => ({
        CidrBlock: resource.settings.cidrBlock ?? '10.0.0.0/16',
        EnableDnsSupport: resource.settings.enableDnsSupport !== false,
        EnableDnsHostnames: resource.settings.enableDnsHostnames !== false,
    }),
    loadBalancer: (resource) => ({
        Name: resource.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32),
        Scheme: resource.settings.scheme ?? 'internet-facing',
        Type: resource.settings.type ?? 'application',
        IpAddressType: resource.settings.ipAddressType ?? 'ipv4',
        Subnets: { Ref: 'LoadBalancerSubnetIds' },
    }),
    route53: (resource) => ({
        HostedZoneId: { Ref: 'Route53HostedZoneId' },
        Name: resource.settings.recordName ?? 'sandbox.example.com',
        Type: resource.settings.recordType ?? 'A',
        ResourceRecords: ['192.0.2.1'],
        TTL: '300',
    }),
    kms: (resource) => ({
        EnableKeyRotation: resource.settings.enableKeyRotation !== false,
        KeySpec: resource.settings.keySpec ?? 'SYMMETRIC_DEFAULT',
        KeyUsage: 'ENCRYPT_DECRYPT',
    }),
    secretsManager: (resource) => ({
        Name: resource.name,
        Description: 'Secret managed by the architecture sandbox.',
    }),
    cloudTrail: (resource) => ({
        TrailName: resource.name,
        S3BucketName: { Ref: 'CloudTrailBucketName' },
        IsLogging: true,
        IsMultiRegionTrail: resource.settings.isMultiRegionTrail !== false,
        EnableLogFileValidation: resource.settings.enableLogFileValidation !== false,
    }),
    s3: (resource) => ({
        PublicAccessBlockConfiguration: {
            BlockPublicAcls: resource.settings.blockPublicAccess !== false,
            BlockPublicPolicy: resource.settings.blockPublicAccess !== false,
            IgnorePublicAcls: resource.settings.blockPublicAccess !== false,
            RestrictPublicBuckets: resource.settings.blockPublicAccess !== false,
        },
        BucketEncryption: {
            ServerSideEncryptionConfiguration: [
                { ServerSideEncryptionByDefault: { SSEAlgorithm: resource.settings.encryption ?? 'AES256' } },
            ],
        },
        ...(resource.settings.versioning === true ? { VersioningConfiguration: { Status: 'Enabled' } } : {}),
    }),
    cloudfront: (resource) => ({
        DistributionConfig: {
            Enabled: resource.settings.enabled !== false,
            DefaultRootObject: resource.settings.defaultRootObject ?? 'index.html',
            Origins: [
                {
                    Id: 'sandbox-origin',
                    DomainName: { Ref: 'CloudFrontOriginDomainName' },
                    CustomOriginConfig: { OriginProtocolPolicy: 'https-only' },
                },
            ],
            DefaultCacheBehavior: {
                TargetOriginId: 'sandbox-origin',
                ViewerProtocolPolicy: 'redirect-to-https',
                AllowedMethods: ['GET', 'HEAD'],
                CachedMethods: ['GET', 'HEAD'],
                ForwardedValues: { QueryString: false },
            },
        },
    }),
    apiGateway: (resource) => ({
        Name: resource.name,
        ProtocolType: resource.settings.protocolType ?? 'HTTP',
        ...(resource.settings.corsEnabled === true
            ? { CorsConfiguration: { AllowMethods: ['GET', 'POST', 'OPTIONS'], AllowOrigins: ['*'] } }
            : {}),
    }),
    dynamodb: (resource) => ({
        AttributeDefinitions: [{ AttributeName: resource.settings.partitionKey ?? 'id', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: resource.settings.partitionKey ?? 'id', KeyType: 'HASH' }],
        BillingMode: resource.settings.billingMode ?? 'PAY_PER_REQUEST',
    }),
    iam: (resource) => ({
        AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Service: resource.settings.trustedService ?? 'lambda.amazonaws.com' },
                    Action: 'sts:AssumeRole',
                },
            ],
        },
    }),
    cloudwatch: (resource) => ({
        LogGroupName: resource.name,
        RetentionInDays: resource.settings.retentionInDays ?? 14,
    }),
    cloudwatchAlarm: (resource) => ({
        AlarmName: resource.name,
        MetricName: resource.settings.metricName ?? 'Errors',
        Namespace: resource.settings.namespace ?? 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 60,
        EvaluationPeriods: resource.settings.evaluationPeriods ?? 1,
        Threshold: resource.settings.threshold ?? 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    }),
};

function defaultAwsProperties(resource: AwsResource): Record<string, JsonValue> {
    return awsPropertyBuilders[resource.service](resource);
}

const legacyServiceByType: Partial<Record<LabResource['type'], SandboxService>> = {
    s3Bucket: 's3',
    cloudFrontDistribution: 'cloudfront',
    lambdaFunction: 'lambda',
    apiRoute: 'apiGateway',
    dynamoTable: 'dynamodb',
    iamPolicy: 'iam',
    cloudWatchLogGroup: 'cloudwatch',
    cloudWatchAlarm: 'cloudwatchAlarm',
};

function cloudFormationType(resource: LabResource): string {
    const service = resource.type === 'awsResource' ? resource.service : legacyServiceByType[resource.type];
    const registeredType = serviceCatalog.find((entry) => entry.service === service)?.resourceType;
    return resource.type === 'awsResource'
        ? (resource.resourceType ?? registeredType ?? 'Custom::SandboxResource')
        : (registeredType ?? 'Custom::SandboxResource');
}

function namedProperty(resource: LabResource): string | undefined {
    if (resource.type !== 'awsResource') return undefined;
    const propertyNames: Partial<Record<SandboxService, string>> = {
        s3: 'BucketName',
        lambda: 'FunctionName',
        dynamodb: 'TableName',
        aurora: 'DBClusterIdentifier',
        cloudwatch: 'LogGroupName',
        cloudwatchAlarm: 'AlarmName',
        loadBalancer: 'Name',
        apiGateway: 'Name',
        cloudTrail: 'TrailName',
        ecs: 'ClusterName',
        secretsManager: 'Name',
    };
    return propertyNames[resource.service];
}

type ImportedResource = {
    resource: AwsResource;
    properties: Record<string, unknown>;
    raw: Record<string, unknown>;
};

type TemplateRoot = Record<string, unknown> & { Resources: Record<string, unknown> };

function parseTemplateSource(source: string): {
    root: TemplateRoot;
    diagnostics: TemplateDiagnostic[];
} {
    if (source.length > maximumTemplateSize)
        throw new Error('CloudFormation templates must be 1 MB or smaller.');
    const document = parseDocument(source, { customTags: cloudFormationTags, uniqueKeys: true });
    if (document.errors.length) throw new Error(readableYamlError(document.errors[0]));
    const root = document.toJS({ maxAliasCount: 50 });
    if (!isRecord(root)) throw new Error('The template must contain a YAML object at its root.');
    if (!isRecord(root.Resources)) throw new Error('The template must include a Resources mapping.');
    return {
        root: root as TemplateRoot,
        diagnostics: document.warnings.map((warning) => ({
            ...diagnosticFromYamlError(warning),
            severity: 'warning',
        })),
    };
}

function buildImportedResource(
    logicalId: string,
    raw: Record<string, unknown>,
    service: SandboxService,
): ImportedResource {
    const properties = isRecord(raw.Properties) ? raw.Properties : {};
    const metadata =
        isRecord(raw.Metadata) && isRecord(raw.Metadata.StackPlayground) ? raw.Metadata.StackPlayground : {};
    const name =
        [
            properties.Name,
            properties.BucketName,
            properties.FunctionName,
            properties.TableName,
            properties.LogGroupName,
            properties.DBClusterIdentifier,
        ].find((value): value is string => typeof value === 'string') ?? logicalId;
    return {
        resource: {
            id: resourceId(logicalId),
            type: 'awsResource',
            schemaVersion: 1,
            service,
            name,
            settings: toSettings(properties, metadata.settings),
            logicalId,
            resourceType: raw.Type as string,
        },
        properties,
        raw,
    };
}

function addUneditableResourceDiagnostic(logicalId: string, raw: unknown, diagnostics: TemplateDiagnostic[]) {
    const missingType = !isRecord(raw) || typeof raw.Type !== 'string';
    const message = missingType
        ? `${logicalId} has no CloudFormation resource Type and was preserved in the source.`
        : `${raw.Type} is not in the editable service catalog. It will remain preserved in the YAML source.`;
    diagnostics.push({ severity: missingType ? 'warning' : 'info', logicalId, message });
}

function readEditableResources(root: TemplateRoot, diagnostics: TemplateDiagnostic[]): ImportedResource[] {
    const resources: ImportedResource[] = [];
    for (const [logicalId, raw] of Object.entries(root.Resources)) {
        if (!isRecord(raw) || typeof raw.Type !== 'string') {
            addUneditableResourceDiagnostic(logicalId, raw, diagnostics);
            continue;
        }
        const service = resourceTypes.get(raw.Type);
        if (service) resources.push(buildImportedResource(logicalId, raw, service));
        else addUneditableResourceDiagnostic(logicalId, raw, diagnostics);
    }
    if (resources.length > 80)
        throw new Error('The sandbox supports up to 80 editable resources in one architecture.');
    return resources;
}

type RelationshipWriter = {
    keys: Set<string>;
    relationships: CloudFormationImport['relationships'];
};

function addUniqueRelationship(
    sourceId: string,
    targetId: string,
    kind: string,
    writer: RelationshipWriter,
): void {
    const key = `${sourceId}|${targetId}|${kind}`;
    if (sourceId === targetId || writer.keys.has(key)) return;
    writer.keys.add(key);
    writer.relationships.push({ sourceId, targetId, kind });
}

function addDependencyRelationships(
    item: ImportedResource,
    byLogicalId: Map<string, ImportedResource>,
    writer: RelationshipWriter,
): void {
    const values = Array.isArray(item.raw.DependsOn) ? item.raw.DependsOn : [item.raw.DependsOn];
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const target = byLogicalId.get(value);
        if (target) addUniqueRelationship(item.resource.id, target.resource.id, 'depends-on', writer);
    }
}

type ReferenceRelationshipContext = {
    root: TemplateRoot;
    logicalIds: Set<string>;
    byLogicalId: Map<string, ImportedResource>;
    diagnostics: TemplateDiagnostic[];
    writer: RelationshipWriter;
};

function addReferenceRelationships(item: ImportedResource, context: ReferenceRelationshipContext): void {
    const references = new Set<string>();
    const unresolved = new Set<string>();
    collectReferences(item.properties, context.logicalIds, references, unresolved);
    for (const logicalId of references) {
        const target = context.byLogicalId.get(logicalId);
        if (target)
            addUniqueRelationship(item.resource.id, target.resource.id, 'connects-to', context.writer);
    }
    for (const logicalId of unresolved) {
        const parameters = context.root.Parameters;
        if (isRecord(parameters) && Object.hasOwn(parameters, logicalId)) continue;
        if (logicalId.startsWith('AWS::')) continue;
        context.diagnostics.push({
            severity: 'warning',
            logicalId: item.resource.logicalId,
            message: `Reference to "${logicalId}" does not match a resource, parameter, or pseudo parameter. Its value remains unresolved.`,
        });
    }
}

function deriveTemplateRelationships(
    resources: ImportedResource[],
    root: TemplateRoot,
    logicalIds: Set<string>,
    diagnostics: TemplateDiagnostic[],
): CloudFormationImport['relationships'] {
    const byLogicalId = new Map(resources.map((item) => [item.resource.logicalId as string, item]));
    const relationships: CloudFormationImport['relationships'] = [];
    const writer: RelationshipWriter = { keys: new Set<string>(), relationships };
    const referenceContext = { root, logicalIds, byLogicalId, diagnostics, writer };
    for (const item of resources) {
        addDependencyRelationships(item, byLogicalId, writer);
        addReferenceRelationships(item, referenceContext);
    }
    return relationships;
}

function addPreservedResourceDiagnostic(
    editableCount: number,
    totalCount: number,
    diagnostics: TemplateDiagnostic[],
): void {
    if (editableCount >= totalCount) return;
    diagnostics.push({
        severity: 'info',
        message: `${totalCount - editableCount} resource(s) are preserved in the template and are not editable in the console.`,
    });
}

export function importCloudFormation(source: string): CloudFormationImport {
    const parsed = parseTemplateSource(source);
    const known = readEditableResources(parsed.root, parsed.diagnostics);
    const logicalIds = new Set(Object.keys(parsed.root.Resources as Record<string, unknown>));
    const relationships = deriveTemplateRelationships(known, parsed.root, logicalIds, parsed.diagnostics);
    addPreservedResourceDiagnostic(known.length, logicalIds.size, parsed.diagnostics);
    return {
        configuration: { resources: known.map((item) => item.resource) },
        relationships,
        diagnostics: parsed.diagnostics,
        cloudFormationSource: source,
    };
}

export function exportCloudFormation(
    configuration: LabConfiguration,
    source = '',
    relationships: Array<{ sourceId: string; targetId: string; kind: string }> = [],
): string {
    const document = createExportDocument(source);
    const root = document.toJS({ maxAliasCount: 50 });
    const resources = initialResourceMap(root);
    removeDeletedResources(resources, configuration);
    const resourceIds = assignLogicalIds(configuration, resources);
    writeResourceDefinitions(configuration, resources, resourceIds);
    writeDependencyDefinitions(configuration, resources, resourceIds, relationships);
    document.set('Resources', resources);
    writeGeneratedParameters(root, document, configuration);
    return document.toString({ lineWidth: 100, indent: 2 });
}

function createExportDocument(source: string): Document {
    const defaultTemplate =
        'AWSTemplateFormatVersion: "2010-09-09"\nDescription: Stack Playground architecture\nResources: {}\n';
    const document = parseDocument(source || defaultTemplate, {
        customTags: cloudFormationTags,
        uniqueKeys: true,
    });
    if (document.errors.length)
        throw new Error(
            `The stored CloudFormation source is invalid. ${readableYamlError(document.errors[0])}`,
        );
    return document;
}

function initialResourceMap(root: unknown): Record<string, unknown> {
    return isRecord(root) && isRecord(root.Resources) ? { ...root.Resources } : {};
}

function removeDeletedResources(resources: Record<string, unknown>, configuration: LabConfiguration): void {
    const activeIds = new Set(
        configuration.resources.flatMap((resource) =>
            resource.type === 'awsResource' && resource.logicalId ? [resource.logicalId] : [],
        ),
    );
    for (const [logicalId, value] of Object.entries(resources)) {
        const type = isRecord(value) && typeof value.Type === 'string' ? value.Type : '';
        if (resourceTypes.has(type) && !activeIds.has(logicalId)) delete resources[logicalId];
    }
}

function assignLogicalIds(
    configuration: LabConfiguration,
    resources: Record<string, unknown>,
): Map<string, string> {
    const usedIds = new Set(Object.keys(resources));
    const resourceIds = new Map<string, string>();
    for (const [index, resource] of configuration.resources.entries()) {
        const base = logicalIdFor(resource, index + 1);
        let logicalId = base;
        let suffix = 2;
        while (
            usedIds.has(logicalId) &&
            !(resource.type === 'awsResource' && resource.logicalId === logicalId)
        ) {
            logicalId = `${base}${suffix}`;
            suffix += 1;
        }
        usedIds.add(logicalId);
        resourceIds.set(resource.id, logicalId);
    }
    return resourceIds;
}

function metadataForResource(resource: LabResource, previous: Record<string, unknown>) {
    const previousMetadata = isRecord(previous.Metadata) ? previous.Metadata : {};
    const metadataSettings = {
        ...(resource.type === 'awsResource' ? { service: resource.service } : {}),
        settings: resourceSettings(resource),
    };
    return { ...previousMetadata, StackPlayground: metadataSettings };
}

function writeResourceDefinitions(
    configuration: LabConfiguration,
    resources: Record<string, unknown>,
    resourceIds: Map<string, string>,
): void {
    for (const resource of configuration.resources) {
        const logicalId = resourceIds.get(resource.id);
        if (!logicalId) continue;
        const previous = isRecord(resources[logicalId]) ? resources[logicalId] : {};
        const originalProperties = isRecord(previous.Properties) ? previous.Properties : undefined;
        const properties = cloudFormationProperties(resource, originalProperties);
        const propertyName = namedProperty(resource);
        if (propertyName) properties[propertyName] = resource.name;
        resources[logicalId] = {
            ...previous,
            Type: cloudFormationType(resource),
            Properties: properties,
            Metadata: metadataForResource(resource, previous),
        };
    }
}

function configuredDependencies(
    resource: LabResource,
    resourceIds: Map<string, string>,
    relationships: CloudFormationImport['relationships'],
): string[] {
    return relationships
        .filter((link) => link.sourceId === resource.id && link.kind === 'depends-on')
        .map((link) => resourceIds.get(link.targetId))
        .filter((value): value is string => Boolean(value));
}

function writeDependencyDefinitions(
    configuration: LabConfiguration,
    resources: Record<string, unknown>,
    resourceIds: Map<string, string>,
    relationships: CloudFormationImport['relationships'],
): void {
    const editableIds = new Set(resourceIds.values());
    for (const resource of configuration.resources) {
        const logicalId = resourceIds.get(resource.id);
        if (!logicalId || !isRecord(resources[logicalId])) continue;
        const definition = resources[logicalId];
        const existing = Array.isArray(definition.DependsOn) ? definition.DependsOn : [definition.DependsOn];
        const preserved = existing.filter(
            (value): value is string => typeof value === 'string' && !editableIds.has(value),
        );
        const dependencies = [
            ...new Set([...preserved, ...configuredDependencies(resource, resourceIds, relationships)]),
        ];
        if (dependencies.length)
            definition.DependsOn = dependencies.length === 1 ? dependencies[0] : dependencies;
        else delete definition.DependsOn;
    }
}

const generatedParametersByService: Partial<Record<SandboxService, JsonValue>> = {
    ec2: { Type: 'AWS::EC2::Image::Id', Description: 'AMI for the simulated EC2 instance.' },
    loadBalancer: {
        Type: 'List<AWS::EC2::Subnet::Id>',
        Description: 'Subnets for the simulated load balancer.',
    },
    route53: {
        Type: 'AWS::Route53::HostedZone::Id',
        Description: 'Hosted zone for the simulated DNS record.',
    },
    cloudTrail: { Type: 'String', Description: 'Existing S3 bucket for CloudTrail logs.' },
    cloudfront: { Type: 'String', Description: 'Origin domain name for the CloudFront distribution.' },
};

function generatedParameterValues(configuration: LabConfiguration): Record<string, JsonValue> {
    const services = new Set(
        configuration.resources.flatMap((resource) =>
            resource.type === 'awsResource' && !resource.logicalId ? [resource.service] : [],
        ),
    );
    const needsLambdaRole =
        services.has('lambda') ||
        configuration.resources.some((resource) => resource.type === 'lambdaFunction');
    const generated = Object.entries(generatedParametersByService).filter(([service]) =>
        services.has(service as SandboxService),
    );
    const parameters: Record<string, JsonValue> = {};
    if (needsLambdaRole)
        parameters.LambdaExecutionRoleArn = {
            Type: 'String',
            Description: 'ARN of an execution role for the Lambda functions in this sandbox template.',
        };
    for (const [key, value] of generated) {
        const parameterName = parameterNameByService[key as SandboxService];
        if (parameterName) parameters[parameterName] = value;
    }
    return parameters;
}

function writeGeneratedParameters(root: unknown, document: Document, configuration: LabConfiguration): void {
    const generated = generatedParameterValues(configuration);
    if (!Object.keys(generated).length) return;
    const parameters = isRecord(root) && isRecord(root.Parameters) ? { ...root.Parameters } : {};
    for (const [key, value] of Object.entries(generated)) parameters[key] ??= value;
    document.set('Parameters', parameters);
}

const parameterNameByService: Partial<Record<SandboxService, string>> = {
    ec2: 'Ec2ImageId',
    loadBalancer: 'LoadBalancerSubnetIds',
    route53: 'Route53HostedZoneId',
    cloudTrail: 'CloudTrailBucketName',
    cloudfront: 'CloudFrontOriginDomainName',
};
