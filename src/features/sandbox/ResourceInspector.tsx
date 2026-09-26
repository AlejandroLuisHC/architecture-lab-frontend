import { useState } from 'react';
import type { JsonValue, LabResource } from '../../types';
import { serviceEntry, serviceForResource, titleCaseSetting } from './catalog';

type Link = { sourceId: string; targetId: string; kind: string };
type ResourceChoice = { id: string; name: string };
type LegacyResource = Exclude<LabResource, { type: 'awsResource' }>;
type LegacyField = { key: string; label: string; value: string | number | boolean };

type Props = {
    resource: LabResource | null;
    resources: LabResource[];
    relationships: Link[];
    onChange: (resourceId: string, field: string, value: string | number | boolean | JsonValue) => void;
    onConnect: (targetId: string, kind: string) => void;
    onRemove: (resourceId: string) => void;
};

function legacyFieldsGroupOne(resource: LegacyResource): LegacyField[] | undefined {
    switch (resource.type) {
        case 's3Bucket':
            return [
                { key: 'blockPublicAccess', label: 'Block public access', value: resource.blockPublicAccess },
            ];
        case 'cloudFrontDistribution':
            return [
                { key: 'enabled', label: 'Distribution enabled', value: resource.enabled },
                {
                    key: 'originAccessControl',
                    label: 'Origin access control',
                    value: resource.originAccessControl,
                },
                { key: 'originBucketId', label: 'Origin bucket ID', value: resource.originBucketId },
            ];
        case 'lambdaFunction':
            return [
                { key: 'runtime', label: 'Runtime', value: resource.runtime ?? 'nodejs22.x' },
                { key: 'memoryMiB', label: 'Memory (MiB)', value: resource.memoryMiB ?? 512 },
                { key: 'timeoutSeconds', label: 'Timeout (seconds)', value: resource.timeoutSeconds ?? 30 },
            ];
        case 'apiRoute':
            return [
                { key: 'path', label: 'Route path', value: resource.path },
                { key: 'method', label: 'HTTP method', value: resource.method },
                { key: 'lambdaId', label: 'Lambda resource ID', value: resource.lambdaId },
            ];
        default:
            return undefined;
    }
}

function legacyFieldsGroupTwo(resource: LegacyResource): LegacyField[] {
    switch (resource.type) {
        case 'dynamoTable':
            return [{ key: 'partitionKey', label: 'Partition key', value: resource.partitionKey }];
        case 'iamPolicy':
            return [
                { key: 'accessLevel', label: 'Access level', value: resource.accessLevel },
                { key: 'lambdaId', label: 'Lambda resource ID', value: resource.lambdaId },
                { key: 'tableId', label: 'DynamoDB table ID', value: resource.tableId },
            ];
        case 'cloudWatchLogGroup':
            return [{ key: 'retentionDays', label: 'Retention days', value: resource.retentionDays }];
        case 'cloudWatchAlarm':
            return [{ key: 'metric', label: 'Metric', value: resource.metric }];
        default:
            return [];
    }
}

function legacyFields(resource: LegacyResource): LegacyField[] {
    return legacyFieldsGroupOne(resource) ?? legacyFieldsGroupTwo(resource);
}

function PropertyControl({
    resourceId,
    field,
    onChange,
}: {
    resourceId: string;
    field: LegacyField;
    onChange: Props['onChange'];
}) {
    if (typeof field.value === 'boolean') {
        return (
            <select
                value={String(field.value)}
                onChange={(event) => onChange(resourceId, field.key, event.target.value === 'true')}
            >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
            </select>
        );
    }
    return (
        <input
            value={String(field.value)}
            type={typeof field.value === 'number' ? 'number' : 'text'}
            onChange={(event) =>
                onChange(
                    resourceId,
                    field.key,
                    typeof field.value === 'number' ? Number(event.target.value) : event.target.value,
                )
            }
        />
    );
}

function LegacyPropertyFields({ resource, onChange }: Pick<Props, 'resource' | 'onChange'>) {
    if (!resource || resource.type === 'awsResource') return null;
    return (
        <div className="resource-properties">
            {legacyFields(resource).map((field) => (
                <label className="resource-property" key={field.key}>
                    <span>{field.label}</span>
                    <PropertyControl resourceId={resource.id} field={field} onChange={onChange} />
                </label>
            ))}
        </div>
    );
}

function AwsPropertyControl({
    setting,
    onChange,
    onStructuredChange,
}: {
    setting: [string, JsonValue];
    onChange: (key: string, value: JsonValue) => void;
    onStructuredChange: (key: string, value: string) => void;
}) {
    const [key, value] = setting;
    if (typeof value === 'boolean') {
        return (
            <select value={String(value)} onChange={(event) => onChange(key, event.target.value === 'true')}>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
            </select>
        );
    }
    if (typeof value === 'number') {
        return (
            <input
                type="number"
                value={value}
                onChange={(event) => onChange(key, Number(event.target.value))}
            />
        );
    }
    if (typeof value === 'string') {
        return <input value={value} onChange={(event) => onChange(key, event.target.value)} />;
    }
    return (
        <textarea
            aria-label={`${titleCaseSetting(key)} JSON`}
            rows={4}
            value={JSON.stringify(value, null, 4)}
            onChange={(event) => onStructuredChange(key, event.target.value)}
        />
    );
}

function AwsPropertyFields({
    resource,
    onChange,
    onStructuredChange,
    jsonError,
}: {
    resource: Extract<LabResource, { type: 'awsResource' }>;
    onChange: (key: string, value: JsonValue) => void;
    onStructuredChange: (key: string, value: string) => void;
    jsonError: string;
}) {
    const settings = Object.entries(resource.settings).filter(
        ([key]) =>
            !(
                resource.service === 's3' &&
                key === 'publicAccessBlockConfiguration' &&
                typeof resource.settings.blockPublicAccess === 'boolean'
            ),
    );
    return (
        <>
            {resource.logicalId ? (
                <div className="resource-readonly">
                    <span>CloudFormation logical ID</span>
                    <code>{resource.logicalId}</code>
                </div>
            ) : null}
            <div className="resource-properties">
                {settings.map((setting) => (
                    <label className="resource-property" key={setting[0]}>
                        <span>{titleCaseSetting(setting[0])}</span>
                        <AwsPropertyControl
                            setting={setting}
                            onChange={onChange}
                            onStructuredChange={onStructuredChange}
                        />
                    </label>
                ))}
            </div>
            {jsonError ? (
                <p className="template-error" role="alert">
                    {jsonError}
                </p>
            ) : null}
        </>
    );
}

function ResourceProperties({
    resource,
    onChange,
    onAwsChange,
    onStructuredChange,
    jsonError,
}: {
    resource: LabResource;
    onChange: Props['onChange'];
    onAwsChange: (key: string, value: JsonValue) => void;
    onStructuredChange: (key: string, value: string) => void;
    jsonError: string;
}) {
    if (resource.type !== 'awsResource')
        return <LegacyPropertyFields resource={resource} onChange={onChange} />;
    return (
        <AwsPropertyFields
            resource={resource}
            onChange={onAwsChange}
            onStructuredChange={onStructuredChange}
            jsonError={jsonError}
        />
    );
}

function RelationshipEditor({
    resource,
    resources,
    relationships,
    targets,
    onConnect,
}: {
    resource: LabResource;
    resources: LabResource[];
    relationships: Link[];
    targets: ResourceChoice[];
    onConnect: Props['onConnect'];
}) {
    const [targetId, setTargetId] = useState('');
    const [kind, setKind] = useState('connects-to');
    const connected = relationships.filter(
        (link) => link.sourceId === resource.id || link.targetId === resource.id,
    );
    const relationshipKinds = [
        'connects-to',
        'uses-origin',
        'invokes',
        'routes-to',
        'reads-from',
        'writes-to',
        'encrypts-with',
        'attached-to',
        'depends-on',
    ];
    return (
        <section className="connect-resource">
            <h3>Relationships</h3>
            {connected.map((link) => {
                const otherId = link.sourceId === resource.id ? link.targetId : link.sourceId;
                const other = resources.find((item) => item.id === otherId);
                return (
                    <p className="relationship-chip" key={`${link.sourceId}:${link.targetId}:${link.kind}`}>
                        <span>{link.kind}</span>
                        <strong>{other?.name ?? 'Missing resource'}</strong>
                    </p>
                );
            })}
            <label className="resource-property">
                <span>Connect to</span>
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                    <option value="">Choose a resource</option>
                    {targets.map((target) => (
                        <option value={target.id} key={target.id}>
                            {target.name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="resource-property">
                <span>Relationship type</span>
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                    {relationshipKinds.map((item) => (
                        <option key={item}>{item}</option>
                    ))}
                </select>
            </label>
            <button
                className="button button--outline button--small"
                type="button"
                disabled={!targetId}
                onClick={() => {
                    onConnect(targetId, kind);
                    setTargetId('');
                }}
            >
                Add relationship
            </button>
        </section>
    );
}

function InspectorHeading({ resource }: { resource: LabResource | null }) {
    const service = resource ? serviceEntry(serviceForResource(resource)) : null;
    return (
        <div className="inspector-heading">
            <span className="eyebrow">RESOURCE SETTINGS</span>
            {resource && service ? (
                <div className="resource-title">
                    <span className={`service-icon service-icon--${service.tone}`} aria-hidden="true">
                        {service.glyph}
                    </span>
                    <div>
                        <h2>{service.label}</h2>
                        <small>
                            {resource.type === 'awsResource'
                                ? resource.resourceType
                                : 'Saved sandbox resource'}
                        </small>
                    </div>
                </div>
            ) : (
                <p>Select a resource to inspect its settings.</p>
            )}
        </div>
    );
}

function InspectorDetails({
    resource,
    resources,
    relationships,
    targets,
    onChange,
    onConnect,
    onRemove,
    onAwsChange,
    onStructuredChange,
    jsonError,
}: Props & {
    targets: ResourceChoice[];
    onAwsChange: (key: string, value: JsonValue) => void;
    onStructuredChange: (key: string, value: string) => void;
    jsonError: string;
}) {
    if (!resource) return null;
    return (
        <>
            <label className="resource-property">
                <span>Resource name</span>
                <input
                    value={resource.name}
                    onChange={(event) => onChange(resource.id, 'name', event.target.value)}
                />
            </label>
            <ResourceProperties
                resource={resource}
                onChange={onChange}
                onAwsChange={onAwsChange}
                onStructuredChange={onStructuredChange}
                jsonError={jsonError}
            />
            {targets.length ? (
                <RelationshipEditor
                    resource={resource}
                    resources={resources}
                    relationships={relationships}
                    targets={targets}
                    onConnect={onConnect}
                />
            ) : null}
            <button
                className="text-button danger-link resource-remove"
                type="button"
                onClick={() => onRemove(resource.id)}
            >
                Remove resource
            </button>
        </>
    );
}

export default function ResourceInspector(props: Props) {
    const [jsonError, setJsonError] = useState('');
    const { resource, resources, onChange } = props;

    function changeAwsSetting(key: string, value: JsonValue) {
        if (!resource || resource.type !== 'awsResource') return;
        onChange(resource.id, `settings:${key}`, value);
        setJsonError('');
    }

    function changeStructuredSetting(key: string, text: string) {
        try {
            changeAwsSetting(key, JSON.parse(text) as JsonValue);
        } catch {
            setJsonError(`Enter valid JSON for ${titleCaseSetting(key)}.`);
        }
    }

    const targets = resource
        ? resources
              .filter((item) => item.id !== resource.id)
              .map((item) => ({
                  id: item.id,
                  name: item.name || serviceEntry(serviceForResource(item)).label,
              }))
        : [];
    return (
        <aside className="sandbox-inspector" aria-label="Resource settings">
            <InspectorHeading resource={resource} />
            <InspectorDetails
                {...props}
                targets={targets}
                jsonError={jsonError}
                onAwsChange={changeAwsSetting}
                onStructuredChange={changeStructuredSetting}
            />
        </aside>
    );
}
