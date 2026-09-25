import type { LabConfiguration, LabResource } from '../types';

type Props = { configuration: LabConfiguration; compact?: boolean };

function activeResources<T extends LabResource['type']>(configuration: LabConfiguration, type: T): Extract<LabResource, { type: T }>[] {
  return configuration.resources.filter((resource): resource is Extract<LabResource, { type: T }> => resource.type === type);
}

function Node({ label, title, detail, active }: { label: string; title: string; detail: string; active: boolean }) {
  return <div className={`architecture-node ${active ? 'is-active' : ''}`}><span>{label}</span><strong>{title}</strong><small>{detail}</small></div>;
}

export default function ArchitectureDiagram({ configuration, compact = false }: Props) {
  const bucket = activeResources(configuration, 's3Bucket')[0];
  const distribution = activeResources(configuration, 'cloudFrontDistribution')[0];
  const route = activeResources(configuration, 'apiRoute')[0];
  const fn = activeResources(configuration, 'lambdaFunction')[0];
  const table = activeResources(configuration, 'dynamoTable')[0];
  const policy = activeResources(configuration, 'iamPolicy')[0];
  const logGroup = activeResources(configuration, 'cloudWatchLogGroup')[0];
  const alarm = activeResources(configuration, 'cloudWatchAlarm')[0];
  const bucketDetail = bucket ? `${bucket.name || 'S3 bucket'} · ${bucket.blockPublicAccess ? 'private' : 'public'}` : 'Not created';
  const distributionDetail = distribution ? `${distribution.name || 'Distribution'} · ${distribution.originAccessControl ? 'OAC' : 'no OAC'}` : 'Not created';
  const routeDetail = route?.path || 'Not created';
  const tableDetail = table ? `${table.name || 'Table'} · key ${table.partitionKey}` : 'Not created';
  const roleDetail = policy ? `${policy.accessLevel} on ${table?.name || 'table'}` : 'Not configured';
  const monitoringDetail = logGroup ? `Logs · ${alarm?.metric || 'no'} alarm` : 'No log group';

  return (
    <section className={`architecture-diagram ${compact ? 'architecture-diagram--compact' : ''}`} aria-label="Simulated architecture diagram">
      <div className="diagram-title-row"><div><span className="diagram-kicker">ARCHITECTURE MAP</span><h2>How the pieces connect</h2></div><span className="diagram-live">SANDBOX</span></div>
      <div className="diagram-lane-label">FRONTEND DELIVERY · PRIVATE ORIGIN</div>
      <div className="diagram-flow"><Node label="VISITOR" title="Browser" detail="Web app" active /><span className="diagram-connector">→</span><Node label="DELIVERY" title="CloudFront" detail={distributionDetail} active={Boolean(distribution?.enabled)} /><span className="diagram-connector">→</span><Node label="STORAGE" title="Amazon S3" detail={bucketDetail} active={Boolean(bucket?.blockPublicAccess)} /></div>
      <div className="diagram-lane-label">API REQUEST & DATA</div>
      <div className="diagram-flow"><Node label="HTTP ENTRY" title="API Gateway" detail={routeDetail} active={Boolean(route)} /><span className="diagram-connector">→</span><Node label="COMPUTE" title="AWS Lambda" detail={fn?.name || 'Not created'} active={Boolean(fn)} /><span className="diagram-connector">→</span><Node label="DATABASE" title="DynamoDB" detail={tableDetail} active={Boolean(table)} /></div>
      <div className="diagram-lane-label">LAMBDA ROLE & OPERATIONS</div>
      <div className="diagram-support"><Node label="EXECUTION ROLE" title="AWS IAM" detail={roleDetail} active={Boolean(policy)} /><Node label="LOGS & ALARM" title="CloudWatch" detail={monitoringDetail} active={Boolean(logGroup && alarm)} /></div>
      <p className="diagram-role-note">Starter pattern, not production-hardened: grant API Gateway permission to invoke Lambda; add API authorization and throttling before exposing real data. Scope Lambda's role to this table and CloudWatch Logs; allow only the site origin in CORS if origins differ.</p>
      <p className="diagram-caption">A conceptual view of your sandbox. No AWS resources are created.</p>
    </section>
  );
}
