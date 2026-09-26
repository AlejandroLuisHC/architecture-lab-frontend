import { useMemo, useState } from 'react';
import type { LabResource } from '../../types';
import { serviceCatalog, serviceEntry, serviceForResource, type SandboxService } from './catalog';

type Props = {
    service: SandboxService;
    region: string;
    resources: LabResource[];
    selectedId: string;
    onSelect: (resourceId: string) => void;
    onAdd: () => void;
};

export default function ServicePage({ service, region, resources, selectedId, onSelect, onAdd }: Props) {
    const [query, setQuery] = useState('');
    const entry = serviceEntry(service);
    const filtered = useMemo(
        () =>
            resources.filter((resource) => {
                const text =
                    `${resource.name} ${resource.type === 'awsResource' ? (resource.resourceType ?? '') : resource.type}`.toLowerCase();
                return serviceForResource(resource) === service && text.includes(query.trim().toLowerCase());
            }),
        [resources, query, service],
    );

    return (
        <section className="service-page" aria-labelledby="service-page-title">
            <div className="service-page__breadcrumbs">
                <span>Services</span>
                <span aria-hidden="true">›</span>
                <strong>{entry.label}</strong>
            </div>
            <header className="service-page__header">
                <span className={`service-icon service-icon--${entry.tone}`} aria-hidden="true">
                    {entry.glyph}
                </span>
                <div>
                    <span className="eyebrow">{entry.category.toUpperCase()}</span>
                    <h1 id="service-page-title">{entry.label}</h1>
                    <p>{entry.description}</p>
                </div>
                <button className="button button--primary service-create" type="button" onClick={onAdd}>
                    Create {entry.label.replace(/^(Amazon |AWS )/, '')}
                </button>
            </header>
            <div className="service-page__toolbar">
                <div>
                    <h2>Resources</h2>
                    <span>
                        {filtered.length} in {region}
                    </span>
                </div>
                <label className="resource-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                        aria-label={`Search ${entry.label} resources`}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find resources"
                    />
                </label>
            </div>
            {filtered.length ? (
                <div className="resource-table-wrap">
                    <table className="resource-table">
                        <thead>
                            <tr>
                                <th scope="col">Name</th>
                                <th scope="col">Resource type</th>
                                <th scope="col">Identifier</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((resource) => (
                                <tr
                                    className={resource.id === selectedId ? 'is-selected' : ''}
                                    key={resource.id}
                                >
                                    <td>
                                        <button
                                            type="button"
                                            className="resource-table__name"
                                            onClick={() => onSelect(resource.id)}
                                        >
                                            <span
                                                className={`service-icon service-icon--${entry.tone}`}
                                                aria-hidden="true"
                                            >
                                                {entry.glyph}
                                            </span>
                                            <strong>{resource.name || 'Unnamed resource'}</strong>
                                        </button>
                                    </td>
                                    <td>
                                        <code>
                                            {resource.type === 'awsResource'
                                                ? resource.resourceType
                                                : resource.type}
                                        </code>
                                    </td>
                                    <td>
                                        <code>
                                            {resource.type === 'awsResource'
                                                ? (resource.logicalId ?? resource.id)
                                                : resource.id}
                                        </code>
                                    </td>
                                    <td>
                                        <span className="resource-status">
                                            <i /> Sandbox configuration
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="service-empty">
                    <span className={`service-icon service-icon--${entry.tone}`} aria-hidden="true">
                        {entry.glyph}
                    </span>
                    <h2>No {entry.label} resources</h2>
                    <p>
                        {query
                            ? 'No resources match this search.'
                            : `Create a ${entry.label} resource to add it to the architecture.`}
                    </p>
                    {!query ? (
                        <button className="button button--outline" type="button" onClick={onAdd}>
                            Create resource
                        </button>
                    ) : null}
                </div>
            )}
            <div className="service-reference">
                <span>SIMULATED CONSOLE</span>
                <p>Settings stay in this architecture draft. No AWS resources are created.</p>
            </div>
        </section>
    );
}

export function CatalogNavigation({
    selectedService,
    onSelect,
}: {
    selectedService: string;
    onSelect: (service: string) => void;
}) {
    const groups = useMemo(() => [...new Set(serviceCatalog.map((entry) => entry.category))], []);
    return (
        <nav className="sandbox-service-navigation" aria-label="AWS services">
            <div className="sandbox-nav-heading">
                <span className="eyebrow">SERVICES</span>
                <p>Explore by service</p>
            </div>
            <button
                type="button"
                className={`sandbox-nav-link sandbox-nav-link--overview ${selectedService === 'overview' ? 'is-active' : ''}`}
                onClick={() => onSelect('overview')}
            >
                <span className="nav-grid-icon" aria-hidden="true">
                    ▦
                </span>
                <span>Architecture overview</span>
            </button>
            {groups.map((category) => (
                <section className="sandbox-nav-group" key={category}>
                    <h2>{category}</h2>
                    {serviceCatalog
                        .filter((entry) => entry.category === category)
                        .map((entry) => (
                            <button
                                type="button"
                                key={entry.service}
                                className={`sandbox-nav-link ${selectedService === entry.service ? 'is-active' : ''}`}
                                onClick={() => onSelect(entry.service)}
                            >
                                <span
                                    className={`service-icon service-icon--small service-icon--${entry.tone}`}
                                    aria-hidden="true"
                                >
                                    {entry.glyph}
                                </span>
                                <span>{entry.label}</span>
                            </button>
                        ))}
                </section>
            ))}
            <div className="sandbox-nav-footer">
                <span className="sandbox-indicator">
                    <i /> SIMULATED ENVIRONMENT
                </span>
                <p>Nothing here connects to AWS.</p>
            </div>
        </nav>
    );
}
