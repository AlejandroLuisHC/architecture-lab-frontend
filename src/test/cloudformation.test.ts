import { describe, expect, it } from 'vitest';
import { exportCloudFormation, importCloudFormation } from '../features/sandbox/cloudformation';

const template = `AWSTemplateFormatVersion: '2010-09-09'
Description: A sandbox import fixture
Parameters:
  BucketPrefix:
    Type: String
Resources:
  AssetsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: sandbox-assets-example
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
  ExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement: []
  AppFunction:
    Type: AWS::Lambda::Function
    DependsOn: AssetsBucket
    Properties:
      Runtime: nodejs22.x
      Handler: index.handler
      Role: !GetAtt ExecutionRole.Arn
      MemorySize: 384
      Timeout: 20
      Code:
        ZipFile: exports.handler = async () => 'ok'
  UnmodeledQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: keep-this-queue
`;

describe('CloudFormation conversion', () => {
    it('imports modeled AWS resources and relationships while preserving unsupported resources and sections', () => {
        const imported = importCloudFormation(template);
        const bucket = imported.configuration.resources.find(
            (resource) => resource.type === 'awsResource' && resource.service === 's3',
        );
        const lambda = imported.configuration.resources.find(
            (resource) => resource.type === 'awsResource' && resource.service === 'lambda',
        );

        expect(imported.configuration.resources).toHaveLength(3);
        expect(bucket).toMatchObject({
            logicalId: 'AssetsBucket',
            settings: { bucketName: 'sandbox-assets-example', blockPublicAccess: true },
        });
        expect(lambda).toMatchObject({
            logicalId: 'AppFunction',
            settings: { runtime: 'nodejs22.x', memorySize: 384, timeout: 20 },
        });
        expect(imported.relationships).toContainEqual({
            sourceId: lambda?.id,
            targetId: imported.configuration.resources.find(
                (resource) => resource.type === 'awsResource' && resource.service === 'iam',
            )?.id,
            kind: 'connects-to',
        });
        expect(imported.relationships).toContainEqual({
            sourceId: lambda?.id,
            targetId: bucket?.id,
            kind: 'depends-on',
        });
        expect(imported.diagnostics.some((item) => item.message.includes('AWS::SQS::Queue'))).toBe(true);

        const exported = exportCloudFormation(
            imported.configuration,
            imported.cloudFormationSource,
            imported.relationships,
        );
        expect(exported).toContain('BucketPrefix');
        expect(exported).toContain('AWS::SQS::Queue');
        expect(exported).toContain('keep-this-queue');
        expect(exported).toContain('StackPlayground');
        expect(exported).toContain('DependsOn');

        const reopened = importCloudFormation(exported);
        expect(
            reopened.configuration.resources.map((resource) =>
                resource.type === 'awsResource' ? resource.logicalId : resource.id,
            ),
        ).toEqual(['AssetsBucket', 'ExecutionRole', 'AppFunction']);
    });

    it('reports invalid YAML with a source location and does not produce a partial configuration', () => {
        expect(() => importCloudFormation('Resources:\n  Broken: [\n')).toThrow(/line 2|line 3/i);
    });

    it('rejects duplicate logical resource IDs instead of silently selecting one', () => {
        const source = `Resources:
  Duplicate:
    Type: AWS::S3::Bucket
  Duplicate:
    Type: AWS::Lambda::Function
`;
        expect(() => importCloudFormation(source)).toThrow(/duplicate|unique key/i);
    });

    it('accepts long-form and short-form CloudFormation expressions', () => {
        const source = `Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
  Instance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t3.micro
      UserData: !Sub 'Vpc is \${Vpc}'
`;
        const imported = importCloudFormation(source);

        expect(imported.configuration.resources).toHaveLength(2);
        expect(imported.relationships).toHaveLength(1);
        expect(imported.relationships[0].kind).toBe('connects-to');
    });

    it('reports unresolved references and exports edited dependency relationships', () => {
        const source = `Resources:
  Function:
    Type: AWS::Lambda::Function
    Properties:
      Role: !GetAtt MissingRole.Arn
      Runtime: nodejs22.x
      Handler: index.handler
      Code:
        ZipFile: exports.handler = async () => 'ok'
  Bucket:
    Type: AWS::S3::Bucket
`;
        const imported = importCloudFormation(source);
        const functionResource = imported.configuration.resources.find(
            (resource) => resource.type === 'awsResource' && resource.logicalId === 'Function',
        );
        const bucketResource = imported.configuration.resources.find(
            (resource) => resource.type === 'awsResource' && resource.logicalId === 'Bucket',
        );

        expect(imported.diagnostics.some((item) => item.message.includes('MissingRole'))).toBe(true);
        const exported = exportCloudFormation(imported.configuration, imported.cloudFormationSource, [
            { sourceId: functionResource?.id ?? '', targetId: bucketResource?.id ?? '', kind: 'depends-on' },
        ]);
        expect(exported).toMatch(/Function:[\s\S]*?DependsOn: Bucket/);
    });

    it('finds relationships nested in Fn::Join while leaving parameter values unresolved', () => {
        const source = `Parameters:
  Prefix:
    Type: String
Resources:
  Storage:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '\${Prefix}-assets'
  Worker:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs22.x
      Handler: index.handler
      Code:
        ZipFile: exports.handler = async () => 'ok'
  Endpoint:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: !Join ['', [!Ref Storage, !GetAtt Worker.Arn]]
`;
        const imported = importCloudFormation(source);
        const endpoint = imported.configuration.resources.find(
            (resource) => resource.type === 'awsResource' && resource.logicalId === 'Endpoint',
        );

        expect(imported.relationships).toHaveLength(2);
        expect(imported.relationships.every((link) => link.sourceId === endpoint?.id)).toBe(true);
        expect(imported.diagnostics.some((item) => item.message.includes('Prefix'))).toBe(false);
        expect(exportCloudFormation(imported.configuration, imported.cloudFormationSource)).toContain(
            'Parameters:',
        );
    });
});
