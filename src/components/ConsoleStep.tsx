import { useEffect, useState } from 'react';
import type { LabConfiguration, LabResource, LabStep } from '../types';

type Props = {
  serviceId: string;
  serviceName: string;
  step: LabStep;
  configuration: LabConfiguration;
  onChange: (next: LabConfiguration) => void;
};

const serviceTypes: Record<string, LabResource['type'][]> = {
  s3: ['s3Bucket'],
  cloudfront: ['cloudFrontDistribution'],
  lambda: ['lambdaFunction'],
  'api-gateway': ['apiRoute'],
  dynamodb: ['dynamoTable'],
  iam: ['iamPolicy'],
  cloudwatch: ['cloudWatchLogGroup', 'cloudWatchAlarm'],
};

const descriptions: Record<string, string> = {
  s3: 'Store the static files that make up the web application.',
  cloudfront: 'Deliver the site from an edge network while keeping its S3 origin private.',
  lambda: 'Run application code on demand, without managing a server.',
  'api-gateway': 'Define HTTP routes that receive requests and invoke your function.',
  dynamodb: 'Store application items in a managed key-value and document database.',
  iam: 'Control which resources a function can access and which actions it may perform.',
  cloudwatch: 'Keep function logs and create alarms for important signals.',
};

function makeResource(serviceId: string, configuration: LabConfiguration): LabResource | null {
  const id = crypto.randomUUID();
  const functionId = configuration.resources.find((resource) => resource.type === 'lambdaFunction')?.id ?? '';
  const bucketId = configuration.resources.find((resource) => resource.type === 's3Bucket')?.id ?? '';
  const tableId = configuration.resources.find((resource) => resource.type === 'dynamoTable')?.id ?? '';
  switch (serviceId) {
    case 's3': return { id, type: 's3Bucket', name: '', blockPublicAccess: false };
    case 'cloudfront': return { id, type: 'cloudFrontDistribution', name: '', originBucketId: bucketId, enabled: true, originAccessControl: false };
    case 'lambda': return { id, type: 'lambdaFunction', name: '' };
    case 'api-gateway': return { id, type: 'apiRoute', name: 'items-route', path: '/api/items', method: 'GET', lambdaId: functionId };
    case 'dynamodb': return { id, type: 'dynamoTable', name: '', partitionKey: 'id' };
    case 'iam': return { id, type: 'iamPolicy', name: 'function-table-access', lambdaId: functionId, tableId, accessLevel: 'none' };
    case 'cloudwatch':
    case 'cloudwatch-log-group': return { id, type: 'cloudWatchLogGroup', name: '/aws/lambda/app-function', lambdaId: functionId, retentionDays: 0 };
    case 'cloudwatch-alarm': return { id, type: 'cloudWatchAlarm', name: 'function-errors', lambdaId: functionId, metric: 'Invocations' };
    default: return null;
  }
}

function resourceTypeLabel(resource: LabResource) {
  switch (resource.type) {
    case 's3Bucket': return 'Bucket';
    case 'cloudFrontDistribution': return 'Distribution';
    case 'lambdaFunction': return 'Function';
    case 'apiRoute': return 'Route';
    case 'dynamoTable': return 'Table';
    case 'iamPolicy': return 'Policy';
    case 'cloudWatchLogGroup': return 'Log group';
    case 'cloudWatchAlarm': return 'Alarm';
  }
}

function resourceTitle(resource: LabResource) {
  if (resource.type === 'apiRoute') return `${resource.method} ${resource.path || '(no path)'}`;
  return resource.name || `Unnamed ${resourceTypeLabel(resource).toLowerCase()}`;
}

function resourceTone(resource: LabResource) {
  switch (resource.type) {
    case 's3Bucket': return 'storage';
    case 'cloudFrontDistribution':
    case 'apiRoute': return 'networking';
    case 'lambdaFunction': return 'compute';
    case 'dynamoTable': return 'database';
    case 'iamPolicy': return 'security';
    case 'cloudWatchLogGroup':
    case 'cloudWatchAlarm': return 'management';
  }
}

function resourceHealth(resource: LabResource) {
  switch (resource.type) {
    case 's3Bucket':
      return resource.name && resource.blockPublicAccess ? { label: 'Private', tone: 'ready' } : { label: resource.name ? 'Public access open' : 'Needs configuration', tone: 'warning' };
    case 'cloudFrontDistribution':
      return resource.name && resource.originBucketId && resource.enabled && resource.originAccessControl ? { label: 'Origin protected', tone: 'ready' } : { label: 'Needs attention', tone: 'warning' };
    case 'lambdaFunction':
      return resource.name ? { label: 'Configured', tone: 'ready' } : { label: 'Needs a name', tone: 'warning' };
    case 'apiRoute':
      return resource.name && resource.path.startsWith('/') && resource.lambdaId ? { label: 'Integration set', tone: 'ready' } : { label: 'Incomplete', tone: 'warning' };
    case 'dynamoTable':
      return resource.name && resource.partitionKey ? { label: 'Key configured', tone: 'ready' } : { label: 'Incomplete', tone: 'warning' };
    case 'iamPolicy':
      return resource.accessLevel === 'admin' ? { label: 'Broad access', tone: 'danger' } : resource.accessLevel === 'read-write' && resource.lambdaId && resource.tableId ? { label: 'Scoped access', tone: 'ready' } : { label: 'Review permissions', tone: 'warning' };
    case 'cloudWatchLogGroup':
      return resource.retentionDays >= 7 && resource.lambdaId ? { label: `${resource.retentionDays}-day retention`, tone: 'ready' } : { label: 'Review retention', tone: 'warning' };
    case 'cloudWatchAlarm':
      return resource.metric === 'Errors' && resource.lambdaId ? { label: 'Monitoring errors', tone: 'ready' } : { label: 'Review metric', tone: 'warning' };
  }
}

function ResourceForm({
  resource,
  configuration,
  onPatch,
}: {
  resource: LabResource;
  configuration: LabConfiguration;
  onPatch: (patch: Partial<LabResource>) => void;
}) {
  const buckets = configuration.resources.filter((item) => item.type === 's3Bucket');
  const functions = configuration.resources.filter((item) => item.type === 'lambdaFunction');
  const tables = configuration.resources.filter((item) => item.type === 'dynamoTable');
  const text = (label: string, value: string, patch: Partial<LabResource>, placeholder = '') => (
    <label className="resource-field"><span>{label}</span><input autoFocus={label !== 'Route path'} value={value} placeholder={placeholder} onChange={(event) => onPatch({ ...patch, [label === 'Route path' ? 'path' : 'name']: event.target.value })} /></label>
  );
  const select = (label: string, value: string, onSelect: (value: string) => void, options: Array<{ value: string; label: string }>) => (
    <label className="resource-field"><span>{label}</span><select value={value} onChange={(event) => onSelect(event.target.value)}><option value="">Select a resource</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  );
  const toggle = (label: string, checked: boolean, onToggle: (checked: boolean) => void, help: string) => (
    <label className="resource-toggle"><span><strong>{label}</strong><small>{help}</small></span><input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} /></label>
  );

  switch (resource.type) {
    case 's3Bucket':
      return <>{text('Bucket name', resource.name, { name: resource.name }, 'my-web-assets')}{toggle('Block all public access', resource.blockPublicAccess, (blockPublicAccess) => onPatch({ blockPublicAccess }), 'Keep this bucket private; CloudFront will serve the files.')}</>;
    case 'cloudFrontDistribution':
      return <>{text('Distribution name', resource.name, { name: resource.name }, 'site-delivery')}{select('Origin bucket', resource.originBucketId, (originBucketId) => onPatch({ originBucketId }), buckets.map((bucket) => ({ value: bucket.id, label: bucket.name || 'Unnamed bucket' })))}{toggle('Distribution enabled', resource.enabled, (enabled) => onPatch({ enabled }), 'An enabled distribution can serve requests.')}{toggle('Origin Access Control', resource.originAccessControl, (originAccessControl) => onPatch({ originAccessControl }), 'Allow CloudFront to read the private bucket.')}</>;
    case 'lambdaFunction':
      return <>{text('Function name', resource.name, { name: resource.name }, 'app-function')}<p className="field-help">This function will be connected to an API route and application data.</p></>;
    case 'apiRoute':
      return <>{text('Route name', resource.name, { name: resource.name }, 'items-route')}<label className="resource-field"><span>Route path</span><input value={resource.path} placeholder="/api/items" onChange={(event) => onPatch({ path: event.target.value })} /></label><label className="resource-field"><span>HTTP method</span><select value={resource.method} onChange={(event) => onPatch({ method: event.target.value as typeof resource.method })}><option value="GET">GET</option><option value="POST">POST</option><option value="ANY">ANY</option></select></label>{select('Lambda integration', resource.lambdaId, (lambdaId) => onPatch({ lambdaId }), functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })))}</>;
    case 'dynamoTable':
      return <>{text('Table name', resource.name, { name: resource.name }, 'app-items')}<label className="resource-field"><span>Partition key</span><input value={resource.partitionKey} placeholder="id" onChange={(event) => onPatch({ partitionKey: event.target.value })} /></label></>;
    case 'iamPolicy':
      return <>{text('Policy name', resource.name, { name: resource.name }, 'function-table-access')}{select('Lambda function', resource.lambdaId, (lambdaId) => onPatch({ lambdaId }), functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })))}{select('DynamoDB table', resource.tableId, (tableId) => onPatch({ tableId }), tables.map((table) => ({ value: table.id, label: table.name || 'Unnamed table' })))}<label className="resource-field"><span>Access level</span><select value={resource.accessLevel} onChange={(event) => onPatch({ accessLevel: event.target.value as typeof resource.accessLevel })}><option value="none">No access</option><option value="read">Read only</option><option value="read-write">Read and write on this table</option><option value="admin">Administrator access</option></select></label></>;
    case 'cloudWatchLogGroup':
      return <>{text('Log group name', resource.name, { name: resource.name }, '/aws/lambda/app-function')}{select('Lambda function', resource.lambdaId, (lambdaId) => onPatch({ lambdaId }), functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })))}<label className="resource-field"><span>Retention period</span><select value={resource.retentionDays} onChange={(event) => onPatch({ retentionDays: Number(event.target.value) })}><option value={0}>Never expire</option><option value={1}>1 day</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label></>;
    case 'cloudWatchAlarm':
      return <>{text('Alarm name', resource.name, { name: resource.name }, 'function-errors')}{select('Lambda function', resource.lambdaId, (lambdaId) => onPatch({ lambdaId }), functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })))}<label className="resource-field"><span>Metric</span><select value={resource.metric} onChange={(event) => onPatch({ metric: event.target.value as typeof resource.metric })}><option value="Errors">Errors</option><option value="Invocations">Invocations</option></select></label></>;
  }
}

export default function ConsoleStep({ serviceId, serviceName, step, configuration, onChange }: Props) {
  const types = serviceTypes[serviceId] ?? [];
  const serviceResources = configuration.resources.filter((resource) => types.includes(resource.type));
  const [formResource, setFormResource] = useState<LabResource | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const selected = serviceResources.find((resource) => resource.id === selectedId) ?? null;
  const formIsOpen = Boolean(formResource);

  useEffect(() => {
    if (!formIsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFormResource(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [formIsOpen]);

  function openCreate() {
    const resource = makeResource(serviceId, configuration);
    if (!resource) return;
    setFormResource(resource);
    setEditing(false);
  }

  function openCreateAlarm() {
    const resource = makeResource('cloudwatch-alarm', configuration);
    if (!resource) return;
    setFormResource(resource);
    setEditing(false);
  }

  function saveResource() {
    if (!formResource) return;
    const exists = configuration.resources.some((item) => item.id === formResource.id);
    const resources = exists
      ? configuration.resources.map((item) => item.id === formResource.id ? formResource : item)
      : [...configuration.resources, formResource];
    onChange({ resources });
    setSelectedId(formResource.id);
    setNotice(`${resourceTypeLabel(formResource)} saved in this sandbox.`);
    setFormResource(null);
  }

  function removeResource(resource: LabResource) {
    onChange({ resources: configuration.resources.filter((item) => item.id !== resource.id) });
    setSelectedId(null);
    setNotice(`${resourceTypeLabel(resource)} deleted from this sandbox.`);
  }

  function patchForm(patch: Partial<LabResource>) {
    setFormResource((current) => current ? ({ ...current, ...patch } as LabResource) : current);
  }

  return (
    <section className="service-screen" aria-labelledby="service-title">
      <div className="console-breadcrumb"><span>Cloud services</span><span aria-hidden="true">/</span><strong>{serviceName}</strong></div>
      <header className="service-heading"><div><span className={`service-symbol tone-${resourceToneForService(serviceId)}`} aria-hidden="true">{serviceName.split(' ').at(-1)?.slice(0, 2).toUpperCase()}</span><div><h1 id="service-title">{serviceName}</h1><p>{descriptions[serviceId]}</p></div></div><div className="service-heading__actions">{serviceId === 'cloudwatch' ? <><button className="button button--outline" type="button" onClick={openCreate}>Create log group <span aria-hidden="true">+</span></button><button className="button button--primary" type="button" onClick={openCreateAlarm}>Create alarm <span aria-hidden="true">+</span></button></> : <button className="button button--primary" type="button" onClick={openCreate}>Create {serviceId === 's3' ? 'bucket' : serviceId === 'cloudfront' ? 'distribution' : serviceId === 'lambda' ? 'function' : serviceId === 'api-gateway' ? 'route' : serviceId === 'dynamodb' ? 'table' : 'policy'} <span aria-hidden="true">+</span></button>}</div></header>
      <div className="service-context"><strong>{step.title}</strong><span>{step.goal}</span></div>
      <div className="resource-panel">
        <div className="resource-panel__header"><div><h2>Resources</h2><span>{serviceResources.length} {serviceResources.length === 1 ? 'resource' : 'resources'}</span></div><div className="resource-panel__buttons">{serviceId === 'cloudwatch' ? <><button className="button button--outline button--small" type="button" onClick={openCreate}>Create log group</button><button className="button button--outline button--small" type="button" onClick={openCreateAlarm}>Create alarm</button></> : <button className="button button--outline button--small" type="button" onClick={openCreate}>Create new</button>}</div></div>
        {serviceResources.length ? <div className="resource-table-wrap"><table className="resource-table"><thead><tr><th>Name</th><th>Type</th><th>Configuration status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{serviceResources.map((resource) => { const health = resourceHealth(resource); const tone = resourceTone(resource); return <tr key={resource.id}><td><button className="resource-name" type="button" onClick={() => setSelectedId(resource.id)}>{resourceTitle(resource)}</button><small>{resource.id.slice(0, 8)}</small></td><td><span className={`resource-type-badge tone-${tone}`}>{resourceTypeLabel(resource)}</span></td><td><span className={`resource-status status-${health.tone}`}><i />{health.label}</span></td><td className="resource-actions"><button type="button" aria-label={`View ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`} onClick={() => setSelectedId(resource.id)}>View</button><button type="button" aria-label={`Edit ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`} onClick={() => { setFormResource(resource); setEditing(true); }}>Edit</button><button className="danger-link" type="button" aria-label={`Delete ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`} onClick={() => removeResource(resource)}>Delete</button></td></tr>; })}</tbody></table></div> : <div className="empty-resources"><span aria-hidden="true">＋</span><strong>No resources yet</strong><p>Create a resource to start configuring this service. Changes stay in this browser and never reach AWS.</p>{serviceId === 'cloudwatch' ? <div className="empty-resources__actions"><button className="button button--outline" type="button" onClick={openCreate}>Create log group</button><button className="button button--outline" type="button" onClick={openCreateAlarm}>Create alarm</button></div> : <button className="button button--outline" type="button" onClick={openCreate}>Create your first resource</button>}</div>}
      </div>
      {selected ? <section className="resource-detail" aria-labelledby="resource-detail-title"><div className="resource-detail__head"><div><span className="eyebrow">RESOURCE DETAILS</span><h2 id="resource-detail-title">{resourceTitle(selected)}</h2></div><button className="icon-button" type="button" onClick={() => setSelectedId(null)} aria-label="Close resource details">×</button></div><dl><div><dt>Resource type</dt><dd>{resourceTypeLabel(selected)}</dd></div><div><dt>Sandbox identifier</dt><dd><code>{selected.id}</code></dd></div><div><dt>Configuration</dt><dd>{resourceSummary(selected, configuration)}</dd></div></dl><div className="resource-detail__actions"><button className="button button--outline button--small" type="button" onClick={() => { setFormResource(selected); setEditing(true); }}>Edit resource</button><button className="text-button danger-link" type="button" onClick={() => removeResource(selected)}>Delete</button></div></section> : null}
      {notice ? <p className="inline-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></p> : null}
      {formResource ? <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormResource(null); }}><div className="dialog-card resource-dialog" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title"><button className="dialog-close" type="button" onClick={() => setFormResource(null)} aria-label="Close">×</button><span className="eyebrow">{editing ? 'EDIT RESOURCE' : 'NEW RESOURCE'}</span><h2 id="resource-dialog-title">{editing ? 'Update configuration' : `Create ${resourceTypeLabel(formResource).toLowerCase()}`}</h2><p className="dialog-intro">Changes are simulated and can be edited or deleted at any time.</p><div className="resource-form"><ResourceForm resource={formResource} configuration={configuration} onPatch={patchForm} /></div><div className="resource-dialog__actions"><button className="button button--outline" type="button" onClick={() => setFormResource(null)}>Cancel</button><button className="button button--primary" type="button" onClick={saveResource}>{editing ? 'Save changes' : 'Create resource'}</button></div></div></div> : null}
    </section>
  );
}

function resourceToneForService(serviceId: string) {
  if (serviceId === 's3') return 'storage';
  if (serviceId === 'cloudfront' || serviceId === 'api-gateway') return 'networking';
  if (serviceId === 'lambda') return 'compute';
  if (serviceId === 'dynamodb') return 'database';
  if (serviceId === 'iam') return 'security';
  return 'management';
}

function resourceSummary(resource: LabResource, configuration: LabConfiguration) {
  const nameOf = (id: string) => configuration.resources.find((item) => item.id === id)?.name || 'Not selected';
  switch (resource.type) {
    case 's3Bucket': return `Public access ${resource.blockPublicAccess ? 'blocked' : 'not blocked'}`;
    case 'cloudFrontDistribution': return `Origin: ${nameOf(resource.originBucketId)} · ${resource.originAccessControl ? 'Origin Access Control enabled' : 'Origin Access Control disabled'}`;
    case 'lambdaFunction': return 'Function code is represented by this simulated resource.';
    case 'apiRoute': return `${resource.method} ${resource.path} · Lambda: ${nameOf(resource.lambdaId)}`;
    case 'dynamoTable': return `Partition key: ${resource.partitionKey || 'Not set'}`;
    case 'iamPolicy': return `${resource.accessLevel} access · ${nameOf(resource.lambdaId)} → ${nameOf(resource.tableId)}`;
    case 'cloudWatchLogGroup': return `${resource.retentionDays || 'Never expire'} day(s) · ${nameOf(resource.lambdaId)}`;
    case 'cloudWatchAlarm': return `${resource.metric} metric · ${nameOf(resource.lambdaId)}`;
  }
}
