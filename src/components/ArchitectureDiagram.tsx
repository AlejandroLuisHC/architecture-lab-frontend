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

  return (
    <section className={`architecture-diagram ${compact ? 'architecture-diagram--compact' : ''}`} aria-label="Simulated architecture diagram">
      <div className="diagram-title-row"><div><span className="diagram-kicker">ARCHITECTURE MAP</span><h2>How the pieces connect</h2></div><span className="diagram-live">SANDBOX</span></div>
      <div className="diagram-lane-label">FRONTEND DELIVERY</div>
      <div className="diagram-flow"><Node label="VISITOR" title="Browser" detail="Web app" active /><span className="diagram-connector">→</span><Node label="DELIVERY" title="CloudFront" detail={distribution?.name || 'Not created'} active={Boolean(distribution?.enabled)} /><span className="diagram-connector">→</span><Node label="STORAGE" title="Amazon S3" detail={bucket?.name || 'Not created'} active={Boolean(bucket)} /></div>
      <div className="diagram-lane-label">APPLICATION & DATA</div>
      <div className="diagram-flow"><Node label="HTTP ENTRY" title="API Gateway" detail={route?.path || 'Not created'} active={Boolean(route)} /><span className="diagram-connector">→</span><Node label="COMPUTE" title="AWS Lambda" detail={fn?.name || 'Not created'} active={Boolean(fn)} /><span className="diagram-connector">→</span><Node label="DATABASE" title="DynamoDB" detail={table?.name || 'Not created'} active={Boolean(table)} /></div>
      <div className="diagram-support"><Node label="ACCESS" title="AWS IAM" detail={policy?.accessLevel || 'Not configured'} active={Boolean(policy)} /><span className="diagram-connector">→</span><Node label="OBSERVABILITY" title="CloudWatch" detail={logGroup?.name || 'Not created'} active={Boolean(logGroup)} /></div>
      <p className="diagram-caption">A conceptual view of your sandbox. No AWS resources are created.</p>
    </section>
  );
}
