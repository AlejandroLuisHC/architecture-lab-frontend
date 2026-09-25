import type { LabConfiguration } from '../types';

type Props = { configuration: LabConfiguration; compact?: boolean };

function ServiceNode({
  eyebrow,
  name,
  detail,
  active,
  tone,
}: {
  eyebrow: string;
  name: string;
  detail: string;
  active: boolean;
  tone: 'violet' | 'blue' | 'teal' | 'amber';
}) {
  return (
    <div className={`diagram-node diagram-node--${tone} ${active ? 'is-active' : ''}`}>
      <span className="diagram-node__dot" aria-hidden="true" />
      <span className="diagram-node__copy">
        <span className="diagram-node__eyebrow">{eyebrow}</span>
        <strong>{name}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return <span className={`diagram-connector ${active ? 'is-active' : ''}`} aria-hidden="true">→</span>;
}

export default function ArchitectureDiagram({ configuration, compact = false }: Props) {
  const deliveryReady = configuration.storage.cloudFrontEnabled;
  const apiReady = configuration.api.lambdaConnected;
  const dataReady = configuration.data.lambdaTableConnected;
  const logsReady = configuration.observability.logsEnabled;

  return (
    <div className={`architecture-diagram ${compact ? 'architecture-diagram--compact' : ''}`}>
      <div className="diagram-title-row">
        <span className="diagram-kicker">LIVE TOPOLOGY</span>
        <span className="diagram-live"><span /> SIMULATED</span>
      </div>
      <div className="diagram-lane-label">FRONTEND DELIVERY</div>
      <div className="diagram-flow">
        <ServiceNode eyebrow="CLIENT" name="Browser" detail="Your visitors" active tone="violet" />
        <Connector active={deliveryReady} />
        <ServiceNode eyebrow="CDN" name="CloudFront" detail={configuration.storage.originAccessControl ? 'Private origin' : 'Origin pending'} active={deliveryReady} tone="blue" />
        <Connector active={deliveryReady && configuration.storage.originAccessControl} />
        <ServiceNode eyebrow="STORAGE" name="S3" detail={configuration.storage.bucketName || 'Bucket pending'} active={Boolean(configuration.storage.bucketName)} tone="teal" />
      </div>
      <div className="diagram-lane-label">APPLICATION & DATA</div>
      <div className="diagram-flow">
        <ServiceNode eyebrow="ENTRY" name="API Gateway" detail={configuration.api.route || 'Route pending'} active={Boolean(configuration.api.route)} tone="violet" />
        <Connector active={apiReady} />
        <ServiceNode eyebrow="COMPUTE" name="Lambda" detail={apiReady ? 'Connected' : 'Integration pending'} active={apiReady} tone="blue" />
        <Connector active={dataReady} />
        <ServiceNode eyebrow="DATABASE" name="DynamoDB" detail={configuration.data.tableName || 'Table pending'} active={Boolean(configuration.data.tableName)} tone="teal" />
      </div>
      <div className="diagram-monitor">
        <span className={`diagram-monitor__line ${logsReady ? 'is-active' : ''}`} aria-hidden="true" />
        <ServiceNode eyebrow="OBSERVABILITY" name="CloudWatch" detail={logsReady ? 'Logs enabled' : 'Logs pending'} active={logsReady} tone="amber" />
      </div>
      <p className="diagram-caption">A conceptual map of your choices. No AWS resources are created.</p>
    </div>
  );
}
