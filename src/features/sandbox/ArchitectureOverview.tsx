import type { LabResource } from '../../types';
import { serviceEntry, serviceForResource } from './catalog';

type Link = { sourceId: string; targetId: string; kind: string };

export default function ArchitectureOverview({
    resources,
    relationships,
    onSelect,
}: {
    resources: LabResource[];
    relationships: Link[];
    onSelect: (resource: LabResource) => void;
}) {
    const findName = (id: string) =>
        resources.find((resource) => resource.id === id)?.name ?? 'Missing resource';

    return (
        <section className="architecture-page" aria-labelledby="architecture-title">
            <div className="service-page__breadcrumbs">
                <span>Services</span>
                <span aria-hidden="true">›</span>
                <strong>Architecture overview</strong>
            </div>
            <header className="architecture-page__header">
                <div>
                    <span className="eyebrow">DESIGN MAP</span>
                    <h1 id="architecture-title">Architecture overview</h1>
                    <p>Review the services in this design and how they connect.</p>
                </div>
                <div className="architecture-stats">
                    <span>
                        <strong>{resources.length}</strong> resources
                    </span>
                    <span>
                        <strong>{relationships.length}</strong> relationships
                    </span>
                </div>
            </header>
            {resources.length ? (
                <div className="architecture-resource-grid">
                    {resources.map((resource) => {
                        const entry = serviceEntry(serviceForResource(resource));
                        const outgoing = relationships.filter((link) => link.sourceId === resource.id);
                        const incoming = relationships.filter((link) => link.targetId === resource.id);
                        return (
                            <button
                                type="button"
                                className={`architecture-resource-card tone-${entry.tone}`}
                                key={resource.id}
                                onClick={() => onSelect(resource)}
                            >
                                <span
                                    className={`service-icon service-icon--${entry.tone}`}
                                    aria-hidden="true"
                                >
                                    {entry.glyph}
                                </span>
                                <span className="architecture-resource-card__body">
                                    <span className="eyebrow">{entry.label}</span>
                                    <strong>{resource.name || 'Unnamed resource'}</strong>
                                    <small>
                                        {resource.type === 'awsResource'
                                            ? resource.resourceType
                                            : resource.type}
                                    </small>
                                    <span className="architecture-resource-card__links">
                                        {outgoing.length} outgoing · {incoming.length} incoming
                                    </span>
                                </span>
                                <span className="architecture-resource-card__arrow" aria-hidden="true">
                                    ↗
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="service-empty">
                    <span className="nav-grid-icon" aria-hidden="true">
                        ▦
                    </span>
                    <h2>Your design is empty</h2>
                    <p>Choose a service in the navigation to create its first resource.</p>
                </div>
            )}
            {relationships.length ? (
                <section className="architecture-links">
                    <div>
                        <span className="eyebrow">RESOURCE RELATIONSHIPS</span>
                        <h2>Connections</h2>
                    </div>
                    <ul>
                        {relationships.map((link, index) => (
                            <li key={`${link.sourceId}-${link.targetId}-${link.kind}-${index}`}>
                                <strong>{findName(link.sourceId)}</strong>
                                <span className="relationship-arrow">{link.kind} →</span>
                                <strong>{findName(link.targetId)}</strong>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </section>
    );
}
