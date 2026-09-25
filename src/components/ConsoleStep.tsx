import type { Evaluation, LabConfiguration, LabStep } from '../types';

type Props = {
  step: LabStep;
  index: number;
  configuration: LabConfiguration;
  evaluation: Evaluation | null;
  showFeedback: boolean;
  checking: boolean;
  onChange: (next: LabConfiguration) => void;
  onCheck: () => void;
  onContinue: () => void;
};

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="console-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch" aria-hidden="true"><span /></span>
    </label>
  );
}

export default function ConsoleStep({
  step,
  index,
  configuration,
  evaluation,
  showFeedback,
  checking,
  onChange,
  onCheck,
  onContinue,
}: Props) {
  const result = evaluation?.steps[index];
  const update = <K extends keyof LabConfiguration>(section: K, patch: Partial<LabConfiguration[K]>) => {
    onChange({ ...configuration, [section]: { ...configuration[section], ...patch } });
  };

  return (
    <section className="console-step" aria-labelledby="step-title">
      <div className="step-heading">
        <div>
          <span className="eyebrow">STAGE {step.number} / 04</span>
          <h1 id="step-title">{step.title}</h1>
          <p>{step.goal}</p>
        </div>
        <div className="step-service-tags">
          {step.services.map((service) => <span key={service}>{service}</span>)}
        </div>
      </div>

      <div className="objective-card">
        <span className="objective-card__icon" aria-hidden="true">✦</span>
        <div><strong>Why this matters</strong><p>{step.concept}</p></div>
      </div>

      <div className="console-card">
        <div className="console-card__head">
          <div><span className="console-card__overline">SIMULATED CONFIGURATION</span><h2>{step.services.join(' + ')}</h2></div>
          <span className="console-card__status"><span /> DRAFT</span>
        </div>

        {step.id === 'delivery' ? (
          <div className="form-stack">
            <label className="field-label" htmlFor="bucket-name">S3 bucket name</label>
            <input id="bucket-name" value={configuration.storage.bucketName} onChange={(event) => update('storage', { bucketName: event.target.value })} placeholder="my-web-assets" autoComplete="off" />
            <p className="field-help">Choose a lowercase name for your site's files.</p>
            <div className="form-divider" />
            <Toggle label="Block all public access" description="Visitors should reach the site through CloudFront, not directly through S3." checked={configuration.storage.blockPublicAccess} onChange={(value) => update('storage', { blockPublicAccess: value })} />
            <Toggle label="Enable CloudFront distribution" description="Cache and deliver the site close to your visitors." checked={configuration.storage.cloudFrontEnabled} onChange={(value) => update('storage', { cloudFrontEnabled: value })} />
            <Toggle label="Use Origin Access Control" description="Allow CloudFront to read your private bucket." checked={configuration.storage.originAccessControl} onChange={(value) => update('storage', { originAccessControl: value })} />
          </div>
        ) : null}

        {step.id === 'api' ? (
          <div className="form-stack">
            <label className="field-label" htmlFor="api-route">API Gateway route</label>
            <input id="api-route" value={configuration.api.route} onChange={(event) => update('api', { route: event.target.value })} placeholder="/api/items" autoComplete="off" />
            <p className="field-help">The sample app reads and creates items at this path.</p>
            <label className="field-label" htmlFor="api-method">HTTP method</label>
            <select id="api-method" value={configuration.api.method} onChange={(event) => update('api', { method: event.target.value as LabConfiguration['api']['method'] })}>
              <option value="GET">GET — read only</option>
              <option value="POST">POST — write only</option>
              <option value="ANY">ANY — reads and writes</option>
            </select>
            <div className="form-divider" />
            <Toggle label="Connect route to Lambda" description="Send matching requests to your serverless function." checked={configuration.api.lambdaConnected} onChange={(value) => update('api', { lambdaConnected: value })} />
          </div>
        ) : null}

        {step.id === 'data' ? (
          <div className="form-stack">
            <label className="field-label" htmlFor="table-name">DynamoDB table name</label>
            <input id="table-name" value={configuration.data.tableName} onChange={(event) => update('data', { tableName: event.target.value })} placeholder="app-items" autoComplete="off" />
            <label className="field-label" htmlFor="partition-key">Partition key</label>
            <input id="partition-key" value={configuration.data.partitionKey} onChange={(event) => update('data', { partitionKey: event.target.value })} placeholder="id" autoComplete="off" />
            <div className="form-divider" />
            <Toggle label="Connect Lambda to this table" description="Let the function use this table for application data." checked={configuration.data.lambdaTableConnected} onChange={(value) => update('data', { lambdaTableConnected: value })} />
            <label className="field-label" htmlFor="permissions">Lambda IAM permissions</label>
            <select id="permissions" value={configuration.data.permissions} onChange={(event) => update('data', { permissions: event.target.value as LabConfiguration['data']['permissions'] })}>
              <option value="none">No table access</option>
              <option value="read">Read only</option>
              <option value="read-write">Read and write on this table</option>
              <option value="admin">Administrator access</option>
            </select>
            <p className="field-help">Give the function the smallest set of permissions that supports the app.</p>
          </div>
        ) : null}

        {step.id === 'observe' ? (
          <div className="form-stack">
            <Toggle label="Enable Lambda logs" description="Record function output and errors in CloudWatch." checked={configuration.observability.logsEnabled} onChange={(value) => update('observability', { logsEnabled: value })} />
            <label className="field-label" htmlFor="retention">Log retention</label>
            <select id="retention" value={configuration.observability.retentionDays} onChange={(event) => update('observability', { retentionDays: Number(event.target.value) })}>
              <option value={0}>Not configured</option>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <div className="form-divider" />
            <Toggle label="Create an error alarm" description="Surface function errors as soon as they occur." checked={configuration.observability.errorAlarmEnabled} onChange={(value) => update('observability', { errorAlarmEnabled: value })} />
          </div>
        ) : null}
      </div>

      <div className="step-bottom">
        <div className="step-checklist">
          <strong>YOUR OBJECTIVES</strong>
          <ul>{step.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ul>
        </div>
        <button className="button button--primary" type="button" onClick={onCheck} disabled={checking}>
          {checking ? 'Checking…' : 'Check this stage'} <span aria-hidden="true">→</span>
        </button>
      </div>

      {showFeedback && result ? (
        <div className={`feedback-panel ${result.passed ? 'feedback-panel--success' : ''}`} role="status">
          <div className="feedback-panel__head">
            <span className="feedback-panel__icon" aria-hidden="true">{result.passed ? '✓' : '!'}</span>
            <div><strong>{result.passed ? 'Stage complete' : 'A few things to fix'}</strong><p>{result.passed ? 'Your configuration meets the goal for this stage.' : 'Review the checks below, then try again.'}</p></div>
          </div>
          <ul className="feedback-list">
            {result.checks.map((item) => (
              <li key={item.id} className={item.passed ? 'is-passed' : ''}>
                <span aria-hidden="true">{item.passed ? '✓' : '×'}</span>
                <div><strong>{item.label}</strong>{!item.passed ? <p>{item.hint}</p> : null}</div>
              </li>
            ))}
          </ul>
          {result.passed ? <button className="button button--dark" type="button" onClick={onContinue}>{index === 3 ? 'View your architecture' : 'Continue to next stage'} <span aria-hidden="true">→</span></button> : null}
        </div>
      ) : null}
    </section>
  );
}
