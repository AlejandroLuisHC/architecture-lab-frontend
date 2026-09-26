import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
    analyzeArchitecture,
    createScenario,
    getScenario,
    listScenarios,
    updateScenario,
    type ScenarioInput,
} from '../api';
import type {
    ArchitectureAnalysis,
    JsonValue,
    LabConfiguration,
    LabResource,
    ScenarioSummary,
    WorkloadAssumptions,
} from '../types';
import AnalysisPanel from '../features/sandbox/AnalysisPanel';
import ArchitectureOverview from '../features/sandbox/ArchitectureOverview';
import { createResource, serviceForResource, type SandboxService } from '../features/sandbox/catalog';
import {
    exportCloudFormation,
    importCloudFormation,
    type TemplateDiagnostic,
} from '../features/sandbox/cloudformation';
import ResourceInspector from '../features/sandbox/ResourceInspector';
import { CatalogNavigation } from '../features/sandbox/ServicePage';
import ServicePage from '../features/sandbox/ServicePage';
import TemplateEditor from '../features/sandbox/TemplateEditor';
import WorkloadEditor from '../features/sandbox/WorkloadEditor';
import './Sandbox.css';

const DRAFTS_KEY = 'stack-playground.sandbox.drafts.v1';
const defaultWorkload: WorkloadAssumptions = {
    requestsPerMonth: 100_000,
    averageDurationMs: 250,
    storageGb: 20,
    availabilityTarget: 99.9,
};
const regionChoices = [
    'us-east-1',
    'us-east-2',
    'us-west-2',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
    'ap-southeast-1',
    'ap-southeast-2',
];
const derivedKinds = new Set([
    'uses-origin',
    'invokes',
    'grants-to',
    'permits-on',
    'captures-logs',
    'monitors',
]);

type Relationship = { sourceId: string; targetId: string; kind: string };
type Draft = {
    localId: string;
    title: string;
    region: string;
    configuration: LabConfiguration;
    relationships: Relationship[];
    workloadAssumptions: WorkloadAssumptions;
    updatedAt: string;
    scenarioId?: string;
    currentRevision?: number;
    cloudFormationSource?: string;
};
type SavedArchitecture = ScenarioSummary & { source: 'account' | 'browser' };
type View = 'services' | 'architecture' | 'template';

function createId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `architecture-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
}

function readDrafts(): Draft[] {
    try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? '[]');
        if (!Array.isArray(saved)) return [];
        return saved.filter((value): value is Draft =>
            Boolean(
                value &&
                typeof value === 'object' &&
                'configuration' in value &&
                'title' in value &&
                Array.isArray((value as Draft).configuration.resources),
            ),
        );
    } catch {
        return [];
    }
}

function normalizedWorkload(value: unknown): WorkloadAssumptions {
    const saved = value && typeof value === 'object' ? (value as Partial<WorkloadAssumptions>) : {};
    return {
        requestsPerMonth: Number(saved.requestsPerMonth ?? defaultWorkload.requestsPerMonth),
        averageDurationMs: Number(saved.averageDurationMs ?? defaultWorkload.averageDurationMs),
        storageGb: Number(saved.storageGb ?? defaultWorkload.storageGb),
        availabilityTarget: Number(saved.availabilityTarget ?? defaultWorkload.availabilityTarget),
    };
}

function toScenarioInput(draft: Draft): ScenarioInput {
    return {
        title: draft.title,
        region: draft.region,
        workloadAssumptions: draft.workloadAssumptions,
        configuration: draft.configuration,
        relationships: draft.relationships,
        ...(draft.cloudFormationSource ? { cloudFormationSource: draft.cloudFormationSource } : {}),
    };
}

function derivedRelationships(configuration: LabConfiguration): Relationship[] {
    const resourceIds = new Set(configuration.resources.map((resource) => resource.id));
    const relationships: Relationship[] = [];
    const add = (sourceId: string, targetId: string, kind: string) => {
        if (targetId && resourceIds.has(targetId)) relationships.push({ sourceId, targetId, kind });
    };
    for (const resource of configuration.resources) {
        if (resource.type === 'cloudFrontDistribution')
            add(resource.id, resource.originBucketId, 'uses-origin');
        else if (resource.type === 'apiRoute') add(resource.id, resource.lambdaId, 'invokes');
        else if (resource.type === 'iamPolicy') {
            add(resource.id, resource.lambdaId, 'grants-to');
            add(resource.id, resource.tableId, 'permits-on');
        } else if (resource.type === 'cloudWatchLogGroup')
            add(resource.id, resource.lambdaId, 'captures-logs');
        else if (resource.type === 'cloudWatchAlarm') add(resource.id, resource.lambdaId, 'monitors');
    }
    return relationships;
}

function combineRelationships(configuration: LabConfiguration, custom: Relationship[]): Relationship[] {
    const all = [...derivedRelationships(configuration), ...custom];
    return all.filter(
        (link, index) =>
            all.findIndex(
                (candidate) =>
                    candidate.sourceId === link.sourceId &&
                    candidate.targetId === link.targetId &&
                    candidate.kind === link.kind,
            ) === index,
    );
}

function createDraft(title = 'Untitled architecture'): Draft {
    return {
        localId: createId(),
        title,
        region: 'us-east-1',
        configuration: { resources: [] },
        relationships: [],
        workloadAssumptions: { ...defaultWorkload },
        updatedAt: new Date().toISOString(),
    };
}

function resourceService(resource: LabResource): SandboxService {
    return serviceForResource(resource);
}

function downloadTemplate(source: string, title: string): void {
    const blob = new Blob([source], { type: 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${
        title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') || 'architecture'
    }.yaml`;
    link.click();
    URL.revokeObjectURL(url);
}

type SandboxHomeProps = {
    user: User | null;
    error: string;
    loading: boolean;
    architectures: SavedArchitecture[];
    drafts: Draft[];
    onCreate: () => void;
    onImport: (file: File) => void;
    onSignIn: () => void;
    onOpenAccount: (id: string) => void;
    onOpenBrowser: (id: string) => void;
    onDelete: (id: string) => void;
};

function SavedArchitectureCard({
    item,
    resourceCount,
    onOpenAccount,
    onOpenBrowser,
    onDelete,
}: {
    item: SavedArchitecture;
    resourceCount: number | undefined;
    onOpenAccount: (id: string) => void;
    onOpenBrowser: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const open = item.source === 'account' ? () => onOpenAccount(item.id) : () => onOpenBrowser(item.id);
    return (
        <article className="saved-architecture-card">
            <span className={`saved-source saved-source--${item.source}`}>
                {item.source === 'account' ? 'ACCOUNT SAVED' : 'BROWSER DRAFT'}
            </span>
            <h3>{item.title}</h3>
            <p>
                {item.region} · {resourceCount ?? 'Saved'} resources
            </p>
            <div className="saved-architecture-card__actions">
                <button className="text-button" type="button" onClick={open}>
                    Open architecture <b aria-hidden="true">→</b>
                </button>
                {item.source === 'browser' ? (
                    <button
                        className="text-button danger-link"
                        type="button"
                        onClick={() => onDelete(item.id)}
                    >
                        Delete draft
                    </button>
                ) : null}
            </div>
        </article>
    );
}

function SandboxHomeScreen({
    user,
    error,
    loading,
    architectures,
    drafts,
    onCreate,
    onImport,
    onSignIn,
    onOpenAccount,
    onOpenBrowser,
    onDelete,
}: SandboxHomeProps) {
    return (
        <main className="sandbox-home page-container">
            <section className="sandbox-home__intro">
                <span className="eyebrow">FREEFORM ARCHITECTURE</span>
                <h1>Start with an idea.</h1>
                <p>
                    Explore cloud services in a familiar console, import a CloudFormation template, and review
                    the design before you deploy it elsewhere.
                </p>
                <div className="sandbox-home__actions">
                    <button className="button button--primary button--large" type="button" onClick={onCreate}>
                        ＋ New architecture
                    </button>
                    <label className="button button--outline template-upload">
                        Import CloudFormation YAML
                        <input
                            type="file"
                            accept=".yaml,.yml,application/yaml,text/yaml"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) onImport(file);
                                event.target.value = '';
                            }}
                        />
                    </label>
                    {!user ? (
                        <button className="button button--outline" type="button" onClick={onSignIn}>
                            Sign in to open saved work
                        </button>
                    ) : null}
                </div>
                {error ? (
                    <p className="sandbox-error" role="alert">
                        {error}
                    </p>
                ) : null}
            </section>
            <section className="saved-architectures" aria-labelledby="saved-architectures-title">
                <div className="saved-architectures__heading">
                    <div>
                        <span className="eyebrow">YOUR ARCHITECTURES</span>
                        <h2 id="saved-architectures-title">Continue a design</h2>
                    </div>
                    {loading ? <span>Loading saved work…</span> : null}
                </div>
                {architectures.length ? (
                    <div className="saved-architecture-grid">
                        {architectures.map((item) => (
                            <SavedArchitectureCard
                                key={`${item.source}-${item.id}`}
                                item={item}
                                resourceCount={
                                    drafts.find((draft) => draft.localId === item.id)?.configuration.resources
                                        .length
                                }
                                onOpenAccount={onOpenAccount}
                                onOpenBrowser={onOpenBrowser}
                                onDelete={onDelete}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="saved-empty">
                        <span aria-hidden="true">▦</span>
                        <strong>No saved architectures yet</strong>
                        <p>Create a freeform design or import a template to get started.</p>
                    </div>
                )}
            </section>
        </main>
    );
}

type SandboxConsoleProps = {
    active: Draft;
    dirty: boolean;
    saving: boolean;
    user: User | null;
    templateEdited: boolean;
    view: View;
    resources: LabResource[];
    relationships: Relationship[];
    selectedResource: LabResource | null;
    selectedResourceId: string;
    selectedService: string;
    displayedTemplate: string;
    diagnostics: TemplateDiagnostic[];
    error: string;
    analysis: ArchitectureAnalysis | null;
    analyzing: boolean;
    onBack: () => void;
    onTitleChange: (title: string) => void;
    onRegionChange: (region: string) => void;
    onSave: () => void;
    onSelectView: (view: View) => void;
    onSelectService: (service: string) => void;
    onAddResource: () => void;
    onSelectResource: (id: string) => void;
    onSelectArchitectureResource: (resource: LabResource) => void;
    onChangeResource: (
        resourceId: string,
        field: string,
        value: string | number | boolean | JsonValue,
    ) => void;
    onRemoveResource: (resourceId: string) => void;
    onConnect: (targetId: string, kind: string) => void;
    onTemplateSourceChange: (source: string) => void;
    onImportFile: (file: File) => void;
    onApplyTemplate: () => void;
    onExportTemplate: () => void;
    onDiscardTemplate: () => void;
    onWorkloadChange: (assumptions: WorkloadAssumptions) => void;
    onAnalyze: () => void;
    onRefreshPrices: () => void;
};

function SandboxToolbar({
    active,
    dirty,
    saving,
    user,
    templateEdited,
    onBack,
    onTitleChange,
    onRegionChange,
    onSave,
}: Pick<
    SandboxConsoleProps,
    | 'active'
    | 'dirty'
    | 'saving'
    | 'user'
    | 'templateEdited'
    | 'onBack'
    | 'onTitleChange'
    | 'onRegionChange'
    | 'onSave'
>) {
    return (
        <header className="sandbox-console__topbar">
            <button className="sandbox-console__brand" type="button" onClick={onBack}>
                <span aria-hidden="true">SP</span>
                <strong>Stack Playground</strong>
            </button>
            <div className="sandbox-console__breadcrumb">
                <span>Sandbox</span>
                <span aria-hidden="true">/</span>
                <input
                    aria-label="Architecture name"
                    value={active.title}
                    disabled={templateEdited}
                    onChange={(event) => onTitleChange(event.target.value)}
                />
            </div>
            <label className="sandbox-region">
                <span>Region</span>
                <select
                    aria-label="Region"
                    disabled={templateEdited}
                    value={active.region}
                    onChange={(event) => onRegionChange(event.target.value)}
                >
                    {regionChoices.map((region) => (
                        <option key={region}>{region}</option>
                    ))}
                </select>
            </label>
            <span className={`sandbox-save-state ${dirty ? 'is-dirty' : ''}`}>
                {dirty ? 'Unsaved changes' : active.scenarioId ? 'Saved' : 'Browser draft'}
            </span>
            <button
                className="button button--outline button--small"
                type="button"
                onClick={onSave}
                disabled={saving || templateEdited}
            >
                {saving ? 'Saving…' : user ? 'Save architecture' : 'Sign in to save'}
            </button>
        </header>
    );
}

function SandboxTabs({
    view,
    templateEdited,
    resources,
    onSelectView,
}: Pick<SandboxConsoleProps, 'view' | 'templateEdited' | 'resources' | 'onSelectView'>) {
    const tabs: Array<{ id: View; label: string }> = [
        { id: 'services', label: 'Services' },
        { id: 'architecture', label: 'Architecture' },
        { id: 'template', label: 'CloudFormation' },
    ];
    return (
        <div className="sandbox-console__subnav" role="tablist" aria-label="Architecture workspace">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={view === tab.id}
                    className={view === tab.id ? 'is-active' : ''}
                    disabled={templateEdited && view !== tab.id}
                    onClick={() => onSelectView(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
            <span className="sandbox-resource-count">{resources.length} resources</span>
        </div>
    );
}

function SandboxWorkspace(props: SandboxConsoleProps) {
    const showConsole = props.view !== 'template';
    return (
        <div className="sandbox-console__body">
            {showConsole ? (
                <CatalogNavigation
                    selectedService={props.view === 'architecture' ? 'overview' : props.selectedService}
                    onSelect={props.onSelectService}
                />
            ) : null}
            <div className={`sandbox-console__content ${props.view === 'template' ? 'is-template' : ''}`}>
                <SandboxWorkspacePage {...props} />
                {props.view !== 'template' ? (
                    <WorkloadEditor
                        value={props.active.workloadAssumptions}
                        disabled={props.templateEdited}
                        onChange={props.onWorkloadChange}
                    />
                ) : null}
            </div>
            {showConsole ? (
                <ResourceInspector
                    resource={props.selectedResource}
                    resources={props.resources}
                    relationships={props.relationships}
                    onChange={props.onChangeResource}
                    onRemove={props.onRemoveResource}
                    onConnect={props.onConnect}
                />
            ) : null}
        </div>
    );
}

function SandboxWorkspacePage(props: SandboxConsoleProps) {
    if (props.view === 'services')
        return (
            <ServicePage
                service={props.selectedService as SandboxService}
                region={props.active.region}
                resources={props.resources}
                selectedId={props.selectedResourceId}
                onSelect={props.onSelectResource}
                onAdd={props.onAddResource}
            />
        );
    if (props.view === 'architecture')
        return (
            <ArchitectureOverview
                resources={props.resources}
                relationships={props.relationships}
                onSelect={props.onSelectArchitectureResource}
            />
        );
    return (
        <TemplateEditor
            source={props.displayedTemplate}
            edited={props.templateEdited}
            diagnostics={props.diagnostics}
            error={props.error}
            onSourceChange={props.onTemplateSourceChange}
            onImportFile={props.onImportFile}
            onApply={props.onApplyTemplate}
            onExport={props.onExportTemplate}
            onDiscard={props.onDiscardTemplate}
        />
    );
}

function SandboxConsole(props: SandboxConsoleProps) {
    return (
        <main className="sandbox-console">
            <SandboxToolbar
                active={props.active}
                dirty={props.dirty}
                saving={props.saving}
                user={props.user}
                templateEdited={props.templateEdited}
                onBack={props.onBack}
                onTitleChange={props.onTitleChange}
                onRegionChange={props.onRegionChange}
                onSave={props.onSave}
            />
            <SandboxTabs
                view={props.view}
                templateEdited={props.templateEdited}
                resources={props.resources}
                onSelectView={props.onSelectView}
            />
            <SandboxWorkspace {...props} />
            {props.error && props.view !== 'template' ? (
                <p className="sandbox-error" role="alert">
                    {props.error}
                </p>
            ) : null}
            <AnalysisPanel
                analysis={props.analysis}
                analyzing={props.analyzing}
                onAnalyze={props.onAnalyze}
                onRefreshPrices={props.onRefreshPrices}
            />
            <div className="sandbox-console__footnote">
                <span>SIMULATED AWS CONSOLE</span>
                <span>Independent educational sandbox · No AWS resources created</span>
            </div>
        </main>
    );
}

export default function Sandbox({ user, onSignIn }: { user: User | null; onSignIn: () => void }) {
    const [drafts, setDrafts] = useState<Draft[]>(readDrafts);
    const [active, setActive] = useState<Draft | null>(null);
    const [dirty, setDirty] = useState(false);
    const [accountScenarios, setAccountScenarios] = useState<ScenarioSummary[]>([]);
    const [loadingScenarios, setLoadingScenarios] = useState(false);
    const [selectedResourceId, setSelectedResourceId] = useState('');
    const [selectedService, setSelectedService] = useState<string>('s3');
    const [view, setView] = useState<View>('services');
    const [analysis, setAnalysis] = useState<ArchitectureAnalysis | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [templateText, setTemplateText] = useState('');
    const [templateEdited, setTemplateEdited] = useState(false);
    const [diagnostics, setDiagnostics] = useState<TemplateDiagnostic[]>([]);

    useEffect(() => {
        try {
            window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
        } catch {
            // Keep the draft available for this session if browser storage is unavailable.
        }
    }, [drafts]);

    useEffect(() => {
        if (!active) return;
        setDrafts((current) => [active, ...current.filter((draft) => draft.localId !== active.localId)]);
    }, [active]);

    useEffect(() => {
        if (!user) {
            setAccountScenarios([]);
            return;
        }
        let cancelled = false;
        setLoadingScenarios(true);
        user.getIdToken()
            .then(listScenarios)
            .then((items) => {
                if (!cancelled) setAccountScenarios(items.filter((item) => item.mode === 'freeform'));
            })
            .catch((cause: unknown) => {
                if (!cancelled)
                    setError(cause instanceof Error ? cause.message : 'Could not load saved architectures.');
            })
            .finally(() => {
                if (!cancelled) setLoadingScenarios(false);
            });
        return () => {
            cancelled = true;
        };
    }, [user]);

    const savedArchitectures = useMemo<SavedArchitecture[]>(
        () => [
            ...accountScenarios.map((scenario) => ({ ...scenario, source: 'account' as const })),
            ...drafts
                .filter((draft) => !user || !draft.scenarioId)
                .map((draft) => ({
                    id: draft.localId,
                    title: draft.title,
                    mode: 'freeform' as const,
                    region: draft.region,
                    currentRevision: 0,
                    updatedAt: draft.updatedAt,
                    source: 'browser' as const,
                })),
        ],
        [accountScenarios, drafts, user],
    );

    const resources = active?.configuration.resources ?? [];
    const relationships = useMemo(
        () => (active ? combineRelationships(active.configuration, active.relationships) : []),
        [active],
    );
    const selectedResource = resources.find((resource) => resource.id === selectedResourceId) ?? null;
    const generatedTemplate = useMemo(() => {
        if (!active) return '';
        try {
            return exportCloudFormation(active.configuration, active.cloudFormationSource, relationships);
        } catch {
            return active.cloudFormationSource ?? '';
        }
    }, [active, relationships]);
    const displayedTemplate = templateEdited ? templateText : generatedTemplate;

    function updateDraft(patch: Partial<Draft>) {
        if (!active) return;
        if (templateEdited) {
            setError('Apply or discard the CloudFormation source edits before changing console settings.');
            return;
        }
        setActive({ ...active, ...patch, updatedAt: new Date().toISOString() });
        setDirty(true);
        setAnalysis(null);
    }

    function openDraft(draft: Draft) {
        setActive(structuredClone(draft));
        setDirty(false);
        setSelectedResourceId(draft.configuration.resources[0]?.id ?? '');
        setSelectedService(
            draft.configuration.resources[0] ? resourceService(draft.configuration.resources[0]) : 's3',
        );
        setView('services');
        setAnalysis(null);
        setDiagnostics([]);
        setError('');
        setTemplateEdited(false);
    }

    function createArchitecture() {
        openDraft(createDraft());
        setDirty(true);
    }

    function applyImportedTemplate(source: string, fileName: string): void {
        try {
            const imported = importCloudFormation(source);
            const title =
                fileName
                    .replace(/\.(yaml|yml)$/i, '')
                    .replace(/[-_]+/g, ' ')
                    .trim() || 'Imported architecture';
            const draft = {
                ...createDraft(title),
                configuration: imported.configuration,
                relationships: imported.relationships,
                cloudFormationSource: source,
            };
            openDraft(draft);
            setDirty(true);
            setDiagnostics(imported.diagnostics);
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : 'This CloudFormation template could not be imported.',
            );
        }
    }

    async function importFile(file: File): Promise<void> {
        if (file.size > 1_048_576) {
            setError('CloudFormation templates must be 1 MB or smaller.');
            return;
        }
        try {
            applyImportedTemplate(await file.text(), file.name);
        } catch {
            setError('The selected template file could not be read.');
        }
    }

    function openLocal(localId: string) {
        const draft = drafts.find((item) => item.localId === localId);
        if (draft) openDraft(draft);
    }

    async function openAccount(scenarioId: string) {
        if (!user) return;
        try {
            const scenario = await getScenario(await user.getIdToken(), scenarioId);
            const snapshot = scenario.snapshot;
            const allRelationships = snapshot.relationships ?? [];
            openDraft({
                localId: createId(),
                scenarioId: scenario.id,
                currentRevision: scenario.currentRevision,
                title: scenario.title,
                region: scenario.region,
                configuration: snapshot.configuration,
                relationships: allRelationships.filter(
                    (relationship) => !derivedKinds.has(relationship.kind),
                ),
                workloadAssumptions: normalizedWorkload(scenario.workloadAssumptions),
                updatedAt: new Date().toISOString(),
                cloudFormationSource: snapshot.cloudFormationSource,
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not open this architecture.');
        }
    }

    function selectView(nextView: View) {
        if (templateEdited && nextView !== 'template') {
            setError('Apply or discard the CloudFormation source edits before changing console settings.');
            return;
        }
        if (nextView === 'template') {
            setTemplateText(generatedTemplate);
            setTemplateEdited(false);
        }
        setError('');
        setView(nextView);
    }

    function selectService(service: string) {
        if (templateEdited) {
            setError('Apply or discard the CloudFormation source edits before changing console settings.');
            return;
        }
        if (service === 'overview') {
            setView('architecture');
            setError('');
            return;
        }
        setSelectedService(service);
        setView('services');
        const existing = resources.find((resource) => resourceService(resource) === service);
        setSelectedResourceId(existing?.id ?? '');
        setError('');
    }

    function addResource(): void {
        if (!active || templateEdited) return;
        const resource = createResource(selectedService as SandboxService, active.configuration);
        updateDraft({ configuration: { resources: [...resources, resource] } });
        setSelectedResourceId(resource.id);
    }

    function changeResource(
        resourceId: string,
        field: string,
        value: string | number | boolean | JsonValue,
    ): void {
        const nextResources = resources.map((resource) => {
            if (resource.id !== resourceId) return resource;
            if (resource.type === 'awsResource' && field.startsWith('settings:')) {
                const key = field.slice('settings:'.length);
                return { ...resource, settings: { ...resource.settings, [key]: value } };
            }
            return { ...resource, [field]: value } as LabResource;
        });
        updateDraft({ configuration: { resources: nextResources } });
    }

    function removeResource(resourceId: string): void {
        if (!active) return;
        updateDraft({
            configuration: { resources: resources.filter((resource) => resource.id !== resourceId) },
            relationships: active.relationships.filter(
                (link) => link.sourceId !== resourceId && link.targetId !== resourceId,
            ),
        });
        if (selectedResourceId === resourceId) setSelectedResourceId('');
    }

    function addRelationship(targetId: string, kind: string): void {
        if (!active || !selectedResource || targetId === selectedResource.id) return;
        const relationship = { sourceId: selectedResource.id, targetId, kind };
        if (
            relationships.some(
                (link) =>
                    link.sourceId === relationship.sourceId &&
                    link.targetId === relationship.targetId &&
                    link.kind === kind,
            )
        )
            return;
        updateDraft({ relationships: [...active.relationships, relationship] });
    }

    function applyTemplateEdits(): void {
        if (!active) return;
        try {
            const imported = importCloudFormation(templateText);
            const updated = {
                ...active,
                configuration: imported.configuration,
                relationships: imported.relationships,
                cloudFormationSource: templateText,
                updatedAt: new Date().toISOString(),
            };
            setActive(updated);
            setSelectedResourceId(imported.configuration.resources[0]?.id ?? '');
            if (imported.configuration.resources[0])
                setSelectedService(resourceService(imported.configuration.resources[0]));
            setDiagnostics(imported.diagnostics);
            setDirty(true);
            setAnalysis(null);
            setTemplateEdited(false);
            setError('');
            setView('services');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The template could not be applied.');
        }
    }

    function discardTemplateEdits(): void {
        setTemplateText(generatedTemplate);
        setTemplateEdited(false);
        setError('');
    }

    async function saveArchitecture(): Promise<void> {
        if (!user) {
            onSignIn();
            return;
        }
        if (!active || templateEdited) return;
        setSaving(true);
        setError('');
        try {
            const token = await user.getIdToken();
            const input = toScenarioInput(active);
            const saved =
                active.scenarioId && active.currentRevision
                    ? await updateScenario(token, active.scenarioId, input, active.currentRevision)
                    : await createScenario(token, input);
            const updated = {
                ...active,
                scenarioId: saved.id,
                currentRevision: saved.currentRevision,
                updatedAt: new Date().toISOString(),
            };
            setActive(updated);
            setDrafts((current) => [
                updated,
                ...current.filter((draft) => draft.localId !== updated.localId),
            ]);
            setAccountScenarios(
                (await listScenarios(token)).filter((scenario) => scenario.mode === 'freeform'),
            );
            setDirty(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save this architecture.');
        } finally {
            setSaving(false);
        }
    }

    async function runAnalysis(refreshPrices = false): Promise<void> {
        if (!active || templateEdited) return;
        setAnalyzing(true);
        setError('');
        try {
            const token = user ? await user.getIdToken() : undefined;
            const input = toScenarioInput(active);
            const savedRevision =
                !dirty && active.scenarioId && active.currentRevision
                    ? { scenarioId: active.scenarioId, revision: active.currentRevision }
                    : {};
            const result = await analyzeArchitecture({ ...input, ...savedRevision, refreshPrices }, token);
            setAnalysis(result.analysis);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not analyze this architecture.');
        } finally {
            setAnalyzing(false);
        }
    }

    function deleteDraft(localId: string): void {
        setDrafts((current) => current.filter((draft) => draft.localId !== localId));
    }

    if (!active)
        return (
            <SandboxHomeScreen
                user={user}
                error={error}
                loading={loadingScenarios}
                architectures={savedArchitectures}
                drafts={drafts}
                onCreate={createArchitecture}
                onImport={importFile}
                onSignIn={onSignIn}
                onOpenAccount={openAccount}
                onOpenBrowser={openLocal}
                onDelete={deleteDraft}
            />
        );

    return (
        <SandboxConsole
            active={active}
            dirty={dirty}
            saving={saving}
            user={user}
            templateEdited={templateEdited}
            view={view}
            resources={resources}
            relationships={relationships}
            selectedResource={selectedResource}
            selectedResourceId={selectedResourceId}
            selectedService={selectedService}
            displayedTemplate={displayedTemplate}
            diagnostics={diagnostics}
            error={error}
            analysis={analysis}
            analyzing={analyzing}
            onBack={() => {
                setActive(null);
                setAnalysis(null);
                setError('');
            }}
            onTitleChange={(title) => updateDraft({ title })}
            onRegionChange={(region) => updateDraft({ region })}
            onSave={() => void saveArchitecture()}
            onSelectView={selectView}
            onSelectService={selectService}
            onAddResource={addResource}
            onSelectResource={setSelectedResourceId}
            onSelectArchitectureResource={(resource) => {
                setSelectedService(resourceService(resource));
                setSelectedResourceId(resource.id);
                setView('services');
            }}
            onChangeResource={changeResource}
            onRemoveResource={removeResource}
            onConnect={addRelationship}
            onTemplateSourceChange={(source) => {
                setTemplateText(source);
                setTemplateEdited(true);
                setError('');
            }}
            onImportFile={(file) => void importFile(file)}
            onApplyTemplate={applyTemplateEdits}
            onExportTemplate={() =>
                downloadTemplate(templateEdited ? generatedTemplate : displayedTemplate, active.title)
            }
            onDiscardTemplate={discardTemplateEdits}
            onWorkloadChange={(workloadAssumptions) => updateDraft({ workloadAssumptions })}
            onAnalyze={() => void runAnalysis()}
            onRefreshPrices={() => void runAnalysis(true)}
        />
    );
}
