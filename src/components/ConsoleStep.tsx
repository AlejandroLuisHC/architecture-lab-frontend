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
    const functionId =
        configuration.resources.find((resource) => resource.type === 'lambdaFunction')?.id ?? '';
    const bucketId = configuration.resources.find((resource) => resource.type === 's3Bucket')?.id ?? '';
    const tableId = configuration.resources.find((resource) => resource.type === 'dynamoTable')?.id ?? '';
    const factories: Record<string, () => LabResource> = {
        s3: () => ({ id, type: 's3Bucket', name: '', blockPublicAccess: false }),
        cloudfront: () => ({
            id,
            type: 'cloudFrontDistribution',
            name: '',
            originBucketId: bucketId,
            enabled: true,
            originAccessControl: false,
        }),
        lambda: () => ({ id, type: 'lambdaFunction', name: '' }),
        'api-gateway': () => ({
            id,
            type: 'apiRoute',
            name: 'items-route',
            path: '/api/items',
            method: 'GET',
            lambdaId: functionId,
        }),
        dynamodb: () => ({ id, type: 'dynamoTable', name: '', partitionKey: 'id' }),
        iam: () => ({
            id,
            type: 'iamPolicy',
            name: 'function-table-access',
            lambdaId: functionId,
            tableId,
            accessLevel: 'none',
        }),
        cloudwatch: () => ({
            id,
            type: 'cloudWatchLogGroup',
            name: '/aws/lambda/app-function',
            lambdaId: functionId,
            retentionDays: 0,
        }),
        'cloudwatch-log-group': () => ({
            id,
            type: 'cloudWatchLogGroup',
            name: '/aws/lambda/app-function',
            lambdaId: functionId,
            retentionDays: 0,
        }),
        'cloudwatch-alarm': () => ({
            id,
            type: 'cloudWatchAlarm',
            name: 'function-errors',
            lambdaId: functionId,
            metric: 'Invocations',
        }),
    };
    return factories[serviceId]?.() ?? null;
}

function resourceTypeLabel(resource: LabResource) {
    switch (resource.type) {
        case 's3Bucket':
            return 'Bucket';
        case 'cloudFrontDistribution':
            return 'Distribution';
        case 'lambdaFunction':
            return 'Function';
        case 'apiRoute':
            return 'Route';
        case 'dynamoTable':
            return 'Table';
        case 'iamPolicy':
            return 'Policy';
        case 'cloudWatchLogGroup':
            return 'Log group';
        case 'cloudWatchAlarm':
            return 'Alarm';
        case 'awsResource':
            return serviceNamesForResource(resource.service);
    }
}

function resourceTitle(resource: LabResource) {
    if (resource.type === 'apiRoute') return `${resource.method} ${resource.path || '(no path)'}`;
    return resource.name || `Unnamed ${resourceTypeLabel(resource).toLowerCase()}`;
}

function resourceTone(resource: LabResource) {
    if (resource.type === 'awsResource') return awsResourceTone(resource.service);
    return legacyResourceTones[resource.type];
}

const legacyResourceTones: Record<Exclude<LabResource, { type: 'awsResource' }>['type'], string> = {
    s3Bucket: 'storage',
    cloudFrontDistribution: 'networking',
    lambdaFunction: 'compute',
    apiRoute: 'networking',
    dynamoTable: 'database',
    iamPolicy: 'security',
    cloudWatchLogGroup: 'management',
    cloudWatchAlarm: 'management',
};

function awsResourceTone(service: string): string {
    if (['ec2', 'ecs', 'lambda'].includes(service)) return 'compute';
    if (service === 'efs' || service === 's3') return 'storage';
    if (service === 'aurora' || service === 'dynamodb') return 'database';
    if (['vpc', 'loadBalancer', 'route53', 'cloudfront', 'apiGateway'].includes(service)) return 'networking';
    if (['kms', 'secretsManager', 'iam'].includes(service)) return 'security';
    return 'management';
}

type Health = { label: string; tone: 'ready' | 'warning' | 'danger' };

function s3Health(resource: Extract<LabResource, { type: 's3Bucket' }>): Health {
    return resource.name && resource.blockPublicAccess
        ? { label: 'Private', tone: 'ready' }
        : { label: resource.name ? 'Public access open' : 'Needs configuration', tone: 'warning' };
}

function cloudFrontHealth(resource: Extract<LabResource, { type: 'cloudFrontDistribution' }>): Health {
    const protectedOrigin =
        resource.name && resource.originBucketId && resource.enabled && resource.originAccessControl;
    return protectedOrigin
        ? { label: 'Origin protected', tone: 'ready' }
        : { label: 'Needs attention', tone: 'warning' };
}

function lambdaHealth(resource: Extract<LabResource, { type: 'lambdaFunction' }>): Health {
    return resource.name
        ? { label: 'Configured', tone: 'ready' }
        : { label: 'Needs a name', tone: 'warning' };
}

function routeHealth(resource: Extract<LabResource, { type: 'apiRoute' }>): Health {
    return resource.name && resource.path.startsWith('/') && resource.lambdaId
        ? { label: 'Integration set', tone: 'ready' }
        : { label: 'Incomplete', tone: 'warning' };
}

function tableHealth(resource: Extract<LabResource, { type: 'dynamoTable' }>): Health {
    return resource.name && resource.partitionKey
        ? { label: 'Key configured', tone: 'ready' }
        : { label: 'Incomplete', tone: 'warning' };
}

function policyHealth(resource: Extract<LabResource, { type: 'iamPolicy' }>): Health {
    if (resource.accessLevel === 'admin') return { label: 'Broad access', tone: 'danger' };
    return resource.accessLevel === 'read-write' && resource.lambdaId && resource.tableId
        ? { label: 'Scoped access', tone: 'ready' }
        : { label: 'Review permissions', tone: 'warning' };
}

function logGroupHealth(resource: Extract<LabResource, { type: 'cloudWatchLogGroup' }>): Health {
    return resource.retentionDays >= 7 && resource.lambdaId
        ? { label: `${resource.retentionDays}-day retention`, tone: 'ready' }
        : { label: 'Review retention', tone: 'warning' };
}

function alarmHealth(resource: Extract<LabResource, { type: 'cloudWatchAlarm' }>): Health {
    return resource.metric === 'Errors' && resource.lambdaId
        ? { label: 'Monitoring errors', tone: 'ready' }
        : { label: 'Review metric', tone: 'warning' };
}

function genericHealth(resource: Extract<LabResource, { type: 'awsResource' }>): Health {
    return resource.name
        ? { label: 'Configured', tone: 'ready' }
        : { label: 'Needs a name', tone: 'warning' };
}

function resourceHealth(resource: LabResource): Health {
    switch (resource.type) {
        case 's3Bucket':
            return s3Health(resource);
        case 'cloudFrontDistribution':
            return cloudFrontHealth(resource);
        case 'lambdaFunction':
            return lambdaHealth(resource);
        case 'apiRoute':
            return routeHealth(resource);
        case 'dynamoTable':
            return tableHealth(resource);
        case 'iamPolicy':
            return policyHealth(resource);
        case 'cloudWatchLogGroup':
            return logGroupHealth(resource);
        case 'cloudWatchAlarm':
            return alarmHealth(resource);
        case 'awsResource':
            return genericHealth(resource);
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
        <label className="resource-field">
            <span>{label}</span>
            <input
                autoFocus={label !== 'Route path'}
                value={value}
                placeholder={placeholder}
                onChange={(event) =>
                    onPatch({ ...patch, [label === 'Route path' ? 'path' : 'name']: event.target.value })
                }
            />
        </label>
    );
    const select = (
        label: string,
        value: string,
        onSelect: (value: string) => void,
        options: Array<{ value: string; label: string }>,
    ) => (
        <label className="resource-field">
            <span>{label}</span>
            <select value={value} onChange={(event) => onSelect(event.target.value)}>
                <option value="">Select a resource</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
    const toggle = (label: string, checked: boolean, onToggle: (checked: boolean) => void, help: string) => (
        <label className="resource-toggle">
            <span>
                <strong>{label}</strong>
                <small>{help}</small>
            </span>
            <input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} />
        </label>
    );

    switch (resource.type) {
        case 's3Bucket':
            return (
                <>
                    {text('Bucket name', resource.name, { name: resource.name }, 'my-web-assets')}
                    {toggle(
                        'Block all public access',
                        resource.blockPublicAccess,
                        (blockPublicAccess) => onPatch({ blockPublicAccess }),
                        'Keep this bucket private; CloudFront will serve the files.',
                    )}
                </>
            );
        case 'cloudFrontDistribution':
            return (
                <>
                    {text('Distribution name', resource.name, { name: resource.name }, 'site-delivery')}
                    {select(
                        'Origin bucket',
                        resource.originBucketId,
                        (originBucketId) => onPatch({ originBucketId }),
                        buckets.map((bucket) => ({
                            value: bucket.id,
                            label: bucket.name || 'Unnamed bucket',
                        })),
                    )}
                    {toggle(
                        'Distribution enabled',
                        resource.enabled,
                        (enabled) => onPatch({ enabled }),
                        'An enabled distribution can serve requests.',
                    )}
                    {toggle(
                        'Origin Access Control',
                        resource.originAccessControl,
                        (originAccessControl) => onPatch({ originAccessControl }),
                        'Allow CloudFront to read the private bucket.',
                    )}
                </>
            );
        case 'lambdaFunction':
            return (
                <>
                    {text('Function name', resource.name, { name: resource.name }, 'app-function')}
                    <p className="field-help">
                        This function will be connected to an API route and application data.
                    </p>
                </>
            );
        case 'apiRoute':
            return (
                <>
                    {text('Route name', resource.name, { name: resource.name }, 'items-route')}
                    <label className="resource-field">
                        <span>Route path</span>
                        <input
                            value={resource.path}
                            placeholder="/api/items"
                            onChange={(event) => onPatch({ path: event.target.value })}
                        />
                    </label>
                    <label className="resource-field">
                        <span>HTTP method</span>
                        <select
                            value={resource.method}
                            onChange={(event) =>
                                onPatch({ method: event.target.value as typeof resource.method })
                            }
                        >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="ANY">ANY</option>
                        </select>
                    </label>
                    {select(
                        'Lambda integration',
                        resource.lambdaId,
                        (lambdaId) => onPatch({ lambdaId }),
                        functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })),
                    )}
                </>
            );
        case 'dynamoTable':
            return (
                <>
                    {text('Table name', resource.name, { name: resource.name }, 'app-items')}
                    <label className="resource-field">
                        <span>Partition key</span>
                        <input
                            value={resource.partitionKey}
                            placeholder="id"
                            onChange={(event) => onPatch({ partitionKey: event.target.value })}
                        />
                    </label>
                </>
            );
        case 'iamPolicy':
            return (
                <>
                    {text('Policy name', resource.name, { name: resource.name }, 'function-table-access')}
                    {select(
                        'Lambda function',
                        resource.lambdaId,
                        (lambdaId) => onPatch({ lambdaId }),
                        functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })),
                    )}
                    {select(
                        'DynamoDB table',
                        resource.tableId,
                        (tableId) => onPatch({ tableId }),
                        tables.map((table) => ({ value: table.id, label: table.name || 'Unnamed table' })),
                    )}
                    <label className="resource-field">
                        <span>Access level</span>
                        <select
                            value={resource.accessLevel}
                            onChange={(event) =>
                                onPatch({ accessLevel: event.target.value as typeof resource.accessLevel })
                            }
                        >
                            <option value="none">No access</option>
                            <option value="read">Read only</option>
                            <option value="read-write">Read and write on this table</option>
                            <option value="admin">Administrator access</option>
                        </select>
                    </label>
                </>
            );
        case 'cloudWatchLogGroup':
            return (
                <>
                    {text(
                        'Log group name',
                        resource.name,
                        { name: resource.name },
                        '/aws/lambda/app-function',
                    )}
                    {select(
                        'Lambda function',
                        resource.lambdaId,
                        (lambdaId) => onPatch({ lambdaId }),
                        functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })),
                    )}
                    <label className="resource-field">
                        <span>Retention period</span>
                        <select
                            value={resource.retentionDays}
                            onChange={(event) => onPatch({ retentionDays: Number(event.target.value) })}
                        >
                            <option value={0}>Never expire</option>
                            <option value={1}>1 day</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                        </select>
                    </label>
                </>
            );
        case 'cloudWatchAlarm':
            return (
                <>
                    {text('Alarm name', resource.name, { name: resource.name }, 'function-errors')}
                    {select(
                        'Lambda function',
                        resource.lambdaId,
                        (lambdaId) => onPatch({ lambdaId }),
                        functions.map((fn) => ({ value: fn.id, label: fn.name || 'Unnamed function' })),
                    )}
                    <label className="resource-field">
                        <span>Metric</span>
                        <select
                            value={resource.metric}
                            onChange={(event) =>
                                onPatch({ metric: event.target.value as typeof resource.metric })
                            }
                        >
                            <option value="Errors">Errors</option>
                            <option value="Invocations">Invocations</option>
                        </select>
                    </label>
                </>
            );
    }
}

function createLabel(serviceId: string): string {
    const labels: Record<string, string> = {
        s3: 'bucket',
        cloudfront: 'distribution',
        lambda: 'function',
        'api-gateway': 'route',
        dynamodb: 'table',
    };
    return labels[serviceId] ?? 'policy';
}

function ServiceHeading({
    serviceId,
    serviceName,
    onCreate,
    onCreateAlarm,
}: {
    serviceId: string;
    serviceName: string;
    onCreate: () => void;
    onCreateAlarm: () => void;
}) {
    return (
        <header className="service-heading">
            <div>
                <span
                    className={`service-symbol tone-${resourceToneForService(serviceId)}`}
                    aria-hidden="true"
                >
                    {serviceName.split(' ').at(-1)?.slice(0, 2).toUpperCase()}
                </span>
                <div>
                    <h1 id="service-title">{serviceName}</h1>
                    <p>{descriptions[serviceId]}</p>
                </div>
            </div>
            <div className="service-heading__actions">
                {serviceId === 'cloudwatch' ? (
                    <>
                        <button className="button button--outline" type="button" onClick={onCreate}>
                            Create log group <span aria-hidden="true">+</span>
                        </button>
                        <button className="button button--primary" type="button" onClick={onCreateAlarm}>
                            Create alarm <span aria-hidden="true">+</span>
                        </button>
                    </>
                ) : (
                    <button className="button button--primary" type="button" onClick={onCreate}>
                        Create {createLabel(serviceId)} <span aria-hidden="true">+</span>
                    </button>
                )}
            </div>
        </header>
    );
}

function ResourceActions({
    resource,
    onView,
    onEdit,
    onDelete,
}: {
    resource: LabResource;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <td className="resource-actions">
            <button
                type="button"
                aria-label={`View ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`}
                onClick={onView}
            >
                View
            </button>
            <button
                type="button"
                aria-label={`Edit ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`}
                onClick={onEdit}
            >
                Edit
            </button>
            <button
                className="danger-link"
                type="button"
                aria-label={`Delete ${resourceTypeLabel(resource).toLowerCase()} ${resourceTitle(resource)}`}
                onClick={onDelete}
            >
                Delete
            </button>
        </td>
    );
}

function ResourceRow({
    resource,
    onSelect,
    onEdit,
    onDelete,
}: {
    resource: LabResource;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const health = resourceHealth(resource);
    const tone = resourceTone(resource);
    return (
        <tr>
            <td>
                <button className="resource-name" type="button" onClick={onSelect}>
                    {resourceTitle(resource)}
                </button>
                <small>{resource.id.slice(0, 8)}</small>
            </td>
            <td>
                <span className={`resource-type-badge tone-${tone}`}>{resourceTypeLabel(resource)}</span>
            </td>
            <td>
                <span className={`resource-status status-${health.tone}`}>
                    <i />
                    {health.label}
                </span>
            </td>
            <ResourceActions resource={resource} onView={onSelect} onEdit={onEdit} onDelete={onDelete} />
        </tr>
    );
}

function EmptyResourcePanel({
    serviceId,
    onCreate,
    onCreateAlarm,
}: {
    serviceId: string;
    onCreate: () => void;
    onCreateAlarm: () => void;
}) {
    return (
        <div className="empty-resources">
            <span aria-hidden="true">＋</span>
            <strong>No resources yet</strong>
            <p>
                Create a resource to start configuring this service. Changes stay in this browser and never
                reach AWS.
            </p>
            {serviceId === 'cloudwatch' ? (
                <div className="empty-resources__actions">
                    <button className="button button--outline" type="button" onClick={onCreate}>
                        Create log group
                    </button>
                    <button className="button button--outline" type="button" onClick={onCreateAlarm}>
                        Create alarm
                    </button>
                </div>
            ) : (
                <button className="button button--outline" type="button" onClick={onCreate}>
                    Create your first resource
                </button>
            )}
        </div>
    );
}

function ResourcePanel({
    serviceId,
    resources,
    onSelect,
    onCreate,
    onCreateAlarm,
    onEdit,
    onDelete,
}: {
    serviceId: string;
    resources: LabResource[];
    onSelect: (resource: LabResource) => void;
    onCreate: () => void;
    onCreateAlarm: () => void;
    onEdit: (resource: LabResource) => void;
    onDelete: (resource: LabResource) => void;
}) {
    return (
        <div className="resource-panel">
            <div className="resource-panel__header">
                <div>
                    <h2>Resources</h2>
                    <span>
                        {resources.length} {resources.length === 1 ? 'resource' : 'resources'}
                    </span>
                </div>
                <div className="resource-panel__buttons">
                    {serviceId === 'cloudwatch' ? (
                        <>
                            <button
                                className="button button--outline button--small"
                                type="button"
                                onClick={onCreate}
                            >
                                Create log group
                            </button>
                            <button
                                className="button button--outline button--small"
                                type="button"
                                onClick={onCreateAlarm}
                            >
                                Create alarm
                            </button>
                        </>
                    ) : (
                        <button
                            className="button button--outline button--small"
                            type="button"
                            onClick={onCreate}
                        >
                            Create new
                        </button>
                    )}
                </div>
            </div>
            {resources.length ? (
                <div className="resource-table-wrap">
                    <table className="resource-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Configuration status</th>
                                <th>
                                    <span className="visually-hidden">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {resources.map((resource) => (
                                <ResourceRow
                                    key={resource.id}
                                    resource={resource}
                                    onSelect={() => onSelect(resource)}
                                    onEdit={() => onEdit(resource)}
                                    onDelete={() => onDelete(resource)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyResourcePanel serviceId={serviceId} onCreate={onCreate} onCreateAlarm={onCreateAlarm} />
            )}
        </div>
    );
}

function ResourceDetailPanel({
    selected,
    configuration,
    onClose,
    onEdit,
    onDelete,
}: {
    selected: LabResource | null;
    configuration: LabConfiguration;
    onClose: () => void;
    onEdit: (resource: LabResource) => void;
    onDelete: (resource: LabResource) => void;
}) {
    if (!selected) return null;
    return (
        <section className="resource-detail" aria-labelledby="resource-detail-title">
            <div className="resource-detail__head">
                <div>
                    <span className="eyebrow">RESOURCE DETAILS</span>
                    <h2 id="resource-detail-title">{resourceTitle(selected)}</h2>
                </div>
                <button
                    className="icon-button"
                    type="button"
                    onClick={onClose}
                    aria-label="Close resource details"
                >
                    ×
                </button>
            </div>
            <dl>
                <div>
                    <dt>Resource type</dt>
                    <dd>{resourceTypeLabel(selected)}</dd>
                </div>
                <div>
                    <dt>Sandbox identifier</dt>
                    <dd>
                        <code>{selected.id}</code>
                    </dd>
                </div>
                <div>
                    <dt>Configuration</dt>
                    <dd>{resourceSummary(selected, configuration)}</dd>
                </div>
            </dl>
            <div className="resource-detail__actions">
                <button
                    className="button button--outline button--small"
                    type="button"
                    onClick={() => onEdit(selected)}
                >
                    Edit resource
                </button>
                <button className="text-button danger-link" type="button" onClick={() => onDelete(selected)}>
                    Delete
                </button>
            </div>
        </section>
    );
}

function ResourceNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    if (!message) return null;
    return (
        <p className="inline-notice" role="status">
            {message}
            <button type="button" onClick={onDismiss} aria-label="Dismiss message">
                ×
            </button>
        </p>
    );
}

function ResourceEditorDialog({
    resource,
    editing,
    configuration,
    onClose,
    onPatch,
    onSave,
}: {
    resource: LabResource | null;
    editing: boolean;
    configuration: LabConfiguration;
    onClose: () => void;
    onPatch: (patch: Partial<LabResource>) => void;
    onSave: () => void;
}) {
    if (!resource) return null;
    return (
        <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="dialog-card resource-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="resource-dialog-title"
            >
                <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">
                    ×
                </button>
                <span className="eyebrow">{editing ? 'EDIT RESOURCE' : 'NEW RESOURCE'}</span>
                <h2 id="resource-dialog-title">
                    {editing ? 'Update configuration' : `Create ${resourceTypeLabel(resource).toLowerCase()}`}
                </h2>
                <p className="dialog-intro">
                    Changes are simulated and can be edited or deleted at any time.
                </p>
                <div className="resource-form">
                    <ResourceForm resource={resource} configuration={configuration} onPatch={onPatch} />
                </div>
                <div className="resource-dialog__actions">
                    <button className="button button--outline" type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="button button--primary" type="button" onClick={onSave}>
                        {editing ? 'Save changes' : 'Create resource'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ConsoleStep({ serviceId, serviceName, step, configuration, onChange }: Props) {
    const types = serviceTypes[serviceId] ?? [];
    const serviceResources = configuration.resources.filter((resource) => types.includes(resource.type));
    const [formResource, setFormResource] = useState<LabResource | null>(null);
    const [editing, setEditing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const selected = serviceResources.find((resource) => resource.id === selectedId) ?? null;

    useEffect(() => {
        if (!formResource) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setFormResource(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [formResource]);

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
            ? configuration.resources.map((item) => (item.id === formResource.id ? formResource : item))
            : [...configuration.resources, formResource];
        onChange({ resources });
        setSelectedId(formResource.id);
        setNotice(resourceTypeLabel(formResource) + ' saved in this sandbox.');
        setFormResource(null);
    }

    function removeResource(resource: LabResource) {
        onChange({ resources: configuration.resources.filter((item) => item.id !== resource.id) });
        setSelectedId(null);
        setNotice(resourceTypeLabel(resource) + ' deleted from this sandbox.');
    }

    function patchForm(patch: Partial<LabResource>) {
        setFormResource((current) => (current ? ({ ...current, ...patch } as LabResource) : current));
    }

    function editResource(resource: LabResource) {
        setFormResource(resource);
        setEditing(true);
    }

    return (
        <section className="service-screen" aria-labelledby="service-title">
            <div className="console-breadcrumb">
                <span>Cloud services</span>
                <span aria-hidden="true">/</span>
                <strong>{serviceName}</strong>
            </div>
            <ServiceHeading
                serviceId={serviceId}
                serviceName={serviceName}
                onCreate={openCreate}
                onCreateAlarm={openCreateAlarm}
            />
            <div className="service-context">
                <strong>{step.title}</strong>
                <span>{step.goal}</span>
            </div>
            <ResourcePanel
                serviceId={serviceId}
                resources={serviceResources}
                onSelect={(resource) => setSelectedId(resource.id)}
                onCreate={openCreate}
                onCreateAlarm={openCreateAlarm}
                onEdit={editResource}
                onDelete={removeResource}
            />
            <ResourceDetailPanel
                selected={selected}
                configuration={configuration}
                onClose={() => setSelectedId(null)}
                onEdit={editResource}
                onDelete={removeResource}
            />
            <ResourceNotice message={notice} onDismiss={() => setNotice('')} />
            <ResourceEditorDialog
                resource={formResource}
                editing={editing}
                configuration={configuration}
                onClose={() => setFormResource(null)}
                onPatch={patchForm}
                onSave={saveResource}
            />
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

function relatedName(configuration: LabConfiguration, id: string): string {
    return configuration.resources.find((item) => item.id === id)?.name || 'Not selected';
}

function summarizeBucket(resource: Extract<LabResource, { type: 's3Bucket' }>): string {
    return `Public access ${resource.blockPublicAccess ? 'blocked' : 'not blocked'}`;
}

function summarizeDistribution(
    resource: Extract<LabResource, { type: 'cloudFrontDistribution' }>,
    configuration: LabConfiguration,
): string {
    const access = resource.originAccessControl
        ? 'Origin Access Control enabled'
        : 'Origin Access Control disabled';
    return `Origin: ${relatedName(configuration, resource.originBucketId)} · ${access}`;
}

function summarizeRoute(
    resource: Extract<LabResource, { type: 'apiRoute' }>,
    configuration: LabConfiguration,
): string {
    return `${resource.method} ${resource.path} · Lambda: ${relatedName(configuration, resource.lambdaId)}`;
}

function summarizePolicy(
    resource: Extract<LabResource, { type: 'iamPolicy' }>,
    configuration: LabConfiguration,
): string {
    const functionName = relatedName(configuration, resource.lambdaId);
    const tableName = relatedName(configuration, resource.tableId);
    return `${resource.accessLevel} access · ${functionName} → ${tableName}`;
}

function summarizeLogGroup(
    resource: Extract<LabResource, { type: 'cloudWatchLogGroup' }>,
    configuration: LabConfiguration,
): string {
    const retention = resource.retentionDays || 'Never expire';
    return `${retention} day(s) · ${relatedName(configuration, resource.lambdaId)}`;
}

function summarizeAlarm(
    resource: Extract<LabResource, { type: 'cloudWatchAlarm' }>,
    configuration: LabConfiguration,
): string {
    return `${resource.metric} metric · ${relatedName(configuration, resource.lambdaId)}`;
}

function summarizeGenericResource(resource: Extract<LabResource, { type: 'awsResource' }>): string {
    return (
        Object.entries(resource.settings)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' · ') || 'No additional settings'
    );
}

function legacyResourceSummary(
    resource: Exclude<LabResource, { type: 'awsResource' }>,
    configuration: LabConfiguration,
): string {
    switch (resource.type) {
        case 's3Bucket':
            return summarizeBucket(resource);
        case 'cloudFrontDistribution':
            return summarizeDistribution(resource, configuration);
        case 'lambdaFunction':
            return 'Function code is represented by this simulated resource.';
        case 'apiRoute':
            return summarizeRoute(resource, configuration);
        case 'dynamoTable':
            return `Partition key: ${resource.partitionKey || 'Not set'}`;
        case 'iamPolicy':
            return summarizePolicy(resource, configuration);
        case 'cloudWatchLogGroup':
            return summarizeLogGroup(resource, configuration);
        case 'cloudWatchAlarm':
            return summarizeAlarm(resource, configuration);
    }
}

function resourceSummary(resource: LabResource, configuration: LabConfiguration): string {
    if (resource.type === 'awsResource') return summarizeGenericResource(resource);
    return legacyResourceSummary(resource, configuration);
}

function serviceNamesForResource(service: string) {
    return service.replace(/([A-Z])/g, ' $1').trim();
}
