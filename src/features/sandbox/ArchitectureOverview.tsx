import { useRef, useState } from 'react';
import type { LabResource } from '../../types';
import { serviceEntry, serviceForResource } from './catalog';
import { stateLabel, type SimulatedResourceStates } from './lifecycle';

type Link = { sourceId: string; targetId: string; kind: string };
type Point = { x: number; y: number };
const NODE_WIDTH = 190;
const NODE_HEIGHT = 82;

function positions(resources: LabResource[], relationships: Link[]): Map<string, Point> {
    const ids = new Set(resources.map((resource) => resource.id));
    const depths = new Map(resources.map((resource) => [resource.id, 0]));
    for (let index = 0; index < resources.length; index += 1) {
        let changed = false;
        for (const link of relationships) {
            if (!ids.has(link.sourceId) || !ids.has(link.targetId)) continue;
            const next = Math.min(resources.length - 1, (depths.get(link.sourceId) ?? 0) + 1);
            if (next > (depths.get(link.targetId) ?? 0)) {
                depths.set(link.targetId, next);
                changed = true;
            }
        }
        if (!changed) break;
    }
    const rows = new Map<number, number>();
    return new Map(
        resources.map((resource) => {
            const depth = depths.get(resource.id) ?? 0;
            const row = rows.get(depth) ?? 0;
            rows.set(depth, row + 1);
            return [resource.id, { x: 35 + depth * 280, y: 38 + row * 120 }];
        }),
    );
}

function connector(source: Point, target: Point): string {
    const x1 = source.x + NODE_WIDTH;
    const y1 = source.y + NODE_HEIGHT / 2;
    const x2 = target.x;
    const y2 = target.y + NODE_HEIGHT / 2;
    const bend = Math.max(38, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function DiagramEdges({
    relationships,
    layout,
    selectedId,
    width,
    height,
}: {
    relationships: Link[];
    layout: Map<string, Point>;
    selectedId: string;
    width: number;
    height: number;
}) {
    return (
        <svg
            className="architecture-diagram__edges"
            width={width}
            height={height}
            aria-label="Resource connections"
        >
            <defs>
                <marker
                    id="diagram-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
            </defs>
            {relationships.map((link, index) => {
                const source = layout.get(link.sourceId);
                const target = layout.get(link.targetId);
                if (!source || !target) return null;
                const active = selectedId && (link.sourceId === selectedId || link.targetId === selectedId);
                return (
                    <g
                        key={`${link.sourceId}-${link.targetId}-${link.kind}-${index}`}
                        className={active ? 'is-highlighted' : ''}
                    >
                        <path d={connector(source, target)} markerEnd="url(#diagram-arrow)" />
                        <text
                            x={(source.x + NODE_WIDTH + target.x) / 2}
                            y={(source.y + target.y + NODE_HEIGHT) / 2 - 7}
                            textAnchor="middle"
                        >
                            {link.kind.replaceAll('-', ' ')}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default function ArchitectureOverview({
    resources,
    relationships,
    selectedId,
    simulatedResourceStates,
    onSelect,
}: {
    resources: LabResource[];
    relationships: Link[];
    selectedId: string;
    simulatedResourceStates: SimulatedResourceStates;
    onSelect: (resource: LabResource) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const layout = positions(resources, relationships);
    const width = Math.max(720, ...Array.from(layout.values(), (point) => point.x + NODE_WIDTH + 40));
    const height = Math.max(400, ...Array.from(layout.values(), (point) => point.y + NODE_HEIGHT + 40));
    const highlighted = new Set(
        relationships
            .filter((link) => link.sourceId === selectedId || link.targetId === selectedId)
            .flatMap((link) => [link.sourceId, link.targetId]),
    );

    function fit(): void {
        const element = viewport.current;
        if (!element) return;
        setZoom(Math.min(1, Math.max(0.35, (element.clientWidth - 24) / width)));
        element.scrollTo({ left: 0, top: 0 });
    }

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
                    <p>See resource states and dependencies in one view. Select a node to edit it.</p>
                </div>
                <div className="architecture-stats">
                    <span>
                        <strong>{resources.length}</strong> resources
                    </span>
                    <span>
                        <strong>{relationships.length}</strong> connections
                    </span>
                </div>
            </header>
            {resources.length ? (
                <div className="architecture-diagram">
                    <div className="architecture-diagram__toolbar" aria-label="Diagram controls">
                        <button
                            type="button"
                            onClick={() => setZoom((value) => Math.max(0.35, value - 0.15))}
                            aria-label="Zoom out"
                        >
                            −
                        </button>
                        <span>{Math.round(zoom * 100)}%</span>
                        <button
                            type="button"
                            onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}
                            aria-label="Zoom in"
                        >
                            +
                        </button>
                        <button type="button" onClick={fit}>
                            Fit view
                        </button>
                    </div>
                    <div
                        className="architecture-diagram__viewport"
                        ref={viewport}
                        onPointerDown={(event) => {
                            if ((event.target as Element).closest('button')) return;
                            drag.current = {
                                x: event.clientX,
                                y: event.clientY,
                                left: event.currentTarget.scrollLeft,
                                top: event.currentTarget.scrollTop,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            if (!drag.current) return;
                            event.currentTarget.scrollLeft =
                                drag.current.left - (event.clientX - drag.current.x);
                            event.currentTarget.scrollTop =
                                drag.current.top - (event.clientY - drag.current.y);
                        }}
                        onPointerUp={() => {
                            drag.current = null;
                        }}
                        onPointerCancel={() => {
                            drag.current = null;
                        }}
                    >
                        <div
                            className="architecture-diagram__surface"
                            style={{ width: width * zoom, height: height * zoom }}
                        >
                            <div
                                className="architecture-diagram__plane"
                                style={{ width, height, transform: `scale(${zoom})` }}
                            >
                                <DiagramEdges
                                    relationships={relationships}
                                    layout={layout}
                                    selectedId={selectedId}
                                    width={width}
                                    height={height}
                                />
                                {resources.map((resource) => {
                                    const point = layout.get(resource.id)!;
                                    const entry = serviceEntry(serviceForResource(resource));
                                    return (
                                        <button
                                            className={`architecture-diagram__node ${selectedId === resource.id ? 'is-selected' : ''} ${highlighted.has(resource.id) ? 'is-connected' : ''}`}
                                            style={{ left: point.x, top: point.y }}
                                            type="button"
                                            key={resource.id}
                                            onClick={() => onSelect(resource)}
                                            aria-pressed={selectedId === resource.id}
                                            aria-label={`${entry.label}: ${resource.name || 'Unnamed resource'} — ${stateLabel(resource, simulatedResourceStates)}`}
                                        >
                                            <span
                                                className={`service-icon service-icon--${entry.tone}`}
                                                aria-hidden="true"
                                            >
                                                {entry.glyph}
                                            </span>
                                            <span className="architecture-diagram__node-text">
                                                <small>{entry.label}</small>
                                                <strong>{resource.name || 'Unnamed resource'}</strong>
                                                <em>{stateLabel(resource, simulatedResourceStates)}</em>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <p className="architecture-diagram__hint">
                        Drag the background to pan. Zoom and fit controls change only this view.
                    </p>
                </div>
            ) : (
                <div className="service-empty">
                    <h2>Your design is empty</h2>
                    <p>Choose a service in the navigation to create its first resource.</p>
                </div>
            )}
        </section>
    );
}
